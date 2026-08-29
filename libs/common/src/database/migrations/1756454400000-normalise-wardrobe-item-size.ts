import { MigrationInterface, QueryRunner } from 'typeorm';

// BUG-004: the Size enum used to store 'xL' / 'xxL'; it now stores the
// natural lowercase spelling 'xl' / 'xxl'. The column is a plain varchar
// (not a Postgres enum type), so only the stored data needs updating.
export class NormaliseWardrobeItemSize1756454400000
  implements MigrationInterface
{
  name = 'NormaliseWardrobeItemSize1756454400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "wardrobe_item" SET "size" = LOWER("size") WHERE "size" IN ('xL', 'xxL')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "wardrobe_item" SET "size" = 'xL' WHERE "size" = 'xl'
    `);
    await queryRunner.query(`
      UPDATE "wardrobe_item" SET "size" = 'xxL' WHERE "size" = 'xxl'
    `);
  }
}
