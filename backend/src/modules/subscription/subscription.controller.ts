import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { RevenueCatWebhookBody } from './dto/revenuecat-event.dto';
import { Public, User } from '../../common/decorators';

@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly webhookService: RevenueCatWebhookService,
  ) {}

  @Get('users/me/subscription')
  async getMySubscription(@User('id') userId: string) {
    return this.subscriptionService.getState(userId);
  }

  // Public: authenticated by RevenueCat's own shared-secret Authorization
  // header (verified in webhookService.verifyAuth), not by a user token.
  @Public()
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
