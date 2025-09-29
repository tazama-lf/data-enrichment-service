import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Serialize } from '../interceptors/serialize.interceptor';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { CreatePullJobDto } from './dto/create-pull-job.dto';
import { CreatePushJobDto } from './dto/create-push-job.dto';
import { PullJobResponseDto } from './dto/fetch-pull-job.dto';
import { UpdateJobStatusDto } from './dto/update-status.dto';
import { JobService } from './job.service';

@Controller('job')
export class JobController {
  constructor(private jobService: JobService) {}

  @Post('/create/pull')
  @Serialize(PullJobResponseDto)
  async createPullJob(@Body() job: CreatePullJobDto) {
    return this.jobService.createPull(job);
  }

  @Post('/create/push')
  async createPushJob(@Body() job: CreatePushJobDto) {
    return this.jobService.createPush(job);
  }

  @Patch('/:id')
  async updateStatus(@Param('id') id: string, @Body() body: UpdateJobStatusDto) {
    return await this.jobService.updateStatus(id, body);
  }

  @Post('/v1/enrich/*')
  async getEnrich(@Req() req: Request, @Body() body: CreateEnrichDataDto) {
    return await this.jobService.createEnrich(req, body);
  }
}
