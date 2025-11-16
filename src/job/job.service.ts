import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { Enrichment, ISuccess, JobStatus, ScheduleStatus } from '@tazama-lf/tcs-lib';
import { createHash } from 'crypto';
import { Request } from 'express';
import { v4 } from 'uuid';
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

  private handleError(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err);
    this.loggerService.error(message);
    throw new BadRequestException(message);
  }

  @ApmSpan('data-enrichment-push')
  async createEnrich({ req, body, tenantId }: { req: Request; body: CreateEnrichDataDto; tenantId: string }): Promise<ISuccess> {
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

        if (endpoint && endpoint.tenant_id !== tenantId) {
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }
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
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }

        await this.redis.setJson(path, JSON.stringify(endpoint), this.cacheTtl);
        this.loggerService.log(`Cached endpoint for path: ${path}`);
      }

      const isNotDeployed = endpoint.status !== JobStatus.DEPLOYED;
      const isNotActive = endpoint.publishing_status !== ScheduleStatus.ACTIVE;
      if (isNotDeployed || isNotActive) {
        throw new BadRequestException('Endpoint not deployed or not active.');
      }

      const correlation_id = v4();
      const payload: Enrichment[] = (Array.isArray(body.data) ? body.data : [body.data]).map((item) => ({
        tenant_id: tenantId,
        correlation_id,
        data: item,
        endpoint_id: endpoint.id,
        checksum: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
      }));

      await this.db.updateTableWithMetaData(`${endpoint.tenant_id}_${endpoint.table_name}`, endpoint.mode, payload);

      return {
        message: 'Data Enriched Successfully',
        success: true,
      };
    } catch (error) {
      this.handleError(error);
    }
  }
}
