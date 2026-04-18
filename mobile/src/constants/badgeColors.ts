// Shield fill color per badge type — index = tier - 1 (tier 1..5)
export const BADGE_TYPE_COLORS: Record<string, string[]> = {
  // milestone — Azul royal (distância, marcos)
  milestone:   ['#4A7FC1', '#3A6DB5', '#2A5AA8', '#1A4799', '#0A3485'],

  // performance — Vermelho/laranja (velocidade, intensidade)
  performance: ['#E07B54', '#D4633A', '#C84B22', '#BC3310', '#B01B00'],

  // consistency — Verde (constância, crescimento)
  consistency: ['#4CAF7A', '#3A9E68', '#288D56', '#167C44', '#046B32'],

  // streak — Âmbar/fogo (sequência, calor)
  streak:      ['#F5A623', '#E8921A', '#DB7E11', '#CE6A08', '#C15600'],

  // exploration — Índigo (descoberta, variedade)
  exploration: ['#7B68EE', '#6A55E0', '#5942D2', '#482FC4', '#371CB6'],

  // adherence — Esmeralda (comprometimento, disciplina)
  adherence:   ['#2DC6B4', '#1FB5A3', '#11A492', '#039381', '#008270'],
};

export function getBadgeShieldColor(type: string, tier: number): string {
  const palette = BADGE_TYPE_COLORS[type] ?? BADGE_TYPE_COLORS['milestone'];
  return palette[Math.min(Math.max(tier - 1, 0), palette.length - 1)];
}

// Stat pill accent color (reuses first tier color per type)
export const BADGE_STAT_COLORS: Record<string, string> = {
  milestone:   '#4A7FC1',
  performance: '#E07B54',
  consistency: '#4CAF7A',
  streak:      '#F5A623',
  exploration: '#7B68EE',
  adherence:   '#2DC6B4',
};
