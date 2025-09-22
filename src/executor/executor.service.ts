import { Injectable } from '@nestjs/common';
import axios from 'axios';
import knex, { Knex } from 'knex';
import { Schedule, SourceType } from '../scheduler/scheduler-interfaces';

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

  async run(job: Schedule) {
    if (job.source_type === SourceType.HTTP) {
      try {
        const { data } = await axios.get(job.source_path);
        await this.ensureTable('user', data?.users?.[0]);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }
  }
}
