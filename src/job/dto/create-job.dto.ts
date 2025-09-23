import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsObject, IsString, IsUrl, ValidateNested } from 'class-validator';
import { AuthType, ConfigType, EncodingType, FileType, JobStatus, SourceType } from '../../utils/interfaces';
import { Type } from 'class-transformer';

class HTTPConnectionDto {
  @IsString()
  url: string;

  @IsObject()
  @IsNotEmpty()
  headers: Record<string, string>;
}

export class SFTPConnectionDto {
  @IsUrl()
  host: string;

  @IsNumber()
  @IsNotEmpty()
  port: number;

  @IsEnum(AuthType)
  auth_type: AuthType;

  @IsString()
  @IsNotEmpty()
  user_name: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

class FileSettingDto {
  @IsString()
  path: string;

  @IsEnum(FileType)
  file_type: FileType;

  @IsString()
  delimiter: string;

  @IsBoolean()
  header: boolean;

  @IsEnum(EncodingType)
  encoding: EncodingType;
}

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  endpoint_name: string;

  @IsNumber()
  schedule_id: number;

  @IsEnum(SourceType)
  source_type: SourceType;

  @IsEnum(ConfigType)
  config_type: ConfigType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @ValidateNested()
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

  @ValidateNested()
  @Type((opts) => {
    const obj = opts?.object as any;
    if (obj?.source_type === SourceType.SFTP) {
      return FileSettingDto;
    }
    return Object;
  })
  file: FileSettingDto;

  @IsString()
  @IsNotEmpty()
  table_name: string;

  @IsEnum(JobStatus)
  job_status: JobStatus = JobStatus.PENDING;
}
