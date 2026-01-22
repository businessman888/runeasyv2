import { Injectable, Logger } from '@nestjs/common';
import { MockStravaService } from './mock-strava.service';
import { ReadinessAIService, ReadinessVerdict, ReadinessInput } from './readiness-ai.service';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';

export interface ReadinessCheckInDto {
    userId: string;
    answers: {
        sleep: number;      // 1-5
        legs: number;       // 1-5
        mood: number;       // 1-5
        stress: number;     // 1-5
        motivation: number; // 1-5
    };
    setNumber?: number;  // Question set number for exclusion tracking
}

@Injectable()
export class ReadinessService {
    private readonly logger = new Logger(ReadinessService.name);

    constructor(
        private readonly mockStravaService: MockStravaService,
        private readonly readinessAIService: ReadinessAIService,
        private readonly supabaseService: SupabaseService,
        private readonly notificationService: NotificationService,
    ) { }

    async analyzeReadiness(dto: ReadinessCheckInDto): Promise<ReadinessVerdict> {
        this.logger.log(`Analyzing readiness for user: ${dto.userId}`);

        // Check if already checked in today (after 3 AM)
        const existingCheckIn = await this.hasCheckedInToday(dto.userId);
        if (existingCheckIn) {
            this.logger.log(`User ${dto.userId} already checked in today, returning existing verdict`);
            return existingCheckIn;
        }

        // 1. Get Strava load data (mock for now)
        const stravaData = await this.mockStravaService.getLoadData(dto.userId);
        const stravaDescription = this.mockStravaService.getLoadDescription(stravaData);

        // 2. Get today's planned workout from database (if exists)
        const todayWorkout = await this.getTodayWorkout(dto.userId);
        const tomorrowWorkout = await this.getTomorrowWorkout(dto.userId);

        // 3. Prepare input for AI analysis
        const input: ReadinessInput = {
            checkIn: dto.answers,
            stravaData: stravaDescription,
            todayWorkout,
            tomorrowWorkout,
        };

        // 4. Get AI verdict
        let verdict = await this.readinessAIService.analyzeReadiness(input);

        // 5. ACWR Balancing Logic: Override red to yellow for borderline cases with positive check-in
        const checkInAvg = (dto.answers.sleep + dto.answers.legs + dto.answers.mood + dto.answers.stress + dto.answers.motivation) / 5;
        const acwr = stravaData.acwr || 1.0;

        if (verdict.status_color === 'red' && acwr >= 1.4 && acwr <= 1.6 && checkInAvg >= 4) {
            this.logger.log(`ACWR balancing: Overriding red to yellow (ACWR=${acwr}, check-in avg=${checkInAvg})`);
            verdict = {
                ...verdict,
                status_color: 'yellow',
                status_label: 'Sinal amarelo - Atenção',
                readiness_score: Math.max(verdict.readiness_score, 45), // Ensure score is at least 45 for yellow
            };
        }

        // 6. Save to database for history (including set_number for exclusion tracking)
        await this.saveReadinessResult(dto.userId, dto.answers, verdict, dto.setNumber);

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

            this.logger.debug(`Checking readiness for user ${userId} since ${windowStart.toISOString()}`);

            const { data, error } = await supabase
                .from('readiness_history')
                .select('*')
                .eq('user_id', userId)
                .gte('created_at', windowStart.toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error || !data) {
                this.logger.debug(`No readiness check-in found for user ${userId} in current window`);
                return null;
            }

            this.logger.log(`Found existing check-in for user ${userId} from ${data.created_at}`);

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
        const saoPauloNow = new Date(nowUtc.getTime() + (SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000));

        // Calculate today's midnight in São Paulo (as UTC)
        // Midnight São Paulo = 03:00 UTC (0 - (-3) = 3 UTC)
        const todayMidnightSaoPaulo = new Date(Date.UTC(
            saoPauloNow.getUTCFullYear(),
            saoPauloNow.getUTCMonth(),
            saoPauloNow.getUTCDate(),
            -SAO_PAULO_OFFSET_HOURS, // Convert 00:00 local to UTC (0 - (-3) = 3 UTC)
            0, 0, 0
        ));

        const dateStr = `${saoPauloNow.getUTCFullYear()}-${String(saoPauloNow.getUTCMonth() + 1).padStart(2, '0')}-${String(saoPauloNow.getUTCDate()).padStart(2, '0')}`;
        this.logger.log(`[ReadinessService] Window start: ${todayMidnightSaoPaulo.toISOString()} (Midnight São Paulo, date: ${dateStr})`);

        return todayMidnightSaoPaulo;
    }

