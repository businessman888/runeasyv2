/**
 * Fase 6.2 — o cálculo do alívio.
 *
 * A invariante mais importante desta suíte não é aritmética: é que `pace_min` e
 * `pace_max` saem IDÊNTICOS de todos os caminhos. Pace é da Fase 3, e a Fase 6
 * escrevê-lo reabriria a corrida que a fundação da 6.1 fechou.
 */

import {
  computeRelief,
  totalsOfSegments,
  MIN_MAIN_KM,
  MIN_REPS,
  RELIEF_TARGET_PCT,
} from './volume-relief.helper';

/** 2 + 6 + 2 = 10 km, o formato mais comum de rodagem longa. */
const contínuo = () => [
  { type: 'warmup', distance_km: 2, pace_min: 400, pace_max: 440, zone: 'Z1' },
  { type: 'main', distance_km: 6, pace_min: 360, pace_max: 390, zone: 'Z2' },
  { type: 'cooldown', distance_km: 2, pace_min: 400, pace_max: 440, zone: 'Z1' },
];

/** 2 + 6×(0,8 + 0,4) + 2 = 11,2 km. */
const intervalado = () => [
  { type: 'warmup', distance_km: 2, pace_min: 400, pace_max: 440, zone: 'Z1' },
  {
    type: 'repeat',
    reps: 6,
    work: { distance_km: 0.8, pace_min: 240, pace_max: 250, zone: 'Z4' },
    recovery: { distance_km: 0.4, pace_min: 420, pace_max: 460, zone: 'Z1' },
  },
  { type: 'cooldown', distance_km: 2, pace_min: 400, pace_max: 440, zone: 'Z1' },
];

/** Protocolo caminhada/corrida: só tempo, sem distância. */
const porTempo = () => [
  { type: 'warmup', duration_seconds: 300, pace_min: 480, pace_max: 540, zone: 'Z1' },
  { type: 'main', duration_seconds: 1800, pace_min: 420, pace_max: 480, zone: 'Z2' },
  { type: 'cooldown', duration_seconds: 300, pace_min: 480, pace_max: 540, zone: 'Z1' },
];

/** Extrai todo par pace_min/pace_max, em ordem, para comparar antes × depois. */
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

describe('totalsOfSegments', () => {
  it('soma blocos simples', () => {
    expect(totalsOfSegments(contínuo()).km).toBe(10);
  });

  it('expande `repeat` como reps × (work + recovery)', () => {
    // 2 + 6×1,2 + 2 = 11,2 — a MESMA expansão de segmentEngine.buildSegSteps.
    expect(totalsOfSegments(intervalado()).km).toBe(11.2);
  });

  it('soma duração dos blocos por tempo', () => {
    expect(totalsOfSegments(porTempo()).seconds).toBe(2400);
  });

  it('devolve zeros para entrada inválida', () => {
    expect(totalsOfSegments(null)).toEqual({ km: 0, seconds: 0 });
    expect(totalsOfSegments('nope')).toEqual({ km: 0, seconds: 0 });
  });
});

describe('computeRelief — contínuo', () => {
  it('tira o corte inteiro do `main`, sem tocar aquecimento nem volta à calma', () => {
    const r = computeRelief(contínuo(), 'light')!; // −20% de 10 km = 2 km

    expect(r.changed).toBe(true);
    expect(r.distanceKm).toBe(8);
    expect(r.achievedPct).toBe(20);

    const segs = r.segments as any[];
    expect(segs[0].distance_km).toBe(2); // warmup intacto
    expect(segs[1].distance_km).toBe(4); // main: 6 → 4
    expect(segs[2].distance_km).toBe(2); // cooldown intacto
  });

  it('−35% corta mais fundo', () => {
    const r = computeRelief(contínuo(), 'strong')!; // 3,5 km de 10
    expect(r.distanceKm).toBe(6.5);
    expect((r.segments as any[])[1].distance_km).toBe(2.5);
  });

  it('respeita o piso do `main` e reporta a redução REAL', () => {
    // 2 + 2 + 2 = 6 km. −35% pediria 2,1 km, mas o main só pode ceder 1 km.
    const curto = [
      { type: 'warmup', distance_km: 2, pace_min: 400 },
      { type: 'main', distance_km: 2, pace_min: 360 },
      { type: 'cooldown', distance_km: 2, pace_min: 400 },
    ];
    const r = computeRelief(curto, 'strong')!;

    expect((r.segments as any[])[1].distance_km).toBe(MIN_MAIN_KM);
    expect(r.distanceKm).toBe(5);
    // 1 de 6 = 17%, não os 35% pedidos. A preview mostra ISTO.
    expect(r.achievedPct).toBe(17);
    expect(r.changed).toBe(true);
  });

  it('`changed: false` quando o piso engole o corte inteiro', () => {
    const mínimo = [
      { type: 'warmup', distance_km: 2, pace_min: 400 },
      { type: 'main', distance_km: MIN_MAIN_KM, pace_min: 360 },
    ];
    const r = computeRelief(mínimo, 'light')!;
    expect(r.changed).toBe(false);
    expect(r.achievedPct).toBe(0);
  });

  it('trata segmento sem `type` como `main` (igual ao motor do mobile)', () => {
    const semTipo = [{ distance_km: 8, pace_min: 360, pace_max: 390 }];
    const r = computeRelief(semTipo, 'light')!;
    expect(r.changed).toBe(true);
    expect((r.segments as any[])[0].distance_km).toBe(6.4);
  });
});

