import { Injectable, Logger } from '@nestjs/common';

import {
  ReadinessAIService,
  ReadinessVerdict,
  ReadinessInput,
  ReadinessAnswers,
} from './readiness-ai.service';
import {
  PlannedWorkoutRow,
  isRaceDay,
  pickPrimaryWorkout,
} from './helpers/planned-workout.helper';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
// Funções PURAS de data em São Paulo. Importadas direto, sem DI e sem importar
// `TrainingModule` — mesmo padrão de `stats.service.ts:10-13`, que consome este
// mesmo helper. O grafo é `plan-window` → `streak` → ∅: não há ciclo possível.
import { saoPauloTodayStr } from '../training/wellness/helpers/streak.helper';
import { addDaysStr } from '../training/helpers/plan-window.helper';

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly readinessAIService: ReadinessAIService,
    private readonly supabaseService: SupabaseService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * ⚠️ `userId` é PARÂMETRO POSICIONAL, e isso é uma decisão de segurança.
   *
   * Este método recebia um DTO com `userId` dentro — e o controller preenchia
   * esse campo a partir do BODY da requisição. Resultado: qualquer usuário
   * autenticado gravava check-in, e queimava orçamento de IA, no id de outro.
   *
   * Com a identidade como 1º argumento e `ReadinessAnswers` (que NÃO tem campo
   * de id) como 2º, reintroduzir a leitura do body vira erro de compilação em
   * vez de bug silencioso. Um "DTO interno já resolvido" não daria isso: o
   * atalho `analyzeReadiness({ ...dto, userId })` continuaria compilando, e a
   * ordem do spread decidiria quem ganha.
   *
   * O único chamador é `ReadinessController`, que obtém `userId` de
   * `@User('id')` — derivado do Bearer token validado pelo SupabaseAuthGuard.
   */
  async analyzeReadiness(
    userId: string,
    answers: ReadinessAnswers,
    setNumber?: number,
  ): Promise<ReadinessVerdict> {
    this.logger.log(`Analyzing readiness for user: ${userId}`);
    this.logger.log(
      `[QuizSelection] Received setNumber: ${setNumber ?? 'NOT PROVIDED'}`,
    );

    // Check if already checked in today (after 3 AM)
    const existingCheckIn = await this.hasCheckedInToday(userId);
    if (existingCheckIn) {
      this.logger.log(
        `User ${userId} already checked in today, returning existing verdict`,
      );
      return existingCheckIn;
    }

    // 1. Get recent activity load data from activities table
    const loadData = await this.getActivityLoadData(userId);
    const loadDescription = this.getLoadDescription(loadData);

    // 2. Get today's and tomorrow's planned workout (dia de São Paulo)
    const planned = await this.fetchPlannedWorkouts(userId, saoPauloTodayStr());

    // 3. Prepare input for AI analysis
    const input: ReadinessInput = {
      checkIn: answers,
      trainingLoadData: loadDescription,
      todayWorkout: planned.today,
      tomorrowWorkout: planned.tomorrow,
      workoutLookupFailed: planned.lookupFailed,
    };

    // 4. Get AI verdict
    let verdict = await this.readinessAIService.analyzeReadiness(input, userId);

    // 5. ACWR Balancing Logic: Override red to yellow for borderline cases with positive check-in
    const checkInAvg =
      (answers.sleep +
        answers.legs +
        answers.mood +
        answers.stress +
        answers.motivation) /
      5;
    const acwr = loadData.acwr || 1.0;

    if (
      verdict.status_color === 'red' &&
      acwr >= 1.4 &&
      acwr <= 1.6 &&
      checkInAvg >= 4
    ) {
      this.logger.log(
        `ACWR balancing: Overriding red to yellow (ACWR=${acwr}, check-in avg=${checkInAvg})`,
      );
      verdict = {
        ...verdict,
        status_color: 'yellow',
        status_label: 'Sinal amarelo - Atenção',
        readiness_score: Math.max(verdict.readiness_score, 45), // Ensure score is at least 45 for yellow
      };
    }

    // 6. Save to database for history (including set_number for exclusion tracking)
    await this.saveReadinessResult(userId, answers, verdict, setNumber);

    return verdict;
  }

  /**
   * Check if user has already completed check-in today (after 3 AM reset)
   * Returns the existing verdict if found, null otherwise
   *
   * TIMEZONE: Uses America/Sao_Paulo (BRT = UTC-3)
   * RULE: New readiness day starts at 3:00 AM local time
   *
   * Time windows:
   * - 03:00 Day N to 02:59 Day N+1 = "Day N" for readiness purposes
   */
  async hasCheckedInToday(userId: string): Promise<ReadinessVerdict | null> {
    try {
      const supabase = this.supabaseService.getClient();

      // Get the start of today's readiness window (3 AM in São Paulo)
      const windowStart = this.getReadinessWindowStart();

      this.logger.debug(
        `Checking readiness for user ${userId} since ${windowStart.toISOString()}`,
      );

      const { data, error } = await supabase
        .from('readiness_history')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        this.logger.debug(
          `No readiness check-in found for user ${userId} in current window`,
        );
        return null;
      }

      this.logger.log(
        `Found existing check-in for user ${userId} from ${data.created_at}`,
      );

      // Reconstruct verdict from stored data
      return {
        readiness_score: data.score,
        status_color: data.status_color,
        status_label: data.status_label,
        ai_analysis: data.ai_analysis,
        metrics_summary: data.metrics_summary || [],
        generated_at: data.created_at,
      };
    } catch (error) {
      this.logger.warn('Error checking today check-in status', error);
      return null;
    }
  }

  /**
   * Calculate the start of the current readiness window
   *
   * The readiness day starts at MIDNIGHT (00:00) in São Paulo timezone (America/Sao_Paulo)
   * BRT = UTC-3 (no daylight saving since 2019)
   *
   * Examples (times in São Paulo):
   * - If now is 10:00 AM Jan 10 → window started at 00:00 Jan 10
   * - If now is 11:30 PM Jan 10 → window started at 00:00 Jan 10
   */
  private getReadinessWindowStart(): Date {
    const SAO_PAULO_OFFSET_HOURS = -3; // UTC-3 for BRT

    // Get current UTC time
    const nowUtc = new Date();

    // Convert to São Paulo local time
    const saoPauloNow = new Date(
      nowUtc.getTime() + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );

    // Calculate today's midnight in São Paulo (as UTC)
    // Midnight São Paulo = 03:00 UTC (0 - (-3) = 3 UTC)
    const todayMidnightSaoPaulo = new Date(
      Date.UTC(
        saoPauloNow.getUTCFullYear(),
        saoPauloNow.getUTCMonth(),
        saoPauloNow.getUTCDate(),
        -SAO_PAULO_OFFSET_HOURS, // Convert 00:00 local to UTC (0 - (-3) = 3 UTC)
        0,
        0,
        0,
      ),
    );

    const dateStr = `${saoPauloNow.getUTCFullYear()}-${String(saoPauloNow.getUTCMonth() + 1).padStart(2, '0')}-${String(saoPauloNow.getUTCDate()).padStart(2, '0')}`;
    this.logger.log(
      `[ReadinessService] Window start: ${todayMidnightSaoPaulo.toISOString()} (Midnight São Paulo, date: ${dateStr})`,
    );

    return todayMidnightSaoPaulo;
  }

  /**
   * O treino de HOJE e o de AMANHÃ, para o prompt de prontidão.
   *
   * ── O QUE ISTO SUBSTITUI ──────────────────────────────────────────────────
   *
   * Havia aqui `getTodayWorkout`/`getTomorrowWorkout`, que liam
   * `training_plans.current_week` com filtro `.eq('is_active', true)` — DUAS
   * colunas que não existem na tabela. O PostgREST devolvia 42703, o código
   * desestruturava só `data` e ignorava `error`, e as duas funções retornavam
   * `undefined` em silêncio. Efeito medido em produção: os 7 check-ins já
   * gravados dizem todos "Sem treino planejado hoje" — inclusive o de um
   * usuário com 170 linhas em `workouts`. A regra de PRIORIDADE MÁXIMA do
   * prompt (downgrade quando o treino é intenso e as pernas/sono estão ruins)
   * nunca pôde ser avaliada uma única vez.
   *
   * ── POR QUE FILTRA POR PLANO, MAS NÃO EXIGE PLANO ─────────────────────────
   *
   * Cancelar um plano NÃO apaga seus treinos: `training.controller.ts` só faz
   * `UPDATE training_plans SET status='cancelled'`, e o único DELETE em
   * `workouts` no repo é a exclusão de conta. Logo há linhas `pending` órfãs de
   * planos mortos — buscar só por data traria treinos fantasmas para o prompt.
   * Mas exigir `plan_id = <plano ativo>` mataria treino manual e free-run, que
   * nascem com `plan_id: null`. A regra que cobre os dois lados:
   *
   *     plan_id === null  → criado pelo corredor, vale sempre
   *     plan_id !== null  → só vale se for o plano ATIVO
   *
   * ── NUNCA LANÇA ───────────────────────────────────────────────────────────
   *
   * O check-in tem de funcionar mesmo sem o treino. Falha vira
   * `lookupFailed: true`, que o prompt traduz como "não consegui olhar" — e
   * NÃO como "você não tem treino hoje". Era essa indistinção que mantinha o
   * 42703 invisível.
   */
  private async fetchPlannedWorkouts(
    userId: string,
    todayStr: string,
  ): Promise<{
    today?: ReadinessInput['todayWorkout'];
    tomorrow?: ReadinessInput['tomorrowWorkout'];
    lookupFailed: boolean;
  }> {
    const tomorrowStr = addDaysStr(todayStr, 1);

    try {
      const supabase = this.supabaseService.getClient();

      const [planRes, workoutRes] = await Promise.all([
        // `limit(1)` em vez de `.maybeSingle()`: dois planos ativos simultâneos
        // são um estado possível (falha de geração + cancelamento no
        // onboarding rodam em momentos diferentes), e `maybeSingle()` erraria.
        supabase
          .from('training_plans')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1),
        // Uma query para os dois dias. `scheduled_date` é `date` puro e volta
        // como 'YYYY-MM-DD' — comparação de string, sem Date e sem fuso.
        supabase
          .from('workouts')
          .select(
            'id, plan_id, type, title, objective, distance_km, scheduled_date, scheduled_time, is_race_day',
          )
          .eq('user_id', userId)
          .in('scheduled_date', [todayStr, tomorrowStr])
          .eq('status', 'pending'),
      ]);

      const failure = workoutRes.error ?? planRes.error;
      if (failure) {
        // `error`, não `warn`: foi exatamente um erro engolido que manteve o
        // treino fora do prompt por semanas sem ninguém perceber.
        this.logger.error(
          `[Readiness][workout-lookup] falhou para user=${userId} today=${todayStr}: ` +
            `code=${failure.code} message=${failure.message} details=${failure.details ?? '-'}`,
        );
        return { lookupFailed: true };
      }

      const activePlan = planRes.data?.[0] as { id: string } | undefined;
      const activePlanId = activePlan?.id ?? null;

      const rows = ((workoutRes.data ?? []) as PlannedWorkoutRow[]).filter(
        (w) => w.plan_id === null || w.plan_id === activePlanId,
      );

      const todayRows = rows.filter((w) => w.scheduled_date === todayStr);
      const tomorrowRows = rows.filter((w) => w.scheduled_date === tomorrowStr);

      // Duplicata na mesma data é um estado possível (não há UNIQUE em
      // produção) e já houve incidente. Logar torna o caso observável em vez
      // de silencioso; a escolha em si é determinística no helper puro.
      if (todayRows.length > 1) {
        this.logger.warn(
          `[Readiness][workout-lookup] ${todayRows.length} treinos pendentes em ${todayStr} ` +
            `para user=${userId} (ids=${todayRows.map((w) => w.id).join(',')})`,
        );
      }

      const today = pickPrimaryWorkout(todayRows);
      const tomorrow = pickPrimaryWorkout(tomorrowRows);

      return {
        today: today && {
          type: today.type ?? 'easy_run',
          title: this.workoutTitle(today),
          // `?? undefined` e não `||`: `distance_km` volta `null` do banco, e
          // `null` violaria o tipo e imprimiria "null" no prompt.
          distance_km: today.distance_km ?? undefined,
          intensity: isRaceDay(today)
            ? 'Máxima'
            : this.getIntensity(today.type ?? ''),
        },
        tomorrow: tomorrow && {
          type: tomorrow.type ?? 'easy_run',
          title: this.workoutTitle(tomorrow),
        },
        lookupFailed: false,
      };
    } catch (error) {
      this.logger.error(
        `[Readiness][workout-lookup] exceção para user=${userId}`,
        error,
      );
      return { lookupFailed: true };
    }
  }

  /**
   * `title` é NULL na esmagadora maioria dos treinos: o insert em lote do
   * gerador de plano grava `type`/`objective`/`distance_km` mas não `title`.
   * Ele só existe em dia de prova ("DIA DA PROVA — X"), treino manual e
   * free-run — e nesses casos é o texto mais informativo que temos.
   * `objective` é o que sempre existe num treino de plano.
   *
   * `??` e não `||`: título vazio deve cair para o próximo, mas a distinção
   * importa para manter a mesma semântica em toda a cadeia.
   */
  private workoutTitle(w: PlannedWorkoutRow): string {
    return w.title ?? w.objective ?? this.getWorkoutTitle(w.type ?? '');
  }

  private getWorkoutTitle(type: string): string {
    const titles: Record<string, string> = {
      easy_run: 'Rodagem Leve',
      long_run: 'Longão',
      intervals: 'Treino Intervalado',
      tempo: 'Tempo Run',
      recovery: 'Recuperação Ativa',
      fartlek: 'Fartlek',
      progressive: 'Progressivo',
      walk_run: 'Caminhada e Corrida',
      race_day: 'Dia da Prova',
      free_run: 'Corrida Livre',
    };
    return titles[type] || type;
  }

  /**
   * ⚠️ LOAD-BEARING. O system prompt decide o downgrade a partir de "Alta
   * Intensidade" — um tipo ausente deste mapa cai no default 'Moderada' e
   * DESLIGA a regra de prevenção para aquele treino. Manter em dia com os
   * tipos que o gerador de plano realmente emite.
   */
  private getIntensity(type: string): string {
    const intensities: Record<string, string> = {
      easy_run: 'Baixa',
      long_run: 'Moderada',
      intervals: 'Alta',
      tempo: 'Alta',
      fartlek: 'Alta',
      progressive: 'Moderada-Alta',
      recovery: 'Muito Baixa',
      walk_run: 'Muito Baixa',
      free_run: 'Baixa',
      race_day: 'Máxima',
    };
    return intensities[type] || 'Moderada';
  }

  async getReadinessStatus(userId: string): Promise<{
    isUnlocked: boolean;
    hasCompletedFirstWorkout: boolean;
    canCheckInToday: boolean;
    hasCompletedToday: boolean;
    lastCheckInDate: string | null;
    todayVerdict: ReadinessVerdict | null;
  }> {
    const supabase = this.supabaseService.getClient();

    // 1. Check if user has completed at least one workout
    const { count: workoutCount } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'Run');

    const hasCompletedFirstWorkout = (workoutCount ?? 0) > 0;

    // 2. Check readiness_history for today's check-in (after 3 AM)
    const existingVerdict = await this.hasCheckedInToday(userId);
    const hasCompletedToday = existingVerdict !== null;

    // User can check in if:
    // - They have completed first workout
    // - AND have NOT already checked in today (after 3 AM)
    const canCheckInToday = hasCompletedFirstWorkout && !hasCompletedToday;

    // Get last completed check-in date from readiness_history
    const { data: lastCheckIn } = await supabase
      .from('readiness_history')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return {
      isUnlocked: hasCompletedFirstWorkout,
      hasCompletedFirstWorkout,
      canCheckInToday,
      hasCompletedToday,
      lastCheckInDate: lastCheckIn?.created_at?.split('T')[0] || null,
      todayVerdict: existingVerdict,
    };
  }

  private async saveReadinessResult(
    userId: string,
    answers: ReadinessAnswers,
    verdict: ReadinessVerdict,
    setNumber?: number,
  ): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

      // Ensure user exists in public.users before inserting (prevents FK violation)
      await this.ensureUserProfile(userId);

      const insertData: Record<string, any> = {
        user_id: userId,
        score: verdict.readiness_score, // Column is 'score', not 'readiness_score'
        status_color: verdict.status_color,
        status_label: verdict.status_label,
        ai_analysis: verdict.ai_analysis,
        check_in_answers: answers,
        metrics_summary: verdict.metrics_summary,
        // created_at has default NOW() in table, no need to set it
      };

      // Include set_number for question set exclusion tracking
      if (setNumber) {
        insertData.set_number = setNumber;
        this.logger.log(
          `[QuizSelection] Saving check-in with set_number: ${setNumber}`,
        );
      } else {
        this.logger.warn(
          `[QuizSelection] WARNING: No set_number provided for user ${userId}. Exclusion logic will not track this check-in.`,
        );
      }

      this.logger.log(
        `Inserting readiness history for user ${userId}:`,
        JSON.stringify(insertData),
      );

      const { data, error } = await supabase
        .from('readiness_history')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        this.logger.error(`Supabase insert error: ${error.message}`, {
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      this.logger.log(`Readiness result saved successfully. ID: ${data?.id}`);

      // Schedule recovery analysis notification for 10 minutes later
      this.notificationService.scheduleRecoveryAnalysisNotification(userId, {
        headline: verdict.ai_analysis.headline,
        reasoning: verdict.ai_analysis.reasoning,
        readiness_score: verdict.readiness_score,
        status_label: verdict.status_label,
      });
    } catch (error: any) {
      // Log detailed error but don't fail the request
      this.logger.error(
        `Failed to save readiness history: ${error?.message || error}`,
        error,
      );
    }
  }

  /**
   * Ensures user profile exists in public.users table.
   * Creates a basic profile if not exists to prevent FK violations.
   */
  private async ensureUserProfile(userId: string): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

      // First check if user exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (existingUser) {
        this.logger.debug(`User ${userId} already exists in public.users`);
        return;
      }

      // If user doesn't exist, create basic profile
      this.logger.log(
        `Creating basic profile for user ${userId} in public.users`,
      );

      const { error: insertError } = await supabase.from('users').upsert(
        {
          id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
          ignoreDuplicates: true,
        },
      );

      if (insertError) {
        this.logger.warn(
          `Could not create user profile: ${insertError.message}`,
        );
        // Don't throw - we'll try the insert anyway and let it fail if needed
      } else {
        this.logger.log(`User profile created for ${userId}`);
      }
    } catch (error: any) {
      this.logger.warn(`ensureUserProfile error: ${error?.message || error}`);
      // Don't throw - continue to try the insert
    }
  }

  /**
   * Get activity load data from the activities table.
   * Calculates ACWR (Acute:Chronic Workload Ratio) from recent activities.
   */
  private async getActivityLoadData(userId: string): Promise<{
    acwr: number;
    weeklyDistanceKm: number;
    weeklyDurationMin: number;
    totalActivities7d: number;
  }> {
    const supabase = this.supabaseService;
    const now = new Date();

    // Last 7 days (acute load)
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Last 28 days (chronic load)
    const twentyEightDaysAgo = new Date(now);
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

    const { data: recentActivities } = await supabase
      .from('activities')
      .select('distance, moving_time, start_date')
      .eq('user_id', userId)
      .eq('type', 'Run')
      .gte('start_date', twentyEightDaysAgo.toISOString())
      .order('start_date', { ascending: false });

    const activities = recentActivities || [];

    // Calculate acute load (last 7 days)
    const acuteActivities = activities.filter(
      (a) => new Date(a.start_date) >= sevenDaysAgo,
    );
    const acuteDistance = acuteActivities.reduce(
      (sum: number, a: any) => sum + (a.distance || 0),
      0,
    );
    const acuteDuration = acuteActivities.reduce(
      (sum: number, a: any) => sum + (a.moving_time || 0),
      0,
    );

    // Calculate chronic load (weekly average over 28 days)
    const chronicDistance =
      activities.reduce((sum: number, a: any) => sum + (a.distance || 0), 0) /
      4;

    // ACWR = acute / chronic (avoid division by zero)
    const acwr = chronicDistance > 0 ? acuteDistance / chronicDistance : 1.0;

    return {
      acwr: Math.round(acwr * 100) / 100,
      weeklyDistanceKm: Math.round((acuteDistance / 1000) * 100) / 100,
      weeklyDurationMin: Math.round(acuteDuration / 60),
      totalActivities7d: acuteActivities.length,
    };
  }

  /**
   * Get human-readable description of workout load for AI analysis.
   */
  private getLoadDescription(data: {
    acwr: number;
    weeklyDistanceKm: number;
    weeklyDurationMin: number;
    totalActivities7d: number;
  }): string {
    let loadLevel: string;
    if (data.acwr < 0.8) loadLevel = 'baixa (destreinamento)';
    else if (data.acwr <= 1.3) loadLevel = 'adequada';
    else if (data.acwr <= 1.5) loadLevel = 'moderada-alta';
    else loadLevel = 'alta (risco de lesão)';

    return `Carga semanal: ${data.weeklyDistanceKm}km em ${data.totalActivities7d} atividades (${data.weeklyDurationMin}min total). ACWR: ${data.acwr} - Carga ${loadLevel}.`;
  }
}
