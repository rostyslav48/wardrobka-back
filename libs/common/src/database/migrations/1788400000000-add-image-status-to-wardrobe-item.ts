import { MigrationInterface, QueryRunner } from 'typeorm';

// `image_status` tracks the product-image generation job for an item and is
// unrelated to the existing `status` column (active | washing | missing |
// need-repair). Existing rows already carry their final photo, so the default
// is 'ready' and no backfill is needed.
export class AddImageStatusToWardrobeItem1788400000000
  implements MigrationInterface
{
  name = 'AddImageStatusToWardrobeItem1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wardrobe_item" ADD COLUMN IF NOT EXISTS "image_status" character varying(20) NOT NULL DEFAULT 'ready'`,
    );
    // Every poll of the wardrobe list filters on this while a job is in
    // flight, and Phase 3's staleness sweep scans it across all accounts.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wardrobe_item_image_status" ON "wardrobe_item" ("image_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_wardrobe_item_image_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wardrobe_item" DROP COLUMN IF EXISTS "image_status"`,
    );
  }
}
