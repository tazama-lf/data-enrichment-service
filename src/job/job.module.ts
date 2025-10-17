import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { LoggerModule } from '../logger-service/logger-service.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  providers: [JobService],
  imports: [ExecutorModule, SchedulerModule, LoggerModule, DatabaseModule, RedisModule],
  controllers: [JobController],
  exports: [JobService],
})
export class JobModule {}
