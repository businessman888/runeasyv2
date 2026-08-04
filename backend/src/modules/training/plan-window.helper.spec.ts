import {
  derivePlanWindow,
  derivePlanWeeks,
  isPlanFinished,
  addDaysStr,
  daysBetweenInclusive,
  findLongestRun,
} from './helpers/plan-window.helper';

/**
 * Fase 1A — fronteiras do plano.
 *
 * O defeito que estes testes travam: o fim do plano era
 * `created_at + duration_weeks*7`, uma data CONGELADA na criação. A re-âncora
 * (`shift_pending_workouts`) empurra `workouts.scheduled_date` sem tocar em
 * `created_at`, então um plano congelado e retomado era marcado como
 * "terminado" — e ganhava retrospectiva — antes de os treinos acontecerem.
 */
describe('derivePlanWindow', () => {
  const PLAN = { created_at: '2026-06-01T12:00:00Z', duration_weeks: 4 };

  describe('com workouts (caminho normal)', () => {
    it('usa MIN e MAX de scheduled_date', () => {
      const w = derivePlanWindow(PLAN, [
        '2026-06-03',
        '2026-06-01',
        '2026-06-28',
        '2026-06-15',
      ]);
      expect(w.startStr).toBe('2026-06-01');
      expect(w.endStr).toBe('2026-06-28');
      expect(w.source).toBe('workouts');
    });

    it('ACOMPANHA A RE-ÂNCORA — o shift de +28d move o fim junto', () => {
      const original = derivePlanWindow(PLAN, [
        '2026-06-01',
        '2026-06-08',
        '2026-06-15',
        '2026-06-28',
      ]);
      // shift_pending_workouts move os pendentes; os concluídos ficam.
      const reanchored = derivePlanWindow(PLAN, [
        '2026-06-01',
        '2026-06-08',
        '2026-07-13',
        '2026-07-26',
      ]);

      expect(original.endStr).toBe('2026-06-28');
      expect(reanchored.endStr).toBe('2026-07-26');
      // A janela estica pelo período congelado em vez de terminar no meio.
      expect(reanchored.weeks).toBeGreaterThan(original.weeks);
    });

    it('conta semanas por dias corridos, com piso de 1', () => {
      expect(derivePlanWindow(PLAN, ['2026-06-01', '2026-06-28']).weeks).toBe(
        4,
      );
      expect(derivePlanWindow(PLAN, ['2026-06-01', '2026-06-07']).weeks).toBe(
        1,
      );
      // Um único treino ainda é uma semana, não zero (evita divisão por zero
      // no cálculo de frequência).
      expect(derivePlanWindow(PLAN, ['2026-06-01']).weeks).toBe(1);
    });

    it('ignora entradas nulas/malformadas sem quebrar', () => {
      const w = derivePlanWindow(PLAN, [
        null as unknown as string,
        '2026-06-10',
        '',
        undefined as unknown as string,
      ]);
      expect(w.startStr).toBe('2026-06-10');
      expect(w.source).toBe('workouts');
    });
  });

  describe('sem workouts (fallback)', () => {
    it('deriva de created_at + duration_weeks, inclusivo nas duas pontas', () => {
      const w = derivePlanWindow(
        { created_at: '2026-06-01T12:00:00Z', duration_weeks: 4 },
        [],
      );
      expect(w.startStr).toBe('2026-06-01');
      expect(w.endStr).toBe('2026-06-28'); // 28 dias: 01..28, não 29
      expect(w.weeks).toBe(4);
      expect(w.source).toBe('fallback');
    });

    it('assume 4 semanas quando duration_weeks é nulo ou zero', () => {
      for (const duration of [null, 0, undefined]) {
        const w = derivePlanWindow(
          { created_at: '2026-06-01T12:00:00Z', duration_weeks: duration },
          [],
        );
        expect(w.weeks).toBe(4);
        expect(w.endStr).toBe('2026-06-28');
      }
    });

    it('converte created_at para o DIA DE SÃO PAULO, não UTC', () => {
      // 2026-03-01T02:00:00Z é 2026-02-28 23:00 em São Paulo (UTC-3). O código
      // antigo fazia toISOString().split('T')[0] e obtinha 2026-03-01,
      // deslocando a janela em um dia perto da meia-noite.
      const w = derivePlanWindow(
        { created_at: '2026-03-01T02:00:00Z', duration_weeks: 1 },
        [],
      );
      expect(w.startStr).toBe('2026-02-28');
      expect(w.endStr).toBe('2026-03-06');
    });
  });
});

