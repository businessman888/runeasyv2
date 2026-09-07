import {
  ABS_CHRONIC_FLOOR_MIN_PER_WEEK,
  FLOOR_MIN_RUN_DAYS,
  FLOOR_MIN_SPAN_DAYS,
  LAMBDA_CHRONIC,
  LOAD_WINDOW_DAYS,
  MIN_QUALIFYING_MOVING_SEC,
  QualifyingActivity,
  buildDailyLoadSeries,
  computeLoadSignal,
  ewmaSeries,
  qualifies,
  trailingMean,
} from './load-series.helper';
import { addDaysStr } from '../../training/helpers/plan-window.helper';

const HOJE = '2026-03-31';

/** Atividade às 10:00 SP (13:00Z) de `diasAtras` dias atrás. */
function corrida(
  diasAtras: number,
  minutos: number,
  workoutType: string | null = 'easy_run',
): QualifyingActivity {
  return {
    id: `a-${diasAtras}-${minutos}`,
    start_date: `${addDaysStr(HOJE, -diasAtras)}T13:00:00.000Z`,
    moving_time: minutos * 60,
    workoutType,
  };
}

const serieDe = (as: QualifyingActivity[]) => buildDailyLoadSeries(as, HOJE);
const sinalDe = (as: QualifyingActivity[]) => computeLoadSignal(serieDe(as));

/** Dias entre duas datas 'YYYY-MM-DD'. */
function diasEntre(de: string, ate: string): number {
  const [y1, m1, d1] = de.split('-').map((n) => Number(n));
  const [y2, m2, d2] = ate.split('-').map((n) => Number(n));
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000,
  );
}

/** N corridas de `minutos`, uma a cada `passo` dias, de `de` até `ate` atrás. */
function rotina(
  de: number,
  ate: number,
  passo: number,
  minutos: number,
  tipo = 'easy_run',
) {
  const out: QualifyingActivity[] = [];
  for (let k = de; k >= ate; k -= passo) out.push(corrida(k, minutos, tipo));
  return out;
}

/**
 * Rotina SEMANAL — corre nos dias da semana indicados, ancorada no calendário.
 *
 * É a forma que um plano real tem, e a distinção importa para a janela de 7
 * dias: sobre um ciclo semanal ela contém sempre o mesmo número de corridas,
 * enquanto sobre uma cadência de 2 em 2 dias contém ora 3 ora 4 — 33% de
 * variação que é propriedade da janela, não do corredor.
 */
function rotinaSemanal(
  diasDaSemana: number[],
  minutos: number,
  ateDiasAtras = 0,
  deDiasAtras = 62,
) {
  const out: QualifyingActivity[] = [];
  for (let k = deDiasAtras; k >= ateDiasAtras; k--) {
    const dia = addDaysStr(HOJE, -k);
    if (diasDaSemana.includes(Math.abs(diasEntre('2020-01-01', dia)) % 7)) {
      out.push(corrida(k, minutos));
    }
  }
  return out;
}

describe('qualifies — o piso de duração', () => {
  it('299 s não conta; 300 s conta', () => {
    expect(qualifies({ ...corrida(1, 5), moving_time: 299 })).toBe(false);
    expect(qualifies({ ...corrida(1, 5), moving_time: 300 })).toBe(true);
    expect(MIN_QUALIFYING_MOVING_SEC).toBe(300);
  });

  it('null, NaN e negativo não contam', () => {
    expect(qualifies({ ...corrida(1, 5), moving_time: null })).toBe(false);
    expect(qualifies({ ...corrida(1, 5), moving_time: NaN })).toBe(false);
    expect(qualifies({ ...corrida(1, 5), moving_time: -600 })).toBe(false);
  });
});

