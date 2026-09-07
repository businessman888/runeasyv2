import {
  QualifyingActivity,
  buildDailyLoadSeries,
  computeLoadSignal,
} from './helpers/load-series.helper';
import {
  Baselines,
  buildBaselines,
} from './helpers/subjective-baseline.helper';
import { decideReadiness } from './helpers/readiness-score.helper';
import { addDaysStr } from '../training/helpers/plan-window.helper';

/**
 * A VALIDAÇÃO DA R.1 — o motor real sobre as 5 personas do seed de staging.
 *
 * Isto é a prova de que o motor deixou de ser ruído, e ela é executável em CI
 * em vez de depender de alguém rodar SQL e olhar. O calendário e o histórico
 * abaixo espelham `backend/supabase/seed_R1_readiness_staging.sql` (BLOCO 3 e
 * BLOCO 6); se o seed mudar, este arquivo muda junto.
 *
 * As cinco personas respondem EXATAMENTE a mesma coisa hoje — 4 em tudo. O que
 * as separa é só o histórico. É esse o ponto.
 */

const HOJE = '2026-09-06';
/** A série termina no último dia FECHADO. */
const FIM = addDaysStr(HOJE, -1);

const RESPOSTA_HOJE = {
  sleep: 4,
  legs: 4,
  mood: 4,
  stress: 4,
  motivation: 4,
};

type Sessao = { k: number; seg: number; tipo: string };

/** Espelha o BLOCO 3 do seed. `k` = dias atrás de hoje. */
function calendario(): Record<string, Sessao[]> {
  const out: Record<string, Sessao[]> = {
    novato: [],
    consistente: [],
    ferias: [],
    rampa: [],
    esparso: [],
  };
  for (let k = 1; k <= 60; k++) {
    const m = k % 7;
    if (k <= 42 && [0, 1, 3, 5].includes(m)) {
      out.consistente.push({
        k,
        seg: m === 0 ? 4500 : m === 3 ? 2100 : 2400,
        tipo: m === 0 ? 'long_run' : m === 3 ? 'tempo' : 'easy_run',
      });
    }
    if (k >= 27 && k <= 56 && [0, 1, 3, 5].includes(m)) {
      out.ferias.push({
        k,
        seg: m === 0 ? 5400 : m === 3 ? 2250 : 2700,
        tipo: m === 0 ? 'long_run' : m === 3 ? 'intervals' : 'easy_run',
      });
    }
    if ([1, 3, 5].includes(k)) {
      out.ferias.push({
        k,
        seg: k === 1 ? 5400 : 2700,
        tipo: k === 1 ? 'long_run' : 'easy_run',
      });
    }
    if (k >= 8 && k <= 35 && [0, 2, 4].includes(m)) {
      out.rampa.push({ k, seg: 1800, tipo: 'easy_run' });
    }
    if (k >= 1 && k <= 7 && k !== 6) {
      out.rampa.push({
        k,
        seg: k % 2 ? 4200 : 3600,
        tipo: k === 1 ? 'long_run' : k === 4 ? 'intervals' : 'easy_run',
      });
    }
    if ([2, 4, 6].includes(k)) {
      out.novato.push({ k, seg: 1200, tipo: 'easy_run' });
    }
    if ([2, 9, 17, 29, 38].includes(k)) {
      out.esparso.push({ k, seg: 2400, tipo: 'free_run' });
    }
  }
  return out;
}

/** Espelha o BLOCO 6 do seed: o histórico de check-ins de cada persona. */
function historico(persona: string): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  if (persona === 'consistente') {
    for (let k = 2; k <= 42; k += 2) {
      rows.push({
        sleep: 3 + ((k * 7) % 3) - 1,
        legs: 3 + ((k * 5) % 3) - 1,
        mood: 4 + ((k * 3) % 2) - 1,
        stress: 3 + ((k * 11) % 3) - 1,
        motivation: 4 + ((k * 13) % 2) - 1,
      });
    }
  } else if (persona === 'ferias') {
    for (let k = 28; k <= 56; k += 2) {
      rows.push({
        sleep: 5 - ((k * 7) % 2),
        legs: 5 - ((k * 5) % 2),
        mood: 5 - ((k * 3) % 2),
        stress: 4 + ((k * 11) % 2),
        motivation: 5 - ((k * 13) % 2),
      });
    }
  } else if (persona === 'rampa') {
    for (let k = 1; k <= 35; k += 3) {
      rows.push({
        sleep: 4 - ((k * 7) % 2),
        legs: 4 - ((k * 5) % 2),
        mood: 4,
        stress: 3 + ((k * 11) % 2),
        motivation: 4,
      });
    }
  } else if (persona === 'novato') {
    rows.push({ sleep: 4, legs: 3, mood: 4, stress: 3, motivation: 5 });
    rows.push({ sleep: 4, legs: 3, mood: 4, stress: 3, motivation: 5 });
  } else {
    for (let i = 0; i < 3; i++) {
      rows.push({ sleep: 3, legs: 4, mood: 3, stress: 2, motivation: 3 });
    }
  }
  return rows;
}

const cal = calendario();

/** O mesmo veredito, com a carga silenciada — para isolar o efeito dela. */
function decideSemCarga(persona: string) {
  const { load, baselines } = rodar(persona);
  return decideReadiness({
    answers: RESPOSTA_HOJE,
    baselines,
    load: { ...load, modulates: false, ratio: null },
  });
}

