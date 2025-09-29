import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { IngestMode } from '../../utils/interfaces';

export class CreatePushJobDto {
  @IsString()
  @IsNotEmpty()
  endpoint_name: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(IngestMode)
  @IsNotEmpty()
  mode: IngestMode = IngestMode.APPEND;

  @IsString()
  @IsNotEmpty()
  table_name: string;
}
