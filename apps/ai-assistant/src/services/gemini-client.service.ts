import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  FunctionCall,
  FunctionCallingConfigMode,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai';

import { WardrobeItemDto, WardrobeItemPreviewDto } from '@app/wardrobe/dto';
import { RecentlyWornEntry } from './context-builder.service';
import { TOOL_DECLARATIONS, TOOL_NAMES } from './wardrobe-tools';

import { WeatherContext } from '../types/weather-context.type';

export interface ReferenceImagePart {
  mimeType: string;
  data: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** The validated payload of a successful `propose_outfit` call. */
export interface OutfitProposal {
  summary: string;
  itemIds: number[];
  rationale: string;
}

export interface ChatCompletionResult {
  text: string;
  /** Set only when the exchange ended via a successful propose_outfit call. */
  outfitProposal?: OutfitProposal;
}

interface ChatContext {
  prompt: string;
  history: ChatHistoryMessage[];
  referenceImages: ReferenceImagePart[];
  /** Compact wardrobe orientation block; see ContextBuilderService.buildSeedSummary. */
  seedSummary: string;
  /** Item ids the user attached to this message, if any. */
  contextItemIds?: number[];
  executeTool: ToolExecutor;
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

const DEFAULT_MAX_TOOL_ROUNDS = 4;
const DEFAULT_MAX_TOOL_CALLS = 8;

const SYSTEM_INSTRUCTION = [
  'You are an AI wardrobe assistant helping users make outfit decisions.',
  'When recommending items to wear, only recommend items present in the wardrobe context you are given — do not invent wardrobe items the user does not own.',
  'You may still discuss and refer back to anything the user has told you earlier in the conversation, even if it is not in the wardrobe context.',
  'Use the weather forecast, season and recently-worn history when they are relevant to the request.',
  'You have tools for reading the wardrobe, the weather and the recently-worn log. Call them only when the answer actually depends on that data — general clothing-care and styling questions need no tool call at all.',
  'Prefer one well-filtered search_wardrobe call over several broad ones. If a result comes back with truncated set to true, narrow the filters rather than reasoning over the partial list.',
  'Keep responses concise and practical.',
].join('\n');

const BUDGET_EXHAUSTED_NOTE =
  'The tool budget for this message is spent. Answer the user now using only what you have already gathered, and say plainly if something could not be checked.';

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenAI;
  private readonly modelId: string;
  private readonly maxToolRounds: number;
  private readonly maxToolCalls: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.modelId = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-2.5-flash',
    );
    this.maxToolRounds = Number(
      this.configService.get<number>(
        'AI_MAX_TOOL_ROUNDS',
        DEFAULT_MAX_TOOL_ROUNDS,
      ),
    );
    this.maxToolCalls = Number(
      this.configService.get<number>(
        'AI_MAX_TOOL_CALLS',
        DEFAULT_MAX_TOOL_CALLS,
      ),
    );
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Guarded retrieval loop: send, execute whatever function calls come back,
   * append the responses, resend — until the model answers in text or a
   * guardrail trips. Both guardrails degrade into one final tools-disabled
   * call, so the user never sees a hard failure from a spent budget.
   */
  async generateChatResponse(
    context: ChatContext,
  ): Promise<ChatCompletionResult> {
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

    const cache = new Map<string, Record<string, unknown>>();
    let callsUsed = 0;

    for (let round = 1; round <= this.maxToolRounds; round++) {
      const response = await this.send(contents, `round ${round}`, true);
      const calls = response.functionCalls ?? [];

      if (!calls.length) {
        this.logger.log(
          `generateChatResponse completed — rounds=${round} toolCalls=${callsUsed}`,
        );
        return { text: this.extractText(response) };
      }

      contents.push({
        role: 'model',
        parts: calls.map((call) => ({ functionCall: call })),
      });

      const responseParts: Part[] = [];
      let budgetExhausted = false;
      let outfitProposal: OutfitProposal | undefined;

      for (const call of calls) {
        // propose_outfit is terminal: once one succeeds, every further call in
        // this same round is ignored — it never reaches the executor, never
        // charges the budget, and gets no functionResponse, because the
        // exchange is ending regardless.
        if (outfitProposal) {
          continue;
        }

        const name = call.name ?? '';
        const args = (call.args ?? {}) as Record<string, unknown>;

        if (callsUsed >= this.maxToolCalls) {
          budgetExhausted = true;
          this.logger.warn(
            `Tool call budget (${this.maxToolCalls}) exhausted, refusing ${name}`,
          );
          responseParts.push(
            this.toFunctionResponse(call, { error: BUDGET_EXHAUSTED_NOTE }),
          );
          continue;
        }

        // Charged before the cache is consulted: a duplicate call costs budget
        // even though it costs no round trip, so a model looping on the same
        // arguments still terminates.
        callsUsed++;

        const key = this.cacheKey(name, args);
        const cached = cache.get(key);

        this.logger.log(
          `tool call ${callsUsed}/${this.maxToolCalls} — ${name}(${JSON.stringify(args)})` +
            (cached ? ' [cache hit]' : ''),
        );

        const result = cached ?? (await context.executeTool(name, args));

        if (!cached) {
          cache.set(key, result);
        }

        responseParts.push(this.toFunctionResponse(call, result));

        if (name === TOOL_NAMES.proposeOutfit && !result.error) {
          outfitProposal = {
            summary: String(result.summary ?? ''),
            itemIds: Array.isArray(result.itemIds)
              ? (result.itemIds as number[])
              : [],
            rationale: String(result.rationale ?? ''),
          };
        }
      }

      contents.push({ role: 'user', parts: responseParts });

      if (outfitProposal) {
        this.logger.log(
          `generateChatResponse completed via propose_outfit — rounds=${round} toolCalls=${callsUsed}`,
        );
        return { text: outfitProposal.summary, outfitProposal };
      }

      if (budgetExhausted) {
        return this.finalAnswerWithoutTools(contents, callsUsed, round);
      }
    }

    this.logger.warn(
      `Tool round budget (${this.maxToolRounds}) exhausted, answering without tools`,
    );

    return this.finalAnswerWithoutTools(
      contents,
      callsUsed,
      this.maxToolRounds,
    );
  }

