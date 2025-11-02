import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { ExecutorModule } from '../executor/executor.module';
import { LoggerModule } from '../logger-service/logger-service.module';
import { RedisModule } from '../redis/redis.module';
import { NotifyService } from './notify.service';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, DatabaseModule, ExecutorModule],
  providers: [NotifyService],
})
export class NotifyModule {}
