import { Expose } from 'class-transformer';
import { ScheduleStatus } from '../../utils/interfaces';

export class ScheduleDto {
  @Expose()
  name: string;

  @Expose()
  cron: string;

  @Expose()
  iterations: number;

  @Expose()
  schedule_status: ScheduleStatus;

  next_time: string | null;
}
