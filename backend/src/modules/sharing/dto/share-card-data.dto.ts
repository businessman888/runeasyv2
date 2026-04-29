export interface ShareCardData {
  // Workout core
  workoutType: string;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  scheduledDate: string;
  completedAt: string | null;

  // Activity extras
  elevationGain: number | null;
  averageHeartrate: number | null;
  cadenceSpm: number | null;
  splitsMetric: Array<{
    split: number;
    average_speed: number;
    elevation_difference: number;
  }> | null;

  // Feedback (from ai_feedbacks)
  feedback: {
    heroMessage: string;
    heroTone: 'celebration' | 'encouragement' | 'improvement' | 'caution';
    positives: Array<{ title: string; description: string }>;
    warnings: Array<{ title: string; description: string; tip: string }>;
    progressionImpact: string;
  } | null;

  // Gamification
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

  // Route (GPS)
  routePoints: Array<{ latitude: number; longitude: number }> | null;

  // Plan context
  planGoal: string | null;

  // City — empty in MVP
  city: string;
}
