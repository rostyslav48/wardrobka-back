import { PartialType } from '@nestjs/mapped-types';

import { CreateWardrobeItemRequestDto } from './create-wardrobe-item-request.dto';

export class UpdateWardrobeItemRequestDto extends PartialType(
  CreateWardrobeItemRequestDto,
) {}
