import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { WardrobeItemDto } from '@app/wardrobe/dto';
import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';
import { MEDIA_STORAGE_REQUESTS } from '@app/media-storage/constants/requests';
import { ItemPath } from '@app/media-storage/models';
import {
  MEDIA_STORAGE_SERVICE,
  WARDROBE_SERVICE,
} from '@app/wardrobe-api-gateway/constants';
import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class ContextBuilderService {
  constructor(
    @Inject(WARDROBE_SERVICE) private readonly wardrobeClient: ClientProxy,
    @Inject(MEDIA_STORAGE_SERVICE) private readonly mediaClient: ClientProxy,
  ) {}

  async buildContext(
    account: UserAccountPreview,
    options: {
      contextItemIds?: number[];
      referenceImageKeys?: string[];
    },
  ): Promise<{
    wardrobeItems: WardrobeItemDto[];
    referenceImageUrls: string[];
  }> {
    const [wardrobeItems, referenceImageUrls] = await Promise.all([
      this.fetchWardrobeItems(account, options.contextItemIds),
      this.fetchReferenceImageUrls(options.referenceImageKeys),
    ]);

    return { wardrobeItems, referenceImageUrls };
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
