import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import {
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantSessionEntity,
} from '@app/common/database/entities/assistant';
import { UserAccountEntity } from '@app/common/database/entities/auth';
import {
  AssistantMessageDto,
  AssistantOutfitSuggestionDto,
  AssistantSessionDto,
  ChatRequestDto,
  GenerateOutfitRequestDto,
  RecentSuggestionDto,
} from '@app/ai-assistant/dto';
import { UserAccountPreview } from '@app/auth/users/types';
import { AssistantProtectedData } from '../types/protected-data.type';

import { decryptProtectedData, encryptProtectedData } from '@app/common';

import { ContextBuilderService } from './context-builder.service';
import {
  ChatHistoryMessage,
  GeminiClientService,
} from './gemini-client.service';
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

    const [referenceImageUrls, history, seedSummary] = await Promise.all([
      this.contextBuilder.fetchReferenceImageUrls(dto.referenceImageKeys),
      this.loadChatHistory(session.id),
      this.contextBuilder.buildSeedSummary(accountPreview),
    ]);

    const referenceImages =
      await this.contextBuilder.fetchReferenceImageParts(referenceImageUrls);

    await this.messageRepository.save({
      sessionId: session.id,
      role: 'user',
      content: dto.prompt,
      attachments: referenceImageUrls,
    });

    const response = await this.geminiClient.generateChatResponse({
      prompt: dto.prompt,
      history,
      referenceImages,
      seedSummary,
      contextItemIds: dto.contextItemIds,
      // accountId is bound here, not declared as a tool parameter, so the model
      // cannot address another user's wardrobe whatever arguments it emits.
      executeTool: (name, args) =>
        this.contextBuilder.executeTool(name, args, accountPreview),
    });

    const assistantMessage = await this.messageRepository.save({
      sessionId: session.id,
      role: 'assistant',
      content: response.text,
    });

    let suggestionDto: AssistantOutfitSuggestionDto | undefined;

    if (response.outfitProposal) {
      const suggestion = await this.outfitRepository.save({
        sessionId: session.id,
        messageId: assistantMessage.id,
        summary: response.outfitProposal.summary,
        wardrobeItemIds: response.outfitProposal.itemIds,
        extraMetadata: { rationale: response.outfitProposal.rationale },
      });

      suggestionDto = plainToInstance(
        AssistantOutfitSuggestionDto,
        suggestion,
        { excludeExtraneousValues: true },
      );
    }

    await this.webhookQueueService.scheduleJob(accountId, {
      type: 'chat',
      sessionId: session.id,
      message: plainToInstance(AssistantMessageDto, assistantMessage, {
        excludeExtraneousValues: true,
      }),
      suggestion: suggestionDto,
    });

    return {
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
      outfitSuggestionId: suggestionDto?.id,
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

    // Phase 4 moves this path onto the tool loop as well; until then it fetches
    // the pieces the deleted prompt-assembly helper used to bundle, minus the
    // capped active-items dump that went away with the 50-item cap.
    const [wardrobeItems, weather, recentlyWorn] = await Promise.all([
      this.contextBuilder.fetchWardrobeItems(
        accountPreview,
        dto.wardrobeItemIds,
      ),
      this.contextBuilder.fetchWeatherForAccount(accountId),
      this.contextBuilder.fetchRecentlyWorn(accountPreview),
    ]);

    const summary = await this.geminiClient.generateOutfitSummary({
      occasion: dto.occasion,
      styleHint: dto.styleHint,
      season: dto.season,
      wardrobeItems,
      weather,
      recentlyWorn,
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

  async getRecentSuggestions(
    accountId: number,
    limit = 10,
  ): Promise<RecentSuggestionDto[]> {
    const suggestions = await this.outfitRepository
      .createQueryBuilder('suggestion')
      .leftJoinAndSelect('suggestion.session', 'session')
      .where('session.accountId = :accountId', { accountId })
      .orderBy('suggestion.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    return suggestions.map((s) =>
      plainToInstance(
        RecentSuggestionDto,
        { ...s, sessionTopic: s.session?.topic ?? '' },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async getOutfitSuggestions(
    accountId: number,
    limit = 20,
    offset = 0,
  ): Promise<RecentSuggestionDto[]> {
    const suggestions = await this.outfitRepository
      .createQueryBuilder('suggestion')
      .leftJoinAndSelect('suggestion.session', 'session')
      .where('session.accountId = :accountId', { accountId })
      .orderBy('suggestion.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return suggestions.map((s) =>
      plainToInstance(
        RecentSuggestionDto,
        { ...s, sessionTopic: s.session?.topic ?? '' },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async deleteOutfitSuggestion(accountId: number, id: string): Promise<void> {
    const suggestion = await this.outfitRepository.findOne({
      where: { id },
      relations: ['session'],
    });

    if (!suggestion) {
      throw new NotFoundException('Outfit suggestion not found');
    }

    if (suggestion.session.accountId !== accountId) {
      throw new ForbiddenException('Access denied');
    }

    await this.outfitRepository.delete(id);
  }

  private deriveTopic(prompt: string) {
    return prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
  }

  private async loadChatHistory(
    sessionId: string,
  ): Promise<ChatHistoryMessage[]> {
    const limit = this.configService.get<number>(
      'AI_HISTORY_MESSAGE_LIMIT',
      10,
    );

    const messages = await this.messageRepository.find({
      where: { sessionId, role: In(['user', 'assistant']) },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return messages.reverse().map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      text: message.content,
    }));
  }
}
