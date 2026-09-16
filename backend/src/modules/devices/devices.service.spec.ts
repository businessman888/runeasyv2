import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { SupabaseService } from '../../database';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { GoogleHealthOAuthService } from './providers/google-health-oauth.service';
import { GoogleHealthSubscriptionsService } from './providers/google-health-subscriptions.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';

type Provider = ConnectDeviceDto['provider'];

/**
 * As colunas que o upsert de `connectDevice` gravava ANTES da Fase 3.
 *
 * Travadas aqui porque o desenho da Fase 3 depende disto: as colunas novas
 * (`refresh_token_expires_at` e as de estado degradado) só entram no payload
 * quando o DTO as traz. Apple Health, Apple Watch, Garmin, Fitbit e Polar
 * precisam continuar mandando exatamente este conjunto — é o que os mantém
 * intocados e funcionando mesmo num banco sem as migrations novas.
 */
const PRE_PHASE3_COLUMNS = [
  'access_token',
  'connected_at',
  'device_name',
  'expires_at',
  'provider',
  'provider_user_id',
  'refresh_token',
  'scope',
  'updated_at',
  'user_id',
];

/** `from().upsert().select().single()` — o connectDevice. */
interface UpsertChain {
  upsert: jest.Mock<UpsertChain, [Record<string, unknown>, unknown]>;
  select: jest.Mock<UpsertChain, []>;
  single: jest.Mock<Promise<unknown>, []>;
}

/** `from().select().eq().eq().maybeSingle()` — a leitura do token a revogar. */
interface LookupChain {
  select: jest.Mock<LookupChain, [string]>;
  eq: jest.Mock<LookupChain, [string, string]>;
  maybeSingle: jest.Mock<Promise<unknown>, []>;
}

/** `from().delete().eq().eq().select().single()` — o disconnectDevice. */
interface DeleteChain {
  delete: jest.Mock<DeleteChain, []>;
  eq: jest.Mock<DeleteChain, [string, string]>;
  select: jest.Mock<DeleteChain, []>;
  single: jest.Mock<Promise<unknown>, []>;
}

function upsertChain(): UpsertChain {
  const chain = {} as UpsertChain;
  chain.upsert = jest.fn<UpsertChain, [Record<string, unknown>, unknown]>(
    () => chain,
  );
  chain.select = jest.fn<UpsertChain, []>(() => chain);
  chain.single = jest.fn<Promise<unknown>, []>(() =>
    Promise.resolve({ data: { id: 'device-1' }, error: null }),
  );
  return chain;
}

function lookupChain(row: Record<string, unknown> | null): LookupChain {
  const chain = {} as LookupChain;
  chain.select = jest.fn<LookupChain, [string]>(() => chain);
  chain.eq = jest.fn<LookupChain, [string, string]>(() => chain);
  chain.maybeSingle = jest.fn<Promise<unknown>, []>(() =>
    Promise.resolve({ data: row, error: null }),
  );
  return chain;
}

function deleteChain(result: unknown): DeleteChain {
  const chain = {} as DeleteChain;
  chain.delete = jest.fn<DeleteChain, []>(() => chain);
  chain.eq = jest.fn<DeleteChain, [string, string]>(() => chain);
  chain.select = jest.fn<DeleteChain, []>(() => chain);
  chain.single = jest.fn<Promise<unknown>, []>(() => Promise.resolve(result));
  return chain;
}

const enc = (value: string) => `enc(${value})`;
const dec = (value: string) => value.replace(/^enc\((.*)\)$/, '$1');

const DELETED = { data: { id: 'device-1' }, error: null };

