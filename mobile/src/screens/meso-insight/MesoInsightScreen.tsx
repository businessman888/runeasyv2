import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fonts } from '../../theme';
import { useMesoInsightStore } from '../../stores/mesoInsightStore';
import { MesoStoryDeck } from './stories/MesoStoryDeck';
import { MesoDashboard } from './dashboard/MesoDashboard';
import { useMesoStory } from './hooks/useMesoStory';
import { useNextBlock } from './hooks/useNextBlock';
import { useDeckTransition } from './hooks/useDeckTransition';

/**
 * INSIGHT DE MESOCICLO — o capítulo de 4 semanas, em duas partes.
 *
 * ── POR QUE DUAS PARTES NA MESMA TELA ────────────────────────────────────────
 *
 * Os stories são o CAPÍTULO: cinco cards, um número cada, feitos para serem
 * lidos em segundos e compartilhados. O dashboard é o DETALHE: o mesmo bloco
 * com todos os números, no idioma da tela semanal.
 *
 * Não são duas rotas porque não é navegação — é a mesma coisa vista de outra
 * distância. Uma rota traria header do sistema, gesto de voltar e uma entrada
 * no histórico, e as três contradizem o gesto de "abrir o post".
 *
 * ── `seen_at` CARIMBA AQUI ───────────────────────────────────────────────────
 *
 * Ao ABRIR a tela, não ao ver o card no carrossel. É o padrão que a 2B usa, e a
 * correção de um defeito real: carimbar por foco no carrossel queimava o
 * insight de quem só abriu e fechou a folha, e ele não voltava mais.
 */

export function MesoInsightScreen() {
    const navigation = useNavigation();
    const { latest, loading, fetch, markSeen } = useMesoInsightStore();

    const model = useMesoStory(latest);
    const next = useNextBlock(latest?.block_index ?? 0);
    const { storiesStyle, dashboardStyle, open, close, dashboardReady } =
        useDeckTransition();

    // Entrada direta pelo push não passou pela home — a store pode estar vazia.
    useEffect(() => {
        void fetch();
    }, [fetch]);

    useEffect(() => {
        if (latest && latest.seen_at === null) void markSeen(latest.id);
    }, [latest, markSeen]);

    const goBack = useCallback(() => navigation.goBack(), [navigation]);

    if (loading && !latest) {
        return (
            <SafeAreaView style={styles.fallback}>
                <ActivityIndicator size="large" color={colors.primary} />
            </SafeAreaView>
        );
    }

    if (!latest || !model) {
        return (
            <SafeAreaView style={styles.fallback}>
                <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Nenhum bloco fechado ainda</Text>
                <Text style={styles.emptyBody}>
                    O resumo do bloco chega a cada quatro semanas do seu plano.
                </Text>
                <Pressable
                    onPress={goBack}
                    style={styles.emptyBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Text style={styles.emptyBtnText}>Voltar</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.root}>
            {/* Camada de trás: os stories. Recua e apaga quando o painel sobe. */}
            <Animated.View style={[StyleSheet.absoluteFill, storiesStyle]}>
                <MesoStoryDeck
                    model={model}
                    next={next}
                    onClose={goBack}
                    onOpenDetails={open}
                />
            </Animated.View>

            {/* Camada da frente: o painel. Fora da tela até `open()`.
                `pointerEvents` segue a visibilidade — senão ele interceptaria os
                toques dos stories mesmo invisível. */}
            <Animated.View
                style={[StyleSheet.absoluteFill, dashboardStyle]}
                pointerEvents={dashboardReady ? 'auto' : 'none'}
            >
                <MesoDashboard
                    insight={latest}
                    model={model}
                    next={next}
                    active={dashboardReady}
                    onBack={close}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },

    fallback: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
        textAlign: 'center',
    },
    emptyBody: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    emptyBtn: {
        marginTop: spacing.base,
        paddingHorizontal: spacing.xl,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyBtnText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.textLight,
    },
});
