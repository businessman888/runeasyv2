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
        const verdict = await this.readinessAIService.analyzeReadiness(input);

        // 5. Save to database for history (optional)
        await this.saveReadinessResult(dto.userId, dto.answers, verdict);

        return verdict;
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
        lastCheckInDate: string | null;
    }> {
        const supabase = this.supabaseService.getClient();

        // 1. Check if user has completed at least one workout
        const { count: workoutCount } = await supabase
            .from('strava_activities')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('type', 'Run');

        const hasCompletedFirstWorkout = (workoutCount ?? 0) > 0;

        // 2. Get today's check-in status
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const { data: todayCheckIn } = await supabase
            .from('readiness_checkins')
            .select('*')
            .eq('user_id', userId)
            .eq('checkin_date', today)
            .single();

        // User can check in if:
        // - They have completed first workout
        // - AND (no check-in today OR check-in is available and not completed)
        const canCheckInToday = hasCompletedFirstWorkout &&
            (!todayCheckIn || (todayCheckIn.is_available && !todayCheckIn.completed_at));

        // Get last completed check-in date
        const { data: lastCheckIn } = await supabase
            .from('readiness_checkins')
            .select('checkin_date')
            .eq('user_id', userId)
            .not('completed_at', 'is', null)
            .order('checkin_date', { ascending: false })
            .limit(1)
            .single();

        return {
            isUnlocked: hasCompletedFirstWorkout,
            hasCompletedFirstWorkout,
            canCheckInToday,
            lastCheckInDate: lastCheckIn?.checkin_date || null,
        };
    }

    private async saveReadinessResult(
        userId: string,
        answers: ReadinessCheckInDto['answers'],
        verdict: ReadinessVerdict,
    ): Promise<void> {
        try {
            const supabase = this.supabaseService.getClient();
            await supabase.from('readiness_history').insert({
                user_id: userId,
                check_in_answers: answers,
                readiness_score: verdict.readiness_score,
                status_color: verdict.status_color,
                status_label: verdict.status_label,
                ai_analysis: verdict.ai_analysis,
                metrics_summary: verdict.metrics_summary,
                created_at: new Date().toISOString(),
            });
            this.logger.log('Readiness result saved to history');

            // Schedule recovery analysis notification for 10 minutes later
            this.notificationService.scheduleRecoveryAnalysisNotification(userId, {
                headline: verdict.ai_analysis.headline,
                reasoning: verdict.ai_analysis.reasoning,
                readiness_score: verdict.readiness_score,
                status_label: verdict.status_label,
            });
        } catch (error) {
            // Don't fail the request if history save fails
            this.logger.warn('Could not save readiness history', error);
        }
    }
}
