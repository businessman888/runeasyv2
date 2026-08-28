import { useCallback, useEffect, useRef, useState } from 'react';

import {
    applyDaySwap,
    getDaySwapContext,
    getDaySwapPreview,
} from '../services/planAdaptation';
import { useTrainingStore } from '../stores/trainingStore';
import type {
    DaySwapChoice,
    DaySwapContextResult,
    DaySwapPreviewResult,
    DaySwapWeekWorkout,
    Weekday,
} from '../types/planAdaptation.types';

/**
 * A CONVERSA da Troca de Dias — Fase T.2.
 *
 * ── ISTO NÃO É UM AGENTE ─────────────────────────────────────────────────────
 *
 * É uma máquina de estados com falas fixas. Nenhuma chamada de LLM, nenhuma
 * geração, nenhum ramo imprevisível — o fluxo inteiro cabe no diagrama abaixo e
 * é o mesmo toda vez. O efeito de digitação da tela é textura de conversa, não
 * streaming de nada.
 *
 *   loading ─→ unavailable
 *           └→ greeting → askMode ─→ mode1_pickDays ─────────┐
 *                                 └→ mode2_pickWorkout          ├→ previewing → preview
 *                                    └→ mode2_pickDate ─────────┘
 *
 *   preview → applying ─→ success
 *                      ├→ conflict   (preview recalculada, reconfirma)
 *                      └→ failed     (terminal)
 *   qualquer → cancelled (terminal)
 *
 * ── POR QUE A LÓGICA MORA AQUI E NÃO NA TELA ─────────────────────────────────
 *
 * A tela renderiza mensagens e dispara ações; ela não sabe o que vem depois de
 * quê. Separar assim é o que permite ler o fluxo inteiro num arquivo só — e é o
 * mesmo motivo pelo qual a T.1 pôs o cálculo num helper puro em vez de dentro
 * do serviço.
 */

export type ChatState =
    | 'loading'
    | 'unavailable'
    | 'greeting'
    | 'askMode'
    | 'mode1_pickDays'
    | 'mode2_pickWorkout'
    | 'mode2_pickDate'
    | 'previewing'
    | 'preview'
    | 'applying'
    | 'success'
    | 'conflict'
    | 'failed'
    | 'cancelled';

/** O que a bolha renderiza abaixo do texto, quando há escolha a fazer. */
export type ChatWidget =
    | 'modeButtons'
    | 'dayPicker'
    | 'workoutPicker'
    | 'datePicker'
    | 'summary'
    | 'confirmButtons'
    | 'restart';

export interface ChatMessage {
    id: string;
    from: 'bot' | 'user';
    text: string;
    /** Só a última mensagem do bot carrega widget. */
    widget?: ChatWidget;
}

const DAY_FULL = [
    'domingo',
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado',
] as const;

/**
 * As falas, num lugar só.
 *
 * Espalhá-las pelos `case` tornaria impossível revisar a voz do bot sem ler a
 * máquina inteira — e a voz é metade da feature.
 */
const SAY = {
    greeting: (dias: Weekday[]) =>
        `Oi! Hoje você treina ${listarDias(dias)}.`,
    askMode: 'O que você quer fazer?',
    mode1Intro: (n: number) =>
        `Beleza. Escolha os ${n} dias novos — a troca vale a partir da próxima semana, então esta aqui fica como está.`,
    mode2Intro: 'Qual treino desta semana você quer mover?',
    mode2Date: (titulo: string) =>
        `Para quando você quer mover ${titulo}? Só apareço com dias que ainda não passaram e que estão livres.`,
    previewing: 'Deixa eu ver como fica...',
    previewOk: 'Prontinho, olha como fica:',
    previewTight:
        'Fica assim — mas repara que dois treinos pesados ficam em dias seguidos. Dá para treinar assim; é só saber que a perna vai sentir.',
    confirm: 'Pode confirmar?',
    applying: 'Trocando...',
    successStructural: (dias: Weekday[]) =>
        `Feito! A partir da próxima semana você treina ${listarDias(dias)}. Já atualizei sua agenda.`,
    successSingle: 'Feito! Já movi o treino e atualizei sua agenda.',
    conflict:
        'Seu plano mudou desde que abrimos esta conversa. Recalculei — confere como fica agora:',
    cancelled: 'Tudo bem, não mudei nada. Sua agenda continua como estava.',
    unexpected:
        'Algo deu errado do nosso lado e eu não consegui trocar seus dias. Sua agenda continua como estava.',
} as const;

