import { Injectable, Logger, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';

import { FitType, ItemType, Season, Size } from '@app/wardrobe/enums';
import { SWATCHES } from '@app/wardrobe/constants';

/** Everything is optional: a field is present only when the model could
 * confidently detect it, and every present value is already validated
 * against its enum / palette — never passed through unchecked. */
export interface AnalyzedImageAttributes {
  type?: ItemType;
  color?: string;
  season?: Season;
  size?: Size;
  fit_type?: FitType;
  name?: string;
  brand?: string;
  material?: string;
  style?: string;
  description?: string;
}

interface RawAnalysis {
  type?: unknown;
  color?: unknown;
  season?: unknown;
  size?: unknown;
  fit_type?: unknown;
  name?: unknown;
  brand?: unknown;
  material?: unknown;
  style?: unknown;
  description?: unknown;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 15000;

const ANALYSIS_PROMPT = [
  'You are analyzing a single photo of one clothing item for a wardrobe app.',
  'Identify the item and return a JSON object matching the given schema.',
  '"type", "color", "season", "size" and "fit_type" are required — pick the closest valid value from the schema even if you are not fully certain.',
  '"name", "brand", "material", "style" and "description" are optional — omit any of them entirely rather than guessing when the photo does not clearly show it. Never invent a brand or a name.',
  'The "color" value must be the single closest swatch label from the enum, even if the garment has multiple colors — pick the dominant one.',
].join('\n');

@Injectable()
export class ImageAnalyzerService {
  private readonly logger = new Logger(ImageAnalyzerService.name);
  private readonly client: GoogleGenAI;
  private readonly modelId: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.modelId = this.configService.get<string>(
      'GEMINI_MODEL',
      DEFAULT_MODEL,
    );
    this.timeoutMs = Number(
      this.configService.get<number>(
        'GEMINI_ANALYZE_TIMEOUT_MS',
        DEFAULT_TIMEOUT_MS,
      ),
    );
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyze(
    fileBase64: string,
    mimeType: string,
  ): Promise<AnalyzedImageAttributes> {
    const startedAt = Date.now();

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: ANALYSIS_PROMPT },
              { inlineData: { mimeType, data: fileBase64 } },
            ],
          },
        ],
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          responseMimeType: 'application/json',
          responseSchema: this.buildResponseSchema(),
        },
      });
    } catch (error) {
      if (this.isTimeout(error)) {
        this.logger.warn(
          `Image analysis deadline (${this.timeoutMs}ms) exceeded`,
        );
        throw new RequestTimeoutException('Image analysis timed out');
      }
      throw error;
    }

    this.logger.log(
      `analyze — promptTokens=${response.usageMetadata?.promptTokenCount ?? 'n/a'} ` +
        `responseTokens=${response.usageMetadata?.candidatesTokenCount ?? 'n/a'} ` +
        `latencyMs=${Date.now() - startedAt}`,
    );

    return this.toAttributes(this.parseResponse(response.text));
  }

  private buildResponseSchema() {
    return {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: Object.values(ItemType) },
        color: {
          type: Type.STRING,
          enum: SWATCHES.map((swatch) => swatch.label),
        },
        season: { type: Type.STRING, enum: Object.values(Season) },
        size: { type: Type.STRING, enum: Object.values(Size) },
        fit_type: { type: Type.STRING, enum: Object.values(FitType) },
        name: { type: Type.STRING },
        brand: { type: Type.STRING },
        material: { type: Type.STRING },
        style: { type: Type.STRING },
        description: { type: Type.STRING },
      },
      required: ['type', 'color', 'season', 'size', 'fit_type'],
    };
  }

  private isTimeout(error: unknown): boolean {
    const name = (error as { name?: string })?.name;
    return name === 'TimeoutError' || name === 'AbortError';
  }

  private parseResponse(text: string | undefined): RawAnalysis {
    if (!text) {
      this.logger.warn('Empty response from Gemini image analysis');
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as RawAnalysis)
        : {};
    } catch (error) {
      this.logger.warn(
        `Failed to parse Gemini image analysis response as JSON: ${(error as Error).message}`,
      );
      return {};
    }
  }

  private toAttributes(raw: RawAnalysis): AnalyzedImageAttributes {
    const attributes: AnalyzedImageAttributes = {};

    const type = this.toEnumValue(raw.type, Object.values(ItemType));
    if (type) attributes.type = type as ItemType;

    const season = this.toEnumValue(raw.season, Object.values(Season));
    if (season) attributes.season = season as Season;

    const size = this.toEnumValue(raw.size, Object.values(Size));
    if (size) attributes.size = size as Size;

    const fitType = this.toEnumValue(raw.fit_type, Object.values(FitType));
    if (fitType) attributes.fit_type = fitType as FitType;

    const colorHex = this.toColorHex(raw.color);
    if (colorHex) attributes.color = colorHex;

    const name = this.toOptionalString(raw.name);
    if (name) attributes.name = name;

    const brand = this.toOptionalString(raw.brand);
    if (brand) attributes.brand = brand;

    const material = this.toOptionalString(raw.material);
    if (material) attributes.material = material;

    const style = this.toOptionalString(raw.style);
    if (style) attributes.style = style;

    const description = this.toOptionalString(raw.description);
    if (description) attributes.description = description;

    return attributes;
  }

  private toEnumValue(value: unknown, allowed: string[]): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (!allowed.includes(value)) {
      this.logger.warn(
        `Gemini returned a value outside the allowed set: ${value}`,
      );
      return undefined;
    }
    return value;
  }

  private toColorHex(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const swatch = SWATCHES.find(
      (candidate) => candidate.label.toLowerCase() === value.toLowerCase(),
    );
    if (!swatch) {
      this.logger.warn(
        `Gemini returned a colour label outside the palette: ${value}`,
      );
      return undefined;
    }
    return swatch.hex;
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
