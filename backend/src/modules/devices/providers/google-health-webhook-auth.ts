/**
 * Credencial do webhook da Google Health API.
 *
 * Mora em arquivo próprio, e não dentro do controller, porque DOIS lugares
 * precisam da mesma decisão e precisam chegar à MESMA resposta:
 *
 *   1. o controller, para recusar com 401 quem não apresenta o segredo;
 *   2. o `WebhookAwareThrottlerGuard`, que roda ANTES do controller e decide
 *      se a requisição escapa do teto de 100 req/min.
 *
 * Se as duas divergissem, existiria uma requisição que o guard trata como
 * "é o Google" e o controller trata como "não é" — ou o contrário, que é pior:
 * o Google entrando no teto e levando 429, que não é 204, o que o faz retentar.
 */

import { createHash, timingSafeEqual } from 'crypto';

/**
 * Caminho da rota do webhook, com o prefixo global `api`.
 *
 * O guard é global e precisa reconhecer a rota por caminho: ele roda antes da
 * resolução do handler, então não dá para perguntar ao controller.
 */
export const GOOGLE_HEALTH_WEBHOOK_PATH = '/api/devices/webhooks/google-health';

/**
 * Valor literal do `.env.example`. Recusado como se fosse ausência.
 *
 * Elimina a classe de erro "alguém copiou o exemplo para o painel do Railway" —
 * que produziria um webhook aparentemente configurado, com uma credencial
 * pública, escrita neste repositório.
 */
export const GOOGLE_HEALTH_WEBHOOK_SECRET_PLACEHOLDER =
  'Bearer troque-por-um-aleatorio-longo';

/**
 * O segredo efetivo, ou `undefined` quando não há um utilizável.
 *
 * Vazio, só espaço em branco e o placeholder do `.env.example` são todos
 * ausência. Quem recebe `undefined` recusa tudo com 401 — nunca "deixa passar
 * porque não havia com o que comparar", que foi exatamente como o antigo
 * `GET /webhooks/fitbit` se autorizava sozinho.
 */
export function resolveWebhookSecret(
  configured: string | undefined,
): string | undefined {
  if (!configured) return undefined;
  const trimmed = configured.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed === GOOGLE_HEALTH_WEBHOOK_SECRET_PLACEHOLDER) return undefined;
  return configured;
}

/**
 * Comparação em tempo constante do header `Authorization`.
 *
 * O `timingSafeEqual` lança `RangeError` quando os buffers têm tamanhos
 * diferentes — e o tamanho do header é controlado por quem chama. Comparar o
 * SHA-256 dos dois lados dá 32 bytes dos dois lados por construção: o
 * `RangeError` deixa de ser alcançável (Mina 5) e o digest não vaza o
 * comprimento do segredo.
 *
 * O Google manda o `endpointAuthorization.secret` VERBATIM neste header, então
 * a comparação é do valor inteiro, esquema incluído — não há `Bearer ` a tirar.
 */
export function authorizationMatches(
  secret: string,
  authorization: string | undefined,
): boolean {
  if (!authorization) return false;
  const received = createHash('sha256').update(authorization, 'utf8').digest();
  const expected = createHash('sha256').update(secret, 'utf8').digest();
  return timingSafeEqual(received, expected);
}
