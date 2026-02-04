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
      const contentType = req.headers['content-type'];
      if (!contentType?.includes('application/json')) {
        throw new BadRequestException('Content-Type must be application/json');
      }

      const { path } = req;

      const cachedEndpoint = await this.redis.getJson(path);
      let endpoint: PushJob;

      if (cachedEndpoint) {
        endpoint = JSON.parse(cachedEndpoint) as PushJob;

        if (endpoint.tenant_id !== tenantId) {
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }
        this.loggerService.log(`Using endpoint from cache: ${path}`);
      } else {
        const query = `
      SELECT *
      FROM push_jobs
      WHERE path = $1 AND tenant_id = $2
      LIMIT 1;
    `;
        const { rows } = await this.db.query<PushJob>(query, [path, tenantId]);

        if (!rows.length) {
          throw new NotFoundException(`Endpoint ${path} does not exist with tenant_id ${tenantId}`);
        }

        endpoint = rows[0]!;

        await this.redis.setJson(path, JSON.stringify(endpoint), this.cacheTtl);
        this.loggerService.log(`Cached endpoint for path: ${path}`);
      }

      if (endpoint.status !== JobStatus.DEPLOYED || endpoint.publishing_status !== ScheduleStatus.ACTIVE) {
        throw new BadRequestException('Endpoint not deployed or not active.');
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