describe('buildDailyLoadSeries', () => {
  it('faz zero-fill: a série tem um balde por dia da janela', () => {
    const s = serieDe([corrida(1, 30)]);
    expect(s).toHaveLength(LOAD_WINDOW_DAYS);
    expect(s[s.length - 1].dateStr).toBe(HOJE);
    expect(s.filter((d) => d.runs > 0)).toHaveLength(1);
    expect(s.filter((d) => d.loadMin === 0)).toHaveLength(LOAD_WINDOW_DAYS - 1);
  });

  it('1 corrida na semana NÃO é o mesmo que 7 — é para isto que o zero-fill existe', () => {
    const uma = computeLoadSignal(serieDe(rotina(60, 1, 7, 30)));
    const sete = computeLoadSignal(serieDe(rotina(60, 1, 1, 30)));
    expect(sete.acuteMinPerDay).toBeGreaterThan(uma.acuteMinPerDay * 3);
  });

  it('pondera pelo tipo do treino', () => {
    const leve = serieDe([corrida(1, 60, 'easy_run')]);
    const tiro = serieDe([corrida(1, 60, 'intervals')]);
    const rep = serieDe([corrida(1, 60, 'repetition')]);
    const prova = serieDe([corrida(1, 60, 'race_simulation')]);

    expect(leve[leve.length - 2].loadMin).toBe(60);
    expect(tiro[tiro.length - 2].loadMin).toBeCloseTo(96, 5); // 60 × 1,6
    expect(rep[rep.length - 2].loadMin).toBeCloseTo(102, 5); // 60 × 1,7 — dívida da R.0
    expect(prova[prova.length - 2].loadMin).toBeCloseTo(90, 5); // 60 × 1,5 — idem
  });

  it('tipo desconhecido ou ausente pesa como rodagem leve', () => {
    const s = serieDe([corrida(1, 60, null), corrida(2, 60, 'tipo_inventado')]);
    expect(s[s.length - 2].loadMin).toBe(60);
    expect(s[s.length - 3].loadMin).toBe(60);
  });

  it('o balde é o dia de SÃO PAULO, não o dia UTC', () => {
    // 01:00Z do dia 31 = 22:00 SP do dia 30.
    const s = buildDailyLoadSeries(
      [
        {
          id: 'x',
          start_date: '2026-03-31T01:00:00.000Z',
          moving_time: 1800,
          workoutType: 'easy_run',
        },
      ],
      HOJE,
    );
    expect(s[s.length - 1].runs).toBe(0); // dia 31
    expect(s[s.length - 2].runs).toBe(1); // dia 30
  });

  it('ignora atividade fora da janela em vez de "salvar" no balde errado', () => {
    const s = serieDe([corrida(LOAD_WINDOW_DAYS + 10, 60)]);
    expect(s.every((d) => d.runs === 0)).toBe(true);
  });

  it('soma duas corridas no mesmo dia', () => {
    const s = serieDe([corrida(1, 30), corrida(1, 20)]);
    expect(s[s.length - 2].runs).toBe(2);
    expect(s[s.length - 2].loadMin).toBe(50);
  });

  it('blips de GPS não entram na série NEM contam como dia com corrida', () => {
    // As duas coisas separadamente — é fácil consertar uma e esquecer a outra.
    const s = buildDailyLoadSeries(
      [
        {
          id: 'b',
          start_date: `${addDaysStr(HOJE, -1)}T13:00:00Z`,
          moving_time: 15,
          workoutType: 'free_run',
        },
      ],
      HOJE,
    );
    expect(s[s.length - 2].loadMin).toBe(0);
    expect(s[s.length - 2].runs).toBe(0);
  });
});

describe('ewmaSeries / trailingMean', () => {
  it('lambda do crônico confere com a meia-vida declarada', () => {
    expect(LAMBDA_CHRONIC).toBeCloseTo(2 / 29, 10);
  });

  it('trailingMean divide pela JANELA, não pelo que existe nela', () => {
    // Dividir por `janela.length` transformaria "corri 1 dia dos 7" em
    // "corri todo dia", que é o mesmo defeito que o zero-fill fecha.
    expect(trailingMean([0, 0, 0, 0, 0, 0, 70], 7)).toBe(10);
    expect(trailingMean([70], 7)).toBe(10);
    expect(trailingMean([], 7)).toBe(0);
  });

  it('semeia em zero e converge para o valor constante', () => {
    expect(ewmaSeries([10], 0.25)).toEqual([2.5]);
    const longo = ewmaSeries(Array(200).fill(10), 0.25);
    expect(longo[longo.length - 1]).toBeCloseTo(10, 5);
  });

  it('devolve a série inteira — o crônico precisa ler num índice anterior', () => {
    expect(ewmaSeries([1, 2, 3], 0.5)).toHaveLength(3);
  });
});

describe('computeLoadSignal — a regressão do teto 4.00', () => {
  it('corredor cujo histórico inteiro cabe na janela aguda NÃO recebe 4.00', () => {
    // O caso exato medido em produção: corridas só nos últimos 7 dias.
    // Fórmula antiga: crônico = agudo/4 → ACWR 4,00 → "Risco Crítico de Lesão".
    const s = sinalDe(rotina(6, 1, 2, 20));

    expect(s.ratio).toBeNull();
    expect(s.ratio).not.toBe(4);
    expect(s.modulates).toBe(false);
    expect(s.reason).toBe('sem_historico');
  });

  it('e devolve o progresso do piso em vez de um veredito', () => {
    const s = sinalDe(rotina(6, 1, 2, 20)); // corridas em D-6, D-4, D-2
    expect(s.floorProgress).toEqual({
      spanDays: 7, // de D-6 até o fim da série, inclusivo
      runDays: 3,
      missingSpanDays: 7,
      missingRunDays: 3,
    });
  });

  it('nunca fabrica 1.0 quando não há base — o `|| 1.0` do código antigo', () => {
    expect(sinalDe([]).ratio).toBeNull();
    expect(sinalDe([]).modulates).toBe(false);
  });
});

