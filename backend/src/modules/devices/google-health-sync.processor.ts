import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { ActivitySyncService } from './activity-sync.service';
import { RefreshTokenInvalidError } from './token-refresher';
import {
  GoogleHealthApiClient,
  GoogleHealthDataPoint,
  GoogleHealthFetchWindow,
  toCivilFilterTime,
  GoogleHealthRateLimitError,
  GOOGLE_HEALTH_PROVIDER,
} from './providers/google-health-api.client';
import {
  GoogleHealthActivity,
  GoogleHealthNormalizer,
} from './providers/google-health.normalizer';
import {
  GoogleHealthTcxParser,
  TcxTrackPoint,
} from './providers/google-health-tcx.parser';
import {
  GOOGLE_HEALTH_BACKFILL_JOB_OPTIONS,
  GOOGLE_HEALTH_JOB_BACKFILL,
  GOOGLE_HEALTH_JOB_DELETE,
  GOOGLE_HEALTH_JOB_SYNC_WINDOW,
  GOOGLE_HEALTH_SYNC_QUEUE,
  GoogleHealthBackfillJobData,
  GoogleHealthNotification,
  GoogleHealthSyncJobData,
} from './providers/google-health-webhook.types';

/**
 * O consumidor da `google-health-sync-queue` — o ponto em que o dado finalmente
 * entra no RunEasy.
 *
 * Molde: `modules/feedback/feedback.processor.ts`. `extends WorkerHost`,
 * despacho por `job.name`, idioma `isFinalAttempt`, e `throw` no fim para que o
 * retry HERDADO (`app.module.ts:59-64`: `attempts: 3`, backoff exponencial de
 * 5 s) entre em ação. Um `throw` engolido aqui seria perda silenciosa de uma
 * corrida que o Google não vai reentregar de novo.
 *
 * ── RATE LIMITING DE SAÍDA ───────────────────────────────────────────────────
 *
 * `limiter` é o **nativo do BullMQ** (`bullmq@5.66` suporta), mais um teto de
 * concorrência. Nenhuma dependência nova.
 *
 * O risco que isto contém NÃO é a quota do Google: 90 dias de um usuário são
 * ~94 requisições, ~38 s a 2,5 QPS. É **muitos usuários voltando ao mesmo
 * tempo** — o Google retém o backlog por 7 dias e o entrega EM RAJADA quando o
 * endpoint volta. Sem limiter, N usuários × páginas de 25 viram uma enxurrada
 * simultânea de `completeWorkout` contra o banco. É a forma exata do incidente
 * que gerou 8,27 M de linhas e 2,23 GB neste projeto.
 *
 * ── O QUE NÃO ESTÁ AQUI ──────────────────────────────────────────────────────
 *
 * Nada de Fitbit ou Polar. A `activity-sync-queue` e o `ActivitySyncProcessor`
 * ficam intocados, e esta fila é revertível sozinha.
 */

/**
 * Jobs em paralelo. Baixo de propósito: cada job pode disparar dezenas de
 * `completeWorkout`, que por sua vez escreve em `activities`, `workouts`,
 * `workout_routes`, gamificação e fila de feedback.
 */
const CONCURRENCY = 2;

/** Teto de requisições de saída da fila inteira. 2,5 QPS. */
const LIMITER = { max: 5, duration: 2000 };

/** Páginas de 25 por job incremental — 200 corridas cobrem qualquer rajada. */
const SYNC_WINDOW_MAX_PAGES = 8;

/** O retroativo pode ir mais fundo: 40 × 25 = 1000 corridas. */
const BACKFILL_MAX_PAGES = 40;

/**
 * Folga aplicada à janela da notificação, em milissegundos.
 *
 * O filtro é `exercise.interval.start_time >= X AND < Y`, e a notificação diz
 * qual intervalo mudou. Igualdade exata num limite depende de o Google e nós
 * arredondarmos igual — e um segundo de diferença descarta a corrida inteira,
 * em silêncio, sem erro. Um minuto de folga custa nada (a página é de 25) e
 * fecha a classe inteira de falha.
 */
