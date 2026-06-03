/**
 * RevenueCat webhook simulator — RunEasy V2 (dev QA tool)
 *
 * Exercises the REAL production subscription path (handleActivation →
 * maybeGeneratePlan / reanchorPendingWorkoutsToToday, handleExpiration, etc.)
 * by POSTing a crafted event to /api/webhooks/revenuecat. No app/backend
 * bypass — the only honest way to test "pay → Pro → plan generating" in dev,
 * since real store purchases are no-ops without valid RevenueCat keys.
 *
 * Usage:
 *   npx ts-node scripts/sim-revenuecat.ts --user <uuid> [--type INITIAL_PURCHASE] [--trial]
 *   npm run qa:sim-revenuecat -- --user <uuid> --type EXPIRATION
 *
 * Flags:
 *   --user <uuid>     (required) app_user_id = your test user's id
 *   --type <TYPE>     INITIAL_PURCHASE | RENEWAL | UNCANCELLATION | PRODUCT_CHANGE
 *                     | CANCELLATION | EXPIRATION | BILLING_ISSUE  (default INITIAL_PURCHASE)
 *   --trial           mark the activation as a 7-day TRIAL (period_type=TRIAL)
 *   --product <id>    product_id to send (default 'pro_monthly')
 *   --api <baseUrl>   backend base URL (default $SIM_API_URL or http://localhost:3000)
 *
 * Requires: REVENUECAT_WEBHOOK_SECRET in .env (same value the backend uses).
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import type {
  RevenueCatEvent,
  RevenueCatEventType,
  RevenueCatWebhookBody,
} from '../src/modules/subscription/dto/revenuecat-event.dto';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DAY_MS = 86400000;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true; // boolean flag
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const user = typeof args.user === 'string' ? args.user : '';
  if (!user) {
    console.error('❌ Missing --user <uuid>. Example:');
    console.error(
      '   npx ts-node scripts/sim-revenuecat.ts --user 23b6389a-3d6f-4d7b-9677-17eeaf7a742b --type INITIAL_PURCHASE --trial',
    );
    process.exit(1);
  }

  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      '❌ REVENUECAT_WEBHOOK_SECRET not set in .env — the webhook will reject the request (401).',
    );
    process.exit(1);
  }

  const type = (
    typeof args.type === 'string' ? args.type : 'INITIAL_PURCHASE'
  ) as RevenueCatEventType;
  const isTrial = args.trial === true;
  const product =
    typeof args.product === 'string' ? args.product : 'pro_monthly';

  const baseUrl =
    (typeof args.api === 'string' ? args.api : '') ||
    process.env.SIM_API_URL ||
    'http://localhost:3000';
  const url = `${baseUrl.replace(/\/$/, '')}/api/webhooks/revenuecat`;

  const now = Date.now();
  const event: RevenueCatEvent = {
    id: `sim_${type}_${now}`,
    type,
    app_user_id: user,
    original_app_user_id: user,
    product_id: product,
    purchased_at_ms: now,
    // TRIAL → 7d, otherwise a 30d paid period. EXPIRATION/CANCELLATION read
    // expiration_at_ms; for activations it sets trial/subscription expiry.
    expiration_at_ms: isTrial ? now + 7 * DAY_MS : now + 30 * DAY_MS,
    period_type: isTrial ? 'TRIAL' : 'NORMAL',
    environment: 'SANDBOX',
    price: isTrial ? 0 : 29.9,
    currency: 'BRL',
    price_in_purchased_currency: isTrial ? 0 : 29.9,
  };
  const body: RevenueCatWebhookBody = { event, api_version: '1.0' };

  console.log(`→ POST ${url}`);
  console.log(`  type=${type} user=${user} trial=${isTrial} product=${product}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`← ${res.status} ${res.statusText}`);
  console.log(`  ${text}`);

  if (!res.ok) {
    console.error(
      '\n⚠️  Non-2xx. Check: secret matches backend .env, backend is running, and URL/--api is correct.',
    );
    process.exit(1);
  }
  console.log(
    '\n✅ Delivered. Now verify in the DB (users.subscription_plan, revenuecat_events, training_plans, workouts).',
  );
}

main().catch((err) => {
  console.error('❌ Simulator failed:', err);
  process.exit(1);
});
