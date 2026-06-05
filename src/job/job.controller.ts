import { Body, Controller, Param, ParseEnumPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequireAnyClaims, RequireEditorRole, TazamaClaims } from '../auth/auth.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { User } from '../auth/user.decorator';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { JobService } from './job.service';
import { ConfigType, ISuccess } from '@tazama-lf/tcs-lib';

@Controller('')
@UseGuards(TazamaAuthGuard)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post('/deapi/*')
  @RequireEditorRole()
  async getEnrich(@Req() req: Request, @Body() body: CreateEnrichDataDto, @User() user: AuthenticatedUser): Promise<ISuccess> {
    return await this.jobService.createEnrich({ req, body, tenantId: user.token.tenantId });
  }

  @Post('/job-notify/:id')
  @RequireAnyClaims(TazamaClaims.EDITOR, TazamaClaims.APPROVER, TazamaClaims.PUBLISHER)
  async updateJob(
    @Param('id') id: string,
    @Query('type', new ParseEnumPipe(ConfigType)) type: ConfigType,
    @User() user: AuthenticatedUser,
  ): Promise<ISuccess> {
    return await this.jobService.jobUpdate(id, type, user.token.tenantId);
  }
}
