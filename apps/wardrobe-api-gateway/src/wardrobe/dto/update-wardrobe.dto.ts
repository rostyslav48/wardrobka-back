import { PartialType } from '@nestjs/mapped-types';
import { CreateWardrobeDto } from './create-wardrobe.dto';

export class UpdateWardrobeDto extends PartialType(CreateWardrobeDto) {}
