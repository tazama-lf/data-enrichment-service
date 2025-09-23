import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ScheduleStatus } from '../../utils/interfaces';

export class UpdateScheduleJobDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  cron: string;

  @IsOptional()
  @IsNumber()
  iterations: number;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  schedule_status: ScheduleStatus;

  @IsOptional()
  next_time: string | null;
}
