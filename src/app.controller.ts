import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { TazamaAuthGuard } from './auth/tazama-auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @UseGuards(TazamaAuthGuard)
  handleHealthCheck(): string {
    return this.appService.handleHealthCheck().status;
  }
}
