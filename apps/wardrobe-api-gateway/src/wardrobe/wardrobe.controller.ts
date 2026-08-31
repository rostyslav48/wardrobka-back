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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ImageUploadValidationPipe } from '@app/wardrobe-api-gateway/wardrobe/validators';
import { CurrentUser } from '@app/wardrobe-api-gateway/auth/decorators';
import { UserAccountPreview } from '@app/auth/users/types';

@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 5000, limit: 1 } })
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

  @Post('analyze-image')
  @UseInterceptors(FileInterceptor('image'))
  analyzeImage(
    @CurrentUser() user: UserAccountPreview,
    @UploadedFile(ImageUploadValidationPipe)
    image?: Express.Multer.File,
  ) {
    return this.wardrobeService.analyzeImage(image, user);
  }
}