    /**
     * Get question set based on case index (0-17)
     * Each case has 5 questions with varied wording
     */
    getQuestionSet(caseIndex: number): Array<{
        id: string;
        question: string;
        options: Array<{ value: number; label: string; description?: string }>;
    }> {
        // Base questions that rotate with different framings
        const baseQuestions = this.getBaseQuestions();

        // Apply case-specific variations
        const caseVariations = this.getCaseVariations(caseIndex);

        return baseQuestions.map((q, idx) => ({
            ...q,
            question: caseVariations[idx]?.question || q.question,
        }));
    }

    private getBaseQuestions(): Array<{
        id: string;
        question: string;
        options: Array<{ value: number; label: string; description?: string }>;
    }> {
        return [
            {
                id: 'sleep',
                question: 'Sua bateria carregou bem durante a noite?',
                options: [
                    { value: 5, label: '100% Full' },
                    { value: 4, label: '75%' },
                    { value: 3, label: '50%' },
                    { value: 2, label: '25%' },
                    { value: 1, label: 'Modo economia' },
                ],
            },
            {
                id: 'legs',
                question: 'Como estão suas pernas hoje?',
                options: [
                    { value: 5, label: 'Com molas', description: 'Prontas para voar' },
                    { value: 4, label: 'Leves', description: 'Sem peso' },
                    { value: 3, label: 'Normais', description: 'Estão aí' },
                    { value: 2, label: 'Pesadas', description: 'Cansadas' },
                    { value: 1, label: 'Como chumbo', description: 'Travadas' },
                ],
            },
            {
                id: 'mood',
                question: 'Qual o clima da sua mente?',
                options: [
                    { value: 5, label: 'Céu limpo', description: 'Energia máxima' },
                    { value: 4, label: 'Ensolarado', description: 'Boa energia' },
                    { value: 3, label: 'Instável', description: 'Oscilando' },
                    { value: 2, label: 'Nublado', description: 'Desmotivado' },
                    { value: 1, label: 'Tempestade', description: 'Energia baixa' },
                ],
            },
            {
                id: 'stress',
                question: 'Como está o peso das preocupações?',
                options: [
                    { value: 5, label: 'Inexistente', description: 'Mente livre' },
                    { value: 4, label: 'Leve', description: 'Quase não noto' },
                    { value: 3, label: 'Presente', description: 'Estou ciente' },
                    { value: 2, label: 'Pesado', description: 'Difícil carregar' },
                    { value: 1, label: 'Insuportável', description: 'Me esmaga' },
                ],
            },
            {
                id: 'motivation',
                question: 'Onde está sua motivação?',
                options: [
                    { value: 5, label: 'Já estou de tênis', description: 'Pronto!' },
                    { value: 4, label: 'Vamos nessa!' },
                    { value: 3, label: 'Talvez' },
                    { value: 2, label: 'Preciso de café' },
                    { value: 1, label: 'Ainda na cama' },
                ],
            },
        ];
    }

    private getCaseVariations(caseIndex: number): Array<{ question: string }> {
        const variations: Array<Array<{ question: string }>> = [
            // Case 0 - Default
            [
                { question: 'Sua bateria carregou bem durante a noite?' },
                { question: 'Como estão suas pernas hoje?' },
                { question: 'Qual o clima da sua mente?' },
                { question: 'Como está o peso das preocupações?' },
                { question: 'Onde está sua motivação?' },
            ],
            // Case 1
            [
                { question: 'Quantas horas de sono reparador você teve?' },
                { question: 'Suas pernas estão prontas para o treino?' },
                { question: 'Como você está se sentindo mentalmente?' },
                { question: 'O estresse está afetando você hoje?' },
                { question: 'Você está animado para treinar?' },
            ],
            // Case 2
            [
                { question: 'Você acordou revigorado(a) hoje?' },
                { question: 'Há alguma fadiga muscular nas pernas?' },
                { question: 'Seu humor está positivo?' },
                { question: 'Está conseguindo lidar bem com o estresse?' },
                { question: 'Sente vontade de se exercitar?' },
            ],
            // Case 3
            [
                { question: 'A qualidade do seu sono foi boa?' },
                { question: 'Suas pernas se recuperaram do último treino?' },
                { question: 'Está com a mente clara e focada?' },
                { question: 'O trabalho/vida pessoal está te estressando?' },
                { question: 'Está motivado(a) a dar seu melhor?' },
            ],
            // Case 4-17: Create variations programmatically
            ...Array.from({ length: 14 }, (_, i) => [
                { question: `Como está sua energia após dormir? (${i + 4})` },
                { question: `Sente suas pernas recuperadas? (${i + 4})` },
                { question: `Seu estado mental está equilibrado? (${i + 4})` },
                { question: `O estresse está controlado? (${i + 4})` },
                { question: `Está pronto(a) para o treino? (${i + 4})` },
            ]),
        ];

        return variations[caseIndex] || variations[0];
    }

