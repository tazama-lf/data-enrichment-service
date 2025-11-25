import { Injectable } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { v4 } from 'uuid';
import { Enrichment, IngestMode } from '@tazama-lf/tcs-lib';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseService {
  private readonly pool: Pool;
  private readonly batchSize: number;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.pool = new Pool({
      connectionString: process.env.CONFIGURATION_DATABASE_URL,
      max: 10,
    });
    this.batchSize = this.configService.get<number>('BATCH_SIZE', 1000);
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params);
    return result;
  }

  private async insertPullJobHistory(jobId: string, counts: number, processedCounts: number, exception: string | null): Promise<void> {
    const query = `
    INSERT INTO pull_job_history (jobId, counts, processed_counts, exception)
    VALUES ($1, $2, $3, $4);
  `;

    const params = [jobId, counts, processedCounts, exception];

    try {
      await this.query(query, params);
      this.loggerService.log(`Inserted pull job history for jobId: ${jobId}`);
    } catch (error) {
      this.loggerService.error(`Failed to insert pull_job_history: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  }

  async insertRows(tableName: string, rows: Array<Record<string, unknown>>, jobId: string): Promise<void> {
    let processedCount = 0;
    try {
      if (rows.length === 0) {
        throw new Error('No data provided for insertion.');
      }

      this.loggerService.log(`Inserting rows with length ${rows.length}`);

      const keys = Object.keys(rows[0]);

      for (let i = 0; i < rows.length; i += this.batchSize) {
        const batch = rows.slice(i, i + this.batchSize);

        const placeholders = batch
          .map((_, rowIndex) => `(${keys.map((_, colIndex) => `$${rowIndex * keys.length + colIndex + 1}`).join(', ')})`)
          .join(', ');

        const values = batch.flatMap((row) => keys.map((k) => row[k]));

        const insertQuery = `
        INSERT INTO ${tableName} (${keys.join(', ')})
        VALUES ${placeholders};
      `;

        await this.query(insertQuery, values);
        processedCount += batch.length;
      }

      await this.insertPullJobHistory(jobId, rows.length, processedCount, null);

      this.loggerService.log(`Successfully inserted ${rows.length} row(s) into "${tableName}".`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);

      this.loggerService.error(`Error inserting rows into table "${tableName}": ${errorMsg}`);
      await this.insertPullJobHistory(jobId, rows.length, processedCount, errorMsg);
    }
  }

  async tableExist(tableName: string): Promise<boolean> {
    const cleanName = tableName.trim().toLowerCase();
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = $1
      );
    `;

    const result = await this.pool.query(checkQuery, [cleanName]);
    return !!result.rows[0] || false;
  }

  async ensureTable(tableName: string): Promise<void> {
    try {
      const createQuery = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          data JSONB NOT NULL,
          jobId TEXT NOT NULL,
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
    }
  }

  async ensureTableWithMetaData(tableName: string): Promise<void> {
    try {
      const createQuery = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        data JSONB NOT NULL,
        endpoint_id TEXT NOT NULL,
        checksum TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

      await this.query(createQuery);
      this.loggerService.log(`Table "${tableName}" with metadata created or already exists.`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.loggerService.error(`Error while ensuring metadata table "${tableName}": ${error.message}`);
      } else {
        this.loggerService.error(`Unknown error while ensuring metadata table "${tableName}": ${JSON.stringify(error)}`);
      }
    }
  }

  async updateTable(tableName: string, jobId: string, mode: IngestMode, data: unknown): Promise<void> {
    await this.ensureTable(tableName);
    const arr = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>).flat();

    const rows = arr.map((item) => ({
      id: v4(),
      data: JSON.stringify(item),
      jobId,
    }));

    if (mode === IngestMode.APPEND) {
      await this.insertRows(tableName, rows, jobId);
    } else {
      const deleteQuery = `DELETE FROM ${tableName};`;
      await this.query(deleteQuery);
      await this.insertRows(tableName, rows, jobId);
    }
  }

  async updateTableWithMetaData(tableName: string, jobId: string, mode: IngestMode, data: Enrichment[]): Promise<void> {
    await this.ensureTableWithMetaData(tableName);

    const rows = data.map((item) => ({
      id: v4(),
      tenant_id: item.tenant_id,
      correlation_id: item.correlation_id,
      data: JSON.stringify(item.data),
      endpoint_id: item.endpoint_id,
      checksum: item.checksum,
    }));
    if (mode === IngestMode.APPEND) {
      await this.insertRows(tableName, rows, jobId);
    } else {
      const deleteQuery = `DELETE FROM ${tableName};`;
      await this.query(deleteQuery);
      await this.insertRows(tableName, rows, jobId);
    }
  }
}
