import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { SupabaseService } from '../../database';
import { DevicesService } from '../devices/devices.service';
import { GOOGLE_HEALTH_SYNC_QUEUE } from '../devices/providers/google-health-webhook.types';
import { AccountDeletionService } from './account-deletion.service';

const USER = 'a3f1c0de-0000-4000-8000-000000000001';

interface JobMock {
  data: Record<string, unknown>;
  remove: jest.Mock<Promise<void>, []>;
}

function job(data: Record<string, unknown>): JobMock {
  return { data, remove: jest.fn<Promise<void>, []>(() => Promise.resolve()) };
}

/**
 * Mock do Supabase por tabela.
 *
 * O service usa TRÊS formas de chain na mesma classe, e o mock precisa
 * distinguir as três — senão a contagem de auditoria e a leitura de linhas se
 * confundem, porque batem na MESMA tabela:
 *
 *   `select('*', { count })...eq()`  → `eq` é terminal e devolve `{ count }`
 *   `select('id').eq()`              → `eq` é terminal e devolve `{ data }`
 *   `delete().eq().select('id')`     → `select` é terminal e devolve `{ data }`
 *
 * O desempate é a OPÇÃO `count` passada ao `select`, não o nome da tabela.
 */
function supabaseMock(config: {
  counts?: Record<string, number>;
  activities?: Array<{ id: string }>;
  devices?: Array<{ provider: string }>;
  aiLogsDeleted?: Array<{ id: string }>;
  aiLogsError?: { message: string };
}) {
  const from = jest.fn((table: string) => {
    let contagem = false;

    const afterEq: Record<string, unknown> = {
      // `delete().eq().select()`
      select: jest.fn(() =>
        Promise.resolve({
          data: config.aiLogsDeleted ?? [],
          error: config.aiLogsError ?? null,
        }),
      ),
      // `select(...).eq()` aguardado direto
      then: (resolve: (v: unknown) => void) => {
        if (contagem) {
          resolve({ count: config.counts?.[table] ?? 0, error: null });
        } else if (table === 'activities') {
          resolve({ data: config.activities ?? [], error: null });
        } else if (table === 'connected_devices') {
          resolve({ data: config.devices ?? [], error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };

    const chain: Record<string, unknown> = {
      select: jest.fn((_cols?: string, opts?: { count?: string }) => {
        if (opts?.count) contagem = true;
        return chain;
      }),
      delete: jest.fn(() => chain),
      eq: jest.fn(() => afterEq),
    };
    return chain;
  });

  const remove = jest.fn(() => Promise.resolve({ data: [], error: null }));
  const list = jest.fn(() =>
    Promise.resolve({ data: [{ name: 'avatar-1.png' }], error: null }),
  );
  const deleteUser = jest.fn(() => Promise.resolve({ error: null }));

  return {
    from,
    storage: { from: jest.fn(() => ({ list, remove })) },
    auth: { admin: { deleteUser } },
    _spies: { remove, list, deleteUser },
  };
}

describe('AccountDeletionService', () => {
  let disconnectDevice: jest.Mock<Promise<unknown>, [string, string]>;
  let queues: Record<
    string,
    { getJobs: jest.Mock<Promise<JobMock[]>, [string[]]> }
  >;

  async function build(
    supabase: ReturnType<typeof supabaseMock>,
    jobsByQueue: Record<string, JobMock[]> = {},
  ) {
    queues = {};
    for (const name of [
      'feedback-queue',
      'elevation-queue',
      GOOGLE_HEALTH_SYNC_QUEUE,
    ]) {
      queues[name] = {
        getJobs: jest.fn<Promise<JobMock[]>, [string[]]>(() =>
          Promise.resolve(jobsByQueue[name] ?? []),
        ),
      };
    }

    const module = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: SupabaseService, useValue: supabase },
        { provide: DevicesService, useValue: { disconnectDevice } },
        ...Object.entries(queues).map(([name, q]) => ({
          provide: getQueueToken(name),
          useValue: { ...q, name },
        })),
      ],
    }).compile();

    return module.get(AccountDeletionService);
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    disconnectDevice = jest.fn<Promise<unknown>, [string, string]>(() =>
      Promise.resolve({ success: true }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── A guarda ─────────────────────────────────────────────────────────────

  it.each([
    ['vazio', ''],
    ['coringa', '*'],
    ['não-UUID', 'todos'],
    ['indefinido', undefined as unknown as string],
    ['número', 42 as unknown as string],
  ])(
    'RECUSA user_id %s antes de tocar no banco — cláusula vazia apagaria tudo',
    async (_nome, valor) => {
      const supabase = supabaseMock({});
      const service = await build(supabase);

      await expect(service.deleteAccount(valor)).rejects.toThrow(
        /user_id inválido/,
      );
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase._spies.deleteUser).not.toHaveBeenCalled();
    },
  );

  // ─── A ordem, que é o coração ─────────────────────────────────────────────

  it('revoga ANTES de apagar o Auth — invertido, o grant fica vivo para sempre', async () => {
    // O token do usuário é a única credencial com que conseguimos derrubar o
    // grant na conta Google dele. Apagando a linha primeiro, ninguém mais
    // consegue — nem nós, nem ele, que não sabe que precisa.
    const ordem: string[] = [];
    const supabase = supabaseMock({ devices: [{ provider: 'google_health' }] });
    disconnectDevice.mockImplementation(() => {
      ordem.push('disconnect');
      return Promise.resolve({ success: true });
    });
    supabase._spies.deleteUser.mockImplementation(() => {
      ordem.push('delete-auth-user');
      return Promise.resolve({ error: null });
    });

    const service = await build(supabase);
    await service.deleteAccount(USER);

    expect(ordem).toEqual(['disconnect', 'delete-auth-user']);
  });

  it('apaga `auth.users`, não `public.users` — é o que alcança os tokens', async () => {
    // `connected_devices`, `oauth_states` e `points_history` penduram em
    // `auth.users`. A implementação antiga apagava só `public.users`, e os três
    // sobreviviam — com eles, os tokens OAuth de saúde. Era o bug.
    const supabase = supabaseMock({});
    const service = await build(supabase);

    await service.deleteAccount(USER);

    expect(supabase._spies.deleteUser).toHaveBeenCalledWith(USER);
  });

  // ─── Provedores ───────────────────────────────────────────────────────────

  it('desconecta os DOIS provedores quando há dois conectados', async () => {
    const supabase = supabaseMock({
      devices: [{ provider: 'google_health' }, { provider: 'fitbit' }],
    });
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(disconnectDevice).toHaveBeenCalledTimes(2);
    expect(summary.providersDisconnected).toEqual(['google_health', 'fitbit']);
  });

  it('usuário SEM conexão nenhuma é excluído normalmente', async () => {
    const supabase = supabaseMock({ devices: [] });
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(disconnectDevice).not.toHaveBeenCalled();
    expect(supabase._spies.deleteUser).toHaveBeenCalled();
    expect(summary.providersDisconnected).toEqual([]);
  });

  it('falha de revogação NÃO impede a exclusão — e vai para o relatório', async () => {
    // O usuário pediu para sair. Um provedor fora do ar não pode segurar isso;
    // o que ficou é registrado com identificador para correção manual.
    const supabase = supabaseMock({ devices: [{ provider: 'google_health' }] });
    disconnectDevice.mockRejectedValue(new Error('503 UNAVAILABLE'));
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(supabase._spies.deleteUser).toHaveBeenCalled();
    expect(summary.providersFailed).toEqual([
      { provider: 'google_health', reason: '503 UNAVAILABLE' },
    ]);
  });

  it('NotFoundException numa retentativa conta como sucesso', async () => {
    // A linha já foi apagada na tentativa anterior. Tratar como falha faria o
    // job nunca convergir.
    const supabase = supabaseMock({ devices: [{ provider: 'google_health' }] });
    disconnectDevice.mockRejectedValue(new NotFoundException('not found'));
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(summary.providersFailed).toEqual([]);
    expect(summary.providersDisconnected).toEqual(['google_health']);
  });

  it('ignora provider desconhecido em vez de passá-lo adiante', async () => {
    const supabase = supabaseMock({ devices: [{ provider: 'inventado' }] });
    const service = await build(supabase);

    await service.deleteAccount(USER);

    expect(disconnectDevice).not.toHaveBeenCalled();
  });

  // ─── Falha no meio ────────────────────────────────────────────────────────

  it('falha ao apagar o Auth SOBE — o job retenta e a marca sobrevive', async () => {
    // É o passo sem volta. Engolir o erro deixaria a conta meio-apagada sem
    // ninguém saber; subir mantém `deletion_requested_at` preenchido, que é o
    // sinal de exclusão que não terminou.
    const supabase = supabaseMock({});
    supabase._spies.deleteUser.mockResolvedValue({
      error: { message: 'auth indisponível' },
    });
    const service = await build(supabase);

    await expect(service.deleteAccount(USER)).rejects.toThrow(
      /auth indisponível/,
    );
  });

  it('Storage fora do ar não impede a exclusão', async () => {
    const supabase = supabaseMock({});
    supabase._spies.list.mockRejectedValue(new Error('storage down'));
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(supabase._spies.deleteUser).toHaveBeenCalled();
    expect(summary.storageFilesRemoved).toBe(0);
  });

  // ─── Storage e ai_usage_logs ──────────────────────────────────────────────

  it('apaga os avatares da pasta do usuário', async () => {
    const supabase = supabaseMock({});
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(supabase._spies.remove).toHaveBeenCalledWith([
      USER + '/avatar-1.png',
    ]);
    expect(summary.storageFilesRemoved).toBe(1);
  });

  it('apaga `ai_usage_logs` explicitamente — nenhum cascade a alcança', async () => {
    // A tabela não tem FK nenhuma, nem para `users` nem para `auth.users`.
    const supabase = supabaseMock({
      aiLogsDeleted: [{ id: '1' }, { id: '2' }],
    });
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(summary.aiUsageLogsRemoved).toBe(2);
  });

  // ─── Redis ────────────────────────────────────────────────────────────────

  it('remove só os jobs DO usuário, e deixa os dos outros', async () => {
    const meu = job({ userId: USER, workoutId: 'w1' });
    const alheio = job({ userId: 'outro-usuario', workoutId: 'w2' });
    const supabase = supabaseMock({});
    const service = await build(supabase, { 'feedback-queue': [meu, alheio] });

    const summary = await service.deleteAccount(USER);

    expect(meu.remove).toHaveBeenCalled();
    expect(alheio.remove).not.toHaveBeenCalled();
    expect(summary.queuedJobsRemoved['feedback-queue']).toBe(1);
  });

  it('acha os jobs de elevação pelo activityId, a única chave que eles têm', async () => {
    // O payload de `enrich` é `{ activityId }` e não carrega usuário nenhum.
    // Por isso os ids são colhidos ANTES do cascade apagar as atividades.
    const meu = job({ activityId: 'act-1' });
    const alheio = job({ activityId: 'act-de-outro' });
    const supabase = supabaseMock({ activities: [{ id: 'act-1' }] });
    const service = await build(supabase, { 'elevation-queue': [meu, alheio] });

    await service.deleteAccount(USER);

    expect(meu.remove).toHaveBeenCalled();
    expect(alheio.remove).not.toHaveBeenCalled();
  });

  it('acha os jobs do Google Health pelo clientProvidedSubscriptionName', async () => {
    // Que É o `user_id` do RunEasy — a escolha de desenho da Fase 4.
    const meu = job({ notification: { clientProvidedSubscriptionName: USER } });
    const alheio = job({
      notification: { clientProvidedSubscriptionName: 'outro' },
    });
    const supabase = supabaseMock({});
    const service = await build(supabase, {
      [GOOGLE_HEALTH_SYNC_QUEUE]: [meu, alheio],
    });

    await service.deleteAccount(USER);

    expect(meu.remove).toHaveBeenCalled();
    expect(alheio.remove).not.toHaveBeenCalled();
  });

  it('NUNCA remove job ativo — o worker estaria escrevendo nele', async () => {
    const supabase = supabaseMock({});
    const service = await build(supabase);

    await service.deleteAccount(USER);

    for (const q of Object.values(queues)) {
      const [estados] = q.getJobs.mock.calls[0];
      expect(estados).not.toContain('active');
    }
  });

  it('Redis fora do ar não impede a exclusão de dados pessoais', async () => {
    const supabase = supabaseMock({});
    const service = await build(supabase);
    queues['feedback-queue'].getJobs.mockRejectedValue(new Error('redis down'));

    const summary = await service.deleteAccount(USER);

    expect(supabase._spies.deleteUser).toHaveBeenCalled();
    expect(summary.queuedJobsRemoved['feedback-queue']).toBe(0);
  });

  // ─── Trilha ───────────────────────────────────────────────────────────────

  it('conta as linhas ANTES de apagar — depois seria sempre zero', async () => {
    const supabase = supabaseMock({
      counts: { activities: 17, connected_devices: 1, workouts: 51 },
    });
    const service = await build(supabase);

    const summary = await service.deleteAccount(USER);

    expect(summary.counts.activities).toBe(17);
    expect(summary.counts.connected_devices).toBe(1);
    expect(summary.counts.workouts).toBe(51);
  });
});
