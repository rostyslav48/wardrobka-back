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

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { databaseEntities } from './typeOrm.config';

function findEntityFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findEntityFiles(full));
    } else if (entry.endsWith('.entity.ts')) {
      files.push(full);
    }
  }
  return files;
}

// Mirrors this project's file naming convention (kebab-case file name suffixed
// with .entity.ts -> PascalCase class name suffixed with Entity), e.g.
// outfit-log-item.entity.ts -> OutfitLogItemEntity.
function expectedClassName(filePath: string): string {
  const base = filePath
    .split('/')
    .pop()!
    .replace(/\.entity\.ts$/, '');
  return (
    base
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('') + 'Entity'
  );
}

describe('databaseEntities', () => {
  const entityFiles = findEntityFiles(join(__dirname, 'entities'));

  it('finds entity files to check against, so this test cannot pass by scanning nothing', () => {
    expect(entityFiles.length).toBeGreaterThan(0);
  });

  // The outfit_log/outfit_log_item drift (see CFG-001's status in
  // planning/qa/BUGS-2026-08-29.md) hid for as long as it did because
  // databaseEntities is hand-maintained and nothing checked it against the
  // entities that actually exist on disk: schema:log silently skipped both
  // tables while reporting "up to date". This test makes that class of gap
  // fail loudly instead.
  it('includes every entity class found under entities/**/*.entity.ts', () => {
    const missing = entityFiles
      .map(expectedClassName)
      .filter(
        (className) =>
          !databaseEntities.some((entity) => entity.name === className),
      );
    expect(missing).toEqual([]);
  });

  it('has no stale entries beyond what exists on disk', () => {
    expect(databaseEntities.length).toBe(entityFiles.length);
  });
});
