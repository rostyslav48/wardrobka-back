import { of } from 'rxjs';

import { ProductImageController } from './product-image.controller';
import { ApplyGeneratedImageOutcome, ImageStatus } from '@app/wardrobe/enums';
import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';

const REQUEST = {
  data: {
    itemId: 42,
    accountId: 7,
    tempImageKey: 'tmp/7/original.jpg',
    originalName: 'original.jpg',
  },
  user: { id: 7 },
};

const GENERATED = 'user-images/7/generated.jpg';

/**
 * Which S3 objects survive each terminal outcome. Getting this wrong costs
 * either the user's photo or an object nothing will ever delete, and neither
 * shows up in a happy-path run.
 */
function buildController(options: {
  outcome: ApplyGeneratedImageOutcome;
  itemStatus?: ImageStatus;
  result?:
    | { status: ImageStatus.Ready; imgPath: string }
    | { status: ImageStatus.Failed; reason: string };
}) {
  const generate = jest
    .fn()
    .mockResolvedValue(
      options.result ?? { status: ImageStatus.Ready, imgPath: GENERATED },
    );
  const deleted: string[] = [];
  const mediaStorageService = {
    delete: jest.fn(async (key: string) => {
      deleted.push(key);
      return true;
    }),
  };
  const wardrobeClient = {
    send: jest.fn((pattern: string) => {
      if (pattern === WARDROBE_REQUESTS.findOne) {
        return of({ image_status: options.itemStatus ?? ImageStatus.Pending });
      }
      return of(options.outcome);
    }),
  };
  const rmqService = { ack: jest.fn() };

  const controller = new ProductImageController(
    { generate } as any,
    mediaStorageService as any,
    wardrobeClient as any,
    rmqService as any,
  );

  return { controller, deleted, generate, rmqService, wardrobeClient };
}

const context = {} as any;

describe('ProductImageController — terminal cleanup', () => {
  it('deletes only the temp original when the result was applied', async () => {
    const { controller, deleted, rmqService } = buildController({
      outcome: ApplyGeneratedImageOutcome.Applied,
    });

    await controller.generateProductImage(context, REQUEST as any);

    expect(deleted).toEqual(['tmp/7/original.jpg']);
    expect(rmqService.ack).toHaveBeenCalledTimes(1);
  });

  it('discards the generated image when the item was deleted mid-flight', async () => {
    const { controller, deleted } = buildController({
      outcome: ApplyGeneratedImageOutcome.NotFound,
    });

    await controller.generateProductImage(context, REQUEST as any);

    expect(deleted).toEqual([GENERATED, 'tmp/7/original.jpg']);
  });

  it('discards its own image but leaves the shared original when another delivery won', async () => {
    const { controller, deleted } = buildController({
      outcome: ApplyGeneratedImageOutcome.NotPending,
    });

    await controller.generateProductImage(context, REQUEST as any);

    expect(deleted).toEqual([GENERATED]);
  });

  it('keeps the original on failure so a retry can re-run from it', async () => {
    const { controller, deleted } = buildController({
      outcome: ApplyGeneratedImageOutcome.Applied,
      result: { status: ImageStatus.Failed, reason: 'model refused' },
    });

    await controller.generateProductImage(context, REQUEST as any);

    expect(deleted).toEqual([]);
  });

  it('runs no generation at all for a redelivered job whose item already finished', async () => {
    const { controller, generate, deleted, rmqService } = buildController({
      outcome: ApplyGeneratedImageOutcome.Applied,
      itemStatus: ImageStatus.Ready,
    });

    await controller.generateProductImage(context, REQUEST as any);

    expect(generate).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(rmqService.ack).toHaveBeenCalledTimes(1);
  });
});
