import React, { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { InsightCarousel } from './InsightCarousel';
import {
    useWeeklyInsightStore,
    selectUnseen,
} from '../../stores/weeklyInsightStore';
import {
    useMesoInsightStore,
    selectUnseenMeso,
} from '../../stores/mesoInsightStore';

/**
 * Orquestra a ENTRADA dos insights: busca os dados e decide se a folha aparece.
 * Montado uma vez, na home.
 *
 * ── POR QUE MORA NA HOME E NÃO NO NAVIGATOR ──────────────────────────────────
 *
 * A home é a primeira tela autenticada com onboarding completo — montá-lo aqui
 * garante que o usuário já passou pelos gates de auth/onboarding, sem precisar
 * replicar essas condições. E como o card persistente também vive na home, o
 * dado é buscado uma vez só para os dois.
 *
 * ── QUANDO A FOLHA APARECE ───────────────────────────────────────────────────
 *
 * Quando existe pelo menos um insight não visto E a folha não foi dispensada
 * nesta sessão. Duas travas em camadas diferentes de propósito: `seen_at` é
 * permanente e vale entre aparelhos; `modalDismissedThisSession` é local e
 * evita que a folha volte ao navegar de volta para a home no mesmo uso.
 *
 * Insight ANTIGO não visto não reabre a folha — ele é histórico. Só o mais
 * recente de cada tipo entra (ver `selectUnseen` / `selectUnseenMeso`).
 *
 * ── UMA TRAVA DE SESSÃO, DUAS FONTES ─────────────────────────────────────────
 *
 * `modalDismissedThisSession` continua morando no store do semanal e vale para
 * a folha inteira. É o comportamento certo: o usuário fechou UMA folha, não um
 * dos cards dela. Um segundo flag faria a folha reabrir com o outro card logo
 * depois de ser fechada.
 */

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

export function InsightEntry() {
    const navigation = useNavigation<Nav>();
    const {
        latest: weeklyLatest,
        modalDismissedThisSession,
        fetch: fetchWeekly,
        dismissModal,
    } = useWeeklyInsightStore();
    const { latest: mesoLatest, fetch: fetchMeso } = useMesoInsightStore();

    const unseenWeekly = selectUnseen(weeklyLatest);
    const unseenMeso = selectUnseenMeso(mesoLatest);

    /**
     * O conjunto de cards CONGELADO no momento em que a folha abre.
     *
     * Sem isto o carrossel se desmonta sozinho: carimbar um card zera o
     * `seen_at` local, `selectUnseen` deixa de casar, e a página some do array
     * NO MEIO DO GESTO — o usuário desliza para o segundo card e o primeiro
     * evapora sob o dedo. Congelar na abertura mantém a folha estável até ser
     * fechada; a próxima abertura recalcula do zero.
     */
    const [pinned, setPinned] = useState<{
        weekly: typeof unseenWeekly;
        meso: typeof unseenMeso;
    } | null>(null);

    /**
     * As DUAS buscas terminaram — só então dá para congelar.
     *
     * São requisições independentes, e sem esta trava o congelamento acontecia
     * na primeira que chegasse. O semanal responde antes, o par era fixado como
     * `{ weekly, meso: null }`, e quando o mesociclo chegava o `pinned` já
     * existia: o card do bloco era descartado em silêncio. Foi exatamente o que
     * apareceu na validação — a folha abriu com um card só.
     *
     * `fetch` das stores nunca rejeita (trata o erro internamente), então o
     * `Promise.all` sempre resolve — inclusive offline, onde o certo é abrir com
     * o que houver em vez de nunca abrir.
     */
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let alive = true;
        void Promise.all([fetchWeekly(), fetchMeso()]).finally(() => {
            if (alive) setReady(true);
        });
        return () => {
            alive = false;
        };
    }, [fetchWeekly, fetchMeso]);

    useEffect(() => {
        if (!ready || pinned || modalDismissedThisSession) return;
        if (!unseenWeekly && !unseenMeso) return;
        setPinned({ weekly: unseenWeekly, meso: unseenMeso });
    }, [ready, pinned, modalDismissedThisSession, unseenWeekly, unseenMeso]);

    const handleClose = useCallback(() => {
        dismissModal();
        setPinned(null);
    }, [dismissModal]);

    /**
     * Abrir é o que conta como visto — e quem carimba é a TELA de destino, não
     * este handler. Carimbar aqui duplicaria o write e, pior, faria o gesto de
     * "abrir" e o de "marcar como lido" divergirem se a navegação falhasse.
     * Aqui só dispensamos a folha, para ela não reaparecer no caminho de volta.
     */
    const handleOpenWeekly = useCallback(() => {
        if (!pinned?.weekly) return;
        handleClose();
        navigation.navigate('WeeklyInsight' as never);
    }, [pinned, handleClose, navigation]);

    const handleOpenMeso = useCallback(() => {
        if (!pinned?.meso) return;
        handleClose();
        navigation.navigate('MesoInsight' as never);
    }, [pinned, handleClose, navigation]);

    const visible = Boolean(pinned) && !modalDismissedThisSession;

    return (
        <InsightCarousel
            weekly={pinned?.weekly ?? null}
            meso={pinned?.meso ?? null}
            visible={visible}
            onClose={handleClose}
            onOpenWeekly={handleOpenWeekly}
            onOpenMeso={handleOpenMeso}
        />
    );
}
