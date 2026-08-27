import {
  evaluateSpacing,
  freeDatesInWindow,
  isHeavy,
  isNoOp,
  normalizeDays,
  readDaysOfWeek,
  remapSingle,
  remapStructural,
  SwapWorkoutInput,
  Weekday,
  weekdayOf,
} from './day-swap.helper';

/**
 * Troca de Dias T.1 — a LÓGICA, sem banco.
 *
 * O que estes testes protegem, em ordem de importância:
 *   1. **sem colisão** — não existe `UNIQUE (plan_id, scheduled_date)` em
 *      ambiente nenhum (medido em staging e produção). Se a lógica deixar
 *      passar, o banco aceita e o calendário fica com dois treinos no mesmo
 *      dia, em silêncio. Esta é a única invariante SEM rede embaixo;
 *   2. **sem passado** — tem rede (a guarda `RE422` da T.0), mas se ela
 *      disparar em uso normal é bug daqui;
 *   3. **ordem preservada** — incluindo o caso da âncora desalinhada, que é
 *      onde parear por número do dia inverteria a semana.
 */

// 2026-08-15 é um SÁBADO. Escolhido de propósito: uma âncora que não é domingo
// nem segunda é o que expõe a diferença entre ordem-por-número e ordem-por-data.
const TODAY = '2026-08-15';

const w = (
  id: string,
  date: string,
  over: Partial<SwapWorkoutInput> = {},
): SwapWorkoutInput => ({
  id,
  week_number: 2,
  scheduled_date: date,
  type: 'easy_run',
  title: null,
  ...over,
});

describe('weekdayOf', () => {
  it.each([
    ['2026-08-16', 0, 'domingo'],
    ['2026-08-17', 1, 'segunda'],
    ['2026-08-15', 6, 'sábado'],
  ])('%s → %i (%s)', (date, dow) => {
    expect(weekdayOf(date)).toBe(dow);
  });

  it('não depende do fuso do processo', () => {
    // Se alguém trocar por `new Date(str)`, o construtor interpreta em UTC e um
    // `.getDay()` local devolve o dia anterior em São Paulo. Estas duas datas
    // pegam a virada de ano, onde o erro apareceria.
    expect(weekdayOf('2026-12-31')).toBe(4);
    expect(weekdayOf('2027-01-01')).toBe(5);
  });
});

describe('normalizeDays', () => {
  it('ordena, deduplica e aceita 0..6', () => {
    expect(normalizeDays([6, 1, 1, 3])).toEqual([1, 3, 6]);
  });

  it.each([[[7]], [[-1]], [['seg']], [[1.5]], [[]], ['nada']])(
    'recusa %p',
    (raw) => {
      expect(normalizeDays(raw)).toBeNull();
    },
  );
});

