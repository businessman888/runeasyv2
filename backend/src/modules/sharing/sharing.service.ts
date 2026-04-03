import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { ShareCardData } from './dto/share-card-data.dto';

@Injectable()
export class SharingService {
  private readonly logger = new Logger(SharingService.name);

  constructor(private supabaseService: SupabaseService) {}

  async getCardData(userId: string, workoutId: string): Promise<ShareCardData> {
    // 1. Fetch workout with training plan
    const { data: workout, error: workoutErr } = await this.supabaseService
      .from('workouts')
      .select('*, training_plans(*)')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .single();

    if (workoutErr || !workout) {
      throw new NotFoundException('Workout not found');
    }

    // 2. Fetch activity (if linked)
    let activity: any = null;
    if (workout.activity_id) {
      const { data } = await this.supabaseService
        .from('activities')
        .select('*')
        .eq('id', workout.activity_id)
        .single();
      activity = data;
    }

    // 3. Fetch feedback
    const { data: feedbackRow } = await this.supabaseService
      .from('ai_feedbacks')
      .select('*')
      .eq('workout_id', workoutId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 4. Fetch gamification
    const { data: levelRow } = await this.supabaseService
      .from('user_levels')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Recent badges (last 3)
    const { data: recentBadges } = await this.supabaseService
      .from('user_badges')
      .select('*, badges(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(3);

    // 5. Fetch route
    const { data: routeRow } = await this.supabaseService
      .from('workout_routes')
      .select('raw_data')
      .eq('workout_id', workoutId)
      .limit(1)
      .single();

    // Build response
    const feedback = feedbackRow
      ? {
          heroMessage: feedbackRow.hero_message,
          heroTone: feedbackRow.hero_tone,
          positives: (feedbackRow.strengths || []).map((s: any) => ({
            title: s.title || '',
            description: s.description || '',
          })),
          warnings: (feedbackRow.improvements || []).map((w: any) => ({
            title: w.title || '',
            description: w.description || '',
            tip: w.tip || '',
          })),
          progressionImpact: feedbackRow.progression_impact || '',
        }
      : null;

    const gamification =
      levelRow
        ? {
            currentLevel: levelRow.current_level,
            totalPoints: levelRow.total_points,
            currentStreak: levelRow.current_streak,
            recentBadges: (recentBadges || []).map((ub: any) => ({
              name: ub.badges?.name || '',
              icon: ub.badges?.icon || '',
              tier: ub.badges?.tier || '',
            })),
          }
        : null;

    const routePoints =
      routeRow?.raw_data && Array.isArray(routeRow.raw_data)
        ? routeRow.raw_data
        : null;

    return {
      workoutType: workout.type || '',
      distanceKm: workout.distance_run || workout.distance_km || 0,
      durationSeconds: workout.time_run_seconds || (activity?.moving_time ?? 0),
      paceSecondsPerKm: workout.pace_seconds_per_km || 0,
      scheduledDate: workout.scheduled_date || '',
      completedAt: workout.completed_at || null,
      elevationGain: activity?.elevation_gain ?? null,
      averageHeartrate: activity?.average_heartrate ?? null,
      cadenceSpm: null, // Not available in current schema
      splitsMetric: activity?.splits_metric ?? null,
      feedback,
      gamification,
      routePoints,
      planGoal: workout.training_plans?.goal || null,
      city: '',
    };
  }
}
