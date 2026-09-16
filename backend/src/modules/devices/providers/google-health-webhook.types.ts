/**
 * Formato do que a Google Health API entrega no webhook — e o motivo de isto
 * ser INTERFACE, e não DTO de classe com `class-validator`.
 *
 * ── POR QUE INTERFACE ────────────────────────────────────────────────────────
 *
 * `main.ts:88` liga `forbidNonWhitelisted: true` no `ValidationPipe` global.
 * Com uma classe decorada, QUALQUER campo que o Google mande e que nós não
 * tenhamos declarado vira **400**. E 400 não é 204: a documentação do Google
 * diz que qualquer status diferente de 204 dispara reentrega, e que a
 * notificação fica retida por até 7 dias. Ou seja: um campo novo do lado deles
 * viraria, em silêncio, uma fila de reentrega crescendo do nosso lado.
 *
 * Interface não existe em runtime — o metatype que o Nest passa ao
 * `ValidationPipe` é `Object`, que ele ignora, e campo desconhecido
 * simplesmente passa. É exatamente o motivo pelo qual o webhook do RevenueCat
 * usa interface (`subscription/dto/revenuecat-event.dto.ts`).
 *
 * Corolário: NENHUM campo daqui é confiável por ter sido "validado". O que
 * autentica a notificação é a assinatura sobre o corpo cru
 * (`google-health-signature.verifier.ts`), não o formato.
 */

/** `UPSERT` cria ou atualiza o dado; `DELETE` some com ele no lado do Google. */
export type GoogleHealthOperation = 'UPSERT' | 'DELETE';

/** Início e fim em RFC3339 (`2026-09-15T10:00:00Z`). */
export interface GoogleHealthTimeInterval {
  startTime?: string;
  endTime?: string;
}

/**
 * A doc lista três intervalos por entrada: `physicalTimeInterval` (instante
 * físico, RFC3339), `civilIso8601TimeInterval` (hora civil da fonte) e
 * `civilDateTimeInterval`. O terceiro não é declarado de propósito: nós não o
 * lemos, e interface ignora o que sobra sem devolver 400.
 */
export interface GoogleHealthNotificationInterval {
  physicalTimeInterval?: GoogleHealthTimeInterval;
  civilIso8601TimeInterval?: GoogleHealthTimeInterval;
}

export interface GoogleHealthNotification {
  version?: string;
  /**
   * Com `subscriptionCreatePolicy: MANUAL`, é o `subscriptionId` que NÓS
   * escolhemos na criação da subscription — o Commit C vai usar o `user_id` do
   * RunEasy ali, e é por aqui que a notificação volta amarrada ao usuário.
   * Em `AUTOMATIC` o Google gera um nome opaco.
   */
  clientProvidedSubscriptionName?: string;
  /** Id do usuário no lado do Google (opaco). */
  healthUserId?: string;
  operation?: GoogleHealthOperation;
  dataType?: string;
  intervals?: GoogleHealthNotificationInterval[];
  /** Só vem em deleção de dado identificável. */
  recordId?: string;
}

/** A notificação chega EMBRULHADA em `data`. */
export interface GoogleHealthNotificationEnvelope {
  data?: GoogleHealthNotification;
}

/** Corpo dos dois passos do handshake: `{"type":"verification"}`. */
export interface GoogleHealthVerificationBody {
  type?: string;
}

/**
 * O corpo pode ser um envelope, um ARRAY de envelopes (lote) ou o corpo de
 * verificação. Tratar só o objeto perderia o lote inteiro em silêncio.
 */
export type GoogleHealthWebhookBody =
  | GoogleHealthVerificationBody
  | GoogleHealthNotificationEnvelope
  | GoogleHealthNotificationEnvelope[];

export const GOOGLE_HEALTH_VERIFICATION_TYPE = 'verification';

/**
 * Passo do handshake, não notificação. A verificação chega SEM o header de
 * assinatura (medido na doc), então quem responde por ela não pode exigir
 * assinatura.
 */
export function isGoogleHealthVerification(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return (
    (body as GoogleHealthVerificationBody).type ===
    GOOGLE_HEALTH_VERIFICATION_TYPE
  );
}

/**
 * Desembrulha `data` aceitando objeto OU array. Entrada que não tem `data`
 * utilizável é descartada aqui — nunca vira job com `undefined` dentro.
 */
export function extractGoogleHealthNotifications(
  body: unknown,
): GoogleHealthNotification[] {
  const envelopes: unknown[] = Array.isArray(body) ? body : [body];
  const notifications: GoogleHealthNotification[] = [];

  for (const envelope of envelopes) {
    if (!envelope || typeof envelope !== 'object') continue;
    const data = (envelope as GoogleHealthNotificationEnvelope).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      notifications.push(data);
    }
  }

  return notifications;
}

// ─── Contrato com a fila ─────────────────────────────────────────────────────
//
// O produtor é o webhook (Commit B); o CONSUMIDOR é o Commit D. Entre um
// deploy e outro a fila acumula job sem processor — de propósito: perder a
// notificação seria pior, porque o Google só retém 7 dias.

export const GOOGLE_HEALTH_SYNC_QUEUE = 'google-health-sync-queue';

/** Notificação de dado novo/alterado: o processor busca a janela. */
export const GOOGLE_HEALTH_JOB_SYNC_WINDOW = 'sync-window';
/** `operation: DELETE` — o processor apaga a activity correspondente. */
export const GOOGLE_HEALTH_JOB_DELETE = 'delete';

export interface GoogleHealthSyncJobData {
  notification: GoogleHealthNotification;
  /** Quando NÓS recebemos (ISO). A janela do dado é `notification.intervals`. */
  receivedAt: string;
}
