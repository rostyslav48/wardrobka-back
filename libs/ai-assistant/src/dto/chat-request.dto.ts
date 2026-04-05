import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ChatRequestDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  topic?: string;

  @IsString()
  @MaxLength(2000)
  prompt: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  contextItemIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  referenceImageKeys?: string[];
}