describe('computeRelief — intervalado', () => {
  it('reduz REPS e mantém cada tiro na distância original', () => {
    // 11,2 km, −20% = 2,24 km. Cada rep vale 1,2 km → cabe 1 rep.
    const r = computeRelief(intervalado(), 'light')!;
    const rep = (r.segments as any[])[1];

    expect(rep.reps).toBe(5);
    expect(rep.work.distance_km).toBe(0.8); // o tiro NÃO encolhe
    expect(rep.recovery.distance_km).toBe(0.4);
    expect(r.distanceKm).toBe(10);
  });

  it('−35% remove duas repetições', () => {
    // 3,92 km pedidos ÷ 1,2 por rep = 3 reps; limitado a reps − MIN_REPS = 4.
    const r = computeRelief(intervalado(), 'strong')!;
    expect((r.segments as any[])[1].reps).toBe(3);
  });

  it('arredonda para baixo — nunca corta uma repetição a mais', () => {
    // 2 + 4×1,2 = 6,8 km. −20% = 1,36 km, e 1,36 ÷ 1,2 = 1,13 → 1 rep.
    const r = computeRelief(
      [
        { type: 'warmup', distance_km: 2, pace_min: 400 },
        {
          type: 'repeat',
          reps: 4,
          work: { distance_km: 0.8, pace_min: 240 },
          recovery: { distance_km: 0.4, pace_min: 420 },
        },
      ],
      'light',
    )!;
    expect((r.segments as any[])[1].reps).toBe(3);
  });

  it('respeita o piso de repetições — 2 tiros ainda são um intervalado', () => {
    const r = computeRelief(
      [
        {
          type: 'repeat',
          reps: 3,
          work: { distance_km: 1, pace_min: 240 },
          recovery: { distance_km: 0.5, pace_min: 420 },
        },
      ],
      'strong',
    )!;
    expect((r.segments as any[])[0].reps).toBe(MIN_REPS);
  });

  it('não mexe num repeat que já está no piso', () => {
    const noPiso = [
      {
        type: 'repeat',
        reps: MIN_REPS,
        work: { distance_km: 1, pace_min: 240 },
        recovery: { distance_km: 0.5, pace_min: 420 },
      },
    ];
    const r = computeRelief(noPiso, 'strong')!;
    expect(r.changed).toBe(false);
  });
});

describe('computeRelief — treino por tempo', () => {
  it('encolhe `duration_seconds` do main e mantém distância em zero', () => {
    const r = computeRelief(porTempo(), 'light')!; // −20% de 2400 s = 480 s
    const segs = r.segments as any[];

    expect(segs[0].duration_seconds).toBe(300); // warmup intacto
    expect(segs[1].duration_seconds).toBe(1320); // main: 1800 → 1320
    expect(r.durationSeconds).toBe(1920);
    expect(r.distanceKm).toBe(0);
    expect(r.achievedPct).toBe(20);
  });
});

describe('computeRelief — contratos', () => {
  it('NUNCA altera pace nem zona — a invariante da fase', () => {
    for (const build of [contínuo, intervalado, porTempo]) {
      for (const level of ['light', 'strong'] as const) {
        const original = build();
        const antes = paces(original);
        const r = computeRelief(original, level)!;
        expect(paces(r.segments)).toEqual(antes);
      }
    }
  });

  it('NÃO muta o array recebido — o md5 do original é a base do CAS', () => {
    const original = contínuo();
    const cópia = JSON.parse(JSON.stringify(original));

    computeRelief(original, 'strong');

    expect(original).toEqual(cópia);
  });

  it('devolve `null` sem segmentos utilizáveis', () => {
    expect(computeRelief(null, 'light')).toBeNull();
    expect(computeRelief([], 'light')).toBeNull();
    // Segmentos existem, mas sem volume nenhum a reduzir.
    expect(computeRelief([{ type: 'main', pace_min: 360 }], 'light')).toBeNull();
  });

  it('os níveis têm os alvos declarados', () => {
    expect(RELIEF_TARGET_PCT).toEqual({ light: 20, strong: 35 });
  });
});
