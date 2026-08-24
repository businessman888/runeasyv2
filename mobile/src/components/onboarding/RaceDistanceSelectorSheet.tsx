import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

interface RaceDistanceSelectorSheetProps {
    visible: boolean;
    distances: number[];
    labels?: string[];
    onConfirm: (distance: number) => void;
    onClose: () => void;
}

export function RaceDistanceSelectorSheet({
    visible,
    distances,
    labels,
    onConfirm,
    onClose,
}: RaceDistanceSelectorSheetProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState<number | null>(null);

    useEffect(() => {
        if (visible) setSelected(null);
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                <View style={styles.handle} />
                <Text style={styles.title}>Qual distância você vai correr?</Text>

                <View style={styles.pills}>
                    {distances.map((d, i) => {
                        const isSel = selected === d;
                        return (
                            <TouchableOpacity
                                key={`${d}-${i}`}
                                style={[styles.pill, isSel && styles.pillSelected]}
                                onPress={() => setSelected(d)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSel }}
                            >
                                <Text style={[styles.pillText, isSel && styles.pillTextSelected]}>
                                    {labels?.[i] ?? `${d}km`}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity
                    style={[styles.cta, selected == null && styles.ctaDisabled]}
                    disabled={selected == null}
                    onPress={() => selected != null && onConfirm(selected)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Confirmar distância"
                >
                    <Text style={[styles.ctaText, selected == null && styles.ctaTextDisabled]}>
                        Confirmar
                    </Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

const styles = createThemeStyles(() => ({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: semanticColors.scrim },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: semanticColors.surface1,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: semanticColors.borderStrong,
        marginBottom: 20,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: semanticColors.textPrimary,
        marginBottom: 20,
    },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
    pill: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.surface2,
        borderWidth: 2,
        borderColor: semanticColors.transparent,
    },
    pillSelected: {
        borderColor: semanticColors.accent,
        backgroundColor: semanticColors.accentSubtle,
    },
    pillText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textSecondary,
    },
    pillTextSelected: { color: semanticColors.accent },
    cta: {
        height: 56,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaDisabled: { backgroundColor: semanticColors.surface3 },
    ctaText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xl,
        color: semanticColors.textOnAccent,
    },
    ctaTextDisabled: { color: semanticColors.textSecondary },
}));

export default RaceDistanceSelectorSheet;
