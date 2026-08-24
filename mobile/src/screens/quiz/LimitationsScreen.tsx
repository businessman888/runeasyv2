import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Animated,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { createThemeStyles, useThemeSubscription } from '../../theme';

interface LimitationsScreenProps {
    value?: { hasLimitation: boolean; details: string } | null;
    onChange?: (value: { hasLimitation: boolean; details: string }) => void;
}

export function LimitationsScreen({ value, onChange }: LimitationsScreenProps) {
    useThemeSubscription();
    // Initialize state from props ONCE — no useEffect syncing to avoid infinite loops
    const [hasLimitation, setHasLimitation] = useState<boolean | null>(
        value && typeof value.hasLimitation === 'boolean' ? value.hasLimitation : null
    );
    const [details, setDetails] = useState(value?.details || '');

    const fadeAnim = useRef(new Animated.Value(value?.hasLimitation === true ? 1 : 0)).current;

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const handleOptionSelect = useCallback((option: boolean) => {
        setHasLimitation(option);

        Animated.timing(fadeAnim, {
            toValue: option ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();

        const newDetails = option ? details : '';
        if (!option) setDetails('');

        onChangeRef.current?.({ hasLimitation: option, details: newDetails });
    }, [details, fadeAnim]);

    const handleDetailsChange = useCallback((text: string) => {
        setDetails(text);
        if (hasLimitation !== null) {
            onChangeRef.current?.({ hasLimitation: hasLimitation!, details: text });
        }
    }, [hasLimitation]);

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                <QuizHeader
                    title={<>Você possui alguma <Hl>lesão ou limitação</Hl>?</>}
                    subtitle="Lesões anteriores, problemas de saúde ou restrições físicas."
                />

                <View style={styles.options}>
                    <SelectableOption
                        title="Não"
                        subtitle="Não possuo limitações físicas"
                        selected={hasLimitation === false}
                        onPress={() => handleOptionSelect(false)}
                    />
                    <SelectableOption
                        title="Sim"
                        subtitle="Tenho uma lesão ou limitação física"
                        selected={hasLimitation === true}
                        onPress={() => handleOptionSelect(true)}
                    />
                </View>

                {hasLimitation === true && (
                    <Animated.View style={[styles.detailsContainer, { opacity: fadeAnim }]}>
                        <Text style={styles.detailsLabel}>Descreva sua limitação:</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Ex: dor no joelho direito, tendinite no tornozelo..."
                            placeholderTextColor={QUIZ.color.textDim}
                            value={details}
                            onChangeText={handleDetailsChange}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                        <Text style={styles.helperText}>
                            💡 Esta informação ajuda a IA a criar um plano mais seguro para você
                        </Text>
                    </Animated.View>
                )}
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        paddingTop: 8,
    },
    options: {
        gap: QUIZ.gapOptions,
        marginBottom: 24,
    },
    detailsContainer: {
        marginTop: 8,
    },
    detailsLabel: {
        fontFamily: QUIZ.optionSubtitle.fontFamily,
        fontSize: 14,
        color: QUIZ.color.text,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: QUIZ.color.glass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: QUIZ.color.stroke,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 15,
        color: QUIZ.color.text,
        minHeight: 120,
    },
    helperText: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 12,
        color: QUIZ.color.textDim,
        marginTop: 10,
        lineHeight: 16,
    },
}));

export default LimitationsScreen;
