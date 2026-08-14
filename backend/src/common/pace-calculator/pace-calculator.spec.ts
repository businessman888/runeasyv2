import { PaceCalculatorService } from './pace-calculator.service';
import { VDOT_REFERENCE_TABLE } from './vdot-table';
import { TrainingZone } from './pace-calculator.types';

/**
 * Tabela VDOT — a âncora 27 (ponta baixa, iniciantes).
 *
 * O teste que mais importa aqui é o de NÃO-REGRESSÃO: a faixa 30–70 gera os
 * planos de produção e não pode mudar um único segundo por causa de uma âncora
 * adicionada abaixo dela.
 */
describe('PaceCalculatorService — âncora VDOT 27', () => {
  const pc = new PaceCalculatorService();
  const ZONES: TrainingZone[] = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

  describe('não-regressão (VDOT ≥ 30 intocado)', () => {
    /**
     * Valores capturados do build ANTES da âncora 27 entrar. São literais de
     * propósito: se alguém mexer na tabela e alterar a faixa de produção, isto
     * quebra — que é exatamente o ponto.
     */
    const FROZEN: Record<
      number,
      Record<string, { min: number; max: number }>
    > = {
      30: {
        Z1: { min: 551, max: 618 },
        Z2: { min: 483, max: 503 },
        Z3: { min: 454, max: 470 },
        Z4: { min: 412, max: 428 },
        Z5: { min: 374, max: 394 },
      },
      35: {
        Z1: { min: 442, max: 488 },
        Z2: { min: 387, max: 407 },
        Z3: { min: 365, max: 381 },
        Z4: { min: 336, max: 352 },
        Z5: { min: 309, max: 329 },
      },
      40: {
        Z1: { min: 393, max: 434 },
        Z2: { min: 344, max: 364 },
        Z3: { min: 323, max: 339 },
        Z4: { min: 297, max: 313 },
        Z5: { min: 272, max: 292 },
      },
      45: {
        Z1: { min: 354, max: 391 },
        Z2: { min: 309, max: 329 },
        Z3: { min: 290, max: 306 },
        Z4: { min: 265, max: 281 },
        Z5: { min: 241, max: 261 },
      },
      50: {
        Z1: { min: 322, max: 355 },
        Z2: { min: 279, max: 299 },
        Z3: { min: 262, max: 278 },
        Z4: { min: 239, max: 255 },
        Z5: { min: 216, max: 236 },
      },
      55: {
        Z1: { min: 295, max: 324 },
        Z2: { min: 254, max: 274 },
        Z3: { min: 238, max: 254 },
        Z4: { min: 216, max: 232 },
        Z5: { min: 195, max: 215 },
      },
      60: {
        Z1: { min: 271, max: 298 },
        Z2: { min: 231, max: 251 },
        Z3: { min: 217, max: 233 },
        Z4: { min: 196, max: 212 },
        Z5: { min: 178, max: 198 },
      },
      65: {
        Z1: { min: 251, max: 275 },
        Z2: { min: 212, max: 232 },
        Z3: { min: 200, max: 216 },
        Z4: { min: 180, max: 196 },
        Z5: { min: 163, max: 183 },
      },
      70: {
        Z1: { min: 233, max: 254 },
        Z2: { min: 195, max: 215 },
        Z3: { min: 185, max: 201 },
        Z4: { min: 166, max: 182 },
        Z5: { min: 149, max: 169 },
      },
    };

    it.each(Object.keys(FROZEN).map(Number))(
      'VDOT %i mantém todas as zonas idênticas',
      (vdot) => {
        expect(pc.getZonePaceRangesSeconds(vdot)).toEqual(FROZEN[vdot]);
      },
    );

    it('valores interpolados entre âncoras ≥ 30 também não mudam', () => {
      // 32.5 fica entre 30 e 35 — par de âncoras que a linha 27 não toca.
      expect(pc.getZonePaceRangesSeconds(32.5).Z1).toEqual({
        min: 497,
        max: 553,
      });
    });
  });

  describe('diferenciação nova (27–29)', () => {
    it('27, 28 e 29 geram zonas distintas entre si e do 30', () => {
      const seen = [27, 28, 29, 30].map((v) =>
        JSON.stringify(pc.getZonePaceRangesSeconds(v)),
      );
      expect(new Set(seen).size).toBe(4);
    });

    it('antes, 27–29 eram todos iguais ao 30 — agora são mais lentos', () => {
      const z30 = pc.getZonePaceRangesSeconds(30).Z1;
      for (const v of [27, 28, 29]) {
        expect(pc.getZonePaceRangesSeconds(v).Z1.min).toBeGreaterThan(z30.min);
      }
    });
  });

  describe('monotonicidade', () => {
    it('cada zona fica mais rápida conforme o VDOT sobe, sem inversões', () => {
      // Varredura contínua sobre TODO o domínio modelado (menor → maior âncora).
      for (const zone of ZONES) {
        for (let vdot = 27; vdot < 70; vdot += 0.5) {
          const cur = pc.getZonePaceRangesSeconds(vdot)[zone];
          const next = pc.getZonePaceRangesSeconds(vdot + 0.5)[zone];
          expect(next.min).toBeLessThanOrEqual(cur.min);
          expect(next.max).toBeLessThanOrEqual(cur.max);
        }
      }
    });

    it('dentro de cada VDOT as zonas ficam mais rápidas de Z1 para Z5', () => {
      for (const vdot of [27, 30, 45, 70]) {
        const z = pc.getZonePaceRangesSeconds(vdot);
        expect(z.Z2.min).toBeLessThan(z.Z1.min);
        expect(z.Z3.min).toBeLessThan(z.Z2.min);
        expect(z.Z4.min).toBeLessThan(z.Z3.min);
        expect(z.Z5.min).toBeLessThan(z.Z4.min);
      }
    });
  });

  describe('inverso — impliedVdotForZonePace (Fase 3)', () => {
    /**
     * O inverso NÃO tem tabela própria: ele busca sobre a função forward. Isso
     * é o que garante que "o VDOT que prescreveria este pace" e "o pace que
     * este VDOT prescreve" nunca divirjam — não há segunda fonte para sair de
     * sincronia.
     */
    it('round-trip: o VDOT que prescreve um pace devolve aquele VDOT', () => {
      for (const vdot of [30, 35, 40, 45, 50, 60]) {
        for (const zone of ZONES) {
          const band = pc.getZonePaceRangesSeconds(vdot)[zone];
          const center = (band.min + band.max) / 2;
          expect(pc.impliedVdotForZonePace(zone, center)).toBeCloseTo(vdot, 0);
        }
      }
    });

    it('mais rápido ⇒ VDOT maior, e vice-versa', () => {
      const base = pc.impliedVdotForZonePace('Z4', 300);
      expect(pc.impliedVdotForZonePace('Z4', 280)).toBeGreaterThan(base);
      expect(pc.impliedVdotForZonePace('Z4', 340)).toBeLessThan(base);
    });

    it('fora do domínio modelado devolve o extremo, sem extrapolar', () => {
      const { min, max } = pc.bounds;
      expect(pc.impliedVdotForZonePace('Z4', 900)).toBe(min); // lentíssimo
      expect(pc.impliedVdotForZonePace('Z4', 100)).toBe(max); // impossível
      expect(pc.impliedVdotForZonePace('Z4', 0)).toBe(30); // inválido → beginner
    });

    it('os limites do inverso são os mesmos do clamp', () => {
      const bounds = pc as unknown as { MIN_VDOT: number; MAX_VDOT: number };
      expect(pc.bounds).toEqual({
        min: bounds.MIN_VDOT,
        max: bounds.MAX_VDOT,
      });
    });
  });

  describe('target-time inverse (Fase 5)', () => {
    it('round-trips VDOT -> race time -> VDOT with the Daniels formula', () => {
      for (const distanceMeters of [5000, 10000, 21097, 42195]) {
        for (const vdot of [30, 35, 40, 45, 50, 60]) {
          const time = pc.estimateRaceTimeFromVDOT(distanceMeters, vdot);
          expect(pc.estimateVDOTFromRace(distanceMeters, time)).toBeCloseTo(
            vdot,
            0,
          );
        }
      }
    });
  });

  describe('sanidade da ponta baixa', () => {
    it('o easy do VDOT 27 continua sendo trote, não caminhada', () => {
      const { Z1 } = pc.getZonePaceRangesSeconds(27);
      const kmh = (secPerKm: number) => 3600 / secPerKm;
      // Caminhada rápida vai até ~6,5 km/h; abaixo de ~5 km/h não é mais corrida.
      expect(kmh(Z1.max)).toBeGreaterThan(5.0);
      expect(kmh(Z1.min)).toBeLessThan(7.0);
    });

    /**
     * O INVARIANTE central da tabela, agora nas DUAS pontas: os limites do clamp
     * têm de coincidir com os extremos da tabela. Sempre que divergirem, nasce um
     * intervalo "aceito pelo clamp mas não modelado", que colapsa em silêncio —
     * foi exatamente isso que produziu os dois bugs (25–30 embaixo, 70–85 em cima).
     */
    it('os limites do clamp são EXATAMENTE os extremos da tabela', () => {
      // Asserção direta sobre os limites, e não sobre o comportamento: um teto
      // acima da maior âncora (o bug: MAX_VDOT 85 × tabela até 70) devolve a
      // linha do topo para todo mundo, então uma checagem só comportamental
      // passaria mesmo com o defeito presente. Aqui ela falha.
      const bounds = pc as unknown as { MIN_VDOT: number; MAX_VDOT: number };
      const anchors = Object.keys(VDOT_REFERENCE_TABLE).map(Number);

      expect(bounds.MIN_VDOT).toBe(Math.min(...anchors));
      expect(bounds.MAX_VDOT).toBe(Math.max(...anchors));
    });

    it('fora do domínio clampa; dentro dele há diferenciação', () => {
      const anchors = Object.keys(VDOT_REFERENCE_TABLE).map(Number);
      const lowest = Math.min(...anchors);
      const highest = Math.max(...anchors);

      expect(pc.getZonePaceRangesSeconds(lowest - 5)).toEqual(
        pc.getZonePaceRangesSeconds(lowest),
      );
      expect(pc.getZonePaceRangesSeconds(highest + 15)).toEqual(
        pc.getZonePaceRangesSeconds(highest),
      );
      expect(pc.getZonePaceRangesSeconds(lowest + 0.5)).not.toEqual(
        pc.getZonePaceRangesSeconds(lowest),
      );
      expect(pc.getZonePaceRangesSeconds(highest - 0.5)).not.toEqual(
        pc.getZonePaceRangesSeconds(highest),
      );
    });

    it('todo o domínio modelado responde, sem platô achatado', () => {
      // Se existisse um intervalo colapsado, VDOTs vizinhos repetiriam a saída.
      const anchors = Object.keys(VDOT_REFERENCE_TABLE).map(Number);
      const lowest = Math.min(...anchors);
      const highest = Math.max(...anchors);
      const vistos = new Set<string>();
      for (let v = lowest; v <= highest; v += 0.5) {
        vistos.add(JSON.stringify(pc.getZonePaceRangesSeconds(v)));
      }
      const amostras = (highest - lowest) / 0.5 + 1;
      // Tolera repetições pontuais por arredondamento ao segundo, mas não um
      // platô inteiro (o bug antigo colapsava ~30 amostras num único valor).
      expect(vistos.size).toBeGreaterThan(amostras * 0.9);
    });

    it('VDOT 27 corresponde a ~33:25 nos 5 km (origem da âncora)', () => {
      // Fecha o ciclo com a fórmula que originou a linha: 5 km em 33:25 → 27.
      expect(pc.estimateVDOTFromRace(5000, 33 * 60 + 25)).toBeCloseTo(27, 0);
    });
  });
});
