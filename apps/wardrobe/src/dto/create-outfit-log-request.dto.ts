import { IsArray, IsInt, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateOutfitLogRequestDto {
  @IsISO8601()
  date: string;

  @IsArray()
  @IsInt({ each: true })
  wardrobeItemIds: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
