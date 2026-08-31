jest.mock('@app/common', () => ({
  decryptProtectedData: jest.fn(),
  encryptProtectedData: jest.fn(),
  RmqService: jest.fn(),
  MicroserviceExceptionFilter: jest.fn(),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';

import {
  AssistantOutfitSuggestionEntity,
  AssistantSessionEntity,
} from '@app/common/database/entities/assistant';

import { ConversationService } from './conversation.service';

const makeSession = (
  id: string,
  accountId: number,
  topic = 'Test',
): AssistantSessionEntity =>
  ({ id, accountId, topic, createdAt: new Date() }) as AssistantSessionEntity;

const makeSuggestion = (
  id: string,
  session: AssistantSessionEntity,
  createdAt = new Date(),
): AssistantOutfitSuggestionEntity =>
  ({
    id,
    sessionId: session.id,
    session,
    summary: `summary-${id}`,
    wardrobeItemIds: [1, 2],
    extraMetadata: {},
    createdAt,
  }) as AssistantOutfitSuggestionEntity;

const makeQueryBuilder = (rows: AssistantOutfitSuggestionEntity[]) => {
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  } as unknown as SelectQueryBuilder<AssistantOutfitSuggestionEntity>;
  return qb;
};

describe('ConversationService — getOutfitSuggestions', () => {
  const accountId = 1;
  const otherAccountId = 2;

  let outfitRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  let service: ConversationService;

  beforeEach(() => {
    outfitRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    service = new ConversationService(
      {} as any,
      {} as any,
      outfitRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('returns only suggestions belonging to the authenticated user', async () => {
    const session = makeSession('s1', accountId);
    const suggestions = [
      makeSuggestion('a', session),
      makeSuggestion('b', session),
    ];
    const qb = makeQueryBuilder(suggestions);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getOutfitSuggestions(accountId);

    expect(qb.where).toHaveBeenCalledWith('session.accountId = :accountId', {
      accountId,
    });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[0].sessionTopic).toBe('Test');
  });

  it('returns suggestions in descending createdAt order', async () => {
    const session = makeSession('s1', accountId);
    const older = makeSuggestion('old', session, new Date('2024-01-01'));
    const newer = makeSuggestion('new', session, new Date('2024-06-01'));
    const qb = makeQueryBuilder([newer, older]);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getOutfitSuggestions(accountId);

    expect(qb.orderBy).toHaveBeenCalledWith('suggestion.createdAt', 'DESC');
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('old');
  });

  it('applies limit=5 and offset=0 correctly', async () => {
    const session = makeSession('s1', accountId);
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeSuggestion(`id-${i}`, session),
    );
    const qb = makeQueryBuilder(rows);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getOutfitSuggestions(accountId, 5, 0);

    expect(qb.limit).toHaveBeenCalledWith(5);
    expect(qb.offset).toHaveBeenCalledWith(0);
    expect(result).toHaveLength(5);
  });

  it('uses default limit of 20 when not specified', async () => {
    const session = makeSession('s1', accountId);
    const qb = makeQueryBuilder([makeSuggestion('x', session)]);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getOutfitSuggestions(accountId);

    expect(qb.limit).toHaveBeenCalledWith(20);
  });

  it('returns empty array when user has no suggestions', async () => {
    const qb = makeQueryBuilder([]);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getOutfitSuggestions(accountId);

    expect(result).toEqual([]);
  });

  it('does not return suggestions from other users — scoped by where clause', async () => {
    const otherSession = makeSession('s2', otherAccountId);
    const qb = makeQueryBuilder([]);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getOutfitSuggestions(accountId);

    expect(qb.where).toHaveBeenCalledWith('session.accountId = :accountId', {
      accountId,
    });
    expect(qb.where).not.toHaveBeenCalledWith(expect.anything(), {
      accountId: otherSession.accountId,
    });
  });
});

describe('ConversationService — deleteOutfitSuggestion', () => {
  const accountId = 1;
  const otherAccountId = 2;

  let outfitRepo: { findOne: jest.Mock; delete: jest.Mock };
  let service: ConversationService;

  beforeEach(() => {
    outfitRepo = { findOne: jest.fn(), delete: jest.fn() };

    service = new ConversationService(
      {} as any,
      {} as any,
      outfitRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('deletes suggestion when user owns the parent session', async () => {
    const session = makeSession('s1', accountId);
    const suggestion = makeSuggestion('sg1', session);
    outfitRepo.findOne.mockResolvedValue(suggestion);
    outfitRepo.delete.mockResolvedValue({ affected: 1 });

    await expect(
      service.deleteOutfitSuggestion(accountId, 'sg1'),
    ).resolves.toBeUndefined();

    expect(outfitRepo.delete).toHaveBeenCalledWith('sg1');
  });

  it('throws NotFoundException when suggestion does not exist', async () => {
    outfitRepo.findOne.mockResolvedValue(null);

    await expect(
      service.deleteOutfitSuggestion(accountId, 'missing'),
    ).rejects.toThrow(NotFoundException);

    expect(outfitRepo.delete).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when suggestion belongs to another user', async () => {
    const otherSession = makeSession('s2', otherAccountId);
    const suggestion = makeSuggestion('sg2', otherSession);
    outfitRepo.findOne.mockResolvedValue(suggestion);

    await expect(
      service.deleteOutfitSuggestion(accountId, 'sg2'),
    ).rejects.toThrow(ForbiddenException);

    expect(outfitRepo.delete).not.toHaveBeenCalled();
  });

  it('does not affect parent session when suggestion is deleted', async () => {
    const session = makeSession('s1', accountId);
    const suggestion = makeSuggestion('sg1', session);
    outfitRepo.findOne.mockResolvedValue(suggestion);
    outfitRepo.delete.mockResolvedValue({ affected: 1 });

    await service.deleteOutfitSuggestion(accountId, 'sg1');

    expect(outfitRepo.delete).toHaveBeenCalledWith('sg1');
    expect(outfitRepo.delete).not.toHaveBeenCalledWith('s1');
  });
});

describe('ConversationService — handleChat history replay', () => {
  const accountId = 1;
  const sessionId = 's1';

  let sessionRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock };
  let messageRepo: { find: jest.Mock; save: jest.Mock };
  let accountRepo: { findOne: jest.Mock };
  let contextBuilder: {
    fetchReferenceImageUrls: jest.Mock;
    fetchReferenceImageParts: jest.Mock;
    buildSeedSummary: jest.Mock;
    executeTool: jest.Mock;
  };
  let geminiClient: { generateChatResponse: jest.Mock };
  let webhookQueueService: { scheduleJob: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: ConversationService;

  beforeEach(() => {
    sessionRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: sessionId, accountId }),
      create: jest.fn(),
      save: jest.fn(),
    };
    messageRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest
        .fn()
        .mockResolvedValue({ id: 'm1', sessionId, role: 'assistant' }),
    };
    accountRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: accountId, name: 'Test', email: 't@e.com' }),
    };
    contextBuilder = {
      fetchReferenceImageUrls: jest.fn().mockResolvedValue([]),
      fetchReferenceImageParts: jest.fn().mockResolvedValue([]),
      buildSeedSummary: jest.fn().mockResolvedValue('Wardrobe summary'),
      executeTool: jest.fn().mockResolvedValue({ items: [] }),
    };
    geminiClient = {
      generateChatResponse: jest.fn().mockResolvedValue('assistant reply'),
    };
    webhookQueueService = { scheduleJob: jest.fn().mockResolvedValue(null) };
    configService = {
      get: jest.fn().mockReturnValue(10),
      getOrThrow: jest.fn(),
    };

    service = new ConversationService(
      sessionRepo as any,
      messageRepo as any,
      {} as any,
      accountRepo as any,
      contextBuilder as any,
      geminiClient as any,
      webhookQueueService as any,
      configService as any,
    );
  });

  it('loads the last N messages ordered chronologically, mapped to user/model roles', async () => {
    messageRepo.find.mockResolvedValue([
      { role: 'assistant', content: 'wear the red jacket', createdAt: 2 },
      { role: 'user', content: 'suggest a jacket', createdAt: 1 },
    ]);

    await service.handleChat(accountId, {
      prompt: 'and in blue?',
      sessionId,
    } as any);

    expect(messageRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId, role: expect.anything() },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    );

    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.history).toEqual([
      { role: 'user', text: 'suggest a jacket' },
      { role: 'model', text: 'wear the red jacket' },
    ]);
  });

  it('reads the history limit from config (AI_HISTORY_MESSAGE_LIMIT)', async () => {
    configService.get.mockReturnValue(3);

    await service.handleChat(accountId, {
      prompt: 'hi',
      sessionId,
    } as any);

    expect(configService.get).toHaveBeenCalledWith(
      'AI_HISTORY_MESSAGE_LIMIT',
      10,
    );
    expect(messageRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it('excludes system-role messages from the query', async () => {
    await service.handleChat(accountId, {
      prompt: 'hi',
      sessionId,
    } as any);

    const where = messageRepo.find.mock.calls[0][0].where;
    expect(where.role.value).toEqual(
      expect.arrayContaining(['user', 'assistant']),
    );
    expect(where.role.value).not.toContain('system');
  });

  it('resolves reference images and never passes an image URL as prompt text', async () => {
    contextBuilder.fetchReferenceImageUrls.mockResolvedValue([
      'https://signed.example.com/a.jpg',
    ]);
    contextBuilder.fetchReferenceImageParts.mockResolvedValue([
      { mimeType: 'image/jpeg', data: 'ZmFrZQ==' },
    ]);

    await service.handleChat(accountId, {
      prompt: 'what do you think of this',
      sessionId,
      referenceImageKeys: ['items/a.jpg'],
    } as any);

    expect(contextBuilder.fetchReferenceImageParts).toHaveBeenCalledWith([
      'https://signed.example.com/a.jpg',
    ]);
    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.referenceImages).toEqual([
      { mimeType: 'image/jpeg', data: 'ZmFrZQ==' },
    ]);
    expect(call.prompt).not.toContain('https://signed.example.com/a.jpg');
  });

  it('passes the seed summary and a tool executor instead of pre-fetched context', async () => {
    await service.handleChat(accountId, {
      prompt: 'what should I wear',
      sessionId,
    } as any);

    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.seedSummary).toBe('Wardrobe summary');
    expect(typeof call.executeTool).toBe('function');
    expect(call).not.toHaveProperty('wardrobeItems');
    expect(call).not.toHaveProperty('activeWardrobeItems');
    expect(call).not.toHaveProperty('weather');
  });

  it('binds the signed-in account into the tool executor', async () => {
    await service.handleChat(accountId, {
      prompt: 'what should I wear',
      sessionId,
    } as any);

    const { executeTool } = geminiClient.generateChatResponse.mock.calls[0][0];
    await executeTool('search_wardrobe', { type: 'jacket' });

    expect(contextBuilder.executeTool).toHaveBeenCalledWith(
      'search_wardrobe',
      { type: 'jacket' },
      { id: accountId, name: 'Test', email: 't@e.com' },
    );
  });
});
