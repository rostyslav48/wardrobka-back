import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAssistantSchemaDrift1788021884127
  implements MigrationInterface
{
  name = 'FixAssistantSchemaDrift1788021884127';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assistant_message" ADD CONSTRAINT "FK_a889207d186b37b7a8e6684a741" FOREIGN KEY ("session_id") REFERENCES "assistant_session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assistant_outfit_suggestion" ADD CONSTRAINT "FK_16dfc40d92d84f29d1978308b51" FOREIGN KEY ("session_id") REFERENCES "assistant_session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assistant_session" ADD CONSTRAINT "FK_a1769851ac33835909bea12f6f8" FOREIGN KEY ("account_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assistant_session" DROP CONSTRAINT IF EXISTS "FK_a1769851ac33835909bea12f6f8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assistant_outfit_suggestion" DROP CONSTRAINT IF EXISTS "FK_16dfc40d92d84f29d1978308b51"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assistant_message" DROP CONSTRAINT IF EXISTS "FK_a889207d186b37b7a8e6684a741"`,
    );
  }
}
