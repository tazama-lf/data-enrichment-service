import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { onMessageFunction, StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { ConfigType, Job, PushJob } from '@tazama-lf/tcs-lib';
import { DatabaseService } from '../database/database.service';
import { ExecutorService } from '../executor/executor.service';

enum Status {
  ACK = 'ACK',
  NACK = 'NACK',
}

@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly natsService: StartupFactory = new StartupFactory();
  private isInitialized = false;
  private readonly cacheTtl: number;
  private consumerStream: string;
  private producerStream: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    private readonly executorService: ExecutorService,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
    this.consumerStream = this.configService.get<string>('CONSUMER_STREAM', 'config.notification');
    this.producerStream = this.configService.get<string>('PRODUCER_STREAM', 'config.notification.response');
  }

  async onModuleInit(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('NATS service already initialized');
      return;
    }

    try {
      await this.natsService.init(
        this.handleNatsMessage.bind(this) as onMessageFunction,
        this.logger,
        [this.consumerStream],
        this.producerStream,
      );
      this.isInitialized = true;
      this.logger.log('NATS consumer initialized for config.notification');

      const query = `
  SELECT *
  FROM endpoints
  WHERE 
     status IN ('STATUS_08_DEPLOYED', 'STATUS_06_EXPORTED')
    AND publishing_status = 'active';
`;

      const result = await this.db.query(query);
      const configs = result.rows as PushJob[];

      for (const config of configs) {
        await this.redis.setJson(config.path, JSON.stringify(config), this.cacheTtl);
      }
      this.logger.log(`Cache preloaded: ${configs.length} configurations`);
    } catch (error) {
      this.logger.error(`Failed to initialize ConfigNotifyService: ${String(error)}`);
      this.isInitialized = false;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.isInitialized = false;
    this.logger.log('ConfigNotifyService destroyed');
  }

  async handleNatsMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const { dataPayload } = reqObj as { dataPayload: string };
    this.logger.log(`RECEIVING MESSAGE ${dataPayload}`);

    const payload = JSON.parse(dataPayload) as {
      endpointId: string;
      configType: ConfigType;
    };

    const { endpointId, configType } = payload;
    try {
      const query =
        configType === ConfigType.PUSH
          ? `
          SELECT *
          FROM endpoints
          WHERE id = $1
          LIMIT 1;
        `
          : `
          SELECT 
              j.*, 
              s.cron,
              s.start_date,
              s.end_date
          FROM job j
          LEFT JOIN schedule s ON j.schedule_id = s.id
          WHERE 
              j.id = $1
              AND j.status = 'STATUS_08_DEPLOYED'
              AND j.publishing_status = 'active'
              AND (
                  s.start_date::date = CURRENT_DATE
                  OR s.end_date::date = CURRENT_DATE
              )
          ORDER BY j.created_at DESC
          LIMIT 1;
        `;

      const result = await this.db.query(query, [endpointId]);
      const record = result.rows[0] as PushJob | Job | undefined;

      if (!record) {
        this.logger.warn(`No configuration found for ID: ${endpointId}`);
      } else if (configType === ConfigType.PUSH) {
        await this.redis.setJson(record.path as string, JSON.stringify(record), this.cacheTtl);
        this.logger.log(`Updated cache for key: ${record.path}`);
      } else {
        await this.executorService.addCronJob(record as Job);
      }

      await handleResponse({
        endpointId,
        status: Status.ACK,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Transaction successfully done: ${endpointId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing message: ${message}`);

      await handleResponse({
        endpointId: endpointId,
        status: Status.NACK,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
