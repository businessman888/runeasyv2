import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import { Public } from '../../common/decorators';
import {
  authorizationMatches,
  resolveWebhookSecret,
} from './providers/google-health-webhook-auth';
import {
  GOOGLE_HEALTH_SIGNATURE_HEADER,
  GoogleHealthSignatureVerifier,
} from './providers/google-health-signature.verifier';
import {
  GOOGLE_HEALTH_JOB_DELETE,
  GOOGLE_HEALTH_JOB_SYNC_WINDOW,
  GOOGLE_HEALTH_SYNC_QUEUE,
  GoogleHealthNotification,
  GoogleHealthSyncJobData,
  GoogleHealthWebhookBody,
  extractGoogleHealthNotifications,
  isGoogleHealthVerification,
} from './providers/google-health-webhook.types';

/**
 * Identificador determinístico do job, derivado do CONTEÚDO da notificação.
 *
 * Reentrega não pode virar atividade nem XP em dobro: o Google retém até 7 dias
 * e reentrega tudo que não recebeu 204, então a MESMA notificação chega mais de
 * uma vez por construção. Com `jobId` igual, o BullMQ não cria o segundo job.
 *
 * O digest existe por um motivo prático: `physicalTimeInterval` é RFC3339, que
 * é cheio de `:`, e o BullMQ compõe chave de Redis com `:` no meio — id cru com
 * dois-pontos é pedir problema. Hex resolve, e de quebra não vaza identificador
 * do usuário no nome da chave.
 */
/**
 * Mensagem única dos três caminhos de 401.
 *
 * O `AllExceptionsFilter` devolve a mensagem da `HttpException` ao cliente
 * INCLUSIVE em produção. Com mensagens distintas, um chamador anônimo
 * distinguiria "segredo não configurado" de "credencial errada" de "assinatura
 * ruim" — e isso conta o estado do deploy a quem não deveria saber. O motivo
 * real continua no log, do nosso lado.
 */
const UNAUTHORIZED_MESSAGE = 'Unauthorized';

/**
 * Teto de sanidade do lote. Um corpo de 2 MB cabe milhares de envelopes
 * mínimos; acima disto não é uso legítimo, é sintoma.
 */
const MAX_BATCH = 500;

/**
 * Retenção do payload no Redis, em segundos.
 *
 * Separadas de propósito: um job concluído já não tem nada a dizer, e guardá-lo
 * é só reter `healthUserId` e `recordId` à toa; um job que falhou precisa
 * sobreviver tempo suficiente para alguém reparar e investigar.
 */
const COMPLETED_RETENTION_SECONDS = 60 * 60; // 1 h
const FAILED_RETENTION_SECONDS = 24 * 60 * 60; // 24 h

/**
 * Uma notificação só é endereçável se disser DE QUEM ela é.
 *
 * Sem `clientProvidedSubscriptionName` e sem `healthUserId` não há como mapear
 * o usuário — e, pior, a impressão digital do `jobId` fica idêntica para todas
 * elas. Duas notificações mínimas de usuários DIFERENTES colidiriam no mesmo
 * `jobId`, e o BullMQ descartaria a segunda em silêncio: perda de corrida de um
 * usuário real. Fora daqui, elas seguem pelo caminho de 204 que já existe —
 * retentar não mudaria nada.
 */
function isAddressable(notification: GoogleHealthNotification): boolean {
  return Boolean(
    notification.clientProvidedSubscriptionName?.trim() ||
    notification.healthUserId?.trim(),
  );
}

