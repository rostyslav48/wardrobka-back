import {
  Controller,
  Delete,
  Get,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';

import { CALENDAR_FALLBACK_APP_REDIRECT } from '@app/ai-assistant/constants';
import { UserAccountPreview } from '@app/auth/users/types';
import { CurrentUser, Public } from '@app/wardrobe-api-gateway/auth/decorators';

import { CalendarService } from './calendar.service';

class OccasionsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  days?: number;
}

@Controller('calendar')
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

  constructor(private readonly calendarService: CalendarService) {}

  @Get('status')
  getStatus(@CurrentUser() user: UserAccountPreview) {
    return this.calendarService.getStatus(user);
  }

  @Get('google/auth-url')
  getAuthUrl(@CurrentUser() user: UserAccountPreview) {
    return this.calendarService.getAuthUrl(user);
  }

  /**
   * Google's redirect target. @Public() sits on the *handler* — on the class
   * it would do nothing, because AuthGuard reads the metadata off
   * context.getHandler().
   *
   * Query params are pulled out one at a time rather than bound to a DTO: the
   * global ValidationPipe runs with forbidNonWhitelisted, and Google appends
   * authuser, hd and prompt, every one of which would 400 the callback.
   *
   * Every outcome is a 302 back into the app; this endpoint never renders.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get('google/callback')
  async handleCallback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('scope') scope?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    let redirectUrl = `${CALENDAR_FALLBACK_APP_REDIRECT}?status=error`;

    try {
      const result = await this.calendarService.handleCallback({
        code,
        state,
        scope,
        error,
      });
      redirectUrl = result?.redirectUrl ?? redirectUrl;
    } catch (err) {
      // Even an unreachable ai-assistant must land the browser back in the
      // app: inside ASWebAuthenticationSession an error page has no way out.
      this.logger.warn(
        `Google Calendar callback could not be processed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    res.redirect(302, redirectUrl);
  }

  @Delete('google')
  disconnect(@CurrentUser() user: UserAccountPreview) {
    return this.calendarService.disconnect(user);
  }

  @Get('occasions')
  getOccasions(
    @Query() query: OccasionsQuery,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.calendarService.getOccasions(user, query.days);
  }
}
