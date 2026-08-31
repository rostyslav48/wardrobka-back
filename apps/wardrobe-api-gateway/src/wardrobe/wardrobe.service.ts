import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import {
  BadRequestException,
  Inject,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';

import { ClientProxyService } from '../services/client-proxy.service';

import {
  FindManyWardrobeItemsRequestDto,
  UpdateWardrobeItemRequestDto,
  CreateWardrobeItemRequestDto,
} from '@app/wardrobe/dto';

import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';
import { AI_ASSISTANT_REQUESTS } from '@app/ai-assistant/constants';
import { CLIENT_PROXY_SERVICE } from '../constants';
import { AI_ASSISTANT_CLIENT_PROXY_SERVICE } from './constants';
import { UserAccountPreview } from '@app/auth/users/types';

// The RMQ round-trip must time out on its own — a hung ai-assistant call
// (e.g. its own Gemini deadline never firing) would otherwise hold this
// synchronous HTTP request open indefinitely.
const ANALYZE_IMAGE_RMQ_TIMEOUT_MS = 20000;

@Injectable()
export class WardrobeService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private wardrobeClient: ClientProxyService,
    @Inject(AI_ASSISTANT_CLIENT_PROXY_SERVICE)
    private aiAssistantClient: ClientProxyService,
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

  public async analyzeImage(
    image: Express.Multer.File | undefined,
    user: UserAccountPreview,
  ) {
    if (!image) {
      throw new BadRequestException('An image is required to run analysis');
    }

    try {
      return await firstValueFrom(
        this.aiAssistantClient
          .send(
            AI_ASSISTANT_REQUESTS.analyzeImage,
            {
              fileBase64: image.buffer.toString('base64'),
              mimeType: image.mimetype,
            },
            user,
          )
          .pipe(timeout(ANALYZE_IMAGE_RMQ_TIMEOUT_MS)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException(
          'Image analysis timed out — you can still fill the form manually.',
        );
      }
      throw error;
    }
  }
}
