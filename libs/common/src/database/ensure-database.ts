import { Client } from 'pg';
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';

config({ path: './libs/common/src/database/.env' });

const configService = new ConfigService();

const DUPLICATE_DATABASE = '42P04';

// POSTGRES_DB only creates the target database on Postgres's first boot
// against an empty data directory — anyone with a pre-existing data volume
// (or CI cache) never gets it. This connects to the always-present
// maintenance "postgres" database and creates the target database if it is
// still missing, so the bootstrap path works on both fresh and pre-existing
// volumes.
async function ensureDatabaseExists(): Promise<void> {
  const database = configService.getOrThrow('POSTGRES_DATABASE');
  const client = new Client({
    host: configService.getOrThrow('POSTGRES_HOST'),
    port: Number(configService.getOrThrow('POSTGRES_PORT')),
    user: configService.getOrThrow('POSTGRES_USER'),
    password: configService.getOrThrow('POSTGRES_PASSWORD'),
    database: 'postgres',
  });

  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`Created database "${database}".`);
  } catch (error) {
    if ((error as { code?: string }).code === DUPLICATE_DATABASE) {
      console.log(`Database "${database}" already exists, skipping.`);
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
}

ensureDatabaseExists()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
