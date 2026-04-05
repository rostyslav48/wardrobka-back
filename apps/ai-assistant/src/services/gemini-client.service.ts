import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerateContentResult,
  GenerativeModel,
  GoogleGenerativeAI,
} from '@google/generative-ai';

import { WardrobeItemDto } from '@app/wardrobe/dto';

interface ChatContext {
  prompt: string;
  wardrobeItems: WardrobeItemDto[];
  referenceImageUrls: string[];
}

interface OutfitContext {
  occasion: string;
  styleHint?: string;
  season?: string;
  wardrobeItems: WardrobeItemDto[];
}

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly model: GenerativeModel;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    const modelId = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-2.5-flash',
    );
    const client = new GoogleGenerativeAI(apiKey);
    this.model = client.getGenerativeModel({ model: modelId });
  }

  async generateChatResponse(context: ChatContext): Promise<string> {
    const prompt = this.composeChatPrompt(context);
    const result = await this.model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    return this.extractText(result);
  }

  async generateOutfitSummary(context: OutfitContext): Promise<string> {
    const instruction = this.composeOutfitPrompt(context);
    const result = await this.model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: instruction }],
        },
      ],
    });

    return this.extractText(result);
  }

  private composeChatPrompt({
    prompt,
    wardrobeItems,
    referenceImageUrls,
  }: ChatContext) {
    const wardrobeContext = this.serializeWardrobeItems(wardrobeItems);
    const imageContext = referenceImageUrls.length
      ? `Reference images:\n${referenceImageUrls.map((url) => `- ${url}`).join('\n')}`
      : '';

    return [
      'You are an AI wardrobe assistant helping users make outfit decisions.',
      wardrobeContext,
      imageContext,
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
  }: OutfitContext) {
    const wardrobeContext = this.serializeWardrobeItems(wardrobeItems);

    return [
      'Generate an outfit suggestion summary using the provided wardrobe items.',
      `Occasion: ${occasion}`,
      season ? `Season: ${season}` : null,
      styleHint ? `Style hint: ${styleHint}` : null,
      wardrobeContext,
      'Respond with a concise paragraph and highlight which pieces to combine.',
    ]
      .filter(Boolean)
      .join('\n');
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

  private extractText(result: GenerateContentResult) {
    const text = result.response?.text?.() ?? '';

    if (!text) {
      this.logger.warn('Empty response received from Gemini');
    }

    return text || 'I need more details to help with that request.';
  }
}
