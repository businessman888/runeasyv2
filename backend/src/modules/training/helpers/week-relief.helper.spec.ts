/**
 * Fase 6.3 — a política de alívio no nível da semana.
 *
 * As duas invariantes que esta suíte existe para travar:
 *
 *   1. A QUALIDADE NUNCA É TOCADA. Nem quando o corte não cabe — aí o alívio
 *      limita e reporta menos, jamais transborda para o tiro. Foi a decisão
 *      explícita da fase: alívio fundo demais é sinal de replanejamento
 *      (Fase 5), não de cortar o estímulo.
 *   2. O PACE NUNCA É TOCADO, em nenhum treino. É da Fase 3.
 */

import { computeWeekRelief, WeekWorkoutInput } from './week-relief.helper';

/** Contínuo: warmup + main + cooldown. `mainKm` é o que pode ceder. */
const contInuo = (
  id: string,
  type: string,
  mainKm: number,
  paceMin = 400,
): WeekWorkoutInput => ({
  id,
  type,
  title: type,
  scheduled_date: '2026-09-01',
  instructions_json: [
    { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: paceMin, pace_max: paceMin + 40 },
    { type: 'main', zone: 'Z2', distance_km: mainKm, pace_min: paceMin - 40, pace_max: paceMin },
    { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: paceMin, pace_max: paceMin + 40 },
  ],
});

/** Intervalado: 2 + reps×1 + 2. */
const intervalado = (
  id: string,
  type: string,
  reps: number,
): WeekWorkoutInput => ({
  id,
  type,
  title: type,
  scheduled_date: '2026-09-02',
  instructions_json: [
    { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: 400, pace_max: 440 },
    {
      type: 'repeat',
      reps,
      work: { distance_km: 0.8, pace_min: 240, pace_max: 250, zone: 'Z4' },
      recovery: { distance_km: 0.2, pace_min: 420, pace_max: 460, zone: 'Z1' },
    },
    { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: 400, pace_max: 440 },
  ],
});

/** A semana realista: longão 12 · tempo 8 (qualidade) · dois fáceis de 7. */
const semana = (): WeekWorkoutInput[] => [
  contInuo('w-long', 'long_run', 8), // 2+8+2 = 12
  contInuo('w-tempo', 'tempo', 4), // 2+4+2 = 8  ← PROTEGIDO
  contInuo('w-easy1', 'easy_run', 3), // 2+3+2 = 7
  contInuo('w-easy2', 'easy_run', 3), // 2+3+2 = 7
]; // total = 34 km

const paces = (segments: unknown): unknown[] => {
  const out: unknown[] = [];
  const walk = (s: any) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'repeat') {
      walk(s.work);
      walk(s.recovery);
      return;
    }
    out.push([s.pace_min, s.pace_max, s.zone]);
  };
  (segments as any[]).forEach(walk);
  return out;
};

const byId = (r: { changes: any[] }, id: string) =>
  r.changes.find((c) => c.workoutId === id)!;

describe('computeWeekRelief — a qualidade é preservada', () => {
  it('não toca no `tempo`, mesmo ele sendo o segundo maior da semana', () => {
    const out = computeWeekRelief(semana(), 'light');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const tempo = byId(out.result, 'w-tempo');
    expect(tempo.isProtected).toBe(true);
    expect(tempo.changed).toBe(false);
    expect(tempo.afterKm).toBe(8);
    expect(tempo.segments).toBeUndefined(); // não entra no patch
  });

  it.each([
    'intervals',
    'tempo',
    'fartlek',
    'hill_repeats',
    'repetition',
    'progressive',
  ])('protege `%s`', (tipo) => {
    const out = computeWeekRelief(
      [contInuo('w-long', 'long_run', 8), contInuo('w-q', tipo, 4)],
      'strong',
    );
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(byId(out.result, 'w-q').changed).toBe(false);
  });

  it('protege `race_simulation` — a correção obrigatória da 6.3', () => {
    // O gerador trata simulação de prova como volume comum (ela NÃO está no
    // conjunto QUALITY dele). Na hora de cortar ela é o oposto de descartável:
    // é o ensaio da prova. Uma política ingênua a encolheria como rodagem.
    const out = computeWeekRelief(
      [contInuo('w-long', 'long_run', 8), contInuo('w-race', 'race_simulation', 4)],
      'strong',
    );
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const race = byId(out.result, 'w-race');
    expect(race.isProtected).toBe(true);
    expect(race.changed).toBe(false);
    expect(race.afterKm).toBe(8);
  });

  it('protege o intervalado INTEIRO — reps não caem', () => {
    const semanaComTiro = [
      contInuo('w-long', 'long_run', 8),
      intervalado('w-int', 'intervals', 6),
      contInuo('w-easy', 'easy_run', 3),
    ];
    const out = computeWeekRelief(semanaComTiro, 'strong');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const tiro = byId(out.result, 'w-int');
    expect(tiro.changed).toBe(false);
    expect(tiro.segments).toBeUndefined();
    // 2 + 6×1 + 2 = 10 km, intactos
    expect(tiro.beforeKm).toBe(10);
    expect(tiro.afterKm).toBe(10);
  });
});

