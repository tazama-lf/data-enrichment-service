import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { JobService } from './job.service';

@Controller('job')
export class JobController {

    constructor(private jobService: JobService) {}

    @Post('/create')
    async createJob(@Body() job : CreateJobDto){
        return this.jobService.create(job)
    }


    @Get('/all')
    async getAll(){
        return this.jobService.findAll()
    }
}