describe('readDaysOfWeek — a QUANTIDADE sai do calendário', () => {
  it('lê os dias reais da semana pedida', () => {
    const dias = readDaysOfWeek(
      [
        w('a', '2026-08-16'), // domingo
        w('b', '2026-08-17'), // segunda
        w('c', '2026-08-18'), // terça
        w('d', '2026-08-24', { week_number: 3 }), // outra semana
      ],
      2,
    );
    expect(dias).toEqual([0, 1, 2]);
  });

  it('um plano de UM treino por semana devolve UM dia', () => {
    // O caso real do plano `60f5e785` em produção: o onboarding diz `freq=3`,
    // o calendário tem um treino por semana, sempre no sábado. Ler
    // `days_per_week` faria a troca tentar virar 1 dia em 3 — regenerar o
    // plano, não trocar os dias.
    expect(readDaysOfWeek([w('a', '2026-08-22')], 2)).toEqual([6]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('remapStructural — Modo 1', () => {
  const base = {
    todayStr: TODAY,
    fromWeekNumber: 2,
    occupiedDates: [] as string[],
  };

  it('remapeia preservando a ordem cronológica', () => {
    // Semana ancorada num DOMINGO: DOM/SEG/TER → TER/QUI/SÁB.
    const out = remapStructural({
      ...base,
      workouts: [
        w('easy', '2026-08-16'), // dom
        w('qual', '2026-08-17'), // seg
        w('long', '2026-08-18', { type: 'long_run' }), // ter
      ],
      newDays: [2, 4, 6],
      occupiedDates: ['2026-08-16', '2026-08-17', '2026-08-18'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(out.result.map((r) => [r.workoutId, r.to])).toEqual([
      ['easy', '2026-08-18'], // ter
      ['qual', '2026-08-20'], // qui
      ['long', '2026-08-22'], // sáb
    ]);
  });

  it('ÂNCORA DESALINHADA: pareia por DATA, não por número do dia', () => {
    // ── O caso que a reauditoria mediu ───────────────────────────────────────
    //
    // A janela da semana é ancorada no dia em que o PLANO começou, não no
    // domingo. Aqui a âncora é uma QUARTA (2026-08-19), e os dias novos
    // TER/QUI/SÁB caem no calendário como Qui(20), Sáb(22), Ter(25).
    //
    // Parear por NÚMERO do dia (2,4,6) daria: easy→Ter(25), qual→Qui(20),
    // long→Sáb(22) — jogando o longão para o MEIO da semana e o fácil para o
    // fim. Parear por DATA preserva a estrutura que o gerador montou.
    const out = remapStructural({
      ...base,
      workouts: [
        w('easy', '2026-08-19'), // qua — a âncora
        w('qual', '2026-08-21', { type: 'tempo' }), // sex
        w('long', '2026-08-23', { type: 'long_run' }), // dom
      ],
      newDays: [2, 4, 6],
      occupiedDates: ['2026-08-19', '2026-08-21', '2026-08-23'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(out.result.map((r) => [r.workoutId, r.to])).toEqual([
      ['easy', '2026-08-20'], // qui — primeiro cronologicamente
      ['qual', '2026-08-22'], // sáb
      ['long', '2026-08-25'], // ter — último, como era
    ]);

    // A ordem relativa se manteve: o longão continua sendo o último da semana.
    const ordenado = [...out.result].sort((a, b) => (a.to < b.to ? -1 : 1));
    expect(ordenado.map((r) => r.workoutId)).toEqual(['easy', 'qual', 'long']);
  });

  it('mantém cada semana dentro da própria janela de 7 dias', () => {
    const out = remapStructural({
      ...base,
      workouts: [
        w('s2a', '2026-08-16'),
        w('s2b', '2026-08-18'),
        w('s3a', '2026-08-23', { week_number: 3 }),
        w('s3b', '2026-08-25', { week_number: 3 }),
      ],
      newDays: [3, 5],
      occupiedDates: ['2026-08-16', '2026-08-18', '2026-08-23', '2026-08-25'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    const s2 = out.result.filter((r) => r.weekNumber === 2).map((r) => r.to);
    const s3 = out.result.filter((r) => r.weekNumber === 3).map((r) => r.to);
    expect(s2).toEqual(['2026-08-19', '2026-08-21']);
    expect(s3).toEqual(['2026-08-26', '2026-08-28']);
    // Sem sobreposição: a última da semana 2 vem antes da primeira da 3.
    expect(s2[s2.length - 1] < s3[0]).toBe(true);
  });

  it('NÃO toca a semana corrente — o passado morre por construção', () => {
    const out = remapStructural({
      ...base,
      workouts: [
        w('corrente', '2026-08-16', { week_number: 1 }),
        w('proxima', '2026-08-23', { week_number: 2 }),
      ],
      newDays: [1],
      fromWeekNumber: 2,
      occupiedDates: ['2026-08-16', '2026-08-23'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(out.result.map((r) => r.workoutId)).toEqual(['proxima']);
  });

  it('nenhuma data nova cai em hoje ou no passado', () => {
    const out = remapStructural({
      ...base,
      workouts: [w('a', '2026-08-16'), w('b', '2026-08-18')],
      newDays: [0, 2],
      occupiedDates: ['2026-08-16', '2026-08-18'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    for (const r of out.result) expect(r.to > TODAY).toBe(true);
  });

  it('RECUSA quando colidiria com um treino intocável (o dia da PROVA)', () => {
    // A prova não sai do lugar (fica fora da janela editável), mas nada no
    // banco impede mover OUTRO treino para cima dela. É aqui que isso morre.
    const out = remapStructural({
      ...base,
      workouts: [w('a', '2026-08-16'), w('b', '2026-08-17')],
      newDays: [1, 2],
      // 2026-08-18 (ter) é a prova — não está entre os remapeáveis, mas ocupa.
      occupiedDates: ['2026-08-16', '2026-08-17', '2026-08-18'],
    });

    expect('reason' in out && out.reason).toBe('target_not_free');
  });

  it('RECUSA semana com mais treinos que dias novos', () => {
    const out = remapStructural({
      ...base,
      workouts: [
        w('a', '2026-08-16'),
        w('b', '2026-08-17'),
        w('c', '2026-08-18'),
      ],
      newDays: [1, 3],
      occupiedDates: ['2026-08-16', '2026-08-17', '2026-08-18'],
    });

    // Escolher em silêncio quem fica de fora seria pior que recusar.
    expect('reason' in out && out.reason).toBe('week_count_mismatch');
  });

  it('recusa quando não há semana seguinte', () => {
    const out = remapStructural({
      ...base,
      workouts: [w('a', '2026-08-16', { week_number: 1 })],
      newDays: [1],
      fromWeekNumber: 2,
    });
    expect('reason' in out && out.reason).toBe('no_next_week');
  });

  it('marca `changed: false` no treino que já estava no dia certo', () => {
    const out = remapStructural({
      ...base,
      workouts: [w('a', '2026-08-16'), w('b', '2026-08-18')],
      newDays: [0, 3], // domingo continua domingo; terça vira quarta
      occupiedDates: ['2026-08-16', '2026-08-18'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(out.result.find((r) => r.workoutId === 'a')?.changed).toBe(false);
    expect(out.result.find((r) => r.workoutId === 'b')?.changed).toBe(true);
    expect(isNoOp(out.result)).toBe(false);
  });

  it('`isNoOp` quando o conjunto novo é igual ao atual', () => {
    const out = remapStructural({
      ...base,
      workouts: [w('a', '2026-08-16'), w('b', '2026-08-18')],
      newDays: [0, 2],
      occupiedDates: ['2026-08-16', '2026-08-18'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(isNoOp(out.result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('freeDatesInWindow — o select do Modo 2', () => {
  it('só oferece dias FUTUROS e LIVRES', () => {
    const livres = freeDatesInWindow({
      windowStart: '2026-08-13',
      windowEnd: '2026-08-19',
      todayStr: TODAY, // 15
      occupiedDates: ['2026-08-13', '2026-08-17'],
    });

    // 13 e 14 já passaram; 15 é hoje (congelado); 17 está ocupado.
    expect(livres).toEqual(['2026-08-16', '2026-08-18', '2026-08-19']);
  });

  it('devolve vazio quando a semana acabou', () => {
    expect(
      freeDatesInWindow({
        windowStart: '2026-08-09',
        windowEnd: '2026-08-14',
        todayStr: TODAY,
        occupiedDates: [],
      }),
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('remapSingle — Modo 2', () => {
  const alvo = w('alvo', '2026-08-17');

  it('move o treino para o dia escolhido', () => {
    const out = remapSingle({
      workout: alvo,
      targetDate: '2026-08-19',
      todayStr: TODAY,
      occupiedDates: ['2026-08-17'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(out.result).toHaveLength(1);
    expect(out.result[0].to).toBe('2026-08-19');
    expect(out.result[0].changed).toBe(true);
  });

  it.each([
    ['hoje', TODAY],
    ['ontem', '2026-08-14'],
  ])('recusa destino em %s', (_label, target) => {
    const out = remapSingle({
      workout: alvo,
      targetDate: target,
      todayStr: TODAY,
      occupiedDates: ['2026-08-17'],
    });
    expect('reason' in out && out.reason).toBe('target_in_past');
  });

  it('recusa destino OCUPADO', () => {
    const out = remapSingle({
      workout: alvo,
      targetDate: '2026-08-19',
      todayStr: TODAY,
      occupiedDates: ['2026-08-17', '2026-08-19'],
    });
    expect('reason' in out && out.reason).toBe('target_not_free');
  });

  it('a origem NÃO conta como ocupada — mover para o mesmo dia é no-op, não colisão', () => {
    const out = remapSingle({
      workout: alvo,
      targetDate: '2026-08-17',
      todayStr: TODAY,
      occupiedDates: ['2026-08-17'],
    });

    if ('reason' in out) throw new Error(`recusou: ${out.reason}`);
    expect(isNoOp(out.result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('evaluateSpacing — a régua', () => {
  const r = (id: string, to: string, type: string) => ({
    workoutId: id,
    weekNumber: 2,
    type,
    title: null,
    from: to,
    to,
    changed: true,
  });

  it('classifica pesado pelo tipo', () => {
    for (const t of [
      'intervals',
      'tempo',
      'fartlek',
      'hill_repeats',
      'repetition',
      'progressive',
      'long_run',
      'race_simulation',
    ]) {
      expect(isHeavy(t)).toBe(true);
    }
    for (const t of ['easy_run', 'recovery', 'walk_run', null, undefined]) {
      expect(isHeavy(t)).toBe(false);
    }
  });

  it('`apertado` quando dois PESADOS caem em dias consecutivos', () => {
    const v = evaluateSpacing([
      r('easy', '2026-08-17', 'easy_run'),
      r('tempo', '2026-08-19', 'tempo'),
      r('long', '2026-08-20', 'long_run'),
    ]);

    expect(v.verdict).toBe('apertado');
    expect(v.pairs).toHaveLength(1);
    expect(v.pairs[0].first.workoutId).toBe('tempo');
    expect(v.pairs[0].second.workoutId).toBe('long');
  });

  it('`ok` quando os pesados têm folga', () => {
    const v = evaluateSpacing([
      r('tempo', '2026-08-17', 'tempo'),
      r('easy', '2026-08-19', 'easy_run'),
      r('long', '2026-08-21', 'long_run'),
    ]);
    expect(v.verdict).toBe('ok');
    expect(v.pairs).toEqual([]);
  });

  it('dois LEVES colados não são apertado', () => {
    const v = evaluateSpacing([
      r('a', '2026-08-17', 'easy_run'),
      r('b', '2026-08-18', 'recovery'),
    ]);
    expect(v.verdict).toBe('ok');
  });

  it('UM pesado só — a régua cala a boca', () => {
    // Semanas de `base` e `taper` não têm sessão de qualidade (o `qualitySlot`
    // do gerador só existe em build/peak com 3+ dias). O único pesado é o
    // longão, não há par possível, e inventar assunto seria pior que calar.
    const v = evaluateSpacing([
      r('easy', '2026-08-17', 'easy_run'),
      r('long', '2026-08-18', 'long_run'),
      r('easy2', '2026-08-19', 'easy_run'),
    ]);
    expect(v.verdict).toBe('ok');
  });

  it('reporta CADA par colado', () => {
    const v = evaluateSpacing([
      r('t', '2026-08-17', 'tempo'),
      r('i', '2026-08-18', 'intervals'),
      r('l', '2026-08-19', 'long_run'),
    ]);
    expect(v.verdict).toBe('apertado');
    expect(v.pairs.map((p) => [p.first.workoutId, p.second.workoutId])).toEqual(
      [
        ['t', 'i'],
        ['i', 'l'],
      ],
    );
  });

  it('avalia por DATA, não pela ordem em que os treinos chegam', () => {
    const v = evaluateSpacing([
      r('long', '2026-08-20', 'long_run'),
      r('tempo', '2026-08-19', 'tempo'),
    ]);
    expect(v.pairs[0].first.workoutId).toBe('tempo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('invariante da COLISÃO — a única sem rede no banco', () => {
  // Varredura: para toda âncora de semana e todo par (dias atuais, dias novos)
  // de mesmo tamanho, o resultado NUNCA pode ter duas datas iguais. Não existe
  // `UNIQUE (plan_id, scheduled_date)` — se passar daqui, o banco aceita.
  const combos = (n: number, k: number, s = 0): number[][] =>
    k === 0
      ? [[]]
      : Array.from({ length: n - s - k + 1 }, (_, i) =>
          combos(n, k - 1, s + i + 1).map((c) => [s + i, ...c]),
        ).flat();

  it('nenhuma colisão em nenhum arranjo de 3 dias, para toda âncora', () => {
    const trios = combos(7, 3);
    let avaliados = 0;

    for (let ancoraOffset = 1; ancoraOffset <= 7; ancoraOffset++) {
      const ancora = `2026-08-${String(15 + ancoraOffset).padStart(2, '0')}`;
      for (const atuais of trios) {
        const workouts = atuais.map((d, i) => {
          const dia = (d - weekdayOf(ancora) + 7) % 7;
          const [y, m, dd] = ancora.split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, dd + dia));
          return w(`w${i}`, dt.toISOString().slice(0, 10));
        });
        const ocupadas = workouts.map((x) => x.scheduled_date);

        for (const novos of trios) {
          const out = remapStructural({
            workouts,
            newDays: novos as Weekday[],
            fromWeekNumber: 2,
            todayStr: TODAY,
            occupiedDates: ocupadas,
          });
          avaliados++;
          if ('reason' in out) {
            // Recusar é aceitável; colidir não. `target_not_free` só pode
            // aparecer por conta de datas ocupadas de FORA do conjunto.
            expect([
              'week_count_mismatch',
              'target_not_free',
              'target_in_past',
            ]).toContain(out.reason);
            continue;
          }
          const datas = out.result.map((x) => x.to);
          expect(new Set(datas).size).toBe(datas.length);
          for (const d of datas) expect(d > TODAY).toBe(true);
        }
      }
    }

    expect(avaliados).toBe(7 * 35 * 35);
  });
});
