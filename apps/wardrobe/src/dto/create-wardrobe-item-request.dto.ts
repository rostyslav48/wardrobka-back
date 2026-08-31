import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { FitType, ItemStatus, ItemType, Season, Size } from '../enums';

export class CreateWardrobeItemRequestDto {
  @IsEnum(ItemType)
  type: ItemType;

  @IsHexColor()
  @MaxLength(50)
  color: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsEnum(Season)
  @IsNotEmpty()
  season: string;

  @IsEnum(ItemStatus)
  @IsOptional()
  status?: ItemStatus = ItemStatus.Active;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  favourite?: boolean = false;

  @IsEnum(FitType)
  @IsOptional()
  fit_type?: FitType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  material?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  style?: string;

  @IsEnum(Size)
  @IsOptional()
  size?: Size;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  /**
   * "Generate clean product image" toggle. Transport-only — it decides whether
   * the uploaded photo is stashed under `tmp/` and a generation job is emitted,
   * and is never persisted on the entity. Multipart bodies carry it as the
   * string 'true'/'false', hence the Transform (mirrors `favourite`).
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  generate_image?: boolean = false;
}
