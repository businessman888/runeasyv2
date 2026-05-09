type Goal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general_fitness';
type Level = 'beginner' | 'intermediate' | 'advanced';

export const GOAL_LABEL: Record<Goal, string> = {
    '5k': '5 km',
    '10k': '10 km',
    half_marathon: '21 km',
    marathon: '42 km',
    general_fitness: 'ficar em forma',
};

export const LEVEL_LABEL: Record<Level, string> = {
    beginner: 'Iniciante',
    intermediate: 'Intermediário',
    advanced: 'Avançado',
};

interface DifficultyCopy {
    difficulty: string;
    realistic: string;
}

const DIFFICULTY_MATRIX: Record<Goal, Record<Level, DifficultyCopy>> = {
    '5k': {
        beginner: { difficulty: 'totalmente alcançável', realistic: 'ideal para começar com segurança' },
        intermediate: { difficulty: 'extremamente fácil', realistic: 'um passo natural na sua jornada' },
        advanced: { difficulty: 'muito tranquila', realistic: 'pronta para ser superada com folga' },
    },
    '10k': {
        beginner: { difficulty: 'desafiadora porém alcançável', realistic: 'uma evolução real e segura' },
        intermediate: { difficulty: 'extremamente fácil', realistic: 'realista e tranquila' },
        advanced: { difficulty: 'muito tranquila', realistic: 'um aquecimento para metas maiores' },
    },
    half_marathon: {
        beginner: { difficulty: 'desafiadora mas possível', realistic: 'uma jornada que vai te transformar' },
        intermediate: { difficulty: 'totalmente alcançável', realistic: 'realista com a estrutura certa' },
        advanced: { difficulty: 'muito tranquila', realistic: 'pronta para ser conquistada com conforto' },
    },
    marathon: {
        beginner: { difficulty: 'desafiadora porém alcançável', realistic: 'uma meta marcante na sua vida' },
        intermediate: { difficulty: 'desafiadora e gratificante', realistic: 'realista com plano e disciplina' },
        advanced: { difficulty: 'totalmente alcançável', realistic: 'uma meta natural para o seu nível' },
    },
    general_fitness: {
        beginner: { difficulty: 'totalmente alcançável', realistic: 'um passo essencial para a sua saúde' },
        intermediate: { difficulty: 'extremamente acessível', realistic: 'uma evolução constante' },
        advanced: { difficulty: 'muito tranquila', realistic: 'a base para sustentar o alto desempenho' },
    },
};

export function getGoalAchievableCopy(goal: string | undefined, level: string | undefined) {
    const safeGoal = (goal as Goal) in GOAL_LABEL ? (goal as Goal) : '10k';
    const safeLevel = (level as Level) in LEVEL_LABEL ? (level as Level) : 'beginner';
    return {
        goalLabel: GOAL_LABEL[safeGoal],
        levelLabel: LEVEL_LABEL[safeLevel],
        ...DIFFICULTY_MATRIX[safeGoal][safeLevel],
    };
}