function rodar(persona: string) {
  const acts: QualifyingActivity[] = cal[persona].map((s) => ({
    id: `${persona}-${s.k}`,
    start_date: `${addDaysStr(HOJE, -s.k)}T13:00:00.000Z`,
    moving_time: s.seg,
    workoutType: s.tipo,
  }));

  const load = computeLoadSignal(buildDailyLoadSeries(acts, FIM));
  const baselines: Baselines = buildBaselines(historico(persona));
  const decision = decideReadiness({
    answers: RESPOSTA_HOJE,
    baselines,
    load,
  });
  return { load, baselines, decision };
}

describe('R.1 sobre o seed — o motor deixou de ser ruído', () => {
  it('novato: BLOQUEADO pelo piso, com progresso — a fórmula antiga dava ACWR 4,00', () => {
    // 3 corridas de 20 min em 6 dias. O ACWR acoplado devolvia exatamente 4.00
    // ("Risco Crítico de Lesão") porque crônico = agudo/4, por álgebra.
    const { load, decision } = rodar('novato');

    expect(load.reason).toBe('sem_historico');
    expect(load.ratio).toBeNull();
    expect(load.ratio).not.toBe(4);
    expect(load.floorProgress).not.toBeNull();
    expect(load.floorProgress.missingRunDays).toBeGreaterThan(0);
    expect(decision.loadDeltaApplied).toBe(0);
  });

  it('esparso: BLOQUEADO no piso — 5 corridas em 38 dias não viram "carga alta"', () => {
    // Com o piso de span puro ele passaria e produziria razão 1,62 sobre
    // 40 min por semana. É a condição dupla (span E dias com corrida) que o
    // barra no portão, antes de o piso de crônico precisar agir.
    const { load, decision } = rodar('esparso');

    expect(load.reason).toBe('sem_historico');
    expect(load.floorProgress.missingRunDays).toBe(1);
    expect(decision.loadDeltaApplied).toBe(0);
    expect(decision.score).toBe(decision.baseScore); // 100% quiz
  });

  it('consistente: em REGIME — razão perto de 1, carga só afina', () => {
    const { load, decision } = rodar('consistente');

    expect(load.reason).toBe('ok');
    expect(load.modulates).toBe(true);
    expect(load.ratio).toBeGreaterThan(0.8);
    expect(load.ratio).toBeLessThan(1.3);

    // ⚠️ Dá 1,13 (e não ~1,00) por uma propriedade do SEED, não do motor: esta
    // persona treina só nos últimos 42 dias de uma janela de 63, então o rabo
    // vazio deflaciona levemente a EWMA crônica lida em `fim−7`. Um corredor
    // real com 63+ dias de histórico não tem esse efeito.
    //
    // O que importa aqui é a MAGNITUDE: a carga afina o número em 2 pontos,
    // contra os 10 da rampa. Ela modula nas margens, não decide.
    expect(Math.abs(decision.loadDeltaRaw)).toBeLessThanOrEqual(2);
    expect(decision.color).toBe(decideSemCarga('consistente').color);
  });

  it('rampa: carga alta DE VERDADE', () => {
    const { load, decision } = rodar('rampa');

    expect(load.modulates).toBe(true);
    expect(load.ratio).toBeGreaterThan(1.5);
    expect(decision.loadDeltaRaw).toBe(-10);
  });

  it('ferias: carga alta MAS com os dias parados expostos para a narrativa', () => {
    // A razão sozinha não distingue este caso da rampa — medido, em qualquer λ.
    // O que muda o texto é `diasDesdeUltimaCorrida`, que é campo próprio.
    const { load } = rodar('ferias');

    expect(load.diasDesdeUltimaCorrida).not.toBeNull();
    // Ele voltou a treinar há poucos dias depois de uma pausa longa; o sinal da
    // pausa está no histórico, não no último dia.
    const { load: rampaLoad } = rodar('rampa');
    expect(load.chronicMinPerWeek).toBeLessThan(
      rampaLoad.chronicMinPerWeek * 3,
    );
  });

  it('NENHUMA persona recebe veredito sobre dado insuficiente', () => {
    for (const p of ['novato', 'esparso']) {
      const { load, decision } = rodar(p);
      expect(load.modulates).toBe(false);
      // A carga não fala, e o score é inteiramente do quiz.
      expect(decision.score).toBe(decision.baseScore);
    }
  });
});

describe('R.1 sobre o seed — A PROVA DO BASELINE', () => {
  it('consistente e ferias respondem o MESMO 4 e recebem sinais opostos', () => {
    const c = rodar('consistente');
    const f = rodar('ferias');

    // Os dois têm baseline maduro o bastante para o desvio pesar.
    expect(c.baselines.sleep.n).toBeGreaterThanOrEqual(10);
    expect(f.baselines.sleep.n).toBeGreaterThanOrEqual(10);

    // E vivem em lugares diferentes da escala.
    expect(c.baselines.sleep.median).toBeLessThan(f.baselines.sleep.median);

    // Mesma resposta hoje → quem vive embaixo pontua MAIS.
    expect(c.decision.baseScore).toBeGreaterThan(f.decision.baseScore);
  });

  it('sem o baseline, os dois teriam recebido exatamente o mesmo veredito', () => {
    const semBaseline: Baselines = {
      sleep: { n: 0, median: null },
      legs: { n: 0, median: null },
      mood: { n: 0, median: null },
      stress: { n: 0, median: null },
      motivation: { n: 0, median: null },
    };

    const c = decideReadiness({
      answers: RESPOSTA_HOJE,
      baselines: semBaseline,
      load: rodar('consistente').load,
    });
    const f = decideReadiness({
      answers: RESPOSTA_HOJE,
      baselines: semBaseline,
      load: rodar('ferias').load,
    });

    // É esta igualdade que o baseline existe para quebrar.
    expect(c.baseScore).toBe(f.baseScore);
    expect(c.baseScore).toBe(75);
  });
});
