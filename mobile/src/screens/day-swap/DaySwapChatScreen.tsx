import React, { useCallback, useRef } from 'react';
import {
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { ScreenContainer } from '../../components/ScreenContainer';
import { AppIcon } from '../../components/ui/AppIcon';
import {
    fonts,
    spacing,
    typography,
    useThemedStyles,
    type ThemeColors,
} from '../../theme';
import { useDaySwapChat } from '../../hooks/useDaySwapChat';
import { useMotionPreferences } from '../../hooks/useMotionPreferences';
import { ChatBubble } from './ChatBubble';
import {
    ConfirmButtons,
    DatePicker,
    DayPicker,
    ModeButtons,
    RestartButton,
    SwapSummary,
    WorkoutPicker,
} from './DaySwapWidgets';

/**
 * TROCAR DIAS DE TREINO — a conversa (Fase T.2).
 *
 * ── UMA CONVERSA, NÃO UM FORMULÁRIO ──────────────────────────────────────────
 *
 * A mesma feature caberia num formulário com dois selects e um botão. A conversa
 * existe porque trocar os dias tem CONSEQUÊNCIA — mexe em semanas de treino — e
 * um formulário não tem onde explicar isso sem virar um muro de texto de ajuda.
 * No chat, cada explicação chega no momento em que importa: o aviso de "vale da
 * próxima semana" aparece quando o corredor escolhe o modo, não antes.
 *
 * ── O BOT É UMA MÁQUINA DE ESTADOS ───────────────────────────────────────────
 *
 * Nenhuma IA envolvida. As falas são fixas e vivem em `useDaySwapChat`; esta
 * tela só renderiza mensagens e dispara ações. O indicador de resposta é uma
 * microinteração visual; o texto sempre chega completo e previsível.
 */

export function DaySwapChatScreen() {
    const navigation = useNavigation();
    const styles = useThemedStyles(createStyles);
    const scrollRef = useRef<ScrollView>(null);
    const nearBottomRef = useRef(true);
    const { reduceMotion } = useMotionPreferences();

    const { state, messages, context, preview, error, actions } = useDaySwapChat();

    const handleScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
            const distanceFromBottom =
                contentSize.height -
                (contentOffset.y + layoutMeasurement.height);
            nearBottomRef.current = distanceFromBottom < 96;
        },
        [],
    );

    // O painel de ações só monta depois do fade da fala. Rolamos após o layout
    // final, mas nunca arrancamos o usuário de um trecho antigo que ele relê.
    const handleContentSizeChange = useCallback(() => {
        if (!nearBottomRef.current) return;
        requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: !reduceMotion });
        });
    }, [reduceMotion]);

    const handleClose = useCallback(() => navigation.goBack(), [navigation]);

    const busy = state === 'applying';
    const restartDisabled =
        state === 'loading' || state === 'previewing' || state === 'applying';
    const pendingLabel =
        state === 'applying'
            ? 'Atualizando sua agenda'
            : state === 'previewing'
              ? 'Conferindo sua agenda'
              : 'Carregando seus dias de treino';
    const showPending =
        (state === 'loading' && messages.length === 0) ||
        state === 'previewing' ||
        state === 'applying';

    return (
        <ScreenContainer style={styles.screen}>
            <View style={styles.header}>
                <Pressable
                    onPress={handleClose}
                    style={styles.headerButton}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar"
                >
                    <AppIcon name="close" size={24} tone="primary" />
                </Pressable>

                <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>
                    Trocar dias de treino
                </Text>

                <Pressable
                    onPress={() => void actions.start()}
                    disabled={restartDisabled}
                    style={[
                        styles.headerButton,
                        restartDisabled && styles.headerButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Recomeçar a conversa"
                    accessibilityState={{ disabled: restartDisabled }}
                >
                    <AppIcon name="refresh" size={20} tone="secondary" />
                </Pressable>
            </View>

            <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                onContentSizeChange={handleContentSizeChange}
                scrollEventThrottle={16}
            >
                {messages.map((m) => (
                    <ChatBubble
                        key={m.id}
                        from={m.from}
                        text={m.text}
                        animate={m.from === 'bot'}
                        presentationOrder={m.presentationOrder}
                        // O resumo é o que o bot está DIZENDO — vai dentro da
                        // bolha. Os painéis de escolha continuam fora.
                        inside={m.widget === 'summary'}
                    >
                        {m.widget ? renderWidget(m.widget) : null}
                    </ChatBubble>
                ))}

                {showPending && (
                    <ChatBubble
                        key={`pending-${state}`}
                        from="bot"
                        text={pendingLabel}
                        pending
                    />
                )}

                {!!error && (
                    <Text
                        style={styles.error}
                        accessibilityRole="alert"
                        maxFontSizeMultiplier={1.3}
                    >
                        {error}
                    </Text>
                )}
            </ScrollView>
        </ScreenContainer>
    );

    function renderWidget(widget: string) {
        switch (widget) {
            case 'modeButtons': {
                // O motivo vem do CONTEXTO, não de uma tentativa frustrada: o
                // corredor vê por que um modo não serve antes de tocar nele.
                const semana = context?.currentWeek;
                return (
                    <ModeButtons
                        onChoose={actions.chooseMode}
                        structuralBlockedReason={
                            context?.nextWeek
                                ? undefined
                                : 'Seu plano não tem uma próxima semana'
                        }
                        singleBlockedReason={
                            !semana?.workouts?.length
                                ? 'Não há mais treinos nesta semana'
                                : !semana.freeDates?.length
                                  ? 'Não sobrou dia livre nesta semana'
                                  : undefined
                        }
                    />
                );
            }

            case 'dayPicker':
                if (!context?.currentDays || !context.dayCount) return null;
                return (
                    <DayPicker
                        currentDays={context.currentDays}
                        dayCount={context.dayCount}
                        onConfirm={actions.chooseDays}
                    />
                );

            case 'workoutPicker':
                if (!context?.currentWeek?.workouts?.length) return null;
                return (
                    <WorkoutPicker
                        workouts={context.currentWeek.workouts}
                        onChoose={actions.chooseWorkout}
                    />
                );

            case 'datePicker':
                if (!context?.currentWeek?.freeDates?.length) return null;
                return (
                    <DatePicker
                        dates={context.currentWeek.freeDates}
                        onChoose={actions.chooseDate}
                    />
                );

            case 'summary':
                if (!preview?.available) return null;
                return <SwapSummary preview={preview} />;

            case 'confirmButtons':
                return (
                    <ConfirmButtons
                        onConfirm={() => void actions.confirm()}
                        onCancel={actions.cancel}
                        busy={busy}
                    />
                );

            case 'restart':
                // Depois do sucesso o caminho natural é sair e ver a agenda; nos
                // outros fins terminais, recomeçar é o que faz sentido.
                return state === 'success' ? (
                    <RestartButton onPress={handleClose} label="Ver minha agenda" />
                ) : (
                    <RestartButton onPress={() => void actions.start()} />
                );

            default:
                return null;
        }
    }
}

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        screen: {
            backgroundColor: colors.canvas,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.sm,
            paddingBottom: spacing.sm,
        },
        headerButton: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        headerButtonDisabled: {
            opacity: 0.45,
        },
        headerTitle: {
            flex: 1,
            textAlign: 'center',
            fontSize: typography.fontSizes.base,
            fontFamily: fonts.semibold,
            color: colors.textPrimary,
        },
        scroll: {
            flex: 1,
        },
        scrollContent: {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.sm,
            paddingBottom: spacing['3xl'],
        },
        error: {
            marginTop: spacing.sm,
            fontSize: typography.fontSizes.sm,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
        },
    });
}

export default DaySwapChatScreen;
