import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';

// Public: liveness/readiness probe for Railway — no authentication required.
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
