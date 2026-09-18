import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Job, UnrecoverableError } from 'bullmq';
import { AccountDeletionProcessor } from './account-deletion.processor';
import { AccountDeletionService } from './account-deletion.service';
import {
  ACCOUNT_DELETION_JOB,
  AccountDeletionJobData,
} from './account-deletion.types';

const USER = 'a3f1c0de-0000-4000-8000-000000000001';

function makeJob(
  overrides: Partial<Job<AccountDeletionJobData>> = {},
): Job<AccountDeletionJobData, unknown, string> {
  return {
    name: ACCOUNT_DELETION_JOB,
    data: { userId: USER, requestedAt: '2026-09-18T12:00:00.000Z' },
    attemptsMade: 0,
    opts: { attempts: 8 },
    ...overrides,
  } as Job<AccountDeletionJobData, unknown, string>;
}

describe('AccountDeletionProcessor', () => {
  let deleteAccount: jest.Mock<Promise<unknown>, [string]>;
  let processor: AccountDeletionProcessor;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    deleteAccount = jest.fn<Promise<unknown>, [string]>(() =>
      Promise.resolve({ userId: USER, counts: {} }),
    );

    const module = await Test.createTestingModule({
      providers: [
        AccountDeletionProcessor,
        { provide: AccountDeletionService, useValue: { deleteAccount } },
      ],
    }).compile();

    processor = module.get(AccountDeletionProcessor);
  });

  afterEach(() => jest.restoreAllMocks());

  it('executa a exclusão e devolve o resumo', async () => {
    const result = await processor.process(makeJob());

    expect(deleteAccount).toHaveBeenCalledWith(USER);
    expect(result).toEqual({
      success: true,
      summary: { userId: USER, counts: {} },
    });
  });

  it('ignora job de nome desconhecido SEM excluir nada', async () => {
    // A fila é só desta operação, mas um job com nome errado significa bug de
    // chamador — e um bug de chamador não pode virar exclusão de conta.
    const result = await processor.process(makeJob({ name: 'outra-coisa' }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(result).toEqual({ ignored: true });
  });

  it('`user_id` inválido vira UnrecoverableError — retentar não conserta bug', async () => {
    deleteAccount.mockRejectedValue(
      new Error('Exclusão recusada: user_id inválido (undefined).'),
    );

    await expect(processor.process(makeJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('falha transitória SOBE para o BullMQ retentar', async () => {
    // Indisponibilidade do Google, do Storage ou do Auth é exatamente o caso
    // que as 8 tentativas existem para cobrir. Engolir aqui deixaria a conta
    // meio-apagada em silêncio.
    const erro = new Error('503 UNAVAILABLE');
    deleteAccount.mockRejectedValue(erro);

    await expect(processor.process(makeJob())).rejects.toBe(erro);
    await expect(processor.process(makeJob())).rejects.not.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('avisa no log quando é a ÚLTIMA tentativa', async () => {
    // Depois dela ninguém mais tenta, e a conta fica com
    // `deletion_requested_at` preenchido — o sinal de exclusão pendurada.
    const erro = jest.spyOn(Logger.prototype, 'error');
    deleteAccount.mockRejectedValue(new Error('falhou de novo'));

    await expect(
      processor.process(makeJob({ attemptsMade: 7, opts: { attempts: 8 } })),
    ).rejects.toThrow();

    expect(erro).toHaveBeenCalledWith(expect.stringContaining('ÚLTIMA'));
  });

  it('não chama de última uma tentativa do meio', async () => {
    const erro = jest.spyOn(Logger.prototype, 'error');
    deleteAccount.mockRejectedValue(new Error('falhou'));

    await expect(
      processor.process(makeJob({ attemptsMade: 2, opts: { attempts: 8 } })),
    ).rejects.toThrow();

    expect(erro).not.toHaveBeenCalledWith(expect.stringContaining('ÚLTIMA'));
  });
});
