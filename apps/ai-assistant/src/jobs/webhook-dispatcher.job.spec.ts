import { ConfigService } from '@nestjs/config';

import { ErrorLoggerService } from '@app/logger';
import { AssistantWebhookJobEntity } from '@app/common/database/entities/assistant';

import { WebhookQueueService } from '../services/webhook-queue.service';
import { WebhookHttpService } from '../webhook/webhook-http.service';
import { WebhookDispatcherJob } from './webhook-dispatcher.job';

const makeJob = (
  overrides: Partial<AssistantWebhookJobEntity> = {},
): AssistantWebhookJobEntity =>
  ({
    id: 'job-1',
    accountId: 7,
    payload: {},
    status: 'processing',
    attemptCount: 1,
    ...overrides,
  }) as AssistantWebhookJobEntity;

describe('WebhookDispatcherJob', () => {
  let queueService: jest.Mocked<
    Pick<WebhookQueueService, 'takeNextJob' | 'markSucceeded' | 'markFailed'>
  >;
  let webhookHttpService: jest.Mocked<Pick<WebhookHttpService, 'sendPayload'>>;
  let errorLogger: jest.Mocked<
    Pick<ErrorLoggerService, 'warn' | 'error' | 'fatal'>
  >;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  const build = (maxAttempts = 5) => {
    configService = { get: jest.fn().mockReturnValue(maxAttempts) };
    queueService = {
      takeNextJob: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    webhookHttpService = { sendPayload: jest.fn() };
    errorLogger = { warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };

    return new WebhookDispatcherJob(
      queueService as unknown as WebhookQueueService,
      webhookHttpService as unknown as WebhookHttpService,
      errorLogger as unknown as ErrorLoggerService,
      configService as unknown as ConfigService,
    );
  };

  it('logs error (not fatal) when delivery fails below the max attempt count', async () => {
    const job = makeJob({ attemptCount: 2 });
    const failure = new Error('ECONNREFUSED');
    const dispatcher = build(5);
    queueService.takeNextJob
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    webhookHttpService.sendPayload.mockRejectedValueOnce(failure);

    await dispatcher.handleQueue();

    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'ECONNREFUSED',
        errorName: 'Error',
        accountId: 7,
        meta: { jobId: 'job-1', attemptCount: 2 },
      }),
    );
    expect(errorLogger.fatal).not.toHaveBeenCalled();
    expect(queueService.markFailed).toHaveBeenCalledWith(job, failure);
  });

  it('escalates to fatal once attemptCount reaches WEBHOOK_MAX_ATTEMPTS', async () => {
    const job = makeJob({ attemptCount: 5 });
    const failure = new Error('timeout');
    const dispatcher = build(5);
    queueService.takeNextJob
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    webhookHttpService.sendPayload.mockRejectedValueOnce(failure);

    await dispatcher.handleQueue();

    expect(errorLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'timeout',
        accountId: 7,
        meta: { jobId: 'job-1', attemptCount: 5 },
      }),
    );
    expect(errorLogger.error).not.toHaveBeenCalled();
  });

  it('does not log anything when delivery succeeds', async () => {
    const job = makeJob();
    const dispatcher = build(5);
    queueService.takeNextJob
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    webhookHttpService.sendPayload.mockResolvedValueOnce(undefined);

    await dispatcher.handleQueue();

    expect(errorLogger.error).not.toHaveBeenCalled();
    expect(errorLogger.fatal).not.toHaveBeenCalled();
    expect(queueService.markSucceeded).toHaveBeenCalledWith('job-1');
  });
});
