import { Injectable } from '@nestjs/common';

@Injectable()
export class WardrobeService {
  getHello(): string {
    return 'Hello World!';
  }
}
