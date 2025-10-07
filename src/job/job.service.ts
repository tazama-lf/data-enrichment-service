import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { Knex } from 'knex';
import { v4 } from 'uuid';
import { ExecutorService } from '../executor/executor.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { encrypt, validateTableName } from '../utils/helpers';
import { AuthType, JobStatus, SourceType } from '../utils/interfaces';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { CreatePullJobDto, SFTPConnectionDto } from './dto/create-pull-job.dto';
import { CreatePushJobDto } from './dto/create-push-job.dto';
import { UpdateJobStatusDto } from './dto/update-status.dto';
import { Enrichment, Job } from './types/job-interfaces';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class JobService {
  constructor(
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
    private readonly scheduleService: SchedulerService,
    private readonly executorService: ExecutorService,
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    const jobs = await this.findAllPull();
    jobs.filter((opt) => opt.job_status === JobStatus.INPROGRESS).forEach((job) => void this.execute(job.id));
  }

  async validateExisting(table_name: string): Promise<void> {
    validateTableName(table_name);
    const exists = (await this.db.tableExist(table_name)) && !!(await this.knex('job').where({ table_name: table_name }).first());
    if (exists) {
      this.loggerService.error('Table Already Exists');
      throw new BadRequestException('Table Already Exists');
    }
  }

  async createPush(job: CreatePushJobDto): Promise<Job> {
    try {
      await this.validateExisting(job.table_name);
      if (!job.path.startsWith('/v1/enrich/')) {
        throw new BadRequestException(`Invalid path format. Path must start with "/v1/enrich/". Received: "${job.path}"`);
      }
      const existing = await this.knex('endpoints').where({ path: job.path }).first();

      if (existing) {
        throw new BadRequestException(`Endpoint "${job.path}" already exists.`);
      }

      const [newJob] = await this.knex('endpoints')
        .insert({ ...job, id: v4() })
        .returning('*');
      await this.db.ensureTable(newJob.table_name);
      return newJob;
    } catch (err) {
      this.loggerService.error(err.message);
      throw new BadRequestException(err.message);
    }
  }

  async createEnrich(req: Request, body: CreateEnrichDataDto): Promise<{ message: string; status: number }> {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      throw new BadRequestException('Content-Type must be application/json');
    }

    const cleanedPath = req.path.replace(/^\/job/, '');
    const existing = await this.knex('endpoints').where({ path: cleanedPath }).first();
    if (!existing) {
      throw new NotFoundException('Invalid Path');
    }

    if (existing.job_status === JobStatus.PENDING) {
      throw new BadRequestException('Endpoint Not Approved');
    }

    await this.db.ensureTable(existing.table_name);

    const correlation_id = v4();
    const tenant_id = Math.round(Math.random() * 9999).toString();
    const payload: Enrichment[] = (Array.isArray(body.data) ? body.data : [body.data]).map((item) => ({
      tenant_id,
      correlation_id,
      data: item,
      endpoint_id: existing.id,
      checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
    }));

    await this.db.updateTableWithMetaData(existing.table_name, existing.mode, payload);

    return {
      message: 'Data Enriched Successfully',
      status: 200,
    };
  }

  async createPull(job: CreatePullJobDto): Promise<Job> {
    try {
      await this.validateExisting(job.table_name);

      const exist = await this.knex('schedule').where({ id: job.schedule_id }).first();
      if (!exist) {
        throw new BadRequestException(`Schedule Id of ${job.schedule_id} not found`);
      }

      let connection = job.connection;
      if (job.source_type === SourceType.SFTP) {
        const sftpConn = connection as SFTPConnectionDto;
        if (sftpConn.auth_type === AuthType.USERNAME_PASSWORD && sftpConn.password) {
          connection = {
            ...sftpConn,
            password: encrypt(sftpConn.password),
          };
        } else if (sftpConn.private_key) {
          connection = {
            ...sftpConn,
            private_key: encrypt(sftpConn.private_key),
          };
        }
      }

      const [newJob] = await this.knex('job')
        .insert({ ...job, id: v4(), connection })
        .returning('*');

      return newJob;
    } catch (err) {
      if (Array.isArray(err)) {
        const messages = err.flatMap((e) => Object.values(e.constraints ?? {}));
        throw new BadRequestException(messages);
      }
      throw new BadRequestException(err.message || 'Invalid request payload');
    }
  }

  async findAllPull(): Promise<Job[]> {
    const data = await this.knex('job').select('*').orderBy('created_at', 'desc');
    return data;
  }

  async findOnePull(id: string): Promise<Job> {
    const job = await this.knex<Job>('job').where({ id }).first();

    if (!job) {
      this.loggerService.error(`Job with ${id} not Found`);
      throw new NotFoundException('Job Not Found');
    }
    return job;
  }

  async execute(id: string): Promise<void> {
    const res = await this.findOnePull(id);
    const schedule = await this.scheduleService.findOne(res.schedule_id);
    this.executorService.addCronJob({ ...res, schedule });
  }

  async updateStatus(id: string, job: UpdateJobStatusDto): Promise<void> {
    await this.findOnePull(id);
    await this.knex<Job>('job').where({ id }).update({ job_status: job.job_status });

    if (job.job_status === JobStatus.INPROGRESS) {
      await this.execute(id);
    }
  }
}
