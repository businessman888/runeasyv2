/**
 * Premium bottom-sheet for exact numeric entry (weight / height) in onboarding.
 *
 * Replaces the inline TextInput that pushed the screen layout. Follows the
 * existing sheet pattern from WearableSelectionModal (transparent Modal +
 * Pressable overlay + handle bar + safe-area padding) for visual consistency.
 */
import React, { useEffect, useState } from 'react';
import {
    Modal,
    Pressable,
    View,
    Text,
    TextInput,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QUIZ } from '../../screens/quiz/_tokens';

interface ValueInputSheetProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (value: number) => void;
    title: string;
    suffix: string;
    min: number;
    max: number;
    initialValue?: number | null;
    placeholder?: string;
}

export function ValueInputSheet({
    visible,
    onClose,
    onConfirm,
    title,
    suffix,
    min,
    max,
    initialValue,
    placeholder,
}: ValueInputSheetProps) {
    const insets = useSafeAreaInsets();
    const [text, setText] = useState(initialValue ? String(initialValue) : '');

    // Reset the field to the current value each time the sheet opens.
    useEffect(() => {
        if (visible) {
            setText(initialValue ? String(initialValue) : '');
        }
    }, [visible, initialValue]);

    const parsed = parseInt(text, 10);
    const isValid = !isNaN(parsed) && parsed >= min && parsed <= max;

    const handleChange = (value: string) => {
        setText(value.replace(/[^0-9]/g, ''));
    };

    const handleConfirm = () => {
        if (isValid) {
            onConfirm(parsed);
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable style={styles.overlay} onPress={onClose}>
                    <Pressable
                        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}
                        onPress={() => {}}
                    >
                        <View style={styles.handleBar} />

                        <Text style={styles.title}>{title}</Text>

                        <View style={[styles.inputRow, !isValid && text.length > 0 && styles.inputRowError]}>
                            <TextInput
                                style={styles.input}
                                value={text}
                                onChangeText={handleChange}
                                keyboardType="number-pad"
                                placeholder={placeholder}
                                placeholderTextColor={QUIZ.color.textDim}
                                maxLength={3}
                                autoFocus
                                onSubmitEditing={handleConfirm}
                                returnKeyType="done"
                            />
                            <Text style={styles.suffix}>{suffix}</Text>
                        </View>

                        <Text style={styles.hint}>
                            {text.length > 0 && !isValid
                                ? `Informe um valor entre ${min} e ${max} ${suffix}.`
                                : `Entre ${min} e ${max} ${suffix}.`}
                        </Text>

                        <Pressable
                            style={[styles.confirmButton, !isValid && styles.confirmButtonDisabled]}
                            onPress={handleConfirm}
                            disabled={!isValid}
                            accessibilityRole="button"
                            accessibilityLabel="Confirmar"
                            accessibilityState={{ disabled: !isValid }}
                        >
                            <Text style={styles.confirmText}>Confirmar</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    overlay: {
        flex: 1,
        backgroundColor: QUIZ.color.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: QUIZ.color.surface1,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: QUIZ.color.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontFamily: QUIZ.title.fontFamily,
        fontSize: 20,
        color: QUIZ.color.text,
        marginBottom: 16,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: QUIZ.color.card,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: QUIZ.color.cyan,
        paddingHorizontal: 20,
    },
    inputRowError: {
        borderColor: QUIZ.color.danger,
    },
    input: {
        flex: 1,
        fontFamily: QUIZ.title.fontFamily,
        fontSize: 28,
        color: QUIZ.color.text,
        paddingVertical: 16,
    },
    suffix: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 18,
        color: QUIZ.color.textDim,
    },
    hint: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 13,
        color: QUIZ.color.textDim,
        marginTop: 10,
    },
    confirmButton: {
        backgroundColor: QUIZ.color.cyan,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    confirmButtonDisabled: {
        opacity: 0.4,
    },
    confirmText: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        fontSize: 16,
        color: QUIZ.color.textOnAccent,
    },
});

export default ValueInputSheet;
