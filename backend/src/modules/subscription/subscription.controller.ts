import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { RevenueCatWebhookBody } from './dto/revenuecat-event.dto';

@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly webhookService: RevenueCatWebhookService,
  ) {}

  @Get('users/me/subscription')
  async getMySubscription(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }
    return this.subscriptionService.getState(userId);
  }

  @Post('webhooks/revenuecat')
  @HttpCode(200)
  async revenueCatWebhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: RevenueCatWebhookBody,
  ) {
    this.webhookService.verifyAuth(authHeader);
    const result = await this.webhookService.process(body);
    return { ok: true, ...result };
  }
}
