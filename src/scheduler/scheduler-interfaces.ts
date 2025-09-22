import { FileType, SourceType } from '../utils/interfaces';

interface Schedule {
  id?: number;
  job: number;
  source_type: SourceType;
  source_path: string;
  file_format: FileType;
  cron_expression: string;
}

export { SourceType, FileType, Schedule };
