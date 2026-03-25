import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigType, Enrichment, ISuccess, JobStatus, PushJob, ScheduleStatus } from '@tazama-lf/tcs-lib';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { ApmSpan } from '../apm/apm.decorators';
import { DatabaseService } from '../database/database.service';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';

@Injectable()
export class JobService {
  private readonly cacheTtl: number;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
  }

  @ApmSpan('data-enrichment-push')
  async createEnrich({ req, body, tenantId }: { req: Request; body: CreateEnrichDataDto; tenantId: string }): Promise<ISuccess> {
    try {
      const contentType = req.headers['content-type'] ?? req.headers['Content-Type'];
      const contentTypeStr = Array.isArray(contentType) ? contentType[0] : contentType;
      if (!contentTypeStr?.toLowerCase().includes('application/json')) {
        throw new BadRequestException('Content-Type must be application/json');
      }

      const { path } = req;

      const cacheKey = `${tenantId}:${path}`;
      const cachedEndpoint = await this.redis.getJson(cacheKey);
      let endpoint: PushJob;

      if (cachedEndpoint) {
        endpoint = JSON.parse(cachedEndpoint) as PushJob;

        if (endpoint.tenant_id !== tenantId) {
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }

        this.loggerService.log(`Using endpoint from cache: ${path}`);
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

      // JobStatus.DEPLOYED = "STATUS_08_DEPLOYED", JobStatus.APPROVED = "STATUS_04_APPROVED"
      const allowedStatuses = [JobStatus.DEPLOYED, JobStatus.APPROVED];
      const isValidStatus = allowedStatuses.includes(endpoint.status);
      const isActivePublishing = endpoint.publishing_status === ScheduleStatus.ACTIVE; // "active"

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
        `${endpoint.tenant_id}_${endpoint.table_name}`,
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
}
