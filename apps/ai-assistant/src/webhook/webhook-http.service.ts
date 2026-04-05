import axios from 'axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';
import { decryptProtectedData } from '@app/common';
import { AssistantProtectedData } from '../types/protected-data.type';
import { AssistantWebhookPayload } from './webhook.types';

@Injectable()
export class WebhookHttpService {
  private readonly webhookUrl: string;
  private readonly authHeaderName: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserAccountEntity)
    private readonly accountRepository: Repository<UserAccountEntity>,
  ) {
    this.webhookUrl = this.configService.getOrThrow<string>(
      'AI_ASSISTANT_WEBHOOK_URL',
    );
    this.authHeaderName = this.configService.getOrThrow<string>(
      'AI_ASSISTANT_WEBHOOK_AUTH_HEADER',
    );
  }

  async sendPayload(accountId: number, payload: AssistantWebhookPayload) {
    const account = await this.accountRepository.findOneByOrFail({
      id: accountId,
    });

    const protectedData = decryptProtectedData<AssistantProtectedData>(
      account.protectedData,
      this.configService.getOrThrow<string>('PROTECTED_DATA_SECRET'),
    );

    if (!protectedData?.webhookKey) {
      throw new InternalServerErrorException('Webhook key is not configured');
    }

    await axios.post(this.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        [this.authHeaderName]: protectedData.webhookKey,
      },
      timeout: 10000,
    });
  }
}
