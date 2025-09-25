import { Module } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot(), LoggerModule],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
