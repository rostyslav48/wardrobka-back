import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateOutfitLogRequestDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  wardrobeItemIds?: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
