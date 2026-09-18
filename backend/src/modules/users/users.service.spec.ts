import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { SupabaseService } from '../../database';
import {
  ACCOUNT_DELETION_JOB,
  ACCOUNT_DELETION_QUEUE,
} from '../account-deletion/account-deletion.types';
import { UsersService } from './users.service';

const USER = 'a3f1c0de-0000-4000-8000-000000000001';

function supabaseMock(result: {
  data?: { id: string } | null;
  error?: { message: string } | null;
}) {
  const maybeSingle = jest.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  const chain: Record<string, unknown> = {
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    select: jest.fn(() => chain),
    maybeSingle,
  };
  return {
    from: jest.fn(() => chain),
    _chain: chain,
    _maybeSingle: maybeSingle,
  };
}

describe('UsersService.requestDeletion', () => {
  let add: jest.Mock<Promise<unknown>, [string, unknown, unknown]>;

  async function build(supabase: ReturnType<typeof supabaseMock>) {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SupabaseService, useValue: supabase },
        {
          provide: getQueueToken(ACCOUNT_DELETION_QUEUE),
          useValue: { add },
        },
      ],
    }).compile();
    return module.get(UsersService);
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    add = jest.fn<Promise<unknown>, [string, unknown, unknown]>(() =>
      Promise.resolve({}),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('marca a coluna E enfileira o job', async () => {
    // Os dois juntos: a marca torna o estado visível, o job faz acontecer.
    // Só a marca deixaria a conta pendurada para sempre; só o job deixaria uma
    // falha no meio invisível.
    const supabase = supabaseMock({ data: { id: USER } });
    const service = await build(supabase);

    const result = await service.requestDeletion(USER);

    expect(supabase._chain.update).toHaveBeenCalledWith({
      deletion_requested_at: result.requestedAt,
    });
    expect(add).toHaveBeenCalledWith(
      ACCOUNT_DELETION_JOB,
      { userId: USER, requestedAt: result.requestedAt },
      expect.objectContaining({ jobId: `account-deletion-${USER}` }),
    );
    expect(result.success).toBe(true);
  });

  it('o `jobId` é fixo por usuário — dois toques não viram duas exclusões', async () => {
    const supabase = supabaseMock({ data: { id: USER } });
    const service = await build(supabase);

    await service.requestDeletion(USER);
    await service.requestDeletion(USER);

    const ids = add.mock.calls.map((c) => (c[2] as { jobId: string }).jobId);
    expect(new Set(ids).size).toBe(1);
  });

  it('pede retentativas próprias, generosas — o default global é curto demais', async () => {
    // O default do `app.module.ts` é 3 tentativas a 5 s: 35 segundos no total.
    // Uma indisponibilidade do Google dura mais que isso, e desistir cedo
    // deixaria a conta em exclusão pela metade.
    const supabase = supabaseMock({ data: { id: USER } });
    const service = await build(supabase);

    await service.requestDeletion(USER);

    const opts = add.mock.calls[0][2] as { attempts: number };
    expect(opts.attempts).toBeGreaterThan(3);
  });

  it('usuário inexistente NÃO enfileira exclusão', async () => {
    const supabase = supabaseMock({ data: null });
    const service = await build(supabase);

    await expect(service.requestDeletion(USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('erro ao marcar NÃO enfileira — senão a exclusão roda sem rastro', async () => {
    const supabase = supabaseMock({ error: { message: 'coluna não existe' } });
    const service = await build(supabase);

    await expect(service.requestDeletion(USER)).rejects.toMatchObject({
      message: 'coluna não existe',
    });
    expect(add).not.toHaveBeenCalled();
  });
});
