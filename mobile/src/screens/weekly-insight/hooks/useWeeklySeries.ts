import { useMemo } from 'react';
import { useTrainingStore } from '../../../stores/trainingStore';

/**
 * Volume por SEMANA DO PLANO — prescrito e executado, do começo ao fim.
 *
 * ── DE ONDE VEM (e por que não há endpoint novo) ─────────────────────────────
 *
 * `plan_week_insights` guarda UMA semana por linha, e o endpoint devolve só a
 * mais recente — não serve para desenhar a trajetória. Mas `planOverview` já
 * está na store e traz `weeks[]` com todos os treinos, cada um com
 * `distance_km` (prescrito) e `executed_data` (realizado).
 *
 * É também a única fonte que traz as semanas FUTURAS, que é justamente o que dá
 * o arco da trajetória: sem elas o gráfico terminaria no presente e não haveria
 * "para onde estou indo".
 *
 * ── O EXECUTADO PARA NA SEMANA ATUAL ─────────────────────────────────────────
 *
 * Semanas futuras devolvem `completedKm: null`, não `0`. A diferença importa: a
 * lib de chart desenha `0` como um ponto na linha de base, o que leria como
 * "você correu zero" em vez de "ainda não aconteceu".
 */

export interface WeekPoint {
    weekNumber: number;
    plannedKm: number;
    /** `null` em semana futura — ainda não aconteceu, não é zero. */
    completedKm: number | null;
    isCurrent: boolean;
    isFuture: boolean;
}

export interface WeeklySeries {
    points: WeekPoint[];
    currentWeek: number;
    totalWeeks: number;
    hasData: boolean;
}

export function useWeeklySeries(): WeeklySeries {
    const planOverview = useTrainingStore((s) => s.planOverview);

    return useMemo(() => {
        const weeks = planOverview?.weeks ?? [];
        if (weeks.length === 0) {
            return { points: [], currentWeek: 0, totalWeeks: 0, hasData: false };
        }

        const currentWeek = planOverview?.overview.current_week ?? 1;

        const points: WeekPoint[] = weeks
            .slice()
            .sort((a, b) => a.week_number - b.week_number)
            .map((w) => {
                const plannedKm = w.workouts.reduce(
                    (sum, wk) => sum + (Number(wk.distance_km) || 0),
                    0,
                );

                // Mesmo fallback do backend: `executed_data` é o GPS; o prescrito
                // cobre linha legada concluída antes daquela coluna existir.
                const completedKm = w.workouts.reduce((sum, wk) => {
                    if (wk.status !== 'completed') return sum;
                    const run =
                        Number(wk.executed_data?.distance_km ?? wk.distance_km) || 0;
                    return sum + run;
                }, 0);

                const isFuture = w.week_number > currentWeek;

                return {
                    weekNumber: w.week_number,
                    plannedKm: round1(plannedKm),
                    completedKm: isFuture ? null : round1(completedKm),
                    isCurrent: w.week_number === currentWeek,
                    isFuture,
                };
            });

        return {
            points,
            currentWeek,
            totalWeeks: planOverview?.overview.total_weeks ?? points.length,
            hasData: points.some((p) => p.plannedKm > 0),
        };
    }, [planOverview]);
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}
