import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { SupabaseService } from '../../../database';
import { SubscriptionManager } from '../subscription-manager';
import {
  GOOGLE_HEALTH_PROVIDER,
  GoogleHealthApiClient,
} from './google-health-api.client';
import { GOOGLE_HEALTH_WEBHOOK_PATH } from './google-health-webhook-auth';

/**
 * Subscriber do projeto e subscriptions por usuário, na Google Health API.
 *
 * ── A CREDENCIAL AQUI É OUTRA ────────────────────────────────────────────────
 *
 * Todo o resto da integração fala com o Google usando o token OAuth DO USUÁRIO.
 * Este service, não: `projects.subscribers` e `projects.subscribers.subscriptions`
 * são recursos do PROJETO, e exigem uma service account com escopo
 * `cloud-platform` e IAM `health.subscribers.create` / `health.subscriptions.create`.
 * São dois mundos de autenticação no mesmo módulo — não os misture.
 *
 * A única coisa que ainda precisa do token do usuário é descobrir o
 * `healthUserId` (ver `resolveHealthUserId`), porque esse id é dele, não nosso.
 *
 * ── POR QUE `MANUAL`, E NÃO `AUTOMATIC` ──────────────────────────────────────
 *
 * O subscriber pode criar subscriptions sozinho quando o usuário consente. Seria
 * menos código — e nos custaria o mapeamento. Em `AUTOMATIC`, o
 * `clientProvidedSubscriptionName` que volta na notificação é um nome gerado
 * pelo Google (`auto-<projeto>-<subscriber>-<TOKEN>`), que não carrega nada
 * nosso; para saber de quem é a notificação, seria preciso guardar e consultar
 * o `healthUserId` de todo mundo.
 *
 * Em `MANUAL` nós escolhemos o `subscriptionId`, e escolhemos o `user_id` do
 * RunEasy. Ele volta em toda notificação e o webhook resolve o usuário sem uma
 * consulta sequer. É por isso que o `subscriptionId` aceitar UUID importa: o
 * padrão do Google é `[a-z0-9-]`, 4 a 36 chars, e um UUID em minúsculas cabe
 * exatamente.
 */

const HEALTH_API_BASE = 'https://health.googleapis.com/v4';
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * `subscriptionId`: 4 a 36 chars, minúsculas, dígitos e hífen, sem começar nem
 * terminar em hífen. Um UUID v4 em minúsculas passa.
 *
 * Validar ANTES de chamar é o que transforma "o Google recusou com 400 e o log
 * não diz por quê" em um erro nosso, com o valor recusado à vista.
 */
const SUBSCRIPTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,34}[a-z0-9]$/;

export interface GoogleHealthSubscription {
  name?: string;
  clientProvidedSubscriptionName?: string;
  user?: string;
  dataTypes?: string[];
}

export interface RegisterSubscriberResult {
  /** `false` quando já existia — que é sucesso, não erro. */
  created: boolean;
  subscriberId: string;
  endpointUri: string;
}

export type CreateSubscriptionReason =
  | 'already_exists'
  | 'health_user_id_unknown'
  | 'not_configured';

/**
 * Forma única, e não união discriminada de propósito: este `tsconfig` roda com
 * `strictNullChecks: false`, e ali o narrowing por discriminante booleano não é
 * confiável — o literal `true` alarga para `boolean` e o compilador perde o
 * ramo. Campos opcionais custam um `?` e funcionam.
 */
export interface CreateSubscriptionOutcome {
  created: boolean;
  subscriptionId?: string;
  reason?: CreateSubscriptionReason;
}

/** Idem: forma única em vez de união, pelo mesmo motivo. */
interface HealthApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

@Injectable()
export class GoogleHealthSubscriptionsService implements SubscriptionManager {
  private readonly logger = new Logger(GoogleHealthSubscriptionsService.name);

  private readonly projectId: string | undefined;
  private readonly subscriberId: string | undefined;
  private readonly webhookSecret: string | undefined;
  private readonly endpointUri: string | undefined;
  private readonly misconfiguration: string | null;

