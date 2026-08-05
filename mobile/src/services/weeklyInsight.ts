import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import * as Storage from '../utils/storage';
import type {
    WeeklyInsight,
    ApplyAdjustmentResult,
} from '../types/weeklyInsight.types';

async function getHeaders(): Promise<Record<string, string>> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
    };
}

/**
 * Todos os endpoints são ProGuard no backend. Um usuário Free recebe 403, que
 * aqui vira `null`/`false` em vez de erro — a ausência de insight é um estado
 * normal da tela, não uma falha a exibir.
 */
async function getOrNull(path: string, key: string): Promise<WeeklyInsight | null> {
    const headers = await getHeaders();
    const res = await authedFetch(`${BASE_API_URL}/training/${path}`, { headers });

    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Falha ao buscar insight semanal (${res.status}): ${text}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    return (json[key] as WeeklyInsight | null) ?? null;
}

/**
 * Último insight concluído — alimenta o CARD, a TELA e o MODAL.
 *
 * Uma seleção só, de propósito. Havia um `/unseen` separado que buscava o mais
 * recente ENTRE OS NÃO VISTOS, e isso trazia de volta uma semana antiga zerada
 * depois que a recente já tinha sido lida. Com a mesma linha alimentando os
 * três, card e modal não têm como discordar.
 */
export function getLatestWeeklyInsight(): Promise<WeeklyInsight | null> {
    return getOrNull('weekly-insight/latest', 'insight');
}

/**
 * Carimba o insight como visto. Idempotente no backend; falha aqui nunca
 * interrompe a navegação — no pior caso o modal reaparece uma vez.
 */
export async function markWeeklyInsightSeen(insightId: string): Promise<void> {
    const headers = await getHeaders();
    await authedFetch(
        `${BASE_API_URL}/training/weekly-insight/${insightId}/seen`,
        { method: 'PATCH', headers },
    ).catch(() => undefined);
}

/**
 * Aplica o reajuste de classe `schedule` — re-ancora o plano a partir de hoje.
 *
 * O backend recusa a classe `prescription` com `not_actionable`; a UI nunca
 * deveria chegar a chamar isso, porque conselho não tem botão.
 */
export async function applyWeeklyInsightAdjustment(
    insightId: string,
): Promise<ApplyAdjustmentResult> {
    const headers = await getHeaders();
    const res = await authedFetch(
        `${BASE_API_URL}/training/weekly-insight/${insightId}/apply`,
        { method: 'POST', headers },
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Falha ao aplicar o ajuste (${res.status}): ${text}`);
    }

    return (await res.json()) as ApplyAdjustmentResult;
}
