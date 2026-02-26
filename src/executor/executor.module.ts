import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../logger-service/logger-service.module';
import { RedisModule } from '../redis/redis.module';
import { ExecutorService } from './executor.service';

@Module({
  imports: [LoggerModule, DatabaseModule, RedisModule, HttpModule, ConfigModule],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
