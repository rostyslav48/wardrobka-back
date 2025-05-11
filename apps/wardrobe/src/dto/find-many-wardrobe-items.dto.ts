import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  FitType,
  ItemStatus,
  ItemType,
  Season,
  Size,
} from '@app/wardrobe/enums';
import { Transform } from 'class-transformer';

export class FindManyWardrobeItemsDto {
  @IsEnum(ItemType)
  @IsOptional()
  type?: ItemType;

  @IsHexColor()
  @IsOptional()
  color?: string;

  @IsEnum(Season)
  @IsOptional()
  season?: Season;

  @IsEnum(ItemStatus)
  @IsOptional()
  status?: ItemStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  favourite?: boolean;

  @IsEnum(FitType)
  @IsOptional()
  fit_type?: FitType;

  @IsString()
  @IsOptional()
  material?: string;

  @IsEnum(Size)
  @IsOptional()
  size?: Size;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  style?: string;
}
