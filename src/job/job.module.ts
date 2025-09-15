import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({
  providers: [JobService],
  imports: [PrismaModule],
  controllers: [JobController]
})
export class JobModule { }
