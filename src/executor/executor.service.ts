import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import axios from 'axios';
import { CronJob } from 'cron';
import { parse } from 'csv-parse/sync';
import knex, { Knex } from 'knex';
import SFTPClient from 'ssh2-sftp-client';
import { HTTPConnection, Job, SFTPConnection } from '../job/types/job-interfaces';
import { EncodingType, FileType, SourceType } from '../utils/interfaces';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

@Injectable()
export class ExecutorService {
  private knex: Knex;
  private readonly failureCounters = new Map<string, number>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly loggerService: LoggerService,
  ) {
    this.knex = knex({
      client: 'pg',
      connection: process.env.DATABASE_URL,
    });
  }

  private async ensureTable(tableName: string, data: any) {
    try {
      const exists = await this.knex.schema.hasTable(tableName);
      if (!exists) {
        await this.knex.schema.createTable(tableName, (table) => {
          table.increments('id').primary();
          table.jsonb('data').notNullable();
          table.timestamps(true, true);
        });
      }
    } catch (err: any) {
      if (err.message.includes('already exists')) {
        this.loggerService.log(`Table ${tableName} already created, ignoring...`);
      } else {
        throw err;
      }
    }
    return this.knex(tableName).insert({ data }).returning('*');
  }

  private async handleFailure(job: Job, jobKey: string) {
    const currentFailures = this.failureCounters.get(jobKey) ?? 0;
    const newFailures = currentFailures + 1;
    this.failureCounters.set(jobKey, newFailures);

    if (job.schedule.iterations && newFailures >= job.schedule.iterations) {
      const cronJob = this.schedulerRegistry.getCronJob(jobKey);
      cronJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }
  }

  private async run(job: Job, jobKey: string) {
    try {
      const connection = job.connection;
      if (job.source_type === SourceType.HTTP) {
        const httpCon = connection as HTTPConnection;
        const { data, status } = await axios({ method: 'get', url: httpCon.url, headers: httpCon.headers });
        if (typeof data === 'object' && status === 200) {
          await this.ensureTable(job.table_name, data.users[0]);
          this.failureCounters.set(jobKey, 0);
        } else {
          await this.handleFailure(job, jobKey);
        }
      } else if (job.source_type === SourceType.SFTP) {
        const sftpCon = connection as SFTPConnection;
        const file = job.file;
        const sftp = new SFTPClient();
        try {
          await sftp.connect({
            host: sftpCon.host,
            port: sftpCon.port,
            username: sftpCon.user_name,
            password: 'password',
          });

          const filePath = file?.path;
          if (!filePath) {
            this.loggerService.error('File path not provided in job config');
            throw new Error('File path not provided in job config');
          }

          const fileExists = await sftp.exists(filePath);
          if (!fileExists) {
            this.loggerService.error('File path not found on SFTP server');
            throw new Error(`File ${filePath} not found on SFTP server`);
          }

          const fileContent = await sftp.get(filePath);
          const buffer = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent.toString());

          const encoding: BufferEncoding = (file.encoding?.toLowerCase() as BufferEncoding) || EncodingType.UTF8;

          const rawContent = buffer.toString(encoding);

          let records: any[] = [];

          switch (file.file_type) {
            case FileType.CSV:
              records = parse(rawContent, {
                delimiter: file.delimiter || ',',
                columns: file.header,
                skip_empty_lines: true,
                trim: true,
              });
              break;

            case FileType.TSV:
              records = parse(rawContent, {
                delimiter: '\t',
                columns: file.header,
                skip_empty_lines: true,
                trim: true,
              });
              break;

            case FileType.JSON:
              try {
                const parsed = JSON.parse(rawContent);
                records = Array.isArray(parsed) ? parsed : [parsed];
              } catch (error) {
                this.loggerService.error(`Unable to parse JSON :  ${error.message}`);
              }
              break;

            default:
              throw new Error('Unsupported file type');
          }

          for (const row of records) {
            await this.ensureTable(job.table_name, row);
          }

          this.failureCounters.set(jobKey, 0);
        } catch (error) {
          this.loggerService.error(`SFTP error :  ${error.message}`);
          await this.handleFailure(job, jobKey);
        } finally {
          sftp.end();
        }
      }
    } catch (error) {
      this.loggerService.error(`Failed to execute job : ${error.message}`);
      this.handleFailure(job, jobKey);
    }
  }

  addCronJob(job: Job) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const jobKey = `job-${job.id}-schedule-${job.schedule.id}`;

    this.failureCounters.set(jobKey, 0);

    const cronJob = new CronJob(
      job.schedule.cron,
      async () => {
        await this.run(job, jobKey);
      },
      null,
      true,
      timeZone,
    );

    this.schedulerRegistry.addCronJob(jobKey, cronJob as any);
    cronJob.start();
  }
}
