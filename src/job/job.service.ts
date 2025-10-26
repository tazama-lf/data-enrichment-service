import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { createHash } from 'crypto';
import { Request } from 'express';
import { v4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { ExecutorService } from '../executor/executor.service';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { Enrichment, Job, JobStatus } from '@tazama-lf/tcs-lib';

@Injectable()
export class JobService {
  constructor(
    private readonly executorService: ExecutorService,
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    const jobs = await this.findAllPull();
    jobs.filter((opt) => opt.job_status === JobStatus.INPROGRESS).forEach((job) => void this.execute(job.id));
  }

  async createEnrich(req: Request, body: CreateEnrichDataDto): Promise<{ message: string; status: number }> {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      throw new BadRequestException('Content-Type must be application/json');
    }

    const cleanedPath = req.path.replace(/^\/job/, '');
    const query = `
       SELECT *
        FROM endpoints
         WHERE path = $1
          LIMIT 1;
        `;

    const result = await this.db.query(query, [cleanedPath]);
    const existing = result.rows[0];
    if (!existing) {
      throw new NotFoundException(`Given endpoint ${cleanedPath} does not exist.`);
    }

    if (existing.job_status === JobStatus.PENDING) {
      throw new BadRequestException('Endpoint Not Approved');
    }

    await this.db.ensureTableWithMetaData(existing.table_name);

    const correlation_id = v4();
    const tenant_id = Math.round(Math.random() * 9999).toString();
    const payload: Enrichment[] = (Array.isArray(body.data) ? body.data : [body.data]).map((item) => ({
      tenant_id,
      correlation_id,
      data: item,
      endpoint_id: existing.id,
      checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
    }));

    await this.db.updateTableWithMetaData(existing.table_name, existing.mode, payload);

    return {
      message: 'Data Enriched Successfully',
      status: 200,
    };
  }

  async findAllPull(): Promise<Job[]> {
    const query = `
      SELECT *
       FROM job
       ORDER BY created_at DESC;
      `;

    const result = await this.db.query(query);
    const data = result.rows;
    return data;
  }

  async findOnePull(id: string): Promise<Job> {
    const query = `
        SELECT *
         FROM job
           WHERE id = $1
             LIMIT 1;
              `;

    const result = await this.db.query(query, [id]);
    const job = result.rows[0];

    if (!job) {
      this.loggerService.error(`Job with ${id} not Found`);
      throw new NotFoundException('Job Not Found');
    }
    return job;
  }

  async execute(id: string): Promise<void> {
    const res = await this.findOnePull(id);
    const query = `
        SELECT *
         FROM schedule
          WHERE id = $1
           LIMIT 1;
          `;

    const result = await this.db.query(query, [res.schedule_id]);
    const schedule = result.rows[0];
    await this.executorService.addCronJob({ ...res, schedule });
  }
}
