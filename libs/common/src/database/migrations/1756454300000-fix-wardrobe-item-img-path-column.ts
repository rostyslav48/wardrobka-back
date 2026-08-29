import { MigrationInterface, QueryRunner } from 'typeorm';

// The baseline migration created "img_url" on wardrobe_item, but
// WardrobeItemEntity has always declared the column as "img_path" (the
// entity's "img_url" is a computed presigned URL, not a stored column).
// POSTGRES_SYNCHRONIZE=true silently papered over the mismatch by adding
// "img_path" alongside the orphaned "img_url" column. Now that synchronize is
// off (CFG-001), the migration chain must describe the real schema.
export class FixWardrobeItemImgPathColumn1756454300000
  implements MigrationInterface
{
  name = 'FixWardrobeItemImgPathColumn1756454300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'wardrobe_item' AND column_name = 'img_url'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'wardrobe_item' AND column_name = 'img_path'
        ) THEN
          ALTER TABLE "wardrobe_item" RENAME COLUMN "img_url" TO "img_path";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "wardrobe_item" ADD COLUMN IF NOT EXISTS "img_path" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wardrobe_item" RENAME COLUMN "img_path" TO "img_url"
    `);
  }
}
