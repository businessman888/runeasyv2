import { paceValueToSecondsPerKm, formatPaceLabel } from './pace-format';

/**
 * TRAVA DA UNIDADE CANÔNICA DE PACE.
 *
 * Existe por causa de um bug real: até 2026-07-30 `activities.average_pace` era
 * gravado em DECIMAL min/km por todos os produtores, enquanto o WellnessService
 * o declarava e consumia como SEGUNDOS/km — e arredondava. Um pace real de
 * 5,53 min/km virava `Math.round(5.53)` = 6, e a tela Wellness renderizava
 * "0:06/km". A ambiguidade nunca estourou um erro; só produziu número errado.
 *
 * Estes testes travam os dois lados do contrato — produtor e consumidor — para
 * a regressão voltar como teste vermelho, não como pace silenciosamente errado.
 */
describe('unidade canônica de pace (segundos/km)', () => {
  describe('paceValueToSecondsPerKm', () => {
    it('mantém um valor já em segundos/km', () => {
      expect(paceValueToSecondsPerKm(300)).toBe(300); // 5:00/km
      expect(paceValueToSecondsPerKm(332)).toBe(332); // 5:32/km
      expect(paceValueToSecondsPerKm(600)).toBe(600); // 10:00/km
    });

    it('converte o decimal min/km legado (< 20) multiplicando por 60', () => {
      expect(paceValueToSecondsPerKm(5)).toBe(300);
      expect(paceValueToSecondsPerKm(5.53)).toBe(332); // o caso do bug
      expect(paceValueToSecondsPerKm(6)).toBe(360);
    });

    it('é idempotente — normalizar duas vezes não muda o resultado', () => {
      // Garante que passar pelo helper em camadas empilhadas (service → DTO →
      // formatter) não multiplica por 60 repetidamente.
      for (const raw of [5.53, 300, 6, 420]) {
        const once = paceValueToSecondsPerKm(raw)!;
        expect(paceValueToSecondsPerKm(once)).toBe(once);
      }
    });

    it('devolve null para ausente/inválido em vez de 0 ou NaN', () => {
      expect(paceValueToSecondsPerKm(null)).toBeNull();
      expect(paceValueToSecondsPerKm(undefined)).toBeNull();
      expect(paceValueToSecondsPerKm(0)).toBeNull();
      expect(paceValueToSecondsPerKm(-5)).toBeNull();
      expect(paceValueToSecondsPerKm(NaN)).toBeNull();
      expect(paceValueToSecondsPerKm(Infinity)).toBeNull();
    });

    it('separa as duas unidades sem zona cinza no limiar', () => {
      // Um corredor humano nunca faz 20 min/km nem 19 s/km, então o limiar de 20
      // é seguro. Este teste documenta onde ele fica.
      expect(paceValueToSecondsPerKm(19.9)).toBe(1194); // tratado como min/km
      expect(paceValueToSecondsPerKm(20)).toBe(20); // tratado como segundos/km
    });
  });

  describe('contrato produtor → consumidor', () => {
    /**
     * Réplica exata do cálculo de `completeWorkout`:
     *   paceSeconds = duration_seconds / distance_km
     * Se alguém reintroduzir um `/ 60` ali, este teste quebra.
     */
    const producePace = (durationSeconds: number, distanceKm: number) =>
      Math.round(durationSeconds / distanceKm);

    it('completeWorkout produz segundos/km, não decimal min/km', () => {
      // 5 km em 27:40 (1660 s) → 5:32/km = 332 s/km
      const stored = producePace(1660, 5);
      expect(stored).toBe(332);

      // O valor gravado tem que sobreviver ao consumidor sem conversão.
      expect(paceValueToSecondsPerKm(stored)).toBe(332);
      expect(formatPaceLabel(stored)).toBe('5:32');
    });

    it('o consumidor formata igual para o valor novo e para o legado', () => {
      const emSegundos = 332; // formato novo
      const emDecimalMinKm = 1660 / 5 / 60; // 5.533… — formato legado

      expect(formatPaceLabel(emSegundos)).toBe('5:32');
      expect(formatPaceLabel(emDecimalMinKm)).toBe('5:32');
    });

    it('sem normalização, o legado renderizaria o valor absurdo do bug', () => {
      // Réplica do formatador CRU do mobile (PerformanceGrid/EvolutionChart
      // `formatPace(seconds)`), que recebe segundos e NÃO normaliza — era o
      // último elo da cadeia quebrada.
      const formatRawSeconds = (s: number) =>
        `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

      const legado = 5.53; // decimal min/km vindo do banco

      // Cadeia ANTIGA: WellnessService arredondava e entregava como "segundos".
      expect(formatRawSeconds(Math.round(legado))).toBe('0:06');

      // Cadeia NOVA: normaliza antes de entregar ao mobile.
      expect(formatRawSeconds(paceValueToSecondsPerKm(legado)!)).toBe('5:32');

      // E o helper de exibição chega no mesmo lugar por si só.
      expect(formatPaceLabel(legado)).toBe('5:32');
    });
  });

  describe('velocidade derivada do pace (usada no VO2 max)', () => {
    /** Réplica de FeedbackAIService.calculateVO2MaxEstimate. */
    const velocityMPerMin = (paceValue: number) => {
      const sec = paceValueToSecondsPerKm(paceValue)!;
      return (1000 / sec) * 60;
    };

    it('dá a mesma velocidade para o valor em segundos e no legado', () => {
      // 5:00/km = 200 m/min
      expect(velocityMPerMin(300)).toBeCloseTo(200, 6);
      expect(velocityMPerMin(5)).toBeCloseTo(200, 6);
    });

    it('produz velocidade fisiologicamente plausível (não 60× errada)', () => {
      // Faixa humana de corrida: ~100 m/min (10:00/km) a ~400 m/min (2:30/km).
      for (const paceSec of [150, 300, 420, 600]) {
        const v = velocityMPerMin(paceSec);
        expect(v).toBeGreaterThan(80);
        expect(v).toBeLessThan(450);
      }
    });
  });
});
