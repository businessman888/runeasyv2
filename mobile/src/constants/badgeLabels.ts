// Short label rendered inside the shield — keyed by badge slug
export const BADGE_SHIELD_LABELS: Record<string, string> = {
  // Milestone
  primeiro_passo:    '1°',
  maratonista:       '21k',
  maratona_completa: '42k',
  cinquenta_km:      '50k',
  centuriao:         '100k',
  quinhentos_km:     '500k',
  mil_km:            '1M',
  subidor:           '500m',
  alpinista:         '5km↑',

  // Performance — pace
  velocista_i:       '5:30',
  velocista_ii:      '5:00',
  velocista_iii:     '4:30',
  velocista_iv:      '4:00',
  foguete:           '3:30',
  superacao:         '+5%',

  // Performance — tempo
  uma_hora:          '1h',
  duas_horas:        '2h',

  // Consistency
  consistente:       '12x',
  semana_completa:   '7d',

  // Streak
  ignicao:           '7d',
  chama_viva:        '14d',
  chama_eterna:      '30d',
  imortal:           '60d',

  // Exploration
  na_chuva_e_no_sol: '5×',
  madrugador:        '5:00',
  noturno:           '20h',
  diversificado:     '7d',

  // Adherence
  fiel_ao_plano:     '80%',
};

// Human-readable stat pill text per slug
export const BADGE_STAT_LABELS: Record<string, string> = {
  primeiro_passo:    '1° TREINO',
  maratonista:       '≥ 21 KM',
  maratona_completa: '42,195 KM',
  cinquenta_km:      '50 KM TOTAL',
  centuriao:         '100 KM TOTAL',
  quinhentos_km:     '500 KM TOTAL',
  mil_km:            '1.000 KM TOTAL',
  subidor:           '500 M ELEVAÇÃO',
  alpinista:         '5.000 M ACUM.',
  velocista_i:       'PACE < 5:30/KM',
  velocista_ii:      'PACE < 5:00/KM',
  velocista_iii:     'PACE < 4:30/KM',
  velocista_iv:      'PACE < 4:00/KM',
  foguete:           'PACE < 3:30/KM',
  superacao:         '+5% MELHORA',
  uma_hora:          '≥ 1 HORA',
  duas_horas:        '≥ 2 HORAS',
  consistente:       '12 TREINOS/30D',
  semana_completa:   'SEMANA PERFEITA',
  ignicao:           '7 DIAS SEGUIDOS',
  chama_viva:        '14 DIAS SEGUIDOS',
  chama_eterna:      '30 DIAS SEGUIDOS',
  imortal:           '60 DIAS SEGUIDOS',
  na_chuva_e_no_sol: '5 PERÍODOS DO DIA',
  madrugador:        '5 CORRIDAS 5–7H',
  noturno:           '5 CORRIDAS NOTURNAS',
  diversificado:     '7 DIAS DA SEMANA',
  fiel_ao_plano:     '80% ADERÊNCIA',
};

// Section titles per type
export const BADGE_TYPE_SECTION_LABELS: Record<string, string> = {
  milestone:   'DISTÂNCIA & MARCOS',
  performance: 'VELOCIDADE & PERFORMANCE',
  consistency: 'CONSISTÊNCIA',
  streak:      'SEQUÊNCIA',
  exploration: 'HÁBITOS & EXPLORAÇÃO',
  adherence:   'FIDELIDADE AO PLANO',
};

// Section display order
export const BADGE_TYPE_ORDER = [
  'milestone',
  'performance',
  'consistency',
  'streak',
  'exploration',
  'adherence',
] as const;
