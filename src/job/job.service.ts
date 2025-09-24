import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Knex } from 'knex';
import { CreateJobDto, SFTPConnectionDto } from './dto/create-job.dto';
import { Job } from './types/job-interfaces';
import { UpdateJobStatusDto } from './dto/update-status.dto';
import { SchedulerService } from '../scheduler/scheduler.service';
import { ExecutorService } from '../executor/executor.service';
import { JobStatus, SourceType } from '../utils/interfaces';

@Injectable()
export class JobService {
  constructor(
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
    private readonly configService: ConfigService,
    private readonly scheduleService: SchedulerService,
    private readonly executorService: ExecutorService,
  ) {}

  async onModuleInit() {
    const jobs = await this.findAll();
    if (jobs) {
      jobs.filter((opt) => opt.job_status === JobStatus.INPROGRESS).forEach((job) => void this.execute(job.id));
    }
  }

  async create(job: CreateJobDto) {
    try {
      let connection = job.connection;

      if (job.source_type === SourceType.SFTP) {
        const sftpConn = connection as SFTPConnectionDto;
        if (sftpConn.password) {
          const saltRounds = Number(this.configService.get<string>('SALT_ROUNDS') ?? 10);
          connection = {
            ...sftpConn,
            password: await bcrypt.hash(sftpConn.password, saltRounds),
          };
        }
      }

      const [newJob] = await this.knex('job')
        .insert({ ...job, connection })
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

  async findAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const [data] = await Promise.all([
      this.knex('job').select('*').limit(limit).offset(offset).orderBy('created_at', 'desc'),
      this.knex('job').count('* as count'),
    ]);

    return data;
  }

  async findOne(id: number) {
    const job = await this.knex<Job>('job').where({ id }).first();

    if (!job) {
      throw new NotFoundException('Job Not Found');
    }
    return job;
  }

  async execute(id: number) {
    const res = await this.findOne(id);
    const schedule = await this.scheduleService.findOne(res.schedule_id);
    this.executorService.addCronJob({ ...res, schedule });
  }

  async updateStatus(id: number, job: UpdateJobStatusDto) {
    await this.knex<Job>('job').where({ id }).update({ job_status: job.job_status });

    if (job.job_status === JobStatus.INPROGRESS) {
      this.execute(id);
    }
  }
}
