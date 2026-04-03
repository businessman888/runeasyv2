import React from 'react';
import { ShareCardData, CardTemplateId } from '../../../../types/sharing.types';
import { T01_DistanceBig } from './T01_DistanceBig';
import { T02_PaceHighlight } from './T02_PaceHighlight';
import { T03_MetricsGrid } from './T03_MetricsGrid';
import { T04_Streak } from './T04_Streak';
import { T05_FeedbackHero } from './T05_FeedbackHero';
import { T06_FeedbackDetail } from './T06_FeedbackDetail';
import { T07_RouteMinimal } from './T07_RouteMinimal';
import { T08_RouteDistance } from './T08_RouteDistance';
import { T09_RouteSplits } from './T09_RouteSplits';
import { T10_RouteElevation } from './T10_RouteElevation';
import { T11_RouteLevel } from './T11_RouteLevel';
import { T12_RouteFeedback } from './T12_RouteFeedback';

export { T01_DistanceBig, T02_PaceHighlight, T03_MetricsGrid, T04_Streak, T05_FeedbackHero, T06_FeedbackDetail, T07_RouteMinimal, T08_RouteDistance, T09_RouteSplits, T10_RouteElevation, T11_RouteLevel, T12_RouteFeedback };

export interface CardEntry {
  id: CardTemplateId;
  label: string;
  Component: React.ComponentType<{ data: ShareCardData }>;
}

export const CARD_TEMPLATES: CardEntry[] = [
  { id: 'T01', label: 'Distância', Component: T01_DistanceBig },
  { id: 'T02', label: 'Pace', Component: T02_PaceHighlight },
  { id: 'T03', label: 'Métricas', Component: T03_MetricsGrid },
  { id: 'T04', label: 'Streak', Component: T04_Streak },
  { id: 'T05', label: 'Feedback', Component: T05_FeedbackHero },
  { id: 'T06', label: 'Análise', Component: T06_FeedbackDetail },
  { id: 'T07', label: 'Rota', Component: T07_RouteMinimal },
  { id: 'T08', label: 'Rota + Dist', Component: T08_RouteDistance },
  { id: 'T09', label: 'Rota + Splits', Component: T09_RouteSplits },
  { id: 'T10', label: 'Rota + Elev', Component: T10_RouteElevation },
  { id: 'T11', label: 'Rota + Nível', Component: T11_RouteLevel },
  { id: 'T12', label: 'Rota + AI', Component: T12_RouteFeedback },
];
