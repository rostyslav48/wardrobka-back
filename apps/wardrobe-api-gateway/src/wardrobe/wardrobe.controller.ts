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
import { CreateWardrobeDto } from './dto/create-wardrobe.dto';
import { UpdateWardrobeDto } from './dto/update-wardrobe.dto';

@Controller('wardrobe')
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Post()
  create(@Body() createWardrobeDto: CreateWardrobeDto) {
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
    @Body() updateWardrobeDto: UpdateWardrobeDto,
  ) {
    return this.wardrobeService.update(+id, updateWardrobeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.wardrobeService.remove(+id);
  }
}
