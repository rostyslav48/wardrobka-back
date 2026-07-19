import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPushTokenRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  expoPushToken?: string | null;
}
