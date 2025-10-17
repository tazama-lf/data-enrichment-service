import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { DatabaseModule } from '../database/database.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, DatabaseModule, JobModule],
  providers: [NotifyService],
})
export class NotifyModule {}
