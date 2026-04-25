import { IsArray, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateOutfitLogRequestDto {
  @IsOptional()
  @IsNumber()
  date?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  wardrobeItemIds?: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
