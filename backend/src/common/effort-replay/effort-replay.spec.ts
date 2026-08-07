import {
  buildEffortSteps,
  replaySteps,
  normalizePoints,
  ReplayPoint,
  MIN_MOVING_SPEED_MPS,
} from './effort-replay';
import {
  summarizeQualityEffort,
  deltaToPrescribedBand,
  MIN_QUALITY_DISTANCE_KM,
} from './quality-effort';

// ── PARIDADE COM O MOBILE ────────────────────────────────────────────────────
// A EXPANSÃO da timeline é compartilhada com o motor do aparelho, e a cópia só
// se justifica se produzir o mesmo resultado. Importamos o fonte do mobile
// direto — se alguém mexer num lado e esquecer do outro, este arquivo quebra.
//
// O import atravessa a fronteira do monorepo de propósito: `segmentEngine.ts`
// não tem dependência de runtime (só importa tipos), então nada de React Native
// entra no processo do Jest.
//
// O CURSOR, por outro lado, é deliberadamente diferente — ver `replaySteps`. O
// do device responde "em qual tiro o atleta está agora" e reancora na posição
// real; o daqui recorta o percurso pela prescrição, com fronteira interpolada.
// Forçá-los a ser iguais foi o que produziu a deriva que este arquivo trava.
import { buildSegSteps as mobileBuildSegSteps } from '../../../../mobile/src/utils/segmentEngine';
import { computeSmoothedPaceSeconds as mobileSmoothedPace } from '../../../../mobile/src/utils/livePace';

/**
 * Gera pontos GPS sintéticos num traçado reto para leste, num pace constante.
 * Um ponto a cada `stepM` metros — o `locationTask` filtra a ≥10 m, então 10 é o
 * espaçamento realista de campo.
 */
function straightLeg(
  start: { lat: number; lng: number; ts: number },
  distanceM: number,
  paceSecPerKm: number,
  stepM = 10,
): ReplayPoint[] {
  const points: ReplayPoint[] = [];
  const n = Math.max(1, Math.round(distanceM / stepM));
  for (let i = 1; i <= n; i++) {
    // A perna cobre EXATAMENTE `distanceM`: os pontos dividem a distância pedida
    // em n partes, em vez de andar `stepM` fixos e passar do alvo. Com o passo
    // fixo, uma perna de 196 m virava 200 m e o percurso deixava de casar com a
    // prescrição — ruído de fixture que se parece com deriva do algoritmo.
    const segM = (distanceM * i) / n;
    points.push({
      latitude: start.lat,
      longitude: start.lng + segM * degPerM,
      // ms exatos: `metros × (s/km)` já é milissegundos. Arredondar para o
      // segundo (como uma versão anterior fazia) injetava ~2 s/km de ruído de
      // fixture, que é a mesma ordem de grandeza da margem que move o VDOT.
      timestamp: start.ts + Math.round(segM * paceSecPerKm),
    });
  }
  return points;
}

/**
 * Metros por grau de longitude no equador, na MESMA esfera do haversine do
 * módulo (R = 6 371 000 m). Usar o valor WGS84 (111 320) faria cada trecho
 * sintético render ~0,1 % a menos que o nominal e as fronteiras de sub-etapa
 * derivariam — ruído de fixture disfarçado de erro de algoritmo.
 */
const M_PER_DEG = (6371000 * Math.PI) / 180;
const degPerM = 1 / M_PER_DEG;

function chain(
  legs: Array<{ distanceM: number; paceSecPerKm: number }>,
): ReplayPoint[] {
  const all: ReplayPoint[] = [
    { latitude: 0, longitude: 0, timestamp: 1_700_000_000_000 },
  ];
  for (const leg of legs) {
    const last = all[all.length - 1];
    all.push(
      ...straightLeg(
        { lat: last.latitude, lng: last.longitude, ts: last.timestamp },
        leg.distanceM,
        leg.paceSecPerKm,
      ),
    );
  }
  return all;
}

