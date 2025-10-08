import { Expose } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { JobStatus } from '../../utils/interfaces';

export class UpdateJobStatusDto {
  @Expose()
  @IsEnum(JobStatus)
  job_status: JobStatus;
}
