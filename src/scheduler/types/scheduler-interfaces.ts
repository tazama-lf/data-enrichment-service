import { ScheduleStatus } from '../../utils/interfaces';

interface Schedule {
  id?: number;
  name: string;
  iterations: number;
  schedule_status: ScheduleStatus;
  next_time?: string;
  cron: string;
}

export { Schedule };
