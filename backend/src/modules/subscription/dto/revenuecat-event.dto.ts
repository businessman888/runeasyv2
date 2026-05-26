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
  // Present on INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE. Used by the
  // referral commission calculator. RevenueCat sends both the developer's
  // proxy currency (`price`) and the user-paid amount (`price_in_purchased_currency`).
  price?: number;
  currency?: string;
  price_in_purchased_currency?: number;
}

export interface RevenueCatWebhookBody {
  event: RevenueCatEvent;
  api_version?: string;
}
