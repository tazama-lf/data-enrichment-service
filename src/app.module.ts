import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KnexModule } from '../knex/knex.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import { ExecutorModule } from './executor/executor.module';
import { JobModule } from './job/job.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
