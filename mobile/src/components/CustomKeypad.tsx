import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Design System Colors matching Figma
const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    card: '#1C1C2E',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
    cyan: '#00D4FF',
};

interface CustomKeypadProps {
    onPress: (key: string) => void;
    onDelete: () => void;
    disabled?: boolean;
}

export function CustomKeypad({ onPress, onDelete, disabled }: CustomKeypadProps) {
    const keys = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
    ];

    return (
        <View style={styles.container}>
            {keys.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                    {row.map((key) => (
                        <TouchableOpacity
                            key={key}
                            style={[styles.button, disabled && styles.disabledButton]}
                            onPress={() => onPress(key)}
                            disabled={disabled}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.keyText, disabled && styles.disabledText]}>
                                {key}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ))}

            {/* Bottom Row: Empty, 0, Backspace */}
            <View style={styles.row}>
                <View style={styles.buttonPlaceholder} />

                <TouchableOpacity
                    style={[styles.button, disabled && styles.disabledButton]}
                    onPress={() => onPress('0')}
                    disabled={disabled}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.keyText, disabled && styles.disabledText]}>0</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, disabled && styles.disabledButton]}
                    onPress={onDelete}
                    disabled={disabled}
                    activeOpacity={0.7}
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
    button: {
        width: '30%',
        height: 60, // Taller touch targets
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        // Optional: Add subtle background if desired, or keep transparent as per user image
        // backgroundColor: 'rgba(255,255,255,0.03)', 
    },
    buttonPlaceholder: {
        width: '30%',
        height: 60,
    },
    disabledButton: {
        opacity: 0.5,
    },
    keyText: {
        fontSize: 28,
        fontWeight: '600',
        color: DS.text,
        fontFamily: 'Inter-Bold', // Ensure font consistency
    },
    disabledText: {
        color: DS.textSecondary,
    },
});
