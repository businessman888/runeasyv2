import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
    Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, spacing } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { AppIcon } from './ui/AppIcon';
import { AppPressable } from './ui/AppPressable';

interface HomeFabProps {
    onPressFreeRun: () => void;
    onPressManual: () => void;
}

const FAB_SIZE = 60;
const SUB_BTN_SIZE = 52;
const ROW_HEIGHT = 52;
const ROW_GAP = 9;
const PANEL_VPAD = 14;

// Right edge offset of the FAB from screen edge
const FAB_RIGHT_OFFSET = spacing.lg;

export function HomeFab({ onPressFreeRun, onPressManual }: HomeFabProps) {
    const insets = useSafeAreaInsets();
    const [open, setOpen] = useState(false);
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: open ? 1 : 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [open, anim]);

    const rotate = anim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '45deg'],
    });

    const panelHeight = ROW_HEIGHT * 2 + ROW_GAP + PANEL_VPAD * 2;
    const panelTranslateY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [20, 0],
    });

    const handleOption = (cb: () => void) => () => {
        setOpen(false);
        // pequeno delay pra animação de fechamento começar antes da navegação
        setTimeout(cb, 80);
    };

    // Bottom = tab bar height (~74) + insets.bottom + folga
    const tabBarBottom = Math.max(insets.bottom + 10, 25);
    const fabBottom = tabBarBottom + 74 + 12;
    const panelBottom = fabBottom + FAB_SIZE + 8;

    return (
        <>
            {open && (
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            styles.backdrop,
                            { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) },
                        ]}
                    />
                </Pressable>
            )}

            {/* Painel das opções (acima do FAB) */}
            <Animated.View
                pointerEvents={open ? 'auto' : 'none'}
                style={[
                    styles.panel,
                    {
                        bottom: panelBottom,
                        right: FAB_RIGHT_OFFSET,
                        height: panelHeight,
                        opacity: anim,
                        transform: [{ translateY: panelTranslateY }],
                    },
                ]}
            >
                <FabOption
                    label="Treino Livre"
                    onPress={handleOption(onPressFreeRun)}
                    icon={<AppIcon name="running" size={28} tone="primary" variant="outline" />}
                />
                <FabOption
                    label="Treino manual"
                    onPress={handleOption(onPressManual)}
                    icon={<AppIcon name="edit" size={24} tone="primary" variant="outline" />}
                />
            </Animated.View>

            {/* Botão FAB principal */}
            <View
                style={[styles.fabContainer, { bottom: fabBottom, right: FAB_RIGHT_OFFSET }]}
                pointerEvents="box-none"
            >
                <AppPressable
                    style={styles.fab}
                    interactionScale="icon"
                    onPress={() => setOpen((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={open ? 'Fechar opções de treino' : 'Abrir opções de treino'}
                    accessibilityState={{ expanded: open }}
                >
                    <Animated.View style={{ transform: [{ rotate }] }}>
                        <AppIcon name="add" size={32} tone="onAccent" variant="outline" />
                    </Animated.View>
                </AppPressable>
            </View>
        </>
    );
}

interface FabOptionProps {
    label: string;
    onPress: () => void;
    icon: React.ReactNode;
}

function FabOption({ label, onPress, icon }: FabOptionProps) {
    return (
        <View style={styles.row}>
            <View style={styles.labelCard}>
                <Text style={styles.labelText} numberOfLines={1}>
                    {label}
                </Text>
            </View>
            <AppPressable
                style={styles.subButton}
                interactionScale="icon"
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                {icon}
            </AppPressable>
        </View>
    );
}

const PANEL_BG = semanticColors.surface2;
const SUB_BTN_BG = semanticColors.surface3;

const styles = StyleSheet.create({
    backdrop: {
        backgroundColor: semanticColors.canvas,
    },
    panel: {
        position: 'absolute',
        width: 137,
        backgroundColor: PANEL_BG,
        borderRadius: 24,
        paddingVertical: PANEL_VPAD,
        paddingHorizontal: 3,
        gap: ROW_GAP,
        alignItems: 'stretch',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    row: {
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 3,
    },
    labelCard: {
        height: 27,
        paddingHorizontal: 8,
        backgroundColor: SUB_BTN_BG,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    labelText: {
        fontFamily: fonts.medium,
        fontSize: 9,
        fontWeight: '500',
        color: semanticColors.textPrimary,
    },
    subButton: {
        width: SUB_BTN_SIZE,
        height: SUB_BTN_SIZE,
        borderRadius: SUB_BTN_SIZE / 2,
        backgroundColor: SUB_BTN_BG,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    fabContainer: {
        position: 'absolute',
        alignItems: 'flex-end',
    },
    fab: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        backgroundColor: semanticColors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
});
