import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Season } from '@app/wardrobe/enums';

export class GenerateOutfitRequestDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @MaxLength(255)
  occasion: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  styleHint?: string;

  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  wardrobeItemIds: number[];
}
