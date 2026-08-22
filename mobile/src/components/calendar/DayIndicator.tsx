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
    recovery: { name: 'sleep', tone: 'secondary', variant: 'filled' },
};

interface DayIndicatorProps {
    status: CalendarDayStatus;
}

export const DayIndicator = memo(function DayIndicator({ status }: DayIndicatorProps) {
    const icon = INDICATOR[status];
    return <AppIcon {...icon} size={16} />;
});

DayIndicator.displayName = 'DayIndicator';

export default DayIndicator;
