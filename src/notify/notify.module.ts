import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { ExecutorModule } from '../executor/executor.module';
import { LoggerModule } from '../logger-service/logger-service.module';
import { RedisModule } from '../redis/redis.module';
import { NotifyService } from './notify.service';
import { JobModule } from '../job/job.module';
import { NotifyController } from './notify.controller';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, DatabaseModule, ExecutorModule, JobModule],
  providers: [NotifyService],
  exports: [NotifyService],
  controllers: [NotifyController],
})
export class NotifyModule {}
