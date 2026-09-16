import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service';
import { TokenRefreshService } from '../token-refresh.service';

/**
 * Cliente de LEITURA da Google Health API — o primeiro código do projeto que
 * realmente busca dado de saúde no servidor do Google.
 *
 * ── POR QUE TODO FETCH PASSA POR `ensureValidToken` ──────────────────────────
 *
 * O caminho do Fitbit usa `DevicesService.getDecryptedToken`, que só
 * descriptografa o que está gravado: não renova nada e não olha
 * `refresh_failed_at`. Um access token do Google vive UMA HORA. Com
 * `getDecryptedToken`, toda notificação que chegasse mais de uma hora depois da
 * conexão bateria 401 — e, pior, uma conexão já degradada (refresh token
 * revogado, ou vencido nos 7 dias do modo Teste) devolveria um token morto como
 * se fosse bom, e a falha apareceria como erro de rede a jusante.
 *
 * `TokenRefreshService.ensureValidToken` renova quando precisa e lança
 * `RefreshTokenInvalidError` quando a conexão está morta — que é o sinal que o
 * processor converte em `UnrecoverableError` para não queimar as 3 tentativas
 * herdadas contra um token que não vai voltar a funcionar.
 *
 * ── O QUE ESTE CLIENTE NÃO FAZ ──────────────────────────────────────────────
 *
 * Não escreve em `activities` e não conhece o modelo interno: quem converte é o
 * `GoogleHealthNormalizer`. Não busca a rota (TCX) — isso é o Commit E, e é por
 * isso que `hasGps` e `hasLocationScope` já saem daqui prontos para serem
 * consultados.
 *
 * NUNCA loga token, `healthUserId` ou `recordId`.
 */

/** Base da API. Path em kebab-case; filtro em snake_case. */
const API_BASE = 'https://health.googleapis.com/v4';

/**
 * `exercise` pagina de **25 em 25** — contra 10.000 dos outros tipos, e sem
 * suporte a `rollUp`. É este número que dimensiona qualquer backfill: 90 dias
 * de um corredor diário são ~4 páginas; de um clube inteiro voltando ao mesmo
 * tempo, o problema não é a quota do Google, é o nosso banco (ver o limiter do
 * processor).
 */
export const GOOGLE_HEALTH_EXERCISE_PAGE_SIZE = 25;

/**
 * Teto de páginas por chamada de `listAllExercise`. Existe para que um filtro
 * mal formado (ou uma janela absurda vinda de uma notificação) não vire um laço
 * de milhares de requisições dentro de um job só.
 */
const DEFAULT_MAX_PAGES = 8;

/** O escopo sem o qual `exportExerciseTcx` (Commit E) devolve erro. */
export const GOOGLE_HEALTH_LOCATION_SCOPE =
  'https://www.googleapis.com/auth/googlehealth.location.readonly';

/** O escopo que autoriza `dataTypes/exercise`. */
export const GOOGLE_HEALTH_ACTIVITY_SCOPE =
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';

/** O provedor, como gravado em `connected_devices.provider`. */
export const GOOGLE_HEALTH_PROVIDER = 'google_health';

/**
 * `429` do Google. Tipado, e distinguível de falha transitória comum, porque a
 * resposta certa é diferente: backoff de 5 s (o default global) não cobre rate
 * limit — quem enfileira um backfill precisa saber que isto é outra coisa.
 *
 * A doc NÃO documenta `Retry-After` para a Google Health API; lemos o header se
 * ele vier, e não contamos com ele se não vier.
 */
export class GoogleHealthRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super(
      retryAfterSeconds === null
        ? 'Google Health API rate limited (429)'
        : `Google Health API rate limited (429), retry after ${retryAfterSeconds}s`,
    );
    this.name = 'GoogleHealthRateLimitError';
  }
}

