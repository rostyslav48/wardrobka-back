import { ConflictException } from '@nestjs/common';
import { LessThan } from 'typeorm';

import { WardrobeService } from './wardrobe.service';
import { ApplyGeneratedImageOutcome, ImageStatus } from '@app/wardrobe/enums';
import {
  IMAGE_GENERATION_STALE_AFTER_MS,
  IMAGE_ORIGINAL_EXPIRED_CODE,
} from '@app/wardrobe/constants';
import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe';

// Everything the Phase 3 failure/retry paths touch, and nothing else: these
// tests are about which row state and which S3 object survive each outcome.
function buildService() {
  const wardrobeItemRepository = {
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    exists: jest.fn(async () => true),
    save: jest.fn(async (item: WardrobeItemEntity) => item),
    update: jest.fn<Promise<{ affected: number }>, [any, any]>(async () => ({
      affected: 0,
    })),
  };
  const entityManager = {
    query: jest.fn<Promise<any[]>, [string, any[]]>(async () => []),
  };
  const mediaStorageService = {
    store: jest.fn(),
    delete: jest.fn(async () => true),
    exists: jest.fn(async () => true),
    getUrls: jest.fn(async () => ({})),
  };
  const emitted: { pattern: string; payload: any }[] = [];
  const aiAssistantClient = {
    emit: jest.fn((pattern: string, payload: any) => {
      emitted.push({ pattern, payload });
      return { subscribe: jest.fn() };
    }),
  };

  const service = new WardrobeService(
    entityManager as any,
    wardrobeItemRepository as any,
    {} as any,
    mediaStorageService as any,
    { getOrThrow: () => 'user-images' } as any,
    aiAssistantClient as any,
  );

  return {
    service,
    wardrobeItemRepository,
    entityManager,
    mediaStorageService,
    aiAssistantClient,
    emitted,
  };
}

function buildItem(overrides: Partial<WardrobeItemEntity> = {}) {
  return {
    id: 7,
    accountId: 3,
    name: 'Grey hoodie',
    img_path: null,
    image_status: ImageStatus.Pending,
    temp_image_key: 'tmp/3/original.jpg',
    image_pending_since: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  } as unknown as WardrobeItemEntity;
}