    private async getTodayWorkout(userId: string): Promise<ReadinessInput['todayWorkout'] | undefined> {
        try {
            const supabase = this.supabaseService.getClient();
            const today = new Date().getDay(); // 0-6, Sunday = 0
            const dayOfWeek = today === 0 ? 7 : today; // Convert to 1-7 (Monday = 1)

            // Get user's active training plan
            const { data: plan } = await supabase
                .from('training_plans')
                .select('plan_json, current_week')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            if (!plan?.plan_json) return undefined;

            const planJson = typeof plan.plan_json === 'string'
                ? JSON.parse(plan.plan_json)
                : plan.plan_json;

            const currentWeek = plan.current_week || 1;
            const weekData = planJson.weeks?.find((w: any) => w.week_number === currentWeek);
            if (!weekData) return undefined;

            const workout = weekData.workouts?.find((w: any) => w.day_of_week === dayOfWeek);
            if (!workout) return undefined;

            return {
                type: workout.type,
                title: workout.objective || this.getWorkoutTitle(workout.type),
                distance_km: workout.distance_km,
                intensity: this.getIntensity(workout.type),
            };
        } catch (error) {
            this.logger.warn('Could not fetch today workout', error);
            return undefined;
        }
    }

    private async getTomorrowWorkout(userId: string): Promise<ReadinessInput['tomorrowWorkout'] | undefined> {
        try {
            const supabase = this.supabaseService.getClient();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dayOfWeek = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();

            const { data: plan } = await supabase
                .from('training_plans')
                .select('plan_json, current_week')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            if (!plan?.plan_json) return undefined;

            const planJson = typeof plan.plan_json === 'string'
                ? JSON.parse(plan.plan_json)
                : plan.plan_json;

            const currentWeek = plan.current_week || 1;
            const weekData = planJson.weeks?.find((w: any) => w.week_number === currentWeek);
            if (!weekData) return undefined;

            const workout = weekData.workouts?.find((w: any) => w.day_of_week === dayOfWeek);
            if (!workout) return undefined;

            return {
                type: workout.type,
                title: workout.objective || this.getWorkoutTitle(workout.type),
            };
        } catch (error) {
            this.logger.warn('Could not fetch tomorrow workout', error);
            return undefined;
        }
    }

    private getWorkoutTitle(type: string): string {
        const titles: Record<string, string> = {
            easy_run: 'Rodagem Leve',
            long_run: 'Longão',
            intervals: 'Treino Intervalado',
            tempo: 'Tempo Run',
            recovery: 'Recuperação Ativa',
        };
        return titles[type] || type;
    }

    private getIntensity(type: string): string {
        const intensities: Record<string, string> = {
            easy_run: 'Baixa',
            long_run: 'Moderada',
            intervals: 'Alta',
            tempo: 'Alta',
            recovery: 'Muito Baixa',
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
            .from('strava_activities')
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
        answers: ReadinessCheckInDto['answers'],
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
                this.logger.log(`[QuizSelection] Saving check-in with set_number: ${setNumber}`);
            }

            this.logger.log(`Inserting readiness history for user ${userId}:`, JSON.stringify(insertData));

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
            this.logger.error(`Failed to save readiness history: ${error?.message || error}`, error);
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
            this.logger.log(`Creating basic profile for user ${userId} in public.users`);

            const { error: insertError } = await supabase
                .from('users')
                .upsert({
                    id: userId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'id',
                    ignoreDuplicates: true,
                });

            if (insertError) {
                this.logger.warn(`Could not create user profile: ${insertError.message}`);
                // Don't throw - we'll try the insert anyway and let it fail if needed
            } else {
                this.logger.log(`User profile created for ${userId}`);
            }
        } catch (error: any) {
            this.logger.warn(`ensureUserProfile error: ${error?.message || error}`);
            // Don't throw - continue to try the insert
        }
    }
}
