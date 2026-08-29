import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { databaseEntities } from './typeOrm.config';

export const createDatabaseOptions = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.getOrThrow('POSTGRES_DOCKER_HOST'),
  port: configService.getOrThrow('POSTGRES_PORT'),
  database: configService.getOrThrow('POSTGRES_DATABASE'),
  username: configService.getOrThrow('POSTGRES_USER'),
  password: configService.getOrThrow('POSTGRES_PASSWORD'),
  entities: databaseEntities,
  autoLoadEntities: true,
  // POSTGRES_SYNCHRONIZE comes from env as a string, and ConfigService does
  // not coerce it — 'false' is truthy in JS, so this must be a strict
  // string comparison or synchronize silently stays on.
  synchronize: configService.getOrThrow('POSTGRES_SYNCHRONIZE') === 'true',
});

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createDatabaseOptions,
      inject: [ConfigService],
    }),
  ],
  providers: [],
})
export class DatabaseModule {}
