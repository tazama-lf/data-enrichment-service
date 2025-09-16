import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ExecutorService {

    async run(job: any) {
        console.log('Executing job:', job);
        const jobs = await axios.get(job.sourcePath);
    }
}
