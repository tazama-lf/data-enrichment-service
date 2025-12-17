import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { ConfigType } from '@tazama-lf/tcs-lib';
import { createHash } from 'node:crypto';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { v4 } from 'uuid';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly loggerService: LoggerService) {
    this.pool = new Pool({
      connectionString: process.env.CONFIGURATION_DATABASE_URL,
      max: 10,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.loggerService.log('Database pool closed');
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params);
    return result;
  }

  private async insertPullJobHistory(
    jobId: string,
    counts: number,
    processedCounts: number,
    exception: string | null,
    tenantId: string,
    type: ConfigType,
  ): Promise<void> {
    const query = `
    INSERT INTO job_history (tenant_id, job_id, counts, processed_counts, exception,job_type)
    VALUES ($1, $2, $3, $4, $5, $6);
  `;

    const params = [tenantId, jobId, counts, processedCounts, exception, type];

    try {
      await this.query(query, params);
      this.loggerService.log(`Inserted job history for jobId: ${jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      this.loggerService.error(`Failed to insert job_history: ${message}`);
      throw Error(message);
    }
  }

  async insertRows(
    tableName: string,
    rows: Array<Record<string, unknown>>,
    jobId: string,
    tenantId: string,
    type: ConfigType,
  ): Promise<void> {
    try {
      if (rows.length === 0) {
        throw new Error('No data provided for insertion.');
      }

      this.loggerService.log(`Inserting rows with length ${rows.length}`);

      const keys = Object.keys(rows[0]);

      if (keys.length === 0) {
        throw new Error('No columns found in the data for insertion.');
      }

      const query = 'CALL rotate_table_with_data($1, $2::jsonb)';

      await this.query(query, [tableName, JSON.stringify(rows)]);

      await this.insertPullJobHistory(jobId, rows.length, rows.length, null, tenantId, type);

      this.loggerService.log(`Successfully inserted ${rows.length} row(s) into "${tableName}".`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);

      this.loggerService.error(`Error inserting rows into table "${tableName}": ${errorMsg}`);
      await this.insertPullJobHistory(jobId, rows.length, 0, errorMsg, tenantId, type);
      throw new Error(errorMsg);
    }
  }

  async ensureTable(tableName: string): Promise<void> {
    try {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
      }

      const safeTableName = `"${tableName.replace(/"/g, '""')}"`;

      const createQuery = `
        CREATE TABLE IF NOT EXISTS ${safeTableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          data JSONB NOT NULL,
          job_id TEXT NOT NULL,
          checksum TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `;
      await this.query(createQuery);
      this.loggerService.log(`Table "${tableName}" created or already exists.`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.loggerService.error(`Error while ensuring table "${tableName}": ${error.message}`);
      } else {
        this.loggerService.error(`Unknown error while ensuring table "${tableName}": ${JSON.stringify(error)}`);
      }
      throw error;
    }
  }

  async updateTable(tableName: string, jobId: string, data: unknown, tenantId: string, type: ConfigType): Promise<void> {
    await this.ensureTable(tableName);
    const arr = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>).flat();

    const rows = arr.map((item) => ({
      id: v4(),
      data: JSON.stringify(item),
      checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
      job_id: jobId,
    }));

    await this.insertRows(tableName, rows, jobId, tenantId, type);
  }
}
