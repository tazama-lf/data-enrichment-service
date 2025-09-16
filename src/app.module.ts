import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { JobModule } from './job/job.module';
import { ExecutorModule } from './executor/executor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    JobModule,
    ExecutorModule
  ],
  controllers: [AppController],
  providers: [AppService,PrismaService],
})
export class AppModule { }
