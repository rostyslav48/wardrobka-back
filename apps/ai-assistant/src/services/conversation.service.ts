import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import {
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantSessionEntity,
} from '@app/common/database/entities/assistant';
import { UserAccountEntity } from '@app/common/database/entities/auth';
import {
  AssistantMessageDto,
  AssistantSessionDto,
  ChatRequestDto,
  GenerateOutfitRequestDto,
} from '@app/ai-assistant/dto';
import { UserAccountPreview } from '@app/auth/users/types';
import { AssistantProtectedData } from '../types/protected-data.type';

import { decryptProtectedData, encryptProtectedData } from '@app/common';

import { ContextBuilderService } from './context-builder.service';
import { GeminiClientService } from './gemini-client.service';
import { WebhookQueueService } from './webhook-queue.service';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(AssistantSessionEntity)
    private readonly sessionRepository: Repository<AssistantSessionEntity>,
    @InjectRepository(AssistantMessageEntity)
    private readonly messageRepository: Repository<AssistantMessageEntity>,
    @InjectRepository(AssistantOutfitSuggestionEntity)
    private readonly outfitRepository: Repository<AssistantOutfitSuggestionEntity>,
    @InjectRepository(UserAccountEntity)
    private readonly accountRepository: Repository<UserAccountEntity>,
    private readonly contextBuilder: ContextBuilderService,
    private readonly geminiClient: GeminiClientService,
    private readonly webhookQueueService: WebhookQueueService,
    private readonly configService: ConfigService,
  ) {}

  async handleChat(accountId: number, dto: ChatRequestDto) {
    const accountPreview = await this.getAccountPreview(accountId);
    const session = await this.resolveSession(
      accountId,
      dto.sessionId,
      dto.topic ?? this.deriveTopic(dto.prompt),
    );

    const context = await this.contextBuilder.buildContext(accountPreview, {
      contextItemIds: dto.contextItemIds,
      referenceImageKeys: dto.referenceImageKeys,
    });

    await this.messageRepository.save({
      sessionId: session.id,
      role: 'user',
      content: dto.prompt,
      attachments: context.referenceImageUrls,
    });

    const response = await this.geminiClient.generateChatResponse({
      prompt: dto.prompt,
      wardrobeItems: context.wardrobeItems,
      referenceImageUrls: context.referenceImageUrls,
    });

    const assistantMessage = await this.messageRepository.save({
      sessionId: session.id,
      role: 'assistant',
      content: response,
    });

    await this.webhookQueueService.scheduleJob(accountId, {
      type: 'chat',
      sessionId: session.id,
      message: plainToInstance(AssistantMessageDto, assistantMessage, {
        excludeExtraneousValues: true,
      }),
    });

    return {
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
    };
  }

  async handleOutfitSuggestion(
    accountId: number,
    dto: GenerateOutfitRequestDto,
  ) {
    const session = await this.resolveSession(
      accountId,
      dto.sessionId,
      dto.occasion,
    );

    const accountPreview = await this.getAccountPreview(accountId);

    const wardrobeItems = await this.contextBuilder.fetchWardrobeItems(
      accountPreview,
      dto.wardrobeItemIds,
    );

    const summary = await this.geminiClient.generateOutfitSummary({
      occasion: dto.occasion,
      styleHint: dto.styleHint,
      season: dto.season,
      wardrobeItems,
    });

    await this.messageRepository.save({
      sessionId: session.id,
      role: 'assistant',
      content: summary,
    });

    const outfit = await this.outfitRepository.save({
      sessionId: session.id,
      summary,
      wardrobeItemIds: dto.wardrobeItemIds,
      extraMetadata: {
        occasion: dto.occasion,
        styleHint: dto.styleHint,
        season: dto.season,
      },
    });

    await this.webhookQueueService.scheduleJob(accountId, {
      type: 'outfit',
      sessionId: session.id,
      summary,
      wardrobeItemIds: dto.wardrobeItemIds,
      metadata: outfit.extraMetadata,
    });

    return {
      sessionId: session.id,
      outfitSuggestionId: outfit.id,
    };
  }

  async getSessions(accountId: number): Promise<AssistantSessionDto[]> {
    const sessions = await this.sessionRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      sessions.map(async (session) => {
        const latestMessage = await this.messageRepository.findOne({
          where: { sessionId: session.id },
          order: { createdAt: 'DESC' },
        });

        return plainToInstance(
          AssistantSessionDto,
          {
            ...session,
            latestMessage: latestMessage
              ? plainToInstance(AssistantMessageDto, latestMessage, {
                  excludeExtraneousValues: true,
                })
              : undefined,
          },
          { excludeExtraneousValues: true },
        );
      }),
    );
  }

  async getSessionMessages(accountId: number, sessionId: string) {
    await this.ensureSessionOwnership(accountId, sessionId);

    const messages = await this.messageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    return plainToInstance(AssistantMessageDto, messages, {
      excludeExtraneousValues: true,
    });
  }

  async upsertWebhookKey(accountId: number, webhookKey: string) {
    const protectedDataSecret = this.configService.getOrThrow<string>(
      'PROTECTED_DATA_SECRET',
    );
    const account = await this.accountRepository.findOneByOrFail({
      id: accountId,
    });
    const protectedData = (decryptProtectedData<AssistantProtectedData>(
      account.protectedData,
      protectedDataSecret,
    ) || {}) as AssistantProtectedData;

    protectedData.webhookKey = webhookKey;

    account.protectedData = encryptProtectedData(
      protectedData as unknown as Record<string, unknown>,
      protectedDataSecret,
    );

    await this.accountRepository.save(account);
    return { status: 'ok' };
  }

  private async getAccountPreview(
    accountId: number,
  ): Promise<UserAccountPreview> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: ['id', 'name', 'email'],
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return {
      id: account.id,
      name: account.name,
      email: account.email,
    };
  }

  private async resolveSession(
    accountId: number,
    sessionId?: string,
    topic?: string,
  ) {
    if (sessionId) {
      return this.ensureSessionOwnership(accountId, sessionId);
    }

    const session = this.sessionRepository.create({
      accountId,
      topic: topic ?? 'Wardrobe Assistant',
    });

    return this.sessionRepository.save(session);
  }

  private async ensureSessionOwnership(accountId: number, sessionId: string) {
    const session = await this.sessionRepository.findOneBy({
      id: sessionId,
      accountId,
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  private deriveTopic(prompt: string) {
    return prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
  }
}
