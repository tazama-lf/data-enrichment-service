import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export enum SourceType {
    SFTP = 'SFTP',
    HTTP = 'HTTP',
}
export enum fileType {
    CSV = 'CSV',
    JSON = 'JSON',
}

@Entity()
export class Job {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'enum', enum: SourceType })
    sourceType: 'SFTP' | "HTTP"

    @Column()
    sourcePath: string;

    @Column({ type: 'enum', enum: fileType })
    fileFormat: 'CSV' | 'JSON';

    @Column()
    cronExpression : string
}


