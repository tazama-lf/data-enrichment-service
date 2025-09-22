import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { Schedule } from './scheduler-interfaces';
import { CronJob } from 'cron';
import { ExecutorService } from '../executor/executor.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class SchedulerService {
  constructor(
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
    private executorService: ExecutorService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  async findAll() {
    return this.knex<Schedule>('schedule').select('*');
  }

  async findOne(id: number) {
    const schedule = await this.knex<Schedule>('schedule').where({ id }).first();
    if (!schedule) {
      throw new NotFoundException('Scheduled Job Not Found');
    }
    return schedule;
  }

  async scheduleJob(schedule: Schedule) {
    const cronJob = new CronJob(schedule.cron_expression, async () => {
      await this.executorService.run(schedule);
    });
    const cronName = `job-${schedule.id ?? Math.random().toString(36).substring(2)}`;
    this.schedulerRegistry.addCronJob(cronName, cronJob as any);
    cronJob.start();
  }

  async runById(id: number) {
    const job = await this.findOne(id);
    await this.executorService.run(job);
  }
}
