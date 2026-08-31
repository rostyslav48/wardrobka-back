import { IsString, MinLength } from 'class-validator';

export class AnalyzeImageRequestDto {
  @IsString()
  @MinLength(1)
  fileBase64: string;

  @IsString()
  @MinLength(1)
  mimeType: string;
}
