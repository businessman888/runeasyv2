import React, { memo, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import {
    borderRadius,
    fonts,
    spacing,
    typography,
    useThemedStyles,
    type ThemeColors,
} from '../../theme';
import { motionSpring } from '../../theme/motion';
import { AppIcon } from './AppIcon';
import { GlassSurface } from './GlassSurface';
import type { iconography } from '../../theme/iconography';

/**
 * Menu suspenso ancorado no canto superior direito — o "três pontos".
 *
 * ── POR QUE ELE EXISTE ───────────────────────────────────────────────────────
 *
 * O header do calendário tinha três elementos e um badge de streak que ocupa até
 * 60% da largura. Cada ação nova de plano disputaria esse espaço, e num iPhone
 * pequeno o streak começaria a truncar. Agrupar as ações de plano atrás de um
 * único gesto resolve o espaço E junta o que é da mesma família: editar o plano.
 *
 * ── DISPENSA POR FORA, SEMPRE ────────────────────────────────────────────────
 *
 * O `Pressable` de tela cheia atrás do card é o que faz o menu se comportar como
 * menu: toque em qualquer lugar fora fecha. Sem ele o corredor fica preso
 * procurando um "X" que não existe.
 *
 * ── ACESSIBILIDADE ───────────────────────────────────────────────────────────
 *
 * `accessibilityViewIsModal` no container impede o leitor de tela de vazar para
 * o conteúdo atrás — sem isso o VoiceOver continua navegando o calendário com o
 * menu aberto. Cada item tem alvo de 44pt e `accessibilityRole="menuitem"`.
 */

export interface HeaderMenuItem {
    key: string;
    label: string;
    icon: keyof typeof iconography;
    onPress: () => void;
    /** Explica a ação em uma linha. Opcional — só onde o rótulo não basta. */
    hint?: string;
    /** Separador ANTES deste item, para agrupar famílias de ação. */
    separatorBefore?: boolean;
}

interface HeaderMenuProps {
    visible: boolean;
    onClose: () => void;
    items: HeaderMenuItem[];
    /** Distância do topo, já somada à safe area pelo chamador do header. */
    topOffset?: number;
}

function HeaderMenuInner({
    visible,
    onClose,
    items,
    topOffset = 0,
}: HeaderMenuProps) {
    const styles = useThemedStyles(createStyles);
    const insets = useSafeAreaInsets();

    // Fecha ANTES de navegar: se a tela nova monta com o modal ainda aberto, o
    // menu reaparece por cima dela na volta.
    const handlePress = useCallback(
        (item: HeaderMenuItem) => {
            onClose();
            item.onPress();
        },
        [onClose],
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Animated.View
                entering={FadeIn.duration(120)}
                exiting={FadeOut.duration(120)}
                style={StyleSheet.absoluteFill}
                accessibilityViewIsModal
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar menu"
                />

                <Animated.View
                    entering={ZoomIn.springify()
                        .damping(motionSpring.layout.damping)
                        .stiffness(motionSpring.layout.stiffness)}
                    style={[
                        styles.anchor,
                        { top: insets.top + topOffset },
                    ]}
                    pointerEvents="box-none"
                >
                    <GlassSurface radius={borderRadius.lg} intensity={40}>
                        <View style={styles.card} accessibilityRole="menu">
                            {items.map((item) => (
                                <React.Fragment key={item.key}>
                                    {item.separatorBefore && (
                                        <View style={styles.separator} />
                                    )}
                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.item,
                                            pressed && styles.itemPressed,
                                        ]}
                                        onPress={() => handlePress(item)}
                                        accessibilityRole="menuitem"
                                        accessibilityLabel={item.label}
                                        accessibilityHint={item.hint}
                                    >
                                        <AppIcon
                                            name={item.icon}
                                            size={20}
                                            tone="primary"
                                        />
                                        <View style={styles.itemText}>
                                            <Text
                                                style={styles.itemLabel}
                                                numberOfLines={1}
                                                maxFontSizeMultiplier={1.3}
                                            >
                                                {item.label}
                                            </Text>
                                            {!!item.hint && (
                                                <Text
                                                    style={styles.itemHint}
                                                    numberOfLines={1}
                                                    maxFontSizeMultiplier={1.2}
                                                >
                                                    {item.hint}
                                                </Text>
                                            )}
                                        </View>
                                    </Pressable>
                                </React.Fragment>
                            ))}
                        </View>
                    </GlassSurface>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

export const HeaderMenu = memo(HeaderMenuInner);

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        anchor: {
            position: 'absolute',
            right: spacing.base,
            minWidth: 232,
            maxWidth: 300,
            // Acima do scrim, para o card não receber o toque de dispensa.
            zIndex: 20,
        },
        card: {
            paddingVertical: spacing.xs,
        },
        item: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.sm,
        },
        itemPressed: {
            backgroundColor: colors.fillSubtle,
        },
        itemText: {
            flex: 1,
        },
        itemLabel: {
            fontSize: typography.fontSizes.base,
            fontFamily: fonts.medium,
            color: colors.textPrimary,
        },
        itemHint: {
            marginTop: 2,
            fontSize: typography.fontSizes.xs,
            fontFamily: fonts.regular,
            color: colors.textSecondary,
        },
        separator: {
            height: StyleSheet.hairlineWidth,
            marginVertical: spacing.xs,
            marginHorizontal: spacing.base,
            backgroundColor: colors.borderSubtle,
        },
    });
}

export default HeaderMenu;
