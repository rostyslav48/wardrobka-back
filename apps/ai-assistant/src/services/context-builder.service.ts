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

export interface RecentlyWornEntry {
  date: string;
  itemNames: string[];
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
}
