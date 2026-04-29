import React from 'react';
import { ShareCardData, CardTemplateId } from '../../../../types/sharing.types';
import { Card01_Compact } from './Card01_Compact';
import { Card02_Pace } from './Card02_Pace';
import { Card03_Achievement, hasAchievement } from './Card03_Achievement';
import { Card04_MetricsFull } from './Card04_MetricsFull';

export { Card01_Compact, Card02_Pace, Card03_Achievement, Card04_MetricsFull, hasAchievement };

export interface CardEntry {
  id: CardTemplateId;
  label: string;
  Component: React.ComponentType<{ data: ShareCardData }>;
}

const ALL_CARDS: CardEntry[] = [
  { id: 'compact', label: 'Resumo', Component: Card01_Compact },
  { id: 'pace', label: 'Pace', Component: Card02_Pace },
  { id: 'achievement', label: 'Conquista', Component: Card03_Achievement },
  { id: 'metrics_full', label: 'Métricas', Component: Card04_MetricsFull },
];

export function getAvailableCards(data: ShareCardData | null): CardEntry[] {
  if (!data) return ALL_CARDS.filter((c) => c.id !== 'achievement');
  return ALL_CARDS.filter((c) => (c.id === 'achievement' ? hasAchievement(data) : true));
}
