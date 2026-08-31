import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleCalendarCredential1788300000000
  implements MigrationInterface
{
  name = 'AddGoogleCalendarCredential1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "google_calendar_credential"
                             (
                                 "account_id"              integer                  NOT NULL,
                                 "refresh_token_encrypted" text,
                                 "access_token_encrypted"  text,
                                 "access_token_expires_at" TIMESTAMP WITH TIME ZONE,
                                 "scope"                   text,
                                 "status"                  character varying(20)    NOT NULL DEFAULT 'active',
                                 "last_error"              text,
                                 "created_at"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 "updated_at"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_google_calendar_credential" PRIMARY KEY ("account_id")
                             )`);
    // Added separately so re-running against a table that already exists (the
    // CREATE above is a no-op then) still ends with the constraint in place.
    // The name is TypeORM's own generated one for the @ManyToOne on the entity,
    // so `schema:log` reports no drift for this table.
    await queryRunner.query(`DO
                             $$
                                 BEGIN
                                     IF NOT EXISTS (SELECT 1
                                                    FROM pg_constraint
                                                    WHERE conname = 'FK_d9f253d215395bbe2491a19f05e') THEN
                                         ALTER TABLE "google_calendar_credential"
                                             ADD CONSTRAINT "FK_d9f253d215395bbe2491a19f05e" FOREIGN KEY ("account_id") REFERENCES "user_account" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
                                     END IF;
                                 END
                             $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "google_calendar_credential" DROP CONSTRAINT IF EXISTS "FK_d9f253d215395bbe2491a19f05e"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "google_calendar_credential"`,
    );
  }
}
