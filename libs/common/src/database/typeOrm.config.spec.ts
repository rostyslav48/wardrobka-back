// Set before importing typeOrm.config: it builds AppDataSource eagerly at
// module load via configService.getOrThrow(...), which throws on a fresh
// checkout with no libs/common/src/database/.env (that file is gitignored).
// dotenv's config() call inside typeOrm.config.ts does not override values
// already present in process.env, so these are only used as a fallback.
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '5432';
process.env.POSTGRES_DATABASE ??= 'wardrobe_assistant';
process.env.POSTGRES_USER ??= 'postgres';
process.env.POSTGRES_PASSWORD ??= '1234';
process.env.POSTGRES_SYNCHRONIZE ??= 'false';

import { AppDataSource } from './typeOrm.config';

describe('AppDataSource', () => {
  it('keeps synchronize disabled per the checked-in POSTGRES_SYNCHRONIZE=false, so schema changes only happen via migrations', () => {
    expect(AppDataSource.options.synchronize).toBe(false);
  });
});