describe('computeWeekRelief — a distribuição', () => {
  it('o denominador é a SEMANA inteira, não só a base cortável', () => {
    const out = computeWeekRelief(semana(), 'light');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    expect(out.result.weekTotalKmBefore).toBe(34);
    // −20% de 34 = 6,8 km — tirados de uma base de 26 km.
    expect(out.result.weekTotalKmAfter).toBeCloseTo(27.2, 1);
    expect(out.result.achievedPct).toBe(20);
  });

  it('o longão absorve a maior fatia — sem regra especial', () => {
    const out = computeWeekRelief(semana(), 'light');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const cortes = ['w-long', 'w-easy1', 'w-easy2'].map((id) => {
      const c = byId(out.result, id);
      return c.beforeKm - c.afterKm;
    });

    // Sai da proporcionalidade à CAPACIDADE: o longão tem main de 8 km (folga 7)
    // contra 3 km (folga 2) de cada easy. Ele cede mais porque pode mais.
    expect(cortes[0]).toBeGreaterThan(cortes[1]);
    expect(cortes[0]).toBeGreaterThan(cortes[2]);
    // Os dois easies são idênticos → cedem igual.
    expect(cortes[1]).toBeCloseTo(cortes[2], 2);
  });

  it('quando o alvo CABE, a soma dos cortes fecha exatamente com ele', () => {
    const out = computeWeekRelief(semana(), 'light'); // 6,8 de 11 de capacidade
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const totalCortado =
      out.result.weekTotalKmBefore - out.result.weekTotalKmAfter;
    expect(totalCortado).toBeCloseTo(34 * 0.2, 1);
  });

  it('−35% numa semana com qualidade pesada JÁ estoura a capacidade', () => {
    // Achado da implementação, e vale registrar: nesta semana realista
    // (longão 12 · tempo 8 protegido · dois fáceis de 7) o preset forte não
    // cabe. Capacidade = 7 (longão) + 2 + 2 = 11 km; −35% pediria 11,9 km.
    //
    // O sistema entrega 11 e ANUNCIA 32%, não 35%. É o fallback funcionando:
    // limita, reporta o real, e não encosta no `tempo`. Um alívio que precisa
    // de mais que isso é sinal de replanejamento (Fase 5), não de cortar o tiro.
    const out = computeWeekRelief(semana(), 'strong');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const totalCortado =
      out.result.weekTotalKmBefore - out.result.weekTotalKmAfter;
    expect(totalCortado).toBeCloseTo(11, 1);
    expect(out.result.targetPct).toBe(35);
    expect(out.result.achievedPct).toBe(32);

    // O que mais importa: a qualidade continua intocada mesmo no limite.
    expect(byId(out.result, 'w-tempo').afterKm).toBe(8);
  });

  it('−35% corta mais que −20%', () => {
    const leve = computeWeekRelief(semana(), 'light');
    const forte = computeWeekRelief(semana(), 'strong');
    if ('reason' in leve || 'reason' in forte) throw new Error('recusou');

    expect(forte.result.weekTotalKmAfter).toBeLessThan(
      leve.result.weekTotalKmAfter,
    );
  });
});

