import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpoPushTokenToUserAccount1752840000000
  implements MigrationInterface
{
  name = 'AddExpoPushTokenToUserAccount1752840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_account" ADD COLUMN IF NOT EXISTS "expo_push_token" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_account" DROP COLUMN IF EXISTS "expo_push_token"`,
    );
  }
}
