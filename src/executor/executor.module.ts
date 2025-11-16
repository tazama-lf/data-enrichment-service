import { Module } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ScheduleModule.forRoot(), LoggerModule, DatabaseModule, RedisModule, HttpModule, ConfigModule],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
