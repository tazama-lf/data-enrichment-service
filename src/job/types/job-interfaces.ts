import { Schedule } from '../../scheduler/types/scheduler-interfaces';
import { AuthType, ConfigType, EncodingType, FileType, JobStatus, SourceType } from '../../utils/interfaces';

interface HTTPConnection {
  url: string;
  headers: Record<string, string>;
}

interface SFTPConnection {
  host: string;
  port: number;
  auth_type: AuthType;
  user_name: string;
  password?: string;
}

interface FileSettings {
  path: string;
  file_type: FileType;
  delimiter: string;
  header: boolean;
  encoding: EncodingType;
}

interface Job {
  id: number;
  schedule_id: number;
  config_type: ConfigType;
  endpoint_name: string;
  source_type: SourceType;
  description: string;
  connection: HTTPConnection | SFTPConnection;
  file: FileSettings;
  table_name: string;
  job_status: JobStatus;
  schedule?: Schedule;
}

export { Job, HTTPConnection, SFTPConnection, FileSettings };
