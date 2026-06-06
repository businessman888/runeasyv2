/**
 * useRaces — local-state hook (no React Query in this project).
 *
 * - Loads suggested races on mount as the initial list.
 * - Debounces search/filter changes by 400ms, then queries GET /races.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchRaces, getSuggestedRaces } from '../services/racesApi';
import type { Race, RaceSearchParams } from '../types/races.types';

const DEBOUNCE_MS = 400;

export function useRaces(params: RaceSearchParams) {
    const [races, setRaces] = useState<Race[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // A monotonically increasing id guards against out-of-order responses.
    const reqId = useRef(0);

    const hasFilters =
        !!params.search ||
        !!params.city ||
        !!params.state ||
        params.distance != null ||
        !!params.level ||
        !!params.terrain ||
        !!params.dateFrom ||
        !!params.dateTo;

    const run = useCallback(async (p: RaceSearchParams, useSuggested: boolean) => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        try {
            const data = useSuggested ? await getSuggestedRaces() : await searchRaces(p);
            if (id === reqId.current) setRaces(data);
        } catch (e) {
            if (id === reqId.current) {
                setError(e instanceof Error ? e.message : 'Erro ao buscar provas');
                setRaces([]);
            }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            run(params, !hasFilters);
        }, DEBOUNCE_MS);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        params.search,
        params.city,
        params.state,
        params.distance,
        params.level,
        params.terrain,
        params.dateFrom,
        params.dateTo,
        hasFilters,
        run,
    ]);

    return { races, loading, error };
}
