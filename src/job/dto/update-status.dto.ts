import { IsEnum } from 'class-validator';
import { JobStatus } from '../../utils/interfaces';
import { Expose } from 'class-transformer';

export class UpdateJobStatusDto {
  @Expose()
  @IsEnum(JobStatus)
  job_status: JobStatus;
}
