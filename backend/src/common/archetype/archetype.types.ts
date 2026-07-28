/**
 * Tipos da seleção de arquétipo (perfil do corredor).
 *
 * O arquétipo é escolhido no BACKEND, a partir da MESMA capacidade efetiva que
 * o motor de volume usa para gerar o plano. O mobile recebe só a CHAVE e busca
 * a narrativa (nome, cor, tagline, dica) no catálogo local — a embalagem nunca
 * pode discordar do plano que está sendo prometido.
 */

/** Chaves de arquétipo. As três primeiras são perfis de CAPACIDADE (Fase A/B). */
export type ArchetypeKey =
  // ── Perfis estruturais (capacidade / viabilidade) ──
  | 'walk_run_starter' // nunca correu → protocolo caminhada/corrida
  | 'base_building' // capacidade baixa sem histórico → construir base
  | 'detrained' // já correu distância, mas está destreinado hoje
  // ── Perfis existentes ──
  | 'reabilitacao_segura'
  | 'atleta_de_prova'
  | 'corredor_express'
  | 'maratonista_nato'
  | 'aspirante_performance'
  | 'explorador_limites'
  | 'guerreiro_consistencia'
  | 'foco_saude'
  | 'o_recomeco';

export interface ArchetypeSelectionInput {
  /** Capacidade efetiva derivada pelo motor de volume (Fase B). */
  effectiveWeeklyKm: number;
  neverRan: boolean;

  /** Sinais crus do onboarding. */
  recentDistanceKm?: number | null;
  recentFrequency?: string | null;
  goalKm: number;
  /** Meta declarada ('5k'|'10k'|'half_marathon'|'marathon'|'general_fitness'). */
  goal?: string | null;
  goalType?: string | null;
  level?: string | null;
  daysPerWeek: number;
  /** Horizonte em MESES (null no caminho de prova). */
  goalTimeframeMonths?: number | null;
  /** Pace de referência em min/km decimal (só para desempatar o topo). */
  paceMinPerKm?: number | null;
  hasLimitation: boolean;
}

export interface ArchetypeSelection {
  key: ArchetypeKey;
  /**
   * Limitação/lesão declarada. Vem SEPARADO da chave para COMPOR com qualquer
   * perfil: quem nunca correu e tem limitação recebe `walk_run_starter` (o
   * protocolo correto) com o aviso de segurança por cima, em vez de perder o
   * perfil estrutural para um arquétipo genérico.
   */
  hasLimitation: boolean;
}
