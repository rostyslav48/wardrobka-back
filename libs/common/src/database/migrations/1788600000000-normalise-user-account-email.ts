import { MigrationInterface, QueryRunner } from 'typeorm';

// QA-16: the app never normalised email casing, so `UQ_56a0e4bcec2b5411beafa47ffa5`
// (a plain UNIQUE("email")) let "qa-ios-0922@example.com" and
// "QA-IOS-0922@example.com" coexist as two different accounts.
//
// Chosen rule for existing collisions (documented in state.md): never delete a
// user row. For every group of rows that collide under lower(trim(email)), keep
// the row with the smallest id (the account created first) untouched, and
// rename every other row's email by inserting "+dup<id>" before the "@" so it
// stops colliding — the row, its wardrobe items, sessions, etc. all survive,
// just no longer reachable by the original email. A backup table records every
// email this migration changes (case-fold *and* the rename) so `down` can put
// the exact original value back. After the rename pass a final assertion
// re-checks for leftover collisions and raises loudly instead of silently
// leaving (or creating) a broken state — this is the "did not anticipate"
// guard: it fires only if the rename loop above has a bug, not on the data.
const BACKUP_TABLE = '_user_account_email_backup_1788600000000';
const INDEX_NAME = 'UQ_user_account_email_lower';

export class NormaliseUserAccountEmail1788600000000
  implements MigrationInterface
{
  name = 'NormaliseUserAccountEmail1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "${BACKUP_TABLE}" (
        "user_id" integer PRIMARY KEY,
        "original_email" character varying(100) NOT NULL
      )
    `);

    // One pass, grouped by the case/whitespace-folded email: within each group
    // the smallest id (the account created first) is the winner and is folded
    // to the clean value; every other id in the group is a loser and gets
    // renamed away *first* (so a loser that already happened to hold the
    // winner's target value — e.g. the winner needs folding but a duplicate
    // row already sits at the lowercase form — never collides with the
    // winner's own UPDATE, since both statements go through the table's
    // pre-existing exact-match UNIQUE("email") constraint, which stays in
    // force the whole time).
    await queryRunner.query(`
      DO $$
      DECLARE
        grp RECORD;
        winner INTEGER;
        loser INTEGER;
        target TEXT;
      BEGIN
        FOR grp IN
          SELECT lower(trim(email)) AS target_email, array_agg(id ORDER BY id) AS ids
          FROM "user_account"
          GROUP BY lower(trim(email))
        LOOP
          target := grp.target_email;
          winner := grp.ids[1];

          IF array_length(grp.ids, 1) > 1 THEN
            FOR i IN 2..array_length(grp.ids, 1) LOOP
              loser := grp.ids[i];

              INSERT INTO "${BACKUP_TABLE}" (user_id, original_email)
              SELECT loser, email FROM "user_account" WHERE id = loser
              ON CONFLICT (user_id) DO NOTHING;

              UPDATE "user_account"
              SET email = regexp_replace(target, '@', '+dup' || loser || '@')
              WHERE id = loser;
            END LOOP;
          END IF;

          INSERT INTO "${BACKUP_TABLE}" (user_id, original_email)
          SELECT winner, email FROM "user_account" WHERE id = winner AND email <> target
          ON CONFLICT (user_id) DO NOTHING;

          UPDATE "user_account" SET email = target WHERE id = winner AND email <> target;
        END LOOP;
      END $$;
    `);

    // Guard: this must always find zero rows given the loop above. Group by
    // lower(email), not the raw column — the raw column already carries a
    // plain exact-match UNIQUE("email") constraint, so grouping by it can
    // never find a duplicate and the guard would be dead code. Grouping by
    // lower(email) actually re-checks the invariant CREATE UNIQUE INDEX below
    // is about to enforce. If this finds rows, something about the data shape
    // was not anticipated (for example a loser's rename target collided with
    // an unrelated pre-existing row and silently lost the rename, which can't
    // actually happen because that UPDATE would itself fail on the exact
    // UNIQUE constraint — this is a defence-in-depth check) — fail the
    // migration loudly (with the offending emails) rather than let the next
    // statement fail with an opaque unique-violation, or worse, leave the
    // table in a half-migrated state.
    const remaining: { email: string; ids: string }[] =
      await queryRunner.query(`
        SELECT lower(email) AS email, array_agg(id) AS ids FROM "user_account"
        GROUP BY lower(email) HAVING count(*) > 1
      `);
    if (remaining.length > 0) {
      throw new Error(
        `NormaliseUserAccountEmail1788600000000: unresolved email collisions after cleanup: ${JSON.stringify(
          remaining,
        )}`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "${INDEX_NAME}" ON "user_account" (lower(email))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);

    await queryRunner.query(`
      UPDATE "user_account" ua
      SET email = b.original_email
      FROM "${BACKUP_TABLE}" b
      WHERE ua.id = b.user_id
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "${BACKUP_TABLE}"`);
  }
}
