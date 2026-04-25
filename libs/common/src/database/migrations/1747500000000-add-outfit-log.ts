import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutfitLog1747500000000 implements MigrationInterface {
  name = 'AddOutfitLog1747500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outfit_log" (
        "id"         uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" integer                  NOT NULL,
        "date"       date                     NOT NULL,
        "notes"      text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outfit_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outfit_log_item" (
        "id"               serial  NOT NULL,
        "outfit_log_id"    uuid    NOT NULL,
        "wardrobe_item_id" integer NOT NULL,
        CONSTRAINT "PK_outfit_log_item" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "outfit_log_item"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outfit_log"`);
  }
}