/** Intervalado estruturado: 1 km aquec. Z1 + 4×(500 m Z4 / 200 m trote Z1) + 1 km Z1. */
const intervalado = () => [
  { type: 'warmup', zone: 'Z1', distance_km: 1, pace_min: 440, pace_max: 480 },
  {
    type: 'repeat',
    reps: 4,
    zone: 'Z4',
    work: { distance_km: 0.5, pace_min: 340, pace_max: 356, zone: 'Z4' },
    recovery: { distance_km: 0.2, pace_min: 440, pace_max: 480, zone: 'Z1' },
  },
  {
    type: 'cooldown',
    zone: 'Z1',
    distance_km: 1,
    pace_min: 440,
    pace_max: 480,
  },
];

describe('effort-replay — paridade com o motor do mobile', () => {
  it('a timeline expandida é a MESMA do segmentEngine (kind, metric, target, pace)', () => {
    const blocks = intervalado();
    const mine = buildEffortSteps(blocks);
    const theirs = mobileBuildSegSteps(blocks as never);

    expect(mine).toHaveLength(theirs.length);
    // 1 aquec + 4×(work+recovery) + 1 volta = 10 sub-etapas.
    expect(mine).toHaveLength(10);

    mine.forEach((step, i) => {
      const ref = theirs[i];
      expect({
        index: step.index,
        blockIndex: step.blockIndex,
        kind: step.kind,
        metric: step.metric,
        target: step.target,
        paceMin: step.paceMin,
        paceMax: step.paceMax,
        repIndex: step.repIndex,
        repTotal: step.repTotal,
      }).toEqual({
        index: ref.index,
        blockIndex: ref.blockIndex,
        kind: ref.kind,
        metric: ref.metric,
        target: ref.target,
        paceMin: ref.paceMin,
        paceMax: ref.paceMax,
        repIndex: ref.repIndex,
        repTotal: ref.repTotal,
      });
    });
  });

  it('reps ausente vira 1 nos dois lados — a sessão descrita é a mesma', () => {
    const blocks = [
      {
        type: 'repeat',
        work: { distance_km: 1, pace_min: 300 },
        recovery: { distance_km: 0.2, pace_min: 400 },
      },
    ];
    expect(buildEffortSteps(blocks)).toHaveLength(
      mobileBuildSegSteps(blocks as never).length,
    );
  });

  /**
   * A REGRESSÃO QUE ESTE TESTE PRENDE.
   *
   * Até 2026-08-07 o replay usava o cursor do device: atribuía a amostra
   * INTEIRA ao bloco aberto e reancorava na posição real. Num intervalado com
   * trote por TEMPO, o erro compunha — os tiros saíam a 285, 295, 308, 328,
   * 349 e 400 s/km, tendo TODOS sido corridos a 275. Na última volta a janela
   * do tiro estava sobre o trote.
   *
   * O sinal errava na direção mais perigosa para a Fase 3: um atleta que
   * cumpriu o treino aparecia progressivamente mais lento.
   */
  it('NÃO deriva ao longo das repetições, nem com trote por tempo', () => {
    const blocks = [
      {
        type: 'warmup',
        zone: 'Z1',
        distance_km: 2,
        pace_min: 440,
        pace_max: 480,
      },
      {
        type: 'repeat',
        reps: 6,
        zone: 'Z4',
        work: { distance_km: 0.4, pace_min: 268, pace_max: 282, zone: 'Z4' },
        // Recuperação por TEMPO — o eixo misto que produzia a deriva.
        recovery: {
          duration_seconds: 90,
          pace_min: 440,
          pace_max: 480,
          zone: 'Z1',
        },
      },
      {
        type: 'cooldown',
        zone: 'Z1',
        distance_km: 2,
        pace_min: 440,
        pace_max: 480,
      },
    ];
    const TIRO = 275;
    const TROTE = 460;

    // 90 s de trote a 460 s/km cobrem 195,6 m — é assim que o percurso real
    // fica, e é o que o replay tem de reencontrar.
    const troteM = Math.round((90 / TROTE) * 1000);
    const points = chain([
      { distanceM: 2000, paceSecPerKm: TROTE },
      ...Array.from({ length: 6 }, () => [
        { distanceM: 400, paceSecPerKm: TIRO },
        { distanceM: troteM, paceSecPerKm: TROTE },
      ]).flat(),
      { distanceM: 2000, paceSecPerKm: TROTE },
    ]);

    const medidos = replaySteps(buildEffortSteps(blocks), points)
      .filter((s) => s.kind === 'work')
      .map((s) => s.actualPaceSecPerKm as number);

    expect(medidos).toHaveLength(6);

    // Cada tiro dentro de 3% do que foi corrido...
    for (const p of medidos) {
      expect(Math.abs(p - TIRO) / TIRO).toBeLessThan(0.03);
    }
    // ...e — o que importa — o ÚLTIMO tão preciso quanto o primeiro. É a
    // ausência de tendência que distingue ruído de deriva.
    const erroPrimeiro = Math.abs(medidos[0] - TIRO);
    const erroUltimo = Math.abs(medidos[5] - TIRO);
    expect(erroUltimo).toBeLessThanOrEqual(erroPrimeiro + 3);
  });

  it('o pace medido bate com o do livePace no mesmo trecho', () => {
    // Perna única em pace constante: as duas implementações têm de convergir.
    const points = chain([{ distanceM: 1000, paceSecPerKm: 348 }]);
    const steps = buildEffortSteps([
      {
        type: 'main',
        zone: 'Z4',
        distance_km: 1,
        pace_min: 340,
        pace_max: 356,
      },
    ]);
    const mine = replaySteps(steps, points)[0].actualPaceSecPerKm;
    const theirs = mobileSmoothedPace(points as never, {
      windowMeters: 1_000_000, // janela maior que a corrida = trecho inteiro
      maxWindowMs: 1_000_000_000,
    });

    expect(mine).not.toBeNull();
    expect(theirs).not.toBeNull();
    expect(Math.abs((mine as number) - (theirs as number))).toBeLessThanOrEqual(
      1,
    );
  });
});

