import { Injectable, Logger } from '@nestjs/common';
import { AIRouterService, AI_FEATURES } from '../../common/ai';
import {
  PaceCalculatorService,
  TrainingZone,
} from '../../common/pace-calculator';

export interface TrainingPlanRequest {
  goal: string;
  level: string;
  daysPerWeek: number;
  currentPace5k: number | null;
  targetWeeks: number;
  limitations: string | null;
  preferredDays: number[];
  startDate?: string | null; // ISO date string (YYYY-MM-DD)
  // Performance baseline measured in onboarding (RecentDistance + DistanceTime).
  // Preferred over currentPace5k for VDOT estimation: estimateVDOTFromRace is
  // distance-aware, so a 10/15km result is not mistaken for a 5k pace.
  calculatedPace?: number | null; // min/km on the recent distance
  recentDistanceKm?: number | null; // 3 | 5 | 10 | 15
  // Manual overrides from Customize Screen
  targetTime?: string; // e.g., "01:55:00"
  targetPace?: string; // e.g., "5:30"
  // Race goal (Fase 2): when goalType === 'race' the plan is anchored to the
  // race date and periodized backwards (base → build → peak → taper).
  goalType?: 'distance' | 'race';
  raceId?: string | null;
  raceDate?: string | null; // 'YYYY-MM-DD'
  raceName?: string | null;
  raceDistance?: number | null; // km
  raceWeeksUntil?: number | null; // weeks from today to the race (computed in backend)
}

export interface RacePhases {
  base: number;
  build: number;
  peak: number;
  taper: number;
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

// Old interfaces for database storage (kept for compatibility).
// New fields (zone, perceived_effort, scientific_note, segment.zone/description)
// are OPTIONAL — workouts generated before the Daniels refinement remain valid.
export type GeneratedWorkoutType =
  | 'easy_run'
  | 'long_run'
  | 'intervals'
  | 'tempo'
  | 'recovery'
  | 'fartlek'
  | 'progressive'
  | 'repetition'
  | 'hill_repeats'
  | 'race_simulation';

export interface GeneratedSegment {
  type: 'warmup' | 'main' | 'cooldown';
  distance_km: number;
  pace_min: number;
  pace_max: number;
  zone?: TrainingZone;
  description?: string;
}

export interface GeneratedWorkout {
  day_of_week: number;
  type: GeneratedWorkoutType;
  distance_km: number;
  segments: GeneratedSegment[];
  objective: string;
  tips: string[];
  zone?: TrainingZone;
  perceived_effort?: string;
  scientific_note?: string;
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

  constructor(
    private aiRouter: AIRouterService,
    private paceCalculator: PaceCalculatorService,
  ) {}

  // Shared helper maps
  private readonly goalDescriptions: Record<string, string> = {
    '5k': 'Completar/melhorar tempo em prova de 5km',
    '10k': 'Completar/melhorar tempo em prova de 10km',
    half_marathon: 'Completar/melhorar tempo em meia maratona (21.1km)',
    marathon: 'Completar/melhorar tempo em maratona (42.2km)',
    general_fitness: 'Melhorar condicionamento físico geral para corrida',
  };

  private readonly levelDescriptions: Record<string, string> = {
    beginner: 'Iniciante (0-6 meses de experiência)',
    intermediate: 'Intermediário (6-24 meses de experiência)',
    advanced: 'Avançado (2+ anos de experiência)',
  };

  private readonly goalLabels: Record<string, string> = {
    '5k': '5km',
    '10k': '10km',
    half_marathon: 'Meia Maratona',
    marathon: 'Maratona',
    general_fitness: 'Fitness',
  };

  private readonly levelLabels: Record<string, string> = {
    beginner: 'Corredor Iniciante',
    intermediate: 'Corredor Intermediário',
    advanced: 'Corredor Avançado',
  };

