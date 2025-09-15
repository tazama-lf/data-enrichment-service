import { Injectable } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class JobService {
    constructor(private prismaService: PrismaService, private schedulerRegistry: SchedulerRegistry) { }

    async create(job: CreateJobDto) {
        const newJob =  this.prismaService.job.create({ data: job })

    //     this.schedulerRegistry.addCronJob(jobName, cronJob);
    // cronJob.start();
    }

    async findAll() {
        return this.prismaService.job.findMany({})
    }
}
