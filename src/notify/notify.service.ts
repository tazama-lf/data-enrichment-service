import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { ConfigType, PushJob } from '@tazama-lf/tcs-lib';
import { DatabaseService } from '../database/database.service';
import { ExecutorService } from '../executor/executor.service';

enum Status {
  ACK = 'ACK',
  NACK = 'NACK',
}

interface NatsMessage {
  TenantId: string;
  TxTp: string;
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
  }

  async onModuleInit(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('NATS service already initialized');
      return;
    }

    this.consumerStream = this.configService.get<string>('CONSUMER_STREAM', 'config.notification');
    this.producerStream = this.configService.get<string>('PRODUCER_STREAM', 'config.notification.response');
    try {
      await this.natsService.init(this.handleNatsMessage.bind(this), this.logger, [this.consumerStream], this.producerStream);
      this.isInitialized = true;
      this.logger.log('NATS consumer initialized for config.notification');

      const query = `
        SELECT *
         FROM endpoints
           WHERE status = 'deployed';
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
    const message = reqObj as NatsMessage;

    this.logger.log(`RECEIVING MESSAGE ${JSON.stringify(message)}`);

    try {
      if ((message.TenantId as ConfigType) === ConfigType.PUSH) {
        const query = `
          SELECT *
            FROM endpoints
             WHERE id = $1
              LIMIT 1;
          `;

        const result = await this.db.query(query, [message.TxTp]);
        const config = result.rows[0] as PushJob | undefined;

        if (config) {
          await this.redis.setJson(config.path, JSON.stringify(config), this.cacheTtl);
          this.logger.log(`Updated cache for key: ${config.path}`);
        } else {
          this.logger.log(`Config not found for ID: ${message.TxTp}`);
        }
      } else {
        const query = `
         SELECT 
          j.*, 
           s.cron,
           s.start_date,
           s.end_date
            FROM job j
             LEFT JOIN schedule s ON j.schedule_id = s.id
              WHERE j.id = $1
               LIMIT 1;
          `;
        const result = await this.db.query(query, [message.TxTp]);
        await this.executorService.addCronJob(result.rows[0]);
      }

      await handleResponse({
        TxTp: message.TxTp,
        status: Status.ACK,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`Transaction successfully done : ${message.TxTp}`);
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`);
      await handleResponse({
        TxTp: message.TxTp,
        status: Status.NACK,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
