import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { ClientProxyService } from '../services/client-proxy.service';
import { CLIENT_PROXY_SERVICE } from '../constants';
import { OUTFIT_LOG_REQUESTS } from '@app/wardrobe/constants';
import {
  CreateOutfitLogRequestDto,
  OutfitLogDto,
  UpdateOutfitLogRequestDto,
} from '@app/wardrobe/dto';
import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class OutfitLogService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private readonly client: ClientProxyService,
  ) {}

  findAll(user: UserAccountPreview): Observable<OutfitLogDto[]> {
    return this.client.send(OUTFIT_LOG_REQUESTS.findMany, {}, user);
  }

  findOne(id: string, user: UserAccountPreview): Observable<OutfitLogDto> {
    return this.client.send(OUTFIT_LOG_REQUESTS.findOne, id, user);
  }

  create(
    dto: CreateOutfitLogRequestDto,
    user: UserAccountPreview,
  ): Observable<OutfitLogDto> {
    return this.client.send(OUTFIT_LOG_REQUESTS.create, dto, user);
  }

  update(
    id: string,
    dto: UpdateOutfitLogRequestDto,
    user: UserAccountPreview,
  ): Observable<OutfitLogDto> {
    return this.client.send(OUTFIT_LOG_REQUESTS.update, { id, dto }, user);
  }

  delete(
    id: string,
    user: UserAccountPreview,
  ): Observable<{ success: true }> {
    return this.client.send(OUTFIT_LOG_REQUESTS.delete, id, user);
  }
}
