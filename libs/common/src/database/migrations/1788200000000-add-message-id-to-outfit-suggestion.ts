import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageIdToOutfitSuggestion1788200000000
  implements MigrationInterface
{
  name = 'AddMessageIdToOutfitSuggestion1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE "assistant_outfit_suggestion" ADD COLUMN IF NOT EXISTS "message_id" uuid
    `);
    await queryRunner.query(
      `ALTER TABLE "assistant_outfit_suggestion" ADD CONSTRAINT "FK_assistant_outfit_suggestion_message" FOREIGN KEY ("message_id") REFERENCES "assistant_message"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assistant_outfit_suggestion" DROP CONSTRAINT IF EXISTS "FK_assistant_outfit_suggestion_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assistant_outfit_suggestion" DROP COLUMN IF EXISTS "message_id"`,
    );
  }
}
