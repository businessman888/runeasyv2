import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';
import { QuestionSetsParserService } from './question-sets-parser.service';
import { ReadinessCheckInDto } from './dto/readiness.dto';

/**
 * A trava do IDOR.
 *
 * `POST /readiness/analyze` era a ÚNICA rota do backend a derivar identidade do
 * corpo da requisição. Como o corpo é do cliente, qualquer usuário autenticado
 * gravava check-in — e disparava uma chamada de IA paga — no id de outro.
 *
 * O que estes testes protegem:
 *   1. o service recebe o id do TOKEN, e o do body não vaza por caminho nenhum;
 *   2. a identidade continua sendo um argumento posicional (se virar objeto, a
 *      porta do spread `{...dto, userId}` reabre);
 *   3. um 401 sai como 401 — o catch-all convertia tudo em 500.
 */

const TOKEN_USER = 'c40efbbd-d792-4561-ad15-0ecc0d9fda84';
const VITIMA = '2a85ccc8-e7c3-479f-a99c-8876d0083ceb';

const answers = { sleep: 4, legs: 3, mood: 5, stress: 4, motivation: 5 };

const verdict = {
  readiness_score: 80,
  status_color: 'green' as const,
  status_label: 'Sinal verde',
  ai_analysis: { headline: 'h', reasoning: 'r', plan_adjustment: 'p' },
  metrics_summary: [],
  generated_at: '2026-03-09T10:00:00.000Z',
};

describe('ReadinessController', () => {
  let controller: ReadinessController;
  let service: {
    analyzeReadiness: jest.Mock;
    hasCheckedInToday: jest.Mock;
    getReadinessStatus: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      analyzeReadiness: jest.fn().mockResolvedValue(verdict),
      hasCheckedInToday: jest.fn().mockResolvedValue(null),
      getReadinessStatus: jest.fn().mockResolvedValue({}),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReadinessController],
      providers: [
        { provide: ReadinessService, useValue: service },
        {
          provide: QuestionSetsParserService,
          useValue: {
            getQuestionSetForUser: jest.fn(),
            getTodaysQuestionSet: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(ReadinessController);
  });

  /** O payload que o app 1.0.9 realmente envia, com um id de outro no body. */
  const bodyHostil = {
    userId: VITIMA,
    answers,
    setNumber: 7,
  } as ReadinessCheckInDto;

  it('usa o id do TOKEN e ignora o userId do body', async () => {
    await controller.analyzeReadiness(TOKEN_USER, bodyHostil);

    expect(service.analyzeReadiness).toHaveBeenCalledWith(
      TOKEN_USER,
      answers,
      7,
    );
  });

  it('o id do body não vaza para NENHUMA chamada do service', async () => {
    await controller.analyzeReadiness(TOKEN_USER, bodyHostil);

    // Varredura ampla de propósito: pega uma regressão que reintroduza o body
    // por outro caminho (spread, campo novo, objeto aninhado) — algo que uma
    // asserção só sobre o 1º argumento deixaria passar.
    const todasAsChamadas = JSON.stringify([
      service.analyzeReadiness.mock.calls,
      service.hasCheckedInToday.mock.calls,
    ]);

    expect(todasAsChamadas).not.toContain(VITIMA);
    expect(todasAsChamadas).toContain(TOKEN_USER);
  });

  it('a identidade é argumento POSICIONAL string, não um objeto', async () => {
    await controller.analyzeReadiness(TOKEN_USER, bodyHostil);

    // Se alguém "voltar" para um DTO resolvido, este teste quebra antes de o
    // spread `{ ...dto, userId }` poder inverter a precedência em silêncio.
    const [primeiraChamada] = service.analyzeReadiness.mock
      .calls as unknown[][];
    expect(typeof primeiraChamada[0]).toBe('string');
  });

  it('a checagem de "já respondeu hoje" também usa o id do token', async () => {
    service.hasCheckedInToday.mockResolvedValue(verdict);

    const res = await controller.analyzeReadiness(TOKEN_USER, bodyHostil);

    expect(service.hasCheckedInToday).toHaveBeenCalledWith(TOKEN_USER);
    expect(res).toMatchObject({ alreadyCompleted: true });
    expect(service.analyzeReadiness).not.toHaveBeenCalled();
  });

  it('aceita body sem userId (mobile futuro)', async () => {
    await controller.analyzeReadiness(TOKEN_USER, {
      answers,
    } as ReadinessCheckInDto);

    expect(service.analyzeReadiness).toHaveBeenCalledWith(
      TOKEN_USER,
      answers,
      undefined,
    );
  });

  it('sem usuário no request responde 401 — e não 500', async () => {
    // O catch-all do handler convertia qualquer HttpException em 500 genérico.
    const chamada = controller.analyzeReadiness(
      undefined as unknown as string,
      bodyHostil,
    );

    await expect(chamada).rejects.toBeInstanceOf(HttpException);
    await expect(chamada).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(service.analyzeReadiness).not.toHaveBeenCalled();
  });

  it('falha inesperada do service vira 500', async () => {
    service.analyzeReadiness.mockRejectedValue(new Error('anthropic timeout'));

    await expect(
      controller.analyzeReadiness(TOKEN_USER, bodyHostil),
    ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
  });
});
