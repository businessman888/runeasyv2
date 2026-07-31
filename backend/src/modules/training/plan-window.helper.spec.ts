import {
  derivePlanWindow,
  isPlanFinished,
  addDaysStr,
  daysBetweenInclusive,
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
      expect(derivePlanWindow(PLAN, ['2026-06-01', '2026-06-28']).weeks).toBe(4);
      expect(derivePlanWindow(PLAN, ['2026-06-01', '2026-06-07']).weeks).toBe(1);
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
