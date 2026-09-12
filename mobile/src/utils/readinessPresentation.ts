/**
 * A APRESENTAÇÃO do readiness — regras PURAS, sem React Native.
 *
 * Moram fora dos componentes por dois motivos: são testáveis sem jest
 * (`npm run test:readiness`, via `node --test`), e concentram as regras que a
 * R.2a existe para cumprir. A principal delas: **nenhuma função aqui inventa
 * dado.** O que não veio do backend some da tela — não vira "7h 30m".
 *
 * ⚠️ Só `import type` neste arquivo. Um import de valor puxaria React Native
 * para dentro do `node --test`, que não sabe carregá-lo.
 */

import type { AppIconName, IconTone } from '../theme/iconography';
import type { ReadinessStatusColor } from '../types/wellness.types';
import type {
    AnalyzeOutcome,
    FloorProgress,
    ReadinessStatus,
    ReadinessVerdict,
} from '../types/readiness.types';

// ─────────────────────────────────────────────────────────────────────────────
// O desfecho do POST /readiness/analyze
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: readonly ReadinessStatusColor[] = ['green', 'yellow', 'red'];

export const PRO_GATE_MESSAGE = 'A prontidão diária faz parte do RunEasy Pro.';
export const LEARNING_MESSAGE =
    'Sua prontidão ainda está aprendendo o seu normal. Continue treinando.';

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

/**
 * O `message` de um corpo de erro. O filtro global aceita `string | string[]`
 * (o array é do ValidationPipe); só uma string não-vazia serve para a tela.
 */
function messageOf(body: Record<string, unknown>, fallback: string): string {
    const m = text(body.message).trim();
    return m || fallback;
}

/**
 * Valida a forma mínima de um veredito em vez de confiar num `as`.
 *
 * Score e cor são obrigatórios — sem eles não há o que mostrar. O resto degrada
 * para vazio: um texto de IA ausente vira linha em branco, nunca um crash.
 */
export function toVerdict(raw: unknown): ReadinessVerdict | null {
    if (!isRecord(raw)) return null;

    const score = raw.readiness_score;
    const color = raw.status_color;
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    if (!STATUS_COLORS.includes(color as ReadinessStatusColor)) return null;

    const analysis = isRecord(raw.ai_analysis) ? raw.ai_analysis : {};

    return {
        readiness_score: score,
        status_color: color as ReadinessStatusColor,
        status_label: text(raw.status_label),
        ai_analysis: {
            headline: text(analysis.headline),
            reasoning: text(analysis.reasoning),
            plan_adjustment: text(analysis.plan_adjustment),
        },
        // Cada item é validado na hora de virar tile (`metricTiles`).
        metrics_summary: Array.isArray(raw.metrics_summary)
            ? (raw.metrics_summary as ReadinessVerdict['metrics_summary'])
            : [],
        generated_at: text(raw.generated_at),
    };
}

export function toFloorProgress(raw: unknown): FloorProgress | null {
    if (!isRecord(raw)) return null;
    const campos = ['spanDays', 'runDays', 'missingSpanDays', 'missingRunDays'] as const;
    for (const c of campos) {
        const v = raw[c];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    }
    return {
        spanDays: raw.spanDays as number,
        runDays: raw.runDays as number,
        missingSpanDays: raw.missingSpanDays as number,
        missingRunDays: raw.missingRunDays as number,
    };
}

/**
 * O corpo de uma resposta de `/readiness/analyze` → um desfecho, ou `null`.
 *
 * Mesmo molde de `decisionBody` em `services/planAdaptation.ts`: **uma recusa
 * do servidor é RESULTADO, não exceção.** Antes daqui o store fazia
 * `if (!res.ok) throw`, e o corredor abaixo do piso lia
 * `Falha ao analisar prontidão: HTTP 422: {"message":…}` num `<Text>`.
 *
 * `null` é o único caminho de erro: rede, 5xx, 401, 400, corpo ilegível. Esses
 * são retentáveis; os quatro desfechos abaixo não são.
 *
 * ⚠️ O `learning` do 422 NÃO chega aqui hoje. O controller o põe no corpo da
 * exceção, mas o `AllExceptionsFilter` global reescreve toda resposta de erro
 * para `{ statusCode, message, timestamp, path }` e o descarta. Por isso o
 * normal é `learning: null` neste caminho — a tela completa com o do `/status`.
 */
