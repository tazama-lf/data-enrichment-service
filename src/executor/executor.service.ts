import { Injectable } from '@nestjs/common';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import axios from 'axios';
import { Job } from '../job/job.entity';
import { userSchema } from '../utils/constants';

@Injectable()
export class ExecutorService {
  private readonly validate: ValidateFunction;

  constructor() {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validate = ajv.compile(userSchema);
  }

  async run(job: Job) {
    if (job.sourceType === 'HTTP') {
      try {
        const { data } = await axios.get(job.sourcePath);

        if (!data?.users || !Array.isArray(data?.users)) {
          console.log('Invalid data');
          return;
        }

        for (const user of data.users) {
          const valid = this.validate(user);
          if (!valid) {
            console.log('Validation errors:', this.validate.errors);
          } else {
            console.log('User is valid:', user);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }
  }
}
