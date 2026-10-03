import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrorLog1788085562531 implements MigrationInterface {
  name = 'AddErrorLog1788085562531';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "error_log"
                             (
                                 "id"             uuid                     NOT NULL DEFAULT uuid_generate_v4(),
                                 "severity"       character varying(20)    NOT NULL,
                                 "service"        character varying(50)    NOT NULL,
                                 "context"        character varying(200),
                                 "message"        text                     NOT NULL,
                                 "error_name"     character varying(200),
                                 "status_code"    integer,
                                 "stack"          text,
                                 "request_method" character varying(10),
                                 "request_path"   text,
                                 "account_id"     integer,
                                 "correlation_id" character varying(36),
                                 "meta"           jsonb,
                                 "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_error_log" PRIMARY KEY ("id")
                             )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_error_log_severity_created" ON "error_log" ("severity", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_error_log_service_created" ON "error_log" ("service", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_error_log_service_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_error_log_severity_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "error_log"`);
  }
}
