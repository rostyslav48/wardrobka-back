import { IsArray, IsInt, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateOutfitLogRequestDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  wardrobeItemIds?: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
