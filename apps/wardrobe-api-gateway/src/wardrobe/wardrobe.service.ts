import { firstValueFrom } from 'rxjs';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { CreateWardrobeItemDto } from '@app/wardrobe/dto/create-wardrobe-item.dto';
import { UpdateWardrobeItemDto } from '@app/wardrobe/dto/update-wardrobe-item.dto';

import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';
import { WARDROBE_SERVICE } from '../constants/services';

@Injectable()
export class WardrobeService {
  constructor(@Inject(WARDROBE_SERVICE) private wardrobeClient: ClientProxy) {}

  findAll() {
    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.findMany, {}),
    );
  }

  findOne(id: number) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.findOne, id);
  }

  create(dto: CreateWardrobeItemDto) {
    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.create, dto),
    );
  }

  update(id: number, dto: UpdateWardrobeItemDto) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.update, { id, dto });
  }

  delete(id: number) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.delete, id);
  }
}
