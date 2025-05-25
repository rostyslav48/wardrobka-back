import { firstValueFrom } from 'rxjs';
import { Inject, Injectable } from '@nestjs/common';

import { ClientProxyService } from '../services/client-proxy.service';

import {
  FindManyWardrobeItemsRequestDto,
  UpdateWardrobeItemRequestDto,
  CreateWardrobeItemRequestDto,
} from '@app/wardrobe/dto';

import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';
import { CLIENT_PROXY_SERVICE } from '../constants';

@Injectable()
export class WardrobeService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private wardrobeClient: ClientProxyService,
  ) {}

  public findAll(filters: FindManyWardrobeItemsRequestDto) {
    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.findMany, filters),
    );
  }

  public findOne(id: number) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.findOne, id);
  }

  public create(
    dto: CreateWardrobeItemRequestDto,
    image?: Express.Multer.File,
  ) {
    const preparedImage = image
      ? {
          originalname: image.originalname,
          fileBase64: image.buffer.toString('base64'),
        }
      : null;

    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.create, {
        dto,
        image: preparedImage,
      }),
    );
  }

  public update(
    id: number,
    dto: UpdateWardrobeItemRequestDto,
    image?: Express.Multer.File,
  ) {
    const preparedImage = image
      ? {
          originalname: image.originalname,
          fileBase64: image.buffer.toString('base64'),
        }
      : null;

    return this.wardrobeClient.send(WARDROBE_REQUESTS.update, {
      id,
      dto,
      image: preparedImage,
    });
  }

  public delete(id: number) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.delete, id);
  }
}
