import { Injectable } from '@nestjs/common';

@Injectable()
export class WardrobeService {
  findAll() {
    return [{ item: 'jacket', id: 1 }];
  }
}
