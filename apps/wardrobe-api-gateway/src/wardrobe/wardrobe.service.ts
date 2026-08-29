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
import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class WardrobeService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private wardrobeClient: ClientProxyService,
  ) {}

  public findAll(
    filters: FindManyWardrobeItemsRequestDto,
    user: UserAccountPreview,
  ) {
    return firstValueFrom(
      this.wardrobeClient.send(WARDROBE_REQUESTS.findMany, filters, user),
    );
  }

  public findOne(id: number, user: UserAccountPreview) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.findOne, id, user);
  }

  public create(
    dto: CreateWardrobeItemRequestDto,
    user: UserAccountPreview,
    image?: Express.Multer.File,
  ) {
    const preparedImage = image
      ? {
          originalname: image.originalname,
          fileBase64: image.buffer.toString('base64'),
        }
      : null;

    return firstValueFrom(
      this.wardrobeClient.send(
        WARDROBE_REQUESTS.create,
        {
          dto,
          image: preparedImage,
        },
        user,
      ),
    );
  }

  public update(
    id: number,
    dto: UpdateWardrobeItemRequestDto,
    user: UserAccountPreview,
    image?: Express.Multer.File,
  ) {
    const preparedImage = image
      ? {
          originalname: image.originalname,
          fileBase64: image.buffer.toString('base64'),
        }
      : null;

    return this.wardrobeClient.send(
      WARDROBE_REQUESTS.update,
      {
        id,
        dto,
        image: preparedImage,
      },
      user,
    );
  }

  public delete(id: number, user: UserAccountPreview) {
    return this.wardrobeClient.send(WARDROBE_REQUESTS.delete, id, user);
  }
}
