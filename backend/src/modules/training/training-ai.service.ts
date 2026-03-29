import { Injectable, Logger } from '@nestjs/common';
import { AIRouterService, AI_FEATURES } from '../../common/ai';

export interface TrainingPlanRequest {
  goal: string;
  level: string;
  daysPerWeek: number;
  currentPace5k: number | null;
  targetWeeks: number;
  limitations: string | null;
  preferredDays: number[];
  startDate?: string | null; // ISO date string (YYYY-MM-DD)
  // Manual overrides from Customize Screen
  targetTime?: string; // e.g., "01:55:00"
  targetPace?: string; // e.g., "5:30"
}

// New interfaces for PlanPreview screen
export interface PlanHeader {
  objectiveShort: string;
  durationWeeks: string;
  frequencyWeekly: string;
}

export interface NextWorkout {
  title: string;
  duration: string;
  paceEstimate: string;
  type: string;
}

export interface WeekWorkout {
  day: number;
  type: string;
  title: string;
  distance_km: number;
  duration: string;
  pace: string;
}

export interface ScheduleWeek {
  week: number;
  focus: string;
  workouts: WeekWorkout[];
}

export interface GeneratedPlanPreview {
  planHeader: PlanHeader;
  planHeadline: string;
  welcomeBadge: string;
  nextWorkout: NextWorkout;
  fullSchedulePreview: ScheduleWeek[];
}

// Quick plan result from Prompt 1 (fast ~3-5s)
export interface QuickPlanResult {
  planHeader: PlanHeader;
  planHeadline: string;
  welcomeBadge: string;
  nextWorkout: NextWorkout;
  firstWeek: GeneratedWeek;
  duration_weeks: number;
  frequency_per_week: number;
}

// Full schedule result from Prompt 2 (background)
export interface FullScheduleResult {
  weeks: GeneratedWeek[];
}

// Old interfaces for database storage (kept for compatibility)
export interface GeneratedWorkout {
  day_of_week: number;
  type: 'easy_run' | 'long_run' | 'intervals' | 'tempo' | 'recovery';
  distance_km: number;
  segments: Array<{
    type: 'warmup' | 'main' | 'cooldown';
    distance_km: number;
    pace_min: number;
    pace_max: number;
  }>;
  objective: string;
  tips: string[];
}

export interface GeneratedWeek {
  week_number: number;
  phase: 'base' | 'build' | 'peak' | 'taper';
  workouts: GeneratedWorkout[];
}

export interface GeneratedPlan {
  duration_weeks: number;
  frequency_per_week: number;
  weeks: GeneratedWeek[];
  // New fields for PlanPreview (returned directly from AI)
  planHeader?: PlanHeader;
  planHeadline?: string;
  welcomeBadge?: string;
  nextWorkout?: NextWorkout;
  fullSchedulePreview?: ScheduleWeek[];
}

@Injectable()
export class TrainingAIService {
  private readonly logger = new Logger(TrainingAIService.name);

  constructor(private aiRouter: AIRouterService) {}

  // Shared helper maps
  private readonly goalDescriptions: Record<string, string> = {
    '5k': 'Completar/melhorar tempo em prova de 5km',
    '10k': 'Completar/melhorar tempo em prova de 10km',
    'half_marathon': 'Completar/melhorar tempo em meia maratona (21.1km)',
    'marathon': 'Completar/melhorar tempo em maratona (42.2km)',
    'general_fitness': 'Melhorar condicionamento físico geral para corrida',
  };

  private readonly levelDescriptions: Record<string, string> = {
    'beginner': 'Iniciante (0-6 meses de experiência)',
    'intermediate': 'Intermediário (6-24 meses de experiência)',
    'advanced': 'Avançado (2+ anos de experiência)',
  };

  private readonly goalLabels: Record<string, string> = {
    '5k': '5km',
    '10k': '10km',
    'half_marathon': 'Meia Maratona',
    'marathon': 'Maratona',
    'general_fitness': 'Fitness',
  };

  private readonly levelLabels: Record<string, string> = {
    'beginner': 'Corredor Iniciante',
    'intermediate': 'Corredor Intermediário',
    'advanced': 'Corredor Avançado',
  };

