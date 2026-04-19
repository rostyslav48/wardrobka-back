import { Expose } from 'class-transformer';
import { ItemStatus, ItemType, Season, Size } from '@app/wardrobe/enums';

export class WardrobeItemPreviewDto {
  @Expose()
  id: number;

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

  @Expose({ name: 'favourite' })
  favourite: boolean;

  @Expose()
  size?: Size;
}
