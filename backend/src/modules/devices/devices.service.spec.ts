import { Test } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { SupabaseService } from '../../database';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';

/**
 * As colunas que o upsert de `connectDevice` gravava ANTES da Fase 3.
 *
 * Travadas aqui porque o desenho da Fase 3 depende disto: as colunas novas
 * (`refresh_token_expires_at`, e na Fase 3 C as de estado degradado) só entram
 * no payload quando o DTO as traz. Apple Health, Apple Watch, Garmin, Fitbit e
 * Polar precisam continuar mandando exatamente este conjunto — é o que os
 * mantém intocados e funcionando mesmo num banco sem as migrations novas.
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

interface UpsertChain {
  upsert: jest.Mock<UpsertChain, [Record<string, unknown>, unknown]>;
  select: jest.Mock<UpsertChain, []>;
  single: jest.Mock<Promise<unknown>, []>;
}

describe('DevicesService.connectDevice', () => {
  let service: DevicesService;
  let chain: UpsertChain;

  beforeEach(async () => {
    chain = {} as UpsertChain;
    chain.upsert = jest.fn<UpsertChain, [Record<string, unknown>, unknown]>(
      () => chain,
    );
    chain.select = jest.fn<UpsertChain, []>(() => chain);
    chain.single = jest.fn<Promise<unknown>, []>(() =>
      Promise.resolve({ data: { id: 'device-1' }, error: null }),
    );

    const module = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: SupabaseService, useValue: { from: () => chain } },
        {
          provide: EncryptionService,
          useValue: { encrypt: (value: string) => `enc(${value})` },
        },
      ],
    }).compile();

    service = module.get(DevicesService);
  });

  function upsertedRow(): Record<string, unknown> {
    return chain.upsert.mock.calls[0][0];
  }

  it.each<ConnectDeviceDto['provider']>([
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
        access_token: 'enc(access)',
        refresh_token: 'enc(refresh)',
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
});
