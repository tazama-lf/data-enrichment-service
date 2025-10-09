import { Schedule } from '../../scheduler/types/scheduler-interfaces';
import { AuthType, FileType, IngestMode, JobStatus, SourceType } from '../../utils/interfaces';

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
  private_key?: string;
}

type FileSettings =
  | { file_type: FileType.CSV; delimiter?: string; header?: boolean | string[]; path: string }
  | { file_type: FileType.TSV; header?: boolean | string[]; path: string }
  | { file_type: FileType.JSON; path: string };

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
  mode?: IngestMode;
  schedule?: Schedule;
}

interface Enrichment {
  id?: number;
  tenant_id: string;
  endpoint_id: number;
  correlation_id: string;
  checksum: string;
  data: Record<string, any>;
}

export { Enrichment, FileSettings, HTTPConnection, Job, SFTPConnection };
