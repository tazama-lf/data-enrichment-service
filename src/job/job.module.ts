import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  providers: [JobService],
  imports: [ExecutorModule, LoggerModule, DatabaseModule, RedisModule, NotifyModule],
  controllers: [JobController],
  exports: [JobService],
})
export class JobModule { }
