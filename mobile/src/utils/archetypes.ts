/**
 * Archetype System — Deterministic mapping from onboarding quiz answers
 * to personalized plan briefing data. No AI needed.
 */

export interface SampleWorkout {
  title: string;
  duration: string;
  pace: string;
  type: string;
}

export interface Archetype {
  key: string;
  name: string;
  tagline: string;
  description: string;
  icon: string; // MaterialCommunityIcons name
  accentColor: string;
  chartPoints: number[]; // 8 Y-values for progression curve (0=top, 160=bottom)
  sampleWorkout: SampleWorkout;
  coachTip: string;
}

// ── Archetype Definitions ──

const ARCHETYPES: Record<string, Archetype> = {
  reabilitacao_segura: {
    key: 'reabilitacao_segura',
    name: 'Reabilitação Segura',
    tagline: 'Cuidado e evolução sem riscos',
    description:
      'Seu plano foi desenhado com foco em biomecânica e prevenção. Vamos evoluir no seu ritmo, respeitando seus limites e fortalecendo as áreas sensíveis.',
    icon: 'shield-check',
    accentColor: '#4ECDC4',
    chartPoints: [145, 140, 132, 122, 110, 95, 80, 65],
    sampleWorkout: {
      title: 'Caminhada Ativa + Trote Leve',
      duration: '25 min',
      pace: 'Pace 8:00',
      type: 'recovery',
    },
    coachTip:
      'Identificamos suas limitações e priorizamos exercícios de baixo impacto. A progressão será gradual para garantir segurança e resultados duradouros.',
  },

  corredor_express: {
    key: 'corredor_express',
    name: 'Corredor Express',
    tagline: 'Máximo resultado em poucos dias',
    description:
      'Com poucos dias disponíveis, cada sessão conta. Seu plano prioriza eficiência máxima por treino com intensidade estratégica.',
    icon: 'timer-sand',
    accentColor: '#FF6B6B',
    chartPoints: [140, 130, 115, 95, 72, 50, 30, 15],
    sampleWorkout: {
      title: 'HIIT de Corrida - 4km',
      duration: '30 min',
      pace: 'Pace 5:30',
      type: 'intervals',
    },
    coachTip:
      'Com sua disponibilidade reduzida, cada treino será otimizado para extrair o máximo. Sessões curtas e intensas vão acelerar sua evolução.',
  },

  maratonista_nato: {
    key: 'maratonista_nato',
    name: 'Maratonista Nato',
    tagline: 'Rumo ao seu melhor tempo',
    description:
      'Seu nível avançado e pace competitivo pedem um plano de periodização sofisticada. Foco em peak performance, taper e estratégia de prova.',
    icon: 'trophy',
    accentColor: '#FFD700',
    chartPoints: [135, 118, 100, 78, 55, 35, 18, 8],
    sampleWorkout: {
      title: 'Tempo Run - 12km',
      duration: '55 min',
      pace: 'Pace 4:40',
      type: 'tempo',
    },
    coachTip:
      'Seu pace indica maturidade de corredor. Vamos trabalhar limiar de lactato, longões progressivos e um taper inteligente para o dia da prova.',
  },

  aspirante_performance: {
    key: 'aspirante_performance',
    name: 'Aspirante a Performance',
    tagline: 'Evolução constante rumo à meta',
    description:
      'Sua meta ambiciosa exige volume e qualidade. O plano combina treinos intervalados, limiar de lactato e longões progressivos.',
    icon: 'rocket-launch',
    accentColor: '#7C5CFC',
    chartPoints: [138, 125, 108, 88, 65, 45, 28, 12],
    sampleWorkout: {
      title: 'Intervalado 6x800m',
      duration: '45 min',
      pace: 'Pace 5:00',
      type: 'intervals',
    },
    coachTip:
      'Para atingir sua meta de longa distância, vamos construir base aeróbica sólida e adicionar estímulos de velocidade progressivamente.',
  },

  explorador_limites: {
    key: 'explorador_limites',
    name: 'Explorador de Limites',
    tagline: 'Meta ambiciosa para quem está começando',
    description:
      'Você é iniciante com uma meta ousada. Vamos construir sua resistência de forma segura e progressiva até você cruzar a linha de chegada.',
    icon: 'compass',
    accentColor: '#00B4D8',
    chartPoints: [145, 138, 128, 115, 98, 78, 55, 35],
    sampleWorkout: {
      title: 'Rodagem Leve - 4km',
      duration: '35 min',
      pace: 'Pace 7:00',
      type: 'easy_run',
    },
    coachTip:
      'Sua meta é ambiciosa e vamos chegar lá! O segredo é paciência: primeiro construímos base, depois adicionamos distância e intensidade.',
  },

  guerreiro_consistencia: {
    key: 'guerreiro_consistencia',
    name: 'Guerreiro da Consistência',
    tagline: 'Regularidade que transforma',
    description:
      'Com experiência intermediária, o foco é manter consistência, melhorar seu pace e consolidar sua evolução como corredor.',
    icon: 'lightning-bolt',
    accentColor: '#FF9F1C',
    chartPoints: [140, 128, 112, 94, 74, 52, 32, 15],
    sampleWorkout: {
      title: 'Rodagem Moderada - 6km',
      duration: '35 min',
      pace: 'Pace 5:45',
      type: 'easy_run',
    },
    coachTip:
      'Sua experiência é seu maior ativo. Vamos trabalhar melhoria de pace com treinos variados e manter a consistência que traz resultados.',
  },

  foco_saude: {
    key: 'foco_saude',
    name: 'Foco em Saúde',
    tagline: 'Corrida como estilo de vida',
    description:
      'Seu objetivo é saúde e bem-estar. O plano prioriza zonas de frequência cardíaca baixa (Z2), queima calórica e prazer na corrida.',
    icon: 'heart-pulse',
    accentColor: '#E84393',
    chartPoints: [142, 135, 125, 112, 97, 80, 62, 45],
    sampleWorkout: {
      title: 'Corrida Z2 - 4km',
      duration: '30 min',
      pace: 'Pace 7:30',
      type: 'easy_run',
    },
    coachTip:
      'Correr em zona aeróbica confortável é a melhor forma de criar o hábito. Vamos focar em prazer e constância, os resultados vêm naturalmente.',
  },

  o_recomeco: {
    key: 'o_recomeco',
    name: 'O Recomeço',
    tagline: 'Cada passo é uma conquista',
    description:
      'Estamos começando do zero e isso é incrível. Base aeróbica progressiva e fortalecimento articular vão preparar seu corpo para evoluir.',
    icon: 'sprout',
    accentColor: '#26DE81',
    chartPoints: [148, 142, 135, 125, 112, 95, 75, 55],
    sampleWorkout: {
      title: 'Caminhada + Trote - 3km',
      duration: '25 min',
      pace: 'Pace 8:30',
      type: 'easy_run',
    },
    coachTip:
      'O primeiro passo é o mais importante. Vamos alternar caminhada e trote para construir condicionamento de forma segura e prazerosa.',
  },
};

