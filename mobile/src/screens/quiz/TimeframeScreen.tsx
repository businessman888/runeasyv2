import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import Svg, { Path, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');



// Backspace Icon
const BackspaceIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M22 3H7C6.31 3 5.77 3.35 5.41 3.88L0 12L5.41 20.11C5.77 20.64 6.31 21 7 21H22C23.1 21 24 20.1 24 19V5C24 3.9 23.1 3 22 3ZM19 15.59L17.59 17L14 13.41L10.41 17L9 15.59L12.59 12L9 8.41L10.41 7L14 10.59L17.59 7L19 8.41L15.41 12L19 15.59Z"
            fill="rgba(235, 235, 245, 0.6)"
        />
    </Svg>
);



// Checkbox Component
const Checkbox = ({ checked, onPress }: { checked: boolean; onPress: () => void }) => (
    <TouchableOpacity style={styles.checkboxContainer} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked && (
                <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                    <Path d="M10 3L4.5 8.5L2 6" stroke="#0E0E1F" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
            )}
        </View>
        <Text style={styles.checkboxLabel}>Não sei meu pace atual</Text>
    </TouchableOpacity>
);


interface TimeframeScreenProps {
    paceMinutes?: string;
    paceSeconds?: string;
    dontKnowPace?: boolean;
    onChange?: (data: { paceMinutes: string; paceSeconds: string; dontKnowPace: boolean }) => void;
}

