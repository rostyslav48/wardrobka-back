import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { DatabaseModule } from '@app/common';
import { MediaStorageModule } from './media-storage/media-storage.module';

import { WardrobeController } from './wardrobe/wardrobe.controller';
import { WardrobeService } from './wardrobe/wardrobe.service';

import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe/wardrobe-item.entity';
import { UserAccountEntity } from '@app/common/database/entities/auth/user-account.entity';

@Module({
  imports: [
    RmqModule,
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string(),
        RABBIT_MQ_WARDROBE_QUEUE: Joi.string(),
        USER_IMAGES_FOLDER_PATH: Joi.string(),
      }),
      envFilePath: ['./apps/wardrobe/.env', './libs/common/src/database/.env'],
    }),
    TypeOrmModule.forFeature([UserAccountEntity, WardrobeItemEntity]),
    MediaStorageModule,
  ],
  controllers: [WardrobeController],
  providers: [WardrobeService],
})
export class WardrobeModule {}