describe('computeLoadSignal — o piso de histórico', () => {
  it('span 13 dias reprova, 14 aprova (com dias de corrida suficientes)', () => {
    const treze = sinalDe(rotina(12, 0, 2, 40)); // span 13
    const catorze = sinalDe(rotina(13, 0, 2, 40)); // span 14
    expect(treze.reason).toBe('sem_historico');
    expect(catorze.reason).not.toBe('sem_historico');
    expect(FLOOR_MIN_SPAN_DAYS).toBe(14);
  });

  it('5 dias com corrida reprova, 6 aprova (com span suficiente)', () => {
    const cinco = sinalDe([0, 5, 10, 15, 20].map((k) => corrida(k, 60)));
    const seis = sinalDe([0, 5, 10, 15, 20, 25].map((k) => corrida(k, 60)));
    expect(cinco.reason).toBe('sem_historico');
    expect(cinco.floorProgress?.missingRunDays).toBe(1);
    expect(seis.reason).not.toBe('sem_historico');
    expect(FLOOR_MIN_RUN_DAYS).toBe(6);
  });

  it('duas corridas no MESMO dia contam como um dia só', () => {
    const as = [0, 5, 10, 15, 20].flatMap((k) => [
      corrida(k, 60),
      corrida(k, 60),
    ]);
    expect(sinalDe(as).floorProgress?.runDays).toBe(5);
  });
});

describe('computeLoadSignal — o piso absoluto de crônico', () => {
  it('crônico abaixo de 60 min/semana silencia a carga', () => {
    // 5 corridas curtas espalhadas em 38 dias — o `esparso` do seed.
    const s = sinalDe([2, 9, 17, 29, 38, 45].map((k) => corrida(k, 12)));
    expect(s.chronicMinPerWeek).toBeLessThan(ABS_CHRONIC_FLOOR_MIN_PER_WEEK);
    expect(s.modulates).toBe(false);
    expect(s.reason).toBe('carga_irrelevante');
    expect(s.ratio).toBeNull();
  });

  it('acima do piso a carga volta a falar', () => {
    const s = sinalDe(rotina(60, 0, 2, 45));
    expect(s.chronicMinPerWeek).toBeGreaterThan(ABS_CHRONIC_FLOOR_MIN_PER_WEEK);
    expect(s.modulates).toBe(true);
    expect(s.reason).toBe('ok');
    expect(s.ratio).not.toBeNull();
  });
});

