import React, { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { borderRadius, elevation, fonts, spacing, typography, type ThemeColors, useThemedStyles } from '../../theme';
import type { WorkoutScope } from '../../stores/workoutScopeStore';
import { AppIcon } from '../ui/AppIcon';
import { HeaderMenu, type HeaderMenuItem } from '../ui/HeaderMenu';
import { SegmentedTabs, type SegmentedTab } from '../ui/SegmentedTabs';

const STREAK_ANIMATION = require('../../assets/animate/streak.json');

/**
 * Onde o card do menu abre, medido do fim da safe area.
 *
 * O `topRow` tem `minHeight: 60` + `paddingTop: spacing.sm`; ancorar logo abaixo
 * dele faz o menu sair "de dentro" do botão em vez de flutuar solto.
 */
const MENU_TOP_OFFSET = 60;

interface CalendarFixedHeaderProps {
    tabs: SegmentedTab<WorkoutScope>[];
    activeScope: WorkoutScope;
    onScopeChange: (scope: WorkoutScope) => void;
    profilePic: string | null;
    userName: string;
    isTablet: boolean;
    onPressGoals: () => void;
    onPressProfile: () => void;
    /**
     * Troca de Dias (T.2). Ausente = a opção não entra no menu — é assim que a
     * entrada some para quem não tem plano ativo, sem a tela precisar saber
     * disso.
     */
    onPressDaySwap?: () => void;
    currentStreak: number;
}

function CalendarFixedHeaderInner({
    tabs,
    activeScope,
    onScopeChange,
    profilePic,
    userName,
    isTablet,
    onPressGoals,
    onPressProfile,
    onPressDaySwap,
    currentStreak,
}: CalendarFixedHeaderProps) {
    const insets = useSafeAreaInsets();
    const styles = useThemedStyles(createStyles);
    const reduceMotion = useReducedMotion();
    const [menuOpen, setMenuOpen] = useState(false);

    // As ações de PLANO, agrupadas atrás de um gesto só. Cada uma sozinha no
    // header disputaria espaço com o badge de streak (que vai até 60% da
    // largura) e começaria a truncá-lo em telas pequenas.
    const menuItems = useMemo<HeaderMenuItem[]>(() => {
        const items: HeaderMenuItem[] = [
            {
                key: 'goals',
                label: 'Metas',
                icon: 'flag',
                hint: 'Seu objetivo e o progresso do plano',
                onPress: onPressGoals,
            },
        ];
        if (onPressDaySwap) {
            items.push({
                key: 'day-swap',
                label: 'Trocar dias de treino',
                icon: 'swapDays',
                hint: 'Mudar em quais dias você treina',
                onPress: onPressDaySwap,
            });
        }
        return items;
    }, [onPressGoals, onPressDaySwap]);
    const streakValue = Math.max(0, currentStreak);
    const hasActiveStreak = streakValue > 0;
    const streakLabel = `${streakValue} dias de treino`;

    const initials = useMemo(() => {
        const parts = userName.trim().split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return parts[0]?.[0]?.toUpperCase() ?? '?';
    }, [userName]);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={[styles.inner, isTablet && styles.tabletInner]}>
                <View style={styles.topRow}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={onPressProfile}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Abrir perfil"
                    >
                        {profilePic ? (
                            <Image
                                source={{ uri: profilePic }}
                                style={styles.profileImage}
                                accessible={false}
                            />
                        ) : (
                            <View style={styles.profileInitials} accessible={false}>
                                <Text style={styles.profileInitialsText}>{initials}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    <View
                        style={[
                            styles.streakBadge,
                            hasActiveStreak ? styles.streakBadgeActive : styles.streakBadgeInactive,
                        ]}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={streakLabel}
                    >
                        {hasActiveStreak ? (
                            <LottieView
                                source={STREAK_ANIMATION}
                                autoPlay={!reduceMotion}
                                loop={!reduceMotion}
                                progress={reduceMotion ? 0.5 : undefined}
                                resizeMode="contain"
                                style={styles.streakAnimation}
                            />
                        ) : (
                            <AppIcon name="flame" size={20} tone="tertiary" variant="filled" />
                        )}
                        <Text
                            style={[
                                styles.streakText,
                                hasActiveStreak ? styles.streakTextActive : styles.streakTextInactive,
                            ]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.2}
                        >
                            {streakLabel}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => setMenuOpen(true)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Mais opções do plano"
                        accessibilityHint="Abre metas e troca de dias de treino"
                    >
                        <AppIcon name="more" size={24} tone="primary" />
                    </TouchableOpacity>
                </View>

                <SegmentedTabs
                    tabs={tabs}
                    activeKey={activeScope}
                    onChange={onScopeChange}
                    style={styles.scopeTabs}
                />
            </View>

            <HeaderMenu
                visible={menuOpen}
                onClose={() => setMenuOpen(false)}
                items={menuItems}
                topOffset={MENU_TOP_OFFSET}
            />
        </View>
    );
}

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        container: {
            width: '100%',
            backgroundColor: colors.surface1,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            ...elevation.md,
            zIndex: 10,
        },
        inner: {
            width: '100%',
            alignSelf: 'center',
        },
        tabletInner: {
            maxWidth: 1100,
        },
        topRow: {
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.base,
            paddingTop: spacing.sm,
        },
        actionButton: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        streakBadge: {
            maxWidth: '60%',
            minHeight: 36,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            borderWidth: 1,
            borderRadius: borderRadius.full,
        },
        streakBadgeInactive: {
            backgroundColor: colors.fillSubtle,
            borderColor: colors.borderSubtle,
        },
        streakBadgeActive: {
            backgroundColor: colors.accentSubtle,
            borderColor: colors.borderStrong,
        },
        streakAnimation: {
            width: 32,
            height: 32,
        },
        streakText: {
            flexShrink: 1,
            fontFamily: fonts.semibold,
            fontSize: typography.fontSizes.md,
            fontVariant: ['tabular-nums'],
        },
        streakTextInactive: {
            color: colors.textTertiary,
        },
        streakTextActive: {
            color: colors.textPrimary,
        },
        profileImage: {
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: colors.borderStrong,
        },
        profileInitials: {
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface3,
            alignItems: 'center',
            justifyContent: 'center',
        },
        profileInitialsText: {
            fontFamily: fonts.semibold,
            fontSize: typography.fontSizes.md,
            color: colors.textPrimary,
        },
        scopeTabs: {
            marginHorizontal: spacing.lg,
            marginTop: spacing.md,
        },
    });
}

export const CalendarFixedHeader = memo(CalendarFixedHeaderInner);
