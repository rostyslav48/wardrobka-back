import { MigrationInterface, QueryRunner } from 'typeorm';

// Phase 3 retry state, both nullable and both only ever set while a
// product-image job exists for the item:
//
// - `temp_image_key` is the tmp/ object the generator reads. It is kept when a
//   job fails so "Generate again" can re-run from the photo the user already
//   supplied, and cleared once a generated image lands.
// - `image_pending_since` is the only timestamp on this table — there is no
//   created_at/updated_at — so the staleness sweep that fails abandoned
//   `pending` items has to carry its own.
export class AddImageRetryColumnsToWardrobeItem1788500000000
  implements MigrationInterface
{
  name = 'AddImageRetryColumnsToWardrobeItem1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wardrobe_item" ADD COLUMN IF NOT EXISTS "temp_image_key" character varying(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "wardrobe_item" ADD COLUMN IF NOT EXISTS "image_pending_since" TIMESTAMP WITH TIME ZONE`,
    );
    // Rows already sitting `pending` when this ships have no timestamp to
    // measure, and the sweep only touches rows that have one — without this
    // they would stay pending forever, which is the exact failure the sweep
    // exists to stop. Their clock starts now.
    await queryRunner.query(
      `UPDATE "wardrobe_item" SET "image_pending_since" = now() WHERE "image_status" = 'pending' AND "image_pending_since" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wardrobe_item" DROP COLUMN IF EXISTS "image_pending_since"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wardrobe_item" DROP COLUMN IF EXISTS "temp_image_key"`,
    );
  }
}