export function googleHealthJobId(
  notification: GoogleHealthNotification,
): string {
  const intervals = (notification.intervals ?? [])
    .map(
      (interval) =>
        `${interval.physicalTimeInterval?.startTime ?? ''}~${
          interval.physicalTimeInterval?.endTime ?? ''
        }`,
    )
    .join(',');

  const fingerprint = [
    notification.clientProvidedSubscriptionName ?? '',
    notification.healthUserId ?? '',
    notification.dataType ?? '',
    notification.operation ?? '',
    notification.recordId ?? '',
    intervals,
  ].join('|');

  return `gh-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
}

/**
 * Receptor do webhook da Google Health API.
 *
 * `POST /api/devices/webhooks/google-health`
 *
 * ── POR QUE NÃO EXISTE UM `GET` AQUI ─────────────────────────────────────────
 *
 * O antigo `GET /webhooks/fitbit` comparava o `verify` recebido com um segredo
 * que não existia — `undefined === undefined` — e se declarava verificado para
 * qualquer requisição anônima. O handshake do Google é `POST` nos dois passos,
 * então não declarar rota `GET` faz o Nest devolver 404 e torna esse bug
 * impossível de reintroduzir aqui.
 *
 * ── RATE LIMIT: A ROTA NÃO ESCAPA DO TETO, A CREDENCIAL ESCAPA ───────────────
 *
 * O `ThrottlerGuard` é global e roda ANTES do auth guard. O Google retém
 * notificação por até 7 dias e despeja o backlog de uma vez, tudo do mesmo
 * bloco de IPs — se ele batesse no teto, NÓS devolveríamos 429, que não é 204,
 * e ele retentaria em vez de drenar.
 *
 * A primeira versão resolvia isso com `@SkipThrottle()` na rota, e isso era
 * caro demais: esta rota é `@Public()` e o handshake responde 200 ao segredo
 * certo e 401 ao errado — um oráculo binário que NÃO dá para fechar, porque
 * responder 200 ao segredo válido é o contrato de registro do subscriber. Sem
 * teto, o oráculo aceita tentativas ilimitadas.
 *
 * Quem escapa do teto hoje é a CREDENCIAL, não a rota:
 * `WebhookAwareThrottlerGuard` pula o limite só para quem já apresenta o
 * segredo correto. Ver o racional completo lá.
 */
@Controller('devices')
export class GoogleHealthWebhookController {
  private readonly logger = new Logger(GoogleHealthWebhookController.name);

  /** `endpointAuthorization.secret` do subscriber — ver `.env.example`. */
  private readonly secret: string | undefined;

  constructor(
    config: ConfigService,
    private readonly signatureVerifier: GoogleHealthSignatureVerifier,
    @InjectQueue(GOOGLE_HEALTH_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {
    // Vazio, só espaço em branco e o placeholder do `.env.example` são todos
    // tratados como ausência — ver `google-health-webhook-auth.ts`. O guard de
    // throttle usa exatamente o mesmo resolver, para os dois não divergirem.
    this.secret = resolveWebhookSecret(
      config.get<string>('GOOGLE_HEALTH_WEBHOOK_SECRET'),
    );

    if (!this.secret) {
      this.logger.warn(
        'GOOGLE_HEALTH_WEBHOOK_SECRET ausente — o webhook recusa TUDO com 401',
      );
    }
  }

  /**
   * Ordem de decisão, e cada passo é fail-closed:
   *
   * 1. segredo não configurado          ⇒ 401
   * 2. `Authorization` diferente         ⇒ 401  (passo 2 do handshake)
   * 3. `{"type":"verification"}`         ⇒ 200  (passo 1 do handshake)
   * 4. assinatura ruim                   ⇒ 401, e NENHUM job enfileirado
   * 5. enfileira                         ⇒ 204
   * 6. enfileiramento falhou             ⇒ 503
   *
   * O 503 do passo 6 é deliberado: 204 significa "eu tenho isso", e o Google
   * não retenta o que foi confirmado. Confirmar sem ter enfileirado seria
   * perder a corrida do usuário em silêncio.
   */
  @Public()
  @Post('webhooks/google-health')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(
    @Headers('authorization') authorization: string | undefined,
    @Headers(GOOGLE_HEALTH_SIGNATURE_HEADER) signature: string | undefined,
    @Body() body: GoogleHealthWebhookBody,
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // 1. Sem segredo não há comparação possível. Comparar dois `undefined` foi
    // exatamente como o webhook antigo do Fitbit se autorizava sozinho.
    const secret = this.secret;
    if (!secret) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    // 2. O Google manda o valor de `endpointAuthorization.secret` VERBATIM no
    // header `Authorization`.
    if (!authorizationMatches(secret, authorization)) {
      this.logger.warn(
        `Google Health webhook: Authorization ${authorization ? 'inválido' : 'ausente'} — 401, nada enfileirado`,
      );
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    // 3. Handshake. A verificação chega SEM header de assinatura (a doc é
    // explícita), então exigir assinatura aqui reprovaria o registro do
    // subscriber inteiro — e o Commit C depende dele.
    if (isGoogleHealthVerification(body)) {
      this.logger.log(
        'Google Health webhook: handshake de verificação com credencial válida — 200',
      );
      res.status(HttpStatus.OK);
      return;
    }

    // 4. Assinatura sobre o CORPO CRU. `JSON.stringify(req.body)` reserializa e
    // muda bytes (ordem de chave, espaçamento, escape) — a assinatura do Google
    // é sobre o que veio no fio. `rawBody: true` vem de `main.ts:25`.
    const check = await this.signatureVerifier.verify(req.rawBody, signature);
    if (!check.ok) {
      // Formato, tamanho e keyId bastam para diagnosticar. A assinatura em si
      // nunca é logada.
      this.logger.warn(
        `Google Health webhook: assinatura recusada (${check.reason}` +
          `${check.keyId === undefined ? '' : `, keyId=${check.keyId}`}` +
          `, ${req.rawBody?.length ?? 0} bytes) — 401, nada enfileirado`,
      );
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    // 5. Objeto OU array (lote).
    const notifications =
      extractGoogleHealthNotifications(body).filter(isAddressable);
    if (notifications.length === 0) {
      // Assinado pelo Google, mas sem nada que saibamos processar. 204 e não
      // 401: retentar não mudaria o resultado, e só acumularia backlog.
      this.logger.warn(
        `Google Health webhook: corpo assinado (keyId=${check.keyId}) sem notificação utilizável — 204, nada enfileirado`,
      );
      return;
    }

    await this.enqueue(notifications, check.keyId);
  }

  /**
   * Um job por notificação, num `addBulk` só.
   *
   * Sem `attempts`/`backoff` aqui de propósito: `app.module.ts:59-64` já define
   * `attempts: 3`, backoff exponencial de 5 s e `removeOnComplete: 1000` como
   * default GLOBAL de toda fila. O override para o `429` do Google é decisão do
   * Commit D, que é quem vai falar com a API.
   *
   * ── POR QUE `addBulk` E NÃO UM LAÇO ──────────────────────────────────────
   *
   * A notificação chega em lote, e o teto de corpo é 2 MB: envelopes mínimos
   * cabem aos milhares. Um laço sequencial seria uma ida e volta ao Redis por
   * notificação — a requisição estouraria o timeout do Google, ele retentaria,
   * e o laço rodaria de novo. É a forma do incidente que já gerou 8,2M linhas
   * neste projeto. `addBulk` é uma viagem só, e `MAX_BATCH` recusa o absurdo
   * antes de tocar o Redis.
   *
   * ── POR QUE A RETENÇÃO É POR IDADE ───────────────────────────────────────
   *
   * O default global remove por CONTAGEM (1000/5000), sem teto de idade. O
   * payload carrega `healthUserId` e `recordId` — identificadores ligados a
   * dado de saúde. Numa fila de baixo volume, remover por contagem é o mesmo
   * que guardar para sempre. Por idade, o Redis esquece sozinho.
   */
  private async enqueue(
    notifications: GoogleHealthNotification[],
    keyId: number,
  ): Promise<void> {
    const receivedAt = new Date().toISOString();

    if (notifications.length > MAX_BATCH) {
      // Assinado pelo Google e ainda assim absurdo. Recusar com 503 faz ele
      // retentar; aceitar faria o Redis crescer sem despejo.
      this.logger.error(
        `Google Health webhook: lote de ${notifications.length} notificações ` +
          `acima do teto de ${MAX_BATCH} — 503, nada enfileirado`,
      );
      throw new ServiceUnavailableException('Batch too large');
    }

    const jobs = notifications.map((notification) => ({
      name:
        notification.operation === 'DELETE'
          ? GOOGLE_HEALTH_JOB_DELETE
          : GOOGLE_HEALTH_JOB_SYNC_WINDOW,
      data: { notification, receivedAt } satisfies GoogleHealthSyncJobData,
      opts: {
        jobId: googleHealthJobId(notification),
        removeOnComplete: { age: COMPLETED_RETENTION_SECONDS },
        removeOnFail: { age: FAILED_RETENTION_SECONDS },
      },
    }));

    try {
      await this.syncQueue.addBulk(jobs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Google Health webhook: falha ao enfileirar lote de ${jobs.length} — ` +
          `503 para o Google retentar: ${message}`,
      );
      // 503 e não 204. O que porventura tenha entrado fica: a reentrega do
      // Google traz o lote inteiro de novo e o `jobId` determinístico faz os
      // repetidos serem no-op.
      throw new ServiceUnavailableException('Failed to enqueue notification');
    }

    // O `clientProvidedSubscriptionName` É o `user_id` do RunEasy, e o par
    // `user_id` + tipo de dado de saúde num log sem política de retenção é
    // registro adjacente a dado de saúde. O `jobId` já identifica o job para
    // diagnóstico, e é um digest.
    this.logger.log(
      `Google Health webhook: ${jobs.length} job(s) enfileirado(s) ` +
        `(keyId=${keyId}, ids=${jobs.map((job) => job.opts.jobId).join(',')})`,
    );
  }
}
