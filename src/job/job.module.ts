import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { ExecutorModule } from '../executor/executor.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  providers: [JobService],
  imports: [PrismaModule, ExecutorModule, ScheduleModule.forRoot(),],
  controllers: [JobController]
})
export class JobModule { }
