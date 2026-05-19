export type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'NON_RENEWING_PURCHASE'
  | 'SUBSCRIBER_ALIAS'
  | 'TRANSFER'
  | 'UNCANCELLATION';

export interface RevenueCatEvent {
  id: string;
  type: RevenueCatEventType;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  period_type?: 'TRIAL' | 'INTRO' | 'NORMAL' | 'PROMOTIONAL';
  environment?: 'SANDBOX' | 'PRODUCTION';
}

export interface RevenueCatWebhookBody {
  event: RevenueCatEvent;
  api_version?: string;
}
