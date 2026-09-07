import {
  READINESS_DAY_CUTOFF_HOUR,
  nextReadinessRotationIso,
  readinessDayStr,
  readinessWindowEndIso,
  readinessWindowStartIso,
  toReadinessDayStr,
} from './readiness-day.helper';

/**
 * Puro: zero mock, zero banco, zero relógio real (todo instante é explícito).
 *
 * A fronteira testada aqui não tinha NENHUMA cobertura antes — o mock do spec
 * do service tratava `.gte()` como no-op, então a janela do check-in podia estar
 * em qualquer hora do dia que a suíte passava igual.
 */
describe('readinessDayStr — a fronteira das 03:00', () => {
  const dia = (iso: string) => readinessDayStr(new Date(iso));

  it('02:59:59 SP ainda é o dia ANTERIOR', () => {
    // 05:59:59Z = 02:59:59 SP do dia 9.
    expect(dia('2026-03-09T05:59:59.000Z')).toBe('2026-03-08');
  });

  it('03:00:00 SP vira o dia', () => {
    expect(dia('2026-03-09T06:00:00.000Z')).toBe('2026-03-09');
  });

  it('meia-noite SP NÃO vira o dia — é a mudança em relação ao código antigo', () => {
    // 03:00Z = 00:00 SP do dia 9. O `getReadinessWindowStart` antigo virava
    // aqui; quem respondesse 00:30 abria um check-in novo tendo acabado de
    // voltar da rua.
    expect(dia('2026-03-09T03:00:00.000Z')).toBe('2026-03-08');
  });

  it('meio-dia e fim de tarde caem no dia civil, como se espera', () => {
    expect(dia('2026-03-09T15:00:00.000Z')).toBe('2026-03-09'); // 12:00 SP
    expect(dia('2026-03-10T02:00:00.000Z')).toBe('2026-03-09'); // 23:00 SP
  });

  it('vira a virada do mês e do ano sem aritmética manual', () => {
    expect(dia('2026-01-01T05:00:00.000Z')).toBe('2025-12-31'); // 02:00 SP
    expect(dia('2026-01-01T06:00:00.000Z')).toBe('2026-01-01'); // 03:00 SP
  });
});

describe('toReadinessDayStr — classificar linha já gravada', () => {
  it('corrige o off-by-one de check-in entre 21:00 e 23:59 SP', () => {
    // O código antigo fazia `created_at.split('T')[0]` — dia UTC puro. Um
    // check-in às 22:00 SP do dia 9 tem `created_at` no dia 10 em UTC e era
    // reportado como do dia 10.
    const checkInAs22hSPdoDia9 = '2026-03-10T01:00:00.000Z';
    expect(checkInAs22hSPdoDia9.split('T')[0]).toBe('2026-03-10'); // o bug
    expect(toReadinessDayStr(checkInAs22hSPdoDia9)).toBe('2026-03-09'); // correto
  });

  it('classifica um check-in de madrugada no dia de treino anterior', () => {
    expect(toReadinessDayStr('2026-03-09T04:30:00.000Z')).toBe('2026-03-08');
  });

  it('aceita ISO sem milissegundos e com offset explícito', () => {
    expect(toReadinessDayStr('2026-03-09T15:00:00Z')).toBe('2026-03-09');
    expect(toReadinessDayStr('2026-03-09T12:00:00-03:00')).toBe('2026-03-09');
  });
});

describe('readinessWindowStartIso / EndIso', () => {
  it('03:00 SP é 06:00Z do MESMO dia civil', () => {
    expect(readinessWindowStartIso('2026-03-09')).toBe(
      '2026-03-09T06:00:00.000Z',
    );
  });

  it('o fim da janela é o início do dia seguinte (exclusivo)', () => {
    expect(readinessWindowEndIso('2026-03-09')).toBe(
      '2026-03-10T06:00:00.000Z',
    );
  });

  it('a janela tem exatamente 24 horas', () => {
    const ini = Date.parse(readinessWindowStartIso('2026-03-09'));
    const fim = Date.parse(readinessWindowEndIso('2026-03-09'));
    expect(fim - ini).toBe(24 * 60 * 60 * 1000);
  });

  it('a fronteira do dia e a janela CONCORDAM — a mina que separou os 5 sites', () => {
    // Se estas duas funções discordarem, um instante pode estar "no dia X" para
    // o classificador e fora da janela de X para a query. Era exatamente essa a
    // divergência entre `getReadinessWindowStart` e `getNextRotationTime`.
    for (const iso of [
      '2026-03-09T06:00:00.000Z', // primeiro instante do dia 9
      '2026-03-09T18:00:00.000Z',
      '2026-03-10T05:59:59.999Z', // último instante do dia 9
    ]) {
      const d = toReadinessDayStr(iso);
      const t = Date.parse(iso);
      expect(t).toBeGreaterThanOrEqual(Date.parse(readinessWindowStartIso(d)));
      expect(t).toBeLessThan(Date.parse(readinessWindowEndIso(d)));
    }
  });

  it('cruza a virada do mês corretamente', () => {
    expect(readinessWindowEndIso('2026-01-31')).toBe(
      '2026-02-01T06:00:00.000Z',
    );
  });
});

describe('nextReadinessRotationIso', () => {
  it('às 02:00 SP aponta para as 03:00 de HOJE (dia civil)', () => {
    // 05:00Z = 02:00 SP do dia 9 → dia de readiness 8 → próxima virada: 9 às 03:00.
    expect(nextReadinessRotationIso(new Date('2026-03-09T05:00:00.000Z'))).toBe(
      '2026-03-09T06:00:00.000Z',
    );
  });

  it('às 04:00 SP aponta para as 03:00 de AMANHÃ', () => {
    expect(nextReadinessRotationIso(new Date('2026-03-09T07:00:00.000Z'))).toBe(
      '2026-03-10T06:00:00.000Z',
    );
  });

  it('é sempre estritamente no futuro', () => {
    for (const iso of [
      '2026-03-09T05:59:59.999Z',
      '2026-03-09T06:00:00.000Z',
      '2026-03-09T06:00:00.001Z',
      '2026-03-09T23:59:59.999Z',
    ]) {
      expect(
        Date.parse(nextReadinessRotationIso(new Date(iso))),
      ).toBeGreaterThan(Date.parse(iso));
    }
  });
});

describe('a constante', () => {
  it('o corte é 3 — quem mudar isto quebra a suíte de propósito', () => {
    expect(READINESS_DAY_CUTOFF_HOUR).toBe(3);
  });
});
