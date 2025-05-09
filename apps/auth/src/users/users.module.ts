import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DatabaseModule } from '@app/common';

import { UsersController } from './users.controller';

import { UsersService } from './users.service';

import { UserAccountEntity } from '@app/common/database/entities/auth';
import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAccountEntity, WardrobeItemEntity]),
    DatabaseModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
