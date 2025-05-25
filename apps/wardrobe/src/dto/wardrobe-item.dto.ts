import {
  FitType,
  ItemStatus,
  ItemType,
  Season,
  Size,
} from '@app/wardrobe/enums';
import { Expose } from 'class-transformer';

export class WardrobeItemDto {
  @Expose()
  id: number;

  @Expose()
  accountId: number;

  @Expose()
  type: ItemType;

  @Expose()
  color: string;

  @Expose()
  name: string;

  @Expose()
  season: Season;

  @Expose()
  img_url?: string;

  @Expose()
  status: ItemStatus;

  @Expose()
  favorite: boolean;

  @Expose()
  fit_type?: FitType;

  @Expose()
  material?: string;

  @Expose()
  description?: string;

  @Expose()
  style?: string;

  @Expose()
  size?: Size;

  @Expose()
  brand?: string;
}
