import { plainToClass } from 'class-transformer';
import {
    IsEnum,
    IsString,
    IsNumberString,
    validateSync,
} from 'class-validator';

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
