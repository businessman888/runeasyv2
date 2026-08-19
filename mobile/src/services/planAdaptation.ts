import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import * as Storage from '../utils/storage';
import type {
    ReliefApplyResult,
    ReliefLevel,
    ReliefPreviewResult,
    WeekReliefApplyResult,
    WeekReliefPreviewResult,
} from '../types/planAdaptation.types';

/**
 * O transporte do contrato do apply — Fase 6.2.
 *
 * ── CONFLITO NÃO LANÇA ───────────────────────────────────────────────────────
 *
 * A regra que governa este arquivo, e que o serviço do insight semanal violava
 * até agora: uma recusa do servidor é RESULTADO, não exceção. O backend responde
 * sempre 200 com `applied: false` justamente para isso, mas o cliente também
 * precisa cooperar — um `throw` em `!res.ok` transformaria "o plano mudou" em
 * "verifique sua conexão", e o corredor tentaria de novo para sempre.
 *
 * Só falha de transporte de verdade (rede caiu, 5xx, corpo ilegível) lança.
 */

async function getHeaders(): Promise<Record<string, string>> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
    };
}

/** Lê o corpo JSON de uma resposta de decisão. `null` se não for tratável. */
async function decisionBody<T>(res: Response): Promise<T | null> {
    if (!res.ok && (res.status < 400 || res.status >= 500)) return null;
    const body = await res.json().catch(() => null);
    return (body as T) ?? null;
}

/**
 * A PREVIEW: o treino como está, as opções já calculadas e o digest.
 *
 * Devolve `{ available: false }` — nunca lança — quando o treino não pode ser
 * aliviado (é hoje, é prova, é semana de polimento). "Não dá para aliviar" é um
 * estado normal da tela.
 */
export async function getReliefPreview(
    workoutId: string,
): Promise<ReliefPreviewResult> {
    const headers = await getHeaders();
    const res = await authedFetch(
        `${BASE_API_URL}/training/workouts/${workoutId}/relief-preview`,
        { headers },
    );

    // Free recebe 403 do ProGuard: ausência de recurso, não falha.
    if (res.status === 403) {
        return {
            available: false,
            reason: 'not_pro',
            message: 'Ajustar treinos faz parte do RunEasy Pro.',
        };
    }

    const body = await decisionBody<ReliefPreviewResult>(res);
    if (body && typeof body.available === 'boolean') return body;

    const text = await res.text().catch(() => '');
    throw new Error(`Falha ao carregar as opções (${res.status}): ${text}`);
}

/**
 * O APPLY. `expectedDigest` é o da preview que o corredor viu — nunca um
 * recém-buscado, ou a concorrência otimista deixa de existir.
 *
 * Em conflito, a resposta já traz a preview recalculada em `preview`: a folha
 * mostra a situação nova e pede reconfirmação, em vez de repetir às cegas.
 */
export async function applyRelief(
    workoutId: string,
    level: ReliefLevel,
    expectedDigest: string,
): Promise<ReliefApplyResult> {
    const headers = await getHeaders();
    const res = await authedFetch(
        `${BASE_API_URL}/training/workouts/${workoutId}/relief`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({ level, expected_digest: expectedDigest }),
        },
    );

    const body = await decisionBody<ReliefApplyResult>(res);
    if (body && typeof body.applied === 'boolean') return body;

    const text = await res.text().catch(() => '');
    throw new Error(`Falha ao aplicar o ajuste (${res.status}): ${text}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 6.3 — a SEMANA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Preview do alívio da semana SEGUINTE.
 *
 * Não recebe o número da semana: quem resolve é o backend. Um app que não pede
 * semana não tem como pedir a semana errada.
 *
 * `insightId` marca a origem no histórico e é o que permite responder
 * `already_applied` numa segunda abertura do mesmo insight.
 */
export async function getWeekReliefPreview(
    insightId?: string,
): Promise<WeekReliefPreviewResult> {
    const headers = await getHeaders();
    const qs = insightId ? `?insight_id=${encodeURIComponent(insightId)}` : '';
    const res = await authedFetch(
        `${BASE_API_URL}/training/plan/week-relief-preview${qs}`,
        { headers },
    );

    if (res.status === 403) {
        return {
            available: false,
            reason: 'not_pro',
            message: 'Ajustar o plano faz parte do RunEasy Pro.',
        };
    }

    const body = await decisionBody<WeekReliefPreviewResult>(res);
    if (body && typeof body.available === 'boolean') return body;

    const text = await res.text().catch(() => '');
    throw new Error(`Falha ao carregar a semana (${res.status}): ${text}`);
}

/**
 * Aplica o alívio da semana. `expectedDigest` é o da preview que o corredor viu.
 *
 * O backend manda N treinos num patch só; se qualquer um deles tiver mudado, o
 * conflito volta com a preview recalculada — nunca um estado parcial.
 */
export async function applyWeekRelief(
    level: ReliefLevel,
    expectedDigest: string,
    insightId?: string,
): Promise<WeekReliefApplyResult> {
    const headers = await getHeaders();
    const res = await authedFetch(`${BASE_API_URL}/training/plan/week-relief`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            level,
            expected_digest: expectedDigest,
            ...(insightId ? { insight_id: insightId } : {}),
        }),
    });

    const body = await decisionBody<WeekReliefApplyResult>(res);
    if (body && typeof body.applied === 'boolean') return body;

    const text = await res.text().catch(() => '');
    throw new Error(`Falha ao aliviar a semana (${res.status}): ${text}`);
}
