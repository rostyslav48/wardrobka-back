import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import {
  CreateOutfitLogRequestDto,
  OutfitLogDto,
  UpdateOutfitLogRequestDto,
} from '@app/wardrobe/dto';

import { OutfitLogService } from './outfit-log.service';

@Controller('outfit-log')
export class OutfitLogController {
  constructor(private readonly outfitLogService: OutfitLogService) {}

  @Get()
  findAll(): Observable<OutfitLogDto[]> {
    return this.outfitLogService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Observable<OutfitLogDto> {
    return this.outfitLogService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOutfitLogRequestDto): Observable<OutfitLogDto> {
    return this.outfitLogService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOutfitLogRequestDto,
  ): Observable<OutfitLogDto> {
    return this.outfitLogService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Observable<void> {
    return this.outfitLogService.delete(id);
  }
}
