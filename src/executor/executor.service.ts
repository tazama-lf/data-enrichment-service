import { Injectable } from '@nestjs/common';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import axios from 'axios';
import knex, { Knex } from 'knex';
import { userSchema } from '../utils/constants';
import { Job, SourceType } from '../job/interfaces';

@Injectable()
export class ExecutorService {
  private readonly validate: ValidateFunction;
  private knex: Knex;

  constructor() {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validate = ajv.compile(userSchema);

    this.knex = knex({
      client: 'pg',
      connection: process.env.DATABASE_URL,
    });
  }

  private getColumnType(value: any) {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    } else if (typeof value === 'boolean') {
      return 'boolean';
    } else if (typeof value === 'object') {
      return 'jsonb';
    } else {
      return 'text';
    }
  }

  async ensureTableColumns(tableName: string, user: any) {
    const exists = await this.knex.schema.hasTable(tableName);

    if (!exists) {
      await this.knex.schema.createTable(tableName, (table) => {
        for (const [key, value] of Object.entries(user)) {
          const type = this.getColumnType(value);
          (table[type] as any)(key);
        }
      });
      return;
    }

    const existingColumns = await this.knex(tableName).columnInfo();

    const missingColumns = Object.entries(user).filter(([key]) => !(key in existingColumns));

    if (missingColumns.length > 0) {
      await this.knex.schema.alterTable(tableName, (table) => {
        for (const [key, value] of missingColumns) {
          const type = this.getColumnType(value);
          (table[type] as any)(key);
        }
      });
    }
  }

  async ensureTable(tableName: string, user: any) {
    await this.ensureTableColumns(tableName, user);
    return this.knex(tableName).insert(user);
  }

  async run(job: Job) {
    if (job.sourceType === SourceType.HTTP) {
      try {
        const { data } = await axios.get(job.sourcePath);
        if (!Array.isArray(data?.users) || data.users.length === 0) {
          console.log('No users found or invalid data');
          return;
        }

        for (const user of data.users) {
          await this.ensureTable('user', user);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }
  }
}
