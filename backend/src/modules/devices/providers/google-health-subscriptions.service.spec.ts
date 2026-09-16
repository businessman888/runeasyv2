import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../../database';
import { GoogleHealthApiClient } from './google-health-api.client';
import { GoogleHealthSubscriptionsService } from './google-health-subscriptions.service';

/**
 * A credencial de service account é mockada inteira: o que este spec exercita é
 * a NOSSA lógica — idempotência, validação do id, a borda do `healthUserId`
 * desconhecido e a escrita local — não a biblioteca do Google.
 */
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getAccessToken: () => Promise.resolve('ya29.fake-service-account-token'),
  })),
}));

const SECRET = 'Bearer s3gr3d0-do-subscriber';
const REDIRECT =
  'https://runeasyv2-staging.up.railway.app/api/devices/google-health/callback';
const WEBHOOK =
  'https://runeasyv2-staging.up.railway.app/api/devices/webhooks/google-health';
/** UUID em minúsculas: 36 chars, casa o padrão do Google. */
const USER = 'a3f1c0de-0000-4000-8000-000000000001';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * `update().eq().eq()` — o SEGUNDO `eq` é terminal. Tipado à mão porque o
 * padrão do módulo é travar os argumentos das colunas, e `any` não trava nada.
 */
interface UpdateChain {
  update: jest.Mock<UpdateChain, [Record<string, unknown>]>;
  eq: jest.Mock<
    UpdateChain | Promise<{ data: null; error: null }>,
    [string, unknown]
  >;
}

function updateChain(): UpdateChain {
  const chain = {} as UpdateChain;
  let eqCalls = 0;
  chain.update = jest.fn<UpdateChain, [Record<string, unknown>]>(() => chain);
  chain.eq = jest.fn<
    UpdateChain | Promise<{ data: null; error: null }>,
    [string, unknown]
  >(() => {
    eqCalls += 1;
    return eqCalls >= 2 ? Promise.resolve({ data: null, error: null }) : chain;
  });
  return chain;
}

/** `select().eq().is()` — `is` é terminal. */
interface PendingChain {
  select: jest.Mock<PendingChain, [string]>;
  eq: jest.Mock<PendingChain, [string, unknown]>;
  is: jest.Mock<
    Promise<{ data: Array<{ user_id: string }>; error: null }>,
    [string, null]
  >;
}

function pendingChain(rows: Array<{ user_id: string }>): PendingChain {
  const chain = {} as PendingChain;
  chain.select = jest.fn<PendingChain, [string]>(() => chain);
  chain.eq = jest.fn<PendingChain, [string, unknown]>(() => chain);
  chain.is = jest.fn<
    Promise<{ data: Array<{ user_id: string }>; error: null }>,
    [string, null]
  >(() => Promise.resolve({ data: rows, error: null }));
  return chain;
}

