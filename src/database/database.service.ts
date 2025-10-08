import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Knex } from 'knex';
import { IngestMode } from '../utils/interfaces';
import { v4 } from 'uuid';
import { Enrichment } from '../job/types/job-interfaces';

@Injectable()
export class DatabaseService {
  constructor(
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
    private readonly loggerService: LoggerService,
  ) {}

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
    } catch (err: any) {
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
    } catch (err: any) {
      if (err.message.includes('already exists')) {
        this.loggerService.log(`Table ${tableName} already created, ignoring...`);
      } else {
        this.loggerService.error(err.message);
      }
    }
    return;
  }

  async tableExist(tableName: string): Promise<boolean> {
    return this.knex.schema.hasTable(tableName.trim().toLowerCase());
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
    } else if (mode === IngestMode.REPLACE) {
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
        data: JSON.stringify(item),
        endpoint_id: item?.endpoint_id,
        checksum: item?.checksum,
      }));
      await this.knex(table_name).insert(rows);
    } else if (mode === IngestMode.REPLACE) {
      await this.knex.transaction(async (trx) => {
        await trx(table_name).del();

        const rows = data.map((item) => ({
          id: v4(),
          tenant_id: item?.tenant_id,
          correlation_id: item?.correlation_id,
          data: JSON.stringify(item),
          endpoint_id: item?.endpoint_id,
          checksum: item?.checksum,
        }));

        await trx(table_name).insert(rows);
      });
    }
  }
}
