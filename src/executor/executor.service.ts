import { Injectable } from '@nestjs/common';
import knex, { Knex } from 'knex';

@Injectable()
export class ExecutorService {
  private knex: Knex;

  constructor() {
    this.knex = knex({
      client: 'pg',
      connection: process.env.DATABASE_URL,
    });
  }

  async ensureTable(tableName: string, user: any) {
    const exists = await this.knex.schema.hasTable(tableName);
    if (!exists) {
      await this.knex.schema.createTable(tableName, (table) => {
        table.increments('id').primary();
        table.jsonb('data').notNullable();
        table.timestamps(true, true);
      });
    }
    return this.knex(tableName).insert({ data: user }).returning('*');
  }
}
