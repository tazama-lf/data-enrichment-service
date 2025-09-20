import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({
  providers: [JobService],
  imports: [ExecutorModule],
  controllers: [JobController],
})
export class JobModule {}