// ── Archetype Determination (Priority-Based) ──

interface ArchetypeInput {
  goal: string;
  experience_level: string;
  daysPerWeek: number;
  goalTimeframe: number | null;
  calculatedPace: number | null;
  limitations?: { hasLimitation: boolean; details?: string } | null;
  hasInjury?: boolean;
}

export function determineArchetype(data: ArchetypeInput): Archetype {
  const {
    goal,
    experience_level: level,
    daysPerWeek,
    goalTimeframe,
    calculatedPace,
    limitations,
    hasInjury,
  } = data;

  const hasLimitation = limitations?.hasLimitation || hasInjury || false;
  const pace = calculatedPace || 7.0;
  const timeframe = goalTimeframe || 3;

  // Priority 1: Reabilitação Segura
  if (hasLimitation) {
    return ARCHETYPES.reabilitacao_segura;
  }

  // Priority 2: Corredor Express
  if (daysPerWeek <= 3 && timeframe <= 3) {
    return ARCHETYPES.corredor_express;
  }

  // Priority 3: Maratonista Nato
  if (level === 'advanced' && goal === 'marathon' && pace < 5.5) {
    return ARCHETYPES.maratonista_nato;
  }

  // Priority 4: Aspirante a Performance
  if (
    (level === 'intermediate' || level === 'advanced') &&
    (goal === 'half_marathon' || goal === 'marathon')
  ) {
    return ARCHETYPES.aspirante_performance;
  }

  // Priority 5: Explorador de Limites
  if (
    level === 'beginner' &&
    (goal === '10k' || goal === 'half_marathon')
  ) {
    return ARCHETYPES.explorador_limites;
  }

  // Priority 6: Guerreiro da Consistência
  if (
    level === 'intermediate' &&
    (goal === '5k' || goal === '10k' || goal === 'general_fitness')
  ) {
    return ARCHETYPES.guerreiro_consistencia;
  }

  // Priority 7: Foco em Saúde
  if (goal === 'general_fitness' && level !== 'advanced') {
    return ARCHETYPES.foco_saude;
  }

  // Priority 8: O Recomeço (fallback)
  return ARCHETYPES.o_recomeco;
}

// ── Dynamic Text Helpers ──

const GOAL_LABELS: Record<string, string> = {
  '5k': '5km',
  '10k': '10km',
  half_marathon: '21km',
  marathon: '42km',
  general_fitness: 'Fitness',
};

const GOAL_DESCRIPTIONS: Record<string, string> = {
  '5k': '5km Sub-30',
  '10k': '10km Sub-50',
  half_marathon: '21km Sub-2h',
  marathon: '42km Sub-4h',
  general_fitness: 'Fitness Geral',
};

export function getGoalLabel(goal: string): string {
  return GOAL_LABELS[goal] || '10km';
}

export function getGoalDescription(goal: string): string {
  return GOAL_DESCRIPTIONS[goal] || '10km Sub-50';
}

export function getGoalGainText(goal: string, goalTimeframe: number | null): string {
  const label = GOAL_LABELS[goal] || '10km';
  const months = goalTimeframe || 3;
  return `+${label} em ${months} ${months === 1 ? 'mês' : 'meses'}`;
}

export function getWeeklyVolumeEstimate(
  recentDistance: number | null,
  daysPerWeek: number,
): string {
  const base = recentDistance || 5;
  const low = Math.round(base * daysPerWeek * 0.6);
  const high = Math.round(base * daysPerWeek * 0.9);
  return `${low}-${high}km/semana`;
}

export function formatPace(paceMinutes: string, paceSeconds: string): string {
  const min = paceMinutes || '7';
  const sec = (paceSeconds || '0').padStart(2, '0');
  return `${min}:${sec}`;
}

export { ARCHETYPES };
