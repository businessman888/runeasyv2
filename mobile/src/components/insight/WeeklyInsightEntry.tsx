import React, { useCallback, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WeeklyInsightSheet } from './WeeklyInsightSheet';
import {
    useWeeklyInsightStore,
    selectUnseen,
} from '../../stores/weeklyInsightStore';

/**
 * Orquestra a ENTRADA do insight semanal: busca o dado e decide se o modal
 * aparece. Montado uma vez, na home.
 *
 * ── POR QUE MORA NA HOME E NÃO NO NAVIGATOR ──────────────────────────────────
 *
 * A home é a primeira tela autenticada com onboarding completo — montá-lo aqui
 * garante que o usuário já passou pelos gates de auth/onboarding, sem precisar
 * replicar essas condições. E como o card persistente também vive na home, o
 * dado é buscado uma vez só para os dois.
 *
 * ── QUANDO O MODAL APARECE ───────────────────────────────────────────────────
 *
 * Só quando a semana fechada MAIS RECENTE ainda não foi vista E o modal não foi
 * dispensado nesta sessão. Duas travas em camadas diferentes de propósito:
 * `seen_at` é permanente e vale entre aparelhos; `modalDismissedThisSession` é
 * local e evita que o modal volte ao navegar de volta para a home no mesmo uso.
 *
 * Semana ANTIGA não vista não reabre o modal — ela é histórico. Antes disso, o
 * app buscava "o mais recente entre os não vistos" e, com a semana 2 já lida,
 * voltava para a semana 1 zerada mostrando 0 km como novidade.
 */

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

export function WeeklyInsightEntry() {
    const navigation = useNavigation<Nav>();
    const { latest, modalDismissedThisSession, fetch, dismissModal, markSeen } =
        useWeeklyInsightStore();

    const unseen = selectUnseen(latest);

    useEffect(() => {
        void fetch();
    }, [fetch]);

    const handleOpen = useCallback(() => {
        if (!unseen) return;
        // Abrir É ter visto — a própria tela também carimba, mas fazer aqui
        // evita o modal reaparecer no caminho de volta.
        void markSeen(unseen.id);
        navigation.navigate('WeeklyInsight' as never);
    }, [unseen, markSeen, navigation]);

    const visible = Boolean(unseen) && !modalDismissedThisSession;

    return (
        <WeeklyInsightSheet
            insight={unseen}
            visible={visible}
            onClose={dismissModal}
            onOpen={handleOpen}
        />
    );
}
