import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';
import { QuestionSetsParserService } from './question-sets-parser.service';
import { SubscriptionService } from '../subscription/subscription.service';
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
  let subscription: { isProUser: jest.Mock };

  beforeEach(async () => {
    service = {
      analyzeReadiness: jest.fn().mockResolvedValue({ kind: 'ok', verdict }),
      hasCheckedInToday: jest.fn().mockResolvedValue(null),
      // Por padrão: Pro, desbloqueado, sem check-in hoje.
      getReadinessStatus: jest.fn().mockResolvedValue({
        isUnlocked: true,
        learning: null,
        eligibilityReason: 'ok',
      }),
    };
    subscription = { isProUser: jest.fn().mockResolvedValue(true) };

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
        { provide: SubscriptionService, useValue: subscription },
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

  it('o caminho "já respondeu hoje" também roda sob o id do TOKEN', async () => {
    // A checagem em si migrou para dentro do service (era feita aqui e refeita
    // lá, custando uma consulta duplicada por check-in). A garantia de IDOR não
    // mudou de natureza: ela agora vive no 1º argumento posicional, que é o id
    // do token — e o id do body não alcança nenhuma chamada.
    service.analyzeReadiness.mockResolvedValue({
      kind: 'ja_respondeu',
      verdict,
    });

    const res = await controller.analyzeReadiness(TOKEN_USER, bodyHostil);

    expect(service.analyzeReadiness).toHaveBeenCalledTimes(1);
    const [idUsado] = service.analyzeReadiness.mock.calls[0] as [string];
    expect(idUsado).toBe(TOKEN_USER);
    expect(JSON.stringify(service.analyzeReadiness.mock.calls)).not.toContain(
      bodyHostil.userId,
    );
    expect(res).toMatchObject({ alreadyCompleted: true });
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

  /**
   * O PRO-GATE e o PISO — os dois caminhos que recusam ANTES de gastar IA.
   *
   * Até a R.1 o gate existia só no mobile, então qualquer conta autenticada
   * queimava orçamento de IA batendo nesta rota direto.
   */
  describe('recusas que não custam uma chamada de IA', () => {
    it('conta Free recebe 403 e o motor NÃO roda', async () => {
      subscription.isProUser.mockResolvedValue(false);

      await expect(
        controller.analyzeReadiness('u1', bodyHostil as never),
      ).rejects.toMatchObject({ status: 403 });

      expect(service.analyzeReadiness).not.toHaveBeenCalled();
    });

    it('abaixo do piso recebe 422 com o progresso', async () => {
      // O piso é checado DENTRO de analyzeReadiness, onde o dado da carga já
      // está na mão — o controller não refaz a consulta para descobrir isso.
      service.analyzeReadiness.mockResolvedValue({
        kind: 'aprendendo',
        learning: {
          spanDays: 6,
          runDays: 3,
          missingSpanDays: 8,
          missingRunDays: 3,
        },
      });

      await expect(
        controller.analyzeReadiness('u1', bodyHostil as never),
      ).rejects.toMatchObject({
        status: 422,
        response: { learning: { missingRunDays: 3 } },
      });
    });

    it('o controller NÃO refaz consultas que o service já fez', async () => {
      // A regressão de latência: o controller chamava `hasCheckedInToday` e
      // `getReadinessStatus` antes de `analyzeReadiness`, e o service refazia as
      // duas. Eram 11 idas ao banco por check-in, 4 repetindo consulta idêntica.
      await controller.analyzeReadiness('u1', bodyHostil as never);

      expect(service.hasCheckedInToday).not.toHaveBeenCalled();
      expect(service.getReadinessStatus).not.toHaveBeenCalled();
      expect(service.analyzeReadiness).toHaveBeenCalledTimes(1);
    });

    it('falha ao consultar a assinatura LIBERA em vez de barrar', async () => {
      // O corredor já respondeu o quiz; transformar um erro de consulta em
      // bloqueio puniria quem pagou.
      subscription.isProUser.mockRejectedValue(new Error('db down'));

      await expect(
        controller.analyzeReadiness('u1', bodyHostil as never),
      ).resolves.toMatchObject({ alreadyCompleted: false });

      expect(service.analyzeReadiness).toHaveBeenCalled();
    });

    it('quem já respondeu hoje recebe o veredito guardado, sem IA nova', async () => {
      service.analyzeReadiness.mockResolvedValue({
        kind: 'ja_respondeu',
        verdict,
      });

      const r = await controller.analyzeReadiness('u1', bodyHostil as never);
      expect(r).toMatchObject({ alreadyCompleted: true });
      expect(r).toMatchObject({
        message: expect.stringContaining('03:00') as unknown as string,
      });
    });
  });
});
