/**
 * Catálogo de NARRATIVAS de arquétipo — a "embalagem" do plano.
 *
 * ⚠️ Este arquivo NÃO decide mais nada sobre o treino. A chave do arquétipo e
 * TODOS os números do treino #1 (distância, pace, duração, tipo) vêm do backend,
 * via `POST /training/onboarding/preview`, calculados pelos mesmos motores
 * determinísticos que geram o plano real. Aqui ficam só nome, cor, tagline,
 * curva do gráfico e dica do coach.
 *
 * Antes, este arquivo escolhia o arquétipo por uma cadeia de `if`s e carregava
 * distância/pace/duração como STRING HARDCODED (`'HIIT de Corrida - 4km'`,
 * `'Pace 5:30'`). Isso divergia do plano real em 1,5×–6× na distância e até
 * 3:20/km no pace — e mostrava HIIT para quem nunca tinha corrido. Ver
 * `auditorias/2026-07-27-briefing-previa-treino-e-arquetipo.md`.
 */

/** Espelha `ArchetypeKey` do backend (common/archetype/archetype.types.ts). */
export type ArchetypeKey =
    | 'walk_run_starter'
    | 'base_building'
    | 'detrained'
    | 'reabilitacao_segura'
    | 'atleta_de_prova'
    | 'corredor_express'
    | 'maratonista_nato'
    | 'aspirante_performance'
    | 'explorador_limites'
    | 'guerreiro_consistencia'
    | 'foco_saude'
    | 'o_recomeco';

export interface ArchetypeNarrative {
    key: ArchetypeKey | 'neutro';
    name: string;
    tagline: string;
    icon: string; // MaterialCommunityIcons
    accentColor: string;
    chartPoints: number[]; // 8 valores Y da curva (0=topo, 160=base)
    coachTip: string;
}

const ARCHETYPE_NARRATIVES: Record<ArchetypeKey, ArchetypeNarrative> = {
    // ══ Perfis de capacidade (Fase A/B) ════════════════════════════════════════

    walk_run_starter: {
        key: 'walk_run_starter',
        name: 'O Primeiro Passo',
        tagline: 'Toda jornada começa com um passo — o seu começa agora.',
        // `shoe-print` (pegada) e não `walk`: o BriefingScreen já usa `walk` no
        // círculo do card de treino no modo caminhada/corrida.
        icon: 'shoe-print',
        accentColor: '#7BE495',
        chartPoints: [150, 145, 138, 128, 116, 100, 80, 58],
        coachTip:
            'Você vai alternar caminhada e corrida, no seu tempo. Sem pace, sem pressão — o objetivo é criar o hábito e deixar o corpo se adaptar. Cada treino te deixa mais forte que o anterior.',
    },

    base_building: {
        key: 'base_building',
        name: 'Construtor de Base',
        tagline: 'A base sólida hoje é a performance de amanhã.',
        icon: 'wall',
        accentColor: '#4D96FF',
        chartPoints: [148, 142, 134, 124, 111, 95, 77, 57],
        coachTip:
            'Seu plano prioriza consistência antes de intensidade. Vamos aumentar seu volume de forma gradual e segura — é assim que se constrói um corredor que dura, sem lesão e sem queimar etapas.',
    },

    detrained: {
        key: 'detrained',
        // "Retomada Inteligente" e não "O Retorno": este último colidia com o
        // arquétipo existente "O Recomeço" (mesmo formato e mesmo sentido).
        name: 'Retomada Inteligente',
        tagline: 'Seu corpo lembra. Vamos reacender isso com inteligência.',
        icon: 'restore',
        accentColor: '#FF8A3D',
        chartPoints: [146, 136, 123, 108, 90, 70, 48, 28],
        coachTip:
            'Você já teve condicionamento, e ele volta mais rápido do que veio da primeira vez. Mas vamos respeitar onde você está hoje, não onde já esteve — retomar com calma é o que evita a lesão que interrompe de novo.',
    },

    // ══ Perfis de meta × nível ═════════════════════════════════════════════════

    atleta_de_prova: {
        key: 'atleta_de_prova',
        name: 'Atleta de Prova',
        tagline: 'Cada treino te aproxima da linha de chegada.',
        icon: 'flag-checkered',
        accentColor: '#FFB800',
        chartPoints: [148, 130, 108, 88, 68, 48, 28, 12],
        coachTip:
            'A fase de taper pode parecer estranha — você vai sentir vontade de treinar mais. Confie no processo: é quando o corpo absorve todo o trabalho.',
    },

    reabilitacao_segura: {
        key: 'reabilitacao_segura',
        name: 'Reabilitação Segura',
        tagline: 'Cuidado e evolução sem riscos',
        icon: 'shield-check',
        accentColor: '#4ECDC4',
        chartPoints: [145, 140, 132, 122, 110, 95, 80, 65],
        coachTip:
            'Identificamos suas limitações e priorizamos exercícios de baixo impacto. A progressão será gradual para garantir segurança e resultados duradouros.',
    },

    corredor_express: {
        key: 'corredor_express',
        name: 'Corredor Express',
        tagline: 'Máximo resultado em poucos dias',
        icon: 'timer-sand',
        accentColor: '#FF6B6B',
        chartPoints: [140, 130, 115, 95, 72, 50, 30, 15],
        coachTip:
            'Com sua disponibilidade reduzida, cada treino será otimizado para extrair o máximo. Sessões curtas e intensas vão acelerar sua evolução.',
    },

    maratonista_nato: {
        key: 'maratonista_nato',
        name: 'Maratonista Nato',
        tagline: 'Rumo ao seu melhor tempo',
        icon: 'trophy',
        accentColor: '#FFD700',
        chartPoints: [135, 118, 100, 78, 55, 35, 18, 8],
        coachTip:
            'Seu pace indica maturidade de corredor. Vamos trabalhar limiar de lactato, longões progressivos e um taper inteligente para o dia da prova.',
    },

    aspirante_performance: {
        key: 'aspirante_performance',
        name: 'Aspirante a Performance',
        tagline: 'Evolução constante rumo à meta',
        icon: 'rocket-launch',
        accentColor: '#7C5CFC',
        chartPoints: [138, 125, 108, 88, 65, 45, 28, 12],
        coachTip:
            'Para atingir sua meta de longa distância, vamos construir base aeróbica sólida e adicionar estímulos de velocidade progressivamente.',
    },

    explorador_limites: {
        key: 'explorador_limites',
        name: 'Explorador de Limites',
        tagline: 'Meta ambiciosa para quem está começando',
        icon: 'compass',
        accentColor: '#00B4D8',
        chartPoints: [145, 138, 128, 115, 98, 78, 55, 35],
        coachTip:
            'Sua meta é ambiciosa e vamos chegar lá! O segredo é paciência: primeiro construímos base, depois adicionamos distância e intensidade.',
    },

    guerreiro_consistencia: {
        key: 'guerreiro_consistencia',
        name: 'Guerreiro da Consistência',
        tagline: 'Regularidade que transforma',
        icon: 'lightning-bolt',
        accentColor: '#FF9F1C',
        chartPoints: [140, 128, 112, 94, 74, 52, 32, 15],
        coachTip:
            'Sua experiência é seu maior ativo. Vamos trabalhar melhoria de pace com treinos variados e manter a consistência que traz resultados.',
    },

    foco_saude: {
        key: 'foco_saude',
        name: 'Foco em Saúde',
        tagline: 'Corrida como estilo de vida',
        icon: 'heart-pulse',
        accentColor: '#E84393',
        chartPoints: [142, 135, 125, 112, 97, 80, 62, 45],
        coachTip:
            'Correr em zona aeróbica confortável é a melhor forma de criar o hábito. Vamos focar em prazer e constância, os resultados vêm naturalmente.',
    },

    o_recomeco: {
        key: 'o_recomeco',
        name: 'O Recomeço',
        tagline: 'Cada passo é uma conquista',
        icon: 'sprout',
        accentColor: '#26DE81',
        chartPoints: [148, 142, 135, 125, 112, 95, 75, 55],
        coachTip:
            'O primeiro passo é o mais importante. Vamos alternar caminhada e trote para construir condicionamento de forma segura e prazerosa.',
    },
};