  /**
   * PROMPT 1 (FAST): Generate only the first workout and plan header
   * Target response time: ~3-5 seconds
   */
  async generateFirstWorkout(request: TrainingPlanRequest): Promise<QuickPlanResult> {
    // GUARD: Clamp unrealistic pace values before sending to AI
    let safePace = request.currentPace5k;
    if (safePace !== null && safePace !== undefined) {
      if (safePace > 15.0) {
        this.logger.warn(`[Pace Guard] Pace ${safePace.toFixed(2)} min/km is unrealistic (>15), defaulting to 7.0`);
        safePace = 7.0;
      } else if (safePace < 2.0) {
        this.logger.warn(`[Pace Guard] Pace ${safePace.toFixed(2)} min/km is impossibly fast (<2), clamping to 3.0`);
        safePace = 3.0;
      }
    }

    const systemPrompt = `Você é um treinador de corrida de elite da RunEasy. Sua tarefa é analisar o perfil do atleta e gerar APENAS o primeiro treino inicial.

REGRA CRÍTICA: Sua resposta deve ser APENAS um objeto JSON válido, sem nenhum texto antes ou depois.

O JSON deve seguir estritamente este schema:

{
  "planHeader": {
    "objectiveShort": "String (ex: 10km)",
    "durationWeeks": "String (ex: 12 Sem)",
    "frequencyWeekly": "String (ex: 4x/Sem)"
  },
  "planHeadline": "String (ex: Personalizado para sua meta de 10km Sub-50' com base na sua performance.)",
  "welcomeBadge": "String (ex: Corredor Iniciante)",
  "nextWorkout": {
    "title": "String (ex: Rodagem Leve - 5 km)",
    "duration": "String (ex: 35 min)",
    "paceEstimate": "String (ex: Pace 5:30)",
    "type": "run"
  },
  "duration_weeks": 12,
  "frequency_per_week": 4,
  "firstWeek": {
    "week_number": 1,
    "phase": "base",
    "workouts": [
      {
        "day_of_week": 1,
        "type": "easy_run",
        "distance_km": 5,
        "segments": [
          {"type": "warmup", "distance_km": 1, "pace_min": 7.0, "pace_max": 7.5},
          {"type": "main", "distance_km": 3, "pace_min": 6.5, "pace_max": 7.0},
          {"type": "cooldown", "distance_km": 1, "pace_min": 7.0, "pace_max": 7.5}
        ],
        "objective": "Desenvolver base aeróbica na Zona 2",
        "tips": ["Mantenha cadência entre 170-180 passos/min", "Respire naturalmente"]
      }
    ]
  }
}

REGRAS:
1. Gere APENAS a primeira semana com os treinos detalhados
2. O nextWorkout deve ser o primeiro treino da semana
3. Tipos válidos: easy_run, long_run, intervals, tempo, recovery
4. Fase da semana 1 é sempre "base"`;

    const userPrompt = `Crie o PRIMEIRO TREINO para um corredor com este perfil:

PERFIL DO CORREDOR (Quiz Responses):
P1. Objetivo: ${this.goalDescriptions[request.goal] || request.goal}
P2. Nível: ${this.levelDescriptions[request.level] || request.level}
P3. Frequência disponível: ${request.daysPerWeek} dias/semana
P4. Pace atual 5K: ${safePace ? `${safePace.toFixed(2)} min/km` : 'Não sei (iniciante)'}
P5. Prazo para objetivo: ${request.targetWeeks} semanas
P6. Limitações/Lesões: ${request.limitations || 'Nenhuma'}

VALORES PARA O JSON:
- objectiveShort: "${this.goalLabels[request.goal] || request.goal}"
- durationWeeks: "${request.targetWeeks} Sem"
- frequencyWeekly: "${request.daysPerWeek}x/Sem"
- welcomeBadge: "${this.levelLabels[request.level] || 'Corredor'}"
- duration_weeks: ${request.targetWeeks}
- frequency_per_week: ${request.daysPerWeek}

REGRAS PARA O TREINO:
1. Crie a semana 1 com ${request.daysPerWeek} treinos
2. O primeiro treino deve ser leve (easy_run ou recovery)
3. Se iniciante sem pace, use 7:00 min/km como base
${request.targetPace ? `4. PACE ALVO DEFINIDO: O usuário definiu meta de pace médio ${request.targetPace} min/km. Ajuste os treinos para progressivamente chegar lá.` : '4. Pace de rodagem leve: pace_5k + 0.5 a 1.0 min/km'}
${request.limitations ? `5. IMPORTANTE: Adapte considerando: ${request.limitations}` : ''}

Responda APENAS com o JSON.`;

    try {
      this.logger.log('[Prompt 1] Generating first workout...');

      const result = await this.aiRouter.call<QuickPlanResult>({
        featureName: AI_FEATURES.PLAN_GENERATION_FIRST,
        systemPrompt: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
        userMessage: userPrompt,
        maxTokens: 4000,
      });

      this.logger.log(`[Prompt 1] First workout generated in ${result.latencyMs}ms`);
      return result.data;
    } catch (error) {
      this.logger.error('[Prompt 1] Failed to generate first workout', error);
      throw error;
    }
  }