  private async finalAnswerWithoutTools(
    contents: Content[],
    callsUsed: number,
    rounds: number,
  ): Promise<ChatCompletionResult> {
    contents.push({ role: 'user', parts: [{ text: BUDGET_EXHAUSTED_NOTE }] });

    const response = await this.send(contents, 'final (tools disabled)', false);

    this.logger.log(
      `generateChatResponse completed after budget exhaustion — rounds=${rounds} toolCalls=${callsUsed}`,
    );

    return { text: this.extractText(response) };
  }

  private async send(
    contents: Content[],
    label: string,
    toolsEnabled: boolean,
  ): Promise<GenerateContentResponse> {
    const startedAt = Date.now();
    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: {
            mode: toolsEnabled
              ? FunctionCallingConfigMode.AUTO
              : FunctionCallingConfigMode.NONE,
          },
        },
      },
    });
    this.logUsage(
      `generateChatResponse ${label}`,
      response,
      Date.now() - startedAt,
    );

    return response;
  }

  private toFunctionResponse(
    call: FunctionCall,
    response: Record<string, unknown>,
  ): Part {
    return {
      functionResponse: {
        ...(call.id ? { id: call.id } : {}),
        name: call.name,
        response,
      },
    };
  }

  /** Stable across key order so `{a,b}` and `{b,a}` are one cache entry. */
  private cacheKey(name: string, args: Record<string, unknown>): string {
    const ordered = Object.keys(args)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = args[key];
        return acc;
      }, {});

    return `${name}:${JSON.stringify(ordered)}`;
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
    seedSummary,
    contextItemIds,
  }: ChatContext) {
    return [
      seedSummary,
      contextItemIds?.length
        ? `The user attached these wardrobe item ids to this message: ${contextItemIds.join(', ')}. Use get_item_details if you need them.`
        : null,
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
