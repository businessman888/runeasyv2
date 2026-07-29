import { selectArchetypeKey } from './archetype.selector';
import { ArchetypeKey, ArchetypeSelectionInput } from './archetype.types';
import { VolumePlannerService } from '../volume-planner';

/**
 * Cadeia de seleção de arquétipo.
 *
 * Estes testes existem por causa de um buraco real: `maratonista_nato` exige meta
 * ≥42 km e `aspirante_performance` ≥21 km, `explorador_limites` é só beginner e
 * `foco_saude` exclui advanced — então NENHUMA regra cobria um avançado com meta
 * curta, e ele caía no fallback. Um corredor de 30 km/sem a 4:12/km mirando um 5k
 * lia "Estamos começando do zero… vamos alternar caminhada e trote".
 *
 * A varredura do final do arquivo é a rede que impede o buraco de voltar.
 */
describe('selectArchetypeKey', () => {
  const volumePlanner = new VolumePlannerService();

  /** Base neutra: corredor sem nada de excepcional, para isolar uma variável. */
  const base = (over: Partial<ArchetypeSelectionInput> = {}): ArchetypeSelectionInput => ({
    effectiveWeeklyKm: 25,
    neverRan: false,
    recentDistanceKm: 10,
    recentFrequency: '4x_plus',
    goalKm: 10,
    goal: '10k',
    goalType: 'distance',
    level: 'intermediate',
    daysPerWeek: 4,
    goalTimeframeMonths: 3,
    paceMinPerKm: 5.5,
    hasLimitation: false,
    ...over,
  });

  const key = (over: Partial<ArchetypeSelectionInput> = {}): ArchetypeKey =>
    selectArchetypeKey(base(over)).key;

  // ── O perfil que faltava ──────────────────────────────────────────────────

  describe('cacador_recordes (avançado, meta curta)', () => {
    it.each([
      ['5k', 5],
      ['10k', 10],
      ['general_fitness', 10],
    ])('avançado com meta %s → cacador_recordes', (goal, goalKm) => {
      expect(key({ level: 'advanced', goal, goalKm, paceMinPerKm: 4.2 })).toBe(
        'cacador_recordes',
      );
    });

    it('o caso concreto da auditoria: 30 km/sem a 4:12/km, meta 5k', () => {
      expect(
        key({
          level: 'advanced',
          goal: '5k',
          goalKm: 5,
          effectiveWeeklyKm: 30,
          recentDistanceKm: 15,
          paceMinPerKm: 4.2,
        }),
      ).toBe('cacador_recordes');
    });
  });

  // ── A regra nova não pode roubar de quem já funcionava ────────────────────

  describe('não-roubo (regras acima continuam vencendo)', () => {
    it('avançado + maratona → maratonista_nato', () => {
      expect(
        key({ level: 'advanced', goal: 'marathon', goalKm: 42.2, paceMinPerKm: 4.5 }),
      ).toBe('maratonista_nato');
    });

    it('avançado + meia → aspirante_performance', () => {
      expect(
        key({ level: 'advanced', goal: 'half_marathon', goalKm: 21.1 }),
      ).toBe('aspirante_performance');
    });

    it('avançado + maratona lento → aspirante_performance (não maratonista)', () => {
      expect(
        key({ level: 'advanced', goal: 'marathon', goalKm: 42.2, paceMinPerKm: 6.0 }),
      ).toBe('aspirante_performance');
    });

    it.each<[string, Partial<ArchetypeSelectionInput>, ArchetypeKey]>([
      ['nunca correu', { neverRan: true, level: 'advanced', goalKm: 5 }, 'walk_run_starter'],
      ['nunca correu + limitação', { neverRan: true, hasLimitation: true }, 'walk_run_starter'],
      ['destreinado', { recentDistanceKm: 10, recentFrequency: 'never', level: 'advanced', goalKm: 5 }, 'detrained'],
      ['capacidade baixa', { effectiveWeeklyKm: 6, recentDistanceKm: 3, level: 'advanced', goalKm: 5 }, 'base_building'],
      ['limitação', { hasLimitation: true, level: 'advanced', goalKm: 5 }, 'reabilitacao_segura'],
      ['prova', { goalType: 'race', level: 'advanced', goalKm: 10 }, 'atleta_de_prova'],
      ['express', { daysPerWeek: 3, goalTimeframeMonths: 3, effectiveWeeklyKm: 25, level: 'advanced', goalKm: 5 }, 'corredor_express'],
    ])('avançado de meta curta com %s → %s (regra anterior vence)', (_n, over, esperado) => {
      expect(key(over)).toBe(esperado);
    });
  });

  // ── Os demais ramos (fechando o branch coverage) ──────────────────────────

  describe('ramos de meta × nível', () => {
    it('beginner + 10k → explorador_limites', () => {
      expect(key({ level: 'beginner', goal: '10k', goalKm: 10 })).toBe(
        'explorador_limites',
      );
    });

    it('beginner + general_fitness → foco_saude (não Explorador)', () => {
      // general_fitness resolve para goalKm 10, mas não é meta de distância.
      expect(
        key({ level: 'beginner', goal: 'general_fitness', goalKm: 10 }),
      ).toBe('foco_saude');
    });

    it('intermediate → guerreiro_consistencia', () => {
      expect(key({ level: 'intermediate', goal: '5k', goalKm: 5 })).toBe(
        'guerreiro_consistencia',
      );
    });

    it('beginner + 5k com capacidade estabelecida → primeira_prova', () => {
      expect(key({ level: 'beginner', goal: '5k', goalKm: 5 })).toBe(
        'primeira_prova',
      );
    });
  });

  // ── hasLimitation compõe, não sobrescreve ────────────────────────────────

  it('a limitação volta como flag junto da chave escolhida', () => {
    const r = selectArchetypeKey(base({ neverRan: true, hasLimitation: true }));
    expect(r.key).toBe('walk_run_starter');
    expect(r.hasLimitation).toBe(true);
  });

  // ── A rede: varredura do espaço real de onboarding ────────────────────────

  describe('cobertura da cadeia (espaço real de onboarding)', () => {
    const DIST = [0, 3, 5, 10, 15];
    const FREQ = ['never', '1x', '2x', '3x', '4x_plus'];
    const KM = ['lt5', '5_10', '10_20', '20_30', 'gt30'];
    const LEVEL = ['beginner', 'intermediate', 'advanced'];
    const GOAL = ['5k', '10k', 'half_marathon', 'marathon', 'general_fitness'];
    const PACE: Record<number, number> = { 3: 7.5, 5: 6.5, 10: 5.8, 15: 5.2 };

    /** Percorre as combinações produzíveis pelo onboarding. */
    function sweep(visit: (i: ArchetypeSelectionInput, k: ArchetypeKey) => void) {
      for (const d of DIST)
        for (const level of LEVEL)
          for (const goal of GOAL)
            for (const daysPerWeek of [2, 3, 4, 5, 6])
              for (const tf of [1, 3, 6])
                for (const hasLimitation of [false, true])
                  for (const goalType of ['distance', 'race']) {
                    // "nunca corri" zera frequência/volume no fluxo real.
                    const freqs = d === 0 ? [null] : FREQ;
                    const kms = d === 0 ? [null] : KM;
                    for (const recentFrequency of freqs)
                      for (const currentWeeklyKm of kms) {
                        const goalKm = volumePlanner.resolveGoalKm({
                          goal,
                          goalType,
                          recentDistanceKm: d,
                        });
                        const capacity = volumePlanner.deriveEffectiveCapacity({
                          currentWeeklyKm,
                          recentFrequency,
                          recentDistanceKm: d,
                          level,
                        });
                        const input: ArchetypeSelectionInput = {
                          effectiveWeeklyKm: capacity.weeklyKm,
                          neverRan: capacity.neverRan,
                          recentDistanceKm: d,
                          recentFrequency,
                          goalKm,
                          goal,
                          goalType,
                          level,
                          daysPerWeek,
                          goalTimeframeMonths: tf,
                          paceMinPerKm: d === 0 ? null : PACE[d],
                          hasLimitation,
                        };
                        visit(input, selectArchetypeKey(input).key);
                      }
                  }
    }

    it('nenhum avançado sobra no fallback', () => {
      const sobrando: string[] = [];
      sweep((i, k) => {
        if (k === 'primeira_prova' && i.level === 'advanced') {
          sobrando.push(`${i.level}+${i.goal}`);
        }
      });
      expect(sobrando).toEqual([]);
    });

    it('o fallback recebe SÓ beginner com meta curta', () => {
      const perfis = new Set<string>();
      sweep((i, k) => {
        if (k === 'primeira_prova') perfis.add(`${i.level} + ${i.goal}`);
      });
      expect([...perfis]).toEqual(['beginner + 5k']);
    });

    it('nenhum "nunca correu" escapa do walk_run_starter', () => {
      let escapou = 0;
      sweep((i, k) => {
        if (i.neverRan && k !== 'walk_run_starter') escapou++;
      });
      expect(escapou).toBe(0);
    });

    it('todas as chaves do catálogo são alcançáveis, e nenhuma além delas', () => {
      const vistas = new Set<ArchetypeKey>();
      sweep((_i, k) => vistas.add(k));

      // Lista explícita em vez de contagem: se alguém adicionar uma chave e ela
      // nunca for atingida (regra inalcançável, como quase aconteceu com o
      // avançado de meta curta), o teste aponta QUAL falta.
      const esperadas: ArchetypeKey[] = [
        'walk_run_starter',
        'base_building',
        'detrained',
        'reabilitacao_segura',
        'atleta_de_prova',
        'corredor_express',
        'maratonista_nato',
        'aspirante_performance',
        'cacador_recordes',
        'explorador_limites',
        'guerreiro_consistencia',
        'foco_saude',
        'primeira_prova',
      ];
      expect([...vistas].sort()).toEqual([...esperadas].sort());
    });
  });
});
