import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface LimitationsScreenProps {
    value?: string;
    onChange?: (value: string) => void;
}

export function LimitationsScreen({ value, onChange }: LimitationsScreenProps) {
    const [limitations, setLimitations] = useState(value || '');

    useEffect(() => {
        setLimitations(value || '');
    }, [value]);

    const handleChange = (text: string) => {
        setLimitations(text);
        if (onChange) {
            onChange(text || '');
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Alguma limitação física?
                </Text>
                <Text style={styles.subtitle}>
                    Lesões anteriores, problemas de saúde, etc. (opcional)
                </Text>
            </View>

            {/* Input Section */}
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.textInput}
                    placeholder="Ex: dor no joelho direito, tendinite no tornozelo..."
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    value={limitations}
                    onChangeText={handleChange}
                    multiline
                    numberOfLines={4}
                />
                <Text style={styles.helperText}>
                    💡 Esta informação ajuda a IA a criar um plano mais seguro para você
                </Text>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.white,
        marginBottom: 12,
        lineHeight: 34,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 22,
    },
    inputContainer: {
        marginTop: 20,
    },
    textInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        padding: spacing.md,
        fontSize: 16,
        color: colors.white,
        minHeight: 120,
        textAlignVertical: 'top',
    },
    helperText: {
        fontSize: 13,
        color: 'rgba(235, 235, 245, 0.6)',
        marginTop: spacing.sm,
        lineHeight: 18,
    },
});

export default LimitationsScreen;
