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
      name: string;
      icon: string;
      tier: string;
    }>;
  } | null;

  routePoints: Array<{ latitude: number; longitude: number }> | null;

  planGoal: string | null;
  city: string;
}

export type CardTemplateId =
  | 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06'
  | 'T07' | 'T08' | 'T09' | 'T10' | 'T11' | 'T12';

export type StickerTemplateId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06'
  | 'S07' | 'S08' | 'S09' | 'S10' | 'S11';

export type SharingTab = 'cards' | 'stickers';
