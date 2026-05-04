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
  private isInitialized = false;
  private readonly cacheTtl: number;
  private readonly consumerStream: string;
  private readonly producerStream: string;

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
      this.logger.log(`NATS consumer initialized for ${this.consumerStream}`);

      const configs = (await this.db.getDefaultPushJob()) as unknown as PushJob[];

      for (const config of configs) {
        if (!config.path) {
          this.logger.warn(`Skipping cache preload for job ${config.id}: path is null`);
          continue;
        }
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
    let payload: { endpointId?: string; configType?: ConfigType } = {};

    try {
      const { dataPayload } = reqObj as { dataPayload: string };
      payload = JSON.parse(dataPayload) as { endpointId?: string; configType?: ConfigType };
      this.logger.log(`RECEIVING MESSAGE ${JSON.stringify(payload)}`);
    } catch (jsonError: unknown) {
      const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
      this.logger.error(`Error processing message: ${message}`);

      await handleResponse({
        status: Status.NACK,
        error: message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!payload.endpointId || !payload.configType) {
      await handleResponse({
        status: Status.NACK,
        error: 'Invalid payload: endpointId and configType are required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { endpointId, configType } = payload;
    try {
      const record = (await this.db.getJobById(configType, endpointId)) as PushJob | Job | undefined;

      if (!record) {
        this.logger.warn(`No record found for endpointId: ${endpointId}`);
        await handleResponse({
          endpointId,
          status: Status.NACK,
          error: `Record not found for endpointId: ${endpointId}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (configType === ConfigType.PUSH) {
        const pushRecord = record as PushJob;
        if (!pushRecord.path) {
          this.logger.warn(`Cannot cache PUSH config: path is null for endpointId ${endpointId}`);
        } else {
          await this.redis.setJson(pushRecord.path, JSON.stringify(pushRecord), this.cacheTtl);
          this.logger.log(`Updated cache for key: ${pushRecord.path} with publishing_status : ${pushRecord.publishing_status}`);
        }
      } else {
        const data = record as Job;
        const isActive = data.publishing_status === ScheduleStatus.ACTIVE;

        if (isActive) {
          await this.executorService.addCronJob(data);
        } else {
          if (!data.schedule_id) {
            this.logger.warn(`Cannot delete cron job: schedule_id missing for job ${data.id}`);
            await handleResponse({
              endpointId,
              status: Status.NACK,
              error: `schedule_id missing for job ${data.id}`,
              timestamp: new Date().toISOString(),
            });
            return;
          }
          await this.executorService.deleteCronJob(data.id, data.schedule_id);
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
