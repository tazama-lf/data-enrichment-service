import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import {
  AuthType,
  ConfigType,
  type FileSettings,
  FileType,
  HTTPConnection,
  type Job,
  type SFTPConnection,
  SourceType,
} from '@tazama-lf/tcs-lib';
import { CronJob } from 'cron';
import { parse } from 'csv-parse';
import * as iconv from 'iconv-lite';
import { firstValueFrom } from 'rxjs';
import SFTPClient from 'ssh2-sftp-client';
import { ApmSpan } from '../apm/apm.decorators';
import { DatabaseService } from '../database/database.service';
import { decrypt, getJobKey, isValidText } from '../utils/helpers';
import { pipeline } from 'node:stream/promises';

@Injectable()
export class ExecutorService {
  private readonly cacheTtl: number;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
  }

  @ApmSpan('data-pull-failure')
  async handleFailure(job: Job, jobKey: string): Promise<void> {
    const value = await this.redis.getJson(jobKey);
    const parsed = Number(value);
    const currentFailures = isNaN(parsed) ? 0 : parsed;
    const newFailures = currentFailures + 1;
    await this.redis.set(jobKey, newFailures, this.cacheTtl);

    if (job.iterations && newFailures >= job.iterations) {
      const cronJob = this.schedulerRegistry.getCronJobs().get(jobKey);
      if (cronJob) {
        await cronJob.stop();
        this.schedulerRegistry.deleteCronJob(jobKey);
      }
    }
  }

  @ApmSpan('data-pull-run')
  async run(job: Job, jobKey: string): Promise<void> {
    try {
      if (job.source_type === SourceType.HTTP) {
        await this.handleHttpJob(job, jobKey);
      } else {
        await this.handleSftpJob(job, jobKey);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(message);
      await this.handleFailure(job, jobKey);
    }
  }

  @ApmSpan('data-pull-http')
  async handleHttpJob(job: Job, jobKey: string): Promise<void> {
    const httpCon = job.connection as HTTPConnection;
    const httpTimeout = this.configService.get<number>('HTTP_TIMEOUT', 30000);

    const { data, status } = await firstValueFrom(
      this.httpService.get<unknown>(httpCon.url, {
        headers: httpCon.headers,
        timeout: httpTimeout,
      }),
    );

    const isSuccessfulResponse = status >= 200 && status < 300;

    if (isSuccessfulResponse) {
      if (data !== null && data !== undefined && typeof data === 'object') {
        await this.db.updateTable(
          `${job.tenant_id}_${job.table_name}`.toLowerCase(),
          job.id,
          job.mode,
          data,
          job.tenant_id,
          ConfigType.PULL,
        );
      }
      await this.redis.set(jobKey, 0, this.cacheTtl);
    } else {
      await this.handleFailure(job, jobKey);
    }
  }

  @ApmSpan('sftp-connection')
  async createSftpConnection(sftpCon: SFTPConnection): Promise<SFTPClient> {
    const sftp = new SFTPClient();
    const config = {
      host: sftpCon.host,
      port: sftpCon.port,
      username: sftpCon.user_name,
    };
    try {
      if (sftpCon.auth_type === AuthType.USERNAME_PASSWORD) {
        if (!sftpCon.password) {
          throw new Error('Password required for USERNAME_PASSWORD auth type');
        }
        await sftp.connect({ ...config, password: decrypt(sftpCon.password) });
      } else {
        if (!sftpCon.private_key) {
          throw new Error('Private key required for PRIVATE_KEY auth type');
        }
        await sftp.connect({ ...config, privateKey: decrypt(sftpCon.private_key) });
      }
      return sftp;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(message);
      throw new Error(`SFTP connection failed: ${message}`);
    }
  }

  @ApmSpan('data-pull-sftp')
  async handleSftpJob(job: Job, jobKey: string): Promise<void> {
    const sftpCon = job.connection as SFTPConnection;
    const { file } = job;
    let sftp = new SFTPClient();

    try {
      sftp = await this.createSftpConnection(sftpCon);
      if (!file?.path) throw new Error('File path not provided in job config');

      const fileExists = await sftp.exists(file.path);
      if (!fileExists) throw new Error(`File ${file.path} not found on SFTP server`);

      const records = await this.transformFileToJSON(sftp, file);
      await this.db.updateTable(
        `${job.tenant_id}_${job.table_name}`.toLowerCase(),
        job.id,
        job.mode,
        records,
        job.tenant_id,
        ConfigType.PULL,
      );

      await this.redis.set(jobKey, 0, this.cacheTtl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(`SFTP error: ${message}`);
      await this.handleFailure(job, jobKey);
    } finally {
      try {
        await sftp.end();
      } catch (cleanupErr: unknown) {
        const cleanupMessage = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        this.loggerService.warn(`SFTP cleanup error (non-critical): ${cleanupMessage}`);
      }
    }
  }

  @ApmSpan('transform-file-json')
  async transformFileToJSON(sftp: SFTPClient, file: FileSettings): Promise<Array<Record<string, unknown>>> {
    const records: Array<Record<string, unknown>> = [];

    try {
      const readStream = sftp.createReadStream(file.path, {
        autoClose: true,
      });

      if (file.file_type === FileType.JSON) {
        const chunks: Buffer[] = [];

        await pipeline(readStream, async function (source) {
          for await (const chunk of source) {
            chunks.push(chunk as Buffer);
          }
        });

        const buffer = Buffer.concat(chunks);
        const decoded = iconv.decode(buffer, 'utf8');

        if (!isValidText(decoded)) {
          throw new Error('Invalid text after decoding');
        }

        const raw: unknown = JSON.parse(decoded);
        if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
        if (typeof raw === 'object' && raw !== null) {
          return [raw as Record<string, unknown>];
        }
        return [];
      }

      const delimiter = file.file_type === FileType.CSV ? (file.delimiter ?? ',') : '\t';

      const parser = parse({
        delimiter,
        columns: (headers: string[]) =>
          headers.map((h) =>
            h
              .trim()
              .toLowerCase()
              .replace(/\s/g, '_')
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

      await pipeline(readStream, iconv.decodeStream('utf8'), parser, async function (source) {
        for await (const record of source) {
          records.push(record as Record<string, unknown>);
        }
      });

      return records;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(`Error transforming file: ${message}`);
      throw error;
    }
  }

  @ApmSpan('cron-job-delete')
  async deleteCronJob(jobId: string, scheduleId: string): Promise<void> {
    this.loggerService.log('Executing Delete cron Job');

    const jobKey = getJobKey(jobId, scheduleId);
    const existingJob = this.schedulerRegistry.getCronJobs().get(jobKey);
    if (existingJob) {
      this.loggerService.warn(`Cron job ${jobKey} exists. Stopping.`);
      await existingJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }
  }

  @ApmSpan('cron-job-schedule')
  async addCronJob(job: Job): Promise<void> {
    this.loggerService.log('Executing add cron Job');

    if (!job.schedule_id || !job.cron) {
      throw new Error(`Cannot schedule job ${job.id}: missing schedule_id or cron expression`);
    }

    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    const jobKey = getJobKey(job.id, job.schedule_id);

    const existingJob = this.schedulerRegistry.getCronJobs().get(jobKey);
    if (existingJob) {
      this.loggerService.warn(`Cron job ${jobKey} already exists. Stopping and replacing.`);
      await existingJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }

    await this.redis.set(jobKey, 0, this.cacheTtl);

    const cronJob: CronJob = new CronJob(
      job.cron,
      async () => {
        await this.run(job, jobKey);
      },
      null,
      false,
      timeZone,
    );

    this.schedulerRegistry.addCronJob(jobKey, cronJob);
    cronJob.start();
    this.loggerService.log(`Cron Job Scheduled with key ${jobKey}`);
  }
}
