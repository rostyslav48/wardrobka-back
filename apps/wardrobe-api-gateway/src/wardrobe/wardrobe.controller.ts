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
import { ThrottlerGuard } from '@nestjs/throttler';
import { ImageUploadValidationPipe } from '@app/wardrobe-api-gateway/wardrobe/validators';

@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @UseGuards(ThrottlerGuard)
  create(
    @Body() createWardrobeDto: CreateWardrobeItemRequestDto,
    @UploadedFile(ImageUploadValidationPipe)
    image?: Express.Multer.File,
  ) {
    return this.wardrobeService.create(createWardrobeDto, image);
  }

  @Get()
  findAll(@Query() filters: FindManyWardrobeItemsRequestDto) {
    return this.wardrobeService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wardrobeService.findOne(+id);
  }

  // @UseGuards(ThrottlerGuard)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id') id: string,
    @Body()
    updateWardrobeDto: UpdateWardrobeItemRequestDto,
    @UploadedFile(ImageUploadValidationPipe)
    image?: Express.Multer.File,
  ) {
    return this.wardrobeService.update(+id, updateWardrobeDto, image);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.wardrobeService.delete(+id);
  }
}
