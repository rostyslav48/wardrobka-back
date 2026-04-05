import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertWebhookKeyDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  webhookKey: string;
}
