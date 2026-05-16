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
