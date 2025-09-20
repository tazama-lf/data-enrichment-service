import { Expose, Type } from 'class-transformer';
import { AuthType, ConfigType, SourceType } from '../../utils/interfaces';

export class HTTPConnectionDto {
  @Expose()
  url: string;

  @Expose()
  headers: Record<string, string>;
}

export class SFTPConnectionDto {
  @Expose()
  host: string;

  @Expose()
  port: number;

  @Expose()
  auth_type: AuthType;

  @Expose()
  user_name: string;
}

export class JobResponseDto {
  @Expose()
  id: number;

  @Expose()
  config_type: ConfigType;

  @Expose()
  endpoint_name: string;

  @Expose()
  source_type: SourceType;

  @Expose()
  description: string;

  @Expose()
  @Type((opts) => {
    const obj = opts?.object as any;
    if (obj?.source_type === SourceType.HTTP) {
      return HTTPConnectionDto;
    }
    if (obj?.source_type === SourceType.SFTP) {
      return SFTPConnectionDto;
    }
    return Object;
  })
  connection: HTTPConnectionDto | SFTPConnectionDto;

  @Expose()
  table_name: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