const WINDOW_PADDING_MS = 60 * 1000;

/**
 * Folga usada quando só há o instante FÍSICO e é preciso filtrá-lo como civil.
 *
 * O fuso de quem correu é desconhecido, e os offsets do mundo cabem em ±14 h —
 * um dia para cada lado cobre com sobra. O excesso é barato: `external_id` dá
 * idempotência exata e o dedup cross-provider descarta o resto. Janela estreita
 * demais, não: perderia a corrida em silêncio.
 */
const CIVIL_SAFETY_PADDING_MS = 24 * 60 * 60 * 1000;

/**
 * Quando a notificação não traz intervalo utilizável, a janela é derivada do
 * momento em que NÓS recebemos. Larga o bastante para cobrir o backlog de uma
 * reentrega tardia sem virar um retroativo disfarçado.
 */
const FALLBACK_WINDOW_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const FALLBACK_WINDOW_LOOKAHEAD_MS = 60 * 60 * 1000;

/** `clientProvidedSubscriptionName` é o `user_id` do RunEasy — um UUID. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Processor(GOOGLE_HEALTH_SYNC_QUEUE, {
  concurrency: CONCURRENCY,
  limiter: LIMITER,
})
export class GoogleHealthSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GoogleHealthSyncProcessor.name);

  constructor(
    @InjectQueue(GOOGLE_HEALTH_SYNC_QUEUE)
    private readonly syncQueue: Queue,
    private readonly apiClient: GoogleHealthApiClient,
    private readonly normalizer: GoogleHealthNormalizer,
    private readonly tcxParser: GoogleHealthTcxParser,
    private readonly activitySyncService: ActivitySyncService,
    private readonly supabaseService: SupabaseService,
  ) {
    super();
  }

  async process(job: Job<unknown, unknown, string>): Promise<unknown> {
    this.logger.log(`Processing job ${job.id ?? '?'} of type ${job.name}`);

    try {
      switch (job.name) {
        case GOOGLE_HEALTH_JOB_SYNC_WINDOW:
          return await this.handleSyncWindow(
            job.data as GoogleHealthSyncJobData,
          );
        case GOOGLE_HEALTH_JOB_DELETE:
          return await this.handleDelete(job.data as GoogleHealthSyncJobData);
        case GOOGLE_HEALTH_JOB_BACKFILL:
          return await this.handleBackfill(
            job.data as GoogleHealthBackfillJobData,
          );
        default:
          // Job name que este processor não conhece. Não é erro: a fila é
          // compartilhada com quem vier depois, e retentar não mudaria nada.
          this.logger.warn(
            `Google Health sync: job name desconhecido "${job.name}" — ignorado`,
          );
          return { ignored: true };
      }
    } catch (error) {
      throw this.toJobError(error, job);
    }
  }

  /**
   * Enfileira um retroativo com `attempts`/`backoff` PRÓPRIOS.
   *
   * O default global (3 × 5 s) não cobre `429`: as três tentativas queimam
   * contra a mesma parede em 35 s. Ver
   * `GOOGLE_HEALTH_BACKFILL_JOB_OPTIONS`.
   *
   * ⚠️ SEM PRODUTOR HOJE. O script do Commit C (retroativo de quem conectou na
   * Fase 3) e a Fase 5 são os chamadores previstos. Está aqui porque o
   * retroativo tem que ser um job SEPARADO, com throttle próprio, e nunca o
   * caminho incremental com uma janela maior.
   */
  async enqueueBackfill(data: GoogleHealthBackfillJobData): Promise<void> {
    await this.syncQueue.add(GOOGLE_HEALTH_JOB_BACKFILL, data, {
      ...GOOGLE_HEALTH_BACKFILL_JOB_OPTIONS,
      // Um retroativo por usuário e janela: reenfileirar o mesmo pedido é
      // no-op, não uma segunda varredura de 90 dias.
      jobId:
        `gh-backfill-${data.userId}-${data.startTime}-${data.endTime}`.replace(
          /:/g,
          '',
        ),
    });
  }

  // ─── sync-window ───────────────────────────────────────────────────────────

  private async handleSyncWindow(data: GoogleHealthSyncJobData) {
    const notification = data.notification;

    if (notification.dataType && notification.dataType !== 'exercise') {
      // A subscription do Commit C pede só `exercise`. Qualquer outro tipo é
      // ruído — e retentar não o transformaria em corrida.
      this.logger.log(
        `Google Health sync: dataType "${notification.dataType}" fora de escopo — ignorado`,
      );
      return { ignored: true, reason: 'data_type_out_of_scope' };
    }

    const userId = await this.resolveUserId(notification);
    if (!userId) {
      // Notificação de alguém que não tem (ou não tem mais) conexão aqui. Um
      // throw queimaria 3 tentativas contra um fato que não muda.
      this.logger.warn(
        'Google Health sync: notificação sem usuário correspondente — ignorada',
      );
      return { ignored: true, reason: 'unresolved_user' };
    }

    const window = this.resolveWindow(notification, data.receivedAt);
    const result = await this.ingestWindow(
      userId,
      window,
      SYNC_WINDOW_MAX_PAGES,
    );

    if (result.truncated) {
      // A janela de uma notificação não deveria encher 8 páginas. Se encheu, a
      // premissa "a notificação descreve uma corrida" está errada — e o
      // retroativo, não o incremental, é quem deve cobrir o resto.
      this.logger.warn(
        `Google Health sync: janela truncada para ${userId} — considerar backfill`,
      );
    }

    return result;
  }

  // ─── backfill ──────────────────────────────────────────────────────────────

  private async handleBackfill(data: GoogleHealthBackfillJobData) {
    const window: GoogleHealthFetchWindow = {
      startTime: data.startTime,
      endTime: data.endTime,
    };
    return this.ingestWindow(data.userId, window, BACKFILL_MAX_PAGES);
  }

  // ─── o caminho comum: buscar, normalizar, convergir ────────────────────────

  private async ingestWindow(
    userId: string,
    window: GoogleHealthFetchWindow,
    maxPages: number,
  ) {
    // O escopo PERSISTIDO, lido antes de buscar.
    //
    // Ele NÃO gateia o fetch de `exercise`, e isso é deliberado: uma linha
    // antiga com `scope` NULL viraria perda silenciosa de toda corrida do
    // usuário. Quem recusa por falta de escopo é o Google, com 403, que é
    // barulhento. O que o escopo decide de verdade é o TCX: sem
    // `location.readonly` não existe rota, e é isso que o Commit E e a Fase 5
    // consultam.
    const state = await this.apiClient.getConnectionState(userId);
    if (!state.hasLocationScope) {
      this.logger.log(
        `[google_health] ${userId} sem location.readonly — corridas entram sem rota (TCX indisponível)`,
      );
    }

    const { dataPoints, truncated } = await this.apiClient.listAllExercise(
      userId,
      window,
      maxPages,
    );

    // De graça: o `healthUserId` vem no `name` de qualquer dataPoint, e o
    // Commit C precisa dele (`CreateSubscriptionPayload.user` é
    // `"users/{healthUserId}"`).
    await this.apiClient.persistHealthUserId(
      userId,
      dataPoints,
      state.providerUserId,
    );

    return this.ingestDataPoints(
      userId,
      dataPoints,
      truncated,
      state.hasLocationScope,
    );
  }

  /**
   * A rota da corrida, quando existe e quando podemos buscá-la.
   *
   * Dois gates ANTES da segunda requisição, e os dois economizam quota: sem
   * `hasGps` não há rota para pedir, e sem `location.readonly` o Google
   * recusaria. Um backfill de 90 dias são ~180 requisições só de TCX.
   *
   * Falhar aqui nunca impede a corrida de entrar: rota ausente é corrida sem
   * mapa. Só o `429` sobe, porque é transitório e a fila sabe retentar.
   */
  private async fetchRoute(
    userId: string,
    activity: GoogleHealthActivity,
    hasLocationScope: boolean,
  ): Promise<TcxTrackPoint[] | undefined> {
    if (!activity.has_gps) return undefined;
    if (!hasLocationScope) {
      this.logger.log(
        `[google_health] ${activity.external_id} tem GPS mas falta location.readonly — entra sem rota`,
      );
      return undefined;
    }

    let xml: string | null;
    try {
      xml = await this.apiClient.exportExerciseTcx(
        userId,
        activity.data_point_id,
      );
    } catch (error) {
      if (error instanceof GoogleHealthRateLimitError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[google_health] TCX de ${activity.external_id} falhou (${message}) — entra sem rota`,
      );
      return undefined;
    }

    if (!xml) return undefined;

    const points = this.tcxParser.parse(xml);
    if (points.length < 2) {
      // Menos de 2 pontos não vira LINESTRING nem passa no replay de esforço.
      this.logger.warn(
        `[google_health] TCX de ${activity.external_id} rendeu ${points.length} ponto(s) — sem rota utilizável`,
      );
      return undefined;
    }

    this.logger.log(
      `[google_health] rota de ${activity.external_id}: ${points.length} pontos`,
    );
    return points;
  }

  private async ingestDataPoints(
    userId: string,
    dataPoints: GoogleHealthDataPoint[],
    truncated: boolean,
    hasLocationScope: boolean,
  ) {
    let ingested = 0;
    let skipped = 0;
    let rejected = 0;
    let firstError: unknown = null;

    for (const dataPoint of dataPoints) {
      const activity = this.normalizer.normalize(dataPoint, userId);
      if (!activity) {
        // Não é corrida, ou não tem chave/duração/hora utilizável. O normalizer
        // já logou o motivo.
        rejected += 1;
        continue;
      }

      // A rota entra ANTES da convergência: `completeWorkout` só grava
      // `workout_routes` a partir do que recebe, e não há segunda chance —
      // um reenvio posterior bate na idempotência por `external_id` e é
      // descartado como já sincronizado.
      activity.gps_route = await this.fetchRoute(
        userId,
        activity,
        hasLocationScope,
      );

      try {
        const outcome =
          await this.activitySyncService.processDeviceLocalActivity(
            activity,
            'google_health',
          );
        if (outcome.action === 'inserted') ingested += 1;
        else skipped += 1;
      } catch (error) {
        // Um dataPoint ruim não pode impedir os outros de entrar. O erro é
        // guardado e relançado no fim: o job falha, o BullMQ retenta, e o
        // reprocessamento é seguro porque a idempotência por `external_id` é
        // exata — o que já entrou é devolvido como `skipped`.
        if (firstError === null) firstError = error;
        this.logger.error(
          `[google_health] falha ao processar ${activity.external_id}: ${this.describe(error)}`,
        );
      }
    }

    this.logger.log(
      `[google_health] usuário ${userId}: ${ingested} ingerida(s), ` +
        `${skipped} já existente(s)/duplicada(s), ${rejected} descartada(s)` +
        (truncated ? ' — janela TRUNCADA' : ''),
    );

    if (firstError !== null) throw firstError;

    return { ingested, skipped, rejected, truncated };
  }

  // ─── operation: DELETE ─────────────────────────────────────────────────────

  /**
   * O usuário apagou a atividade no lado do Google.
   *
   * ── DECISÃO TOMADA: APAGAR A ACTIVITY, DEIXAR OS AGREGADOS RECALCULAREM ────
   *
   * Isso FUNCIONA para readiness, stats e wellness, que leem `activities` a
   * cada consulta e portanto se corrigem sozinhos. NÃO funciona para XP e
   * badges, que são CONCEDIDOS e não recomputados — e por isso cada deleção
   * deixa um registro explícito do que ficou por estornar. Estorno completo NÃO
   * está implementado, e isso é decisão, não esquecimento.
   *
   * O workout permanece `completed`: revertê-lo para `pending` reabriria o
   * treino no calendário dias depois, e reverter status é uma decisão adiada,
   * também registrada.
   */
  private async handleDelete(data: GoogleHealthSyncJobData) {
    const notification = data.notification;

    const recordId = notification.recordId?.trim();
    if (!recordId) {
      // Sem `recordId` não há o que apagar: a notificação não diz QUAL dado
      // sumiu. Retentar não faria aparecer.
      this.logger.warn(
        'Google Health delete: notificação sem recordId — ignorada',
      );
      return { ignored: true, reason: 'missing_record_id' };
    }

    const userId = await this.resolveUserId(notification);
    if (!userId) {
      this.logger.warn(
        'Google Health delete: notificação sem usuário correspondente — ignorada',
      );
      return { ignored: true, reason: 'unresolved_user' };
    }

    const externalId = `gh_${recordId}`;

    const { data: activity, error: activityError } = await this.supabaseService
      .from('activities')
      .select('id')
      .eq('external_id', externalId)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>();

    if (activityError) {
      throw new Error(
        `Could not look up activity for deletion: ${activityError.message}`,
      );
    }

    if (!activity) {
      // Nunca foi ingerida, ou já foi apagada por uma reentrega anterior.
      // Idempotente por construção.
      this.logger.log(
        `Google Health delete: ${externalId} não existe em activities — nada a fazer`,
      );
      return { deleted: false, reason: 'not_found' };
    }

    // Os workouts que apontavam para ela — lidos ANTES de anular, porque é o
    // único momento em que o vínculo ainda existe para ir ao log.
    const { data: linkedWorkouts, error: linkedError } =
      await this.supabaseService
        .from('workouts')
        .select('id')
        .eq('activity_id', activity.id)
        .eq('user_id', userId);

    if (linkedError) {
      throw new Error(
        `Could not look up linked workouts: ${linkedError.message}`,
      );
    }

    const workoutIds = (linkedWorkouts ?? []).map(
      (row: { id: string }) => row.id,
    );

    if (workoutIds.length > 0) {
      // Anulado EXPLICITAMENTE, e não por `ON DELETE SET NULL`: a FK com essa
      // ação mora em `backend/migrations/` (legado), fora do diretório
      // canônico de migrations — depender dela é depender de algo que pode não
      // existir em todo ambiente.
      const { error: unlinkError } = await this.supabaseService
        .from('workouts')
        .update({ activity_id: null })
        .in('id', workoutIds);

      if (unlinkError) {
        throw new Error(
          `Could not unlink workouts from activity: ${unlinkError.message}`,
        );
      }
    }

    const { error: deleteError } = await this.supabaseService
      .from('activities')
      .delete()
      .eq('id', activity.id);

    if (deleteError) {
      throw new Error(`Could not delete activity: ${deleteError.message}`);
    }

    // ── O registro do que NÃO foi estornado ─────────────────────────────────
    //
    // `external_id` vai para o log aqui, e só aqui, apesar da regra geral de
    // não logar `recordId`: sem ele esta linha não serve para auditar nada, e
    // o valor já está gravado em claro em `activities.external_id`. O que a
    // regra protege é o log de ROTINA da notificação, não a trilha de uma
    // operação destrutiva.
    this.logger.warn(
      `[google_health] activity ${externalId} APAGADA (user=${userId}, ` +
        `workouts desvinculados=${workoutIds.join(',') || 'nenhum'}). ` +
        'NÃO estornado: XP concedido permanece, badges não são revogadas, ' +
        'workout_routes permanece, e o workout continua como `completed`. ' +
        'Readiness, stats e wellness se corrigem sozinhos (releem activities).',
    );

    return { deleted: true, workoutIds };
  }

  // ─── suporte ───────────────────────────────────────────────────────────────

  /**
   * De quem é esta notificação.
   *
   * Dois caminhos, nesta ordem:
   *  1. `clientProvidedSubscriptionName` — com `subscriptionCreatePolicy:
   *     MANUAL`, é o `subscriptionId` que NÓS escolhemos, e o Commit C põe ali
   *     o `user_id` do RunEasy. É o mapeamento direto.
   *  2. `healthUserId` → `connected_devices.provider_user_id`. Só funciona
   *     depois que alguma listagem já descobriu o id (ver
   *     `persistHealthUserId`), e é a rede de segurança enquanto o Commit C não
   *     está no ar.
   *
   * O caminho 1 é CONFERIDO contra o banco antes de ser aceito: o valor vem de
   * fora e não pode virar `user_id` por decreto, mesmo com a assinatura válida.
   *
   * Erro de banco SOBE (é transitório, o retry resolve). "Não achei" devolve
   * `null` — retentar não faria a conexão aparecer.
   */
  private async resolveUserId(
    notification: GoogleHealthNotification,
  ): Promise<string | null> {
    const claimed = notification.clientProvidedSubscriptionName?.trim();
    if (claimed && UUID_PATTERN.test(claimed)) {
      const { data, error } = await this.supabaseService
        .from('connected_devices')
        .select('user_id')
        .eq('user_id', claimed)
        .eq('provider', GOOGLE_HEALTH_PROVIDER)
        .maybeSingle<{ user_id: string }>();

      if (error) {
        throw new Error(
          `Could not verify google_health connection: ${error.message}`,
        );
      }
      if (data) return data.user_id;
    }

    const healthUserId = notification.healthUserId?.trim();
    if (healthUserId) {
      const { data, error } = await this.supabaseService
        .from('connected_devices')
        .select('user_id')
        .eq('provider_user_id', healthUserId)
        .eq('provider', GOOGLE_HEALTH_PROVIDER)
        .maybeSingle<{ user_id: string }>();

      if (error) {
        throw new Error(
          `Could not resolve google_health user: ${error.message}`,
        );
      }
      if (data) return data.user_id;
    }

    return null;
  }

  /**
   * A janela do fetch sai dos `intervals` da PRÓPRIA notificação.
   *
   * Nada de `last_sync_at`: essa coluna é da migration do Commit C e ainda não
   * foi aplicada. Depender dela aqui faria o Commit D quebrar no staging até
   * alguém rodar SQL — e o roadmap manda o contrário.
   *
   * Preferimos o intervalo FÍSICO (RFC3339 com `Z`) ao civil: o físico é
   * inequívoco, e o civil depende do fuso do usuário, que nós não conhecemos.
   * Vários intervalos viram UMA janela (mínimo dos inícios, máximo dos fins) —
   * uma requisição paginada é mais barata que N requisições, e a idempotência
   * por `external_id` torna a sobreposição inofensiva.
   */
  private resolveWindow(
    notification: GoogleHealthNotification,
    receivedAt: string,
  ): GoogleHealthFetchWindow {
    const starts: number[] = [];
    const ends: number[] = [];

    // O filtro da API só aceita tempo CIVIL (medido: o físico devolve 400
    // INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER). E a notificação já traz o
    // civil pronto em `civilIso8601TimeInterval` — usá-lo é exato e dispensa
    // qualquer conversão de fuso, que nós não teríamos como fazer: o fuso é o
    // de quem correu, não o nosso.
    const civis: string[] = [];
    for (const interval of notification.intervals ?? []) {
      const ci = interval.civilIso8601TimeInterval;
      if (ci?.startTime) civis.push(ci.startTime);
      if (ci?.endTime) civis.push(ci.endTime);
    }

    if (civis.length > 0) {
      const ordenados = [...civis].sort();
      return {
        startTime: this.shiftCivil(ordenados[0], -WINDOW_PADDING_MS),
        endTime: this.shiftCivil(
          ordenados[ordenados.length - 1],
          WINDOW_PADDING_MS,
        ),
      };
    }

    // Sem o civil, sobra o físico — que NÃO pode ir para o filtro. Converte-se
    // o instante em civil e alarga-se a janela em um dia para cada lado: o fuso
    // do usuário é desconhecido e o mundo cabe em ±14 h. Buscar dataPoint a
    // mais é barato; a idempotência por `external_id` e o dedup a jusante são
    // exatos e absorvem o excesso. Perder a corrida por janela estreita, não.
    for (const interval of notification.intervals ?? []) {
      const start = this.toEpoch(interval.physicalTimeInterval?.startTime);
      const end = this.toEpoch(interval.physicalTimeInterval?.endTime);
      if (start !== null) starts.push(start);
      if (end !== null) ends.push(end);
    }

    if (starts.length > 0) {
      const from = Math.min(...starts) - CIVIL_SAFETY_PADDING_MS;
      const to =
        (ends.length > 0 ? Math.max(...ends) : Math.max(...starts)) +
        CIVIL_SAFETY_PADDING_MS;
      this.logger.warn(
        'Google Health sync: notificação sem intervalo civil — janela alargada a partir do físico',
      );
      return {
        startTime: toCivilFilterTime(new Date(from).toISOString()),
        endTime: toCivilFilterTime(new Date(to).toISOString()),
      };
    }

    const anchor = this.toEpoch(receivedAt) ?? Date.now();
    this.logger.warn(
      'Google Health sync: notificação sem intervalo físico — janela derivada do recebimento',
    );
    return {
      startTime: toCivilFilterTime(
        new Date(anchor - FALLBACK_WINDOW_LOOKBACK_MS).toISOString(),
      ),
      endTime: toCivilFilterTime(
        new Date(anchor + FALLBACK_WINDOW_LOOKAHEAD_MS).toISOString(),
      ),
    };
  }

  /**
   * Soma (ou subtrai) tempo de um instante CIVIL, sem deslocá-lo de fuso.
   *
   * Hora civil não tem fuso, e é justamente por isso que ela não pode passar
   * por `new Date(...)` cru: a especificação manda interpretar um ISO sem
   * sufixo como hora LOCAL, e o `toISOString()` seguinte devolveria o valor
   * deslocado pelo fuso de quem rodou o processo — o mesmo dado daria janelas
   * diferentes no Railway (UTC) e na máquina de quem depura (UTC−3).
   *
   * Fixar o `Z` nas duas pontas faz a aritmética acontecer num fuso só e o
   * relógio de parede voltar intacto.
   */
  private shiftCivil(civil: string, deltaMs: number): string {
    const base = Date.parse(`${toCivilFilterTime(civil)}Z`);
    return toCivilFilterTime(new Date(base + deltaMs).toISOString());
  }

  private toEpoch(value?: string): number | null {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  /**
   * Traduz o erro para o BullMQ.
   *
   * `RefreshTokenInvalidError` ⇒ **`UnrecoverableError`**. Sem isso, as 3
   * tentativas herdadas queimam contra um token que o Google já recusou de vez
   * — e o `TokenRefreshService` já marcou a conexão como degradada, então nem
   * a quarta nem a centésima funcionariam. Só o usuário reconectando resolve.
   *
   * `NotFoundException` do `ensureValidToken` é a mesma classe de fato: não há
   * dispositivo `google_health` para este usuário (ele desconectou). Retentar
   * não o reconecta.
   *
   * `429` e tudo mais SOBEM como erro comum, para que o retry aconteça.
   */
  private toJobError(
    error: unknown,
    job: Job<unknown, unknown, string>,
  ): Error {
    const isFinalAttempt =
      !job.opts?.attempts || job.attemptsMade + 1 >= job.opts.attempts;

    if (error instanceof RefreshTokenInvalidError) {
      this.logger.warn(
        `Google Health sync: conexão degradada (${error.reason}) — job ${job.id ?? '?'} não será retentado`,
      );
      return new UnrecoverableError(
        `google_health connection degraded: ${error.reason}`,
      );
    }

    if (error instanceof NotFoundException) {
      this.logger.warn(
        `Google Health sync: sem dispositivo google_health — job ${job.id ?? '?'} não será retentado`,
      );
      return new UnrecoverableError('google_health device not connected');
    }

    if (error instanceof GoogleHealthRateLimitError) {
      this.logger.warn(
        `Google Health sync: 429 no job ${job.id ?? '?'}` +
          (isFinalAttempt ? ' (última tentativa)' : ''),
      );
      return error;
    }

    this.logger.error(
      `Google Health sync: job ${job.id ?? '?'} falhou${isFinalAttempt ? ' (última tentativa)' : ''}: ${this.describe(error)}`,
    );
    return error instanceof Error ? error : new Error(this.describe(error));
  }

  /** Mensagem de erro sem `String(unknown)` (regra `no-base-to-string`). */
  private describe(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'unknown error';
  }
}
