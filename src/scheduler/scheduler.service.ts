import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { validateCronExpression } from '../utils/helpers';
import { CreateScheduleJobDto } from './dto/create-schedule.dto';
import { ScheduleDto } from './dto/schedule.dto';
import { Schedule } from './types/scheduler-interfaces';

@Injectable()
export class SchedulerService {
  constructor(@Inject('KNEX_CONNECTION') private readonly knex: Knex) {}

  async create(schedule: CreateScheduleJobDto): Promise<Schedule> {
    validateCronExpression(schedule.cron);
    const [result] = await this.knex('schedule').insert(schedule).returning('*');
    return result;
  }

  async findAll(page = 1, limit = 10): Promise<Schedule[]> {
    if (page < 1 || limit < 1) {
      throw new BadRequestException('Invalid Params provided');
    }

    const offset = (page - 1) * limit;
    const [data] = await Promise.all([
      this.knex('schedule').select('*').limit(limit).offset(offset),
      this.knex('schedule').count('* as count'),
    ]);

    return data;
  }

  async findOne(id: number): Promise<Schedule> {
    const schedule = await this.knex<Schedule>('schedule').where({ id }).first();
    if (!schedule) {
      throw new NotFoundException(`Configuration with id ${id} not found`);
    }
    return schedule;
  }

  async remove(id: number): Promise<{ success: boolean; message: string }> {
    await this.findOne(id);
    const res = await this.knex<Schedule>('schedule').where('id', id).del();
    if (res) {
      return {
        success: true,
        message: `Configuration with id ${id} successfully deleted`,
      };
    } else {
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async update(id: number, attr: Partial<ScheduleDto>): Promise<Schedule> {
    await this.findOne(id);
    await this.knex<Schedule>('schedule').where({ id }).update(attr);

    return this.findOne(id);
  }
}
