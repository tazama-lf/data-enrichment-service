import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { CronJob } from 'cron';
import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import SFTPClient from 'ssh2-sftp-client';
import { DatabaseService } from '../database/database.service';
import { FileSettings, HTTPConnection, Job, SFTPConnection } from '../job/types/job-interfaces';
import { decrypt, isValidText } from '../utils/helpers';
import { AuthType, FileType, SourceType } from '../utils/interfaces';
import { CACHE_TTL } from '../utils/constants';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
@Injectable()
export class ExecutorService {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly httpService: HttpService,
  ) {}

  private async handleFailure(job: Job, jobKey: string): Promise<void> {
    const currentFailures = (await this.redis.getMemberValues(jobKey)[0]) ?? 0;
    const newFailures = currentFailures + 1;
    await this.redis.set(jobKey, newFailures, CACHE_TTL);

    if (job.schedule.iterations && newFailures >= job.schedule.iterations) {
      const cronJob = this.schedulerRegistry.getCronJob(jobKey);
      await cronJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }
  }

  private async run(job: Job, jobKey: string): Promise<void> {
    try {
      if (job.source_type === SourceType.HTTP) {
        await this.handleHttpJob(job, jobKey);
      } else {
        await this.handleSftpJob(job, jobKey);
      }
    } catch (error) {
      this.loggerService.error(`Failed to execute job : ${error.message}`);
      await this.handleFailure(job, jobKey);
    }
  }

  private async handleHttpJob(job: Job, jobKey: string): Promise<void> {
    const httpCon = job.connection as HTTPConnection;
    const { data, status } = await firstValueFrom(this.httpService.get(httpCon.url, { headers: httpCon.headers }));

    if (status === 200 && typeof data === 'object') {
      await this.db.updateTable(job.table_name, job.mode, data, httpCon.url);
      await this.redis.set(jobKey, 0, CACHE_TTL);
    } else {
      await this.handleFailure(job, jobKey);
    }
  }

  async createSftpConnection(sftpCon: SFTPConnection): Promise<SFTPClient> {
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
      return sftp;
    } catch (err) {
      throw new Error(`SFTP connection failed: ${err.message}`);
    }
  }

  private async handleSftpJob(job: Job, jobKey: string): Promise<void> {
    const sftpCon = job.connection as SFTPConnection;
    const file = job.file;
    let sftp = new SFTPClient();

    try {
      sftp = await this.createSftpConnection(sftpCon);
      if (!file?.path) throw new Error('File path not provided in job config');

      const fileExists = await sftp.exists(file.path);
      if (!fileExists) throw new Error(`File ${file.path} not found on SFTP server`);

      const records = await this.transformFileToJSON(sftp, file);
      await this.db.updateTable(job.table_name, job.mode, records, file.path);

      await this.redis.set(jobKey, 0, CACHE_TTL);
    } catch (error) {
      this.loggerService.error(`SFTP error: ${error.message}`);
      await this.handleFailure(job, jobKey);
    } finally {
      sftp.end();
    }
  }

  async transformFileToJSON(sftp: SFTPClient, file: FileSettings): Promise<Record<string, unknown>[]> {
    try {
      const buffer = await sftp.get(file.path);

      let decoded = '';
      try {
        decoded = iconv.decode(buffer, 'utf8');
        if (!isValidText(decoded)) {
          throw new Error('Invalid text after decoding');
        }
      } catch (decodeError) {
        this.loggerService.warn(`Decoding failed : ${decodeError}`);
      }

      if (file.file_type === FileType.JSON) {
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed : [parsed];
      }

      if (file.file_type === FileType.CSV || file.file_type === FileType.TSV) {
        const records = parse(decoded, {
          delimiter: file.file_type === FileType.CSV ? (file.delimiter ?? ',') : '\t',
          columns: (headers: string[]) =>
            headers.map((h) =>
              h
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^\w_]/g, ''),
            ),
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
          quote: '"',
          relax_column_count: true,
          escape: '"',
          record_delimiter: ['\r\n', '\n', '\r'],
        });
        return records as Record<string, unknown>[];
      }

      throw new Error('Unsupported file type');
    } catch (error) {
      this.loggerService.error('Error transforming file:', error);
      throw error;
    }
  }

  async addCronJob(job: Job): Promise<void> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const jobKey = `job-${job.id}-schedule-${job.schedule.id}`;

    const existingJob = this.schedulerRegistry.getCronJobs().get(jobKey);
    if (existingJob) {
      this.loggerService.warn(`Cron job ${jobKey} already exists. Stopping and restarting.`);
      await existingJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }

    await this.redis.set(jobKey, 0, CACHE_TTL);

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
