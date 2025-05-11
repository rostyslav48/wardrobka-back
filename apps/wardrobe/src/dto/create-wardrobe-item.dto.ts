import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { FitType, ItemStatus, ItemType, Season, Size } from '../enums';

export class CreateWardrobeItemDto {
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
}
