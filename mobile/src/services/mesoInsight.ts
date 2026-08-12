import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import * as Storage from '../utils/storage';
import type { MesoInsight } from '../types/mesoInsight.types';

async function getHeaders(): Promise<Record<string, string>> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
    };
}

/**
 * Último insight de mesociclo concluído.
 *
 * Como no semanal, os endpoints são ProGuard no backend: um usuário Free recebe
 * 403, que aqui vira `null` em vez de erro — a ausência de insight é um estado
 * normal, não uma falha a exibir.
 *
 * Não existe `/apply`: o insight de bloco é reflexão pura, sem ação.
 */
export async function getLatestMesoInsight(): Promise<MesoInsight | null> {
    const headers = await getHeaders();
    const res = await authedFetch(
        `${BASE_API_URL}/training/meso-insight/latest`,
        { headers },
    );

    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `Falha ao buscar insight de mesociclo (${res.status}): ${text}`,
        );
    }

    const json = (await res.json()) as Record<string, unknown>;
    return (json.insight as MesoInsight | null) ?? null;
}

/**
 * Carimba o insight de bloco como visto — cada card do carrossel marca o seu.
 * Idempotente no backend; falha aqui nunca interrompe a navegação.
 */
export async function markMesoInsightSeen(insightId: string): Promise<void> {
    const headers = await getHeaders();
    await authedFetch(
        `${BASE_API_URL}/training/meso-insight/${insightId}/seen`,
        { method: 'PATCH', headers },
    ).catch(() => undefined);
}
