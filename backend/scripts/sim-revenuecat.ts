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
 *   npm run qa:sim-revenuecat -- --user <uuid> --env staging --type EXPIRATION
 *
 * Flags:
 *   --user <uuid>     (required) app_user_id = your test user's id
 *   --env <name>      target environment: local | staging | production
 *                     (default 'local'). Resolves both the base URL AND which
 *                     webhook secret to send. Override either with --api/--secret.
 *   --type <TYPE>     INITIAL_PURCHASE | RENEWAL | UNCANCELLATION | PRODUCT_CHANGE
 *                     | CANCELLATION | EXPIRATION | BILLING_ISSUE  (default INITIAL_PURCHASE)
 *   --trial           mark the activation as a 7-day TRIAL (period_type=TRIAL)
 *   --product <id>    product_id to send (default 'pro_monthly')
 *   --api <baseUrl>   explicit backend base URL (overrides --env's URL)
 *   --secret <value>  explicit webhook secret (overrides --env's secret)
 *
 * Each Railway environment has its OWN webhook secret, so the script reads a
 * DIFFERENT env var per target (the backend validates `Bearer <secret>`):
 *   local      → REVENUECAT_WEBHOOK_SECRET
 *   staging    → REVENUECAT_WEBHOOK_SECRET_STAGING (falls back to the base var)
 *   production → REVENUECAT_WEBHOOK_SECRET
 * Add the staging value to your local .env as REVENUECAT_WEBHOOK_SECRET_STAGING
 * (copy it from the staging Railway service's variables). Sending the wrong
 * secret is what yields a 401 "Invalid webhook signature".
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

type EnvName = 'local' | 'staging' | 'production';

// Per-environment defaults. `secretVar` is the .env key holding THAT
// environment's webhook secret (each Railway service has its own).
const ENVIRONMENTS: Record<
  EnvName,
  { url: string; secretVar: string; fallbackSecretVar?: string }
> = {
  local: {
    url: 'http://localhost:3000',
    secretVar: 'REVENUECAT_WEBHOOK_SECRET',
  },
  staging: {
    url: 'https://runeasyv2-staging.up.railway.app',
    secretVar: 'REVENUECAT_WEBHOOK_SECRET_STAGING',
    fallbackSecretVar: 'REVENUECAT_WEBHOOK_SECRET',
  },
  production: {
    url: 'https://app.runeasy.com.br',
    secretVar: 'REVENUECAT_WEBHOOK_SECRET',
  },
};

function resolveEnv(raw: string | boolean | undefined): EnvName {
  const v = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (v === 'local' || v === 'staging' || v === 'production') return v;
  if (v) {
    console.error(
      `❌ Invalid --env "${String(raw)}". Use one of: local | staging | production.`,
    );
    process.exit(1);
  }
  return 'local';
}

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
      '   npx ts-node scripts/sim-revenuecat.ts --user 23b6389a-3d6f-4d7b-9677-17eeaf7a742b --env staging --type INITIAL_PURCHASE --trial',
    );
    process.exit(1);
  }

  const env = resolveEnv(args.env);
  const target = ENVIRONMENTS[env];

  // Secret: explicit --secret wins, else this env's secret var (with a fallback
  // to the base var for staging if the staging-specific one isn't set).
  const secret =
    (typeof args.secret === 'string' ? args.secret : '') ||
    process.env[target.secretVar] ||
    (target.fallbackSecretVar
      ? process.env[target.fallbackSecretVar]
      : undefined);

  if (!secret) {
    const hint = target.fallbackSecretVar
      ? `${target.secretVar} (or ${target.fallbackSecretVar})`
      : target.secretVar;
    console.error(
      `❌ No webhook secret for env "${env}". Set ${hint} in .env, or pass --secret <value>.\n` +
        `   The webhook rejects mismatched secrets with 401 "Invalid webhook signature".`,
    );
    process.exit(1);
  }

  const type = (
    typeof args.type === 'string' ? args.type : 'INITIAL_PURCHASE'
  ) as RevenueCatEventType;
  const isTrial = args.trial === true;
  const product =
    typeof args.product === 'string' ? args.product : 'pro_monthly';

  // Base URL: explicit --api wins, else this env's URL, else legacy $SIM_API_URL.
  const baseUrl =
    (typeof args.api === 'string' ? args.api : '') ||
    process.env.SIM_API_URL ||
    target.url;
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
  console.log(
    `  env=${env} type=${type} user=${user} trial=${isTrial} product=${product}`,
  );

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
    if (res.status === 401) {
      console.error(
        `\n⚠️  401 Unauthorized — the secret sent doesn't match env "${env}".\n` +
          `   Copy that environment's REVENUECAT_WEBHOOK_SECRET from its Railway\n` +
          `   service into your local .env (staging → REVENUECAT_WEBHOOK_SECRET_STAGING),\n` +
          `   or pass --secret <value>.`,
      );
    } else {
      console.error(
        '\n⚠️  Non-2xx. Check: backend is running and the URL/--api is correct.',
      );
    }
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