function listarDias(dias: Weekday[]): string {
    const nomes = [...dias].sort((a, b) => a - b).map((d) => DAY_FULL[d]);
    if (nomes.length === 1) return nomes[0];
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

export function useDaySwapChat() {
    const invalidatePlanCaches = useTrainingStore((s) => s.invalidatePlanCaches);

    const [state, setState] = useState<ChatState>('loading');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [context, setContext] = useState<DaySwapContextResult | null>(null);
    const [preview, setPreview] = useState<DaySwapPreviewResult | null>(null);
    const [choice, setChoice] = useState<DaySwapChoice | null>(null);
    const [pickedWorkout, setPickedWorkout] =
        useState<DaySwapWeekWorkout | null>(null);
    const [error, setError] = useState<string | null>(null);

    const seq = useRef(0);
    const nextId = () => `m${(seq.current += 1)}`;

    /** Acrescenta ao fim e tira o widget de quem já foi respondido. */
    const push = useCallback(
        (from: 'bot' | 'user', text: string, widget?: ChatWidget) => {
            setMessages((prev) => [
                ...prev.map((m) => ({ ...m, widget: undefined })),
                { id: nextId(), from, text, widget },
            ]);
        },
        [],
    );

    // ── Início / reinício ────────────────────────────────────────────────────

    const start = useCallback(async () => {
        seq.current = 0;
        setMessages([]);
        setPreview(null);
        setChoice(null);
        setPickedWorkout(null);
        setError(null);
        setState('loading');

        try {
            const ctx = await getDaySwapContext();
            setContext(ctx);

            if (!ctx.available || !ctx.currentDays?.length) {
                setState('unavailable');
                push(
                    'bot',
                    ctx.message ?? 'Não dá para trocar seus dias agora.',
                    'restart',
                );
                return;
            }

            setState('askMode');
            setMessages([
                {
                    id: nextId(),
                    from: 'bot',
                    text: SAY.greeting(ctx.currentDays),
                },
                {
                    id: nextId(),
                    from: 'bot',
                    text: SAY.askMode,
                    widget: 'modeButtons',
                },
            ]);
        } catch {
            setState('failed');
            setError('Verifique sua conexão e tente de novo.');
            push('bot', 'Não consegui carregar seus dias agora.', 'restart');
        }
    }, [push]);

    useEffect(() => {
        void start();
        // Só na montagem: `start` é estável e reexecutar reiniciaria a conversa.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Escolha do modo ──────────────────────────────────────────────────────

    const chooseMode = useCallback(
        (mode: 'structural' | 'single') => {
            if (!context?.available) return;

            if (mode === 'structural') {
                push('user', 'Trocar meus dias de vez');
                setState('mode1_pickDays');
                push(
                    'bot',
                    SAY.mode1Intro(context.dayCount ?? 0),
                    'dayPicker',
                );
                return;
            }

            push('user', 'Mexer num treino desta semana');

            // Sem treino futuro ou sem dia livre, o Modo 2 não tem o que
            // oferecer — e dizer isso é melhor que abrir um select vazio.
            const semana = context.currentWeek;
            if (!semana?.workouts.length) {
                setState('failed');
                push(
                    'bot',
                    'Esta semana não tem mais nenhum treino para mover.',
                    'restart',
                );
                return;
            }
            if (!semana.freeDates.length) {
                setState('failed');
                push(
                    'bot',
                    'Não sobrou nenhum dia livre nesta semana para onde mover.',
                    'restart',
                );
                return;
            }

            setState('mode2_pickWorkout');
            push('bot', SAY.mode2Intro, 'workoutPicker');
        },
        [context, push],
    );

    // ── Preview ──────────────────────────────────────────────────────────────
    //
    // Declarado ANTES dos escolhedores porque os dois o chamam. A ordem é a do
    // fluxo mesmo: escolher leva a simular.

    const runPreview = useCallback(
        async (c: DaySwapChoice) => {
            setState('previewing');
            push('bot', SAY.previewing);

            try {
                const p = await getDaySwapPreview(c);

                if (!p.available) {
                    setState('failed');
                    push(
                        'bot',
                        p.message ?? 'Não deu para montar essa troca.',
                        'restart',
                    );
                    return;
                }

                setPreview(p);
                setState('preview');
                setMessages((prev) => [
                    ...prev.map((m) => ({ ...m, widget: undefined })),
                    {
                        id: nextId(),
                        from: 'bot',
                        text:
                            p.spacing?.verdict === 'apertado'
                                ? SAY.previewTight
                                : SAY.previewOk,
                        widget: 'summary',
                    },
                    {
                        id: nextId(),
                        from: 'bot',
                        text: SAY.confirm,
                        widget: 'confirmButtons',
                    },
                ]);
            } catch {
                setState('failed');
                setError('Verifique sua conexão e tente de novo.');
                push('bot', 'Não consegui simular a troca agora.', 'restart');
            }
        },
        [push],
    );

    // ── Modo 1 ───────────────────────────────────────────────────────────────

    const chooseDays = useCallback(
        (dias: Weekday[]) => {
            push('user', listarDias(dias));
            const c: DaySwapChoice = { mode: 'structural', newDays: dias };
            setChoice(c);
            void runPreview(c);
        },
        [push, runPreview],
    );

    // ── Modo 2 ───────────────────────────────────────────────────────────────

    const chooseWorkout = useCallback(
        (w: DaySwapWeekWorkout) => {
            setPickedWorkout(w);
            push('user', w.title ?? labelDoTipo(w.type));
            setState('mode2_pickDate');
            push(
                'bot',
                SAY.mode2Date(w.title ?? labelDoTipo(w.type)),
                'datePicker',
            );
        },
        [push],
    );

    const chooseDate = useCallback(
        (date: string) => {
            if (!pickedWorkout) return;
            push('user', formatarData(date));
            const c: DaySwapChoice = {
                mode: 'single',
                workoutId: pickedWorkout.workoutId,
                targetDate: date,
            };
            setChoice(c);
            void runPreview(c);
        },
        [pickedWorkout, push, runPreview],
    );

    // ── Apply ────────────────────────────────────────────────────────────────

    const confirm = useCallback(async () => {
        if (!choice || !preview?.digest) return;

        push('user', 'Confirmar');
        setState('applying');

        try {
            // O digest DA PREVIEW, nunca um buscado agora — é ele que garante
            // que o corredor está confirmando o que viu.
            const result = await applyDaySwap(choice, preview.digest);

            if (result.applied) {
                // Sem isto o calendário, a home e as Metas continuam mostrando
                // o plano velho até o app reiniciar.
                await invalidatePlanCaches();
                setState('success');
                push(
                    'bot',
                    choice.mode === 'structural' && result.daysSaved?.length
                        ? SAY.successStructural(result.daysSaved)
                        : SAY.successSingle,
                    'restart',
                );
                return;
            }

            // ── new_date_in_past NÃO é retentável ───────────────────────────
            //
            // A T.1 garante data futura por construção: o Modo 1 começa na
            // próxima semana, o Modo 2 só oferece dia futuro. Se este motivo
            // chegar aqui, a camada de cálculo deixou passar — é DEFEITO, não
            // fluxo. Oferecer "tentar de novo" mandaria o corredor a um laço
            // que nunca converge, porque a data continuaria no passado.
            if (result.reason === 'new_date_in_past') {
                console.error(
                    '[DaySwap] new_date_in_past chegou ao cliente — a lógica da T.1 gerou uma data no passado.',
                    { mode: choice.mode, choice },
                );
                setState('failed');
                push('bot', SAY.unexpected, 'restart');
                return;
            }

            // Conflito: o estado mudou entre a preview e o confirmar. ESTE sim
            // é retentável — com a preview recalculada que o backend devolveu.
            if (result.preview?.available) {
                setPreview(result.preview);
                setState('conflict');
                // Mesma forma do caminho normal: o resumo com a explicação, e o
                // pedido de confirmação separado. É o corredor reconfirmando
                // sobre o estado NOVO, não repetindo o toque anterior.
                setMessages((prev) => [
                    ...prev.map((m) => ({ ...m, widget: undefined })),
                    {
                        id: nextId(),
                        from: 'bot',
                        text: SAY.conflict,
                        widget: 'summary',
                    },
                    {
                        id: nextId(),
                        from: 'bot',
                        text: SAY.confirm,
                        widget: 'confirmButtons',
                    },
                ]);
                return;
            }

            setState('failed');
            push(
                'bot',
                result.message ?? 'Não foi possível trocar seus dias agora.',
                'restart',
            );
        } catch {
            setState('failed');
            setError('Verifique sua conexão e tente de novo.');
            push('bot', 'Não consegui concluir a troca agora.', 'restart');
        }
    }, [choice, preview, invalidatePlanCaches, push]);

    const cancel = useCallback(() => {
        push('user', 'Cancelar');
        setState('cancelled');
        push('bot', SAY.cancelled, 'restart');
    }, [push]);

    return {
        state,
        messages,
        context,
        preview,
        pickedWorkout,
        error,
        actions: { start, chooseMode, chooseDays, chooseWorkout, chooseDate, confirm, cancel },
    };
}

// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
    long_run: 'Longão',
    easy_run: 'Rodagem leve',
    recovery: 'Regenerativo',
    tempo: 'Tempo run',
    intervals: 'Intervalado',
    fartlek: 'Fartlek',
    hill_repeats: 'Ladeira',
    repetition: 'Tiros curtos',
    progressive: 'Progressivo',
    race_simulation: 'Simulação de prova',
    walk_run: 'Caminhada e corrida',
};

export function labelDoTipo(type: string | null): string {
    return TYPE_LABEL[type ?? ''] ?? 'Treino';
}

/** `YYYY-MM-DD` → "sáb, 29/08". Sem `Date` de string: nada de fuso. */
export function formatarData(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const curto = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dow];
    return `${curto}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** O dia da semana de `YYYY-MM-DD`, em UTC — nunca na TZ do processo. */
export function weekdayOf(dateStr: string): Weekday {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}
