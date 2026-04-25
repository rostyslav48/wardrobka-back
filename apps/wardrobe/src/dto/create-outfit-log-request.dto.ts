import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateOutfitLogRequestDto {
  @IsDateString()
  date: string;

  @IsArray()
  @IsInt({ each: true })
  wardrobeItemIds: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
