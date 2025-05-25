import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

import {
  FileTransfer,
  ItemNamedUrls,
  ItemPath,
} from '@app/media-storage/models';

import { MEDIA_STORAGE_SERVICE } from '@app/wardrobe-api-gateway/constants';
import { MEDIA_STORAGE_REQUESTS } from '@app/media-storage/constants/requests';

@Injectable()
export class MediaStorageService {
  constructor(
    @Inject(MEDIA_STORAGE_SERVICE)
    private readonly clientProxy: ClientProxy,
  ) {}

  public store(file: FileTransfer, path: string): Promise<string> {
    return lastValueFrom(
      this.clientProxy.send(MEDIA_STORAGE_REQUESTS.store, { file, path }),
    );
  }

  public getUrls(itemPaths: ItemPath[]): Promise<ItemNamedUrls> {
    return lastValueFrom(
      this.clientProxy.send(MEDIA_STORAGE_REQUESTS.getUrls, { itemPaths }),
    );
  }

  public delete(filePath: string): Promise<boolean> {
    return lastValueFrom(
      this.clientProxy.send(MEDIA_STORAGE_REQUESTS.delete, { filePath }),
    );
  }
}
