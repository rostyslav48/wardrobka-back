import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiAssistantBootstrap1747340000000 implements MigrationInterface {
  name = 'AiAssistantBootstrap1747340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
        ALTER TABLE "user_account" ADD COLUMN IF NOT EXISTS "protected_data" text
    `);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "assistant_session"
                             (
                                 "id"         uuid                     NOT NULL DEFAULT uuid_generate_v4(),
                                 "account_id" integer                  NOT NULL,
                                 "topic"      character varying(255)   NOT NULL,
                                 "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_assistant_session" PRIMARY KEY ("id")
                             )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "assistant_message"
                             (
                                 "id"          uuid                     NOT NULL DEFAULT uuid_generate_v4(),
                                 "session_id"  uuid                     NOT NULL,
                                 "role"        character varying(20)    NOT NULL,
                                 "content"     text                     NOT NULL,
                                 "attachments" jsonb,
                                 "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_assistant_message" PRIMARY KEY ("id")
                             )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "assistant_outfit_suggestion"
                             (
                                 "id"                uuid                     NOT NULL DEFAULT uuid_generate_v4(),
                                 "session_id"        uuid                     NOT NULL,
                                 "summary"           text                     NOT NULL,
                                 "wardrobe_item_ids" jsonb                    NOT NULL,
                                 "extra_metadata"    jsonb,
                                 "created_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_assistant_outfit_suggestion" PRIMARY KEY ("id")
                             )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "assistant_webhook_job"
                             (
                                 "id"            uuid                     NOT NULL DEFAULT uuid_generate_v4(),
                                 "account_id"    integer                  NOT NULL,
                                 "payload"       jsonb                    NOT NULL,
                                 "status"        character varying(20)    NOT NULL DEFAULT 'pending',
                                 "attempt_count" integer                  NOT NULL DEFAULT 0,
                                 "last_error"    text,
                                 "scheduled_at"  TIMESTAMP WITH TIME ZONE,
                                 "processed_at"  TIMESTAMP WITH TIME ZONE,
                                 "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_assistant_webhook_job" PRIMARY KEY ("id")
                             )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_assistant_webhook_status_schedule" ON "assistant_webhook_job" ("status", "scheduled_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_assistant_webhook_status_schedule"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "assistant_webhook_job"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "assistant_outfit_suggestion"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "assistant_message"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "assistant_session"`);
    await queryRunner.query(
      `ALTER TABLE "user_account" DROP COLUMN IF EXISTS "protected_data"`,
    );
  }
}
