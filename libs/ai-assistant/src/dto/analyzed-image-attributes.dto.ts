import { Expose } from 'class-transformer';
import { FitType, ItemType, Season, Size } from '@app/wardrobe/enums';

/** Every field is optional — analysis fills in only what it could detect.
 * `is_clothing` (QA-43) tells the caller whether the other fields should be
 * trusted at all — false means the photo did not clearly show a clothing
 * item and the form should not be auto-filled from this response. */
export class AnalyzedImageAttributesDto {
  @Expose()
  is_clothing?: boolean;

  @Expose()
  type?: ItemType;

  @Expose()
  color?: string;

  @Expose()
  season?: Season;

  @Expose()
  size?: Size;

  @Expose()
  fit_type?: FitType;

  @Expose()
  name?: string;

  @Expose()
  brand?: string;

  @Expose()
  material?: string;

  @Expose()
  style?: string;

  @Expose()
  description?: string;
}
