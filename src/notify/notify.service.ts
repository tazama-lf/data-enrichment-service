import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { onMessageFunction, StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { ConfigType, Job, PushJob, ScheduleStatus } from '@tazama-lf/tcs-lib';
import { DatabaseService } from '../database/database.service';
import { ExecutorService } from '../executor/executor.service';

enum Status {
  ACK = 'ACK',
  NACK = 'NACK',
}

@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly natsService: StartupFactory = new StartupFactory();
  private readonly ingestionService: StartupFactory = new StartupFactory();
  private readonly ackService: StartupFactory = new StartupFactory();
  private isInitialized = false;
  private readonly cacheTtl: number;
  private readonly consumerStream: string;
  private readonly producerStream: string;
  private readonly ingestionProdStream: string;
  private readonly ingestionConStream: string;

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
    this.ingestionConStream = this.configService.get<string>('INGESTION_CONSUMER_STREAM', 'ingestion.notification.response');
    this.ingestionProdStream = this.configService.get<string>('INGESTION_PRODUCER_STREAM', 'ingestion.notification');
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
      this.logger.log(`NATS consumer initialized for ${this.consumerStream}`);

      await this.ingestionService.initProducer(this.logger, this.ingestionProdStream);
      this.logger.log('NATS producer initialized - sending to config.notification', 'NotificationController');

      await this.ackService.init(
        this.handleIngestionAckMessage.bind(this) as onMessageFunction,
        this.logger,
        [this.ingestionConStream],
        'enrichment.ack.response',
      );

      const query = `
  SELECT *
  FROM push_jobs
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

  private async handleIngestionAckMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    this.logger.log(`ACK from Data-Ingestion: ${JSON.stringify(reqObj)}`, 'NotificationController');

    await handleResponse({
      status: 'ACK_RECEIVED',
      timestamp: new Date().toISOString(),
    });
  }

  async notifyIngestion(id: string): Promise<void> {
    try {
      const payload = {
        dataPayload: JSON.stringify({ id }),
      };

      await this.natsService.handleResponse(payload);

      this.logger.log(`TESTING NOTIFY FROM ENRICHMENT TO INGESTION WITH ID ${id}`);
    } catch (error) {
      this.logger.error(
        new Error(`Failed to process notification: ${error instanceof Error ? error.message : 'Unknown error'}`),
        'NotificationController',
      );
    }
  }

  async handleNatsMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const { dataPayload } = reqObj as { dataPayload: string };

    const payload = JSON.parse(dataPayload) as {
      endpointId: string;
      configType: ConfigType;
    };
    this.logger.log(`RECEIVING MESSAGE ${JSON.stringify(payload)}`);

    const { endpointId, configType } = payload;
    try {
      const query =
        configType === ConfigType.PUSH
          ? `
          SELECT *
          FROM push_jobs
          WHERE id = $1
          LIMIT 1;
        `
          : `
        SELECT 
          j.*, 
           s.cron,
           s.start_date,
           s.end_date
            FROM pull_jobs j
             LEFT JOIN cron_jobs s ON j.schedule_id = s.id
              WHERE j.id = $1
               LIMIT 1;
        `;

      const result = await this.db.query(query, [endpointId]);
      const record = result.rows[0] as PushJob | Job;

      if (configType === ConfigType.PUSH) {
        await this.redis.setJson(record.path!, JSON.stringify(record), this.cacheTtl);
        this.logger.log(`Updated cache for key: ${record.path}`);
      } else {
        const data = record as Job;
        const isActive = data.publishing_status === ScheduleStatus.ACTIVE;

        if (isActive) {
          await this.executorService.addCronJob(data);
        } else {
          await this.executorService.deleteCronJob(data.id, data.schedule_id!);
        }
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
        endpointId,
        status: Status.NACK,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