  /** Criado sob demanda: sem credencial o service tem que subir mesmo assim. */
  private auth: GoogleAuth | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly apiClient: GoogleHealthApiClient,
    private readonly supabaseService: SupabaseService,
  ) {
    this.projectId = config.get<string>('GOOGLE_HEALTH_PROJECT_ID');
    this.subscriberId = config.get<string>('GOOGLE_HEALTH_SUBSCRIBER_ID');
    this.webhookSecret = config.get<string>('GOOGLE_HEALTH_WEBHOOK_SECRET');
    this.endpointUri = this.resolveEndpointUri();
    this.misconfiguration = this.checkConfiguration();
  }

  /**
   * A URL do webhook sai da ORIGEM do `GOOGLE_HEALTH_REDIRECT_URI`.
   *
   * Poderia ser uma quarta variável, e seria uma quarta chance de apontar para
   * o ambiente errado. Derivar amarra as duas ao mesmo deploy: se o redirect
   * aponta para o staging, o webhook registrado também aponta. E o boot do
   * `GoogleHealthOAuthService` já confere que o redirect casa com a rota
   * servida, então essa origem é verificada de graça.
   */
  private resolveEndpointUri(): string | undefined {
    const override = this.config.get<string>('GOOGLE_HEALTH_WEBHOOK_URL');
    if (override) return override;

    const redirectUri = this.config.get<string>('GOOGLE_HEALTH_REDIRECT_URI');
    if (!redirectUri) return undefined;
    try {
      return new URL(GOOGLE_HEALTH_WEBHOOK_PATH, redirectUri).toString();
    } catch {
      return undefined;
    }
  }

  private checkConfiguration(): string | null {
    const missing = (
      [
        ['GOOGLE_HEALTH_PROJECT_ID', this.projectId],
        ['GOOGLE_HEALTH_SUBSCRIBER_ID', this.subscriberId],
        ['GOOGLE_HEALTH_WEBHOOK_SECRET', this.webhookSecret],
        ['GOOGLE_HEALTH_SERVICE_ACCOUNT', this.rawServiceAccount()],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      const reason = `variáveis ausentes: ${missing.join(', ')}`;
      this.logger.warn(`Subscriptions do Google Health desligadas — ${reason}`);
      return reason;
    }

    if (!this.endpointUri) {
      const reason =
        'não foi possível derivar a URL do webhook de GOOGLE_HEALTH_REDIRECT_URI';
      this.logger.error(
        `Subscriptions do Google Health desligadas — ${reason}`,
      );
      return reason;
    }

    return null;
  }

  private rawServiceAccount(): string | undefined {
    return this.config.get<string>('GOOGLE_HEALTH_SERVICE_ACCOUNT');
  }

  /**
   * Nunca derruba o boot — o mesmo desenho do `GoogleHealthOAuthService`. Um
   * ambiente sem essas variáveis (PROD, hoje) sobe normal; quem chamar leva
   * 503 com o motivo.
   */
  private assertConfigured(): void {
    if (this.misconfiguration) {
      throw new ServiceUnavailableException(
        `Subscriptions do Google Health não configuradas: ${this.misconfiguration}`,
      );
    }
  }

  get configured(): boolean {
    return this.misconfiguration === null;
  }

  // ─── HTTP com credencial de service account ──────────────────────────────

  private async accessToken(): Promise<string> {
    if (!this.auth) {
      const raw = this.rawServiceAccount();
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(raw ?? '') as Record<string, unknown>;
      } catch {
        // A mensagem nunca ecoa o conteúdo: é uma chave privada.
        throw new ServiceUnavailableException(
          'GOOGLE_HEALTH_SERVICE_ACCOUNT não é um JSON válido',
        );
      }
      this.auth = new GoogleAuth({
        credentials,
        scopes: [CLOUD_PLATFORM_SCOPE],
      });
    }

    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new ServiceUnavailableException(
        'service account do Google Health não devolveu access token',
      );
    }
    return token;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<HealthApiResult<T>> {
    this.assertConfigured();
    const token = await this.accessToken();

    const response = await fetch(`${HEALTH_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      // Só o status e a mensagem curta do Google. O corpo inteiro pode ecoar o
      // que mandamos — e o que mandamos inclui o segredo do webhook.
      return {
        ok: false,
        status: response.status,
        error: shortError(text),
      };
    }

    return {
      ok: true,
      status: response.status,
      data: (text ? JSON.parse(text) : {}) as T,
    };
  }

  // ─── Subscriber: uma vez por ambiente ────────────────────────────────────

  /**
   * Registra o subscriber do projeto. Idempotente.
   *
   * O Google só aceita o registro se o endpoint JÁ estiver no ar e passar no
   * handshake de dois passos: um POST com a credencial esperando 200/201, e um
   * POST sem credencial esperando 401/403. Por isso o Commit B veio antes deste.
   * Falha de handshake chega como `FAILED_PRECONDITION`.
   */
  async registerSubscriber(): Promise<RegisterSubscriberResult> {
    this.assertConfigured();

    const result = await this.request<{ name?: string }>(
      'POST',
      `/projects/${this.projectId}/subscribers?subscriberId=${encodeURIComponent(
        this.subscriberId,
      )}`,
      {
        endpointUri: this.endpointUri,
        endpointAuthorization: { secret: this.webhookSecret },
        subscriberConfigs: [
          { dataTypes: ['exercise'], subscriptionCreatePolicy: 'MANUAL' },
        ],
      },
    );

    if (result.ok) {
      this.logger.log(
        `Subscriber ${this.subscriberId} registrado para ${this.endpointUri}`,
      );
      return {
        created: true,
        subscriberId: this.subscriberId,
        endpointUri: this.endpointUri,
      };
    }

    // Já existir É sucesso: o script é one-shot e precisa ser seguro de repetir.
    if (isAlreadyExists(result.status, result.error ?? '')) {
      this.logger.log(
        `Subscriber ${this.subscriberId} já existia — nada a fazer`,
      );
      return {
        created: false,
        subscriberId: this.subscriberId,
        endpointUri: this.endpointUri,
      };
    }

    throw new Error(
      `Falha ao registrar subscriber (${result.status}): ${result.error}`,
    );
  }

  // ─── Subscription: uma por usuário ───────────────────────────────────────

  /**
   * Descobre o `healthUserId` do usuário.
   *
   * Ele vem de graça no `name` de qualquer dataPoint
   * (`users/{healthUserId}/dataTypes/...`), e é a única parte deste service que
   * usa o token OAuth do usuário.
   *
   * **Borda real:** um usuário que conecte sem NENHUMA atividade de `exercise`
   * registrada não devolve `name` nenhum, e o id fica desconhecido. Isso não
   * pode derrubar a conexão — ele consentiu. Fica pendente e o retroativo cria
   * a subscription quando houver dado.
   */
  private async resolveHealthUserId(userId: string): Promise<string | null> {
    const state = await this.apiClient.getConnectionState(userId);
    if (state.providerUserId) return state.providerUserId;

    // SEM filtro de propósito: aqui não interessa QUANDO a atividade foi, só
    // que exista uma, para ler o `healthUserId` do `name`. Filtrar por janela
    // seria escolher um período arbitrário e correr o risco de não achar nada
    // numa conta com pouco histórico — e a primeira página basta.
    const page = await this.apiClient.listExercise(userId);

    return this.apiClient.persistHealthUserId(
      userId,
      page.dataPoints ?? [],
      null,
    );
  }

  async createSubscriptionForUser(
    userId: string,
  ): Promise<CreateSubscriptionOutcome> {
    if (!this.configured) return { created: false, reason: 'not_configured' };

    if (!SUBSCRIPTION_ID_PATTERN.test(userId)) {
      throw new Error(
        `user_id "${userId}" não casa com o padrão de subscriptionId do Google ` +
          `(4-36 chars, [a-z0-9-], sem hífen nas pontas)`,
      );
    }

    const healthUserId = await this.resolveHealthUserId(userId);
    if (!healthUserId) {
      this.logger.warn(
        `Subscription adiada para ${userId}: healthUserId desconhecido ` +
          `(sem dataPoint de exercise). O retroativo recupera.`,
      );
      return { created: false, reason: 'health_user_id_unknown' };
    }

    const result = await this.request<GoogleHealthSubscription>(
      'POST',
      `/projects/${this.projectId}/subscribers/${encodeURIComponent(
        this.subscriberId,
      )}/subscriptions?subscriptionId=${encodeURIComponent(userId)}`,
      { dataTypes: ['exercise'], user: `users/${healthUserId}` },
    );

    if (result.ok) {
      await this.persistSubscription(userId);
      this.logger.log(`Subscription criada para ${userId}`);
      return { created: true, subscriptionId: userId };
    }

    if (isAlreadyExists(result.status, result.error ?? '')) {
      // O Google tem, nós não sabíamos: reconciliação de órfã no sentido
      // "existe lá, não existe aqui".
      await this.persistSubscription(userId);
      this.logger.log(
        `Subscription de ${userId} já existia — estado local reconciliado`,
      );
      return {
        created: false,
        reason: 'already_exists',
        subscriptionId: userId,
      };
    }

    throw new Error(
      `Falha ao criar subscription de ${userId} (${result.status}): ${result.error}`,
    );
  }

  /**
   * Remove no Google e zera o estado local — nessa ordem.
   *
   * `subscription_id` e `subscription_created_at` são zerados JUNTOS: uma linha
   * com id sem data (ou o contrário) é um estado que nenhum leitor sabe
   * interpretar.
   */
  async removeSubscriptionForUser(userId: string): Promise<void> {
    if (!this.configured) return;

    const result = await this.request<unknown>(
      'DELETE',
      `/projects/${this.projectId}/subscribers/${encodeURIComponent(
        this.subscriberId,
      )}/subscriptions/${encodeURIComponent(userId)}`,
    );

    // 404 é sucesso: o objetivo é "não existe lá", e já não existe.
    if (!result.ok && result.status !== 404) {
      throw new Error(
        `Falha ao remover subscription de ${userId} (${result.status}): ${result.error}`,
      );
    }

    await this.clearSubscription(userId);
    this.logger.log(`Subscription de ${userId} removida`);
  }

  async listSubscriptions(): Promise<GoogleHealthSubscription[]> {
    const result = await this.request<{
      subscriptions?: GoogleHealthSubscription[];
    }>(
      'GET',
      `/projects/${this.projectId}/subscribers/${encodeURIComponent(
        this.subscriberId,
      )}/subscriptions`,
    );

    if (!result.ok) {
      throw new Error(
        `Falha ao listar subscriptions (${result.status}): ${result.error}`,
      );
    }
    return result.data?.subscriptions ?? [];
  }

  /** Usuários conectados ao Google Health e ainda sem subscription. */
  async findPendingUsers(): Promise<string[]> {
    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .select('user_id')
      .eq('provider', GOOGLE_HEALTH_PROVIDER)
      .is('subscription_id', null);

    if (error) {
      throw new Error(`Falha ao listar conexões pendentes: ${error.message}`);
    }
    return (data ?? []).map((row: { user_id: string }) => row.user_id);
  }

  /**
   * Os `subscription_id` que ESTE banco conhece.
   *
   * É o complemento de `findPendingUsers`, e a distinção decide a reconciliação:
   * pendente é quem NÃO tem subscription, então comparar as subscriptions do
   * Google contra a lista de pendentes acusa como órfã justamente a que está
   * saudável. Órfã é o que existe lá e NÃO está aqui.
   */
  async findKnownSubscriptionIds(): Promise<string[]> {
    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .select('subscription_id')
      .eq('provider', GOOGLE_HEALTH_PROVIDER)
      .not('subscription_id', 'is', null);

    if (error) {
      throw new Error(`Falha ao listar subscriptions locais: ${error.message}`);
    }
    return (data ?? [])
      .map((row: { subscription_id: string | null }) => row.subscription_id)
      .filter((id: string | null): id is string => Boolean(id));
  }

  // ─── Estado local ────────────────────────────────────────────────────────

  private async persistSubscription(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabaseService
      .from('connected_devices')
      .update({
        subscription_id: userId,
        subscription_created_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('provider', GOOGLE_HEALTH_PROVIDER);

    if (error) {
      // A subscription EXISTE no Google. Não saber disso localmente é ruim, mas
      // não é motivo para desfazer o que já foi criado lá: o retroativo
      // reconcilia pelo caminho `already_exists`.
      this.logger.error(
        `Subscription de ${userId} criada no Google mas não persistida: ${error.message}`,
      );
    }
  }

  private async clearSubscription(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabaseService
      .from('connected_devices')
      .update({
        subscription_id: null,
        subscription_created_at: null,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('provider', GOOGLE_HEALTH_PROVIDER);

    if (error) {
      this.logger.warn(
        `Subscription de ${userId} removida no Google mas o estado local não zerou: ${error.message}`,
      );
    }
  }
}

/**
 * O Google sinaliza "já existe" de mais de um jeito conforme o recurso: `409`,
 * ou `400` com `ALREADY_EXISTS` no corpo. Tratar os dois é o que faz o script
 * ser seguro de rodar duas vezes.
 */
function isAlreadyExists(status: number, error: string): boolean {
  return status === 409 || /ALREADY_EXISTS/i.test(error);
}

/** Primeira mensagem útil do erro, sem ecoar o corpo inteiro da requisição. */
function shortError(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { status?: string; message?: string };
    };
    const status = parsed.error?.status ?? '';
    const message = parsed.error?.message ?? '';
    const joined = [status, message].filter(Boolean).join(': ');
    if (joined) return joined.slice(0, 300);
  } catch {
    // corpo não-JSON: cai no corte abaixo
  }
  return body.slice(0, 300);
}
