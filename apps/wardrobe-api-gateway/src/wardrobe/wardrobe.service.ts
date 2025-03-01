import { firstValueFrom } from 'rxjs';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { CreateWardrobeDto } from './dto/create-wardrobe.dto';
import { UpdateWardrobeDto } from './dto/update-wardrobe.dto';

import { WARDROBE_SERVICE } from '../constants/services';

@Injectable()
export class WardrobeService {
  constructor(@Inject(WARDROBE_SERVICE) private wardrobeClient: ClientProxy) {}

  create(createWardrobeDto: CreateWardrobeDto) {
    return 'This action adds a new wardrobe';
  }

  findAll() {
    // this.wardrobeClient.emit('wardrobe/get_items', null);
    return firstValueFrom(this.wardrobeClient.send('wardrobe/get_items', {}));
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