export function interpretAnalyzeResponse(
    status: number,
    body: unknown,
): AnalyzeOutcome | null {
    if (!isRecord(body)) return null;

    // 2xx e não só 200: `@Post` do Nest responde 201 quando não há `@HttpCode`.
    if (status >= 200 && status < 300) {
        const verdict = toVerdict(body);
        if (!verdict) return null;
        if (body.alreadyCompleted === true) {
            const message = text(body.message).trim();
            return { kind: 'ja_respondeu', verdict, message: message || null };
        }
        return { kind: 'ok', verdict };
    }

    if (status === 422) {
        return {
            kind: 'aprendendo',
            learning: toFloorProgress(body.learning),
            message: messageOf(body, LEARNING_MESSAGE),
        };
    }

    if (status === 403) {
        return { kind: 'pro_gate', message: messageOf(body, PRO_GATE_MESSAGE) };
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A grade de métricas
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricTile {
    key: string;
    label: string;
    value: string;
    sublabel: string | null;
    icon: AppIconName;
}

/**
 * Rótulo (normalizado) → ícone do design system.
 *
 * O backend manda `icon` num vocabulário próprio (`bed`, `activity`, …) que não
 * é `AppIconName`; a decisão foi o motor ficar agnóstico de UI e o mobile
 * derivar do rótulo. `energia` está aqui porque vereditos gravados ANTES da R.1
 * (escritos pelo LLM) ainda têm esse tile e são relidos no modo revisão.
 *
 * `Map` e não objeto literal: `obj['constructor']` devolveria a função herdada
 * de `Object` — o mesmo defeito que já envenenou a série de carga no backend.
 */
const ICON_BY_LABEL = new Map<string, AppIconName>([
    ['sono', 'sleep'],
    ['pernas', 'running'],
    ['carga de treino', 'trainingLoad'],
    ['carga', 'trainingLoad'],
    ['estresse', 'stress'],
    ['humor', 'mood'],
    ['motivação', 'energy'],
    ['energia', 'energy'],
]);

const FALLBACK_TILE_ICON: AppIconName = 'readiness';

/**
 * Os tiles, na ORDEM e com o RÓTULO do payload.
 *
 * ⚠️ A tela lia `metrics_summary[0..3]` com rótulos cravados
 * `["Sono","Carga de Treino","Energia","Estresse"]`. A R.1 passou a emitir
 * `[Sono, Pernas, Carga, Estresse]` e a grade mostrou pernas sob "Carga de
 * Treino" e a carga sob "Energia" — sem erro, sem log. Lendo o rótulo junto com
 * o valor, a troca deixa de ser expressável.
 *
 * Item sem rótulo ou sem valor SOME. Os fallbacks antigos ("7h 30m" de sono, num
 * app que nunca mediu sono) não têm substituto: não existe dado, não existe tile.
 */
export function metricTiles(items: unknown): MetricTile[] {
    if (!Array.isArray(items)) return [];

    const tiles: MetricTile[] = [];
    items.forEach((raw, i) => {
        if (!isRecord(raw)) return;
        const label = text(raw.label).trim();
        const value = text(raw.value).trim();
        if (!label || !value) return;

        const sublabel = text(raw.sublabel).trim();
        tiles.push({
            key: `${i}:${label}`,
            label,
            value,
            sublabel: sublabel || null,
            icon: ICON_BY_LABEL.get(label.toLowerCase()) ?? FALLBACK_TILE_ICON,
        });
    });
    return tiles;
}

// ─────────────────────────────────────────────────────────────────────────────
// O bloqueio pelo piso de histórico
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O PORQUÊ do bloqueio, dito ao corredor. A copy de bloqueio tem de explicar o
 * progresso, não só mostrá-lo (requisito do João na R.1).
 */
export const FLOOR_EXPLANATION =
    'A prontidão compara você com o seu próprio normal — pra isso ela precisa de 2 semanas e 6 corridas.';

const ELIGIBILITY_REASONS: ReadonlyArray<NonNullable<ReadinessStatus['eligibilityReason']>> = [
    'ok',
    'sem_historico',
    'ja_respondeu',
    'indisponivel',
];

/**
 * O corpo do `/readiness/status` → `ReadinessStatus`, ou `null` se ilegível.
 *
 * Substitui um `as ReadinessStatus` cego: era nele que os campos que a R.1
 * acrescentou morriam, e um `todayVerdict` malformado de uma linha antiga
 * chegaria intacto à tela de revisão.
 */
export function toReadinessStatus(raw: unknown): ReadinessStatus | null {
    if (!isRecord(raw) || typeof raw.isUnlocked !== 'boolean') return null;

    const reason = raw.eligibilityReason as ReadinessStatus['eligibilityReason'];
    return {
        isUnlocked: raw.isUnlocked,
        hasCompletedFirstWorkout: raw.hasCompletedFirstWorkout === true,
        canCheckInToday: raw.canCheckInToday === true,
        hasCompletedToday: raw.hasCompletedToday === true,
        lastCheckInDate: typeof raw.lastCheckInDate === 'string' ? raw.lastCheckInDate : null,
        todayVerdict: toVerdict(raw.todayVerdict),
        todayAnswers: isRecord(raw.todayAnswers)
            ? (raw.todayAnswers as unknown as ReadinessStatus['todayAnswers'])
            : null,
        learning: toFloorProgress(raw.learning),
        eligibilityReason: ELIGIBILITY_REASONS.includes(reason) ? reason : undefined,
    };
}

export type ReadinessLock =
    | { kind: 'open' }
    | { kind: 'aprendendo'; learning: FloorProgress | null }
    | { kind: 'indisponivel' };

/**
 * Por que o check-in está (ou não) liberado — o que decide a copy do bloqueio.
 *
 * `indisponivel` existe para que falha de rede pare de se passar por "você
 * ainda não treinou": o store devolvia tudo `false` quando o `/status` caía, e o
 * card afirmava "Complete seu primeiro treino" para quem tinha 40 corridas.
 */
export function deriveReadinessLock(
    status: ReadinessStatus | null | undefined,
): ReadinessLock {
    if (!status) return { kind: 'indisponivel' };
    if (status.isUnlocked) return { kind: 'open' };
    if (status.eligibilityReason === 'indisponivel') return { kind: 'indisponivel' };
    return { kind: 'aprendendo', learning: status.learning ?? null };
}

function contagem(n: number, um: string, varios: string): string {
    return `${n} ${n === 1 ? um : varios}`;
}

/**
 * "Faltam 8 dias e 3 corridas pra desbloquear." — o progresso em frase.
 *
 * O piso tem DUAS condições (14 dias desde a 1ª corrida E 6 dias com corrida),
 * e só se cita a que falta. `runDays === 0` é o corredor que nunca correu: o
 * backend devolve `missingSpanDays: 14`, mas esses dias não começam a contar
 * até a primeira corrida — dizer "faltam 14 dias" seria falso.
 */
export function describeFloorProgress(
    learning: FloorProgress | null | undefined,
): string {
    if (!learning) {
        return 'Precisamos de algumas semanas de corridas pra conhecer o seu normal.';
    }
    if (learning.runDays === 0) {
        return 'Sua primeira corrida começa a calibragem.';
    }

    const partes: string[] = [];
    if (learning.missingSpanDays > 0) {
        partes.push(contagem(learning.missingSpanDays, 'dia', 'dias'));
    }
    if (learning.missingRunDays > 0) {
        partes.push(contagem(learning.missingRunDays, 'corrida', 'corridas'));
    }
    if (partes.length === 0) {
        return 'Quase lá — falta pouco pra desbloquear.';
    }

    const sozinhoNoSingular =
        partes.length === 1 &&
        (learning.missingSpanDays === 1 || learning.missingRunDays === 1);
    return `${sozinhoNoSingular ? 'Falta' : 'Faltam'} ${partes.join(' e ')} pra desbloquear.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// O semáforo (a parte sem tema — as cores moram no componente)
// ─────────────────────────────────────────────────────────────────────────────

/** Espelha `STATUS_LABELS` do backend. Só é usado se o veredito vier sem rótulo. */
export const SIGNAL_FALLBACK_LABEL: Record<ReadinessStatusColor, string> = {
    green: 'Pronto para treinar',
    yellow: 'Sinal amarelo — atenção',
    red: 'Dia de recuperação',
};

/** Três FORMAS distintas: o estado não pode depender só da cor. */
export const SIGNAL_ICON: Record<ReadinessStatusColor, AppIconName> = {
    green: 'check',
    yellow: 'warning',
    red: 'readiness',
};

/** O verde é `success`, nunca `accent` — era o ciano que rendia o "Sinal azul". */
export const SIGNAL_TONE: Record<ReadinessStatusColor, IconTone> = {
    green: 'success',
    yellow: 'warning',
    red: 'danger',
};

/** O texto do motor ("Dia de recuperação"); o mapa estático só como fallback. */
export function signalLabel(
    color: ReadinessStatusColor,
    label?: string | null,
): string {
    const t = (label ?? '').trim();
    return t || SIGNAL_FALLBACK_LABEL[color];
}

/** "HH:MM" da análise, ou `null` quando o timestamp não é legível. */
export function generatedTimeLabel(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
