import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  providers: [JobService],
  imports: [ExecutorModule, SchedulerModule],
  controllers: [JobController],
})
export class JobModule {}
