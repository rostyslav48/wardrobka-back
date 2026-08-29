import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';

import {
  OutfitLogDto,
  WardrobeItemDto,
  WardrobeItemPreviewDto,
} from '@app/wardrobe/dto';
import {
  OUTFIT_LOG_REQUESTS,
  WARDROBE_REQUESTS,
} from '@app/wardrobe/constants';
import { ItemStatus } from '@app/wardrobe/enums';
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

const MAX_ACTIVE_ITEMS_IN_CONTEXT = 50;
const MAX_REFERENCE_IMAGES = 5;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface RecentlyWornEntry {
  date: string;
  itemNames: string[];
}

export interface ReferenceImagePart {
  mimeType: string;
  data: string;
}

export interface AiSystemContext {
  wardrobeItems: WardrobeItemDto[];
  referenceImageUrls: string[];
  activeWardrobeItems: WardrobeItemPreviewDto[];
  weather: WeatherContext | null;
  recentlyWorn: RecentlyWornEntry[];
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    @Inject(WARDROBE_SERVICE) private readonly wardrobeClient: ClientProxy,
    @Inject(MEDIA_STORAGE_SERVICE) private readonly mediaClient: ClientProxy,
    @InjectRepository(UserAccountEntity)
    private readonly accountRepository: Repository<UserAccountEntity>,
    private readonly weatherService: WeatherService,
  ) {}

  async buildContext(
    account: UserAccountPreview,
    options: {
      contextItemIds?: number[];
      referenceImageKeys?: string[];
    },
  ): Promise<AiSystemContext> {
    const [
      wardrobeItems,
      referenceImageUrls,
      activeWardrobeItems,
      weather,
      recentlyWorn,
    ] = await Promise.all([
      this.fetchWardrobeItems(account, options.contextItemIds),
      this.fetchReferenceImageUrls(options.referenceImageKeys),
      this.fetchActiveSeasonalItems(account),
      this.fetchWeatherForAccount(account.id),
      this.fetchRecentlyWorn(account),
    ]);

    return {
      wardrobeItems,
      referenceImageUrls,
      activeWardrobeItems,
      weather,
      recentlyWorn,
    };
  }

  async fetchWardrobeItems(account: UserAccountPreview, ids?: number[]) {
    if (!ids?.length) {
      return [];
    }

    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.findManyByIds, {
        data: ids,
        user: account,
      }),
    ) as Promise<WardrobeItemDto[]>;
  }

  private async fetchActiveSeasonalItems(
    account: UserAccountPreview,
  ): Promise<WardrobeItemPreviewDto[]> {
    const season = getCurrentSeason();

    try {
      const items = (await firstValueFrom(
        this.wardrobeClient.send(WARDROBE_REQUESTS.findMany, {
          data: { status: ItemStatus.Active, season },
          user: account,
        }),
      )) as WardrobeItemPreviewDto[];

      return this.capByFavouritesFirst(items ?? []);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch active wardrobe items for account ${account.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private capByFavouritesFirst(
    items: WardrobeItemPreviewDto[],
  ): WardrobeItemPreviewDto[] {
    if (items.length <= MAX_ACTIVE_ITEMS_IN_CONTEXT) {
      return items;
    }

    const sorted = [...items].sort((a, b) => {
      if (a.favourite !== b.favourite) {
        return a.favourite ? -1 : 1;
      }
      return (b.id ?? 0) - (a.id ?? 0);
    });

    return sorted.slice(0, MAX_ACTIVE_ITEMS_IN_CONTEXT);
  }

  private async fetchWeatherForAccount(
    accountId: number,
  ): Promise<WeatherContext | null> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: ['id', 'city'],
    });

    if (!account?.city) {
      return null;
    }

    return firstValueFrom(this.weatherService.getForecast(account.city));
  }

  async fetchRecentlyWorn(
    account: UserAccountPreview,
  ): Promise<RecentlyWornEntry[]> {
    const RECENT_LOG_LIMIT = 7;

    try {
      const logs = (await firstValueFrom(
        this.wardrobeClient.send(OUTFIT_LOG_REQUESTS.findMany, {
          data: { limit: RECENT_LOG_LIMIT },
          user: account,
        }),
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

  private async fetchReferenceImageUrls(keys?: string[]) {
    if (!keys?.length) {
      return [];
    }

    const itemPaths: ItemPath[] = keys.map((path, index) => ({
      id: index,
      path,
    }));

    const result = (await firstValueFrom(
      this.mediaClient.send(MEDIA_STORAGE_REQUESTS.getUrls, {
        itemPaths,
      }),
    )) as Record<string, string>;

    return keys.map((_, index) => result[index] ?? null).filter(Boolean);
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
      const response = await fetch(url);

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

      const mimeType =
        response.headers.get('content-type')?.split(';')[0]?.trim() ||
        this.sniffImageMimeType(buffer);

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
