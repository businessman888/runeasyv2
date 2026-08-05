import { useEffect } from 'react';
import {
    Easing,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';

/**
 * A COREOGRAFIA DE ENTRADA DA TELA.
 *
 * Um único progresso 0→1 por seção, atrasado pelo índice dela na ordem de
 * leitura. Cada componente interpola dele o que precisar (altura de barra,
 * vértice de radar, opacidade, contador) — sempre na UI thread, sem re-render.
 *
 * ── POR QUE STAGGER, E NÃO TUDO DE UMA VEZ ───────────────────────────────────
 *
 * Revelar em onda é o maior lever de "premium" com o menor custo. Tudo aparecer
 * junto lê como um screenshot que apareceu; em onda, lê como uma tela que foi
 * composta. 45ms é o suficiente para o olho perceber a sequência sem que a
 * espera incomode em uma tela que a pessoa abre toda semana.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────
 *
 * Com "reduzir movimento" ligado no OS, o valor vai direto para 1: nada anima,
 * nada atrasa, e a tela continua completa. Movimento é enriquecimento, nunca
 * pré-requisito para ler o conteúdo.
 */

/** Intervalo entre seções. 45ms lê como coreografado; acima de ~60 lê como lento. */
export const STAGGER_MS = 45;
const DURATION_MS = 500;

/**
 * @param index Posição da seção na ordem de leitura (0 = primeira).
 * @param enabled `false` segura a animação — use quando o dado ainda não chegou,
 *   para a seção não animar vazia e depois "pular" ao preencher.
 */
export function useEnterAnimation(
    index: number,
    enabled = true,
): SharedValue<number> {
    const reduced = useReducedMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (!enabled) return;

        if (reduced) {
            progress.value = 1;
            return;
        }

        progress.value = withDelay(
            index * STAGGER_MS,
            withTiming(1, {
                duration: DURATION_MS,
                // Ease-out: sai rápido e assenta devagar — a curva que lê como
                // física em vez de mecânica.
                easing: Easing.out(Easing.cubic),
            }),
        );
        // Só no mount (ou quando o dado habilita). Reanimar a cada render faria
        // a tela tremer a cada atualização de store.
    }, [index, enabled, reduced, progress]);

    return progress;
}
