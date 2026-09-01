import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom, timeout } from 'rxjs';

import {
  OutfitLogDto,
  WardrobeItemDto,
  WardrobeItemPreviewDto,
} from '@app/wardrobe/dto';
import {
  OUTFIT_LOG_REQUESTS,
  WARDROBE_REQUESTS,
} from '@app/wardrobe/constants';
import { MEDIA_STORAGE_REQUESTS } from '@app/media-storage/constants/requests';
import { ItemPath } from '@app/media-storage/models';
import {
  MEDIA_STORAGE_SERVICE,
  WARDROBE_SERVICE,
} from '@app/wardrobe-api-gateway/constants';
import { UserAccountPreview } from '@app/auth/users/types';
import { UserAccountEntity } from '@app/common/database/entities/auth';

import { WeatherService } from './weather.service';
import { getCurrentSeason } from './current-season.util';
import { WeatherContext } from '../types/weather-context.type';
import { TOOL_NAMES, colorHexToLabel, colorLabelToHex } from './wardrobe-tools';

const MAX_REFERENCE_IMAGES = 5;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const REFERENCE_IMAGE_FETCH_TIMEOUT_MS = 5000;
const DEFAULT_TOOL_ROW_LIMIT = 100;
const DEFAULT_RECENT_LOG_LIMIT = 7;
/**
 * Bounds every RMQ round trip this service makes (wardrobe + media-storage).
 * Without it, a stuck downstream consumer hangs the whole tool call — and
 * with it, the loop's round/call-limit guardrails — forever, since none of
 * those guardrails ever get a chance to engage upstream of a call that never
 * resolves.
 */
const DEFAULT_TOOL_RPC_TIMEOUT_MS = 8000;

export interface RecentlyWornEntry {
  date: string;
  itemNames: string[];
}

export interface ReferenceImagePart {
  mimeType: string;
  data: string;
}

