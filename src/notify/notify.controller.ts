import { Controller, Post } from '@nestjs/common';
import { NotifyService } from './notify.service';

@Controller('notify')
export class NotifyController {
    constructor(private readonly notifyService: NotifyService) { }
}
