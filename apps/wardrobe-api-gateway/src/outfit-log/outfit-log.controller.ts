import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CurrentUser } from '@app/wardrobe-api-gateway/auth/decorators';
import { UserAccountPreview } from '@app/auth/users/types';

@Controller('outfit-log')
export class OutfitLogController {
  constructor(private readonly outfitLogService: OutfitLogService) {}

  @Get()
  findAll(@CurrentUser() user: UserAccountPreview): Observable<OutfitLogDto[]> {
    return this.outfitLogService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserAccountPreview,
  ): Observable<OutfitLogDto> {
    return this.outfitLogService.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateOutfitLogRequestDto,
    @CurrentUser() user: UserAccountPreview,
  ): Observable<OutfitLogDto> {
    return this.outfitLogService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutfitLogRequestDto,
    @CurrentUser() user: UserAccountPreview,
  ): Observable<OutfitLogDto> {
    return this.outfitLogService.update(id, dto, user);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserAccountPreview,
  ): Observable<{ success: true }> {
    return this.outfitLogService.delete(id, user);
  }
}
