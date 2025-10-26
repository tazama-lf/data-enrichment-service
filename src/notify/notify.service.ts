import { Injectable } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { JobService } from '../job/job.service';
import { ConfigType, PushJob } from '@tazama-lf/tcs-lib';
import { IMessage } from './types/notify';
import { DatabaseService } from '../database/database.service';

const CACHE_TTL = 86400;

@Injectable()
export class NotifyService {
  private readonly natsService = new StartupFactory();

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly jobService: JobService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.natsService.init(
      this.handleNatsMessage.bind(this) as never,
      this.logger,
      ['config.notification'],
      'config.notification.response',
    );
    this.logger.log('NATS consumer initialized for config.notification');

    const query = `
        SELECT *
         FROM endpoints
           WHERE job_status = 'APPROVED';
          `;

    const result = await this.db.query(query);
    const configs = result.rows as PushJob[];

    for (const config of configs) {
      await this.redis.setJson(config.path, JSON.stringify(config), CACHE_TTL);
    }
    this.logger.log(`Cache preloaded: ${configs.length} configurations`);
  }

  async handleNatsMessage(reqObj: IMessage, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const id = reqObj.TxTp;
    try {
      if (reqObj.type === ConfigType.PUSH) {
        const query = `
          SELECT *
            FROM endpoints
             WHERE id = $1
              LIMIT 1;
          `;

        const result = await this.db.query(query, [id]);
        const config = result.rows[0] as PushJob | undefined;

        if (config) {
          const existingData = await this.redis.getJson('approved');
          let parsedArray: PushJob[] = [];

          if (existingData) {
            parsedArray = JSON.parse(existingData);
          }
          parsedArray.push(config);
          await this.redis.setJson('approved', JSON.stringify(parsedArray), CACHE_TTL);
          this.logger.log(`Updated cache for key: ${config.path}`);
        } else {
          this.logger.log(`Config not found for ID: ${id}`);
        }
      } else {
        this.jobService.execute(id);
      }

      this.logger.log(`Transaction successfully done : ${id}`);
      await handleResponse({
        transactionID: id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`);
      await handleResponse({
        transactionID: id,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