/** Haversine local só para o teste dirigir o motor do mobile. */
function haversine(a: ReplayPoint, b: ReplayPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

describe('effort-replay — paradas e sujeira', () => {
  it('trecho parado sai do pace mas o relógio continua correndo', () => {
    const steps = buildEffortSteps([
      {
        type: 'main',
        zone: 'Z4',
        distance_km: 1,
        pace_min: 340,
        pace_max: 356,
      },
    ]);
    const moving = chain([{ distanceM: 1000, paceSecPerKm: 348 }]);
    // Insere 60 s parado no meio (mesma posição, tempo passando).
    const half = Math.floor(moving.length / 2);
    const paused: ReplayPoint[] = [
      ...moving.slice(0, half),
      {
        ...moving[half - 1],
        timestamp: moving[half - 1].timestamp + 60_000,
      },
      ...moving
        .slice(half)
        .map((p) => ({ ...p, timestamp: p.timestamp + 60_000 })),
    ];

    const semParada = replaySteps(steps, moving)[0].actualPaceSecPerKm;
    const comParada = replaySteps(steps, paused)[0].actualPaceSecPerKm;

    // O minuto parado NÃO pode aparecer no pace do tiro — é isso que impede um
    // semáforo de transformar um tiro bom em "atleta piorou".
    expect(
      Math.abs((comParada as number) - (semParada as number)),
    ).toBeLessThanOrEqual(2);
  });

  it('MIN_MOVING_SPEED_MPS é o mesmo limiar do livePace', () => {
    // Se divergir, backend e device discordam sobre o que é "parado".
    expect(MIN_MOVING_SPEED_MPS).toBe(0.6);
  });

  it('normalizePoints descarta lixo e ordena por tempo', () => {
    const points = normalizePoints([
      { latitude: 1, longitude: 1, timestamp: 300 },
      { latitude: 'x', longitude: 1, timestamp: 100 },
      { latitude: 1, longitude: 1 },
      null,
      { latitude: 1, longitude: 1, timestamp: 100 },
    ]);
    expect(points).toHaveLength(2);
    expect(points[0].timestamp).toBe(100);
  });
});

describe('quality-effort — o que vira sinal de VDOT', () => {
  const replayIntervalado = (workPace: number) => {
    const steps = buildEffortSteps(intervalado());
    const points = chain([
      { distanceM: 1000, paceSecPerKm: 460 },
      ...Array.from({ length: 4 }, () => [
        { distanceM: 500, paceSecPerKm: workPace },
        { distanceM: 200, paceSecPerKm: 460 },
      ]).flat(),
      { distanceM: 1000, paceSecPerKm: 460 },
    ]);
    return replaySteps(steps, points);
  };

  it('mede SÓ os tiros — aquecimento, trote e volta à calma ficam de fora', () => {
    const effort = summarizeQualityEffort(replayIntervalado(348));
    expect(effort).not.toBeNull();

    // 4×500 m = 2 km de qualidade prescrita, e o pace tem de ser o dos TIROS
    // (~348), não o do treino inteiro (~430 com aquecimento e trote).
    expect(effort!.prescribedKm).toBeCloseTo(2, 1);
    expect(effort!.zones).toEqual(['Z4']);

    // ── PRECISÃO REAL DA MEDIÇÃO ─────────────────────────────────────────────
    // 2 s/km. A fronteira é INTERPOLADA dentro da amostra que a cruza, então o
    // recorte não herda trote — o que sobra é só arredondamento. Enquanto o
    // replay atribuía a amostra inteira, isto era ~10 s/km e a deriva compunha
    // ao longo das repetições (ver o teste de não-deriva acima).
    expect(Math.abs(effort!.paceSecPerKm - 348)).toBeLessThanOrEqual(2);

    // E o que importa de verdade: está MUITO mais perto do tiro do que do
    // treino inteiro (~430 com aquecimento, trote e volta à calma).
    expect(Math.abs(effort!.paceSecPerKm - 348)).toBeLessThan(
      Math.abs(effort!.paceSecPerKm - 430),
    );
  });

  it('treino sem bloco de qualidade não vota', () => {
    const steps = buildEffortSteps([
      {
        type: 'main',
        zone: 'Z1',
        distance_km: 6,
        pace_min: 440,
        pace_max: 480,
      },
    ]);
    const points = chain([{ distanceM: 6000, paceSecPerKm: 450 }]);
    expect(summarizeQualityEffort(replaySteps(steps, points))).toBeNull();
  });

  it('strides curtos não votam — 100 m não resolve no GPS', () => {
    const steps = buildEffortSteps([
      {
        type: 'main',
        zone: 'Z1',
        distance_km: 5,
        pace_min: 440,
        pace_max: 480,
      },
      {
        type: 'repeat',
        reps: 4,
        zone: 'Z5',
        work: { distance_km: 0.1, pace_min: 300, pace_max: 320, zone: 'Z5' },
        recovery: {
          distance_km: 0.1,
          pace_min: 480,
          pace_max: 520,
          zone: 'Z1',
        },
      },
    ]);
    const points = chain([{ distanceM: 5800, paceSecPerKm: 430 }]);
    const effort = summarizeQualityEffort(replaySteps(steps, points));

    // 4×100 m = 0,4 km < MIN_QUALITY_DISTANCE_KM.
    expect(MIN_QUALITY_DISTANCE_KM).toBe(0.8);
    expect(effort).toBeNull();
  });

  it('GPS que cobriu pouco do prescrito não vota', () => {
    const steps = buildEffortSteps(intervalado());
    // Corrida interrompida logo no primeiro tiro.
    const points = chain([
      { distanceM: 1000, paceSecPerKm: 460 },
      { distanceM: 300, paceSecPerKm: 348 },
    ]);
    expect(summarizeQualityEffort(replaySteps(steps, points))).toBeNull();
  });

  it('delta é medido contra a FAIXA, não contra o centro', () => {
    const dentro = summarizeQualityEffort(replayIntervalado(348))!;
    expect(deltaToPrescribedBand(dentro)).toBe(0); // 348 ∈ [340, 356]

    const rapido = summarizeQualityEffort(replayIntervalado(320))!;
    expect(deltaToPrescribedBand(rapido)).toBeLessThan(0);

    const lento = summarizeQualityEffort(replayIntervalado(390))!;
    expect(deltaToPrescribedBand(lento)).toBeGreaterThan(0);
  });
});
