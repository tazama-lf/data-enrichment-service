import { ConfigType, SourceType } from '../../utils/interfaces';

interface Job {
  id: number;
  config_type: ConfigType;
  endpoint_name: string;
  description: string;
  connection: string;
  table_name: string;
  source_type: SourceType;
}

export { SourceType, Job };
