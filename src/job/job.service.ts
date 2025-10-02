import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { Knex } from 'knex';
import { v4 } from 'uuid';
import { ExecutorService } from '../executor/executor.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { encrypt } from '../utils/helpers';
import { AuthType, JobStatus, SourceType } from '../utils/interfaces';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { CreatePullJobDto, SFTPConnectionDto } from './dto/create-pull-job.dto';
import { CreatePushJobDto } from './dto/create-push-job.dto';
import { UpdateJobStatusDto } from './dto/update-status.dto';
import { Enrichment, Job } from './types/job-interfaces';

@Injectable()
export class JobService {
  constructor(
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
    private readonly scheduleService: SchedulerService,
    private readonly executorService: ExecutorService,
  ) {}

  async onModuleInit(): Promise<void> {
    const jobs = await this.findAllPull();
    jobs.filter((opt) => opt.job_status === JobStatus.INPROGRESS).forEach((job) => void this.execute(job.id));
  }

  async createPush(job: CreatePushJobDto): Promise<Job> {
    if (!job.path.startsWith('/v1/enrich/')) {
      throw new BadRequestException(`Invalid path format. Path must start with "/v1/enrich/". Received: "${job.path}"`);
    }
    const existing = await this.knex('endpoints').where({ path: job.path }).first();

    if (existing) {
      throw new BadRequestException(`Endpoint "${job.path}" already exists.`);
    }
    const [newJob] = await this.knex('endpoints').insert(job).returning('*');

    await this.executorService.ensureTable(newJob.table_name);
    return newJob;
  }

  async createEnrich(req: Request, body: CreateEnrichDataDto): Promise<Enrichment[]> {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      throw new BadRequestException('Content-Type must be application/json');
    }

    const cleanedPath = req.path.replace(/^\/job/, '');
    const existing = await this.knex('endpoints').where({ path: cleanedPath }).first();
    if (!existing) {
      throw new NotFoundException('Invalid Path');
    }

    const correlation_id = v4();
    const tenant_id = Math.round(Math.random() * 9999).toString();
    const payload: Enrichment[] = (Array.isArray(body.data) ? body.data : [body.data]).map((item) => ({
      tenant_id,
      correlation_id,
      data: item,
      endpoint_id: existing.id,
      checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
    }));

    return await this.knex<Enrichment>('enrichment').insert(payload).returning('*');
  }

  async createPull(job: CreatePullJobDto): Promise<Job> {
    try {
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
    await this.knex<Job>('job').where({ id }).update({ job_status: job.job_status });

    if (job.job_status === JobStatus.INPROGRESS) {
      await this.execute(id);
    }
  }
}