/** Qualquer outra recusa HTTP da API. O corpo NUNCA entra na mensagem. */
export class GoogleHealthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Google Health API error: ${status} ${code}`);
    this.name = 'GoogleHealthApiError';
  }
}

// ─── Formato da resposta ─────────────────────────────────────────────────────
//
// Tudo que é numérico é declarado `number | string`: a doc oficial mostra
// `steps: "6200"` e `averageHeartRateBeatsPerMinute: "148"` como STRING (int64
// em JSON sempre vira string em protobuf/JSON), enquanto `caloriesKcal: 380.0`
// e `distanceMillimeters: 5000000.0` vêm como número (double). Declarar só
// `number` esconderia a conversão que o normalizer é obrigado a fazer.

export interface GoogleHealthSessionInterval {
  /** Instante físico, RFC3339 (`2026-04-20T08:00:00Z`). */
  startTime?: string;
  endTime?: string;
  /** Offset do fuso da FONTE, como Duration (`"-10800s"`, `"0s"`). */
  startUtcOffset?: string;
  endUtcOffset?: string;
  /** Hora civil da fonte, sem offset (`2026-04-20T05:00:00`). */
  civilStartTime?: string;
  civilEndTime?: string;
}

export interface GoogleHealthExerciseMetricsSummary {
  caloriesKcal?: number | string;
  distanceMillimeters?: number | string;
  steps?: number | string;
  averageSpeedMillimetersPerSecond?: number | string;
  averagePaceSecondsPerMeter?: number | string;
  averageHeartRateBeatsPerMinute?: number | string;
  /**
   * ⚠️ NÃO VALIDADO. A lista publicada do `metricsSummary` NÃO menciona FC
   * máxima. O campo é declarado para que, se ele existir num payload real, o
   * normalizer o aproveite — e para que a ausência fique visível em vez de
   * virar `undefined` silencioso. Ver `google-health.normalizer.ts`.
   */
  maxHeartRateBeatsPerMinute?: number | string;
  elevationGainMillimeters?: number | string;
  activeZoneMinutes?: number | string;
}

export interface GoogleHealthExercise {
  interval?: GoogleHealthSessionInterval;
  exerciseType?: string;
  /** Duration com sufixo: `"1800s"`. Aritmética direta dá `NaN`. */
  activeDuration?: string;
  displayName?: string;
  metricsSummary?: GoogleHealthExerciseMetricsSummary;
  exerciseMetadata?: {
    /** Gate do `exportExerciseTcx` — o Commit E depende dele. */
    hasGps?: boolean;
    poolLengthMillimeters?: number | string;
  };
}

export interface GoogleHealthDataPoint {
  /** `users/{healthUserId}/dataTypes/{dataType}/dataPoints/{dataPoint}` */
  name?: string;
  exercise?: GoogleHealthExercise;
}

export interface GoogleHealthListResponse {
  dataPoints?: GoogleHealthDataPoint[];
  nextPageToken?: string;
}

/**
 * Estado da conexão que o fetch precisa conhecer ANTES de buscar — e que o
 * Commit E e a Fase 5 vão consultar.
 */
export interface GoogleHealthConnectionState {
  /** Escopos CONCEDIDOS, separados por espaço, como o Google devolveu. */
  scope: string;
  /** Sem isto não há TCX: `exportExerciseTcx` recusa. */
  hasLocationScope: boolean;
  /** Sem isto não há nem `exercise`. Consentimento parcial (Mina 20). */
  hasActivityScope: boolean;
  /** `connected_devices.provider_user_id` — hoje quase sempre `null`. */
  providerUserId: string | null;
}

/**
 * A janela do `list`. Os dois campos filtráveis para `exercise` são
 * `exercise.interval.start_time` (instante físico, RFC3339, com `Z`) e
 * `exercise.interval.civil_start_time` (hora civil da fonte, sem offset).
 *
 * A notificação do webhook traz os dois; preferimos o físico porque ele é
 * inequívoco — o civil depende do fuso do usuário, que nós não conhecemos.
 *
 * ⚠️ PREMISSA A VERIFICAR NA PRÁTICA: a doc **não documenta janela máxima**
 * para o `list` (a restrição de 14/90 dias vale para `rollUp`, que `exercise`
 * nem suporta). Tratamos como ilimitada. Se um backfill longo voltar vazio ou
 * com erro de argumento, é aqui que a premissa cai.
 */
export interface GoogleHealthFetchWindow {
  kind: 'physical' | 'civil';
  /** Início inclusivo. */
  startTime: string;
  /** Fim exclusivo. */
  endTime: string;
}

/**
 * Só dígitos, `-`, `:`, `T`, `.` e `Z`. O valor entra ENTRE ASPAS no filtro:
 * uma aspa dentro dele quebraria a expressão e mudaria o que é buscado. A
 * notificação é assinada pelo Google, mas "assinado" não é "seguro de
 * concatenar" — e o backfill recebe a janela de um script humano.
 */
const SAFE_FILTER_DATETIME = /^[0-9T:.\-+Z]{4,40}$/;

export function buildExerciseFilter(window: GoogleHealthFetchWindow): string {
  const field =
    window.kind === 'civil'
      ? 'exercise.interval.civil_start_time'
      : 'exercise.interval.start_time';

  for (const value of [window.startTime, window.endTime]) {
    if (!SAFE_FILTER_DATETIME.test(value)) {
      throw new Error(`Invalid Google Health filter datetime: ${value}`);
    }
  }

  return `${field} >= "${window.startTime}" AND ${field} < "${window.endTime}"`;
}

/**
 * Extrai o `healthUserId` do `name` do dataPoint.
 *
 * O formato oficial é `users/{user}/dataTypes/{dataType}/dataPoints/{id}`, e
 * `{user}` É o identificador gerado pelo Google. Ele chega de graça em toda
 * listagem — e é exatamente o que `connected_devices.provider_user_id` guarda
 * desde a Fase 3 em `null`, por não haver escopo `openid` no consentimento.
 *
 * `users/me/...` é o alias que NÓS mandamos na requisição; se o Google ecoar o
 * alias em vez do id, não há id nenhum a persistir — devolver `null` é o
 * honesto.
 */
export function extractHealthUserId(name: string | undefined): string | null {
  if (!name) return null;
  const match = /^users\/([^/]+)\//.exec(name);
  if (!match) return null;
  const id = match[1];
  return id && id !== 'me' ? id : null;
}

/**
 * Último segmento do `name` — o `{dataPoint}`, e só ele.
 *
 * O `name` inteiro tem dois problemas para virar `external_id`: estoura o
 * `@MaxLength(120)` do DTO e vaza o `healthUserId` para dentro de
 * `activities.external_id`, que é UNIQUE **global** e lida por outras partes
 * do sistema.
 */
export function extractDataPointId(name: string | undefined): string | null {
  if (!name) return null;
  const segments = name.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  return last.length > 0 ? last : null;
}

@Injectable()
export class GoogleHealthApiClient {
  private readonly logger = new Logger(GoogleHealthApiClient.name);

  constructor(
    private readonly tokenRefreshService: TokenRefreshService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Lê o escopo PERSISTIDO da conexão — antes de qualquer fetch.
   *
   * O Google entrega consentimento granular: o usuário pode marcar atividade e
   * desmarcar localização na mesma tela. O que vale é o que voltou no
   * `scope` da troca de token, não o que pedimos. Sem
   * `activity_and_fitness.readonly` não há nem `exercise`; sem
   * `location.readonly` não há TCX — e essa diferença precisa ser ESTADO
   * consultável, não uma exceção que aparece na terceira requisição.
   */
  async getConnectionState(
    userId: string,
  ): Promise<GoogleHealthConnectionState> {
    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .select('scope, provider_user_id')
      .eq('user_id', userId)
      .eq('provider', GOOGLE_HEALTH_PROVIDER)
      .maybeSingle<{ scope: string | null; provider_user_id: string | null }>();

    if (error) {
      throw new Error(
        `Could not read google_health connection state: ${error.message}`,
      );
    }

    const scope = data?.scope ?? '';
    const granted = scope.split(/\s+/).filter((part) => part.length > 0);

    return {
      scope,
      hasLocationScope: granted.includes(GOOGLE_HEALTH_LOCATION_SCOPE),
      hasActivityScope: granted.includes(GOOGLE_HEALTH_ACTIVITY_SCOPE),
      providerUserId: data?.provider_user_id ?? null,
    };
  }

  /**
   * Uma página de `dataTypes/exercise/dataPoints`.
   *
   * `exercise` NÃO suporta `rollUp` — é obrigatoriamente `list`/`get`. E o
   * `pageSize` máximo é 25, não 10.000: pedir mais é truncado em silêncio, por
   * isso o valor é constante e não parâmetro.
   */
  async listExercise(
    userId: string,
    window: GoogleHealthFetchWindow,
    pageToken?: string,
  ): Promise<GoogleHealthListResponse> {
    const params = new URLSearchParams({
      pageSize: String(GOOGLE_HEALTH_EXERCISE_PAGE_SIZE),
      filter: buildExerciseFilter(window),
    });
    if (pageToken) params.set('pageToken', pageToken);

    return this.request<GoogleHealthListResponse>(
      userId,
      '/users/me/dataTypes/exercise/dataPoints',
      params,
    );
  }

  /**
   * Percorre o `nextPageToken` até acabar ou até `maxPages`.
   *
   * O teto é deliberado: sem ele, uma janela grande transforma um job em
   * centenas de requisições sequenciais, e o timeout do job mata o trabalho
   * inteiro no meio — perdendo também as páginas já lidas, porque nada foi
   * processado ainda.
   */
  async listAllExercise(
    userId: string,
    window: GoogleHealthFetchWindow,
    maxPages: number = DEFAULT_MAX_PAGES,
  ): Promise<{ dataPoints: GoogleHealthDataPoint[]; truncated: boolean }> {
    const dataPoints: GoogleHealthDataPoint[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const page = await this.listExercise(userId, window, pageToken);
      dataPoints.push(...(page.dataPoints ?? []));
      pageToken = page.nextPageToken || undefined;
      pages += 1;
    } while (pageToken && pages < maxPages);

    const truncated = Boolean(pageToken);
    if (truncated) {
      this.logger.warn(
        `[google_health] janela truncada em ${pages} páginas ` +
          `(${dataPoints.length} dataPoints) — resta nextPageToken`,
      );
    }

    return { dataPoints, truncated };
  }

  /** Um dataPoint por id. Usado quando a notificação identifica o registro. */
  async getExercise(
    userId: string,
    dataPointId: string,
  ): Promise<GoogleHealthDataPoint> {
    return this.request<GoogleHealthDataPoint>(
      userId,
      `/users/me/dataTypes/exercise/dataPoints/${encodeURIComponent(dataPointId)}`,
      new URLSearchParams(),
    );
  }

  /**
   * Persiste o `healthUserId` em `connected_devices.provider_user_id` quando
   * ele ainda não está lá.
   *
   * É de graça: o id vem no `name` de qualquer dataPoint que já buscamos. E o
   * Commit C precisa dele — `CreateSubscriptionPayload.user` é o resource name
   * `"users/{healthUserId}"`, e descobri-lo custaria uma requisição a mais no
   * fluxo de conexão.
   *
   * Best-effort: falhar aqui não pode derrubar a ingestão da corrida, que é o
   * trabalho de verdade do job. O id não vai para o log (é identificador
   * ligado a dado de saúde).
   */
  async persistHealthUserId(
    userId: string,
    dataPoints: GoogleHealthDataPoint[],
    knownProviderUserId: string | null,
  ): Promise<string | null> {
    const discovered = dataPoints
      .map((point) => extractHealthUserId(point.name))
      .find((id): id is string => id !== null);

    if (!discovered || discovered === knownProviderUserId) {
      return knownProviderUserId;
    }

    const { error } = await this.supabaseService
      .from('connected_devices')
      .update({
        provider_user_id: discovered,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', GOOGLE_HEALTH_PROVIDER);

    if (error) {
      this.logger.warn(
        `[google_health] falha ao gravar provider_user_id de ${userId}: ${error.message}`,
      );
      return knownProviderUserId;
    }

    this.logger.log(
      `[google_health] provider_user_id descoberto e gravado para ${userId}`,
    );
    return discovered;
  }

  // ---- Private ----

  /**
   * O único ponto que fala HTTP com o Google.
   *
   * O token é pedido POR REQUISIÇÃO, não guardado no objeto: o cliente é
   * singleton e serve todos os usuários — cachear token aqui seria servir o
   * token de um usuário para outro.
   */
  private async request<T>(
    userId: string,
    path: string,
    params: URLSearchParams,
  ): Promise<T> {
    const token = await this.tokenRefreshService.ensureValidToken(
      userId,
      GOOGLE_HEALTH_PROVIDER,
    );

    const query = params.toString();
    const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      throw new GoogleHealthRateLimitError(
        this.readRetryAfter(response.headers.get('retry-after')),
      );
    }

    if (!response.ok) {
      const code = await this.readErrorStatus(response);
      // Status e código; nunca o corpo, que pode ecoar o filtro (e o filtro
      // carrega janelas de atividade do usuário).
      throw new GoogleHealthApiError(response.status, code);
    }

    return (await response.json()) as T;
  }

  private readRetryAfter(header: string | null): number | null {
    if (!header) return null;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
  }

  /** Só o `error.status` do envelope padrão do Google (`PERMISSION_DENIED`…). */
  private async readErrorStatus(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as {
        error?: { status?: unknown };
      };
      const status = body.error?.status;
      return typeof status === 'string' ? status : 'unknown_error';
    } catch {
      return 'unknown_error';
    }
  }
}
