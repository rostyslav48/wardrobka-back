import { Expose } from 'class-transformer';
import { FitType, ItemType, Season, Size } from '@app/wardrobe/enums';

/** Every field is optional — analysis fills in only what it could detect. */
export class AnalyzedImageAttributesDto {
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
