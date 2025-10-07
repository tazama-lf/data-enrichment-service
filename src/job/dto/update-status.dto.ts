import { IsEnum } from 'class-validator';
import { IngestMode, JobStatus } from '../../utils/interfaces';
import { Expose } from 'class-transformer';

export class UpdateJobStatusDto {
  @Expose()
  @IsEnum(JobStatus)
  job_status: JobStatus;

  @Expose()
  @IsEnum(IngestMode)
  mode: IngestMode;
}