describe('isPlanFinished', () => {
  const windowOf = (endStr: string) => ({
    startStr: '2026-06-01',
    endStr,
    weeks: 4,
    source: 'workouts' as const,
  });

  it('NÃO considera terminado enquanto há treino hoje ou no futuro', () => {
    // A regressão exata do defeito 4: um plano re-ancorado cujo último treino é
    // amanhã não pode gerar retrospectiva.
    expect(isPlanFinished(windowOf('2026-06-29'), '2026-06-28')).toBe(false);
    expect(isPlanFinished(windowOf('2026-06-28'), '2026-06-28')).toBe(false);
    expect(isPlanFinished(windowOf('2026-07-26'), '2026-06-28')).toBe(false);
  });

  it('considera terminado no dia seguinte ao último treino', () => {
    expect(isPlanFinished(windowOf('2026-06-28'), '2026-06-29')).toBe(true);
    expect(isPlanFinished(windowOf('2026-06-28'), '2026-07-15')).toBe(true);
  });
});

/**
 * Fase 1B — o clímax dos stories.
 *
 * O ponto que estes testes protegem: `longest_run_km` conta TODAS as corridas
 * da janela (plano E livre), ao contrário de `plan_distance_completed_km`, que
 * é plano-only. Estreitar o escopo do recorde por "consistência" com a
 * aderência seria esconder um recorde real do usuário.
 */
describe('findLongestRun', () => {
  it('devolve a maior corrida, em km com 2 casas', () => {
    const r = findLongestRun([
      { start_date: '2026-06-01T10:00:00Z', distance: 5000 },
      { start_date: '2026-06-08T10:00:00Z', distance: 12400 },
      { start_date: '2026-06-15T10:00:00Z', distance: 8000 },
    ]);
    expect(r.km).toBe(12.4);
    expect(r.date).toBe('2026-06-08');
  });

  it('CONTA A CORRIDA LIVRE quando ela é a maior', () => {
    // O caso que importa. Os treinos do plano vão até 8 km; a corrida livre fez
    // 15 km. O recorde é 15 — nao 8.
    const planRuns = [
      { start_date: '2026-06-01T10:00:00Z', distance: 5000 },
      { start_date: '2026-06-03T10:00:00Z', distance: 8000 },
    ];
    const freeRun = { start_date: '2026-06-20T18:00:00Z', distance: 15000 };

    const r = findLongestRun([...planRuns, freeRun]);

    expect(r.km).toBe(15);
    expect(r.date).toBe('2026-06-20');
    expect(r.km).not.toBe(8); // o maior do plano, se o escopo fosse estreitado
  });

  it('em empate, vence a corrida MAIS ANTIGA', () => {
    // Foi nela que a marca foi atingida primeiro.
    const r = findLongestRun([
      { start_date: '2026-06-20T10:00:00Z', distance: 10000 },
      { start_date: '2026-06-05T10:00:00Z', distance: 10000 },
    ]);
    expect(r.date).toBe('2026-06-05');
  });

  it('converte a data para o dia de SÃO PAULO, não UTC', () => {
    // 03:00Z é meia-noite-e-pouco... do dia ANTERIOR em São Paulo (UTC-3).
    const r = findLongestRun([
      { start_date: '2026-06-16T02:00:00Z', distance: 9000 },
    ]);
    expect(r.date).toBe('2026-06-15');
  });

  it('sem corridas → 0 e null, nunca NaN', () => {
    const r = findLongestRun([]);
    expect(r.km).toBe(0);
    expect(r.date).toBeNull();
  });

  it('ignora distâncias nulas, zeradas e negativas', () => {
    const r = findLongestRun([
      { start_date: '2026-06-01T10:00:00Z', distance: null },
      { start_date: '2026-06-02T10:00:00Z', distance: 0 },
      { start_date: '2026-06-03T10:00:00Z', distance: -500 },
      { start_date: '2026-06-04T10:00:00Z', distance: 6000 },
    ]);
    expect(r.km).toBe(6);
    expect(r.date).toBe('2026-06-04');
  });

  it('aceita distance como string (numeric do Postgres via PostgREST)', () => {
    const r = findLongestRun([
      { start_date: '2026-06-01T10:00:00Z', distance: '7500' },
    ]);
    expect(r.km).toBe(7.5);
  });

  it('só corridas inválidas → 0/null, não a linha inválida', () => {
    const r = findLongestRun([
      { start_date: '2026-06-01T10:00:00Z', distance: 0 },
      { start_date: '2026-06-02T10:00:00Z', distance: null },
    ]);
    expect(r).toEqual({ km: 0, date: null });
  });
});

/**
 * Fase 2A — fronteiras por SEMANA do plano.
 *
 * Mesma ideia de `derivePlanWindow`, uma escala abaixo. Extraída de dentro de
 * `getPlanOverview`, onde estava inalcançável — e onde comparava
 * `new Date(startDate + 'T00:00:00')` (TZ do PROCESSO, UTC no Railway) com um
 * "hoje" de São Paulo, deslocando a semana destacada perto da meia-noite.
 */
