import React, { memo } from 'react';

import type { AppIconName, IconTone, IconVariant } from '../../theme/iconography';
import { AppIcon } from '../ui/AppIcon';

export type CalendarDayStatus = 'planned' | 'completed' | 'missed' | 'recovery';

interface IndicatorConfig {
    name: AppIconName;
    tone: IconTone;
    variant: IconVariant;
}

const INDICATOR: Record<CalendarDayStatus, IndicatorConfig> = {
    planned: { name: 'running', tone: 'accent', variant: 'outline' },
    completed: { name: 'check', tone: 'success', variant: 'filled' },
    missed: { name: 'close', tone: 'danger', variant: 'filled' },
    recovery: { name: 'sleep', tone: 'recovery', variant: 'filled' },
};

interface DayIndicatorProps {
    status: CalendarDayStatus;
    selected?: boolean;
}

export const DayIndicator = memo(function DayIndicator({ status, selected = false }: DayIndicatorProps) {
    const icon = INDICATOR[status];
    return <AppIcon {...icon} size={16} tone={selected ? 'onAccent' : icon.tone} />;
});

DayIndicator.displayName = 'DayIndicator';

export default DayIndicator;
