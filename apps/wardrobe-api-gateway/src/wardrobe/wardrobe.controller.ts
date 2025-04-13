import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';

import { WardrobeService } from './wardrobe.service';

import { CreateWardrobeItemDto } from '@app/wardrobe/dto/create-wardrobe-item.dto';
import { UpdateWardrobeItemDto } from '@app/wardrobe/dto/update-wardrobe-item.dto';

@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Post()
  create(@Body() createWardrobeDto: CreateWardrobeItemDto) {
    return this.wardrobeService.create(createWardrobeDto);
  }

  @Get()
  findAll() {
    return this.wardrobeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wardrobeService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWardrobeDto: UpdateWardrobeItemDto,
  ) {
    return this.wardrobeService.update(+id, updateWardrobeDto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.wardrobeService.delete(+id);
  }
}
