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
    const FROZEN: Record<number, Record<string, { min: number; max: number }>> =
      {
        30: { Z1: { min: 551, max: 618 }, Z2: { min: 483, max: 503 }, Z3: { min: 454, max: 470 }, Z4: { min: 412, max: 428 }, Z5: { min: 374, max: 394 } },
        35: { Z1: { min: 442, max: 488 }, Z2: { min: 387, max: 407 }, Z3: { min: 365, max: 381 }, Z4: { min: 336, max: 352 }, Z5: { min: 309, max: 329 } },
        40: { Z1: { min: 393, max: 434 }, Z2: { min: 344, max: 364 }, Z3: { min: 323, max: 339 }, Z4: { min: 297, max: 313 }, Z5: { min: 272, max: 292 } },
        45: { Z1: { min: 354, max: 391 }, Z2: { min: 309, max: 329 }, Z3: { min: 290, max: 306 }, Z4: { min: 265, max: 281 }, Z5: { min: 241, max: 261 } },
        50: { Z1: { min: 322, max: 355 }, Z2: { min: 279, max: 299 }, Z3: { min: 262, max: 278 }, Z4: { min: 239, max: 255 }, Z5: { min: 216, max: 236 } },
        55: { Z1: { min: 295, max: 324 }, Z2: { min: 254, max: 274 }, Z3: { min: 238, max: 254 }, Z4: { min: 216, max: 232 }, Z5: { min: 195, max: 215 } },
        60: { Z1: { min: 271, max: 298 }, Z2: { min: 231, max: 251 }, Z3: { min: 217, max: 233 }, Z4: { min: 196, max: 212 }, Z5: { min: 178, max: 198 } },
        65: { Z1: { min: 251, max: 275 }, Z2: { min: 212, max: 232 }, Z3: { min: 200, max: 216 }, Z4: { min: 180, max: 196 }, Z5: { min: 163, max: 183 } },
        70: { Z1: { min: 233, max: 254 }, Z2: { min: 195, max: 215 }, Z3: { min: 185, max: 201 }, Z4: { min: 166, max: 182 }, Z5: { min: 149, max: 169 } },
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

  describe('sanidade da ponta baixa', () => {
    it('o easy do VDOT 27 continua sendo trote, não caminhada', () => {
      const { Z1 } = pc.getZonePaceRangesSeconds(27);
      const kmh = (secPerKm: number) => 3600 / secPerKm;
      // Caminhada rápida vai até ~6,5 km/h; abaixo de ~5 km/h não é mais corrida.
      expect(kmh(Z1.max)).toBeGreaterThan(5.0);
      expect(kmh(Z1.min)).toBeLessThan(7.0);
    });

    it('o piso do clamp é a menor âncora da tabela (senão o colapso volta)', () => {
      const lowestAnchor = Math.min(...Object.keys(VDOT_REFERENCE_TABLE).map(Number));
      // Abaixo do piso tudo clampa — e o piso tem de ser exatamente a âncora,
      // senão existe um intervalo colapsado como o antigo 25–30.
      expect(pc.getZonePaceRangesSeconds(lowestAnchor - 5)).toEqual(
        pc.getZonePaceRangesSeconds(lowestAnchor),
      );
      expect(pc.getZonePaceRangesSeconds(lowestAnchor + 0.5)).not.toEqual(
        pc.getZonePaceRangesSeconds(lowestAnchor),
      );
    });

    it('VDOT 27 corresponde a ~33:25 nos 5 km (origem da âncora)', () => {
      // Fecha o ciclo com a fórmula que originou a linha: 5 km em 33:25 → 27.
      expect(pc.estimateVDOTFromRace(5000, 33 * 60 + 25)).toBeCloseTo(27, 0);
    });
  });
});
