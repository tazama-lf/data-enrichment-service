import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex from 'knex';

@Global()
@Module({
  providers: [
    {
      provide: 'KNEX_CONNECTION',
      inject: [ConfigService],
      useFactory: () => {
        return knex({
          client: 'pg',
          connection: process.env.DATABASE_URL,
        });
      },
    },
  ],
  exports: ['KNEX_CONNECTION'],
})
export class KnexModule {}
