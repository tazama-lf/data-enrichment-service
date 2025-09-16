import { Injectable } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ExecutorService } from '../executor/executor.service';
import { CronJob } from 'cron';

@Injectable()
export class JobService {
    constructor(private prismaService: PrismaService, private schedulerRegistry: SchedulerRegistry, private executorService: ExecutorService) { }

    async create(job: CreateJobDto) {
        const newJob = this.prismaService.job.create({ data: job })

        const cronJob = new CronJob(job.cronExpression, async () => {
            await this.executorService.run(job);
        });
        this.schedulerRegistry.addCronJob(`job`, cronJob as any);
        cronJob.start();
        return newJob;
    }

    async findAll() {
        return this.prismaService.job.findMany({})
    }
}
