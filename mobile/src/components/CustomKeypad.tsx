import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fonts } from '../theme';
import { semanticColors } from '../theme/semanticColors';

// Design System Colors matching Figma
const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    card: semanticColors.surface2,
    glassBorder: semanticColors.borderSubtle,
    cyan: semanticColors.accent,
};

interface CustomKeypadProps {
    onPress: (key: string) => void;
    onDelete: () => void;
    disabled?: boolean;
    compact?: boolean;
}

export function CustomKeypad({ onPress, onDelete, disabled, compact = false }: CustomKeypadProps) {
    const keys = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
    ];

    return (
        <View style={styles.container}>
            {keys.map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.row, compact && styles.rowCompact]}>
                    {row.map((key) => (
                        <TouchableOpacity
                            key={key}
                            style={[styles.button, compact && styles.buttonCompact, disabled && styles.disabledButton]}
                            onPress={() => onPress(key)}
                            disabled={disabled}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Número ${key}`}
                            accessibilityState={{ disabled: Boolean(disabled) }}
                        >
                            <Text style={[styles.keyText, disabled && styles.disabledText]}>{key}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ))}

            {/* Bottom Row: Empty, 0, Backspace */}
            <View style={[styles.row, compact && styles.rowCompact]}>
                <View style={[styles.buttonPlaceholder, compact && styles.buttonCompact]} />

                <TouchableOpacity
                    style={[styles.button, compact && styles.buttonCompact, disabled && styles.disabledButton]}
                    onPress={() => onPress('0')}
                    disabled={disabled}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Número zero"
                    accessibilityState={{ disabled: Boolean(disabled) }}
                >
                    <Text style={[styles.keyText, disabled && styles.disabledText]}>0</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, compact && styles.buttonCompact, disabled && styles.disabledButton]}
                    onPress={onDelete}
                    disabled={disabled}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Apagar último dígito"
                    accessibilityState={{ disabled: Boolean(disabled) }}
                >
                    <MaterialCommunityIcons
                        name="backspace-outline"
                        size={24}
                        color={disabled ? DS.textSecondary : DS.text}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    rowCompact: {
        marginBottom: 6,
    },
    button: {
        width: '30%',
        height: 60, // Taller touch targets
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    buttonPlaceholder: {
        width: '30%',
        height: 60,
    },
    buttonCompact: {
        height: 48,
    },
    disabledButton: {
        opacity: 0.5,
    },
    keyText: {
        fontFamily: fonts.semibold,
        fontSize: 28,
        color: semanticColors.textPrimary,
    },
    disabledText: {
        color: semanticColors.textSecondary,
    },
});
