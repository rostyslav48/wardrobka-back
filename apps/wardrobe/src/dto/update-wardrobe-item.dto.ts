import { PartialType } from '@nestjs/mapped-types';

import { CreateWardrobeItemDto } from './create-wardrobe-item.dto';

export class UpdateWardrobeItemDto extends PartialType(CreateWardrobeItemDto) {}
