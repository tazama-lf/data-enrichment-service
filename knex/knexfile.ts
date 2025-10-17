import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.CONFIGURATION_DATABASE_HOST || 'localhost',
      user: process.env.CONFIGURATION_DATABASE_USER || 'postgres',
      password: process.env.CONFIGURATION_DATABASE_PASSWORD || 'postgres',
      database: process.env.CONFIGURATION_DATABASE || 'mydb',
      port: 5432,
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
