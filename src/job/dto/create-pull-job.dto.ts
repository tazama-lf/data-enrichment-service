import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsObject, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { AuthType, EncodingType, FileType, IngestMode, SourceType } from '../../utils/interfaces';

class HTTPConnectionDto {
  @IsString()
  url: string;

  @IsObject()
  @IsNotEmpty()
  headers: Record<string, string>;
}

export class SFTPConnectionDto {
  @IsString()
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
  @ValidateIf((o) => o.auth_type === AuthType.USERNAME_PASSWORD)
  password: string;

  @IsString()
  @IsNotEmpty()
  @ValidateIf((o) => o.auth_type === AuthType.PRIVATE_KEY)
  private_key: string;
}

class FileSettingDto {
  @IsString()
  path: string;

  @IsEnum(FileType)
  file_type: FileType;

  @IsString()
  delimiter: string;

  @IsEnum(EncodingType)
  encoding: EncodingType;
}

export class CreatePullJobDto {
  @IsString()
  @IsNotEmpty()
  endpoint_name: string;

  @IsNumber()
  @IsNotEmpty()
  schedule_id: number;

  @IsEnum(SourceType)
  @IsNotEmpty()
  source_type: SourceType;

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

  @IsEnum(IngestMode)
  mode: IngestMode = IngestMode.APPEND;
}
