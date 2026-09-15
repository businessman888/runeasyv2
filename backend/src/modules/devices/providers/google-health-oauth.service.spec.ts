import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  GoogleHealthOAuthService,
  GOOGLE_HEALTH_SCOPES,
} from './google-health-oauth.service';
import { OAuthStateStore, ConsumedOAuthState } from '../oauth-state.store';

const REDIRECT =
  'https://runeasyv2-staging.up.railway.app/api/devices/google-health/callback';

/** O valor que o `.env` local ainda tem: sem `/api`, fora de qualquer rota. */
const OLD_REDIRECT =
  'https://runeasyv2-staging.up.railway.app/integrations/google-health/callback';

const CLIENT_ID = 'client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'client-secret';

type Env = Record<string, string | undefined>;

interface StateStoreMock {
  create: jest.Mock<Promise<string>, [string, string, string | null]>;
  consume: jest.Mock<Promise<ConsumedOAuthState | null>, [string, string]>;
}

async function build(env: Env = {}) {
  const values: Env = {
    GOOGLE_HEALTH_CLIENT_ID: CLIENT_ID,
    GOOGLE_HEALTH_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_HEALTH_REDIRECT_URI: REDIRECT,
    ...env,
  };
  const stateStore: StateStoreMock = {
    create: jest
      .fn<Promise<string>, [string, string, string | null]>()
      .mockResolvedValue('state-xyz'),
    consume: jest
      .fn<Promise<ConsumedOAuthState | null>, [string, string]>()
      .mockResolvedValue({ userId: 'user-1', codeVerifier: 'verifier-1' }),
  };

  const module = await Test.createTestingModule({
    providers: [
      GoogleHealthOAuthService,
      {
        provide: ConfigService,
        useValue: { get: (key: string) => values[key] },
      },
      { provide: OAuthStateStore, useValue: stateStore },
    ],
  }).compile();

  return { service: module.get(GoogleHealthOAuthService), stateStore };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ALL_SCOPES = GOOGLE_HEALTH_SCOPES.join(' ');
const SECOND = 1000;

describe('GoogleHealthOAuthService', () => {
  // ─── generateAuthUrl ─────────────────────────────────────────────────────

  describe('generateAuthUrl', () => {
    it('monta a URL com os 3 escopos, offline, consent e PKCE S256', async () => {
      const { service, stateStore } = await build();

      const url = new URL(await service.generateAuthUrl('user-1'));
      const params = url.searchParams;

      expect(`${url.origin}${url.pathname}`).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(params.get('client_id')).toBe(CLIENT_ID);
      expect(params.get('redirect_uri')).toBe(REDIRECT);
      expect(params.get('response_type')).toBe('code');
      expect(params.get('scope')?.split(' ')).toEqual([
        ...GOOGLE_HEALTH_SCOPES,
      ]);
      expect(params.get('access_type')).toBe('offline');
      expect(params.get('prompt')).toBe('consent');
      expect(params.get('state')).toBe('state-xyz');
      expect(params.get('code_challenge_method')).toBe('S256');

      // O challenge é o SHA-256 do verificador que foi persistido com o state.
      const [userId, provider, verifier] = stateStore.create.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(provider).toBe('google_health');
      expect(params.get('code_challenge')).toBe(
        createHash('sha256').update(verifier).digest('base64url'),
      );
    });

    it('variável ausente: 503 no primeiro uso, sem abrir fluxo', async () => {
      const { service, stateStore } = await build({
        GOOGLE_HEALTH_CLIENT_SECRET: undefined,
      });

      await expect(service.generateAuthUrl('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(stateStore.create).not.toHaveBeenCalled();
    });

    it('redirect_uri fora da rota servida (o valor antigo, sem /api): 503', async () => {
      const { service } = await build({
        GOOGLE_HEALTH_REDIRECT_URI: OLD_REDIRECT,
      });

      await expect(service.generateAuthUrl('user-1')).rejects.toThrow(
        /\/integrations\/google-health\/callback/,
      );
    });

    it('redirect_uri que não é URL: 503', async () => {
      const { service } = await build({
        GOOGLE_HEALTH_REDIRECT_URI: 'não-é-url',
      });

      await expect(service.generateAuthUrl('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  // ─── exchangeCode ────────────────────────────────────────────────────────

  describe('exchangeCode', () => {
    let fetchSpy: jest.SpyInstance<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('troca o code com o verificador do state e o MESMO redirect_uri', async () => {
      const { service, stateStore } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse({
          access_token: 'access-1',
          expires_in: 3599,
          refresh_token: 'refresh-1',
          refresh_token_expires_in: 604799,
          scope: ALL_SCOPES,
          token_type: 'Bearer',
        }),
      );

      const before = Date.now();
      const { userId, tokens } = await service.exchangeCode(
        'code-1',
        'state-xyz',
      );

      expect(stateStore.consume).toHaveBeenCalledWith(
        'state-xyz',
        'google_health',
      );

      const [endpoint, init] = fetchSpy.mock.calls[0];
      expect(endpoint).toBe('https://oauth2.googleapis.com/token');
      expect(init?.method).toBe('POST');
      const body = new URLSearchParams(init?.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-1');
      expect(body.get('code_verifier')).toBe('verifier-1');
      expect(body.get('redirect_uri')).toBe(REDIRECT);
      expect(body.get('client_id')).toBe(CLIENT_ID);
      expect(body.get('client_secret')).toBe(CLIENT_SECRET);

      expect(userId).toBe('user-1');
      expect(tokens.accessToken).toBe('access-1');
      expect(tokens.refreshToken).toBe('refresh-1');
      expect(tokens.scope).toBe(ALL_SCOPES);

      const accessTtl = new Date(tokens.expiresAt).getTime() - before;
      expect(accessTtl).toBeGreaterThanOrEqual(3598 * SECOND);
      expect(accessTtl).toBeLessThanOrEqual(3600 * SECOND);

      const refreshTtl =
        new Date(tokens.refreshTokenExpiresAt).getTime() - before;
      expect(refreshTtl).toBeGreaterThanOrEqual(604798 * SECOND);
      expect(refreshTtl).toBeLessThanOrEqual(604800 * SECOND);
    });

    it('grava o scope que VOLTOU, não o pedido (consentimento parcial)', async () => {
      const { service } = await build();
      const partial = GOOGLE_HEALTH_SCOPES.slice(0, 2).join(' ');
      fetchSpy.mockResolvedValue(
        jsonResponse({
          access_token: 'a',
          expires_in: 3599,
          refresh_token: 'r',
          scope: partial,
        }),
      );

      const { tokens } = await service.exchangeCode('code-1', 'state-xyz');

      expect(tokens.scope).toBe(partial);
    });

    it('sem refresh_token_expires_in: prazo desconhecido, null', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse({
          access_token: 'a',
          expires_in: 3599,
          refresh_token: 'r',
        }),
      );

      const { tokens } = await service.exchangeCode('code-1', 'state-xyz');

      expect(tokens.refreshTokenExpiresAt).toBeNull();
    });

    it('state inválido: recusa sem chamar o Google', async () => {
      const { service, stateStore } = await build();
      stateStore.consume.mockResolvedValue(null);

      await expect(
        service.exchangeCode('code-1', 'state-xyz'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resposta sem refresh_token é falha explícita', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse({ access_token: 'a', expires_in: 3599 }),
      );

      await expect(service.exchangeCode('code-1', 'state-xyz')).rejects.toThrow(
        'missing_refresh_token',
      );
    });

    it('erro do Google carrega status e código OAuth (o oráculo do gate)', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse(
          { error: 'invalid_grant', error_description: 'Malformed auth code.' },
          400,
        ),
      );

      await expect(service.exchangeCode('code-1', 'state-xyz')).rejects.toThrow(
        'Google Health token exchange failed: 400 invalid_grant',
      );
    });
  });

  // ─── refreshAccessToken ──────────────────────────────────────────────────
  //
  // A distinção entre recusa DEFINITIVA e falha TRANSITÓRIA é o que decide se
  // a conexão é marcada como degradada. Errar para um lado desconecta usuário
  // por um soluço de rede; errar para o outro retenta um token morto para
  // sempre.

  describe('refreshAccessToken', () => {
    let fetchSpy: jest.SpyInstance<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('troca o refresh token por um access token — e o Google não manda refresh token novo', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse({
          access_token: 'access-2',
          expires_in: 3599,
          scope: ALL_SCOPES,
          token_type: 'Bearer',
        }),
      );

      const tokens = await service.refreshAccessToken('refresh-1');

      const [endpoint, init] = fetchSpy.mock.calls[0];
      expect(endpoint).toBe('https://oauth2.googleapis.com/token');
      const body = new URLSearchParams(init?.body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-1');
      expect(body.get('client_id')).toBe(CLIENT_ID);
      expect(body.get('client_secret')).toBe(CLIENT_SECRET);

      expect(tokens.access_token).toBe('access-2');
      expect(tokens.expires_in).toBe(3599);
      // Ausente: o TokenRefreshService mantém o refresh token que está gravado.
      expect(tokens.refresh_token).toBeUndefined();
    });

    it('repassa refresh_token_expires_in quando o Google informa', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse({
          access_token: 'access-2',
          expires_in: 3599,
          refresh_token_expires_in: 500000,
        }),
      );

      const tokens = await service.refreshAccessToken('refresh-1');

      expect(tokens.refresh_token_expires_in).toBe(500000);
    });

    it('invalid_grant é recusa definitiva: RefreshTokenInvalidError com o motivo do Google', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse(
          {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          },
          400,
        ),
      );

      await expect(
        service.refreshAccessToken('refresh-1'),
      ).rejects.toMatchObject({
        name: 'RefreshTokenInvalidError',
        reason: 'invalid_grant: Token has been expired or revoked.',
      });
    });

    it('invalid_client (credencial do app) é transitória: Error genérico, não degrada', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: 'invalid_client' }, 401),
      );

      const failure = service.refreshAccessToken('refresh-1');

      await expect(failure).rejects.toThrow(
        'Google Health token refresh failed: 401 invalid_client',
      );
      await expect(failure).rejects.not.toMatchObject({
        name: 'RefreshTokenInvalidError',
      });
    });

    it('falha de servidor do Google (5xx) também é transitória', async () => {
      const { service } = await build();
      fetchSpy.mockResolvedValue(
        new Response('Service Unavailable', { status: 503 }),
      );

      const failure = service.refreshAccessToken('refresh-1');

      await expect(failure).rejects.toThrow(
        'Google Health token refresh failed: 503 unknown_error',
      );
      await expect(failure).rejects.not.toMatchObject({
        name: 'RefreshTokenInvalidError',
      });
    });
  });

  // ─── discardState ────────────────────────────────────────────────────────

  describe('discardState', () => {
    it('consome o state para ele não ficar reutilizável', async () => {
      const { service, stateStore } = await build();

      await service.discardState('state-xyz');

      expect(stateStore.consume).toHaveBeenCalledWith(
        'state-xyz',
        'google_health',
      );
    });

    it('falha ao descartar não transforma a recusa em erro', async () => {
      const { service, stateStore } = await build();
      stateStore.consume.mockRejectedValue(new Error('db down'));

      await expect(service.discardState('state-xyz')).resolves.toBeUndefined();
    });
  });
});