describe('GoogleHealthSubscriptionsService', () => {
  let service: GoogleHealthSubscriptionsService;
  let fetchMock: FetchMock;
  let from: jest.Mock<unknown, [string]>;
  let apiClient: {
    getConnectionState: jest.Mock;
    listExercise: jest.Mock;
    persistHealthUserId: jest.Mock;
  };

  async function build(overrides: Record<string, string | undefined> = {}) {
    const values: Record<string, string | undefined> = {
      GOOGLE_HEALTH_PROJECT_ID: '911159721571',
      GOOGLE_HEALTH_SUBSCRIBER_ID: 'runeasy-staging',
      GOOGLE_HEALTH_WEBHOOK_SECRET: SECRET,
      GOOGLE_HEALTH_SERVICE_ACCOUNT: '{"client_email":"x","private_key":"y"}',
      GOOGLE_HEALTH_REDIRECT_URI: REDIRECT,
      ...overrides,
    };

    const module = await Test.createTestingModule({
      providers: [
        GoogleHealthSubscriptionsService,
        { provide: ConfigService, useValue: { get: (k: string) => values[k] } },
        { provide: GoogleHealthApiClient, useValue: apiClient },
        { provide: SupabaseService, useValue: { from } },
      ],
    }).compile();

    return module.get(GoogleHealthSubscriptionsService);
  }

  beforeEach(async () => {
    fetchMock = jest.fn() as FetchMock;
    global.fetch = fetchMock as unknown as typeof fetch;
    from = jest.fn<unknown, [string]>(() => updateChain());
    apiClient = {
      getConnectionState: jest.fn(() =>
        Promise.resolve({
          scope: '',
          hasLocationScope: true,
          hasActivityScope: true,
          providerUserId: 'health-user-9',
        }),
      ),
      listExercise: jest.fn(() => Promise.resolve({ dataPoints: [] })),
      persistHealthUserId: jest.fn(() => Promise.resolve(null)),
    };
    service = await build();
  });

  // ─── Subscriber ───────────────────────────────────────────────────────────

  it('registra o subscriber com MANUAL, o segredo e a URL derivada do redirect', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { name: 'subscribers/x' }));

    const result = await service.registerSubscriber();

    expect(result.created).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/projects/911159721571/subscribers');
    expect(url).toContain('subscriberId=runeasy-staging');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    // A URL do webhook sai da ORIGEM do redirect — uma variável a menos para
    // apontar para o ambiente errado.
    expect(body.endpointUri).toBe(WEBHOOK);
    expect(body.endpointAuthorization).toEqual({ secret: SECRET });
    // MANUAL é o que preserva o nosso id no clientProvidedSubscriptionName.
    expect(body.subscriberConfigs).toEqual([
      { dataTypes: ['exercise'], subscriptionCreatePolicy: 'MANUAL' },
    ]);
  });

  it('subscriber que já existe é SUCESSO — o script é seguro de repetir (409)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { status: 'ALREADY_EXISTS', message: 'x' } }),
    );

    await expect(service.registerSubscriber()).resolves.toMatchObject({
      created: false,
    });
  });

  it('subscriber que já existe é SUCESSO mesmo vindo como 400 + ALREADY_EXISTS', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { status: 'ALREADY_EXISTS', message: 'x' } }),
    );

    await expect(service.registerSubscriber()).resolves.toMatchObject({
      created: false,
    });
  });

  it('handshake reprovado (FAILED_PRECONDITION) sobe como erro', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: {
          status: 'FAILED_PRECONDITION',
          message: 'endpoint not secure',
        },
      }),
    );

    await expect(service.registerSubscriber()).rejects.toThrow(
      /FAILED_PRECONDITION/,
    );
  });

  // ─── Subscription ─────────────────────────────────────────────────────────

  it('cria a subscription com o user_id como subscriptionId e user como resource name', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const outcome = await service.createSubscriptionForUser(USER);

    expect(outcome.created).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`subscriptionId=${USER}`);
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    // `user` é resource name, não o id cru.
    expect(body.user).toBe('users/health-user-9');
    expect(body.dataTypes).toEqual(['exercise']);
  });

  it('user_id fora do padrão do Google é recusado ANTES de qualquer chamada', async () => {
    // Um 400 do Google com "invalid argument" não diria qual argumento.
    await expect(
      service.createSubscriptionForUser('MAIUSCULO-NAO-VALE'),
    ).rejects.toThrow(/subscriptionId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('healthUserId desconhecido adia a subscription — e NÃO derruba a conexão', async () => {
    // Usuário que conecta sem nenhuma atividade de exercise: não há `name` de
    // onde tirar o id. Ele consentiu; o retroativo recupera.
    apiClient.getConnectionState.mockResolvedValue({
      scope: '',
      hasLocationScope: true,
      hasActivityScope: true,
      providerUserId: null,
    });

    const outcome = await service.createSubscriptionForUser(USER);

    expect(outcome).toEqual({
      created: false,
      reason: 'health_user_id_unknown',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('descobre o healthUserId por uma listagem quando ainda não está persistido', async () => {
    apiClient.getConnectionState.mockResolvedValue({
      scope: '',
      hasLocationScope: true,
      hasActivityScope: true,
      providerUserId: null,
    });
    apiClient.listExercise.mockResolvedValue({
      dataPoints: [
        { name: 'users/descoberto-7/dataTypes/exercise/dataPoints/a' },
      ],
    });
    apiClient.persistHealthUserId.mockResolvedValue('descoberto-7');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await service.createSubscriptionForUser(USER);

    const body = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.user).toBe('users/descoberto-7');
  });

  it('subscription que já existe no Google reconcilia o estado local', async () => {
    // Direção "existe lá, não existe aqui": a criação sucedeu e a escrita local
    // falhou. Rodar o retroativo de novo conserta em vez de estourar.
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { status: 'ALREADY_EXISTS', message: 'x' } }),
    );

    const outcome = await service.createSubscriptionForUser(USER);

    expect(outcome).toMatchObject({ created: false, reason: 'already_exists' });
    expect(from).toHaveBeenCalledWith('connected_devices');
  });

  it('grava subscription_id e subscription_created_at na MESMA escrita', async () => {
    // Um sem o outro é estado que nenhum leitor sabe interpretar.
    const chain = updateChain();
    from.mockReturnValue(chain);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await service.createSubscriptionForUser(USER);

    const payload = chain.update.mock.calls[0][0];
    expect(payload.subscription_id).toBe(USER);
    expect(typeof payload.subscription_created_at).toBe('string');
  });

  // ─── Remoção ──────────────────────────────────────────────────────────────

  it('remover uma subscription que já não existe (404) é sucesso', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: { status: 'NOT_FOUND' } }),
    );

    await expect(
      service.removeSubscriptionForUser(USER),
    ).resolves.toBeUndefined();
  });

  it('zera subscription_id e subscription_created_at juntos na remoção', async () => {
    const chain = updateChain();
    from.mockReturnValue(chain);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await service.removeSubscriptionForUser(USER);

    const payload = chain.update.mock.calls[0][0];
    expect(payload.subscription_id).toBeNull();
    expect(payload.subscription_created_at).toBeNull();
  });

  it('erro que não seja 404 na remoção sobe — quem decide engolir é o disconnect', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { error: { status: 'UNAVAILABLE' } }),
    );

    await expect(service.removeSubscriptionForUser(USER)).rejects.toThrow(
      /UNAVAILABLE/,
    );
  });

  // ─── Configuração ausente ─────────────────────────────────────────────────

  it('sem a service account, o service SOBE e recusa no primeiro uso', async () => {
    // PROD hoje é exatamente este caso. Derrubar o boot tiraria o app inteiro
    // do ar por causa de uma integração que ainda nem tem entrada na UI.
    const semCredencial = await build({
      GOOGLE_HEALTH_SERVICE_ACCOUNT: undefined,
    });

    expect(semCredencial.configured).toBe(false);
    await expect(semCredencial.registerSubscriber()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem configuração, criar subscription devolve motivo em vez de estourar', async () => {
    const semCredencial = await build({
      GOOGLE_HEALTH_SERVICE_ACCOUNT: undefined,
    });

    await expect(
      semCredencial.createSubscriptionForUser(USER),
    ).resolves.toEqual({ created: false, reason: 'not_configured' });
  });

  // ─── Pendentes ────────────────────────────────────────────────────────────

  it('lista pendentes com o filtro exato do retroativo', async () => {
    const chain = pendingChain([{ user_id: USER }]);
    from.mockReturnValue(chain);

    await expect(service.findPendingUsers()).resolves.toEqual([USER]);

    expect(chain.eq).toHaveBeenCalledWith('provider', 'google_health');
    expect(chain.is).toHaveBeenCalledWith('subscription_id', null);
  });
});
