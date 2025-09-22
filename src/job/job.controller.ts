import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Serialize } from '../interceptors/serialize.interceptor';
import { CreateJobDto } from './dto/create-job.dto';
import { JobResponseDto } from './dto/fetch-job.dto';
import { JobService } from './job.service';

@Controller('job')
@Serialize(JobResponseDto)
export class JobController {
  constructor(private jobService: JobService) {}

  @Post('/create')
  async createJob(@Body() job: CreateJobDto) {
    return this.jobService.create(job);
  }

  @Get('/all')
  async getAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.jobService.findAll(Number(page), Number(limit));
  }

  @Get('/:id')
  async getById(@Param('id') id: string) {
    return await this.jobService.findOne(parseInt(id));
  }
}
