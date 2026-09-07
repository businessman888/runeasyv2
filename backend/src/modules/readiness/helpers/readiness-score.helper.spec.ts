import {
  DIMENSION_WEIGHTS,
  GREEN_MIN,
  LOAD_DELTA_MAX,
  ReadinessScoreInput,
  YELLOW_MIN,
  bandRange,
  colorFor,
  decideReadiness,
  loadDeltaFor,
  subAbs,
  subDev,
} from './readiness-score.helper';
import type { LoadSignal } from './load-series.helper';
import {
  BASELINE_FULL_N,
  BASELINE_MIN_N,
  Baselines,
  Dimension,
  READINESS_DIMENSIONS,
  buildBaselines,
  devWeight,
  median,
} from './subjective-baseline.helper';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SEM_CARGA: LoadSignal = {
  modulates: false,
  reason: 'sem_historico',
  acuteMinPerDay: 0,
  chronicMinPerDay: 0,
  chronicMinPerWeek: 0,
  ratio: null,
  diasDesdeUltimaCorrida: null,
  floorProgress: {
    spanDays: 3,
    runDays: 2,
    missingSpanDays: 11,
    missingRunDays: 4,
  },
};

const cargaCom = (ratio: number): LoadSignal => ({
  modulates: true,
  reason: 'ok',
  acuteMinPerDay: 30,
  chronicMinPerDay: 30 / ratio,
  chronicMinPerWeek: (30 / ratio) * 7,
  ratio,
  diasDesdeUltimaCorrida: 1,
  floorProgress: null,
});

const semBaseline: Baselines = {
  sleep: { n: 0, median: null },
  legs: { n: 0, median: null },
  mood: { n: 0, median: null },
  stress: { n: 0, median: null },
  motivation: { n: 0, median: null },
};

const baselineUniforme = (n: number, m: number): Baselines =>
  READINESS_DIMENSIONS.reduce((acc, d) => {
    acc[d] = { n, median: m };
    return acc;
  }, {} as Baselines);

const respostas = (v: number | Partial<Record<Dimension, number>>) =>
  typeof v === 'number'
    ? (READINESS_DIMENSIONS.reduce((a, d) => ({ ...a, [d]: v }), {}) as Record<
        Dimension,
        number
      >)
    : ({ sleep: 3, legs: 3, mood: 3, stress: 3, motivation: 3, ...v } as Record<
        Dimension,
        number
      >);

const decidir = (
  i: Partial<ReadinessScoreInput> & Pick<ReadinessScoreInput, 'answers'>,
) => decideReadiness({ baselines: semBaseline, load: SEM_CARGA, ...i });

// ── Pesos ────────────────────────────────────────────────────────────────────

describe('DIMENSION_WEIGHTS', () => {
  it('soma exatamente 1,00 — uma soma à deriva reescala a faixa inteira', () => {
    const soma = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(1, 10);
  });

  it('cobre as cinco dimensões e nada além', () => {
    expect(Object.keys(DIMENSION_WEIGHTS).sort()).toEqual(
      [...READINESS_DIMENSIONS].sort(),
    );
  });

  it('legs é o maior — é ele que carrega a dor', () => {
    for (const d of READINESS_DIMENSIONS) {
      if (d !== 'legs') {
        expect(DIMENSION_WEIGHTS.legs).toBeGreaterThan(DIMENSION_WEIGHTS[d]);
      }
    }
  });
});

// ── A regressão de produção ──────────────────────────────────────────────────

describe('A REGRESSÃO MEDIDA EM PRODUÇÃO', () => {
  it('sleep 4, legs 4, mood 4, stress 5, motivation 4 → 80 e VERDE (o LLM gravou 42 e red)', () => {
    // Duas linhas reais de `readiness_history` têm exatamente estas respostas
    // (média 4,2) gravadas com score=42, status_color='red'. Pela regra do
    // próprio prompt do modelo o resultado seria 84/verde. Ele errou a
    // aritmética que recebeu por escrito.
    const d = decidir({
      answers: { sleep: 4, legs: 4, mood: 4, stress: 5, motivation: 4 },
    });

    // 0,25·75 + 0,30·75 + 0,10·75 + 0,20·100 + 0,15·75 = 80
    expect(d.baseScore).toBe(80);
    expect(d.score).toBe(80);
    expect(d.color).toBe('green');
    expect(d.color).not.toBe('red');
    expect(d.score).not.toBe(42);
  });

  it('a segunda linha real (stress 2) também sai coerente', () => {
    const d = decidir({
      answers: { sleep: 4, legs: 4, mood: 5, stress: 2, motivation: 4 },
    });
    // 0,25·75 + 0,30·75 + 0,10·100 + 0,20·25 + 0,15·75 = 67,5 → 68 → amarelo
    expect(d.baseScore).toBe(68);
    expect(d.color).toBe('yellow');
  });
});

