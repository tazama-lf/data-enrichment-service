import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { JobService } from './job.service';

@Controller('job')
export class JobController {
  constructor(private jobService: JobService) {}

  @Post('/v1/enrich/*')
  async getEnrich(@Req() req: Request, @Body() body: CreateEnrichDataDto) {
    return await this.jobService.createEnrich(req, body);
  }
}
