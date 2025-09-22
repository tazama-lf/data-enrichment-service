import type { Knex } from 'knex';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot();
const configService = new ConfigService();

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: configService.get<string>('CONFIGURATION_DATABASE_HOST'),
      user: configService.get<string>('CONFIGURATION_DATABASE_USER'),
      password: configService.get<string>('CONFIGURATION_DATABASE_PASSWORD'),
      database: configService.get<string>('CONFIGURATION_DATABASE'),
    },
    migrations: {
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },
};

export default config;
