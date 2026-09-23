import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { normaliseEmail } from '../utils/normalise-input';

export class LoginRequest {
  @Transform(({ value }) => normaliseEmail(value))
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
