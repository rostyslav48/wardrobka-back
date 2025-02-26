import { Inject, Injectable } from '@nestjs/common';
import { CreateWardrobeDto } from './dto/create-wardrobe.dto';
import { UpdateWardrobeDto } from './dto/update-wardrobe.dto';

@Injectable()
export class WardrobeService {
  create(createWardrobeDto: CreateWardrobeDto) {
    return 'This action adds a new wardrobe';
  }

  findAll() {
    return `This action returns all wardrobe`;
  }

  findOne(id: number) {
    return `This action returns a #${id} wardrobe`;
  }

  update(id: number, updateWardrobeDto: UpdateWardrobeDto) {
    return `This action updates a #${id} wardrobe`;
  }

  remove(id: number) {
    return `This action removes a #${id} wardrobe`;
  }
}
