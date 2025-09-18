import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { JobService } from './job.service';
import { CreateJob } from './interfaces';

@Controller('job')
export class JobController {
  constructor(private jobService: JobService) {}

  @Post('/create')
  async createJob(@Body() job: CreateJob) {
    return this.jobService.create(job);
  }

  @Get('/all')
  async getAll() {
    return this.jobService.findAll();
  }

  @Get('/:id')
  async triggerJob(@Param('id') id: string) {
    await this.jobService.runJob(parseInt(id));
    return {
      success: true,
      message: `Job with ID ${id} was triggered successfully`,
    };
  }
}
