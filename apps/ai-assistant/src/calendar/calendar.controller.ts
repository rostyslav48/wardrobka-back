import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { CALENDAR_REQUESTS } from '@app/ai-assistant/constants';
import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { RequestType } from '@app/common/types';

import {
  CalendarAuthUrlResponse,
  CalendarCallbackResponse,
  CalendarStatusResponse,
} from './calendar.types';
import { CallbackParams, GoogleOAuthService } from './google-oauth.service';
import { GoogleTokenService } from './google-token.service';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class CalendarController {
  constructor(
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly googleTokenService: GoogleTokenService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(CALENDAR_REQUESTS.getAuthUrl)
  getAuthUrl(
    @Ctx() context: RmqContext,
    @Body() { user }: RequestType<void>,
  ): CalendarAuthUrlResponse {
    const url = this.googleOAuthService.buildAuthUrl(user.id);
    this.rmqService.ack(context);

    return { url };
  }

  // Public at the gateway: it is Google's browser that arrives here, with no
  // session. The signed `state` carries the account id instead.
  @MessagePattern(CALENDAR_REQUESTS.handleCallback)
  async handleCallback(
    @Ctx() context: RmqContext,
    @Body() { data }: RequestType<CallbackParams>,
  ): Promise<CalendarCallbackResponse> {
    const result = await this.googleOAuthService.handleCallback(data ?? {});
    this.rmqService.ack(context);

    return result;
  }

  @MessagePattern(CALENDAR_REQUESTS.getStatus)
  async getStatus(
    @Ctx() context: RmqContext,
    @Body() { user }: RequestType<void>,
  ): Promise<CalendarStatusResponse> {
    const status = await this.googleTokenService.getStatus(user.id);
    this.rmqService.ack(context);

    return { status };
  }

  @MessagePattern(CALENDAR_REQUESTS.disconnect)
  async disconnect(
    @Ctx() context: RmqContext,
    @Body() { user }: RequestType<void>,
  ): Promise<CalendarStatusResponse> {
    await this.googleTokenService.disconnect(user.id);
    this.rmqService.ack(context);

    return { status: 'disconnected' };
  }
}
