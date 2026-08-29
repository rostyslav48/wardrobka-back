import { ConfigService } from '@nestjs/config';

// Set before importing dtabase.module: it imports databaseEntities from
// typeOrm.config, which builds AppDataSource eagerly at module load via
// configService.getOrThrow(...) and throws without a real POSTGRES_HOST —
// e.g. on a fresh checkout with no libs/common/src/database/.env (gitignored).
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '5432';
process.env.POSTGRES_DATABASE ??= 'wardrobe_assistant';
process.env.POSTGRES_USER ??= 'postgres';
process.env.POSTGRES_PASSWORD ??= '1234';
process.env.POSTGRES_SYNCHRONIZE ??= 'false';

import { createDatabaseOptions } from './dtabase.module';

const buildConfigService = (values: Record<string, string>): ConfigService =>
  ({
    getOrThrow: (key: string) => values[key],
  }) as ConfigService;

const baseValues = {
  POSTGRES_DOCKER_HOST: 'postgresDb',
  POSTGRES_PORT: '5432',
  POSTGRES_DATABASE: 'wardrobe_assistant',
  POSTGRES_USER: 'postgres',
  POSTGRES_PASSWORD: '1234',
};

describe('createDatabaseOptions', () => {
  it('disables synchronize for the string "false" (regression: getOrThrow returns a string, not a boolean)', () => {
    const options = createDatabaseOptions(
      buildConfigService({ ...baseValues, POSTGRES_SYNCHRONIZE: 'false' }),
    );

    expect(options.synchronize).toBe(false);
  });

  it('only enables synchronize for the exact string "true"', () => {
    const options = createDatabaseOptions(
      buildConfigService({ ...baseValues, POSTGRES_SYNCHRONIZE: 'true' }),
    );

    expect(options.synchronize).toBe(true);
  });
});
