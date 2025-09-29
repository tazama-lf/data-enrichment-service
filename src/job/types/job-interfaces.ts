import { Schedule } from '../../scheduler/types/scheduler-interfaces';
import { AuthType, EncodingType, FileType, JobStatus, SourceType } from '../../utils/interfaces';

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
  id: string;
  schedule_id: number;
  endpoint_name: string;
  source_type: SourceType;
  description: string;
  connection: HTTPConnection | SFTPConnection;
  file: FileSettings;
  table_name: string;
  job_status: JobStatus;
  schedule?: Schedule;
}

interface Enrichment {
  id: number;
  tenant_id: string;
  endpoint_id: number;
  correlation_id: string;
  checksum: string;
  data: Record<string, any>;
}

export { HTTPConnection, Job, SFTPConnection, Enrichment };
