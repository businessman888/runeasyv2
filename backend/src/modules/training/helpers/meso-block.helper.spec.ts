import {
  MESO_BLOCK_WEEKS,
  blockIndexOf,
  weeksOfBlock,
  lastBlockIndexOf,
  blockClosedByWeek,
  dominantPhase,
} from './meso-block.helper';
import {
  VolumePlannerService,
  WeekPhase,
} from '../../../common/volume-planner';

/**
 * Fase 4 — a geometria do mesociclo.
 *
 * Tudo aqui é puro. O que estes testes protegem:
 *   1. o ÚLTIMO bloco nunca gera insight (a retrospectiva o cobre);
 *   2. o empate de fase cai para a última semana do bloco;
 *   3. plano curto demais simplesmente não tem mesociclo — não quebra.
 */

describe('geometria do bloco', () => {
  it('o bloco é de 4 semanas, espelhando o deload do motor de volume', () => {
    expect(MESO_BLOCK_WEEKS).toBe(4);
    expect(blockIndexOf(1)).toBe(1);
    expect(blockIndexOf(4)).toBe(1);
    expect(blockIndexOf(5)).toBe(2);
    expect(blockIndexOf(12)).toBe(3);
    expect(weeksOfBlock(2)).toEqual([5, 6, 7, 8]);
  });

  describe('qual semana fecha um bloco que merece insight', () => {
    // Plano de 12 semanas: blocos 1 (S1-4), 2 (S5-8) e 3 (S9-12).
    const LAST = 12;

    it('só a 4ª semana de cada bloco fecha alguma coisa', () => {
      expect(blockClosedByWeek(4, LAST)).toBe(1);
      expect(blockClosedByWeek(8, LAST)).toBe(2);

      for (const week of [1, 2, 3, 5, 6, 7, 9, 10, 11]) {
        expect(blockClosedByWeek(week, LAST)).toBeNull();
      }
    });

    it('o ÚLTIMO bloco é suprimido — a retrospectiva é o fecho do ciclo', () => {
      expect(lastBlockIndexOf(LAST)).toBe(3);
      expect(blockClosedByWeek(12, LAST)).toBeNull();
    });

    it('bloco final PARCIAL também é suprimido', () => {
      // Plano de 10 semanas: o bloco 3 (S9-10) nunca fecha por múltiplo de 4,
      // mas mesmo se fechasse seria o último. O bloco 2 continua valendo.
      expect(blockClosedByWeek(8, 10)).toBe(2);
      expect(blockClosedByWeek(4, 10)).toBe(1);
      expect(lastBlockIndexOf(10)).toBe(3);
    });

    it('plano de até 4 semanas não tem mesociclo nenhum', () => {
      // O bloco 1 já é o último. É correto por construção: a retrospectiva
      // cobre o ciclo inteiro, e um "bloco" que É o plano não é um recorte.
      expect(blockClosedByWeek(4, 4)).toBeNull();
      expect(blockClosedByWeek(4, 3)).toBeNull();
    });

    it('plano de 8 semanas gera exatamente um bloco', () => {
      expect(blockClosedByWeek(4, 8)).toBe(1);
      expect(blockClosedByWeek(8, 8)).toBeNull(); // último
    });
  });
});

describe('fase dominante', () => {
  it('bloco inteiro na mesma fase', () => {
    expect(dominantPhase(['base', 'base', 'base', 'base'])).toBe('base');
  });

  it('a maioria vence', () => {
    expect(dominantPhase(['base', 'build', 'build', 'build'])).toBe('build');
    expect(dominantPhase(['base', 'base', 'base', 'build'])).toBe('base');
  });

  it('no EMPATE vence a fase da última semana — é onde o atleta chega', () => {
    // Exatamente o bloco 2 de um plano 12sem/10k (base S1-6, build S7-9).
    expect(dominantPhase(['base', 'base', 'build', 'build'])).toBe('build');
    // E o simétrico, para provar que não é só "a última sempre ganha".
    expect(dominantPhase(['build', 'build', 'peak', 'peak'])).toBe('peak');
    expect(dominantPhase(['base', 'build', 'build', 'peak'])).toBe('build');
  });

  it('lista vazia não quebra', () => {
    expect(dominantPhase([])).toBe('base');
  });
});

/**
 * O acoplamento que importa: os rótulos dos blocos saem do MESMO
 * `calculatePhases` que dimensiona o volume. Se um dia a periodização mudar,
 * este teste muda junto — de propósito.
 */
describe('integração com o motor de fases', () => {
  const planner = new VolumePlannerService();

  const phasesOf = (totalWeeks: number, goalKm: number): WeekPhase[] => {
    const p = planner.calculatePhases(totalWeeks, goalKm);
    return Array.from({ length: totalWeeks }, (_, i) => {
      const w = i + 1;
      if (w <= p.base) return 'base';
      if (w <= p.base + p.build) return 'build';
      if (w <= p.base + p.build + p.peak) return 'peak';
      return 'taper';
    });
  };

  it('plano 12 semanas / 10 km: bloco 1 é base, bloco 2 é desenvolvimento', () => {
    const phases = phasesOf(12, 10);
    expect(phases).toEqual([
      'base',
      'base',
      'base',
      'base',
      'base',
      'base',
      'build',
      'build',
      'build',
      'peak',
      'peak',
      'taper',
    ]);

    const rotulo = (block: number) =>
      dominantPhase(weeksOfBlock(block).map((w) => phases[w - 1]));

    expect(rotulo(1)).toBe('base');
    // S5-8 = base, base, build, build → empate → a última manda.
    expect(rotulo(2)).toBe('build');
  });
});
