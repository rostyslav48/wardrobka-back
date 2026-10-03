import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  MaxFileSizeValidator,
  ParseFilePipe,
  FileTypeValidator,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { WardrobeService } from './wardrobe.service';

import {
  FindManyWardrobeItemsRequestDto,
  CreateWardrobeItemRequestDto,
  UpdateWardrobeItemRequestDto,
} from '@app/wardrobe/dto';
import { Throttle } from '@nestjs/throttler';
import { ImageUploadValidationPipe } from '@app/wardrobe-api-gateway/wardrobe/validators';
import {
  FriendlyThrottlerGuard,
  ImageGenerationThrottlerGuard,
} from '@app/wardrobe-api-gateway/wardrobe/guards';
import { CurrentUser } from '@app/wardrobe-api-gateway/auth/decorators';
import {
  ANALYZE_IMAGE_THROTTLE,
  IMAGE_GENERATION_THROTTLE,
} from '@app/wardrobe-api-gateway/wardrobe/constants';
import { UserAccountPreview } from '@app/auth/users/types';

@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @UseGuards(ImageGenerationThrottlerGuard)
  @Throttle(IMAGE_GENERATION_THROTTLE)
  create(
    @Body() createWardrobeDto: CreateWardrobeItemRequestDto,
    @CurrentUser() user: UserAccountPreview,
    @UploadedFile(ImageUploadValidationPipe)
    image?: Express.Multer.File,
  ) {
    return this.wardrobeService.create(createWardrobeDto, user, image);
  }

  @Get()
  findAll(
    @Query() filters: FindManyWardrobeItemsRequestDto,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.wardrobeService.findAll(filters, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: UserAccountPreview) {
    return this.wardrobeService.findOne(+id, user);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  @UseGuards(ImageGenerationThrottlerGuard)
  @Throttle(IMAGE_GENERATION_THROTTLE)
  update(
    @Param('id') id: string,
    @Body()
    updateWardrobeDto: UpdateWardrobeItemRequestDto,
    @CurrentUser() user: UserAccountPreview,
    @UploadedFile(ImageUploadValidationPipe)
    image?: Express.Multer.File,
  ) {
    return this.wardrobeService.update(+id, updateWardrobeDto, user, image);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: UserAccountPreview) {
    return this.wardrobeService.delete(+id, user);
  }

  /**
   * "Generate again" for an item whose generation failed. Same throttle as
   * create: it starts the same paid job, so it cannot be the cheap way in.
   */
  @Post(':id/generate-image')
  @UseGuards(ImageGenerationThrottlerGuard)
  @Throttle(IMAGE_GENERATION_THROTTLE)
  retryImageGeneration(
    @Param('id') id: string,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.wardrobeService.retryImageGeneration(+id, user);
  }

  @Post('analyze-image')
  @UseInterceptors(FileInterceptor('image'))
  @UseGuards(FriendlyThrottlerGuard)
  @Throttle(ANALYZE_IMAGE_THROTTLE)
  analyzeImage(
    @CurrentUser() user: UserAccountPreview,
    @UploadedFile(ImageUploadValidationPipe)
    image?: Express.Multer.File,
  ) {
    return this.wardrobeService.analyzeImage(image, user);
  }
}
