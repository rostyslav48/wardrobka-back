import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { ErrorLoggerService } from '@app/logger';

import { WebhookQueueService } from '../services/webhook-queue.service';
import { WebhookHttpService } from '../webhook/webhook-http.service';
import { AssistantWebhookPayload } from '../webhook/webhook.types';

const DEFAULT_WEBHOOK_MAX_ATTEMPTS = 5;

@Injectable()
export class WebhookDispatcherJob {
  private readonly logger = new Logger(WebhookDispatcherJob.name);
  private readonly maxAttempts: number;
  private running = false;

  constructor(
    private readonly queueService: WebhookQueueService,
    private readonly webhookHttpService: WebhookHttpService,
    private readonly errorLogger: ErrorLoggerService,
    configService: ConfigService,
  ) {
    this.maxAttempts = Number(
      configService.get<number>(
        'WEBHOOK_MAX_ATTEMPTS',
        DEFAULT_WEBHOOK_MAX_ATTEMPTS,
      ),
    );
  }

  @Interval(10000)
  async handleQueue() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      while (true) {
        const job = await this.queueService.takeNextJob();
        if (!job) {
          break;
        }

        try {
          await this.webhookHttpService.sendPayload(
            job.accountId,
            job.payload as AssistantWebhookPayload,
          );
          await this.queueService.markSucceeded(job.id);
        } catch (error) {
          this.logger.warn(`Webhook delivery failed: ${error.message}`);

          const severity =
            job.attemptCount >= this.maxAttempts ? 'fatal' : 'error';
          this.errorLogger[severity]({
            context: WebhookDispatcherJob.name,
            message: error.message,
            errorName: error.name,
            stack: error.stack,
            accountId: job.accountId,
            meta: { jobId: job.id, attemptCount: job.attemptCount },
          });

          await this.queueService.markFailed(job, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
