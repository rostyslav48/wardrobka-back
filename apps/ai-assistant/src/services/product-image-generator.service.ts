import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Modality } from '@google/genai';

import { ImageStatus } from '@app/wardrobe/enums';
import { MediaStorageService } from '@app/wardrobe/media-storage/media-storage.service';

export interface GenerateProductImageInput {
  itemId: number;
  accountId: number;
  /** S3 key of the original under the `tmp/` prefix — never the bytes. */
  tempImageKey: string;
  originalName?: string;
}

export type ProductImageGenerationResult =
  | { status: ImageStatus.Ready; imgPath: string }
  | { status: ImageStatus.Failed; reason: string };

// Phase 0 decision (2026-08-30): gemini-3.1-flash-image, ~$0.067 per 1K image.
// gemini-3-pro-image is the documented escalation, hence a config value.
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_TIMEOUT_MS = 60000;

// Phase 0 decision: straighten-plus-cutout, NOT canonical re-angling. The model
// must not synthesise views the photo does not contain — an invented collar or
// placket silently stops the image being the user's own garment, and nothing
// downstream catches it.
//
// The two halves have to be phrased so they cannot read as contradictory. An
// earlier wording paired "straighten and square up" with "do NOT rotate the
// garment to a different angle"; run live, the model obeyed the negative and
// returned the garment still tilted at its photographed angle. "Rotate" is
// split out here: in-plane rotation is asked for explicitly, and what is
// forbidden is naming a camera/viewpoint change rather than rotation as such.
const GENERATION_PROMPT = [
  'Turn this photo of a single clothing item into a clean e-commerce product image.',
  'Remove the background entirely and replace it with a plain, uniform white background.',
  'Straighten the garment: rotate it within the picture plane until it is perfectly upright and square — neckline or waistband level across the top, hem level across the bottom, no tilt — then centre it, present it flat-lay style, and relight it evenly with soft, neutral studio lighting.',
  'Keep the same face of the garment towards the camera as in the photo. Do NOT move the camera to a different angle, do NOT turn the garment around to reveal a side the photo does not show, and do NOT invent, redraw or complete any part of it. Keep the exact same view, cut, proportions, colour, texture, print, logos and hardware.',
  'Remove any hanger, mannequin, person, hands or props. Output only the garment on white.',
].join('\n');

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const FALLBACK_ORIGINAL_MIME_TYPE = 'image/jpeg';

/**
 * Runs the image-editing model for one wardrobe item and stores the result.
 *
 * Never throws: the caller is an RMQ event consumer, and a thrown error there
 * either leaves a poison message or silently loses the job. Every failure path
 * comes back as `{ status: failed, reason }` instead.
 */
@Injectable()
export class ProductImageGeneratorService {
  private readonly logger = new Logger(ProductImageGeneratorService.name);
  private readonly client: GoogleGenAI;
  private readonly modelId: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly mediaStorageService: MediaStorageService,
  ) {
    this.client = new GoogleGenAI({
      apiKey: this.configService.getOrThrow<string>('GEMINI_API_KEY'),
    });
    this.modelId = this.configService.get<string>(
      'GEMINI_IMAGE_MODEL',
      DEFAULT_IMAGE_MODEL,
    );
    this.timeoutMs = Number(
      this.configService.get<number>(
        'GEMINI_IMAGE_TIMEOUT_MS',
        DEFAULT_TIMEOUT_MS,
      ),
    );
  }

  async generate(
    input: GenerateProductImageInput,
  ): Promise<ProductImageGenerationResult> {
    const startedAt = Date.now();

    try {
      const original = await this.loadOriginal(input);
      const generated = await this.runModel(original);
      const imgPath = await this.storeGenerated(input.accountId, generated);

      this.logger.log(
        `Generated product image for item ${input.itemId} in ` +
          `${Date.now() - startedAt}ms -> ${imgPath}`,
      );

      return { status: ImageStatus.Ready, imgPath };
    } catch (error) {
      const reason = (error as Error)?.message ?? 'Unknown error';
      this.logger.error(
        `Product image generation failed for item ${input.itemId} after ` +
          `${Date.now() - startedAt}ms: ${reason}`,
      );

      return { status: ImageStatus.Failed, reason };
    }
  }

  /**
   * The job message carries an S3 key, so the bytes are pulled straight from
   * the bucket over a short-lived signed URL rather than shipped over RMQ.
   */
  private async loadOriginal(
    input: GenerateProductImageInput,
  ): Promise<{ base64: string; mimeType: string }> {
    const urls = await this.mediaStorageService.getUrls([
      { id: input.itemId, path: input.tempImageKey },
    ]);
    const url = urls?.[input.itemId];

    if (!url) {
      throw new Error(
        `No signed URL for the temp original ${input.tempImageKey}`,
      );
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        `Could not download the temp original (HTTP ${response.status})`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error(`The temp original ${input.tempImageKey} is empty`);
    }

    return {
      base64: buffer.toString('base64'),
      mimeType: this.resolveOriginalMimeType(
        response.headers.get('content-type'),
        input.tempImageKey,
      ),
    };
  }

  /**
   * `S3DiskUtil.upload` does not set ContentType, so S3 serves every original
   * as `application/octet-stream` — which Gemini rejects outright with
   * "Unsupported MIME type". Trust the header only when it is actually an
   * image type, otherwise derive it from the key's extension.
   */
  private resolveOriginalMimeType(
    contentType: string | null,
    key: string,
  ): string {
    if (contentType?.startsWith('image/')) {
      return contentType.split(';')[0].trim();
    }

    const extension = key.split('.').pop()?.toLowerCase() ?? '';
    return MIME_TYPE_BY_EXTENSION[extension] ?? FALLBACK_ORIGINAL_MIME_TYPE;
  }

  private async runModel(original: {
    base64: string;
    mimeType: string;
  }): Promise<{ base64: string; mimeType: string }> {
    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents: [
        {
          role: 'user',
          parts: [
            { text: GENERATION_PROMPT },
            {
              inlineData: {
                mimeType: original.mimeType,
                data: original.base64,
              },
            },
          ],
        },
      ],
      config: {
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        responseModalities: [Modality.IMAGE],
      },
    });

    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part?.inlineData?.data);

    if (!imagePart) {
      throw new Error('The image model returned no image part');
    }

    return {
      base64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    };
  }

  private storeGenerated(
    accountId: number,
    generated: { base64: string; mimeType: string },
  ): Promise<string> {
    const extension = EXTENSION_BY_MIME_TYPE[generated.mimeType] ?? '.png';

    return this.mediaStorageService.store(
      {
        originalname: `product-image${extension}`,
        fileBase64: generated.base64,
      },
      `${this.configService.getOrThrow('USER_IMAGES_FOLDER_PATH')}/${accountId}`,
    );
  }
}
