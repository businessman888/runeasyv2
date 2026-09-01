import type { WatchContext } from './appleWatch';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validação runtime da forma mínima produzida por useWatchSync.
 *
 * TypeScript não protege a fronteira em runtime (estado legado, hot reload ou
 * chamada JS podem entregar null/objetos incompletos). todayWorkout null é
 * válido e representa descanso; a ausência da propriedade não é válida.
 */
export function isWatchContext(value: unknown): value is WatchContext {
    if (!isRecord(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'todayWorkout')) return false;

    const accountIdIsValid = value.accountId === null || typeof value.accountId === 'string';
    const workoutIsValid = value.todayWorkout === null || isRecord(value.todayWorkout);

    return (
        accountIdIsValid
        && typeof value.userName === 'string'
        && typeof value.isPro === 'boolean'
        && workoutIsValid
    );
}

/**
 * Impede uma atualização atrasada de reabrir um treino já concluído.
 * Contextos de descanso não participam da comparação monotônica.
 */
export function mergeMonotonicWatchContext(
    previous: unknown,
    next: unknown,
): WatchContext | null {
    if (!isWatchContext(next)) return null;

    const previousContext = isWatchContext(previous) ? previous : null;
    const previousWorkout = previousContext?.todayWorkout;
    const nextWorkout = next.todayWorkout;

    if (
        previousWorkout
        && nextWorkout
        && previousWorkout.id === nextWorkout.id
        && previousWorkout.status === 'completed'
        && nextWorkout.status !== 'completed'
    ) {
        return {
            ...next,
            todayWorkout: { ...nextWorkout, status: 'completed' },
        };
    }

    return next;
}
