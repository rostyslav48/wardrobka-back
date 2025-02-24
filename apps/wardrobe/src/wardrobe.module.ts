import { Module } from '@nestjs/common';
import { WardrobeController } from './wardrobe.controller';
import { WardrobeService } from './wardrobe.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // validationSchema
      envFilePath: './apps/auth/.env',
    }),
  ],
  controllers: [WardrobeController],
  providers: [WardrobeService],
})
export class WardrobeModule {}