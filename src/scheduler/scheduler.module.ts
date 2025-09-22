import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ExecutorModule } from '../executor/executor.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  providers: [SchedulerService],
  imports: [ExecutorModule, ScheduleModule.forRoot()],
  exports: [SchedulerService],
})
export class SchedulerModule {}