/** What a tool handler hands back to the model as its `functionResponse`. */
export type ToolResult = Record<string, unknown>;

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);
  private readonly toolRowLimit: number;
  private readonly toolRpcTimeoutMs: number;

  constructor(
    @Inject(WARDROBE_SERVICE) private readonly wardrobeClient: ClientProxy,
    @Inject(MEDIA_STORAGE_SERVICE) private readonly mediaClient: ClientProxy,
    @InjectRepository(UserAccountEntity)
    private readonly accountRepository: Repository<UserAccountEntity>,
    private readonly weatherService: WeatherService,
    private readonly configService: ConfigService,
  ) {
    this.toolRowLimit = Number(
      this.configService.get<number>(
        'AI_TOOL_ROW_LIMIT',
        DEFAULT_TOOL_ROW_LIMIT,
      ),
    );
    this.toolRpcTimeoutMs = Number(
      this.configService.get<number>(
        'AI_TOOL_RPC_TIMEOUT_MS',
        DEFAULT_TOOL_RPC_TIMEOUT_MS,
      ),
    );
  }

  /**
   * Executes one model-requested tool call. `account` is supplied by the
   * caller, never by the model, so every handler is scoped to the signed-in
   * user regardless of what arguments the model emits. An RPC failure comes
   * back as an `error` field rather than a throw — the loop must be able to
   * carry on and answer with what it has.
   */
  async executeTool(
    name: string,
    args: Record<string, unknown>,
    account: UserAccountPreview,
  ): Promise<ToolResult> {
    try {
      switch (name) {
        case TOOL_NAMES.searchWardrobe:
          return await this.searchWardrobe(account, args);
        case TOOL_NAMES.getItemDetails:
          return await this.getItemDetails(account, args);
        case TOOL_NAMES.getWeather:
          return await this.getWeather(account, args);
        case TOOL_NAMES.getRecentOutfits:
          return await this.getRecentOutfits(account, args);
        case TOOL_NAMES.proposeOutfit:
          return await this.validateOutfitProposal(account, args);
        default:
          return { error: `Unknown tool "${name}".` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Tool ${name} failed for account ${account.id}: ${message}`,
      );

      return { error: `Tool "${name}" failed: ${message}` };
    }
  }

  private async searchWardrobe(
    account: UserAccountPreview,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const filter: Record<string, unknown> = {};

    for (const key of [
      'type',
      'season',
      'status',
      'style',
      'fit_type',
      'material',
      'brand',
      'size',
      'favourite',
    ]) {
      if (args[key] !== undefined && args[key] !== null) {
        filter[key] = args[key];
      }
    }

    if (typeof args.color === 'string') {
      const hex = colorLabelToHex(args.color);

      if (!hex) {
        return {
          error: `Unknown colour "${args.color}". Pick one of the palette labels in the schema.`,
        };
      }

      filter.color = hex;
    }

    const items =
      ((await firstValueFrom(
        this.wardrobeClient
          .send(WARDROBE_REQUESTS.findMany, {
            data: filter,
            user: account,
          })
          .pipe(timeout(this.toolRpcTimeoutMs)),
      )) as WardrobeItemPreviewDto[]) ?? [];

    const requested = this.positiveInt(args.limit) ?? this.toolRowLimit;
    const cap = Math.min(requested, this.toolRowLimit);
    const rows = items.slice(0, cap).map((item) => ({
      id: item.id,
      name: item.name || item.type,
      type: item.type,
      color: colorHexToLabel(item.color) ?? item.color ?? null,
      season: item.season ?? null,
      status: item.status ?? null,
    }));

    return {
      items: rows,
      total: items.length,
      truncated: items.length > rows.length,
    };
  }

  private async getItemDetails(
    account: UserAccountPreview,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const ids = Array.isArray(args.ids)
      ? args.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];

    if (!ids.length) {
      return { items: [], total: 0, truncated: false };
    }

    const capped = ids.slice(0, this.toolRowLimit);
    const items = await this.fetchWardrobeItems(account, capped);

    return {
      items,
      total: items.length,
      truncated: ids.length > capped.length,
    };
  }

  private async getWeather(
    account: UserAccountPreview,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const weather = await this.fetchWeatherForAccount(account.id);

    if (!weather) {
      return {
        weather: null,
        note: 'No forecast available — the account has no city set or the weather provider is unavailable.',
      };
    }

    const days = this.positiveInt(args.days);

    return {
      weather: days
        ? { ...weather, dailyForecast: weather.dailyForecast.slice(0, days) }
        : weather,
    };
  }

  /**
   * `propose_outfit` is a terminal tool: the model is trusted on `summary` and
   * `rationale`, but `itemIds` is user-controlled input reaching another
   * account's data if left unchecked, so every id is checked against what
   * `findManyByIds` actually returns for *this* account — an id belonging to
   * someone else's wardrobe simply never comes back, the same scoping every
   * other tool here relies on. Any id missing from the response is reported
   * back to the model rather than silently dropped, so the loop (not this
   * handler) decides whether to end the exchange.
   */
  private async validateOutfitProposal(
    account: UserAccountPreview,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
    const rationale =
      typeof args.rationale === 'string' ? args.rationale.trim() : '';
    const itemIds = Array.isArray(args.itemIds)
      ? [
          ...new Set(
            args.itemIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id)),
          ),
        ]
      : [];

    if (!summary) {
      return { error: 'propose_outfit requires a non-empty summary.' };
    }

    if (!itemIds.length) {
      return {
        error: 'propose_outfit requires at least one wardrobe item id.',
      };
    }

    const owned = await this.fetchWardrobeItems(account, itemIds);
    const ownedIds = new Set(owned.map((item) => item.id));
    const unknownIds = itemIds.filter((id) => !ownedIds.has(id));

    if (unknownIds.length) {
      return {
        error:
          `These item ids do not belong to this account's wardrobe and were rejected: ` +
          `${unknownIds.join(', ')}. Only propose items confirmed via search_wardrobe or get_item_details.`,
      };
    }

    return { ok: true, summary, rationale, itemIds };
  }

  private async getRecentOutfits(
    account: UserAccountPreview,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const limit = Math.min(
      this.positiveInt(args.limit) ?? DEFAULT_RECENT_LOG_LIMIT,
      this.toolRowLimit,
    );
    const outfits = await this.fetchRecentlyWorn(account, limit);

    return { outfits, total: outfits.length };
  }

  /**
   * The one block of context sent unconditionally: enough for the model to know
   * the shape of the wardrobe without spending a round trip discovering it.
   * The calendar season is labelled a hint, not a filter — it can contradict
   * the weather, and `get_weather` is the authority.
   */
  async buildSeedSummary(account: UserAccountPreview): Promise<string> {
    const [items, city] = await Promise.all([
      this.fetchAllItemsForSummary(account),
      this.fetchAccountCity(account.id),
    ]);

    const byType = this.tally(items.map((item) => String(item.type)));
    const byStatus = this.tally(items.map((item) => String(item.status)));

    return [
      'Wardrobe summary (orientation only — call the tools for the actual items):',
      `- Total items: ${items.length}`,
      `- By type: ${this.formatTally(byType)}`,
      `- By status: ${this.formatTally(byStatus)}`,
      `- Account city: ${city ?? 'not set'}`,
      `- Calendar season hint: ${getCurrentSeason()} (a hint from today's date, not a filter — check get_weather before relying on it)`,
    ].join('\n');
  }

  private async fetchAllItemsForSummary(
    account: UserAccountPreview,
  ): Promise<WardrobeItemPreviewDto[]> {
    try {
      return (
        ((await firstValueFrom(
          this.wardrobeClient
            .send(WARDROBE_REQUESTS.findMany, {
              data: {},
              user: account,
            })
            .pipe(timeout(this.toolRpcTimeoutMs)),
        )) as WardrobeItemPreviewDto[]) ?? []
      );
    } catch (error) {
      this.logger.warn(
        `Failed to build wardrobe summary for account ${account.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private tally(values: string[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const value of values) {
      if (!value || value === 'undefined' || value === 'null') {
        continue;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return counts;
  }

  private formatTally(counts: Map<string, number>): string {
    if (!counts.size) {
      return 'none';
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => `${label} ${count}`)
      .join(', ');
  }

  private positiveInt(value: unknown): number | null {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }

  async fetchWardrobeItems(account: UserAccountPreview, ids?: number[]) {
    if (!ids?.length) {
      return [];
    }

    return firstValueFrom(
      this.wardrobeClient
        .send(WARDROBE_REQUESTS.findManyByIds, {
          data: ids,
          user: account,
        })
        .pipe(timeout(this.toolRpcTimeoutMs)),
    ) as Promise<WardrobeItemDto[]>;
  }

  private async fetchAccountCity(accountId: number): Promise<string | null> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: ['id', 'city'],
    });

    return account?.city ?? null;
  }

  async fetchWeatherForAccount(
    accountId: number,
  ): Promise<WeatherContext | null> {
    const city = await this.fetchAccountCity(accountId);

    if (!city) {
      return null;
    }

    return firstValueFrom(this.weatherService.getForecast(city));
  }

  async fetchRecentlyWorn(
    account: UserAccountPreview,
    limit = DEFAULT_RECENT_LOG_LIMIT,
  ): Promise<RecentlyWornEntry[]> {
    try {
      const logs = (await firstValueFrom(
        this.wardrobeClient
          .send(OUTFIT_LOG_REQUESTS.findMany, {
            data: { limit },
            user: account,
          })
          .pipe(timeout(this.toolRpcTimeoutMs)),
      )) as OutfitLogDto[];

      if (!logs?.length) {
        return [];
      }

      const allItemIds = [
        ...new Set(logs.flatMap((log) => log.wardrobeItemIds)),
      ];

      const items = await this.fetchWardrobeItems(account, allItemIds);
      const nameById = new Map(
        items.map((item) => [item.id, item.name || item.type]),
      );

      return logs.map((log) => ({
        date: new Date(log.date).toISOString().split('T')[0],
        itemNames: log.wardrobeItemIds.map(
          (id) => nameById.get(id) ?? String(id),
        ),
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to fetch recently worn logs for account ${account.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  async fetchReferenceImageUrls(keys?: string[]) {
    if (!keys?.length) {
      return [];
    }

    const itemPaths: ItemPath[] = keys.map((path, index) => ({
      id: index,
      path,
    }));

    try {
      const result = (await firstValueFrom(
        this.mediaClient
          .send(MEDIA_STORAGE_REQUESTS.getUrls, {
            itemPaths,
          })
          .pipe(timeout(this.toolRpcTimeoutMs)),
      )) as Record<string, string>;

      return keys.map((_, index) => result[index] ?? null).filter(Boolean);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve reference image urls: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Fetches reference image bytes from already-resolved signed URLs so they can
   * be attached to the Gemini call as `inlineData` parts. Caps at
   * MAX_REFERENCE_IMAGES; a failed fetch or an oversized image is skipped with
   * a warning and never aborts the caller.
   */
  async fetchReferenceImageParts(
    urls: string[],
  ): Promise<ReferenceImagePart[]> {
    const capped = urls.slice(0, MAX_REFERENCE_IMAGES);
    const parts = await Promise.all(
      capped.map((url) => this.fetchReferenceImagePart(url)),
    );

    return parts.filter((part): part is ReferenceImagePart => part !== null);
  }

  private async fetchReferenceImagePart(
    url: string,
  ): Promise<ReferenceImagePart | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REFERENCE_IMAGE_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Reference image fetch failed (HTTP ${response.status}): ${url}`,
        );
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
        this.logger.warn(
          `Reference image exceeds ${MAX_REFERENCE_IMAGE_BYTES} bytes, skipping: ${url}`,
        );
        return null;
      }

      const headerType = response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      const mimeType = headerType?.startsWith('image/')
        ? headerType
        : this.sniffImageMimeType(buffer);

      if (!mimeType) {
        this.logger.warn(
          `Could not determine mime type for reference image, skipping: ${url}`,
        );
        return null;
      }

      return { mimeType, data: buffer.toString('base64') };
    } catch (error) {
      this.logger.warn(
        `Reference image fetch threw for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private sniffImageMimeType(buffer: Buffer): string | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }

    if (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    if (
      buffer.length >= 6 &&
      ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
    ) {
      return 'image/gif';
    }

    return null;
  }
}
