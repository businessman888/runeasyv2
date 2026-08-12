import { useCallback, useState } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
import {
    interpolate,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withSpring,
    type SharedValue,
} from 'react-native-reanimated';

/**
 * A TRANSIÇÃO ENTRE AS DUAS PARTES — o gesto de abrir um post.
 *
 * ── UMA TELA, DUAS CAMADAS, UM VALOR ─────────────────────────────────────────
 *
 * `progress` vai de 0 (stories) a 1 (dashboard) e as duas camadas interpolam
 * dele. Um único shared value é o que mantém as duas em oposição perfeita: o de
 * trás recua e apaga enquanto o da frente sobe e assenta. Com dois valores
 * independentes, um respiro de milissegundos entre eles já lê como falha.
 *
 * Não são duas rotas do navigator porque isto NÃO é navegação: é a mesma tela
 * mostrando outra face. Uma rota traria header, gesto de voltar do sistema e
 * uma entrada no histórico — três coisas que contradizem o gesto.
 *
 * ── A FÍSICA ─────────────────────────────────────────────────────────────────
 *
 * `withSpring` com damping 22 / stiffness 180: assenta em ~450ms sem oscilar.
 * Mola em vez de easing porque o movimento representa um objeto sendo puxado —
 * uma curva linear leria como uma animação, não como um material respondendo.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────
 *
 * Com "reduzir movimento" ligado, `progress` salta direto para o destino. Nada
 * se perde: as duas faces continuam acessíveis, só sem o percurso entre elas.
 * Mesma regra do `useEnterAnimation` do dashboard semanal.
 */

const SPRING = { damping: 22, stiffness: 180 } as const;

/** Acima disso o dashboard já domina a tela — é quando o stagger dele começa. */
const DASHBOARD_VISIBLE_AT = 0.5;

export interface DeckTransition {
    progress: SharedValue<number>;
    /** Estilo da camada de stories (recua e apaga). */
    storiesStyle: ReturnType<typeof useAnimatedStyle>;
    /** Estilo da camada de dashboard (sobe e assenta). */
    dashboardStyle: ReturnType<typeof useAnimatedStyle>;
    open: () => void;
    close: () => void;
    /**
     * `true` quando o dashboard já está visível o suficiente para animar.
     *
     * Existe para o stagger não rodar enquanto o painel ainda está fora da tela
     * — a coreografia aconteceria no vazio e o usuário chegaria num dashboard
     * já montado, sem a onda.
     */
    dashboardReady: boolean;
}

export function useDeckTransition(): DeckTransition {
    const { height } = useWindowDimensions();
    const reduced = useReducedMotion();
    const progress = useSharedValue(0);
    const [dashboardReady, setDashboardReady] = useState(false);

    const open = useCallback(() => {
        progress.value = reduced ? 1 : withSpring(1, SPRING);
    }, [progress, reduced]);

    const close = useCallback(() => {
        progress.value = reduced ? 0 : withSpring(0, SPRING);
    }, [progress, reduced]);

    // Reage na UI thread e só cruza para o JS quando o limiar vira — não a cada
    // frame. Um `useAnimatedReaction` por transição, não por quadro.
    useAnimatedReaction(
        () => progress.value > DASHBOARD_VISIBLE_AT,
        (visible, prev) => {
            if (visible !== prev) runOnJS(setDashboardReady)(visible);
        },
        [],
    );

    const storiesStyle = useAnimatedStyle(() => {
        const translateY = interpolate(progress.value, [0, 1], [0, -height * 0.06]);
        const scale = interpolate(progress.value, [0, 1], [1, 0.92]);
        const transform: ViewStyle['transform'] = [{ translateY }, { scale }];
        return {
            opacity: interpolate(progress.value, [0, 0.7], [1, 0], 'clamp'),
            transform,
        };
    });

    const dashboardStyle = useAnimatedStyle(() => {
        const translateY = interpolate(progress.value, [0, 1], [height, 0]);
        const scale = interpolate(progress.value, [0, 1], [0.94, 1]);
        const transform: ViewStyle['transform'] = [{ translateY }, { scale }];
        return {
            opacity: interpolate(progress.value, [0.15, 0.6], [0, 1], 'clamp'),
            transform,
        };
    });

    return { progress, storiesStyle, dashboardStyle, open, close, dashboardReady };
}
