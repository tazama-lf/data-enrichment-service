import { plainToClass } from 'class-transformer';
import { IsEnum, IsNumber, IsNumberString, IsString, validateSync } from 'class-validator';

enum NodeEnv {
  DEVELOPMENT = 'dev',
  PRODUCTION = 'prod',
  TEST = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsNumberString()
  MAX_CPU: string;

  @IsString()
  FUNCTION_NAME: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  CONFIGURATION_DATABASE: string;

  @IsString()
  CONFIGURATION_DATABASE_USER: string;

  @IsString()
  CONFIGURATION_DATABASE_PASSWORD: string;

  @IsString()
  CONFIGURATION_DATABASE_HOST: string;

  @IsString()
  ENCRYPTION_KEY: string;

  @IsNumber()
  SALT_ROUNDS: number;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  REDIS_PASSWORD: string;

  @IsString()
  SFTP_HOST_DEV: string;

  @IsNumber()
  SFTP_PORT_DEV: number;

  @IsString()
  SFTP_USERNAME_DEV: string;

  @IsString()
  SFTP_PASSWORD_DEV: string;

  @IsString()
  SERVER_URL: string;

  @IsString()
  STARTUP_TYPE: string;

  @IsString()
  PRODUCER_STREAM: string;

  @IsString()
  CONSUMER_STREAM: string;

  @IsString()
  STREAM_SUBJECT: string;
}

export const validate = (config: Record<string, unknown>) => {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
};
