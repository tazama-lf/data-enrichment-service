import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ExecutorService } from '../executor/executor.service';
import { CronJob } from 'cron';
import { Job } from './job.entity';

@Injectable()
export class JobService {
  constructor(
    private prismaService: PrismaService,
    private schedulerRegistry: SchedulerRegistry,
    private executorService: ExecutorService,
  ) {}

  async onModuleInit() {
    const jobs = await this.findAll();
    jobs.forEach((job) => void this.addJob(job as Job));
  }

  async create(job: CreateJobDto) {
    const newJob = await this.prismaService.job.create({ data: job });
    this.addJob(newJob as Job);
    return newJob;
  }

  async findAll() {
    return await this.prismaService.job.findMany({});
  }

  async findOne(id: number) {
    const job = await this.prismaService.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job Not Found');
    }
    return job;
  }

  addJob(job: Job) {
    const cronJob = new CronJob(job.cronExpression, async () => {
      await this.executorService.run(job);
    });
    this.schedulerRegistry.addCronJob(`job-${Math.random().toString()}`, cronJob as any);
    cronJob.start();
  }

  async runJob(id: number) {
    const job = await this.findOne(id);
    await this.executorService.run(job as Job);
  }
}