export function TimeframeScreen({ paceMinutes: initialMinutes, paceSeconds: initialSeconds, dontKnowPace: initialDontKnow, onChange }: TimeframeScreenProps) {
    const [paceMinutes, setPaceMinutes] = useState(initialMinutes || '');
    const [paceSeconds, setPaceSeconds] = useState(initialSeconds || '');
    const [isEditingMinutes, setIsEditingMinutes] = useState(true);
    const [dontKnowPace, setDontKnowPace] = useState(initialDontKnow || false);

    useEffect(() => {
        setPaceMinutes(initialMinutes || '');
        setPaceSeconds(initialSeconds || '');
        setDontKnowPace(initialDontKnow || false);
    }, [initialMinutes, initialSeconds, initialDontKnow]);

    const notifyChange = (mins: string, secs: string, dontKnow: boolean) => {
        if (onChange) {
            onChange({ paceMinutes: mins, paceSeconds: secs, dontKnowPace: dontKnow });
        }
    };

    const handleNumberPress = (num: string) => {
        if (dontKnowPace) return;

        if (isEditingMinutes) {
            if (paceMinutes.length < 2) {
                const newValue = paceMinutes + num;
                setPaceMinutes(newValue);
                notifyChange(newValue, paceSeconds, dontKnowPace);
                // Auto-advance if 2 digits entered
                if (newValue.length === 2) {
                    setIsEditingMinutes(false);
                }
            }
        } else {
            if (paceSeconds.length < 2) {
                const newValue = paceSeconds + num;
                setPaceSeconds(newValue);
                notifyChange(paceMinutes, newValue, dontKnowPace);
            }
        }
    };

    const handleBackspace = () => {
        if (dontKnowPace) return;

        if (isEditingMinutes) {
            if (paceMinutes.length > 0) {
                const newValue = paceMinutes.slice(0, -1);
                setPaceMinutes(newValue);
                notifyChange(newValue, paceSeconds, dontKnowPace);
            }
        } else {
            if (paceSeconds.length > 0) {
                const newValue = paceSeconds.slice(0, -1);
                setPaceSeconds(newValue);
                notifyChange(paceMinutes, newValue, dontKnowPace);
            } else {
                // If seconds empty, go back to minutes
                setIsEditingMinutes(true);
            }
        }
    };

    const formatTime = (value: string) => {
        if (!value) return '00';
        return value.padStart(2, '0');
    };

    // Valid if both fields have content OR user selected "don't know"
    const canProceed = dontKnowPace || (paceMinutes.length > 0 && paceSeconds.length > 0);

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Qual é o seu Pace atual?</Text>
                <Text style={styles.subtitle}>
                    Insira seu ritmo médio para sua meta.{'\n'}Isso nos ajuda a calibrar seus primeiros{'\n'}treinos.
                </Text>
            </View>

            {/* Pace Input Card */}
            <View style={styles.paceCard}>
                <Text style={styles.paceCardTitle}>Ritmo Médio</Text>
                <View style={styles.paceInputRow}>
                    {/* Minutes Input */}
                    <TouchableOpacity
                        style={[
                            styles.timeInputContainer,
                            isEditingMinutes && !dontKnowPace && styles.timeInputActive
                        ]}
                        onPress={() => !dontKnowPace && setIsEditingMinutes(true)}
                        activeOpacity={dontKnowPace ? 1 : 0.7}
                    >
                        <Text style={[styles.paceInputText, dontKnowPace && styles.paceInputDisabled]}>
                            {formatTime(paceMinutes)}
                        </Text>
                    </TouchableOpacity>

                    <Text style={[styles.paceColon, dontKnowPace && styles.paceInputDisabled]}>:</Text>

                    {/* Seconds Input */}
                    <TouchableOpacity
                        style={[
                            styles.timeInputContainer,
                            !isEditingMinutes && !dontKnowPace && styles.timeInputActive
                        ]}
                        onPress={() => !dontKnowPace && setIsEditingMinutes(false)}
                        activeOpacity={dontKnowPace ? 1 : 0.7}
                    >
                        <Text style={[styles.paceInputText, dontKnowPace && styles.paceInputDisabled]}>
                            {formatTime(paceSeconds)}
                        </Text>
                    </TouchableOpacity>

                    <Text style={styles.paceUnit}>min/km</Text>
                </View>
            </View>

            {/* Checkbox */}
            <Checkbox checked={dontKnowPace} onPress={() => {
                const newValue = !dontKnowPace;
                setDontKnowPace(newValue);
                notifyChange(paceMinutes, paceSeconds, newValue);
            }} />

            {/* Number Pad */}
            <View style={styles.numberPad}>
                {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.numberRow}>
                        {row.map((num) => (
                            <TouchableOpacity
                                key={num}
                                style={[styles.numberButton, dontKnowPace && styles.numberButtonDisabled]}
                                onPress={() => handleNumberPress(num)}
                                disabled={dontKnowPace}
                                activeOpacity={0.6}
                            >
                                <Text style={[styles.numberText, dontKnowPace && styles.numberTextDisabled]}>
                                    {num}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}

                {/* Bottom Row: 0 and Backspace */}
                <View style={styles.numberRow}>
                    <View style={styles.numberButton} />
                    <TouchableOpacity
                        style={[styles.numberButton, dontKnowPace && styles.numberButtonDisabled]}
                        onPress={() => handleNumberPress('0')}
                        disabled={dontKnowPace}
                        activeOpacity={0.6}
                    >
                        <Text style={[styles.numberText, dontKnowPace && styles.numberTextDisabled]}>0</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.numberButton, dontKnowPace && styles.numberButtonDisabled]}
                        onPress={handleBackspace}
                        disabled={dontKnowPace}
                        activeOpacity={0.6}
                    >
                        <BackspaceIcon />
                    </TouchableOpacity>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
    },
    progressContainer: {
        marginBottom: 24,
    },
    progressText: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 12,
    },
    progressNumber: {
        color: '#00D4FF',
        fontWeight: '600',
    },
    progressTotal: {
        color: '#00D4FF',
    },
    progressSteps: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stepContainer: {
        alignItems: 'center',
    },
    stepLine: {
        width: 44,
        height: 4,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 20,
        marginTop: 8,
    },
    stepLineActive: {
        backgroundColor: '#00D4FF',
    },
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.white,
        lineHeight: 36,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 22,
    },
    paceCard: {
        backgroundColor: '#15152A',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#00D4FF',
    },
    paceCardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#00D4FF',
        marginBottom: 12,
    },
    paceInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    timeInputContainer: {
        backgroundColor: 'rgba(235, 235, 245, 0.05)',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.3)',
        minWidth: 90,
        alignItems: 'center',
    },
    timeInputActive: {
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0, 212, 255, 0.05)',
    },
    paceColon: {
        fontSize: 36,
        fontWeight: '700',
        color: colors.white,
        textAlignVertical: 'center',
        marginTop: -6, // Visual alignment
    },
    paceInputText: {
        fontSize: 36,
        fontWeight: '700',
        color: colors.white,
    },
    paceInputDisabled: {
        color: 'rgba(235, 235, 245, 0.3)',
    },
    paceUnit: {
        fontSize: 15,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: '#00D4FF',
        borderColor: '#00D4FF',
    },
    checkboxLabel: {
        fontSize: 14,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    keypad: {
        flex: 1,
        justifyContent: 'center',
    },
    keypadRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 8,
    },
    keypadButton: {
        width: 70,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 15,
    },
    keypadText: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.white,
    },
    keypadTextDisabled: {
        color: 'rgba(235, 235, 245, 0.3)',
    },
    // Number pad styles (used in JSX)
    numberPad: {
        flex: 1,
        justifyContent: 'center',
        marginTop: 16,
    },
    numberRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 8,
    },
    numberButton: {
        width: 70,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 15,
    },
    numberButtonDisabled: {
        opacity: 0.4,
    },
    numberText: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.white,
    },
    numberTextDisabled: {
        color: 'rgba(235, 235, 245, 0.3)',
    },
    nextButtonContainer: {
        position: 'absolute',
        bottom: 30,
        right: 20,
    },
    nextButton: {
        borderRadius: 27,
    },
    nextButtonDisabled: {
        shadowOpacity: 0.3,
    },
});

export default TimeframeScreen;
