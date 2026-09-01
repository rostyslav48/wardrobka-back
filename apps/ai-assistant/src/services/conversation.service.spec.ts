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

  it('surfaces extraMetadata.proposed on the DTO so fallback rows are distinguishable', async () => {
    const session = makeSession('s1', accountId);
    const proposedRow = {
      ...makeSuggestion('proposed', session),
      extraMetadata: { proposed: true },
    };
    const fallbackRow = {
      ...makeSuggestion('fallback', session),
      extraMetadata: { proposed: false },
    };
    const legacyRow = makeSuggestion('legacy', session);
    const qb = makeQueryBuilder([proposedRow, fallbackRow, legacyRow]);
    outfitRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getOutfitSuggestions(accountId);

    expect(result.find((r) => r.id === 'proposed')?.proposed).toBe(true);
    expect(result.find((r) => r.id === 'fallback')?.proposed).toBe(false);
    expect(result.find((r) => r.id === 'legacy')?.proposed).toBeUndefined();
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
  let outfitRepo: { save: jest.Mock };
  let accountRepo: { findOne: jest.Mock };
  let contextBuilder: {
    fetchReferenceImageUrls: jest.Mock;
    fetchReferenceImageParts: jest.Mock;
    buildSeedSummary: jest.Mock;
    executeTool: jest.Mock;
    isCalendarConnected: jest.Mock;
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
    outfitRepo = {
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: 'suggestion-1',
          createdAt: new Date('2026-01-01'),
          ...entity,
        }),
      ),
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
      isCalendarConnected: jest.fn().mockResolvedValue(false),
    };
    geminiClient = {
      generateChatResponse: jest
        .fn()
        .mockResolvedValue({ text: 'assistant reply' }),
    };
    webhookQueueService = { scheduleJob: jest.fn().mockResolvedValue(null) };
    configService = {
      get: jest.fn().mockReturnValue(10),
      getOrThrow: jest.fn(),
    };

    service = new ConversationService(
      sessionRepo as any,
      messageRepo as any,
      outfitRepo as any,
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

  it('passes the calendar connection state from ContextBuilderService through to the model call', async () => {
    contextBuilder.isCalendarConnected.mockResolvedValue(true);

    await service.handleChat(accountId, {
      prompt: 'what should I wear',
      sessionId,
    } as any);

    expect(contextBuilder.isCalendarConnected).toHaveBeenCalledWith(accountId);
    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.calendarConnected).toBe(true);
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

  it('a non-outfit answer creates no suggestion row and carries none in the webhook payload', async () => {
    await service.handleChat(accountId, {
      prompt: 'how do I remove a stain',
      sessionId,
    } as any);

    expect(outfitRepo.save).not.toHaveBeenCalled();
    const payload = webhookQueueService.scheduleJob.mock.calls[0][1];
    expect(payload.suggestion).toBeUndefined();
  });

  it('a propose_outfit result writes the suggestion linked to the assistant message and carries it in the webhook payload', async () => {
    geminiClient.generateChatResponse.mockResolvedValue({
      text: 'Wear the navy blazer with chinos',
      outfitProposal: {
        summary: 'Wear the navy blazer with chinos',
        itemIds: [1, 2],
        rationale: 'mild and dry today',
      },
    });

    const result = await service.handleChat(accountId, {
      prompt: 'what should I wear today',
      sessionId,
    } as any);

    expect(outfitRepo.save).toHaveBeenCalledWith({
      sessionId,
      messageId: 'm1',
      summary: 'Wear the navy blazer with chinos',
      wardrobeItemIds: [1, 2],
      extraMetadata: { rationale: 'mild and dry today' },
    });

    const payload = webhookQueueService.scheduleJob.mock.calls[0][1];
    expect(payload.suggestion).toEqual(
      expect.objectContaining({
        id: 'suggestion-1',
        sessionId,
        messageId: 'm1',
        summary: 'Wear the navy blazer with chinos',
        wardrobeItemIds: [1, 2],
      }),
    );
    expect(result.outfitSuggestionId).toBe('suggestion-1');
  });
});

