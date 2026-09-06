import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { NotificationService } from './notification.service';
import { SupabaseService } from '../../database';

jest.mock('axios');

describe('NotificationService', () => {
  let service: NotificationService;
  let mockSupabaseService: Partial<SupabaseService>;

  beforeEach(async () => {
    mockSupabaseService = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { push_token: 'ExponentPushToken[xxx]' },
          error: null,
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPushToken', () => {
    it('should return push token when exists', async () => {
      const token = await service.getPushToken('user-123');
      expect(token).toBe('ExponentPushToken[xxx]');
    });

    it('should return null when token not found', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const token = await service.getPushToken('user-456');
      expect(token).toBeNull();
    });
  });

  describe('savePushToken', () => {
    it('should save push token successfully', async () => {
      const updateMock = jest.fn().mockReturnThis();
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        update: updateMock,
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.savePushToken('user-123', 'ExponentPushToken[yyy]'),
      ).resolves.not.toThrow();
    });
  });

  describe('sendPushNotification', () => {
    it('should return false when no push token', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: { push_token: null }, error: null }),
      });

      const result = await service.sendPushNotification(
        'user-123',
        'Test Title',
        'Test Body',
      );

      expect(result).toBe(false);
    });

    it('should return false for invalid token format', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { push_token: 'invalid-token' },
          error: null,
        }),
      });

      const result = await service.sendPushNotification(
        'user-123',
        'Test Title',
        'Test Body',
      );

      expect(result).toBe(false);
    });
  });
});

/**
 * `notifyOnce` — a guarda que substituiu o `Set` em memória.
 *
 * O critério que importa não é "não gravou a segunda linha": é **1 linha e 1
 * push**. Deduplicar só a linha não teria resolvido nada do sintoma que os
 * corredores sentiram — o push é a parte que chega no bolso, e ele saía duas
 * vezes porque `createNotification` e `sendPushNotification` eram chamadas
 * independentes.
 *
 * O fake abaixo imita `ON CONFLICT (dedupe_key) DO NOTHING` de verdade: com
 * chave repetida, o PostgREST devolve ZERO linhas — `data: null`, sem erro. Foi
 * assim que o comportamento foi verificado contra o Postgres real antes de
 * escrever o código.
 */
describe('NotificationService.notifyOnce', () => {
  let service: NotificationService;
  let linhas: Array<Record<string, unknown>>;
  let chavesUsadas: Set<string>;
  let pushEnviados: number;

  const PUSH_TOKEN = 'ExponentPushToken[xxx]';

  beforeEach(async () => {
    linhas = [];
    chavesUsadas = new Set();
    pushEnviados = 0;

    (axios.post as jest.Mock).mockImplementation(() => {
      pushEnviados++;
      return Promise.resolve({ data: [{ id: 't1', status: 'ok' }] });
    });

    const fakeSupabase = {
      from: (tabela: string) => {
        if (tabela === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { push_token: PUSH_TOKEN },
                    error: null,
                  }),
              }),
            }),
          };
        }

        // 'notifications'
        const executar = (
          payload: Record<string, unknown>,
          dedupe: boolean,
        ) => {
          const chave = payload.dedupe_key as string | undefined;
          if (dedupe && chave && chavesUsadas.has(chave)) {
            // ON CONFLICT DO NOTHING: nada gravado, nenhum erro, zero linhas.
            return Promise.resolve({ data: null, error: null });
          }
          if (chave) chavesUsadas.add(chave);
          const linha = { id: `n${linhas.length + 1}`, ...payload };
          linhas.push(linha);
          return Promise.resolve({ data: linha, error: null });
        };

        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({ maybeSingle: () => executar(payload, false) }),
          }),
          upsert: (
            payload: Record<string, unknown>,
            opts: { onConflict?: string; ignoreDuplicates?: boolean },
          ) => {
            // O código precisa pedir DO NOTHING sobre a coluna certa; sem isso
            // o Postgres faria UPDATE (resolution=merge-duplicates).
            expect(opts.onConflict).toBe('dedupe_key');
            expect(opts.ignoreDuplicates).toBe(true);
            return {
              select: () => ({ maybeSingle: () => executar(payload, true) }),
            };
          },
        };
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: SupabaseService, useValue: fakeSupabase },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  const convite = () => ({
    userId: 'user-1',
    type: 'reminder' as const,
    title: '🏃 Hora do Treino!',
    description: 'Você tem um treino hoje.',
    dedupeKey: 'reminder:workout-1:2026-09-05',
    push: { data: { type: 'workout_reminder' }, channelId: 'training' },
  });

  it('duas chamadas com a MESMA chave produzem 1 linha e 1 push', async () => {
    const primeira = await service.notifyOnce(convite());
    const segunda = await service.notifyOnce(convite());

    expect(primeira.created).toBe(true);
    expect(primeira.pushSent).toBe(true);

    expect(segunda.created).toBe(false);
    expect(segunda.pushSent).toBe(false);

    expect(linhas).toHaveLength(1);
    expect(pushEnviados).toBe(1);
  });

  it('chaves diferentes continuam sendo dois avisos independentes', async () => {
    await service.notifyOnce(convite());
    await service.notifyOnce({
      ...convite(),
      dedupeKey: 'reminder:workout-2:2026-09-05',
    });

    expect(linhas).toHaveLength(2);
    expect(pushEnviados).toBe(2);
  });

  it('grava a dedupe_key na linha — a guarda vive no banco, não em memória', async () => {
    await service.notifyOnce(convite());
    expect(linhas[0].dedupe_key).toBe('reminder:workout-1:2026-09-05');
  });

  it('falha de escrita NÃO envia push (não confundir erro com duplicata)', async () => {
    const quebrado = {
      from: () => ({
        upsert: () => ({
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: null,
                error: { message: 'db down', code: '08006' },
              }),
          }),
        }),
      }),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: SupabaseService, useValue: quebrado },
      ],
    }).compile();

    const resultado = await mod
      .get<NotificationService>(NotificationService)
      .notifyOnce(convite());

    expect(resultado.created).toBe(false);
    expect(resultado.pushSent).toBe(false);
    expect(pushEnviados).toBe(0);
  });

  it('createNotification (request-driven) segue SEM chave e sem deduplicar', async () => {
    await service.createNotification(
      'user-1',
      'workout_sync',
      'Feedback pronto',
      'Sua análise chegou',
    );
    await service.createNotification(
      'user-1',
      'workout_sync',
      'Feedback pronto',
      'Sua análise chegou',
    );

    expect(linhas).toHaveLength(2);
    expect(linhas[0].dedupe_key).toBeUndefined();
  });
});
