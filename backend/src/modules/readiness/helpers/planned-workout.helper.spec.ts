import {
  PlannedWorkoutRow,
  isRaceDay,
  pickPrimaryWorkout,
} from './planned-workout.helper';

/**
 * A escolha do treino que representa o dia.
 *
 * O que estes testes protegem:
 *   1. duas linhas pendentes na mesma data são um estado POSSÍVEL (não há
 *      UNIQUE em produção) e a escolha precisa ser determinística;
 *   2. a saída não pode depender da ordem em que o PostgREST devolveu as linhas
 *      — senão o veredito do corredor muda entre duas execuções idênticas;
 *   3. dia de prova ganha de tudo.
 */

function row(over: Partial<PlannedWorkoutRow> = {}): PlannedWorkoutRow {
  return {
    id: 'w1',
    plan_id: 'plan-1',
    type: 'easy_run',
    title: null,
    objective: 'Base aeróbica',
    distance_km: 5,
    scheduled_date: '2026-03-09',
    scheduled_time: '05:00:00',
    is_race_day: false,
    ...over,
  };
}

describe('pickPrimaryWorkout', () => {
  it('devolve undefined quando não há treino', () => {
    expect(pickPrimaryWorkout([])).toBeUndefined();
  });

  it('devolve o único treino sem ordenar', () => {
    const only = row({ id: 'só-esse' });
    expect(pickPrimaryWorkout([only])).toBe(only);
  });

  it('dia de prova ganha do treino de plano', () => {
    const prova = row({ id: 'prova', type: 'race_day', is_race_day: true });
    const normal = row({ id: 'normal', scheduled_time: '04:00:00' });

    // Mesmo chegando depois E com horário mais tarde, a prova vence.
    expect(pickPrimaryWorkout([normal, prova]).id).toBe('prova');
  });

  it('reconhece prova marcada só por is_race_day, sem o type', () => {
    const marcado = row({ id: 'marcado', type: 'long_run', is_race_day: true });
    const normal = row({ id: 'normal', scheduled_time: '04:00:00' });

    expect(isRaceDay(marcado)).toBe(true);
    expect(pickPrimaryWorkout([normal, marcado]).id).toBe('marcado');
  });

  it('treino de plano ganha de treino manual (plan_id null)', () => {
    // O treino do plano é o objeto sobre o qual a IA sugere ajuste; um avulso
    // criado pelo corredor não é o alvo do "reduza o volume".
    const manual = row({
      id: 'manual',
      plan_id: null,
      scheduled_time: '04:00:00',
    });
    const doPlano = row({ id: 'plano' });

    expect(pickPrimaryWorkout([manual, doPlano]).id).toBe('plano');
  });

  it('entre iguais, o mais cedo ganha', () => {
    const tarde = row({ id: 'tarde', scheduled_time: '18:00:00' });
    const cedo = row({ id: 'cedo', scheduled_time: '06:00:00' });

    expect(pickPrimaryWorkout([tarde, cedo]).id).toBe('cedo');
  });

  it('treino sem horário perde para treino com horário', () => {
    const semHora = row({ id: 'sem-hora', scheduled_time: null });
    const comHora = row({ id: 'com-hora', scheduled_time: '23:00:00' });

    expect(pickPrimaryWorkout([semHora, comHora]).id).toBe('com-hora');
  });

  it('desempata por id quando tudo mais empata', () => {
    const b = row({ id: 'b' });
    const a = row({ id: 'a' });

    expect(pickPrimaryWorkout([b, a]).id).toBe('a');
  });

  it('a escolha é ESTÁVEL sob inversão da entrada', () => {
    // Este é o teste que importa: o PostgREST não garante ordem sem ORDER BY,
    // e o veredito não pode oscilar por causa disso.
    const rows = [
      row({ id: 'c', plan_id: null }),
      row({ id: 'a', scheduled_time: '07:00:00' }),
      row({ id: 'b', scheduled_time: '05:30:00' }),
    ];

    const direto = pickPrimaryWorkout(rows).id;
    const invertido = pickPrimaryWorkout([...rows].reverse()).id;

    expect(direto).toBe('b');
    expect(invertido).toBe('b');
  });

  it('não muta o array recebido', () => {
    const rows = [row({ id: 'z' }), row({ id: 'a' })];
    pickPrimaryWorkout(rows);
    expect(rows.map((r) => r.id)).toEqual(['z', 'a']);
  });
});
