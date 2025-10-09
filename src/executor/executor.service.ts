import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import axios from 'axios';
import { CronJob } from 'cron';
import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import SFTPClient from 'ssh2-sftp-client';
import { DatabaseService } from '../database/database.service';
import { CreatePullJobDto } from '../job/dto/create-pull-job.dto';
import { FileSettings, HTTPConnection, Job, SFTPConnection } from '../job/types/job-interfaces';
import { decrypt, isValidText } from '../utils/helpers';
import { AuthType, FileType, SourceType } from '../utils/interfaces';
@Injectable()
export class ExecutorService {
  private readonly failureCounters = new Map<string, number>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
  ) {}

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
      await this.db.updateTable(job.table_name, job.mode, data, httpCon.url);
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

      const records = await this.transformFileToJSON(sftp, file);
      await this.db.updateTable(job.table_name, job.mode, records, file.path);

      this.failureCounters.set(jobKey, 0);
    } catch (error: any) {
      this.loggerService.error(`SFTP error: ${error.message}`);
      await this.handleFailure(job, jobKey);
    } finally {
      sftp.end();
    }
  }

  private async dryRunHttpJob(job: CreatePullJobDto): Promise<any> {
    const httpCon = job.connection as HTTPConnection;
    const { data, status } = await axios.get(httpCon.url, { headers: httpCon.headers });

    if (status !== 200) {
      throw new Error(`HTTP source returned status ${status}`);
    }

    if (data === undefined || data === null) {
      throw new Error(`No data received from HTTP source ${httpCon.url}`);
    }

    const isValidType = typeof data === 'object' && !Array.isArray(data) ? true : Array.isArray(data);

    if (!isValidType) {
      throw new Error(`Invalid data type received from HTTP source: expected object or array, got ${typeof data}`);
    }
  }

  private async dryRunSftpJob(job: CreatePullJobDto): Promise<any> {
    const sftpCon = job.connection as SFTPConnection;
    const file = job.file;
    const sftp = new SFTPClient();

    try {
      try {
        if (sftpCon.auth_type === AuthType.USERNAME_PASSWORD) {
          await sftp.connect({
            host: sftpCon.host,
            port: sftpCon.port,
            username: sftpCon.user_name,
            password: sftpCon.password,
          });
        } else {
          await sftp.connect({
            host: sftpCon.host,
            port: sftpCon.port,
            username: sftpCon.user_name,
            privateKey: sftpCon.private_key,
          });
        }
      } catch (connErr: any) {
        throw new Error(`Failed to connect to SFTP server ${sftpCon.host}:${sftpCon.port} — ${connErr.message}`);
      }

      if (!file?.path) throw new Error('File path not provided in job config');
      const fileExists = await sftp.exists(file.path);
      if (!fileExists) throw new Error(`File ${file.path} not found on SFTP server`);

      const records = await this.transformFileToJSON(sftp, file);

      if (!records) {
        this.loggerService.warn(`No data found in provided file with path :${file.path} `);
        throw new Error(`No data found in provided file with path :${file.path} `);
      }
    } finally {
      sftp.end();
    }
  }

  async transformFileToJSON(sftp: SFTPClient, file: FileSettings): Promise<any> {
    try {
      const buffer = await sftp.get(file.path);

      let decoded: string;
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
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
          quote: '"',
          relax_column_count: true,
          escape: '"',
          record_delimiter: ['\r\n', '\n', '\r'],
        });
        return records;
      }

      throw new Error('Unsupported file type');
    } catch (error) {
      this.loggerService.error('Error transforming file:', error);
      throw error;
    }
  }

  async dryRun(job: CreatePullJobDto): Promise<any> {
    try {
      if (job.source_type === SourceType.HTTP) {
        return await this.dryRunHttpJob(job);
      } else if (job.source_type === SourceType.SFTP) {
        return await this.dryRunSftpJob(job);
      }
    } catch (error: any) {
      this.loggerService.error(`Dry run failed: ${error.message}`);
      throw new Error(`Dry run failed: ${error.message}`);
    }
  }

  addCronJob(job: Job): void {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const jobKey = `job-${job.id}-schedule-${job.schedule.id}`;

    const existingJob = this.schedulerRegistry.getCronJobs().get(jobKey);
    if (existingJob) {
      this.loggerService.warn(`Cron job ${jobKey} already exists. Stopping and restarting.`);
      existingJob.stop();
      this.schedulerRegistry.deleteCronJob(jobKey);
    }

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
