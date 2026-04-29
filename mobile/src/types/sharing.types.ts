export interface ShareCardData {
  workoutType: string;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  scheduledDate: string;
  completedAt: string | null;

  elevationGain: number | null;
  averageHeartrate: number | null;
  cadenceSpm: number | null;
  splitsMetric: Array<{
    split: number;
    average_speed: number;
    elevation_difference: number;
  }> | null;

  feedback: {
    heroMessage: string;
    heroTone: 'celebration' | 'encouragement' | 'improvement' | 'caution';
    positives: Array<{ title: string; description: string }>;
    warnings: Array<{ title: string; description: string; tip: string }>;
    progressionImpact: string;
  } | null;

  gamification: {
    currentLevel: number;
    totalPoints: number;
    currentStreak: number;
    recentBadges: Array<{
      slug: string;
      name: string;
      icon: string;
      type: string;
      tier: number;
    }>;
  } | null;

  routePoints: Array<{ latitude: number; longitude: number }> | null;

  planGoal: string | null;
  city: string;
}

export type CardTemplateId = 'compact' | 'pace' | 'achievement' | 'metrics_full';
