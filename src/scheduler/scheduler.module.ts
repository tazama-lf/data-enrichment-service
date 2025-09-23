import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ExecutorModule } from '../executor/executor.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerController } from './scheduler.controller';

@Module({
  providers: [SchedulerService],
  imports: [ExecutorModule, ScheduleModule.forRoot()],
  exports: [SchedulerService],
  controllers: [SchedulerController],
})
export class SchedulerModule {}
