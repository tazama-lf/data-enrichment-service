import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateScheduleJobDto } from './dto/create-schedule.dto';
import { SchedulerService } from './scheduler.service';
import { UpdateScheduleJobDto } from './dto/update-schedule.dto';

@Controller('schedule')
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Post('/create')
  async createJob(@Body() schedule: CreateScheduleJobDto) {
    return this.schedulerService.create(schedule);
  }

  @Get('/all')
  async getAll(@Query('page') page = '1', @Query('limit') limit = '10') {
    return await this.schedulerService.findAll(parseInt(page), parseInt(limit));
  }

  @Delete('/:id')
  async delete(@Param('id') id: string) {
    return await this.schedulerService.remove(parseInt(id));
  }

  @Patch('/:id')
  async update(@Param('id') id: string, @Body() body: UpdateScheduleJobDto) {
    return this.schedulerService.update(parseInt(id), body);
  }
}
