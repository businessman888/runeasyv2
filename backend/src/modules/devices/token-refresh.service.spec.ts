import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TokenRefreshService } from './token-refresh.service';
import { RefreshTokenInvalidError, RefreshedTokens } from './token-refresher';
import { SupabaseService } from '../../database';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { GoogleHealthOAuthService } from './providers/google-health-oauth.service';

type Row = Record<string, unknown>;

/** `from().select().in().not().lt()` — a query do cron; `lt` é terminal. */
interface CronSelectChain {
  select: jest.Mock<CronSelectChain, [string]>;
  in: jest.Mock<CronSelectChain, [string, string[]]>;
  not: jest.Mock<CronSelectChain, [string, string, null]>;
  lt: jest.Mock<Promise<{ data: Row[]; error: null }>, [string, string]>;
}

/** `from().update().eq()` — `eq` é terminal. */
interface UpdateChain {
  update: jest.Mock<UpdateChain, [Row]>;
  eq: jest.Mock<Promise<{ error: null }>, [string, string]>;
}

/** `from().select().eq().eq().maybeSingle()` — a leitura do ensureValidToken. */
interface LookupChain {
  select: jest.Mock<LookupChain, [string]>;
  eq: jest.Mock<LookupChain, [string, string]>;
  maybeSingle: jest.Mock<Promise<{ data: Row | null; error: null }>, []>;
}

function cronSelect(devices: Row[]): CronSelectChain {
  const chain = {} as CronSelectChain;
  chain.select = jest.fn<CronSelectChain, [string]>(() => chain);
  chain.in = jest.fn<CronSelectChain, [string, string[]]>(() => chain);
  chain.not = jest.fn<CronSelectChain, [string, string, null]>(() => chain);
  chain.lt = jest.fn<Promise<{ data: Row[]; error: null }>, [string, string]>(
    () => Promise.resolve({ data: devices, error: null }),
  );
  return chain;
}

function updateChain(): UpdateChain {
  const chain = {} as UpdateChain;
  chain.update = jest.fn<UpdateChain, [Row]>(() => chain);
  chain.eq = jest.fn<Promise<{ error: null }>, [string, string]>(() =>
    Promise.resolve({ error: null }),
  );
  return chain;
}

function lookup(row: Row | null): LookupChain {
  const chain = {} as LookupChain;
  chain.select = jest.fn<LookupChain, [string]>(() => chain);
  chain.eq = jest.fn<LookupChain, [string, string]>(() => chain);
  chain.maybeSingle = jest.fn<Promise<{ data: Row | null; error: null }>, []>(
    () => Promise.resolve({ data: row, error: null }),
  );
  return chain;
}

const enc = (value: string) => `enc(${value})`;
const dec = (value: string) => value.replace(/^enc\((.*)\)$/, '$1');

const PAST = () => new Date(Date.now() - 60 * 1000).toISOString();
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function device(provider: string, overrides: Row = {}): Row {
  return {
    id: `device-${provider}`,
    user_id: 'user-1',
    provider,
    access_token: enc('old-access'),
    refresh_token: enc('old-refresh'),
    expires_at: PAST(),
    ...overrides,
  };
}

type RefreshMock = jest.Mock<Promise<RefreshedTokens>, [string]>;

describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
  let from: jest.Mock<unknown, [string]>;
  let fitbit: { refreshAccessToken: RefreshMock };
  let google: { refreshAccessToken: RefreshMock };

  beforeEach(async () => {
    from = jest.fn<unknown, [string]>();
    fitbit = {
      refreshAccessToken: jest.fn<Promise<RefreshedTokens>, [string]>(),
    };
    google = {
      refreshAccessToken: jest.fn<Promise<RefreshedTokens>, [string]>(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TokenRefreshService,
        { provide: SupabaseService, useValue: { from } },
        {
          provide: EncryptionService,
          useValue: { encrypt: enc, decrypt: dec },
        },
        { provide: FitbitOAuthService, useValue: fitbit },
        { provide: GoogleHealthOAuthService, useValue: google },
      ],
    }).compile();

    service = module.get(TokenRefreshService);
  });

  // ─── cron ────────────────────────────────────────────────────────────────

  describe('refreshExpiringTokens', () => {
    it('a query é a da Fase 2 — só a lista de provedores cresceu, e a Polar segue fora', async () => {
      const select = cronSelect([]);
      from.mockReturnValueOnce(select);

      await service.refreshExpiringTokens();

      expect(select.select).toHaveBeenCalledWith(
        'id, user_id, provider, access_token, refresh_token, expires_at',
      );
      expect(select.in).toHaveBeenCalledWith('provider', [
        'fitbit',
        'google_health',
      ]);
      expect(select.not).toHaveBeenCalledWith('refresh_token', 'is', null);
      expect(select.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
    });

    it('Fitbit (rotaciona): grava o refresh token novo — as mesmas colunas de antes', async () => {
      from.mockReturnValueOnce(cronSelect([device('fitbit')]));
      const update = updateChain();
      from.mockReturnValueOnce(update);
      fitbit.refreshAccessToken.mockResolvedValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 28800,
      });

      await service.refreshExpiringTokens();

      expect(fitbit.refreshAccessToken).toHaveBeenCalledWith('old-refresh');
      const [row] = update.update.mock.calls[0];
      expect(Object.keys(row).sort()).toEqual([
        'access_token',
        'expires_at',
        'refresh_token',
        'updated_at',
      ]);
      expect(row.access_token).toBe(enc('new-access'));
      expect(row.refresh_token).toBe(enc('new-refresh'));
      expect(update.eq).toHaveBeenCalledWith('id', 'device-fitbit');
    });

    it('Google (não rotaciona): mantém o refresh token antigo e grava a validade dele', async () => {
      from.mockReturnValueOnce(cronSelect([device('google_health')]));
      const update = updateChain();
      from.mockReturnValueOnce(update);
      google.refreshAccessToken.mockResolvedValue({
        access_token: 'new-access',
        expires_in: 3599,
        refresh_token_expires_in: 500000,
      });

      await service.refreshExpiringTokens();

      const [row] = update.update.mock.calls[0];
      expect(row).not.toHaveProperty('refresh_token');
      expect(row).toHaveProperty('refresh_token_expires_at');
      expect(row.access_token).toBe(enc('new-access'));
    });

    it('RefreshTokenInvalidError: marca degradado e zera o refresh token (sai da fila)', async () => {
      from.mockReturnValueOnce(cronSelect([device('google_health')]));
      const update = updateChain();
      from.mockReturnValueOnce(update);
      google.refreshAccessToken.mockRejectedValue(
        new RefreshTokenInvalidError(
          'invalid_grant: Token has been expired or revoked.',
        ),
      );

      await service.refreshExpiringTokens();

      const [row] = update.update.mock.calls[0];
      expect(row).toEqual(
        expect.objectContaining({
          refresh_token: null,
          last_refresh_error:
            'invalid_grant: Token has been expired or revoked.',
        }),
      );
      expect(typeof row.refresh_failed_at).toBe('string');
      expect(update.eq).toHaveBeenCalledWith('id', 'device-google_health');
    });

    it('Error genérico — o que o Fitbit lança — NÃO marca degradado: o Fitbit fica fora do caminho novo', async () => {
      from.mockReturnValueOnce(cronSelect([device('fitbit')]));
      fitbit.refreshAccessToken.mockRejectedValue(
        new Error('Fitbit token refresh failed: 401'),
      );

      await service.refreshExpiringTokens();

      // Só a query do cron: nenhuma escrita em `connected_devices`.
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  // ─── ensureValidToken (Mina 17 — a Fase 4 é quem chama) ──────────────────

  describe('ensureValidToken', () => {
    it('conexão degradada: recusa sem tentar renovar', async () => {
      from.mockReturnValueOnce(
        lookup(
          device('google_health', {
            refresh_token: null,
            refresh_failed_at: '2026-09-14T00:00:00.000Z',
          }),
        ),
      );

      await expect(
        service.ensureValidToken('user-1', 'google_health'),
      ).rejects.toBeInstanceOf(RefreshTokenInvalidError);
      expect(google.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('token ainda válido: devolve o gravado, sem renovar', async () => {
      from.mockReturnValueOnce(
        lookup(
          device('google_health', {
            expires_at: FUTURE(),
            refresh_failed_at: null,
          }),
        ),
      );

      await expect(
        service.ensureValidToken('user-1', 'google_health'),
      ).resolves.toBe('old-access');
      expect(google.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('vencido: renova e devolve o token novo, sem reler a linha', async () => {
      from.mockReturnValueOnce(
        lookup(device('google_health', { refresh_failed_at: null })),
      );
      from.mockReturnValueOnce(updateChain());
      google.refreshAccessToken.mockResolvedValue({
        access_token: 'new-access',
        expires_in: 3599,
      });

      await expect(
        service.ensureValidToken('user-1', 'google_health'),
      ).resolves.toBe('new-access');
      // Leitura + gravação. Sem terceira ida ao banco para reler o token.
      expect(from).toHaveBeenCalledTimes(2);
    });

    it('renovação recusada agora: marca degradado e propaga', async () => {
      from.mockReturnValueOnce(
        lookup(device('google_health', { refresh_failed_at: null })),
      );
      const update = updateChain();
      from.mockReturnValueOnce(update);
      google.refreshAccessToken.mockRejectedValue(
        new RefreshTokenInvalidError('invalid_grant: Bad Request'),
      );

      await expect(
        service.ensureValidToken('user-1', 'google_health'),
      ).rejects.toBeInstanceOf(RefreshTokenInvalidError);
      expect(update.update.mock.calls[0][0]).toHaveProperty(
        'refresh_token',
        null,
      );
    });

    it('Polar (sem refresher): devolve o token gravado mesmo vencido, sem renovar', async () => {
      from.mockReturnValueOnce(
        lookup(
          device('polar', { refresh_token: null, refresh_failed_at: null }),
        ),
      );

      await expect(service.ensureValidToken('user-1', 'polar')).resolves.toBe(
        'old-access',
      );
      expect(fitbit.refreshAccessToken).not.toHaveBeenCalled();
      expect(google.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('sem dispositivo: NotFound', async () => {
      from.mockReturnValueOnce(lookup(null));

      await expect(
        service.ensureValidToken('user-1', 'google_health'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
