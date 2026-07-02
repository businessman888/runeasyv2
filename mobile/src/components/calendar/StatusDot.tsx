import React, { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Per-day status shown on the Agenda calendar. Derived upstream by the screen's
 * `getPlanStatusForDay` / `getActivityStatusForDay` from `ScheduleDay`.
 * Confirmed meanings (Figma legend + product): cyan = Treino planejado,
 * verde = realizado, vermelho = não realizado, roxo = Descanso.
 */
export type CalendarDayStatus = 'planned' | 'completed' | 'missed' | 'recovery';

/**
 * Gradient stops extracted from Figma (nodes 1537:1723 / 1537:1725). The top
 * hue matches the app tokens (`primary` / `completed` / `missed` / `recovery`);
 * the darker bottom stop is the Figma shade. Single source of truth for the dot
 * — do not hardcode these elsewhere.
 */
const DOT_GRADIENTS: Record<CalendarDayStatus, [string, string]> = {
    planned: ['#00D4FF', '#007F99'], // Treino
    completed: ['#32CD32', '#196719'], // Realizado
    missed: ['#FF453A', '#992923'], // Não realizado
    recovery: ['#9747FF', '#5B2B99'], // Descanso
};

interface StatusDotProps {
    status: CalendarDayStatus;
    /** Diameter in px. Figma dot is 5; default 6 for a touch more presence. */
    size?: number;
}

export const StatusDot = memo(function StatusDot({ status, size = 6 }: StatusDotProps) {
    return (
        <LinearGradient
            colors={DOT_GRADIENTS[status]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
        />
    );
});

export default StatusDot;