  /**
   * PROMPT 2 (BACKGROUND): Generate remaining weeks of the training plan
   * This runs in the background after Prompt 1 succeeds
   */
  async generateRemainingSchedule(
    request: TrainingPlanRequest,
    firstWeek: GeneratedWeek,
  ): Promise<FullScheduleResult> {
    const systemPrompt = `Você é um treinador de corrida de elite da RunEasy. Você já gerou a Semana 1 do plano de treino. Agora precisa gerar as semanas restantes.

REGRA CRÍTICA: Sua resposta deve ser APENAS um objeto JSON válido com as semanas 2 até ${request.targetWeeks}.

O JSON deve seguir este schema:

{
  "weeks": [
    {
      "week_number": 2,
      "phase": "base",
      "workouts": [
        {
          "day_of_week": 1,
          "type": "easy_run",
          "distance_km": 5,
          "segments": [
            {"type": "warmup", "distance_km": 1, "pace_min": 7.0, "pace_max": 7.5},
            {"type": "main", "distance_km": 3, "pace_min": 6.5, "pace_max": 7.0},
            {"type": "cooldown", "distance_km": 1, "pace_min": 7.0, "pace_max": 7.5}
          ],
          "objective": "Desenvolver base aeróbica na Zona 2",
          "tips": ["Dica 1", "Dica 2"]
        }
      ]
    }
  ]
}

Tipos de treino válidos: easy_run, long_run, intervals, tempo, recovery
Fases válidas: base, build, peak, taper`;

    const userPrompt = `Continue o plano de treino. A Semana 1 já foi gerada:

${JSON.stringify(firstWeek, null, 2)}

PERFIL DO CORREDOR:
- Objetivo: ${this.goalDescriptions[request.goal] || request.goal}
- Nível: ${this.levelDescriptions[request.level] || request.level}
- Frequência: ${request.daysPerWeek} dias/semana
- Pace 5K: ${request.currentPace5k ? `${request.currentPace5k.toFixed(2)} min/km` : 'Iniciante (usar 7:00)'}
- Total de semanas: ${request.targetWeeks}
- Limitações: ${request.limitations || 'Nenhuma'}

Gere as SEMANAS 2 até ${request.targetWeeks} seguindo esta progressão:
1. ${request.daysPerWeek} treinos por semana
2. Variedade: rodagem leve (60%), long run (20%), intervalados/tempo (20%)
3. Distribuição de fases: base (40%), build (30%), peak (20%), taper (10%)
4. Aumente volume progressivamente até semana de peak, depois reduza no taper
5. Mantenha consistência de paces com a Semana 1
${request.targetPace ? `6. IMPORTANTE: O objetivo final é correr no pace ${request.targetPace} min/km. Aumente a intensidade gradualmente para atingir isso na semana de prova.` : ''}

Responda APENAS com o JSON contendo as semanas 2 até ${request.targetWeeks}.`;

    try {
      this.logger.log(`[Prompt 2] Generating weeks 2-${request.targetWeeks}...`);

      const result = await this.aiRouter.call<FullScheduleResult>({
        featureName: AI_FEATURES.PLAN_GENERATION_REMAINING,
        systemPrompt: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
        userMessage: userPrompt,
        maxTokens: 20000,
      });

      this.logger.log(`[Prompt 2] Generated ${result.data.weeks?.length || 0} weeks in ${result.latencyMs}ms`);
      return result.data;
    } catch (error) {
      this.logger.error('[Prompt 2] Failed to generate remaining schedule', error);
      throw error;
    }
  }

