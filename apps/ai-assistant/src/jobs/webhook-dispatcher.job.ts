import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { WebhookQueueService } from '../services/webhook-queue.service';
import { WebhookHttpService } from '../webhook/webhook-http.service';
import { AssistantWebhookPayload } from '../webhook/webhook.types';

@Injectable()
export class WebhookDispatcherJob {
  private readonly logger = new Logger(WebhookDispatcherJob.name);
  private running = false;

  constructor(
    private readonly queueService: WebhookQueueService,
    private readonly webhookHttpService: WebhookHttpService,
  ) {}

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
          await this.queueService.markFailed(job, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
