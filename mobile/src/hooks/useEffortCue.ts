import { useEffect, useMemo } from 'react';

import { useWeeklyInsightStore } from '../stores/weeklyInsightStore';
import {
    deriveEffortCue,
    type EffortCueDiagnosis,
} from '../screens/weekly-insight/adjustmentCopy';
import { addDaysStr, getTodayStrSaoPaulo } from '../utils/planDate';

/**
 * A ORIENTAÇÃO DE ESFORÇO DA SEMANA — Fase 6.4.
 *
 * ── POR QUE ISTO NÃO PERSISTE NADA ───────────────────────────────────────────
 *
 * `aliviar_ritmo` é a única sugestão da Fase 6 que NÃO escreve no plano: pace é
 * da Fase 3, e a Fase 6 escrevê-lo reabriria a corrida que a fundação existe
 * para fechar. Sem escrita, não há o que carimbar — então o cue é DERIVADO do
 * insight que já existe, e some sozinho. Nenhuma coluna, nenhuma migration.
 *
 * ── A JANELA: "A SEMANA QUE CONTÉM HOJE" ─────────────────────────────────────
 *
 * O insight fecha a semana N e é lido já dentro da N+1, que está correndo. A
 * orientação vale para as corridas que vêm A SEGUIR — inclusive a de hoje.
 * Isso é deliberadamente DIFERENTE do alvo da 6.2/6.3, que é a semana seguinte:
 * aquelas ESCREVEM, e a fronteira "hoje é intocável" as impede de mexer na
 * semana corrente. Coaching não tem essa fronteira.
 *
 * O limite de `week_end + 7` é a rede: se o cron falhar e nenhum insight novo
 * chegar, o conselho expira em vez de fossilizar na tela. O caminho normal é
 * outro — o próximo insight substitui `latest` e o cue muda com ele.
 *
 * ── PRO SAI DE GRAÇA ─────────────────────────────────────────────────────────
 *
 * `GET /training/weekly-insight/latest` já é `@UseGuards(ProGuard)`. Conta Free
 * recebe `latest === null`, então nenhuma tela mostra o cue. Não há gating novo
 * a manter em sincronia.
 */

/** Dias após o fim da semana fechada em que o conselho ainda vale. */
export const CUE_WINDOW_DAYS = 7;

export interface EffortCue {
    /** A semana corrente está sob o conselho de segurar o ritmo? */
    active: boolean;
    /** Os números medidos que sustentam o conselho. `null` quando inativo. */
    diagnosis: EffortCueDiagnosis | null;
}

const INACTIVE: EffortCue = { active: false, diagnosis: null };

export function useEffortCue(): EffortCue {
    const latest = useWeeklyInsightStore((s) => s.latest);
    const fetch = useWeeklyInsightStore((s) => s.fetch);

    // A Home já carrega o insight, mas o treino pode ser aberto por deep link ou
    // pela notificação, sem passar por ela. O TTL de 5 min do store torna esta
    // chamada barata no caminho comum.
    useEffect(() => {
        void fetch();
    }, [fetch]);

    return useMemo(() => {
        const diagnosis = deriveEffortCue(latest);
        if (!diagnosis || !latest?.week_end) return INACTIVE;

        const limite = addDaysStr(latest.week_end, CUE_WINDOW_DAYS);
        if (!limite || getTodayStrSaoPaulo() > limite) return INACTIVE;

        return { active: true, diagnosis };
    }, [latest]);
}
