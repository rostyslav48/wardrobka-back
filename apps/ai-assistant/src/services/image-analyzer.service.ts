import { Injectable, Logger, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';

import { FitType, ItemType, Season, Size } from '@app/wardrobe/enums';
import { SWATCHES } from '@app/wardrobe/constants';

/** `is_clothing` is always present: a response the model returns unparseably
 * (missing/non-boolean field, malformed JSON, empty text, …) defaults it to
 * `false` rather than dropping the key, so a consumer that checks
 * `is_clothing === false` to withhold auto-fill fails safe instead of
 * silently treating "we don't know" as "yes, it's clothing" — the exact
 * QA-43 failure mode. Every other field stays optional: present only when
 * the model could confidently detect it, and every present value is already
 * validated against its enum / palette — never passed through unchecked. */
export interface AnalyzedImageAttributes {
  is_clothing: boolean;
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
  is_clothing?: unknown;
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

// QA-43: a photo of a leaf used to get auto-filled as a Hoodie because every
// attribute field was mandatory, forcing a guess even for a subject that is
// not clothing at all. "is_clothing" lets the model say so up front; the
// other fields stay mandatory only for the model's own consistency (the
// response schema requires them either way) — the caller is expected to
// disregard them once is_clothing is false rather than the model being
// allowed to omit them and break the schema.
//
// Spike (2026-10-03, 25 real photos): the earlier "omit rather than guess"
// wording applied to name and description too, so only 2 of 25 items came
// back named and 11 described. Name and description are now written from
// what is visible; the no-guessing rule stays on brand and size, the two
// fields a photo can only show via a legible label. Size is no longer
// required by the schema — it was forced to "m" on almost every item.
const ANALYSIS_PROMPT = [
  'You are a fashion copywriter cataloguing a single item for a personal wardrobe app.',
  'First decide whether the photo shows a wearable clothing item, shoes, bag or accessory as its main subject. It may be on a hanger, held in a hand, or hanging among other garments — catalogue the most prominent, most fully visible one. Set "is_clothing" to false for anything that is not wearable — objects, plants, animals, food, scenery, screenshots, etc. — even if it vaguely resembles a garment.',
  'Return a JSON object matching the given schema.',
  '"is_clothing", "type", "color", "season", "fit_type", "name" and "description" are required by the schema. When "is_clothing" is true, pick the closest valid value for the others from the schema even if you are not fully certain. When "is_clothing" is false, the other required fields are ignored by the caller — fill them with any valid placeholder rather than leaving the response inconsistent, and omit "brand", "material", "style" and "size".',
  '"name": when "is_clothing" is true, always provide a short, specific product-style title of 2–5 words built from what you can see (colour + material or texture + defining detail + item), e.g. "Sage Linen Camp-Collar Shirt". Include a brand only when it is clearly legible.',
  '"description": when "is_clothing" is true, always provide 2–3 natural sentences describing what is visible — cut and silhouette, neckline or collar, sleeves, closures, pockets, graphics or logos, fabric look and texture — then one short note on how it can be worn. Describe only what the photo shows; do not describe parts of the item that are hidden.',
  '"material": the most likely fabric judging by its visible texture (e.g. "cotton jersey", "linen blend", "suede", "fleece-backed cotton"); omit it when the texture is truly unclear.',
  '"style": one or two words such as casual, smart casual, streetwear, sporty, minimalist.',
  '"brand": only when a logo or label is clearly legible in the photo. Never guess a brand.',
  '"size": only when a size label or tag is legible in the photo. For clothing, use the letter size when it reads S, M, L, XL or XXL (or an equivalent such as "Medium"). For footwear, use the EU size printed on the tongue or insole label (e.g. "42"); a half size such as 42.5 rounds down, and a label showing only US or UK sizes means omit. Omit it in every other case — including waist sizes such as W32 — and never estimate a size from how the item looks.',
  `The "color" value must be the single closest swatch label from the enum, even if the item has multiple colours — pick the dominant one. The swatches are reference colours, not loose names: ${SWATCHES.map((swatch) => `${swatch.label} ${swatch.hex}`).join(', ')}. Pick the swatch nearest to the item's actual colour. Judge the colour as it would look in neutral daylight, discounting a warm or cool cast from the room lighting. Use "Gray" for neutral greys and for greys with only a faint cool or warm tint; use a hue swatch only when that hue is clearly recognisable in the fabric itself — olive and khaki green are "Green", but a grey that merely looks greenish or bluish under the room light is "Gray". Use the same colour in "name" and "description" as in "color".`,
  'Footwear types: "sneakers" are trainers and casual shoes with a rubber sole, including leather court sneakers; "shoes" are dress or smart shoes such as oxfords, derbies, loafers and boat shoes; "boots" reach the ankle or higher; "sandals" are open.',
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
          // Classification, not creative writing: at the default temperature
          // borderline items flipped between runs (a blue-grey tee came back
          // Gray, Gray, Blue). Zero makes the same photo give the same answer.
          temperature: 0,
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
        is_clothing: { type: Type.BOOLEAN },
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
      // name and description are required because the model dropped them on
      // 3 of 25 real photos even when told to always write them. Placeholder
      // text for a non-clothing photo is discarded in toAttributes.
      required: [
        'is_clothing',
        'type',
        'color',
        'season',
        'fit_type',
        'name',
        'description',
      ],
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
    const attributes: AnalyzedImageAttributes = {
      is_clothing: this.toBoolean(raw.is_clothing) ?? false,
    };

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

    // The schema forces placeholder text for a non-clothing photo; none of it
    // describes a real item, so no free-text field is passed on (QA-43).
    if (!attributes.is_clothing) return attributes;

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

  private toBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
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
