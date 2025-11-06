import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { Enrichment, ISuccess, Job, JobStatus, ScheduleStatus } from '@tazama-lf/tcs-lib';
import { CronJob } from 'cron';
import { createHash } from 'crypto';
import { Request } from 'express';
import { v4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { ExecutorService } from '../executor/executor.service';
import { isSameDay } from '../utils/helpers';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';

@Injectable()
export class JobService implements OnModuleInit {
  private readonly cacheTtl: number;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly executorService: ExecutorService,
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
  }

  onModuleInit() {
    this.handleCron();
  }

  async handleCron(): Promise<void> {
    try {
      const cronJob = new CronJob(
        this.configService.get<string>('DAILY_CRON', '0 0 * * *'),
        async () => {
          this.handleDailyJobCheck();
        },
        null,
        true,
      );

      this.schedulerRegistry.addCronJob('daily-job', cronJob);
      cronJob.start();
    } catch (error) {
      this.loggerService.error(`Error in cron job: ${error.message}`);
    }
  }

  async handleDailyJobCheck(): Promise<void> {
    this.loggerService.log('Running daily job activation check...');

    try {
      const today = new Date();

      const jobs: Job[] = await this.getAllPullJobs();
      this.loggerService.log(`Found ${jobs.length} job(s) to check.`);

      for (const job of jobs) {
        const startDate = new Date(job.start_date);
        const endDate = job.end_date ? new Date(job.end_date) : null;
        const jobKey = `job-${job.id}-schedule-${job.schedule_id}`;
        const existingJob = this.schedulerRegistry.getCronJobs().get(jobKey);

        if (isSameDay(today, startDate) && !existingJob) {
          this.loggerService.log(`Activating job with id: ${job.id}`);
          await this.executorService.addCronJob(job);
        }

        if (endDate && today > endDate && existingJob) {
          this.loggerService.warn(`Stopping expired job with id: ${job.id}`);
          this.schedulerRegistry.deleteCronJob(jobKey);
        }
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to run daily job activation check: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    }
  }

  async createEnrich(req: Request, body: CreateEnrichDataDto, tenantId: string): Promise<ISuccess> {
    try {
      const contentType = req.headers['content-type'];
      if (!contentType?.includes('application/json')) {
        throw new BadRequestException('Content-Type must be application/json');
      }

      const path = req.path;

      const cachedEndpoint = await this.redis.getJson(path);
      let endpoint;

      if (cachedEndpoint) {
        endpoint = JSON.parse(cachedEndpoint);
        this.loggerService.log(`Using endpoint from cache: ${path}`);
      } else {
        const query = `
      SELECT *
      FROM endpoints
      WHERE path = $1 AND tenant_id = $2
      LIMIT 1;
    `;
        const { rows } = await this.db.query(query, [path, tenantId]);
        endpoint = rows[0];

        if (!endpoint) {
          throw new NotFoundException(`Endpoint '${path}' does not exist with tenant_id ${tenantId}`);
        }

        await this.redis.setJson(path, JSON.stringify(endpoint), this.cacheTtl);
        this.loggerService.log(`Cached endpoint for path: ${path}`);
      }

      const isNotDeployed = endpoint.status !== JobStatus.DEPLOYED;
      const isNotActive = endpoint.publishing_status !== ScheduleStatus.ACTIVE;
      if (isNotDeployed || isNotActive) {
        throw new BadRequestException('Endpoint not deployed or not active.');
      }

      await this.db.ensureTableWithMetaData(endpoint.table_name);

      const correlation_id = v4();
      const payload: Enrichment[] = (Array.isArray(body.data) ? body.data : [body.data]).map((item) => ({
        tenant_id: tenantId,
        correlation_id,
        data: item,
        endpoint_id: endpoint.id,
        checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
      }));

      await this.db.updateTableWithMetaData(endpoint.table_name, endpoint.mode, payload);

      return {
        message: 'Data Enriched Successfully',
        success: true,
      };
    } catch (error) {
      this.loggerService.error(`Error in createEnrich: ${error.message}`, error.stack);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('An unexpected error occurred while enriching data.');
    }
  }

  async getAllPullJobs(): Promise<Job[]> {
    const query = `
  SELECT 
    j.*, 
    s.cron,
    s.start_date,
    s.end_date
  FROM job j
  LEFT JOIN schedule s ON j.schedule_id = s.id
  WHERE 
    j.status = 'deployed'
    AND j.publishing_status = 'active'
    AND (
      s.start_date::date = CURRENT_DATE
      OR s.end_date::date = CURRENT_DATE
    )
  ORDER BY j.created_at DESC;
`;

    const result = await this.db.query(query);
    return result.rows;
  }
}
