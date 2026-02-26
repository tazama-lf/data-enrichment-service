import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ConfigurationDB,
  CreateDatabaseManager,
  type DatabaseManagerInstance,
  type EnrichmentDB,
  LoggerService,
  type ManagerConfig,
} from '@tazama-lf/frms-coe-lib';
import { ConfigType, IngestMode } from '@tazama-lf/tcs-lib';
import { createHash } from 'node:crypto';
import { v4 } from 'uuid';
import { ErrorPattern } from '../utils/common';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private DbManager: (DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB) | null = null;
  private readonly batchSize: number;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('BATCH_SIZE') ?? 1000;
  }

  async onModuleInit(): Promise<void> {
    await this.initDb();
  }

  private async initDb(): Promise<void> {
    try {
      const dbHost = this.configService.get<string>('DB_HOST')!;
      const dbPort = this.configService.get<number>('DB_PORT')!;
      const dbUser = this.configService.get<string>('DB_USER')!;
      const dbPassword = this.configService.get<string>('DB_PASSWORD')!;
      const dbCertPath = this.configService.get<string>('DB_CERT_PATH') ?? '';

      const config: ManagerConfig = {
        configuration: {
          host: dbHost,
          port: dbPort,
          databaseName: 'configuration',
          user: dbUser,
          password: dbPassword,
          certPath: dbCertPath,
        },
        enrichment: {
          host: dbHost,
          port: dbPort,
          databaseName: 'enrichment',
          user: dbUser,
          password: dbPassword,
          certPath: dbCertPath,
        },
      };

      this.DbManager = (await CreateDatabaseManager(config)) as DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB;
      this.loggerService.log('Database manager initialized successfully', this.log_context);
    } catch (error) {
      this.loggerService.error(`Failed to initialize Database manager: ${String(error)}`, this.log_context);
      throw error;
    }
  }

  private readonly log_context = DatabaseService.name;
  ERROR_PATTERNS: ErrorPattern[] = [
    {
      pattern: 'unique constraint',
      exception: ConflictException,
      log: 'warn',
      getMessage: (context: string, additionalInfo?: Record<string, unknown>) => {
        const details = additionalInfo?.details
          ? typeof additionalInfo.details === 'string'
            ? additionalInfo.details
            : JSON.stringify(additionalInfo.details)
          : '';
        return `Duplicate ${context}: ${details}`;
      },
    },
    {
      pattern: 'foreign key constraint',
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string, additionalInfo?: Record<string, unknown>) => {
        const details = additionalInfo?.details
          ? typeof additionalInfo.details === 'string'
            ? additionalInfo.details
            : JSON.stringify(additionalInfo.details)
          : '';
        return `Invalid reference in ${context}: ${details}`;
      },
    },
    {
      pattern: 'invalid input syntax',
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string) => `Invalid data format in ${context}`,
    },
    {
      pattern: 'connection',
      exception: InternalServerErrorException,
      log: 'error',
      getMessage: (context: string) => `Database connection failed while ${context}`,
    },
    {
      pattern: 'disk full',
      exception: InternalServerErrorException,
      log: 'error',
      getMessage: (context: string) => `Insufficient storage space while ${context}`,
    },
    {
      pattern: 'relation',
      condition: (msg: string) => msg.includes('relation') && msg.includes('does not exist'),
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string) => `Table does not exist for ${context}`,
    },
    {
      pattern: 'duplicate key',
      exception: ConflictException,
      log: 'warn',
      getMessage: (context: string) => `Duplicate entry in ${context}`,
    },
  ];

  private handleDatabaseError(error: unknown, context: string, additionalInfo?: Record<string, unknown>): never {
    const errorMessage = String(error);

    for (const errorPattern of this.ERROR_PATTERNS) {
      const matches = errorPattern.condition ? errorPattern.condition(errorMessage) : errorMessage.includes(errorPattern.pattern);

      if (matches) {
        const message = errorPattern.getMessage(context, additionalInfo);
        const logMsg = `${context}: ${message} - ${errorMessage}`;
        if (errorPattern.log === 'warn') this.loggerService.warn(logMsg, this.log_context);
        else this.loggerService.error(logMsg, this.log_context);
        const ExceptionConstructor = errorPattern.exception;
        throw new ExceptionConstructor(message);
      }
    }

    this.loggerService.error(`${context}: Unexpected error - ${errorMessage}`, this.log_context);
    throw new InternalServerErrorException(`Failed to ${context}`);
  }

  async getPushJobByPath(path: string, tenantId: string): Promise<Record<string, unknown> | undefined> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      this.loggerService.log(`Getting Push job: ${path} for tenant: ${tenantId}`, this.log_context);
      return await this.DbManager.getPathPushJob(path, tenantId);
    } catch (error) {
      this.handleDatabaseError(error, 'push job', {
        details: `push job ${path} for tenant ${tenantId}`,
      });
    }
  }

  async getDefaultPushJob(): Promise<Array<Record<string, unknown>>> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      this.loggerService.log('Getting default Push job', this.log_context);
      return await this.DbManager.getDefaultPushJob();
    } catch (error) {
      this.handleDatabaseError(error, 'push job', {
        details: 'push job',
      });
    }
  }

  async getPushJobById(type: ConfigType, id: string): Promise<Record<string, unknown> | undefined> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      this.loggerService.log(`Getting Push job for id: ${id}`, this.log_context);
      return await this.DbManager.getIdPushJob(type, id);
    } catch (error) {
      this.handleDatabaseError(error, 'push job', {
        details: `push job for tenant ${id}`,
      });
    }
  }

  async insertRows(
    tableName: string,
    rows: Array<Record<string, unknown>>,
    jobId: string,
    tenantId: string,
    type: ConfigType,
  ): Promise<void> {
    let processedCount = 0;
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      if (rows.length === 0) {
        throw new Error('No data provided for insertion.');
      }

      const keys = Object.keys(rows[0]);
      if (keys.length === 0) {
        throw new Error('No columns found in the data for insertion.');
      }

      const invalidKeys = keys.filter((key) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
      if (invalidKeys.length > 0) {
        throw new Error(`Invalid column name(s): ${invalidKeys.join(', ')}`);
      }

      this.loggerService.log(`Inserting ${rows.length} rows with ${keys.length} columns`);

      for (let i = 0; i < rows.length; i += this.batchSize) {
        const batch = rows.slice(i, i + this.batchSize);

        const placeholders = batch
          .map((_, rowIndex) => `(${keys.map((_, colIndex) => `$${rowIndex * keys.length + colIndex + 1}`).join(', ')})`)
          .join(', ');

        const values = batch.flatMap((row) => keys.map((k) => row[k]));

        const quotedKeys = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(', ');
        const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
        const insertQuery = `
          INSERT INTO ${quotedTable} (${quotedKeys})
          VALUES ${placeholders};
        `;

        await this.DbManager.ingestData(insertQuery, values);
        processedCount += batch.length;
      }

      await this.insertPullJobHistory(jobId, rows.length, processedCount, null, tenantId, type);

      this.loggerService.log(`Successfully inserted ${rows.length} row(s) into "${tableName}".`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);

      this.loggerService.error(`Error inserting rows into table "${tableName}": ${errorMsg}`);
      await this.insertPullJobHistory(jobId, rows.length, processedCount, errorMsg, tenantId, type);
      throw new Error(errorMsg);
    }
  }

  async insertPullJobHistory(
    jobId: string,
    counts: number,
    processedCounts: number,
    exception: string | null,
    tenantId: string,
    type: ConfigType,
  ): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      await this.DbManager.insertJobHistory(tenantId, jobId, counts, processedCounts, exception, type);
      this.loggerService.log(`Inserted job history for jobId: ${jobId}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'insert job history', {
        details: `jobId ${jobId} for tenant ${tenantId}`,
      });
    }
  }

  async ensureTable(tableName: string): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
      }

      const safeTableName = `"${tableName.replace(/"/g, '""')}"`;

      await this.DbManager.createTable(safeTableName);
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

  async updateTable(tableName: string, jobId: string, mode: IngestMode, data: unknown, tenantId: string, type: ConfigType): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      await this.ensureTable(tableName);
      const arr = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];

      if (arr.length === 0) {
        throw new Error('No valid data provided for table update.');
      }
      const rows = arr.map((item) => ({
        id: v4(),
        data: JSON.stringify(item),
        checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
        job_id: jobId,
      }));

      if (mode === IngestMode.APPEND) {
        await this.insertRows(tableName, rows, jobId, tenantId, type);
      } else {
        await this.DbManager.deleteRows(tableName);
        await this.insertRows(tableName, rows, jobId, tenantId, type);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.loggerService.error(`Error while updating table "${tableName}": ${error.message}`);
      } else {
        this.loggerService.error(`Unknown error while updating table "${tableName}": ${JSON.stringify(error)}`);
      }
      throw error;
    }
  }
}
