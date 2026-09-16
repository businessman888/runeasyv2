import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  GOOGLE_HEALTH_WEBHOOK_PATH,
  authorizationMatches,
  resolveWebhookSecret,
} from '../../modules/devices/providers/google-health-webhook-auth';

/**
 * `ThrottlerGuard` global, com UMA exceção: o webhook da Google Health API
 * escapa do teto **quando já apresenta a credencial correta**.
 *
 * ── POR QUE NÃO `@SkipThrottle()` NA ROTA ────────────────────────────────────
 *
 * O primeiro desenho era `@SkipThrottle()` incondicional, e o motivo estava
 * certo: o Google retém notificação por até 7 dias e despeja o backlog de uma
 * vez, tudo do mesmo bloco de IPs. Com o teto global de 100 req/min por IP, NÓS
 * devolveríamos 429 ao Google — e 429 não é 204, então ele retentaria, e o
 * backlog cresceria em vez de drenar.
 *
 * O problema é o que o skip incondicional custava. A rota é `@Public()`, e o
 * handshake responde 200 com o segredo certo e 401 com o errado — um oráculo
 * binário perfeito sobre o segredo, que **não dá para fechar**, porque
 * responder 200 ao segredo válido *é* o contrato de registro do subscriber.
 * Com o oráculo inerente, as únicas defesas restantes são a entropia do segredo
 * e um teto de tentativas. O skip incondicional removia o teto e não punha nada
 * no lugar: tentativas ilimitadas, sem lockout, cada uma pagando um `JSON.parse`
 * de até 2 MB no mesmo event loop de toda a API — um processo só.
 *
 * ── O QUE ESTE GUARD FAZ ─────────────────────────────────────────────────────
 *
 * Pula o teto só para quem JÁ provou ser o Google. O Google sempre apresenta o
 * segredo, então nunca é limitado e o backlog de 7 dias flui inteiro; quem não
 * o tem bate nos 100/min de sempre. Precedente no próprio repo: o webhook do
 * RevenueCat (`subscription.controller.ts:31-32`) é `@Public()` e **mantém** o
 * throttle global.
 *
 * Fora dessa rota o comportamento é idêntico ao da classe base — inclusive o
 * `@SkipThrottle()` de qualquer outra rota, que continua sendo honrado pelo
 * `canActivate` da base.
 */
@Injectable()
export class WebhookAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true;
    if (context.getType() !== 'http') return false;

    const req = context.switchToHttp().getRequest<{
      originalUrl?: string;
      url?: string;
      path?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();

    // O guard roda antes da resolução do handler, então a rota só se reconhece
    // pelo caminho. `originalUrl` traz a query; o caminho é o que vem antes do
    // `?`.
    const raw = req?.originalUrl ?? req?.url ?? req?.path ?? '';
    const path = raw.split('?')[0];
    if (path !== GOOGLE_HEALTH_WEBHOOK_PATH) return false;

    // Sem segredo utilizável, o teto VALE. É o lado seguro: um deploy sem a
    // variável (ou com o placeholder do `.env.example`) recusa tudo com 401 no
    // controller, e não faz sentido dar a ele passe livre no throttler.
    const secret = resolveWebhookSecret(
      process.env.GOOGLE_HEALTH_WEBHOOK_SECRET,
    );
    if (!secret) return false;

    const authorization = req?.headers?.authorization;
    return authorizationMatches(
      secret,
      typeof authorization === 'string' ? authorization : undefined,
    );
  }
}
