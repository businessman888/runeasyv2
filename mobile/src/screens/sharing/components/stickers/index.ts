import React from 'react';
import { ShareCardData, StickerTemplateId } from '../../../../types/sharing.types';
import { S01_DistanceCircle } from './S01_DistanceCircle';
import { S02_PacePill } from './S02_PacePill';
import { S03_StreakFlame } from './S03_StreakFlame';
import { S04_LevelBadge } from './S04_LevelBadge';
import { S05_HeroBubble } from './S05_HeroBubble';
import { S06_ElevationTag } from './S06_ElevationTag';
import { S07_HeartRate } from './S07_HeartRate';
import { S08_DurationClock } from './S08_DurationClock';
import { S09_WorkoutType } from './S09_WorkoutType';
import { S10_RunEasyLogo } from './S10_RunEasyLogo';
import { S11_MiniRoute } from './S11_MiniRoute';

export { S01_DistanceCircle, S02_PacePill, S03_StreakFlame, S04_LevelBadge, S05_HeroBubble, S06_ElevationTag, S07_HeartRate, S08_DurationClock, S09_WorkoutType, S10_RunEasyLogo, S11_MiniRoute };

export interface StickerEntry {
  id: StickerTemplateId;
  label: string;
  Component: React.ComponentType<{ data: ShareCardData }>;
}

export const STICKER_TEMPLATES: StickerEntry[] = [
  { id: 'S01', label: 'Distância', Component: S01_DistanceCircle },
  { id: 'S02', label: 'Pace', Component: S02_PacePill },
  { id: 'S03', label: 'Streak', Component: S03_StreakFlame },
  { id: 'S04', label: 'Nível', Component: S04_LevelBadge },
  { id: 'S05', label: 'Feedback', Component: S05_HeroBubble },
  { id: 'S06', label: 'Elevação', Component: S06_ElevationTag },
  { id: 'S07', label: 'FC', Component: S07_HeartRate },
  { id: 'S08', label: 'Tempo', Component: S08_DurationClock },
  { id: 'S09', label: 'Tipo', Component: S09_WorkoutType },
  { id: 'S10', label: 'Logo', Component: S10_RunEasyLogo },
  { id: 'S11', label: 'Mini Rota', Component: S11_MiniRoute },
];
