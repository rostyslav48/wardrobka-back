import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineMigration1744488352502 implements MigrationInterface {
  name = 'BaselineMigration1744488352502';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "user_account"
                             (
                                 "id"       SERIAL                 NOT NULL,
                                 "name"     character varying(100) NOT NULL,
                                 "email"    character varying(100) NOT NULL,
                                 "password" text                   NOT NULL,
                                 CONSTRAINT "UQ_56a0e4bcec2b5411beafa47ffa5" UNIQUE ("email"),
                                 CONSTRAINT "PK_6acfec7285fdf9f463462de3e9f" PRIMARY KEY ("id")
                             )`);
    await queryRunner.query(`CREATE TABLE "wardrobe_item"
                             (
                                 "id"          SERIAL                NOT NULL,
                                 "account_id"  integer               NOT NULL,
                                 "type"        character varying(50) NOT NULL,
                                 "color"       character varying(50) NOT NULL,
                                 "name"        character varying(50) NOT NULL,
                                 "season"      character varying(50) NOT NULL,
                                 "img_url"     text,
                                 "status"      character varying(50) NOT NULL DEFAULT 'active',
                                 "favourite"   boolean               NOT NULL DEFAULT false,
                                 "fit_type"    character varying(50),
                                 "material"    character varying(100),
                                 "description" text,
                                 "style"       character varying(100),
                                 "size"        character varying(20),
                                 "brand"       character varying(100),
                                 CONSTRAINT "PK_206459a8031450d3182166bfebd" PRIMARY KEY ("id")
                             )`);
    await queryRunner.query(`ALTER TABLE "wardrobe_item"
        ADD CONSTRAINT "FK_813c8867c0ac4a625dfb8a10fce" FOREIGN KEY ("account_id") REFERENCES "user_account" ("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wardrobe_item"
        DROP CONSTRAINT "FK_813c8867c0ac4a625dfb8a10fce"`);
    await queryRunner.query(`DROP TABLE "wardrobe_item"`);
    await queryRunner.query(`DROP TABLE "user_account"`);
  }
}
