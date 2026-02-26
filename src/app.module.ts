import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { ExecutorModule } from './executor/executor.module';
import { JobModule } from './job/job.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { NotifyModule } from './notify/notify.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ApmModule } from './apm/apm.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validate,
    }),
    ScheduleModule.forRoot(),
    JobModule,
    ExecutorModule,
    LoggerModule,
    DatabaseModule,
    RedisModule,
    NotifyModule,
    AuthModule,
    ApmModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
