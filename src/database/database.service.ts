import { Injectable } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Pool, QueryResult } from 'pg';
import { v4 } from 'uuid';
import { Enrichment } from '../job/types/job-interfaces';
import { IngestMode } from '../utils/interfaces';

@Injectable()
export class DatabaseService {
  private pool: Pool;
  constructor(private readonly loggerService: LoggerService) {
    this.pool = new Pool({
      connectionString: process.env.CONFIGURATION_DATABASE_URL,
      max: 10,
    });
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params);
    return result;
  }

  async tableExist(tableName: string): Promise<boolean> {
    const cleanName = tableName.trim().toLowerCase();
    const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    ) AS exists;
  `;

    const result = await this.pool.query(query, [cleanName]);
    return result.rows[0]?.exists || false;
  }

  async ensureTable(tableName: string): Promise<void> {
    try {
      const exists = await this.tableExist(tableName);
      if (!exists) {
        await this.knex.schema.createTable(tableName, (table) => {
          table.string('id').notNullable();
          table.json('data').notNullable();
          table.timestamp('created_at').defaultTo(this.knex.fn.now());
        });
      }
    } catch (err) {
      if (err.message.includes('already exists')) {
        this.loggerService.log(`Table ${tableName} already created, ignoring...`);
      } else {
        this.loggerService.error(err.message);
      }
    }
    return;
  }

  async ensureTableWithMetaData(tableName: string): Promise<void> {
    try {
      const exists = await this.tableExist(tableName);
      if (!exists) {
        await this.knex.schema.createTable(tableName, (table) => {
          table.string('id').notNullable();
          table.string('tenant_id').notNullable();
          table.string('correlation_id').notNullable();
          table.json('data').notNullable();
          table.string('endpoint_id').notNullable();
          table.string('checksum').notNullable();
          table.timestamp('created_at').defaultTo(this.knex.fn.now());
        });
      }
    } catch (err) {
      if (err.message.includes('already exists')) {
        this.loggerService.log(`Table ${tableName} already created, ignoring...`);
      } else {
        this.loggerService.error(err.message);
      }
    }
    return;
  }

  async updateTable(table_name: string, mode: IngestMode, data: any, path: string): Promise<void> {
    await this.ensureTable(table_name);
    const arr = Array.isArray(data) ? data : Object.values(data).flat();

    if (!arr.length) {
      this.loggerService.warn(`Not enough data in ${path}`);
      throw new Error(`Not enough data received from path : ${path}`);
    }

    if (mode === IngestMode.APPEND) {
      const rows = arr.map((item) => ({
        id: v4(),
        data: JSON.stringify(item),
      }));
      await this.knex(table_name).insert(rows);
    } else {
      await this.knex.transaction(async (trx) => {
        await trx(table_name).del();

        const rows = arr.map((item) => ({
          id: v4(),
          data: JSON.stringify(item),
        }));

        await trx(table_name).insert(rows);
      });
    }
  }
  async updateTableWithMetaData(table_name: string, mode: IngestMode, data: Enrichment[]): Promise<void> {
    await this.ensureTable(table_name);

    if (mode === IngestMode.APPEND) {
      const rows = data.map((item) => ({
        id: v4(),
        tenant_id: item?.tenant_id,
        correlation_id: item?.correlation_id,
        data: JSON.stringify(item.data),
        endpoint_id: item?.endpoint_id,
        checksum: item?.checksum,
      }));
      await this.knex(table_name).insert(rows);
    } else {
      await this.knex.transaction(async (trx) => {
        await trx(table_name).del();

        const rows = data.map((item) => ({
          id: v4(),
          tenant_id: item?.tenant_id,
          correlation_id: item?.correlation_id,
          data: JSON.stringify(item.data),
          endpoint_id: item?.endpoint_id,
          checksum: item?.checksum,
        }));

        await trx(table_name).insert(rows);
      });
    }
  }
}
