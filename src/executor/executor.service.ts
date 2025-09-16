import { Injectable } from '@nestjs/common';

@Injectable()
export class ExecutorService {

    async run(job: any) {
        console.log('Executing job:', job);
    }
}
