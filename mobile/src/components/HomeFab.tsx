import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
    Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows, typography } from '../theme';

interface HomeFabProps {
    onPressFreeRun: () => void;
    onPressManual: () => void;
}

const FAB_SIZE = 60;
const SUB_SIZE = 52;

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

    const freeTranslateY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -(SUB_SIZE + spacing.md)],
    });
    const manualTranslateY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -((SUB_SIZE + spacing.md) * 2)],
    });

    const handleOption = (cb: () => void) => () => {
        setOpen(false);
        // Pequeno delay pra animação de fechamento começar antes da navegação
        setTimeout(cb, 80);
    };

    // Bottom = tab bar height (~74) + insets.bottom + folga
    const tabBarBottom = Math.max(insets.bottom + 10, 25);
    const fabBottom = tabBarBottom + 74 + 12;

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

            <View style={[styles.container, { bottom: fabBottom }]} pointerEvents="box-none">
                <Animated.View
                    style={[
                        styles.subOption,
                        { transform: [{ translateY: manualTranslateY }], opacity: anim },
                    ]}
                    pointerEvents={open ? 'auto' : 'none'}
                >
                    <Text style={styles.subLabel}>Treino Manual</Text>
                    <TouchableOpacity
                        style={[styles.subButton, styles.subManual]}
                        activeOpacity={0.85}
                        onPress={handleOption(onPressManual)}
                    >
                        <Ionicons name="create-outline" size={26} color={colors.background} />
                    </TouchableOpacity>
                </Animated.View>

                <Animated.View
                    style={[
                        styles.subOption,
                        { transform: [{ translateY: freeTranslateY }], opacity: anim },
                    ]}
                    pointerEvents={open ? 'auto' : 'none'}
                >
                    <Text style={styles.subLabel}>Treino Livre</Text>
                    <TouchableOpacity
                        style={[styles.subButton, styles.subFree]}
                        activeOpacity={0.85}
                        onPress={handleOption(onPressFreeRun)}
                    >
                        <MaterialCommunityIcons name="run-fast" size={28} color={colors.background} />
                    </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                    style={styles.fab}
                    activeOpacity={0.85}
                    onPress={() => setOpen((v) => !v)}
                >
                    <Animated.View style={{ transform: [{ rotate }] }}>
                        <Ionicons name="add" size={32} color={colors.background} />
                    </Animated.View>
                </TouchableOpacity>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        right: spacing.lg,
        alignItems: 'flex-end',
    },
    backdrop: {
        backgroundColor: '#000',
    },
    fab: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.neonStrong,
    },
    subOption: {
        position: 'absolute',
        right: 0,
        bottom: (FAB_SIZE - SUB_SIZE) / 2,
        flexDirection: 'row',
        alignItems: 'center',
    },
    subButton: {
        width: SUB_SIZE,
        height: SUB_SIZE,
        borderRadius: SUB_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.lg,
    },
    subFree: {
        backgroundColor: colors.primary,
    },
    subManual: {
        backgroundColor: '#A78BFA',
    },
    subLabel: {
        marginRight: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.card,
        color: colors.text,
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
});
