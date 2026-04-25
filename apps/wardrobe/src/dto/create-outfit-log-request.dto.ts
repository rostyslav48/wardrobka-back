import { IsArray, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOutfitLogRequestDto {
  @IsNumber()
  date: number;

  @IsArray()
  @IsInt({ each: true })
  wardrobeItemIds: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