describe('ConversationService — handleOutfitSuggestion', () => {
  const accountId = 1;
  const sessionId = 's1';

  let sessionRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock };
  let messageRepo: { find: jest.Mock; save: jest.Mock };
  let outfitRepo: { save: jest.Mock };
  let accountRepo: { findOne: jest.Mock };
  let contextBuilder: {
    fetchReferenceImageUrls: jest.Mock;
    fetchReferenceImageParts: jest.Mock;
    buildSeedSummary: jest.Mock;
    executeTool: jest.Mock;
    fetchWardrobeItems: jest.Mock;
    fetchWeatherForAccount: jest.Mock;
    fetchRecentlyWorn: jest.Mock;
    isCalendarConnected: jest.Mock;
  };
  let geminiClient: { generateChatResponse: jest.Mock };
  let webhookQueueService: { scheduleJob: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: ConversationService;

  const dto = {
    sessionId,
    occasion: 'wedding',
    styleHint: 'formal',
    season: 'summer',
    wardrobeItemIds: [10, 11],
  } as any;

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
    outfitRepo = {
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: 'suggestion-1',
          createdAt: new Date('2026-01-01'),
          ...entity,
        }),
      ),
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
      fetchWardrobeItems: jest.fn(),
      fetchWeatherForAccount: jest.fn(),
      fetchRecentlyWorn: jest.fn(),
      isCalendarConnected: jest.fn().mockResolvedValue(false),
    };
    geminiClient = {
      generateChatResponse: jest.fn().mockResolvedValue({
        text: 'Wear the navy suit',
        outfitProposal: {
          summary: 'Wear the navy suit',
          itemIds: [10, 12],
          rationale: 'matches the formal dress code',
        },
      }),
    };
    webhookQueueService = { scheduleJob: jest.fn().mockResolvedValue(null) };
    configService = {
      get: jest.fn().mockReturnValue(10),
      getOrThrow: jest.fn(),
    };

    service = new ConversationService(
      sessionRepo as any,
      messageRepo as any,
      outfitRepo as any,
      accountRepo as any,
      contextBuilder as any,
      geminiClient as any,
      webhookQueueService as any,
      configService as any,
    );
  });

  it('uses the same tool loop and executor binding as handleChat, never touching ContextBuilderService fetch helpers directly', async () => {
    await service.handleOutfitSuggestion(accountId, dto);

    expect(geminiClient.generateChatResponse).toHaveBeenCalledTimes(1);
    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(typeof call.executeTool).toBe('function');
    expect(contextBuilder.fetchWardrobeItems).not.toHaveBeenCalled();
    expect(contextBuilder.fetchWeatherForAccount).not.toHaveBeenCalled();
    expect(contextBuilder.fetchRecentlyWorn).not.toHaveBeenCalled();

    await call.executeTool('search_wardrobe', { type: 'jacket' });
    expect(contextBuilder.executeTool).toHaveBeenCalledWith(
      'search_wardrobe',
      { type: 'jacket' },
      { id: accountId, name: 'Test', email: 't@e.com' },
    );
  });

  it('passes the calendar connection state from ContextBuilderService through to the model call', async () => {
    contextBuilder.isCalendarConnected.mockResolvedValue(true);

    await service.handleOutfitSuggestion(accountId, dto);

    expect(contextBuilder.isCalendarConnected).toHaveBeenCalledWith(accountId);
    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.calendarConnected).toBe(true);
  });

  it('conveys occasion, styleHint and season as plain text in the seeded user turn, not a bespoke prompt object', async () => {
    await service.handleOutfitSuggestion(accountId, dto);

    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(typeof call.prompt).toBe('string');
    expect(call.prompt).toContain('wedding');
    expect(call.prompt).toContain('formal');
    expect(call.prompt).toContain('summer');
    expect(call).not.toHaveProperty('occasion');
    expect(call).not.toHaveProperty('styleHint');
    expect(call).not.toHaveProperty('season');
  });

  it('sends the propose_outfit nudge to the model only via additionalInstruction, never inside the persisted prompt text', async () => {
    await service.handleOutfitSuggestion(accountId, dto);

    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.additionalInstruction).toEqual(
      expect.stringContaining('propose_outfit'),
    );
    expect(call.prompt).not.toContain('propose_outfit');
  });

  it('seeds wardrobeItemIds from the request as contextItemIds, the same mechanism chat uses for attached items', async () => {
    await service.handleOutfitSuggestion(accountId, dto);

    const call = geminiClient.generateChatResponse.mock.calls[0][0];
    expect(call.contextItemIds).toEqual([10, 11]);
  });

  it('a successful propose_outfit writes a suggestion linked to the assistant message, using the model-confirmed item ids', async () => {
    const result = await service.handleOutfitSuggestion(accountId, dto);

    expect(outfitRepo.save).toHaveBeenCalledWith({
      sessionId,
      messageId: 'm1',
      summary: 'Wear the navy suit',
      wardrobeItemIds: [10, 12],
      extraMetadata: {
        occasion: 'wedding',
        styleHint: 'formal',
        season: 'summer',
        proposed: true,
        rationale: 'matches the formal dress code',
      },
    });

    const payload = webhookQueueService.scheduleJob.mock.calls[0][1];
    expect(payload).toEqual({
      type: 'outfit',
      sessionId,
      summary: 'Wear the navy suit',
      wardrobeItemIds: [10, 12],
      metadata: {
        occasion: 'wedding',
        styleHint: 'formal',
        season: 'summer',
        proposed: true,
        rationale: 'matches the formal dress code',
      },
    });
    expect(result).toEqual({ sessionId, outfitSuggestionId: 'suggestion-1' });
  });

  it('falls back to the request wardrobeItemIds and the plain text answer when the model never calls propose_outfit, flagging the row as unproposed', async () => {
    geminiClient.generateChatResponse.mockResolvedValue({
      text: 'I need more details before I can suggest a full outfit.',
    });

    const result = await service.handleOutfitSuggestion(accountId, dto);

    expect(outfitRepo.save).toHaveBeenCalledWith({
      sessionId,
      messageId: 'm1',
      summary: 'I need more details before I can suggest a full outfit.',
      wardrobeItemIds: [10, 11],
      extraMetadata: {
        occasion: 'wedding',
        styleHint: 'formal',
        season: 'summer',
        proposed: false,
      },
    });
    expect(result.outfitSuggestionId).toBe('suggestion-1');
  });

  it('saves the seeded prompt as the user turn message before calling the model, without the internal propose_outfit instruction', async () => {
    await service.handleOutfitSuggestion(accountId, dto);

    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        role: 'user',
        content: expect.stringContaining('wedding'),
      }),
    );

    const savedMessage = messageRepo.save.mock.calls[0][0];
    expect(savedMessage.content).not.toContain('propose_outfit');
  });
});