  /**
   * Generate a personalized training plan using Claude AI (LEGACY - full plan at once)
   * @deprecated Use generateFirstWorkout + generateRemainingSchedule for better UX
   */
  async generateTrainingPlan(request: TrainingPlanRequest): Promise<GeneratedPlan> {
    const systemPrompt = `Você é um treinador de corrida de elite da RunEasy. Sua tarefa é analisar o perfil do atleta baseado nas respostas do quiz e gerar um plano de treino estruturado.

REGRA CRÍTICA: Sua resposta deve ser APENAS um objeto JSON válido, sem nenhum texto antes ou depois, markdown ou explicações.

O JSON deve seguir estritamente este schema para renderizar a tela do aplicativo:

{
  "planHeader": {
    "objectiveShort": "String (ex: 10km)",
    "durationWeeks": "String (ex: 12 Sem)",
    "frequencyWeekly": "String (ex: 4x/Sem)"
  },
  "planHeadline": "String (ex: Personalizado para sua meta de 10km Sub-50' com base na sua performance.)",
  "welcomeBadge": "String (ex: Corredor Iniciante)",
  "nextWorkout": {
    "title": "String (ex: Rodagem Leve - 5 km)",
    "duration": "String (ex: 35 min)",
    "paceEstimate": "String (ex: Pace 5:30)",
    "type": "run"
  },
  "fullSchedulePreview": [
    {
      "week": 1,
      "focus": "Adaptação",
      "workouts": [
        {
          "day": 1,
          "type": "easy_run",
          "title": "Rodagem Leve",
          "distance_km": 5,
          "duration": "35 min",
          "pace": "7:00 min/km"
        }
      ]
    }
  ],
  "duration_weeks": 12,
  "frequency_per_week": 4,
  "weeks": [
    {
      "week_number": 1,
      "phase": "base",
      "workouts": [
        {
          "day_of_week": 1,
          "type": "easy_run",
          "distance_km": 5,
          "segments": [
            {"type": "warmup", "distance_km": 1, "pace_min": 7.0, "pace_max": 7.5},
            {"type": "main", "distance_km": 3, "pace_min": 6.5, "pace_max": 7.0},
            {"type": "cooldown", "distance_km": 1, "pace_min": 7.0, "pace_max": 7.5}
          ],
          "objective": "Desenvolver base aeróbica na Zona 2",
          "tips": ["Mantenha cadência entre 170-180 passos/min", "Respire naturalmente"]
        }
      ]
    }
  ]
}

REGRAS IMPORTANTES:
1. O campo "weeks" é usado para salvar no banco de dados
2. O campo "fullSchedulePreview" é uma versão simplificada para exibição na tela
3. Ambos devem ter o mesmo conteúdo, apenas em formatos diferentes
4. Tipos de treino válidos: easy_run, long_run, intervals, tempo, recovery
5. Fases válidas: base, build, peak, taper`;

    const userPrompt = `Crie um plano de treino personalizado com os seguintes parâmetros:

PERFIL DO CORREDOR (Quiz Responses):
P1. Objetivo: ${this.goalDescriptions[request.goal] || request.goal}
P2. Nível: ${this.levelDescriptions[request.level] || request.level}
P3. Frequência disponível: ${request.daysPerWeek} dias/semana
P4. Pace atual 5K: ${request.currentPace5k ? `${request.currentPace5k.toFixed(2)} min/km` : 'Não sei (iniciante)'}
P5. Prazo para objetivo: ${request.targetWeeks} semanas
P6. Limitações/Lesões: ${request.limitations || 'Nenhuma'}

VALORES PARA O JSON:
- objectiveShort: "${this.goalLabels[request.goal] || request.goal}"
- durationWeeks: "${request.targetWeeks} Sem"
- frequencyWeekly: "${request.daysPerWeek}x/Sem"
- welcomeBadge: "${this.levelLabels[request.level] || 'Corredor'}"

REGRAS PARA O PLANO:
1. Crie um plano de ${request.targetWeeks} semanas
2. ${request.daysPerWeek} treinos por semana
3. Inclua variedade: rodagem leve (60%), long run (20%), intervalados/tempo (20%)
4. Pace de recuperação: pace_5k + 1.5 min/km
5. Pace de rodagem leve: pace_5k + 0.5 a 1.0 min/km
6. Pace de long run: pace_5k + 0.5 min/km
7. Pace de intervalado: pace_5k - 0.5 min/km
8. Se iniciante sem pace, use 7:00 min/km como base
9. Divida em fases: base (40%), build (30%), peak (20%), taper (10%)
${request.limitations ? `10. IMPORTANTE: Adapte o plano considerando a limitação: ${request.limitations}` : ''}

Responda APENAS com o JSON, sem explicações adicionais.`;

    try {
      this.logger.log('Generating training plan with AI Router...');
      this.logger.log(`Request params: goal=${request.goal}, level=${request.level}, weeks=${request.targetWeeks}, daysPerWeek=${request.daysPerWeek}`);

      const result = await this.aiRouter.call<GeneratedPlan>({
        featureName: AI_FEATURES.PLAN_GENERATION_LEGACY,
        systemPrompt: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
        userMessage: userPrompt,
        maxTokens: 20000,
      });

      this.logger.log(`Generated plan with ${result.data.weeks?.length || 0} weeks in ${result.latencyMs}ms`);
      return result.data;
    } catch (error) {
      this.logger.error('Failed to generate training plan', error);
      throw error;
    }
  }
}