describe('WardrobeService — product-image failure and retry', () => {
  describe('applyGeneratedImage', () => {
    it('reports not_found when the item was deleted mid-flight', async () => {
      const { service, entityManager, wardrobeItemRepository } =
        buildService();
      entityManager.query.mockResolvedValue([]);
      wardrobeItemRepository.exists.mockResolvedValue(false);

      await expect(
        service.applyGeneratedImage(
          7,
          3,
          ImageStatus.Ready,
          'user-images/3/x.jpg',
        ),
      ).resolves.toBe(ApplyGeneratedImageOutcome.NotFound);
    });

    it('reports not_pending for a redelivered result', async () => {
      const { service, entityManager, wardrobeItemRepository } =
        buildService();
      // The atomic UPDATE's WHERE clause matches nothing once the row is no
      // longer 'pending' — this is the case the fix for the redelivery race
      // exists for: it never reads-then-writes, so there is nothing to assert
      // about save() any more.
      entityManager.query.mockResolvedValue([]);
      wardrobeItemRepository.exists.mockResolvedValue(true);

      await expect(
        service.applyGeneratedImage(
          7,
          3,
          ImageStatus.Ready,
          'user-images/3/x.jpg',
        ),
      ).resolves.toBe(ApplyGeneratedImageOutcome.NotPending);
    });

    it('clears the retained original on success', async () => {
      const { service, entityManager, mediaStorageService } = buildService();
      entityManager.query.mockResolvedValue([
        { previous_img_path: null, new_img_path: 'user-images/3/x.jpg' },
      ]);

      await expect(
        service.applyGeneratedImage(
          7,
          3,
          ImageStatus.Ready,
          'user-images/3/x.jpg',
        ),
      ).resolves.toBe(ApplyGeneratedImageOutcome.Applied);

      expect(mediaStorageService.delete).not.toHaveBeenCalled();
    });

    it('deletes a previous image the generated one replaces', async () => {
      const { service, entityManager, mediaStorageService } = buildService();
      entityManager.query.mockResolvedValue([
        {
          previous_img_path: 'user-images/3/old.jpg',
          new_img_path: 'user-images/3/x.jpg',
        },
      ]);

      await expect(
        service.applyGeneratedImage(
          7,
          3,
          ImageStatus.Ready,
          'user-images/3/x.jpg',
        ),
      ).resolves.toBe(ApplyGeneratedImageOutcome.Applied);

      expect(mediaStorageService.delete).toHaveBeenCalledWith(
        'user-images/3/old.jpg',
      );
    });

    it('keeps the retained original on failure so a retry can re-run from it', async () => {
      const { service, entityManager, mediaStorageService } = buildService();
      entityManager.query.mockResolvedValue([
        { previous_img_path: null, new_img_path: null },
      ]);

      await expect(
        service.applyGeneratedImage(7, 3, ImageStatus.Failed),
      ).resolves.toBe(ApplyGeneratedImageOutcome.Applied);

      expect(mediaStorageService.delete).not.toHaveBeenCalled();
      const [sql, params] = entityManager.query.mock.calls[0];
      expect(sql).toContain(`image_status = 'pending'`);
      expect(params).toEqual([7, 3, ImageStatus.Failed, null]);
    });
  });

  describe('retryImageGeneration', () => {
    it('re-emits the job from the retained original', async () => {
      const { service, wardrobeItemRepository, emitted } = buildService();
      const item = buildItem({ image_status: ImageStatus.Failed });
      wardrobeItemRepository.findOneByOrFail.mockResolvedValue(item);

      const result = await service.retryImageGeneration(7, 3, { id: 3 } as any);

      expect(item.image_status).toBe(ImageStatus.Pending);
      expect(item.image_pending_since).toBeInstanceOf(Date);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.data).toEqual({
        itemId: 7,
        accountId: 3,
        tempImageKey: 'tmp/3/original.jpg',
        originalName: 'original.jpg',
      });
      expect(result.image_status).toBe(ImageStatus.Pending);
    });

    it('refuses with IMAGE_ORIGINAL_EXPIRED when the original is gone', async () => {
      const { service, wardrobeItemRepository, mediaStorageService, emitted } =
        buildService();
      wardrobeItemRepository.findOneByOrFail.mockResolvedValue(
        buildItem({ image_status: ImageStatus.Failed }),
      );
      mediaStorageService.exists.mockResolvedValue(false);

      await expect(service.retryImageGeneration(7, 3)).rejects.toMatchObject({
        response: { code: IMAGE_ORIGINAL_EXPIRED_CODE, statusCode: 409 },
      });
      expect(emitted).toHaveLength(0);
    });

    it('refuses with IMAGE_ORIGINAL_EXPIRED when no original was ever stored', async () => {
      const { service, wardrobeItemRepository, mediaStorageService } =
        buildService();
      wardrobeItemRepository.findOneByOrFail.mockResolvedValue(
        buildItem({ image_status: ImageStatus.Failed, temp_image_key: null }),
      );

      await expect(service.retryImageGeneration(7, 3)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mediaStorageService.exists).not.toHaveBeenCalled();
    });

    it('does not queue a second job for an item that is still pending', async () => {
      const { service, wardrobeItemRepository, emitted } = buildService();
      wardrobeItemRepository.findOneByOrFail.mockResolvedValue(buildItem());

      await expect(service.retryImageGeneration(7, 3)).rejects.toMatchObject({
        response: { code: 'IMAGE_ALREADY_PENDING' },
      });
      expect(emitted).toHaveLength(0);
    });

    it('treats an unreadable storage check as "still there" rather than expired', async () => {
      const { service, wardrobeItemRepository, mediaStorageService, emitted } =
        buildService();
      wardrobeItemRepository.findOneByOrFail.mockResolvedValue(
        buildItem({ image_status: ImageStatus.Failed }),
      );
      mediaStorageService.exists.mockRejectedValue(new Error('AccessDenied'));

      await service.retryImageGeneration(7, 3);

      expect(emitted).toHaveLength(1);
    });
  });

  describe('failStalePendingImages', () => {
    it('fails only pending items queued before the cutoff', async () => {
      const { service, wardrobeItemRepository } = buildService();
      wardrobeItemRepository.update.mockResolvedValue({ affected: 2 });
      const before = Date.now();

      await expect(service.failStalePendingImages()).resolves.toBe(2);

      const [criteria, patch] = wardrobeItemRepository.update.mock.calls[0];
      expect(criteria.image_status).toBe(ImageStatus.Pending);
      expect(patch).toEqual({
        image_status: ImageStatus.Failed,
        image_pending_since: null,
      });

      const cutoff = (
        criteria.image_pending_since as ReturnType<typeof LessThan>
      ).value as Date;
      expect(cutoff.getTime()).toBeLessThanOrEqual(
        before - IMAGE_GENERATION_STALE_AFTER_MS,
      );
      expect(cutoff.getTime()).toBeGreaterThan(
        before - IMAGE_GENERATION_STALE_AFTER_MS - 5000,
      );
    });

    it('leaves a fresh pending item alone', async () => {
      const { service, wardrobeItemRepository } = buildService();
      wardrobeItemRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.failStalePendingImages(60000)).resolves.toBe(0);
    });
  });
});