describe('computeLoadSignal — o desacoplamento', () => {
  it('em regime (rotina semanal), a razão fica perto de 1', () => {
    const s = sinalDe(rotinaSemanal([0, 2, 4, 6], 45));
    expect(s.ratio).toBeGreaterThan(0.9);
    expect(s.ratio).toBeLessThan(1.1);
  });

  /**
   * A TRAVA ANTI-RUÍDO DE FASE — a razão de o agudo ser média plana.
   *
   * Com EWMA no numerador (λ=0,25), o MESMO corredor em regime perfeito recebia
   * razões de 0,864 a 1,207 conforme o último dia fechado fosse ou não dia de
   * treino — cruzando o limiar de 1,10 da escada e alternando entre −2 e +4.
   * Seis pontos de score decididos pelo calendário, não pelo corredor.
   *
   * Este teste varre 14 dias consecutivos de leitura de uma rotina IMUTÁVEL e
   * exige que todos caiam no mesmo balde. Ele falha se alguém trocar o agudo
   * de volta para EWMA.
   */
  it('leitura em regime não muda de balde conforme o dia da semana', () => {
    const balde = (r: number) =>
      r >= 1.5 ? -10 : r >= 1.3 ? -6 : r >= 1.1 ? -2 : r >= 0.8 ? 4 : 0;

    const baldes = new Set<number>();
    const razoes: number[] = [];

    for (let desloc = 0; desloc < 14; desloc++) {
      const fim = addDaysStr(HOJE, -desloc);
      // Rotina fixa 4x/semana ancorada no calendário, independente de `fim`.
      const as: QualifyingActivity[] = [];
      for (let k = 0; k <= 62; k++) {
        const dia = addDaysStr(fim, -k);
        const idx = Math.abs(diasEntre('2020-01-01', dia)) % 7;
        if ([0, 2, 4, 6].includes(idx)) {
          as.push({
            id: `r-${desloc}-${k}`,
            start_date: `${dia}T13:00:00.000Z`,
            moving_time: 45 * 60,
            workoutType: 'easy_run',
          });
        }
      }
      const s = computeLoadSignal(buildDailyLoadSeries(as, fim));
      expect(s.ratio).not.toBeNull();
      razoes.push(s.ratio);
      baldes.add(balde(s.ratio));
    }

    const amplitude = Math.max(...razoes) - Math.min(...razoes);
    expect(amplitude).toBeLessThan(0.2); // com EWMA no agudo era 0,343
    expect([...baldes]).toHaveLength(1);
  });

  it('rampa genuína produz razão claramente alta', () => {
    const base = rotina(62, 8, 2, 25);
    const pico = rotina(6, 1, 1, 70);
    const s = sinalDe([...base, ...pico]);
    expect(s.modulates).toBe(true);
    expect(s.ratio).toBeGreaterThan(1.5);
  });

  it('o crônico NÃO contém a janela aguda', () => {
    // Só existe carga nos últimos 7 dias sobre uma base antiga estável.
    // Se o crônico incluísse o agudo, aumentar SÓ a semana recente moveria os
    // dois lados da fração e a razão subiria menos do que deve.
    const base = rotina(62, 8, 2, 30);
    const semPico = sinalDe(base);
    const comPico = sinalDe([...base, ...rotina(6, 1, 1, 90)]);
    expect(comPico.chronicMinPerDay).toBeCloseTo(semPico.chronicMinPerDay, 5);
    expect(comPico.acuteMinPerDay).toBeGreaterThan(semPico.acuteMinPerDay);
  });
});

describe('computeLoadSignal — diasDesdeUltimaCorrida', () => {
  it('correu hoje → 0', () => {
    expect(sinalDe(rotina(30, 0, 2, 40)).diasDesdeUltimaCorrida).toBe(0);
  });

  it('volta de férias: conta os dias parados, e é o que muda a narrativa', () => {
    // 30 dias treinando, 21 parado, volta ontem.
    const antes = rotina(62, 33, 2, 50);
    const s = sinalDe([...antes, corrida(1, 50)]);
    expect(s.diasDesdeUltimaCorrida).toBe(1);

    // Sem a volta, o número expõe a pausa inteira. `rotina(62, 33, 2, ...)`
    // para em D-34 (62−28), então são 34 dias sem correr.
    const parado = sinalDe(antes);
    expect(parado.diasDesdeUltimaCorrida).toBe(34);
  });

  it('sem corrida nenhuma → null', () => {
    expect(sinalDe([]).diasDesdeUltimaCorrida).toBeNull();
  });
});

describe('computeLoadSignal — falha de consulta', () => {
  it('fetchFailed é "não consegui olhar", não "não treinou"', () => {
    const s = computeLoadSignal(serieDe(rotina(60, 0, 2, 45)), {
      fetchFailed: true,
    });
    expect(s.reason).toBe('indisponivel');
    expect(s.modulates).toBe(false);
    expect(s.ratio).toBeNull();
  });

  it('série vazia também é indisponível, nunca um número', () => {
    expect(computeLoadSignal([]).reason).toBe('indisponivel');
  });
});

describe('invariantes', () => {
  it('modulates=false implica ratio=null, sempre', () => {
    const casos = [
      [] as QualifyingActivity[],
      rotina(6, 1, 2, 20),
      [2, 9, 17, 29, 38, 45].map((k) => corrida(k, 12)),
      rotina(62, 0, 2, 45),
    ];
    for (const c of casos) {
      const s = sinalDe(c);
      if (!s.modulates) expect(s.ratio).toBeNull();
      else expect(typeof s.ratio).toBe('number');
    }
  });

  it('floorProgress só existe quando reason=sem_historico', () => {
    for (const c of [rotina(6, 1, 2, 20), rotina(62, 0, 2, 45), []]) {
      const s = sinalDe(c);
      expect(s.floorProgress !== null).toBe(s.reason === 'sem_historico');
    }
  });

  it('nenhum número sai NaN ou Infinity', () => {
    for (const c of [[], rotina(6, 1, 2, 20), rotina(62, 0, 2, 45)]) {
      const s = sinalDe(c);
      for (const v of [
        s.acuteMinPerDay,
        s.chronicMinPerDay,
        s.chronicMinPerWeek,
      ]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      if (s.ratio !== null) expect(Number.isFinite(s.ratio)).toBe(true);
    }
  });
});
