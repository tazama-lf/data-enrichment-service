import { Injectable } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ExecutorService } from '../executor/executor.service';
import { CronJob } from 'cron';

@Injectable()
export class JobService {
    constructor(private prismaService: PrismaService, private schedulerRegistry: SchedulerRegistry, private executorService: ExecutorService) { }


    async onModuleInit() {
        const jobs = await this.findAll();
        jobs.forEach(job => this.addJob(job as CreateJobDto));
    }

    async create(job: CreateJobDto) {
        const newJob = this.prismaService.job.create({ data: job })
        this.addJob(job);
        return newJob;
    }

    async findAll() {
        return this.prismaService.job.findMany({})
    }

    async addJob(job: CreateJobDto) {
        const cronJob = new CronJob(job.cronExpression, async () => {
            await this.executorService.run(job);
        });
        this.schedulerRegistry.addCronJob(`job-${Math.random().toString()}`, cronJob as any);
        cronJob.start();
    }
}
