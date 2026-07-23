import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigType, Enrichment, ISuccess, Job, JobStatus, PushJob, ScheduleStatus } from '@tazama-lf/tcs-lib';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { ApmSpan } from '../apm/apm.decorators';
import { DatabaseService } from '../database/database.service';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { ExecutorService } from '../executor/executor.service';

const DEFAULT_CACHE_TTL_SECONDS = 86400;

@Injectable()
export class JobService {
  private readonly cacheTtl: number;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly executorService: ExecutorService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', DEFAULT_CACHE_TTL_SECONDS);
  }

  @ApmSpan('data-enrichment-push')
  async createEnrich({ req, body, tenantId }: { req: Request; body: CreateEnrichDataDto; tenantId: string }): Promise<ISuccess> {
    try {
      const contentType = req.headers['content-type'] ?? req.headers['Content-Type'];
      const contentTypeStr = Array.isArray(contentType) ? contentType[0] : contentType;
      if (!contentTypeStr?.toLowerCase().includes('application/json')) {
        throw new BadRequestException('Content-Type must be application/json');
      }

      const originalPath = req.path;
      const path = originalPath.replace(/^\/deapi(?=\/|$)/, '');

      const cacheKey = path;
      const cachedEndpoint = await this.redis.getJson(cacheKey);
      let endpoint: PushJob;

      if (cachedEndpoint) {
        endpoint = JSON.parse(cachedEndpoint) as PushJob;

        if (endpoint.tenant_id !== tenantId) {
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }

        this.loggerService.log(`Using endpoint from cache: ${path} with publishing_status: ${endpoint.publishing_status}`);
      } else {
        const result = await this.db.getPushJobByPath(path, tenantId);

        if (!result) {
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }

        endpoint = result as unknown as PushJob;

        await this.redis.setJson(cacheKey, JSON.stringify(endpoint), this.cacheTtl);
        this.loggerService.log(`Cached endpoint for path: ${path}`);
      }

      this.loggerService.log(`Endpoint status: "${endpoint.status}", publishing_status: "${endpoint.publishing_status}"`);

      const allowedStatuses = [JobStatus.DEPLOYED, JobStatus.APPROVED];
      const isValidStatus = allowedStatuses.includes(endpoint.status);
      const isActivePublishing = endpoint.publishing_status === ScheduleStatus.ACTIVE;

      if (!isValidStatus || !isActivePublishing) {
        this.loggerService.error(
          `Status validation failed. Status: "${endpoint.status}" (valid: ${isValidStatus}), Publishing Status: "${endpoint.publishing_status}" (valid: ${isActivePublishing}), Allowed Statuses: [${allowedStatuses.join(', ')}], Expected Publishing: "${ScheduleStatus.ACTIVE}"`,
        );
        throw new BadRequestException('Endpoint not deployed/approved or not active.');
      }

      const items = Array.isArray(body.data) ? body.data : [body.data];
      const payload: Enrichment[] = items.map((item) => ({
        data: item,
        job_id: endpoint.id,
        checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
      }));

      await this.db.updateTable(
        `${endpoint.tenant_id}_${endpoint.table_name}`.toLowerCase(),
        endpoint.id,
        endpoint.mode,
        payload,
        endpoint.tenant_id,
        ConfigType.PUSH,
      );

      return {
        message: 'Data Enriched Successfully',
        success: true,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(`Error in createEnrich: ${message}`);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('An unexpected error occurred while enriching data.');
    }
  }

  @ApmSpan('data-enrichment-execution')
  async jobUpdate(endpointId: string, configType: ConfigType, tenantId: string): Promise<ISuccess> {
    try {
      const record = (await this.db.getJobById(configType, endpointId, tenantId)) as PushJob | Job | undefined;
      if (!record) {
        throw new NotFoundException(`No record found for endpointId: ${endpointId}`);
      }
      if (configType === ConfigType.PUSH) {
        const pushRecord = record as PushJob;
        if (!pushRecord.path) {
          const message = `Cannot cache PUSH config: path is null for endpointId ${endpointId}`;
          this.loggerService.warn(message);
          return { success: false, message };
        }
        await this.redis.setJson(pushRecord.path, JSON.stringify(pushRecord), this.cacheTtl);
        this.loggerService.log(`Updated cache for key: ${pushRecord.path} with publishing_status : ${pushRecord.publishing_status}`);
      } else {
        const data = record as Job;
        const isActive = data.publishing_status === ScheduleStatus.ACTIVE;

        if (isActive) {
          await this.executorService.addCronJob(data);
        } else {
          if (!data.schedule_id) {
            throw new BadRequestException(`Cannot delete cron job: schedule_id missing for job ${data.id}`);
          }
          await this.executorService.deleteCronJob(data.id, data.schedule_id);
        }
      }
      this.loggerService.log(`Transaction successfully done: ${endpointId}`);

      return { success: true, message: `Transaction successfully done: ${endpointId}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(`Error processing message: ${message}`);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update job configuration.');
    }
  }
}
