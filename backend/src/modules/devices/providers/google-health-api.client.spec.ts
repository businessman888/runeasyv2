import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../database/supabase.service';
import { TokenRefreshService } from '../token-refresh.service';
import { RefreshTokenInvalidError } from '../token-refresher';
import {
  GOOGLE_HEALTH_EXERCISE_PAGE_SIZE,
  GoogleHealthApiClient,
  GoogleHealthApiError,
  GoogleHealthRateLimitError,
  buildExerciseFilter,
  toCivilFilterTime,
  extractDataPointId,
  extractHealthUserId,
} from './google-health-api.client';

type ChainResult = { data?: unknown; error?: { message: string } | null };

/**
 * `from().select().eq().eq().maybeSingle()` e `from().update().eq().eq()`.
 * Chains tipadas, no molde de `token-refresh.service.spec.ts`.
 */
interface Chain {
  select: jest.Mock<Chain, [string]>;
  update: jest.Mock<Chain, [Record<string, unknown>]>;
  eq: jest.Mock<Chain, [string, unknown]>;
  maybeSingle: jest.Mock<Promise<ChainResult>, []>;
  then: (
    resolve: (value: ChainResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function chain(result: ChainResult): Chain {
  const c = {} as Chain;
  c.select = jest.fn<Chain, [string]>(() => c);
  c.update = jest.fn<Chain, [Record<string, unknown>]>(() => c);
  c.eq = jest.fn<Chain, [string, unknown]>(() => c);
  c.maybeSingle = jest.fn<Promise<ChainResult>, []>(() =>
    Promise.resolve(result),
  );
  c.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const USER_ID = 'user-1';
const WINDOW = {
  kind: 'physical' as const,
  startTime: '2026-09-15T10:00:00.000Z',
  endTime: '2026-09-15T12:00:00.000Z',
};

describe('GoogleHealthApiClient', () => {
  let client: GoogleHealthApiClient;
  let ensureValidToken: jest.Mock<Promise<string>, [string, string]>;
  let from: jest.Mock<Chain, [string]>;
  let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    ensureValidToken = jest.fn<Promise<string>, [string, string]>(() =>
      Promise.resolve('access-token-plain'),
    );
    from = jest.fn<Chain, [string]>();
    fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module = await Test.createTestingModule({
      providers: [
        GoogleHealthApiClient,
        { provide: TokenRefreshService, useValue: { ensureValidToken } },
        { provide: SupabaseService, useValue: { from } },
      ],
    }).compile();

    client = module.get(GoogleHealthApiClient);
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── token ───────────────────────────────────────────────────────────────

  describe('token', () => {
    it('pede o token por ensureValidToken, que renova — nunca por getDecryptedToken, que não', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ dataPoints: [] }));

      await client.listExercise(USER_ID, WINDOW);

      expect(ensureValidToken).toHaveBeenCalledWith(USER_ID, 'google_health');
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer access-token-plain',
      );
    });

    it('deixa RefreshTokenInvalidError subir — é o que o processor converte em UnrecoverableError', async () => {
      ensureValidToken.mockRejectedValue(
        new RefreshTokenInvalidError('invalid_grant'),
      );

      await expect(client.listExercise(USER_ID, WINDOW)).rejects.toBeInstanceOf(
        RefreshTokenInvalidError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('pede token a cada requisição — o cliente é singleton e serve todos os usuários', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ dataPoints: [] }));

      await client.listExercise('user-a', WINDOW);
      await client.listExercise('user-b', WINDOW);

      expect(ensureValidToken).toHaveBeenNthCalledWith(
        1,
        'user-a',
        'google_health',
      );
      expect(ensureValidToken).toHaveBeenNthCalledWith(
        2,
        'user-b',
        'google_health',
      );
    });
  });

  // ─── paginação ───────────────────────────────────────────────────────────

  describe('paginação', () => {
    it('pede pageSize 25 — o máximo de `exercise`, contra 10.000 dos outros tipos', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ dataPoints: [] }));

      await client.listExercise(USER_ID, WINDOW);

      const [url] = fetchMock.mock.calls[0];
      expect(GOOGLE_HEALTH_EXERCISE_PAGE_SIZE).toBe(25);
      expect(url).toContain('pageSize=25');
      expect(url).toContain('/users/me/dataTypes/exercise/dataPoints');
      // `exercise` não suporta rollUp: é list/get, ponto.
      expect(url).not.toContain('rollUp');
    });

    it('segue o nextPageToken até acabar', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ dataPoints: [{ name: 'a' }], nextPageToken: 'p2' }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ dataPoints: [{ name: 'b' }], nextPageToken: 'p3' }),
        )
        .mockResolvedValueOnce(jsonResponse({ dataPoints: [{ name: 'c' }] }));

      const result = await client.listAllExercise(USER_ID, WINDOW, 10);

      expect(result.dataPoints).toHaveLength(3);
      expect(result.truncated).toBe(false);
      const secondUrl = fetchMock.mock.calls[1][0];
      expect(secondUrl).toContain('pageToken=p2');
    });

    it('para em maxPages e reporta truncated em vez de girar sem fim', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ dataPoints: [{ name: 'x' }], nextPageToken: 'next' }),
      );

      const result = await client.listAllExercise(USER_ID, WINDOW, 3);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.truncated).toBe(true);
    });
  });

  // ─── erros ───────────────────────────────────────────────────────────────

  describe('erros', () => {
    it('429 vira erro TIPADO, distinguível de falha transitória comum', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 429));

      await expect(client.listExercise(USER_ID, WINDOW)).rejects.toBeInstanceOf(
        GoogleHealthRateLimitError,
      );
    });

    it('lê Retry-After quando vier, e aceita a ausência dele (a doc não o documenta)', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({}, 429, { 'retry-after': '90' }),
      );
      await expect(client.listExercise(USER_ID, WINDOW)).rejects.toMatchObject({
        retryAfterSeconds: 90,
      });

      fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));
      await expect(client.listExercise(USER_ID, WINDOW)).rejects.toMatchObject({
        retryAfterSeconds: null,
      });
    });

    it('403 vira GoogleHealthApiError com o status do envelope, e o corpo NÃO vai para a mensagem', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            error: {
              status: 'PERMISSION_DENIED',
              message: 'filtro com janela do usuário',
            },
          },
          403,
        ),
      );

      const error = await client
        .listExercise(USER_ID, WINDOW)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GoogleHealthApiError);
      expect((error as GoogleHealthApiError).status).toBe(403);
      expect((error as GoogleHealthApiError).message).toContain(
        'PERMISSION_DENIED',
      );
      expect((error as GoogleHealthApiError).message).not.toContain('janela');
    });
  });

  // ─── escopo persistido ───────────────────────────────────────────────────

  describe('getConnectionState', () => {
    it('lê o escopo CONCEDIDO e diz se há location.readonly — o gate do TCX', async () => {
      from.mockReturnValue(
        chain({
          data: {
            scope:
              'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly ' +
              'https://www.googleapis.com/auth/googlehealth.location.readonly',
            provider_user_id: null,
          },
          error: null,
        }),
      );

      const state = await client.getConnectionState(USER_ID);

      expect(state.hasLocationScope).toBe(true);
      expect(state.hasActivityScope).toBe(true);
      expect(state.providerUserId).toBeNull();
    });

    it('consentimento parcial: atividade sem localização ⇒ sem TCX', async () => {
      from.mockReturnValue(
        chain({
          data: {
            scope:
              'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
            provider_user_id: 'gh-user',
          },
          error: null,
        }),
      );

      const state = await client.getConnectionState(USER_ID);

      expect(state.hasActivityScope).toBe(true);
      expect(state.hasLocationScope).toBe(false);
      expect(state.providerUserId).toBe('gh-user');
    });

    it('linha sem escopo gravado não quebra — devolve tudo falso', async () => {
      from.mockReturnValue(chain({ data: null, error: null }));

      const state = await client.getConnectionState(USER_ID);

      expect(state.scope).toBe('');
      expect(state.hasLocationScope).toBe(false);
    });
  });

  // ─── healthUserId ────────────────────────────────────────────────────────

  describe('healthUserId', () => {
    it('extrai o id do name do dataPoint', () => {
      expect(
        extractHealthUserId(
          'users/abcd1234/dataTypes/exercise/dataPoints/uuid-1',
        ),
      ).toBe('abcd1234');
    });

    it('não confunde o alias `me`, que é o que NÓS mandamos, com um id real', () => {
      expect(
        extractHealthUserId('users/me/dataTypes/exercise/dataPoints/uuid-1'),
      ).toBeNull();
      expect(extractHealthUserId(undefined)).toBeNull();
      expect(extractHealthUserId('lixo')).toBeNull();
    });

    it('extrai o ÚLTIMO segmento como id do dataPoint', () => {
      expect(
        extractDataPointId(
          'users/abcd1234/dataTypes/exercise/dataPoints/uuid-1',
        ),
      ).toBe('uuid-1');
      expect(extractDataPointId(undefined)).toBeNull();
    });

    it('persiste provider_user_id quando ainda é null — de graça, e o Commit C precisa', async () => {
      const update = chain({ error: null });
      from.mockReturnValue(update);

      const result = await client.persistHealthUserId(
        USER_ID,
        [{ name: 'users/abcd1234/dataTypes/exercise/dataPoints/uuid-1' }],
        null,
      );

      expect(result).toBe('abcd1234');
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ provider_user_id: 'abcd1234' }),
      );
    });

    it('não escreve quando o id já é o gravado', async () => {
      await client.persistHealthUserId(
        USER_ID,
        [{ name: 'users/abcd1234/dataTypes/exercise/dataPoints/uuid-1' }],
        'abcd1234',
      );
      expect(from).not.toHaveBeenCalled();
    });

    it('falha ao gravar não derruba a ingestão — é best-effort', async () => {
      from.mockReturnValue(chain({ error: { message: 'boom' } }));

      await expect(
        client.persistHealthUserId(
          USER_ID,
          [{ name: 'users/abcd1234/dataTypes/exercise/dataPoints/uuid-1' }],
          null,
        ),
      ).resolves.toBeNull();
    });
  });

  // ─── filtro ──────────────────────────────────────────────────────────────

  describe('buildExerciseFilter', () => {
    /**
     * TRAVA. Medido contra a API real em 2026-09-17, mesma conta e mesmo token:
     * `exercise.interval.start_time` devolve 400 INVALID_ARGUMENT
     * (INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER) e `civil_start_time` devolve
     * 200. O instante físico NÃO é membro filtrável do `exercise`.
     *
     * Trocar este campo derruba a ingestão inteira do usuário com um 400 — e o
     * erro aparece como "subscription falhou", longe da causa.
     */
    it('filtra SEMPRE por civil_start_time — o físico é recusado pela API', () => {
      expect(
        buildExerciseFilter({
          startTime: '2026-09-01T00:00:00',
          endTime: '2026-09-30T00:00:00',
        }),
      ).toBe(
        'exercise.interval.civil_start_time >= "2026-09-01T00:00:00" ' +
          'AND exercise.interval.civil_start_time < "2026-09-30T00:00:00"',
      );
    });

    it('nunca emite o campo de tempo físico', () => {
      expect(buildExerciseFilter(WINDOW)).not.toContain(
        'exercise.interval.start_time',
      );
    });

    it('recusa valor que quebraria as aspas do filtro', () => {
      expect(() =>
        buildExerciseFilter({
          startTime:
            '2026-09-15T10:00:00" OR exercise.interval.civil_start_time >= "1970-01-01T00:00:00',
          endTime: '2026-09-15T12:00:00',
        }),
      ).toThrow(/Invalid Google Health filter datetime/);
    });

    it('toCivilFilterTime tira fuso e milissegundo', () => {
      // Tempo civil não tem fuso: é a hora do relógio de quem correu.
      expect(toCivilFilterTime('2026-09-17T00:08:13.123Z')).toBe(
        '2026-09-17T00:08:13',
      );
      expect(toCivilFilterTime('2026-09-16T21:08:13-03:00')).toBe(
        '2026-09-16T21:08:13',
      );
      expect(() => toCivilFilterTime('ontem')).toThrow(/ISO/);
    });
  });
});