// ── Escala absoluta e desvio ─────────────────────────────────────────────────

describe('subAbs / subDev', () => {
  it('a escala absoluta é linear de 0 a 100', () => {
    expect([1, 2, 3, 4, 5].map(subAbs)).toEqual([0, 25, 50, 75, 100]);
  });

  it('o desvio NÃO é um no-op — recentra', () => {
    // Sem recentragem, subDev(v, m) === subAbs(v) para todo m. É a armadilha
    // que este arquivo existe para não cair.
    const iguais = [1, 2, 3, 4, 5].every((v) => subDev(v, 2) === subAbs(v));
    expect(iguais).toBe(false);
  });

  it('dorminhoco crônico (mediana 2) deixa de ser punido pelo próprio normal', () => {
    expect(subDev(2, 2)).toBeCloseTo(37.5, 10); // absoluto daria 25
    expect(subDev(3, 2)).toBeCloseTo(62.5, 10); // absoluto daria 50
    expect(subDev(1, 2)).toBeCloseTo(12.5, 10);
  });

  it('quem sempre responde 5 sente uma queda real ao responder 4', () => {
    expect(subDev(5, 5)).toBeCloseTo(75, 10); // absoluto daria 100
    expect(subDev(4, 5)).toBeCloseTo(50, 10); // absoluto daria 75
  });

  it('nunca sai da faixa 0-100', () => {
    for (let m = 1; m <= 5; m += 0.5) {
      for (let v = 1; v <= 5; v++) {
        expect(subDev(v, m)).toBeGreaterThanOrEqual(0);
        expect(subDev(v, m)).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ── A rampa do baseline ──────────────────────────────────────────────────────

describe('a migração absoluto → desvio', () => {
  it('em N = 10 exatamente o peso ainda é ZERO — degrau nenhum', () => {
    expect(devWeight(BASELINE_MIN_N - 1)).toBe(0);
    expect(devWeight(BASELINE_MIN_N)).toBe(0);
    expect(devWeight(BASELINE_FULL_N)).toBe(1);
  });

  it('score em N=9 e N=10 é IDÊNTICO', () => {
    const a = decidir({
      answers: respostas(5),
      baselines: baselineUniforme(9, 5),
    });
    const b = decidir({
      answers: respostas(5),
      baselines: baselineUniforme(10, 5),
    });
    expect(a.score).toBe(b.score);
  });

  it('a deriva por check-in é pequena e monótona — nunca um degrau', () => {
    // Pior caso possível: as cinco dimensões com mediana 5 migrando em bloco.
    // A deriva BRUTA por passo é exatamente 2,5 (25 pontos de deslocamento
    // máximo ÷ 10 passos da rampa, com os pesos somando 1); o arredondamento do
    // score público pode somar 1, daí o limite de 3.
    let anterior: number | null = null;
    for (let n = BASELINE_MIN_N; n <= BASELINE_FULL_N; n++) {
      const s = decideReadiness({
        answers: respostas(5),
        baselines: baselineUniforme(n, 5),
        load: SEM_CARGA,
      }).baseScore;
      if (anterior !== null) {
        expect(Math.abs(s - anterior)).toBeLessThanOrEqual(3);
        expect(s).toBeLessThanOrEqual(anterior); // monótona: só desce
      }
      anterior = s;
    }
    // E o total percorrido é o deslocamento inteiro, sem salto.
    const inicio = decideReadiness({
      answers: respostas(5),
      baselines: baselineUniforme(BASELINE_MIN_N, 5),
      load: SEM_CARGA,
    }).baseScore;
    const fim = decideReadiness({
      answers: respostas(5),
      baselines: baselineUniforme(BASELINE_FULL_N, 5),
      load: SEM_CARGA,
    }).baseScore;
    expect(inicio).toBe(100);
    expect(fim).toBe(75);
  });

  it('a migração é POR DIMENSÃO — sleep pode estar em desvio e legs em absoluto', () => {
    const b: Baselines = {
      ...semBaseline,
      sleep: { n: 25, median: 2 },
      legs: { n: 3, median: 5 },
    };
    const d = decidir({ answers: respostas(3), baselines: b });
    const sleep = d.signals.find((s) => s.dimension === 'sleep');
    const legs = d.signals.find((s) => s.dimension === 'legs');
    expect(sleep.mode).toBe('desvio');
    expect(legs.mode).toBe('absoluto');
  });

  it('mediana null (sem histórico) força absoluto mesmo com n alto', () => {
    const b: Baselines = { ...semBaseline, sleep: { n: 50, median: null } };
    const d = decidir({ answers: respostas(4), baselines: b });
    expect(d.signals.find((s) => s.dimension === 'sleep').mode).toBe(
      'absoluto',
    );
  });
});

// ── A PROVA DO BASELINE (o par do seed) ──────────────────────────────────────

describe('A PROVA: mesma resposta, sinais OPOSTOS', () => {
  const maduro = BASELINE_FULL_N;
  // `consistente` do seed vive em ~3; `ferias` vive em ~5.
  const consistente = (v: number) =>
    decidir({ answers: respostas(v), baselines: baselineUniforme(maduro, 3) });
  const ferias = (v: number) =>
    decidir({ answers: respostas(v), baselines: baselineUniforme(maduro, 5) });

  it('respondendo 4, quem vive em 3 pontua MAIS que quem vive em 5', () => {
    // A afirmação central: a MESMA resposta significa coisas opostas para os
    // dois. Se este teste falhar, o baseline não está fazendo nada.
    expect(consistente(4).baseScore).toBeGreaterThan(ferias(4).baseScore);
  });

  it('para cada um, 4 é lido em relação ao PRÓPRIO normal', () => {
    // Quem vive em 3 e responde 4 subiu.
    expect(consistente(4).baseScore).toBeGreaterThan(consistente(3).baseScore);
    // Quem vive em 5 e responde 4 caiu.
    expect(ferias(4).baseScore).toBeLessThan(ferias(5).baseScore);
  });

  it('a recentragem PUXA o extremo alto para baixo e o baixo para cima', () => {
    // Respondendo o próprio normal, os dois convergem para o meio sem se
    // encontrarem: a recentragem é parcial (α=0,5), não total.
    const noNormalConsistente = consistente(3).baseScore; // absoluto daria 50
    const noNormalFerias = ferias(5).baseScore; // absoluto daria 100

    expect(noNormalFerias).toBeLessThan(100);
    expect(noNormalFerias).toBeGreaterThan(50); // NÃO fica preso no meio
    expect(noNormalConsistente).toBe(50); // mediana 3 é o centro: sem deslocamento
  });

  it('quem vive em 2 deixa de ser punido por uma linha de base que não controla', () => {
    const dorminhoco = (v: number) =>
      decidir({
        answers: respostas(v),
        baselines: baselineUniforme(maduro, 2),
      });
    const absoluto = (v: number) => decidir({ answers: respostas(v) });

    expect(dorminhoco(2).baseScore).toBeGreaterThan(absoluto(2).baseScore);
    expect(dorminhoco(3).baseScore).toBeGreaterThan(absoluto(3).baseScore);
  });
});

// ── Cor e clamp ──────────────────────────────────────────────────────────────

describe('colorFor / bandRange', () => {
  it('as fronteiras são 70 e 40', () => {
    expect(colorFor(70)).toBe('green');
    expect(colorFor(69)).toBe('yellow');
    expect(colorFor(40)).toBe('yellow');
    expect(colorFor(39)).toBe('red');
    expect(GREEN_MIN).toBe(70);
    expect(YELLOW_MIN).toBe(40);
  });

  it('bandRange cobre 0-100 sem buraco e sem sobreposição', () => {
    for (let s = 0; s <= 100; s++) {
      const [lo, hi] = bandRange(colorFor(s));
      expect(s).toBeGreaterThanOrEqual(lo);
      expect(s).toBeLessThanOrEqual(hi);
    }
  });
});

describe('A INVARIANTE: a carga NUNCA muda a cor', () => {
  it('exaustivo sobre base 0-100 × delta −10..+10', () => {
    for (let base = 0; base <= 100; base++) {
      const corDoQuiz = colorFor(base);
      const [piso, teto] = bandRange(corDoQuiz);
      for (let raw = -LOAD_DELTA_MAX; raw <= LOAD_DELTA_MAX; raw++) {
        const final = Math.max(piso, Math.min(teto, base + raw));
        expect(colorFor(final)).toBe(corDoQuiz);
      }
    }
  });

  it('na prática, pelo decideReadiness', () => {
    for (const ratio of [0.5, 0.9, 1.2, 1.4, 1.8]) {
      for (const v of [1, 2, 3, 4, 5]) {
        const d = decidir({ answers: respostas(v), load: cargaCom(ratio) });
        expect(colorFor(d.score)).toBe(d.color);
        expect(d.color).toBe(colorFor(d.baseScore));
      }
    }
  });

  it('a borda pode ANIQUILAR o delta, e o resultado diz isso', () => {
    // base 70 (verde, no piso da faixa) com carga alta: o delta de −10 não pode
    // ser aplicado. O narrador precisa saber que não houve efeito.
    // 0,30·75 + 0,25·75 + 0,20·75 + 0,15·75 + 0,10·25 = 70 exatos.
    const d = decideReadiness({
      answers: { sleep: 4, legs: 4, mood: 2, stress: 4, motivation: 4 },
      baselines: semBaseline,
      load: cargaCom(1.62),
    });
    expect(d.baseScore).toBe(70);
    expect(d.loadDeltaRaw).toBe(-10);
    expect(d.loadDeltaApplied).toBe(0);
    expect(d.clampedByBand).toBe(true);
    expect(d.score).toBe(70);
    expect(d.color).toBe('green');
  });

  it('longe da borda o delta aplica inteiro', () => {
    const d = decideReadiness({
      answers: respostas(5),
      baselines: semBaseline,
      load: cargaCom(1.62),
    });
    expect(d.baseScore).toBe(100);
    expect(d.loadDeltaRaw).toBe(-10);
    expect(d.loadDeltaApplied).toBe(-10);
    expect(d.clampedByBand).toBe(false);
    expect(d.score).toBe(90);
  });
});

describe('loadDeltaFor — a escada', () => {
  it('mapeia as faixas', () => {
    expect(loadDeltaFor(cargaCom(1.6))).toBe(-10);
    expect(loadDeltaFor(cargaCom(1.35))).toBe(-6);
    expect(loadDeltaFor(cargaCom(1.15))).toBe(-2);
    expect(loadDeltaFor(cargaCom(0.95))).toBe(4);
  });

  it('razão baixa NÃO ganha bônus — pode ser polimento ou férias', () => {
    expect(loadDeltaFor(cargaCom(0.5))).toBe(0);
  });

  it('carga que não modula sempre dá 0', () => {
    expect(loadDeltaFor(SEM_CARGA)).toBe(0);
    expect(loadDeltaFor({ ...cargaCom(1.9), modulates: false })).toBe(0);
    expect(loadDeltaFor({ ...cargaCom(1.9), ratio: null })).toBe(0);
  });

  it('abaixo do piso, o score é 100% quiz', () => {
    const comCarga = decidir({ answers: respostas(4), load: cargaCom(1.6) });
    const semCarga = decidir({ answers: respostas(4), load: SEM_CARGA });
    expect(semCarga.score).toBe(semCarga.baseScore);
    expect(comCarga.score).toBeLessThan(semCarga.score);
  });
});

// ── planAdjustment ───────────────────────────────────────────────────────────

describe('planAdjustment', () => {
  it('dia de prova é intocável, mesmo no vermelho', () => {
    const d = decidir({ answers: respostas(1), todayIsRaceDay: true });
    expect(d.color).toBe('red');
    expect(d.planAdjustment).toBe('manter');
  });

  it('vermelho vira dia off', () => {
    expect(decidir({ answers: respostas(1) }).planAdjustment).toBe('dia_off');
  });

  it('amarelo + treino de QUALIDADE vira redução de intensidade', () => {
    for (const tipo of [
      'intervals',
      'tempo',
      'repetition',
      'fartlek',
      'progressive',
    ]) {
      const d = decidir({ answers: respostas(3), todayWorkoutType: tipo });
      expect(d.color).toBe('yellow');
      expect(d.planAdjustment).toBe('reduzir_intensidade');
    }
  });

  it('a dívida da R.0: `repetition` não cai mais no default', () => {
    // O mapa privado de intensidade não conhecia `repetition` nem
    // `race_simulation`; os dois caíam em 'Moderada' e desligavam a regra.
    const d = decidir({
      answers: respostas(3),
      todayWorkoutType: 'repetition',
    });
    expect(d.planAdjustment).toBe('reduzir_intensidade');
  });

  it('amarelo + rodagem leve NÃO reduz intensidade', () => {
    const d = decidir({ answers: respostas(3), todayWorkoutType: 'easy_run' });
    expect(d.planAdjustment).not.toBe('reduzir_intensidade');
  });

  it('pernas muito ruins pedem descanso ativo mesmo no verde', () => {
    const d = decidir({
      answers: { sleep: 5, legs: 1, mood: 5, stress: 5, motivation: 5 },
      todayWorkoutType: 'easy_run',
    });
    expect(d.color).toBe('green');
    expect(d.planAdjustment).toBe('descanso_ativo');
  });

  it('carga alta com quiz bom pede redução de volume', () => {
    const d = decidir({
      answers: respostas(5),
      todayWorkoutType: 'easy_run',
      load: cargaCom(1.4),
    });
    expect(d.planAdjustment).toBe('reduzir_volume');
  });

  it('tudo bem → manter', () => {
    const d = decidir({
      answers: respostas(5),
      todayWorkoutType: 'easy_run',
      load: cargaCom(1.0),
    });
    expect(d.planAdjustment).toBe('manter');
  });
});

// ── Saída ────────────────────────────────────────────────────────────────────

describe('a forma do resultado', () => {
  it('devolve as 5 dimensões ordenadas por déficit', () => {
    const d = decidir({
      answers: { sleep: 1, legs: 5, mood: 5, stress: 5, motivation: 5 },
    });
    expect(d.signals).toHaveLength(5);
    expect(d.signals[0].dimension).toBe('sleep');
    for (let i = 1; i < d.signals.length; i++) {
      expect(d.signals[i - 1].deficit).toBeGreaterThanOrEqual(
        d.signals[i].deficit,
      );
    }
  });

  it('score é inteiro e cabe em 0-100 em qualquer combinação', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      for (const ratio of [0.5, 1.0, 1.6]) {
        const d = decidir({ answers: respostas(v), load: cargaCom(ratio) });
        expect(Number.isInteger(d.score)).toBe(true);
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('resposta inválida cai para o meio da escala em vez de virar NaN', () => {
    const d = decidir({
      answers: {
        sleep: 0,
        legs: 9,
        mood: NaN,
        stress: 3,
        motivation: 4,
      } as never,
    });
    expect(Number.isFinite(d.score)).toBe(true);
    expect(d.signals.find((s) => s.dimension === 'sleep').answer).toBe(3);
  });

  it('é determinístico: mesma entrada, mesma saída', () => {
    const i = {
      answers: respostas({ sleep: 2, legs: 4 }),
      baselines: baselineUniforme(15, 3),
      load: cargaCom(1.25),
    };
    expect(decideReadiness(i)).toEqual(decideReadiness(i));
  });
});

// ── O helper de baseline ─────────────────────────────────────────────────────

describe('buildBaselines', () => {
  it('mediana ímpar e par', () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([1, 2, 4, 5])).toBe(3);
    expect(median([])).toBeNull();
  });

  it('descarta jsonb malformado POR DIMENSÃO, sem lançar', () => {
    const b = buildBaselines([
      { sleep: 4, legs: 3, mood: 4, stress: 3, motivation: 4 },
      { sleep: '4', legs: 5 } as never, // sleep string → descartado; legs vale
      { legs: 0, sleep: 2 }, // legs fora da faixa → descartado
      { legs: 6 }, // idem
      null,
      undefined,
      {} as never,
    ]);
    expect(b.sleep.n).toBe(2); // 4 e 2
    expect(b.legs.n).toBe(2); // 3 e 5
    expect(b.mood.n).toBe(1);
  });

  it('ignora chave desconhecida — a 6ª pergunta um dia chega', () => {
    const b = buildBaselines([
      {
        sleep: 4,
        legs: 4,
        mood: 4,
        stress: 4,
        motivation: 4,
        pain: 2,
      } as never,
    ]);
    expect(Object.keys(b).sort()).toEqual([...READINESS_DIMENSIONS].sort());
    expect(b.sleep.n).toBe(1);
  });

  it('histórico vazio devolve n=0 e mediana null em todas', () => {
    const b = buildBaselines([]);
    for (const d of READINESS_DIMENSIONS) {
      expect(b[d]).toEqual({ n: 0, median: null });
    }
  });
});