  // Convention shared with mobile (AvailableDaysScreen): 0=Dom ... 6=Sáb,
  // matching JavaScript Date.getDay().
  private readonly dayNames = [
    'domingo',
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado',
  ];

  /**
   * Build a human-readable description of the user's selected weekdays for
   * the AI prompt. Returns an empty string when no days were provided so
   * older callers without preferredDays don't get malformed instructions.
   */
  private describePreferredDays(
    preferredDays: number[] | undefined | null,
  ): string {
    if (!preferredDays || preferredDays.length === 0) return '';
    const sorted = [...preferredDays]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    const named = sorted.map((d) => `${d}=${this.dayNames[d]}`).join(', ');
    return `\nDIAS DA SEMANA OBRIGATÓRIOS: ${sorted.join(', ')} (${named}). Use SOMENTE estes valores no campo day_of_week — não invente outros dias.`;
  }

  /**
   * Clamp an unrealistic pace (min/km) into a sane range, mirroring the guard
   * already applied to currentPace5k. Returns null for missing/invalid input.
   */
  private clampPace(pace: number | null | undefined): number | null {
    if (pace === null || pace === undefined || !Number.isFinite(pace)) {
      return null;
    }
    if (pace > 15.0) {
      this.logger.warn(
        `[Pace Guard] Pace ${pace.toFixed(2)} min/km is unrealistic (>15), defaulting to 7.0`,
      );
      return 7.0;
    }
    if (pace < 2.0) {
      this.logger.warn(
        `[Pace Guard] Pace ${pace.toFixed(2)} min/km is impossibly fast (<2), clamping to 3.0`,
      );
      return 3.0;
    }
    return pace;
  }

  /**
   * Resolve the athlete's VDOT from the strongest available signal:
   *   1) Race-based (preferred): recent distance + measured pace → exact time,
   *      fed to the distance-aware Daniels–Gilbert formula. This is why a 10/15km
   *      result is not mistaken for a 5k pace.
   *   2) Pace-based fallback: any known pace (currentPace5k or calculatedPace)
   *      interpreted as a 5k pace.
   *   3) Beginner default when no pace signal exists.
   *
   * `safePace` is the already-clamped currentPace5k from the caller.
   */
  private resolveVDOT(
    request: TrainingPlanRequest,
    safePace: number | null | undefined,
  ): number {
    const calculatedPace = this.clampPace(request.calculatedPace);
    const recentDistanceKm = request.recentDistanceKm;

    if (
      calculatedPace &&
      calculatedPace > 0 &&
      recentDistanceKm &&
      recentDistanceKm > 0
    ) {
      // time = pace (min/km) × distance (km) × 60 → seconds
      const timeSeconds = calculatedPace * recentDistanceKm * 60;
      const vdot = this.paceCalculator.estimateVDOTFromRace(
        recentDistanceKm * 1000,
        timeSeconds,
      );
      this.logger.log(
        `[VDOT] Race-based: ${recentDistanceKm}km @ ${calculatedPace.toFixed(2)} min/km → VDOT ${vdot.toFixed(1)}`,
      );
      return vdot;
    }

    const pace = safePace ?? calculatedPace ?? null;
    if (pace) {
      const vdot = this.paceCalculator.estimateVDOTFromPace5K(pace);
      this.logger.log(
        `[VDOT] Pace-based (5k): ${pace.toFixed(2)} min/km → VDOT ${vdot.toFixed(1)}`,
      );
      return vdot;
    }

    const vdot = this.paceCalculator.vdotForBeginner();
    this.logger.log(`[VDOT] No pace signal → beginner VDOT ${vdot.toFixed(1)}`);
    return vdot;
  }