describe('computeWeekRelief — o fallback: limita, nunca transborda', () => {
  it('corte que não cabe entrega o máximo e reporta o REAL', () => {
    // Semana apertada: o tempo é quase tudo, e os cortáveis têm pouca folga.
    // 4 + 12 + 4 = 20 km; cortáveis = os dois de 4 km (main 1 cada → folga 0).
    const apertada = [
      contInuo('w-easy1', 'easy_run', 1), // 2+1+2 = 5, main já no piso
      contInuo('w-tempo', 'tempo', 8), // 12 — protegido
      contInuo('w-easy2', 'easy_run', 2), // 2+2+2 = 6, folga 1 km
    ];
    const out = computeWeekRelief(apertada, 'strong'); // pediria 8,05 km
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    // Só 1 km de folga existe na semana inteira.
    const cortado = out.result.weekTotalKmBefore - out.result.weekTotalKmAfter;
    expect(cortado).toBeCloseTo(1, 2);
    // 1 de 23 = 4%, não os 35% pedidos. É ISTO que a preview mostra.
    expect(out.result.achievedPct).toBe(4);
    expect(out.result.targetPct).toBe(35);

    // E a qualidade continua intocada, mesmo o alvo não tendo sido atingido.
    expect(byId(out.result, 'w-tempo').changed).toBe(false);
    expect(byId(out.result, 'w-tempo').afterKm).toBe(12);
  });

  it('recusa quando não há NADA cortável — só qualidade na semana', () => {
    const out = computeWeekRelief(
      [contInuo('w-t', 'tempo', 4), contInuo('w-i', 'intervals', 4)],
      'light',
    );
    expect('reason' in out).toBe(true);
    if (!('reason' in out)) return;
    expect(out.reason).toBe('nothing_to_reduce');
  });

  it('recusa quando os cortáveis já estão todos no piso', () => {
    const out = computeWeekRelief(
      [contInuo('w-e1', 'easy_run', 1), contInuo('w-e2', 'easy_run', 1)],
      'strong',
    );
    expect('reason' in out).toBe(true);
    if (!('reason' in out)) return;
    expect(out.reason).toBe('nothing_to_reduce');
  });

  it('recusa semana por TEMPO (walk/run está fora da v1)', () => {
    const porTempo: WeekWorkoutInput[] = [
      {
        id: 'w-wr',
        type: 'walk_run',
        title: null,
        scheduled_date: '2026-09-01',
        instructions_json: [
          { type: 'main', duration_seconds: 1800, pace_min: 480, pace_max: 540 },
        ],
      },
    ];
    const out = computeWeekRelief(porTempo, 'light');
    expect('reason' in out).toBe(true);
    if (!('reason' in out)) return;
    expect(out.reason).toBe('week_time_based');
  });

  it('recusa semana vazia', () => {
    const out = computeWeekRelief([], 'light');
    expect('reason' in out).toBe(true);
    if (!('reason' in out)) return;
    expect(out.reason).toBe('no_workouts');
  });
});

describe('computeWeekRelief — reconciliação do resíduo', () => {
  it('um cortável com `repeat` não deixa a semana entregar menos que o possível', () => {
    // Um easy com bloco `repeat` arredonda reps para baixo e sobra resíduo. A
    // segunda passada tem de empurrar esse resíduo para quem ainda tem folga.
    const comResiduo = [
      contInuo('w-long', 'long_run', 10), // folga grande
      intervalado('w-easy-rep', 'easy_run', 6), // cortável, mas arredonda
      contInuo('w-easy', 'easy_run', 3),
    ];
    const out = computeWeekRelief(comResiduo, 'light');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const alvo = out.result.weekTotalKmBefore * 0.2;
    const cortado = out.result.weekTotalKmBefore - out.result.weekTotalKmAfter;
    // Sem a reconciliação, o arredondamento das reps deixaria sobra visível.
    expect(cortado).toBeGreaterThan(alvo - 0.3);
  });
});

describe('computeWeekRelief — contratos', () => {
  it('NUNCA altera pace nem zona, em treino nenhum', () => {
    for (const level of ['light', 'strong'] as const) {
      const original = semana();
      const antes = original.map((w) => paces(w.instructions_json));

      const out = computeWeekRelief(original, level);
      if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

      out.result.changes.forEach((c, i) => {
        if (!c.segments) return;
        expect(paces(c.segments)).toEqual(antes[i]);
      });
    }
  });

  it('NÃO muta a entrada — o md5 original é a base do CAS', () => {
    const original = semana();
    const copia = JSON.parse(JSON.stringify(original));

    computeWeekRelief(original, 'strong');

    expect(original).toEqual(copia);
  });

  it('só quem mudou carrega segmentos — o patch não leva passageiro', () => {
    const out = computeWeekRelief(semana(), 'light');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    for (const c of out.result.changes) {
      expect(!!c.segments).toBe(c.changed);
    }
  });

  it('a aritmética fecha: soma dos afterKm == weekTotalKmAfter', () => {
    const out = computeWeekRelief(semana(), 'strong');
    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);

    const soma = out.result.changes.reduce((s, c) => s + c.afterKm, 0);
    expect(Math.round(soma * 100) / 100).toBe(out.result.weekTotalKmAfter);
  });
});
