import { firstValueFrom } from 'rxjs';
import { Inject, Injectable } from '@nestjs/common';

import { ClientProxyService } from '../services/client-proxy.service';

import {
  FindManyWardrobeItemsDto,
  UpdateWardrobeItemDto,
  CreateWardrobeItemDto,
} from '@app/wardrobe/dto';

import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';
import { CLIENT_PROXY_SERVICE } from '../constants';

@Injectable()
export class WardrobeService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private wardrobeClient: ClientProxyService,
  ) {}

  findAll(filters: FindManyWardrobeItemsDto) {
    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.findMany, filters),
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
