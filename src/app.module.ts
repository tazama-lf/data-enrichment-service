import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import { ExecutorModule } from './executor/executor.module';
import { JobModule } from './job/job.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { KnexModule } from '../knex/knex.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validate,
    }),
    JobModule,
    ExecutorModule,
    KnexModule,
    SchedulerModule,
    LoggerModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
