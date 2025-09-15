import { IsString } from "class-validator";

export class CreateJobDto {
    @IsString()
    sourceType: 'SFTP' | "HTTP"

    @IsString()
    sourcePath: string;

    @IsString()
    fileFormat: 'CSV' | 'JSON';

    @IsString()
    cronExpression : string
}