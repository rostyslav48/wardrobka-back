import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { MediaStorageService } from './media-storage.service';

import { MEDIA_STORAGE_REQUESTS } from '@app/media-storage/constants/requests';

import { ItemNamedUrls, ItemPath, FileTransfer } from './models';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class MediaStorageController {
  constructor(
    private readonly mediaStorageService: MediaStorageService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(MEDIA_STORAGE_REQUESTS.store)
  async store(
    @Ctx() context: RmqContext,
    @Body() { file, path }: { file: FileTransfer; path: string },
  ): Promise<string> {
    const awsFilePath = await this.mediaStorageService.upload(file, path);
    this.rmqService.ack(context);

    return awsFilePath;
  }

  @MessagePattern(MEDIA_STORAGE_REQUESTS.getUrls)
  async getUrls(
    @Ctx() context: RmqContext,
    @Body() { itemPaths }: { itemPaths: ItemPath[] },
  ): Promise<ItemNamedUrls> {
    const urls = await Promise.all(
      itemPaths.map(async ({ id, path }) => {
        const url = await this.mediaStorageService.getSignedUrl(path);
        return {
          url,
          id,
        };
      }),
    );
    this.rmqService.ack(context);

    return urls.reduce((acc, { url, id }) => ({ ...acc, [id]: url }), {});
  }

  @MessagePattern(MEDIA_STORAGE_REQUESTS.delete)
  async delete(
    @Ctx() context: RmqContext,
    @Body() { filePath }: { filePath: string },
  ): Promise<boolean> {
    const res = await this.mediaStorageService.delete(filePath);
    this.rmqService.ack(context);

    return res;
  }
}
