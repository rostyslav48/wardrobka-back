import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';

import { WardrobeService } from './wardrobe.service';

import {
  FindManyWardrobeItemsDto,
  CreateWardrobeItemDto,
  UpdateWardrobeItemDto,
} from '@app/wardrobe/dto';

@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Post()
  create(@Body() createWardrobeDto: CreateWardrobeItemDto) {
    return this.wardrobeService.create(createWardrobeDto);
  }

  @Get()
  findAll(@Query() filters: FindManyWardrobeItemsDto) {
    return this.wardrobeService.findAll(filters);
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
