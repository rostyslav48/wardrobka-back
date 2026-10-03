import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Payload of the `ai-assistant/generate-product-image` RMQ event.
 *
 * Carries only an S3 key — never image bytes. The original photo lives under
 * the `tmp/` prefix until the job succeeds and deletes it (or the bucket's
 * 7-day lifecycle rule expires it).
 */
export class GenerateProductImageRequestDto {
  @IsInt()
  itemId: number;

  @IsInt()
  accountId: number;

  @IsString()
  @MinLength(1)
  tempImageKey: string;

  @IsOptional()
  @IsString()
  originalName?: string;
}
