import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Content, GenerateContentResponse, GoogleGenAI } from '@google/genai';

import { WardrobeItemDto, WardrobeItemPreviewDto } from '@app/wardrobe/dto';
import { RecentlyWornEntry } from './context-builder.service';

import { WeatherContext } from '../types/weather-context.type';

export interface ReferenceImagePart {
  mimeType: string;
  data: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

interface ChatContext {
  prompt: string;
  history: ChatHistoryMessage[];
  wardrobeItems: WardrobeItemDto[];
  referenceImages: ReferenceImagePart[];
  activeWardrobeItems?: WardrobeItemPreviewDto[];
  weather?: WeatherContext | null;
  recentlyWorn?: RecentlyWornEntry[];
}

interface OutfitContext {
  occasion: string;
  styleHint?: string;
  season?: string;
  wardrobeItems: WardrobeItemDto[];
  activeWardrobeItems?: WardrobeItemPreviewDto[];
  weather?: WeatherContext | null;
  recentlyWorn?: RecentlyWornEntry[];
}

const SYSTEM_INSTRUCTION = [
  'You are an AI wardrobe assistant helping users make outfit decisions.',
  'When recommending items to wear, only recommend items present in the wardrobe context you are given — do not invent wardrobe items the user does not own.',
  'You may still discuss and refer back to anything the user has told you earlier in the conversation, even if it is not in the wardrobe context.',
  'Use the weather forecast, season and recently-worn history when they are relevant to the request.',
  'Keep responses concise and practical.',
].join('\n');

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenAI;
  private readonly modelId: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.modelId = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-2.5-flash',
    );
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateChatResponse(context: ChatContext): Promise<string> {
    const contents: Content[] = [
      ...context.history.map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      })),
      {
        role: 'user',
        parts: [
          { text: this.composeChatUserTurn(context) },
          ...context.referenceImages.map((image) => ({
            inlineData: { mimeType: image.mimeType, data: image.data },
          })),
        ],
      },
    ];

    const startedAt = Date.now();
    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    this.logUsage('generateChatResponse', response, Date.now() - startedAt);

    return this.extractText(response);
  }

  async generateOutfitSummary(context: OutfitContext): Promise<string> {
    const startedAt = Date.now();
    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents: [
        {
          role: 'user',
          parts: [{ text: this.composeOutfitPrompt(context) }],
        },
      ],
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    this.logUsage('generateOutfitSummary', response, Date.now() - startedAt);

    return this.extractText(response);
  }

  private composeChatUserTurn({
    prompt,
    wardrobeItems,
    activeWardrobeItems,
    weather,
    recentlyWorn,
  }: ChatContext) {
    const wardrobeContext = this.serializeWardrobeItems(wardrobeItems);

    return [
      this.serializeWeather(weather),
      this.serializeActiveItems(activeWardrobeItems),
      this.serializeRecentlyWorn(recentlyWorn),
      wardrobeContext,
      'User request:',
      prompt,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private composeOutfitPrompt({
    occasion,
    styleHint,
    season,
    wardrobeItems,
    activeWardrobeItems,
    weather,
    recentlyWorn,
  }: OutfitContext) {
    const wardrobeContext = this.serializeWardrobeItems(wardrobeItems);

    return [
      'Generate an outfit suggestion summary using the provided wardrobe items.',
      `Occasion: ${occasion}`,
      season ? `Season: ${season}` : null,
      styleHint ? `Style hint: ${styleHint}` : null,
      this.serializeWeather(weather),
      this.serializeActiveItems(activeWardrobeItems),
      this.serializeRecentlyWorn(recentlyWorn),
      wardrobeContext,
      'Respond with a concise paragraph and highlight which pieces to combine.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private serializeWeather(weather?: WeatherContext | null): string {
    if (!weather) {
      return '';
    }

    const lines = [
      `Weather forecast for ${weather.city} — tomorrow:`,
      `- ${weather.temperatureCelsius}°C, ${weather.condition}`,
      `- Humidity: ${weather.humidity}%`,
      `- Wind: ${weather.windSpeed} m/s`,
    ];

    if (weather.dailyForecast?.length) {
      lines.push('Upcoming daily forecast:');
      for (const day of weather.dailyForecast) {
        lines.push(
          `  • ${day.date}: ${day.temperatureCelsius}°C, ${day.condition}`,
        );
      }
    }

    return lines.join('\n');
  }

  private serializeActiveItems(items?: WardrobeItemPreviewDto[]): string {
    if (items === undefined) {
      return '';
    }

    if (!items.length) {
      return 'No items currently available (all in washing, missing, or repair).';
    }

    return [
      'Currently available wardrobe items (active, in season):',
      ...items.map(
        (item) =>
          `- ${item.name || item.type} (${item.color || 'color N/A'}, ${item.season || 'season N/A'})`,
      ),
    ].join('\n');
  }

  private serializeWardrobeItems(items: WardrobeItemDto[]) {
    if (!items.length) {
      return 'No wardrobe items supplied.';
    }

    return [
      'Wardrobe items:',
      ...items.map(
        (item) =>
          `- ${item.name || item.type} (${item.color || 'color N/A'}, ${item.season || 'season N/A'})`,
      ),
    ].join('\n');
  }

  private serializeRecentlyWorn(entries?: RecentlyWornEntry[]): string {
    if (!entries?.length) {
      return '';
    }

    return [
      'Recently worn:',
      ...entries.map(
        (entry) => `- ${entry.date}: ${entry.itemNames.join(', ')}`,
      ),
    ].join('\n');
  }

  private logUsage(
    operation: string,
    response: GenerateContentResponse,
    latencyMs: number,
  ) {
    const usage = response.usageMetadata;
    this.logger.log(
      `${operation} — promptTokens=${usage?.promptTokenCount ?? 'n/a'} ` +
        `responseTokens=${usage?.candidatesTokenCount ?? 'n/a'} ` +
        `latencyMs=${latencyMs}`,
    );
  }

  private extractText(response: GenerateContentResponse) {
    const text = response.text ?? '';

    if (!text) {
      this.logger.warn('Empty response received from Gemini');
    }

    return text || 'I need more details to help with that request.';
  }
}
