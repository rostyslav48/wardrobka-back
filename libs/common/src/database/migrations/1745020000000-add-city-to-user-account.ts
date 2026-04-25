import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCityToUserAccount1745020000000 implements MigrationInterface {
  name = 'AddCityToUserAccount1745020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_account" ADD COLUMN IF NOT EXISTS "city" character varying(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_account" DROP COLUMN IF EXISTS "city"`,
    );
  }
}