describe('derivePlanWeeks', () => {
  const wk = (week_number: number | null, scheduled_date: string | null) => ({
    week_number,
    scheduled_date,
  });

  it('deriva MIN/MAX de scheduled_date por week_number', () => {
    const weeks = derivePlanWeeks([
      wk(1, '2026-06-03'),
      wk(1, '2026-06-01'),
      wk(1, '2026-06-05'),
      wk(2, '2026-06-10'),
      wk(2, '2026-06-08'),
    ]);

    expect(weeks).toEqual([
      {
        weekNumber: 1,
        startStr: '2026-06-01',
        endStr: '2026-06-05',
        source: 'workouts',
      },
      {
        weekNumber: 2,
        startStr: '2026-06-08',
        endStr: '2026-06-10',
        source: 'workouts',
      },
    ]);
  });

  it('devolve ordenado por weekNumber mesmo com entrada fora de ordem', () => {
    const weeks = derivePlanWeeks([
      wk(3, '2026-06-15'),
      wk(1, '2026-06-01'),
      wk(2, '2026-06-08'),
    ]);
    expect(weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3]);
  });

  it('ACOMPANHA A RE-ÂNCORA — semana deslocada +14d move as duas fronteiras', () => {
    const original = derivePlanWeeks([
      wk(2, '2026-06-08'),
      wk(2, '2026-06-12'),
    ]);
    const shifted = derivePlanWeeks([wk(2, '2026-06-22'), wk(2, '2026-06-26')]);

    expect(original[0].endStr).toBe('2026-06-12');
    expect(shifted[0].startStr).toBe('2026-06-22');
    expect(shifted[0].endStr).toBe('2026-06-26');
  });

  it('ignora linhas sem week_number ou sem scheduled_date', () => {
    // Corrida livre grava `week_number: null` — não pode virar uma "semana".
    const weeks = derivePlanWeeks([
      wk(null, '2026-06-03'),
      wk(1, null),
      wk(1, '2026-06-01'),
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ weekNumber: 1, startStr: '2026-06-01' });
  });

  it('sem fallback, devolve só as semanas que têm treino', () => {
    const weeks = derivePlanWeeks([wk(1, '2026-06-01')]);
    expect(weeks).toHaveLength(1);
  });

  describe('fallback (semanas declaradas sem treino hidratado)', () => {
    it('completa as semanas faltantes a partir de created_at', () => {
      const weeks = derivePlanWeeks(
        [wk(1, '2026-06-01'), wk(1, '2026-06-05')],
        {
          createdAt: '2026-06-01T12:00:00Z',
          totalWeeks: 3,
        },
      );

      expect(weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3]);
      // A semana 1 tem treino: vence o MIN/MAX, não o fallback.
      expect(weeks[0]).toMatchObject({
        endStr: '2026-06-05',
        source: 'workouts',
      });
      expect(weeks[1]).toEqual({
        weekNumber: 2,
        startStr: '2026-06-08',
        endStr: '2026-06-14',
        source: 'fallback',
      });
      expect(weeks[2].source).toBe('fallback');
    });

    it('resolve created_at no dia de SÃO PAULO, não em UTC', () => {
      // 2026-03-01T02:00:00Z = 2026-02-28 23:00 em São Paulo.
      const weeks = derivePlanWeeks([], {
        createdAt: '2026-03-01T02:00:00Z',
        totalWeeks: 1,
      });
      expect(weeks[0].startStr).toBe('2026-02-28');
      expect(weeks[0].endStr).toBe('2026-03-06');
    });
  });

  it('isPlanFinished serve como predicado de SEMANA FECHADA', () => {
    const [week] = derivePlanWeeks([wk(1, '2026-06-01'), wk(1, '2026-06-07')]);

    // endStr é inclusivo: no próprio dia do último treino a semana ainda corre.
    expect(isPlanFinished(week, '2026-06-07')).toBe(false);
    expect(isPlanFinished(week, '2026-06-08')).toBe(true);
    expect(isPlanFinished(week, '2026-06-01')).toBe(false);
  });
});

describe('helpers de data', () => {
  it('addDaysStr atravessa fim de mês e ano sem fuso', () => {
    expect(addDaysStr('2026-06-28', 1)).toBe('2026-06-29');
    expect(addDaysStr('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetweenInclusive conta as duas pontas', () => {
    expect(daysBetweenInclusive('2026-06-01', '2026-06-01')).toBe(1);
    expect(daysBetweenInclusive('2026-06-01', '2026-06-07')).toBe(7);
    expect(daysBetweenInclusive('2026-06-01', '2026-06-28')).toBe(28);
  });
});
