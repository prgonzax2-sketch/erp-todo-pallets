import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok',
      version: process.env.APP_VERSION || '0.0.1',
      timestamp: new Date().toISOString(),
    };
  }
}