/**
 * Narrativa NEUTRA — fallback quando o `/preview` falha (rede, timeout, deploy).
 *
 * De propósito NÃO é um dos arquétipos reais: prometer "Maratonista Nato" sem ter
 * calculado nada é o bug que esta refatoração corrigiu. Aqui a tela assume que
 * ainda não sabe, e o card de treino some (nenhum número inventado).
 */
export const NEUTRAL_NARRATIVE: ArchetypeNarrative = {
    key: 'neutro',
    name: 'Plano Personalizado',
    tagline: 'Montado a partir das suas respostas.',
    icon: 'lightning-bolt-circle',
    accentColor: '#00D4FF',
    chartPoints: [140, 130, 115, 95, 70, 45, 25, 10],
    coachTip:
        'Seu plano é montado a partir do seu histórico, da sua disponibilidade e da sua meta — com progressão calculada semana a semana.',
};

/** Busca a narrativa pela chave vinda do backend. Chave ausente/desconhecida → neutra. */
export function getArchetypeNarrative(key?: string | null): ArchetypeNarrative {
    if (!key) return NEUTRAL_NARRATIVE;
    return ARCHETYPE_NARRATIVES[key as ArchetypeKey] ?? NEUTRAL_NARRATIVE;
}

// ── Helpers de texto da meta ────────────────────────────────────────────────

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

/**
 * Formata o pace DECLARADO pelo usuário no onboarding ("7", "30" → "7:30").
 * Retorna `null` quando não há pace declarado — quem nunca correu não tem pace,
 * e a tela não pode inventar um. (O `|| '7'` que fabricava "7:00" foi removido.)
 */
export function formatDeclaredPace(
    paceMinutes?: string | null,
    paceSeconds?: string | null,
): string | null {
    if (!paceMinutes) return null;
    const sec = (paceSeconds || '0').padStart(2, '0');
    return `${paceMinutes}:${sec}`;
}

export { ARCHETYPE_NARRATIVES };
