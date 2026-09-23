import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { trimString } from '../utils/normalise-input';

export class UpdateProfileRequest {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  // Trimmed for consistency (a city typed with stray leading/trailing spaces
  // is still meaningful, unlike a whitespace-only name — see QA-01), but not
  // subject to a MinLength: an empty city is how the client clears it.
  @Transform(({ value }) => (value === null ? value : trimString(value)))
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  city?: string | null;
}
