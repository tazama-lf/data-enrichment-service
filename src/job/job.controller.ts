import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequireEditorRole } from '../auth/auth.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { User } from '../auth/user.decorator';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { JobService } from './job.service';
import { ISuccess } from '@tazama-lf/tcs-lib';

@Controller('')
@UseGuards(TazamaAuthGuard)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post('/*')
  @RequireEditorRole()
  async getEnrich(@Req() req: Request, @Body() body: CreateEnrichDataDto, @User() user: AuthenticatedUser): Promise<ISuccess> {
    return await this.jobService.createEnrich({ req, body, tenantId: user.token.tenantId });
  }
}
