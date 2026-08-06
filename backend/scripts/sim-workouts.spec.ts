import {
  assertNotProduction,
  buildSyntheticRun,
  buildSyntheticRoute,
  buildStructuredRoute,
  buildWeekContext,
  isWeekClosed,
  makeExternalId,
  makeRng,
  parseArgs,
  resolveEnv,
  resolveRpe,
  toStartedAt,
  PRODUCTION_SUPABASE_REF,
  ENVIRONMENTS,
} from './sim-workouts';
import {
  buildEffortSteps,
  replaySteps,
  normalizePoints,
  summarizeQualityEffort,
} from '../src/common/effort-replay';

/**
 * Harness de simulação de treinos.
 *
 * Só os helpers PUROS são testados aqui — o `main()` fala com um backend real e
 * não faz sentido mockar (mockar o transporte validaria o mock, não o contrato;
 * a fidelidade do script vem justamente de bater no endpoint de verdade).
 *
 * O que importa travar: a trava de produção (o script ESCREVE dado real) e a
 * consistência da corrida sintética (se pace e duração divergirem, a validação
 * da retrospectiva mede lixo).
 */

describe('assertNotProduction — trava de segurança', () => {
  const STAGING = {
    env: 'staging' as const,
    apiBaseUrl: 'https://runeasyv2-staging.up.railway.app',
    supabaseUrl: 'https://abcdefstaging.supabase.co',
    override: false,
  };

  it('libera staging', () => {
    expect(assertNotProduction(STAGING)).toEqual({ ok: true, reason: '' });
  });

  it('libera local', () => {
    const r = assertNotProduction({
      ...STAGING,
      env: 'local',
      apiBaseUrl: 'http://localhost:3000',
    });
    expect(r.ok).toBe(true);
  });

  it('bloqueia --env production', () => {
    const r = assertNotProduction({ ...STAGING, env: 'production' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('--env production');
  });

  it('bloqueia o Supabase de produção mesmo com --env staging', () => {
    // O caso perigoso de verdade: alguém roda --env staging mas o .env tem o
    // SUPABASE_URL de produção, e as escritas caem na base real.
    const r = assertNotProduction({
      ...STAGING,
      supabaseUrl: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(PRODUCTION_SUPABASE_REF);
  });

  it('bloqueia o backend de produção mesmo com --env staging', () => {
    const r = assertNotProduction({
      ...STAGING,
      apiBaseUrl: 'https://app.runeasy.com.br',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('app.runeasy.com.br');
  });

  it('acumula todos os motivos, não só o primeiro', () => {
    const r = assertNotProduction({
      env: 'production',
      apiBaseUrl: 'https://app.runeasy.com.br',
      supabaseUrl: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      override: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('--env production');
    expect(r.reason).toContain(PRODUCTION_SUPABASE_REF);
    expect(r.reason).toContain('app.runeasy.com.br');
  });

  it('o override explícito destrava — e é a ÚNICA forma', () => {
    const blocked = assertNotProduction({ ...STAGING, env: 'production' });
    expect(blocked.ok).toBe(false);

    const overridden = assertNotProduction({
      ...STAGING,
      env: 'production',
      override: true,
    });
    expect(overridden.ok).toBe(true);
  });

  it('o alvo de produção configurado bate com o real', () => {
    // Se o domínio de produção mudar sem atualizar a trava, ela vira decorativa.
    expect(ENVIRONMENTS.production.url).toContain('app.runeasy.com.br');
    expect(ENVIRONMENTS.staging.url).not.toContain('app.runeasy.com.br');
  });
});

describe('resolveEnv', () => {
  it('usa STAGING como default — o único alvo pretendido', () => {
    expect(resolveEnv(undefined)).toBe('staging');
    expect(resolveEnv(true)).toBe('staging');
  });

  it('aceita os três alvos, case-insensitive', () => {
    expect(resolveEnv('local')).toBe('local');
    expect(resolveEnv('STAGING')).toBe('staging');
    expect(resolveEnv('Production')).toBe('production');
  });
});

describe('buildSyntheticRun — consistência', () => {
  const rng = () => 0.5; // sem jitter: factor = 1

  it('duração = distância × pace, exatamente', () => {
    const run = buildSyntheticRun({
      distanceKm: 10,
      basePaceSecondsPerKm: 330,
      jitter: 0,
      rng,
    });
    expect(run.durationSeconds).toBe(3300);
    expect(run.derivedPaceSecondsPerKm).toBe(330);
    expect(run.distanceMeters).toBe(10000);
  });

  it('o pace derivado bate com o que o backend vai calcular', () => {
    // O payload NÃO manda pace — o backend faz duration/distance. Este teste
    // garante que o número do oráculo impresso é o mesmo que o banco terá.
    for (const distanceKm of [3, 5.5, 8, 12.3, 21.1]) {
      const run = buildSyntheticRun({
        distanceKm,
        basePaceSecondsPerKm: 300,
        jitter: 0,
        rng,
      });
      const backendWouldCompute = Math.round(
        run.durationSeconds / (run.distanceMeters / 1000),
      );
      expect(run.derivedPaceSecondsPerKm).toBe(backendWouldCompute);
    }
  });

  it('mantém o pace dentro do jitter pedido', () => {
    const r = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const run = buildSyntheticRun({
        distanceKm: 10,
        basePaceSecondsPerKm: 330,
        jitter: 0.05,
        rng: r,
      });
      expect(run.derivedPaceSecondsPerKm).toBeGreaterThanOrEqual(313); // 330×0.95
      expect(run.derivedPaceSecondsPerKm).toBeLessThanOrEqual(347); // 330×1.05
    }
  });

  it('produz pace fisiologicamente plausível na configuração default', () => {
    const r = makeRng(7);
    for (let i = 0; i < 50; i++) {
      const run = buildSyntheticRun({
        distanceKm: 5,
        basePaceSecondsPerKm: 330,
        jitter: 0.05,
        rng: r,
      });
      // Faixa humana ampla: 2:30/km a 12:00/km.
      expect(run.derivedPaceSecondsPerKm).toBeGreaterThan(150);
      expect(run.derivedPaceSecondsPerKm).toBeLessThan(720);
    }
  });

  it('aplica completion-ratio via distância — menos que o prescrito', () => {
    const prescribed = 10;
    const run = buildSyntheticRun({
      distanceKm: prescribed * 0.8,
      basePaceSecondsPerKm: 330,
      jitter: 0,
      rng,
    });
    expect(run.distanceKm).toBe(8);
  });
});

describe('makeRng — reprodutibilidade', () => {
  it('a mesma seed produz a mesma sequência', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('seeds diferentes divergem', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toBe(b());
  });

  it('fica em [0, 1)', () => {
    const r = makeRng(99);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('makeExternalId — idempotência', () => {
  it('é estável para o mesmo workout — re-rodar não duplica', () => {
    // O UPSERT em activities usa onConflict:'external_id'. Chave estável =
    // sobrescreve em vez de criar linha nova.
    expect(makeExternalId('plan', 'w-1')).toBe(makeExternalId('plan', 'w-1'));
  });

  it('separa plano de corrida livre', () => {
    expect(makeExternalId('plan', 'x')).not.toBe(makeExternalId('free', 'x'));
  });

  it('marca o dado como fabricado com o prefixo sim_', () => {
    expect(makeExternalId('plan', 'w-1')).toMatch(/^sim_/);
    expect(makeExternalId('free', 'w-1')).toMatch(/^sim_/);
  });
});

describe('toStartedAt — janela do plano', () => {
  it('ancora no fuso de São Paulo, não em UTC', () => {
    // A retrospectiva filtra activities por start_date dentro da janela. Um
    // horário sem offset seria interpretado como UTC e poderia cair no dia
    // anterior em São Paulo, saindo da janela.
    expect(toStartedAt('2026-06-15')).toBe('2026-06-15T07:00:00-03:00');
    expect(toStartedAt('2026-06-15', 18)).toBe('2026-06-15T18:00:00-03:00');
  });

  it('gera um ISO que o backend consegue parsear no dia certo', () => {
    const iso = toStartedAt('2026-06-15', 7);
    const d = new Date(iso);
    expect(d.toISOString()).toBe('2026-06-15T10:00:00.000Z'); // 07:00 SP = 10:00Z
  });
});

describe('resolveRpe', () => {
  const rng = () => 0.5;

  it('ausente → null (RPE é opcional)', () => {
    expect(resolveRpe(undefined, rng)).toBeNull();
    expect(resolveRpe(false, rng)).toBeNull();
  });

  it('flag booleana → aleatório dentro de 1..10', () => {
    const r = makeRng(5);
    for (let i = 0; i < 200; i++) {
      const v = resolveRpe(true, r)!;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('valor explícito → fixo', () => {
    expect(resolveRpe('7', rng)).toBe(7);
  });

  it('clampa fora da escala em vez de mandar valor que o DTO rejeita', () => {
    expect(resolveRpe('0', rng)).toBe(1);
    expect(resolveRpe('99', rng)).toBe(10);
  });
});

describe('buildSyntheticRoute', () => {
  it('gera pontos com timestamps cobrindo a duração', () => {
    const startedAtMs = Date.parse('2026-06-15T10:00:00Z');
    const pts = buildSyntheticRoute({
      distanceMeters: 5000,
      durationSeconds: 1650,
      startedAtMs,
      points: 10,
    });
    expect(pts).toHaveLength(10);
    expect(pts[0].timestamp).toBe(startedAtMs);
    expect(pts[9].timestamp).toBe(startedAtMs + 1650 * 1000);
  });

  it('o comprimento geográfico bate aproximadamente com a distância pedida', () => {
    const pts = buildSyntheticRoute({
      distanceMeters: 10000,
      durationSeconds: 3300,
      startedAtMs: 0,
      points: 50,
    });
    const degSpan = pts[pts.length - 1].latitude - pts[0].latitude;
    const meters = degSpan * 111_320;
    expect(meters).toBeGreaterThan(9900);
    expect(meters).toBeLessThan(10100);
  });
});

describe('parseArgs', () => {
  it('lê valores e flags booleanas', () => {
    const args = parseArgs([
      '--completions',
      '5',
      '--rpe',
      '--free-runs',
      '2',
      '--generate-retrospective',
    ]);
    expect(args.completions).toBe('5');
    expect(args.rpe).toBe(true);
    expect(args['free-runs']).toBe('2');
    expect(args['generate-retrospective']).toBe(true);
  });

  it('trata --rpe 8 como valor, não como flag', () => {
    expect(parseArgs(['--rpe', '8']).rpe).toBe('8');
  });

  it('lê --week e --generate-weekly-insight (Fase 2A)', () => {
    const args = parseArgs(['--week', '2', '--generate-weekly-insight']);
    expect(args.week).toBe('2');
    expect(args['generate-weekly-insight']).toBe(true);
  });
});

/**
 * Fase 2A — escopo por semana do plano.
 *
 * Espelha o que `derivePlanWeeks` faz no backend (MIN/MAX de `scheduled_date`
 * por `week_number`), para o oráculo prever a linha de `plan_week_insights`.
 */
describe('buildWeekContext', () => {
  const w = (
    week_number: number,
    scheduled_date: string,
    distance_km: number,
  ) => ({
    id: `w-${week_number}-${scheduled_date}`,
    scheduled_date,
    distance_km,
    status: 'pending' as const,
    type: 'easy_run',
    title: 'Rodagem Leve',
    week_number,
  });

  const PLAN = [
    w(1, '2026-06-01', 4),
    w(1, '2026-06-03', 5),
    w(2, '2026-06-08', 5),
    w(2, '2026-06-10', 6),
    w(2, '2026-06-12', 5),
    w(3, '2026-06-15', 7),
  ];

  it('deriva fronteiras e totais da semana pedida', () => {
    expect(buildWeekContext(PLAN, 2)).toEqual({
      startStr: '2026-06-08',
      endStr: '2026-06-12',
      plannedKm: 16,
      plannedCount: 3,
    });
  });

  it('não vaza treino de outra semana para o denominador', () => {
    const ctx = buildWeekContext(PLAN, 1);
    expect(ctx.plannedCount).toBe(2);
    expect(ctx.plannedKm).toBe(9);
  });

  it('ordena por data antes de tirar MIN/MAX', () => {
    const desordenado = [
      w(2, '2026-06-12', 5),
      w(2, '2026-06-08', 5),
      w(2, '2026-06-10', 6),
    ];
    const ctx = buildWeekContext(desordenado, 2);
    expect(ctx.startStr).toBe('2026-06-08');
    expect(ctx.endStr).toBe('2026-06-12');
  });

  it('isWeekClosed espelha isPlanFinished do backend', () => {
    const ctx = buildWeekContext(PLAN, 2); // termina em 2026-06-12

    // week_end é inclusivo: no próprio dia do último treino ainda corre.
    expect(isWeekClosed(ctx.endStr, '2026-06-12')).toBe(false);
    expect(isWeekClosed(ctx.endStr, '2026-06-13')).toBe(true);

    // O caso que motiva o aviso: plano recém-gerado começa hoje, então toda
    // semana está no futuro e nenhuma é elegível para insight.
    expect(isWeekClosed('2026-08-10', '2026-08-04')).toBe(false);
  });

  it('FALHA ALTO quando a semana não existe, listando as disponíveis', () => {
    // Silenciar aqui seria pior: concluiria zero treinos e imprimiria um
    // oráculo de zeros, parecendo bug do backend em vez de erro de invocação.
    expect(() => buildWeekContext(PLAN, 9)).toThrow(/--week 9 não existe/);
    expect(() => buildWeekContext(PLAN, 9)).toThrow(/1, 2, 3/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildStructuredRoute — a rota que a Fase 3 mede', () => {
  /** Intervalado estruturado: 1 km Z1 + 4×(500 m Z4 / 200 m Z1) + 1 km Z1. */
  const intervalado = () => [
    {
      type: 'warmup',
      zone: 'Z1',
      distance_km: 1,
      pace_min: 393,
      pace_max: 434,
    },
    {
      type: 'repeat',
      reps: 4,
      zone: 'Z4',
      work: { distance_km: 0.5, pace_min: 297, pace_max: 313, zone: 'Z4' },
      recovery: { distance_km: 0.2, pace_min: 393, pace_max: 434, zone: 'Z1' },
    },
    {
      type: 'cooldown',
      zone: 'Z1',
      distance_km: 1,
      pace_min: 393,
      pace_max: 434,
    },
  ];

  const START = new Date('2026-06-10T07:00:00-03:00').getTime();

  const build = (qualityRatio: number) =>
    buildStructuredRoute({
      instructionsJson: intervalado(),
      startedAtMs: START,
      qualityRatio,
    });

  /**
   * O teste-título: injetar um ratio conhecido e exigir que o REPLAY o meça de
   * volta.
   *
   * Fecha o ciclo que a fase inteira depende — gerador → endpoint → pontos
   * persistidos → replay → regra. Se o gerador e o replay discordarem sobre
   * onde um tiro começa e termina, este número sai errado e a validação no
   * harness estaria medindo o próprio harness.
   *
   * A tolerância é de 3% porque a fronteira de sub-etapa só pode cair num ponto
   * de GPS (~10 m): cada tiro herda até uma amostra de trote. É a mesma
   * precisão declarada em `effort-replay.spec.ts`.
   */
  it.each([
    [0.9, 'mais rápido que o alvo'],
    [1.0, 'em cima do alvo'],
    [1.1, 'mais lento que o alvo'],
  ])('ratio %s (%s) volta pelo replay', (ratio) => {
    const route = build(ratio);
    expect(route).not.toBeNull();

    const steps = buildEffortSteps(intervalado());
    const effort = summarizeQualityEffort(
      replaySteps(steps, normalizePoints(route!.points)),
    );

    expect(effort).not.toBeNull();
    const alvo = route!.targetQualityPace as number;
    const medido = effort!.paceSecPerKm / alvo;
    expect(medido).toBeCloseTo(ratio, 1);
    expect(Math.abs(medido - ratio)).toBeLessThan(0.03);
  });

  it('só os TIROS mudam — aquecimento e trote ficam no alvo', () => {
    const alvo = build(1.0)!;
    const rapido = build(0.85)!;

    // O treino inteiro encurta em tempo, mas a distância é a mesma: o ratio
    // mexe no ritmo do esforço, não no volume prescrito.
    expect(rapido.distanceMeters).toBe(alvo.distanceMeters);
    expect(rapido.durationSeconds).toBeLessThan(alvo.durationSeconds);

    // E encurta MENOS que 15%: só 2 dos 6 km são de qualidade.
    const reducao = 1 - rapido.durationSeconds / alvo.durationSeconds;
    expect(reducao).toBeGreaterThan(0);
    expect(reducao).toBeLessThan(0.15);
  });

  it('a densidade é de ~10 m, não 60 pontos fixos', () => {
    const route = build(1.0)!;

    // O treino tem 4,8 km (1 + 4×0,7 + 1), então ~480 pontos a cada 10 m.
    // Com os 60 fixos da rota uniforme, um tiro de 500 m teria 5 amostras e a
    // contaminação de fronteira viraria ~20% do bloco.
    expect(route.distanceMeters).toBe(4800);
    expect(route.points.length).toBeGreaterThan(450);
    expect(route.points.length).toBeLessThan(520);
    expect(route.qualitySteps).toBe(4);
  });

  it('agregados DERIVAM da rota — o pace gravado bate com o medido', () => {
    const route = build(1.0)!;
    const paceAgregado = route.durationSeconds / (route.distanceMeters / 1000);

    // Reconstrói o pace pelos próprios pontos, como o backend faria.
    const pts = route.points;
    const dtSec = (pts[pts.length - 1].timestamp - pts[0].timestamp) / 1000;
    expect(Math.abs(dtSec - route.durationSeconds)).toBeLessThanOrEqual(1);
    expect(paceAgregado).toBeGreaterThan(300); // média puxada pelo trote Z1
  });

  it('walk/run (pace_min 0) não gera rota — o chamador cai na uniforme', () => {
    expect(
      buildStructuredRoute({
        instructionsJson: [
          {
            type: 'repeat',
            reps: 6,
            zone: 'Z1',
            work: { duration_seconds: 90, pace_min: 0, pace_max: 0 },
            recovery: { duration_seconds: 150, pace_min: 0, pace_max: 0 },
          },
        ],
        startedAtMs: START,
        qualityRatio: 1,
      }),
    ).toBeNull();
  });

  it('treino contínuo sem qualidade gera rota, mas nada a medir', () => {
    const route = buildStructuredRoute({
      instructionsJson: [
        {
          type: 'main',
          zone: 'Z1',
          distance_km: 6,
          pace_min: 393,
          pace_max: 434,
        },
      ],
      startedAtMs: START,
      qualityRatio: 0.8,
    });

    expect(route).not.toBeNull();
    expect(route!.qualitySteps).toBe(0);
    // O ratio NÃO vaza para um easy: Z1 fica fora da reestimativa por decisão
    // de produto, e o gerador tem de respeitar a mesma fronteira.
    const paceMedio = route!.durationSeconds / (route!.distanceMeters / 1000);
    expect(paceMedio).toBeCloseTo((393 + 434) / 2, 0);
  });
});
