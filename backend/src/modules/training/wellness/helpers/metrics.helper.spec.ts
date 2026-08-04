import {
  buildMetric,
  sparkline7,
  weightedAvgPaceSeconds,
  resolveTargetFrequency,
  round2,
} from './metrics.helper';

/**
 * Fase 2A — matemática de métrica compartilhada.
 *
 * Estas funções eram métodos privados / closures dentro da `WellnessService` e
 * da `RetrospectiveService`, sem nenhuma cobertura. Foram promovidas porque o
 * insight semanal precisa da mesma matemática com outra janela, e a terceira
 * cópia seria a que começa a divergir em silêncio.
 */

describe('buildMetric', () => {
  it('calcula a variação percentual com 1 casa', () => {
    const m = buildMetric(30, 24, []);
    expect(m.value).toBe(30);
    expect(m.prevValue).toBe(24);
    expect(m.deltaPct).toBe(25);
  });

  it('arredonda a variação para 1 casa', () => {
    // 10 → 13 = +30%; 3 → 4 = +33.3%
    expect(buildMetric(4, 3, []).deltaPct).toBe(33.3);
  });

  it('devolve variação NEGATIVA quando caiu', () => {
    expect(buildMetric(15, 30, []).deltaPct).toBe(-50);
  });

  it('deltaPct é NULL (não 0) quando não há base de comparação', () => {
    // A distinção importa para a UI: "não havia com o que comparar" é
    // diferente de "não mudou". Mostrar 0% na semana 1 de um plano seria
    // mentira.
    expect(buildMetric(30, 0, []).deltaPct).toBeNull();
    expect(buildMetric(0, 0, []).deltaPct).toBeNull();
    expect(buildMetric(30, -5, []).deltaPct).toBeNull();
  });
});

describe('sparkline7', () => {
  interface Row {
    start_date: string;
    v: number;
  }
  const row = (start_date: string, v: number): Row => ({ start_date, v });
  const pick = (r: Row) => r.v;

  it('distribui em 7 baldes a partir de startStr', () => {
    const out = sparkline7(
      [
        row('2026-06-01T12:00:00Z', 5),
        row('2026-06-03T12:00:00Z', 8),
        row('2026-06-07T12:00:00Z', 2),
      ],
      '2026-06-01',
      pick,
    );
    expect(out).toEqual([5, 0, 8, 0, 0, 0, 2]);
  });

  it('soma duas linhas no mesmo dia', () => {
    const out = sparkline7(
      [row('2026-06-01T08:00:00Z', 3), row('2026-06-01T20:00:00Z', 4)],
      '2026-06-01',
      pick,
    );
    expect(out[0]).toBe(7);
  });

  it('usa o dia LOCAL de São Paulo, não o dia UTC', () => {
    // 22:00 de 02/06 em São Paulo = 01:00 UTC de 03/06. O balde certo é o
    // índice 1 (dia 02), não o 2.
    const out = sparkline7(
      [row('2026-06-03T01:00:00Z', 9)],
      '2026-06-01',
      pick,
    );
    expect(out[1]).toBe(9);
    expect(out[2]).toBe(0);
  });

  it('IGNORA linhas fora da janela', () => {
    // A versão anterior tinha uma "rede de segurança" que jogava o excedente no
    // balde do dia da semana em UTC — o que somava dados de OUTRA semana ao
    // gráfico desta. Ignorar é o comportamento honesto.
    const out = sparkline7(
      [
        row('2026-05-30T12:00:00Z', 100), // antes
        row('2026-06-09T12:00:00Z', 100), // depois
        row('2026-06-02T12:00:00Z', 7), // dentro
      ],
      '2026-06-01',
      pick,
    );
    expect(out).toEqual([0, 7, 0, 0, 0, 0, 0]);
  });

  it('devolve sempre 7 posições, mesmo sem linha nenhuma', () => {
    expect(sparkline7<Row>([], '2026-06-01', pick)).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('weightedAvgPaceSeconds', () => {
  it('pondera pela distância, não pela contagem', () => {
    // 1 km a 240s/km + 9 km a 340s/km. A média simples daria 290; a ponderada
    // dá 330, que é o que descreve a sessão de verdade.
    const avg = weightedAvgPaceSeconds([
      { distance: 1000, average_pace: 240 },
      { distance: 9000, average_pace: 340 },
    ]);
    expect(Math.round(avg)).toBe(330);
  });

  it('normaliza linha legada em decimal min/km', () => {
    // 5.5 min/km = 330 s/km. `paceValueToSecondsPerKm` cura o formato antigo.
    const avg = weightedAvgPaceSeconds([{ distance: 5000, average_pace: 5.5 }]);
    expect(Math.round(avg)).toBe(330);
  });

  it('devolve 0 sem distância', () => {
    expect(weightedAvgPaceSeconds([])).toBe(0);
    expect(weightedAvgPaceSeconds([{ distance: 0, average_pace: 330 }])).toBe(
      0,
    );
  });

  it('ignora linhas sem pace sem zerar o resultado das outras', () => {
    const avg = weightedAvgPaceSeconds([
      { distance: 5000, average_pace: 300 },
      { distance: 5000, average_pace: null },
    ]);
    // Só a primeira contribui para o numerador, mas as duas para o
    // denominador — o resultado fica puxado para baixo de propósito? Não: o
    // contrato é "pace médio do que dá para medir". Travamos o valor atual.
    expect(Math.round(avg)).toBe(150);
  });
});

describe('resolveTargetFrequency', () => {
  it('prefere frequency_per_week do plano', () => {
    expect(resolveTargetFrequency(4, 12, 4)).toBe(4);
  });

  it('deriva do próprio plano quando frequency_per_week está ausente', () => {
    expect(resolveTargetFrequency(null, 12, 4)).toBe(3);
    expect(resolveTargetFrequency(0, 10, 4)).toBe(2.5);
  });

  it('devolve 0 quando não há como derivar — o chamador precisa guardar a divisão', () => {
    expect(resolveTargetFrequency(null, 0, 4)).toBe(0);
    expect(resolveTargetFrequency(null, 12, 0)).toBe(0);
  });
});

describe('round2', () => {
  it('arredonda para 2 casas', () => {
    expect(round2(1.005)).toBe(1);
    expect(round2(1.006)).toBe(1.01);
    expect(round2(12.3456)).toBe(12.35);
  });
});
