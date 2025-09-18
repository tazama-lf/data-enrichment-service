import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Knex } from 'knex';
import { ExecutorService } from '../executor/executor.service';
import { CreateJob, Job } from './interfaces';

@Injectable()
export class JobService {
  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private executorService: ExecutorService,
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
  ) {}

  async onModuleInit() {
    const jobs = await this.findAll();
    if (jobs) {
      jobs.forEach((job) => void this.addJob(job));
    }
  }

  async create(job: CreateJob) {
    const [newJob] = await this.knex<Job>('job')
      .insert(job as Job)
      .returning('*');
    this.addJob(newJob);
    return newJob;
  }

  async findAll() {
    return this.knex<Job>('job').select('*');
  }

  async findOne(id: number) {
    const job = await this.knex<Job>('job').where({ id }).first();
    if (!job) {
      throw new NotFoundException('Job Not Found');
    }
    return job;
  }

  addJob(job: Job) {
    const cronJob = new CronJob(job.cronExpression, async () => {
      await this.executorService.run(job);
    });
    const cronName = `job-${job.id ?? Math.random().toString(36).substring(2)}`;
    this.schedulerRegistry.addCronJob(cronName, cronJob as any);
    cronJob.start();
  }

  async runJob(id: number) {
    const job = await this.findOne(id);
    await this.executorService.run(job);
  }
}
