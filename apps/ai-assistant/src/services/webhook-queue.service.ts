import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { AssistantWebhookJobEntity } from '@app/common/database/entities/assistant';
import { AssistantWebhookPayload } from '../webhook/webhook.types';

@Injectable()
export class WebhookQueueService {
  private readonly maxAttempts: number;
  private readonly retryIntervalMs: number;

  constructor(
    @InjectRepository(AssistantWebhookJobEntity)
    private readonly jobRepository: Repository<AssistantWebhookJobEntity>,
    private readonly configService: ConfigService,
  ) {
    this.maxAttempts = Number(
      this.configService.get<number>('WEBHOOK_MAX_ATTEMPTS', 5),
    );
    this.retryIntervalMs = Number(
      this.configService.get<number>('WEBHOOK_RETRY_INTERVAL_MS', 60000),
    );
  }

  async scheduleJob(accountId: number, payload: AssistantWebhookPayload) {
    const job = this.jobRepository.create({
      accountId,
      payload,
      status: 'pending',
      attemptCount: 0,
      scheduledAt: new Date(),
    });

    return this.jobRepository.save(job);
  }

  async takeNextJob(): Promise<AssistantWebhookJobEntity | null> {
    const job = await this.jobRepository.findOne({
      where: {
        status: 'pending',
        scheduledAt: LessThanOrEqual(new Date()),
      },
      order: { createdAt: 'ASC' },
    });

    if (!job) {
      return null;
    }

    job.status = 'processing';
    job.attemptCount += 1;
    job.processedAt = new Date();

    return this.jobRepository.save(job);
  }

  async markSucceeded(jobId: string) {
    await this.jobRepository.update(jobId, {
      status: 'succeeded',
      lastError: null,
    });
  }

  async markFailed(job: AssistantWebhookJobEntity, error: Error) {
    const truncatedError = error.message?.slice(0, 500) ?? 'Unknown error';

    if (job.attemptCount >= this.maxAttempts) {
      job.status = 'failed';
      job.lastError = truncatedError;
      await this.jobRepository.save(job);
      return;
    }

    job.status = 'pending';
    job.lastError = truncatedError;
    job.scheduledAt = new Date(Date.now() + this.retryIntervalMs);
    await this.jobRepository.save(job);
  }
}
