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

@Injectable()
export class OutfitLogService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private readonly client: ClientProxyService,
  ) {}

  findAll(): Observable<OutfitLogDto[]> {
    return this.client.send(OUTFIT_LOG_REQUESTS.findMany, {});
  }

  findOne(id: string): Observable<OutfitLogDto> {
    return this.client.send(OUTFIT_LOG_REQUESTS.findOne, id);
  }

  create(dto: CreateOutfitLogRequestDto): Observable<OutfitLogDto> {
    return this.client.send(OUTFIT_LOG_REQUESTS.create, dto);
  }

  update(id: string, dto: UpdateOutfitLogRequestDto): Observable<OutfitLogDto> {
    return this.client.send(OUTFIT_LOG_REQUESTS.update, { id, dto });
  }

  delete(id: string): Observable<void> {
    return this.client.send(OUTFIT_LOG_REQUESTS.delete, id);
  }
}
