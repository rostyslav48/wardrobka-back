import { Inject, Injectable } from '@nestjs/common';
import { WARDROBE_SERVICE } from './constants/services';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class WardrobeApiGatewayService {
  constructor(@Inject(WARDROBE_SERVICE) private wardrobeClient: ClientProxy) {}

  getHello(): string {
    this.wardrobeClient.emit('wardrobe_hello', {
      hello: 'world',
    });

    return 'Hello World!';
  }
}
