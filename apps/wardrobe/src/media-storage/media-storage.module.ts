import { Module } from '@nestjs/common';

import { RmqModule } from '@app/common';

import { MediaStorageService } from './media-storage.service';

import { MEDIA_STORAGE_SERVICE } from '@app/wardrobe-api-gateway/constants';

@Module({
  imports: [
    RmqModule.register({
      name: MEDIA_STORAGE_SERVICE,
    }),
  ],
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaStorageModule {}
