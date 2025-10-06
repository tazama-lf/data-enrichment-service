import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import axios from 'axios';
import { CronJob } from 'cron';
import { parse } from 'csv-parse/sync';
import knex, { Knex } from 'knex';
import SFTPClient from 'ssh2-sftp-client';
import { FileSettings, HTTPConnection, Job, SFTPConnection } from '../job/types/job-interfaces';
import { decrypt } from '../utils/helpers';
import { AuthType, EncodingType, FileType, IngestMode, SourceType } from '../utils/interfaces';
import { v4 } from 'uuid';

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

  async tableExist(tableName: string): Promise<boolean> {
    return this.knex.schema.hasTable(tableName.trim().toLowerCase());
  }

  async updateTable(table_name: string, mode: IngestMode, data: any): Promise<void> {
    await this.ensureTable(table_name);
    const arr = Array.isArray(data) ? data : Object.values(data).flat();

    if (!arr.length) return;

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

  private async handleFailure(job: Job, jobKey: string): Promise<void> {
    const currentFailures = this.failureCounters.get(jobKey) ?? 0;
    const newFailures = currentFailures + 1;
    this.failureCounters.set(jobKey, newFailures);

    if (job.schedule.iterations && newFailures >= job.schedule.iterations) {
      const cronJob = this.schedulerRegistry.getCronJob(jobKey);
      cronJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }
  }

  private async run(job: Job, jobKey: string): Promise<void> {
    try {
      if (job.source_type === SourceType.HTTP) {
        await this.handleHttpJob(job, jobKey);
      } else if (job.source_type === SourceType.SFTP) {
        await this.handleSftpJob(job, jobKey);
      }
    } catch (error) {
      this.loggerService.error(`Failed to execute job : ${error.message}`);
      await this.handleFailure(job, jobKey);
    }
  }

  private async handleHttpJob(job: Job, jobKey: string): Promise<void> {
    const httpCon = job.connection as HTTPConnection;
    const { data, status } = await axios.get(httpCon.url, { headers: httpCon.headers });

    if (status === 200 && typeof data === 'object') {
      await this.updateTable(job.table_name, job.mode, data);
      this.failureCounters.set(jobKey, 0);
    } else {
      await this.handleFailure(job, jobKey);
    }
  }

  private async handleSftpJob(job: Job, jobKey: string): Promise<void> {
    const sftpCon = job.connection as SFTPConnection;
    const file = job.file;
    const sftp = new SFTPClient();

    try {
      if (sftpCon.auth_type === AuthType.USERNAME_PASSWORD) {
        await sftp.connect({
          host: sftpCon.host,
          port: sftpCon.port,
          username: sftpCon.user_name,
          password: decrypt(sftpCon.password),
        });
      } else {
        await sftp.connect({
          host: sftpCon.host,
          port: sftpCon.port,
          username: sftpCon.user_name,
          privateKey: decrypt(sftpCon.private_key),
        });
      }
      if (!file?.path) throw new Error('File path not provided in job config');

      const fileExists = await sftp.exists(file.path);
      if (!fileExists) throw new Error(`File ${file.path} not found on SFTP server`);

      const rawContent = await this.readSftpFile(sftp, file);
      const records = this.parseFile(rawContent, file);

      for (const row of records) {
        await this.updateTable(job.table_name, job.mode, row);
      }

      this.failureCounters.set(jobKey, 0);
    } catch (error: any) {
      this.loggerService.error(`SFTP error: ${error.message}`);
      await this.handleFailure(job, jobKey);
    } finally {
      sftp.end();
    }
  }

  private async readSftpFile(sftp: SFTPClient, file: FileSettings): Promise<string> {
    const fileContent = await sftp.get(file.path);
    const buffer = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent.toString());

    const encoding: BufferEncoding = (file.encoding?.toLowerCase() as BufferEncoding) || EncodingType.UTF8;
    return buffer.toString(encoding);
  }

  private parseFile(content: string, file: FileSettings): string[][] | Record<string, unknown>[] {
    switch (file.file_type) {
      case FileType.CSV:
      case FileType.TSV:
        return parse(content, {
          delimiter: file.file_type === FileType.CSV ? (file.delimiter ?? ',') : '\t',
          columns: file.header,
          skip_empty_lines: true,
          trim: true,
        });
      case FileType.JSON:
        try {
          const parsed = JSON.parse(content);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (error: any) {
          this.loggerService.error(`Unable to parse JSON: ${error.message}`);
          return [];
        }
      default:
        throw new Error('Unsupported file type');
    }
  }

  addCronJob(job: Job): void {
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
