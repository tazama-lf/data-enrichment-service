import { IsEnum, IsNumber, IsString } from 'class-validator';
import { ScheduleStatus } from '../../utils/interfaces';

export class CreateScheduleJobDto {
  @IsString()
  name: string;

  @IsString()
  cron: string;

  @IsNumber()
  iterations: number;

  @IsEnum(ScheduleStatus)
  schedule_status: ScheduleStatus = ScheduleStatus.ACTIVE;

  next_time: string | null;
}
