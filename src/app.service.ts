import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  handleHealthCheck(): { status: string } {
    return { status: 'UP' };
  }
}