  /**
   * PROMPT 1 (FAST): Generate only the first workout and plan header
   * Target response time: ~3-5 seconds
   */
  async generateFirstWorkout(
    request: TrainingPlanRequest,
  ): Promise<QuickPlanResult> {
    // GUARD: Clamp unrealistic pace values before sending to AI
    let safePace = request.currentPace5k;
    if (safePace !== null && safePace !== undefined) {
      if (safePace > 15.0) {
        this.logger.warn(
          `[Pace Guard] Pace ${safePace.toFixed(2)} min/km is unrealistic (>15), defaulting to 7.0`,
        );
        safePace = 7.0;
      } else if (safePace < 2.0) {
        this.logger.warn(
          `[Pace Guard] Pace ${safePace.toFixed(2)} min/km is impossibly fast (<2), clamping to 3.0`,
        );
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
P6. Limitações/Lesões: ${request.limitations || 'Nenhuma'}${this.describePreferredDays(request.preferredDays)}

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
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 4000,
      });

      this.logger.log(
        `[Prompt 1] First workout generated in ${result.latencyMs}ms`,
      );
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
- Limitações: ${request.limitations || 'Nenhuma'}${this.describePreferredDays(request.preferredDays)}

Gere as SEMANAS 2 até ${request.targetWeeks} seguindo esta progressão:
1. ${request.daysPerWeek} treinos por semana
2. Variedade: rodagem leve (60%), long run (20%), intervalados/tempo (20%)
3. Distribuição de fases: base (40%), build (30%), peak (20%), taper (10%)
4. Aumente volume progressivamente até semana de peak, depois reduza no taper
5. Mantenha consistência de paces com a Semana 1
${request.targetPace ? `6. IMPORTANTE: O objetivo final é correr no pace ${request.targetPace} min/km. Aumente a intensidade gradualmente para atingir isso na semana de prova.` : ''}

Responda APENAS com o JSON contendo as semanas 2 até ${request.targetWeeks}.`;

    try {
      this.logger.log(
        `[Prompt 2] Generating weeks 2-${request.targetWeeks}...`,
      );

      const result = await this.aiRouter.call<FullScheduleResult>({
        featureName: AI_FEATURES.PLAN_GENERATION_REMAINING,
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 20000,
      });

      this.logger.log(
        `[Prompt 2] Generated ${result.data.weeks?.length || 0} weeks in ${result.latencyMs}ms`,
      );
      return result.data;
    } catch (error) {
      this.logger.error(
        '[Prompt 2] Failed to generate remaining schedule',
        error,
      );
      throw error;
    }
  }

  /**
   * Generate a FULL training plan using a single AI prompt (all weeks at once).
   * Optimized: no fullSchedulePreview (saves ~50% output tokens), concise tips.
   */
  /**
   * Periodization split for a race goal. Taper and peak are fixed by distance;
   * the remainder is divided 40% build / 60% base. Every phase is at least 1 week.
   */
  calculateRacePhases(totalWeeks: number, raceDistance: number): RacePhases {
    const taper = raceDistance >= 42 ? 3 : raceDistance >= 21 ? 2 : 1;
    const peak = raceDistance >= 21 ? 3 : 2;
    const remaining = Math.max(totalWeeks - taper - peak, 2);
    const build = Math.max(Math.floor(remaining * 0.4), 1);
    const base = Math.max(remaining - build, 1);
    return { base, build, peak, taper };
  }

  /** Race-specific periodization block appended to the user prompt. */
  private buildRacePromptBlock(request: TrainingPlanRequest): string {
    const weeks =
      request.raceWeeksUntil ?? request.targetWeeks ?? 0;
    const distance = request.raceDistance ?? request.recentDistanceKm ?? 10;
    const { base, build, peak, taper } = this.calculateRacePhases(
      weeks,
      distance,
    );
    const buildStart = base + 1;
    const peakStart = base + build + 1;
    const taperStart = base + build + peak + 1;

    return `

═══ META: PROVA DE CORRIDA ═══
O usuário tem uma prova marcada:
- Nome: ${request.raceName ?? 'Prova alvo'}
- Data: ${request.raceDate} (${weeks} semanas a partir do início do plano)
- Distância do objetivo: ${distance}km

PERIODIZAÇÃO OBRIGATÓRIA para ${weeks} semanas (ancorada na data da prova):
- Fase BASE:  semanas 1-${base} (aeróbico, volume moderado, rodagem)
- Fase BUILD: semanas ${buildStart}-${base + build} (volume crescente, progressões, Z3/Z4)
- Fase PEAK:  semanas ${peakStart}-${base + build + peak} (intensidade máxima, simulados específicos da distância)
- Fase TAPER: últimas ${taper} semana(s) (volume -40/-60%, mantém intensidade curta)

REGRAS ADICIONAIS DE PROVA:
- Não programar treino intenso nos 2 dias anteriores à prova.
- Semana da prova: apenas 1-2 treinos leves antes do dia D.
- A última semana culmina na data da prova (${request.raceDate}); o treino do dia da prova é inserido automaticamente pelo sistema — NÃO crie um treino nesse dia.`;
  }

  async generateTrainingPlan(
    request: TrainingPlanRequest,
  ): Promise<GeneratedPlan> {
    // GUARD: Clamp unrealistic pace values before sending to AI
    let safePace = request.currentPace5k;
    if (safePace !== null && safePace !== undefined) {
      if (safePace > 15.0) {
        this.logger.warn(
          `[Pace Guard] Pace ${safePace.toFixed(2)} min/km is unrealistic (>15), defaulting to 7.0`,
        );
        safePace = 7.0;
      } else if (safePace < 2.0) {
        this.logger.warn(
          `[Pace Guard] Pace ${safePace.toFixed(2)} min/km is impossibly fast (<2), clamping to 3.0`,
        );
        safePace = 3.0;
      }
    }

    // Compute VDOT and zone paces deterministically in the backend so the AI
    // receives ready-made numbers and does not need to estimate them.
    const vdot = this.resolveVDOT(request, safePace);
    const paces = this.paceCalculator.getTrainingPaces(vdot);
    const formattedPaces = this.paceCalculator.formatPaces(paces);

    const systemPrompt = `Você é um treinador de corrida de elite da RunEasy, formado na metodologia Jack Daniels (Daniels Running Formula). Sua tarefa é gerar planos de treino estruturados, periodizados e cientificamente embasados.

REGRA CRÍTICA: Responda APENAS com JSON válido. Sem texto, markdown ou explicações antes/depois.

═══ BASE DE CONHECIMENTO CIENTÍFICO ═══

5 ZONAS DE TREINO (Daniels)
  Z1 Easy (E)         65-79% FC máx  — base aeróbia, recuperação. Aquecimento, rodagem leve, longão lento.
  Z2 Marathon (M)     80-85% FC máx  — economia de corrida, pace de maratona. Trechos sustentados em longões.
  Z3 Threshold (T)    85-90% FC máx  — elevar limiar de lactato. Tempo run, cruise intervals (ex: 3x10min).
  Z4 Interval (I)     95-100% FC máx — aumentar VO2max. Intervalados clássicos (ex: 5x1000m, 6x800m).
  Z5 Repetition (R)   >100% FC máx   — economia/velocidade pura, mecânica. Strides, 200m, 400m.

REGRAS DE DISTRIBUIÇÃO
  • Regra 80/20: ~80% do volume semanal em Z1-Z2, ~20% em Z3-Z5.
  • Máximo 2 sessões de qualidade (Z3, Z4 ou Z5) por semana, com ≥48h entre elas.
  • Longão ≤ 30% do volume semanal total.
  • Aumento de volume entre semanas consecutivas ≤ 10%.
  • Deload a cada 3-4 semanas: reduzir volume em 20-30%.
  • Z5 (repetition) ≤ 10% do volume semanal.

PERIODIZAÇÃO (4 fases ao longo do plano)
  base   (~40% do plano)        construir volume, predominância Z1, no máximo 1 sessão de qualidade.
  build  (~30%)                  introduzir Z3/Z4, até 2 sessões de qualidade. Longão pode incluir trechos Z2.
  peak   (~20%)                  simulados, intensidade sobe, volume estabiliza ou cai levemente.
  taper  (~10%, mínimo 1 semana) volume -40/-60%, mantém intensidade curta, mais descanso.

TIPOS DE TREINO VÁLIDOS (escolha o que melhor encaixar)
  easy_run         rodagem leve Z1, base aeróbia. Pode terminar com 4-6×100m de strides em Z5.
  long_run         longão Z1 (com possível trecho final em Z2 nas fases build/peak).
  recovery         trote muito leve Z1, dia após qualidade.
  fartlek          variações de ritmo Z1↔Z3 não-estruturadas, transição base→build.
  tempo            sustentado em Z3 (20-40min) ou cruise intervals (3×10min T + 2min trote).
  intervals        VO2max Z4: 5×1000m, 6×800m, 8-10×400m, recuperação em trote.
  progressive      começa Z1, termina Z3 (negativando os splits).
  repetition       Z5 puro: 6-8×200m, 4-6×150m sprint controlado, recuperação completa.
  hill_repeats     séries em subida (Z4-Z5 esforço): 6-8×60-90s subida forte, descida easy como recuperação. Força específica + neuromuscular. Use em build/peak.
  race_simulation  ensaio de prova: 60-75% da distância-alvo em pace-alvo (Z2-Z3). Use 2-3 semanas antes da prova (fase peak).

ESFORÇO PERCEBIDO (RPE) por zona
  Z1: 3-4/10 (conversa fácil) · Z2: 5-6/10 (frases longas) · Z3: 7/10 (frases curtas)
  Z4: 8-9/10 (palavras isoladas) · Z5: 9-10/10 (não fala)

═══ SCHEMA DE SAÍDA (JSON OBRIGATÓRIO) ═══
{
  "planHeader": { "objectiveShort": "10km", "durationWeeks": "12 Sem", "frequencyWeekly": "4x/Sem" },
  "planHeadline": "String curta personalizada",
  "welcomeBadge": "Corredor Intermediário",
  "nextWorkout": { "title": "Rodagem Leve - 5 km", "duration": "35 min", "paceEstimate": "Pace 5:30", "type": "run" },
  "duration_weeks": N,
  "frequency_per_week": N,
  "weeks": [{
    "week_number": N,
    "phase": "base|build|peak|taper",
    "workouts": [{
      "day_of_week": 0-6,
      "type": "<um dos tipos válidos acima>",
      "distance_km": N,
      "segments": [
        { "type": "warmup",   "distance_km": N, "pace_min": N, "pace_max": N,
          "zone": "Z1", "description": "Trote leve para ativar musculatura" },
        { "type": "main",     "distance_km": N, "pace_min": N, "pace_max": N,
          "zone": "Z3", "description": "Ritmo confortavelmente difícil, controlado" },
        { "type": "cooldown", "distance_km": N, "pace_min": N, "pace_max": N,
          "zone": "Z1", "description": "Trote leve, baixar FC gradualmente" }
      ],
      "zone": "Z3",
      "perceived_effort": "7/10",
      "objective": "Elevar limiar de lactato",
      "scientific_note": "Ensina o corpo a reciclar lactato mais eficientemente.",
      "tips": ["Comece controlado", "Mire 85-90% FC máx"]
    }]
  }]
}

REGRAS DE GERAÇÃO
  1. Cada workout DEVE incluir os campos: zone, perceived_effort, objective, scientific_note, tips.
  2. Cada segment DEVE ter zone e description (curta, ≤ 12 palavras, PT-BR).
  3. USE os paces do user prompt — não invente outros valores. Cole-os em pace_min/pace_max do segmento adequado à zona.
  4. tips: máximo 2 por treino, ≤ 10 palavras cada.
  5. scientific_note: 1 frase, ≤ 18 palavras, PT-BR, foco fisiológico.
  6. objective: 1 frase curta (≤ 8 palavras).
  7. Distribua as fases respeitando os percentuais (base 40 / build 30 / peak 20 / taper 10).
  8. Respeite a regra 80/20, o máximo de 2 sessões de qualidade/semana, e o limite de 10% de aumento de volume.
  9. nextWorkout deve corresponder ao primeiro treino da semana 1.
 10. Gere TODAS as semanas no array "weeks", cada uma com exatamente o número de treinos pedido no user prompt.`;

    const userPrompt = `Crie o plano de treino COMPLETO (todas as ${request.targetWeeks} semanas):

PERFIL DO CORREDOR:
- Objetivo: ${this.goalDescriptions[request.goal] || request.goal}
- Nível: ${this.levelDescriptions[request.level] || request.level}
- Frequência: ${request.daysPerWeek} dias/semana
- Pace 5K: ${safePace ? `${safePace.toFixed(2)} min/km` : 'Não informado (iniciante)'}
- Prazo: ${request.targetWeeks} semanas
- Limitações: ${request.limitations || 'Nenhuma'}${this.describePreferredDays(request.preferredDays)}

VDOT ESTIMADO: ${vdot.toFixed(1)}
PACES DE TREINO (USE estes valores em pace_min/pace_max — não invente outros):
- Z1 Easy:        ${formattedPaces.easy} min/km
- Z2 Marathon:    ${formattedPaces.marathon} min/km
- Z3 Threshold:   ${formattedPaces.threshold} min/km
- Z4 Interval:    ${formattedPaces.interval} min/km
- Z5 Repetition:  ${formattedPaces.repetition} min/km

VALORES PRÉ-DEFINIDOS:
- objectiveShort: "${this.goalLabels[request.goal] || request.goal}"
- durationWeeks: "${request.targetWeeks} Sem"
- frequencyWeekly: "${request.daysPerWeek}x/Sem"
- welcomeBadge: "${this.levelLabels[request.level] || 'Corredor'}"
- duration_weeks: ${request.targetWeeks}
- frequency_per_week: ${request.daysPerWeek}

EXIGÊNCIAS DO PLANO:
1. ${request.daysPerWeek} treinos por semana, TODA semana.
2. Aplique as fases: base (40%) → build (30%) → peak (20%) → taper (10%) do total de ${request.targetWeeks} semanas.
3. Aplique a regra 80/20 do volume semanal (Z1+Z2 dominantes).
4. Máximo 2 sessões de qualidade (Z3/Z4/Z5) por semana, com ≥48h de intervalo.
5. Inclua deload (-25% volume) a cada 3-4 semanas quando o plano permitir.
${request.targetPace ? `6. PACE ALVO FINAL: ${request.targetPace} min/km — progrida ritmos das sessões de qualidade gradualmente em direção a este alvo.` : ''}
${request.limitations ? `7. ADAPTAÇÃO obrigatória às limitações: ${request.limitations}` : ''}
${request.goalType === 'race' ? this.buildRacePromptBlock(request) : ''}

Responda APENAS com o JSON contendo todas as ${request.targetWeeks} semanas.`;

    try {
      this.logger.log(
        `[FullPlan] Generating ${request.targetWeeks}-week plan with AI Router...`,
      );

      const result = await this.aiRouter.call<GeneratedPlan>({
        featureName: AI_FEATURES.PLAN_GENERATION_LEGACY,
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 64000,
      });

      this.logger.log(
        `[FullPlan] Generated plan with ${result.data.weeks?.length || 0} weeks in ${result.latencyMs}ms`,
      );
      return result.data;
    } catch (error) {
      this.logger.error('[FullPlan] Failed to generate training plan', error);
      throw error;
    }
  }
}