describe('DevicesService', () => {
  let service: DevicesService;
  let from: jest.Mock<unknown, [string]>;
  let subscriptions: {
    removeSubscriptionForUser: jest.Mock<Promise<void>, [string]>;
  };
  /** Ordem real das chamadas — é o que o teste de sequência observa. */
  let ordem: string[];
  let google: { revokeToken: jest.Mock<Promise<void>, [string]> };

  beforeEach(async () => {
    ordem = [];
    from = jest.fn<unknown, [string]>();
    google = {
      revokeToken: jest.fn<Promise<void>, [string]>().mockImplementation(() => {
        ordem.push('revoke');
        return Promise.resolve();
      }),
    };
    subscriptions = {
      removeSubscriptionForUser: jest
        .fn<Promise<void>, [string]>()
        .mockImplementation(() => {
          ordem.push('remove-subscription');
          return Promise.resolve();
        }),
    };

    const module = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: SupabaseService, useValue: { from } },
        {
          provide: EncryptionService,
          useValue: { encrypt: enc, decrypt: dec },
        },
        { provide: GoogleHealthOAuthService, useValue: google },
        {
          provide: GoogleHealthSubscriptionsService,
          useValue: subscriptions,
        },
      ],
    }).compile();

    service = module.get(DevicesService);
  });

  // ─── connectDevice ───────────────────────────────────────────────────────

  describe('connectDevice', () => {
    let chain: UpsertChain;

    beforeEach(() => {
      chain = upsertChain();
      from.mockReturnValue(chain);
    });

    function upsertedRow(): Record<string, unknown> {
      return chain.upsert.mock.calls[0][0];
    }

    it.each<Provider>([
      'apple_health',
      'apple_watch',
      'garmin',
      'fitbit',
      'polar',
    ])('%s: payload com exatamente as colunas de antes', async (provider) => {
      await service.connectDevice('user-1', {
        provider,
        access_token: 'access',
        refresh_token: 'refresh',
      });

      expect(Object.keys(upsertedRow()).sort()).toEqual(PRE_PHASE3_COLUMNS);
    });

    it('google_health: grava a validade do refresh token', async () => {
      await service.connectDevice('user-1', {
        provider: 'google_health',
        access_token: 'access',
        refresh_token: 'refresh',
        refresh_token_expires_at: '2026-09-21T23:00:00.000Z',
      });

      expect(upsertedRow()).toEqual(
        expect.objectContaining({
          refresh_token_expires_at: '2026-09-21T23:00:00.000Z',
          access_token: enc('access'),
          refresh_token: enc('refresh'),
        }),
      );
    });

    it('google_health com prazo desconhecido: grava null explicitamente', async () => {
      await service.connectDevice('user-1', {
        provider: 'google_health',
        access_token: 'access',
        refresh_token: 'refresh',
        refresh_token_expires_at: null,
      });

      expect(upsertedRow()).toHaveProperty('refresh_token_expires_at', null);
    });

    it('google_health: reconectar zera o estado degradado', async () => {
      await service.connectDevice('user-1', {
        provider: 'google_health',
        access_token: 'access',
        refresh_token: 'refresh',
        refresh_token_expires_at: null,
      });

      expect(upsertedRow()).toEqual(
        expect.objectContaining({
          refresh_failed_at: null,
          last_refresh_error: null,
        }),
      );
    });
  });

  // ─── disconnectDevice (Mina 22) ──────────────────────────────────────────

  describe('disconnectDevice', () => {
    it('google_health: revoga o grant no Google ANTES de apagar a linha', async () => {
      const del = deleteChain(DELETED);
      from
        .mockReturnValueOnce(
          lookupChain({
            access_token: enc('access'),
            refresh_token: enc('refresh'),
          }),
        )
        .mockReturnValueOnce(del);

      await expect(
        service.disconnectDevice('user-1', 'google_health'),
      ).resolves.toEqual({ success: true, provider: 'google_health' });

      // Revogar o refresh token derruba o grant inteiro.
      expect(google.revokeToken).toHaveBeenCalledWith('refresh');
      expect(google.revokeToken.mock.invocationCallOrder[0]).toBeLessThan(
        del.delete.mock.invocationCallOrder[0],
      );
    });

    it('google_health: remove a subscription ANTES de revogar o grant', async () => {
      // A ordem não é estética. Revogar primeiro derrubaria a credencial que a
      // remoção pode precisar, e deixaria subscription órfã mandando
      // notificação que o webhook não consegue mapear de volta ao usuário.
      from
        .mockReturnValueOnce(
          lookupChain({
            access_token: enc('access'),
            refresh_token: enc('refresh'),
          }),
        )
        .mockReturnValueOnce(deleteChain(DELETED));

      await service.disconnectDevice('user-1', 'google_health');

      expect(subscriptions.removeSubscriptionForUser).toHaveBeenCalledWith(
        'user-1',
      );
      expect(ordem).toEqual(['remove-subscription', 'revoke']);
    });

    it('falha ao remover a subscription NÃO impede a desconexão nem a revogação', async () => {
      // Best-effort, pela mesma razão que a revogação é: o usuário pediu para
      // desconectar. A órfã que sobrar é reconciliada pelo retroativo.
      const del = deleteChain(DELETED);
      from
        .mockReturnValueOnce(
          lookupChain({
            access_token: enc('access'),
            refresh_token: enc('refresh'),
          }),
        )
        .mockReturnValueOnce(del);
      subscriptions.removeSubscriptionForUser.mockRejectedValue(
        new Error('Falha ao remover subscription (503): UNAVAILABLE'),
      );

      await expect(
        service.disconnectDevice('user-1', 'google_health'),
      ).resolves.toEqual({ success: true, provider: 'google_health' });

      expect(google.revokeToken).toHaveBeenCalled();
      expect(del.delete).toHaveBeenCalled();
    });

    it('revogar falhando NÃO impede a desconexão local', async () => {
      const del = deleteChain(DELETED);
      from
        .mockReturnValueOnce(
          lookupChain({
            access_token: enc('access'),
            refresh_token: enc('refresh'),
          }),
        )
        .mockReturnValueOnce(del);
      google.revokeToken.mockRejectedValue(
        new Error('Google Health revoke failed: 400 invalid_token'),
      );

      await expect(
        service.disconnectDevice('user-1', 'google_health'),
      ).resolves.toEqual({ success: true, provider: 'google_health' });
      expect(del.delete).toHaveBeenCalled();
    });

    it('conexão degradada (refresh token nulo): revoga com o access token', async () => {
      from
        .mockReturnValueOnce(
          lookupChain({ access_token: enc('access'), refresh_token: null }),
        )
        .mockReturnValueOnce(deleteChain(DELETED));

      await service.disconnectDevice('user-1', 'google_health');

      expect(google.revokeToken).toHaveBeenCalledWith('access');
    });

    it.each<Provider>([
      'fitbit',
      'polar',
      'garmin',
      'apple_watch',
      'apple_health',
      'health_connect',
    ])('%s: não revoga — o caminho é o de antes', async (provider) => {
      from.mockReturnValueOnce(deleteChain(DELETED));

      await service.disconnectDevice('user-1', provider);

      expect(google.revokeToken).not.toHaveBeenCalled();
      expect(subscriptions.removeSubscriptionForUser).not.toHaveBeenCalled();
      // Só o DELETE: nenhuma leitura extra para quem não tem revoker.
      expect(from).toHaveBeenCalledTimes(1);
    });

    it('linha inexistente: não revoga, e o 404 continua o de antes', async () => {
      from
        .mockReturnValueOnce(lookupChain(null))
        .mockReturnValueOnce(
          deleteChain({ data: null, error: { message: 'no rows' } }),
        );

      await expect(
        service.disconnectDevice('user-1', 'google_health'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(google.revokeToken).not.toHaveBeenCalled();
    });
  });
});
