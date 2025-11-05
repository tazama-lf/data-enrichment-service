import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RequireEditorRole } from '../auth/auth.decorator';
import { type AuthenticatedUser } from '../auth/auth.types';
import { TazamaAuthGuard } from '../auth/tazam-auth.guard';
import { User } from '../auth/user.decorator';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { JobService } from './job.service';

@Controller('')
@UseGuards(TazamaAuthGuard)
export class JobController {
  constructor(private jobService: JobService) {}

  @Post('/*')
  @RequireEditorRole()
  async getEnrich(@Req() req: Request, @Body() body: CreateEnrichDataDto, @User() user: AuthenticatedUser) {
    return await this.jobService.createEnrich(req, body, user.token.tenantId);
  }
}
