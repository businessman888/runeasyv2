import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CustomKeypad } from '../../components/CustomKeypad';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
};

interface PaceConfirmScreenProps {
    paceMinutes?: string;
    paceSeconds?: string;
    dontKnowPace?: boolean;
    onChange?: (data: { paceMinutes: string; paceSeconds: string; dontKnowPace: boolean }) => void;
}

type PaceField = 'minutes' | 'seconds';

export function PaceConfirmScreen({
    paceMinutes: initialMin,
    paceSeconds: initialSec,
    dontKnowPace: initialDontKnow,
    onChange,
}: PaceConfirmScreenProps) {
    const [minutes, setMinutes] = useState(initialMin || '');
    const [seconds, setSeconds] = useState(initialSec || '');
    const [dontKnow, setDontKnow] = useState(initialDontKnow || false);
    const [activeField, setActiveField] = useState<PaceField>('minutes');

    // Stable ref for onChange to avoid stale closures
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const notify = useCallback((min: string, sec: string, dk: boolean) => {
        onChangeRef.current?.({ paceMinutes: min, paceSeconds: sec, dontKnowPace: dk });
    }, []);

    const handleKeyPress = useCallback((key: string) => {
        if (dontKnow) return;

        if (activeField === 'minutes') {
            if (minutes.length < 2) {
                const newMin = minutes + key;
                setMinutes(newMin);
                if (newMin.length === 2) {
                    setActiveField('seconds');
                }
                notify(newMin, seconds, false);
            }
        } else {
            if (seconds.length < 2) {
                const newSec = seconds + key;
                // Cap seconds at 59
                if (parseInt(newSec, 10) > 59) {
                    const capped = '59';
                    setSeconds(capped);
                    notify(minutes, capped, false);
                } else {
                    setSeconds(newSec);
                    notify(minutes, newSec, false);
                }
            }
        }
    }, [activeField, minutes, seconds, dontKnow, notify]);

    const handleDelete = useCallback(() => {
        if (dontKnow) return;

        if (activeField === 'seconds') {
            if (seconds.length > 0) {
                const newSec = seconds.slice(0, -1);
                setSeconds(newSec);
                notify(minutes, newSec, false);
            } else {
                setActiveField('minutes');
            }
        } else {
            if (minutes.length > 0) {
                const newMin = minutes.slice(0, -1);
                setMinutes(newMin);
                notify(newMin, seconds, false);
            }
        }
    }, [activeField, minutes, seconds, dontKnow, notify]);

    const handleToggleDontKnow = useCallback(() => {
        const newDk = !dontKnow;
        setDontKnow(newDk);
        if (newDk) {
            // Clear pace inputs when "don't know" is selected
            setMinutes('');
            setSeconds('');
            notify('', '', true);
        } else {
            notify(minutes, seconds, false);
        }
    }, [dontKnow, minutes, seconds, notify]);

    const PaceInputBlock = ({ label, value, field }: { label: string; value: string; field: PaceField }) => {
        const isActive = activeField === field && !dontKnow;
        const displayValue = value.length > 0 ? value.padStart(2, '0') : '00';

        return (
            <TouchableOpacity
                style={[
                    styles.inputBlock,
                    isActive && styles.inputBlockActive,
                    dontKnow && styles.inputBlockDisabled,
                ]}
                onPress={() => !dontKnow && setActiveField(field)}
                activeOpacity={0.8}
                disabled={dontKnow}
            >
                <Text style={[
                    styles.inputValue,
                    value.length === 0 && styles.inputValuePlaceholder,
                    dontKnow && styles.inputValueDisabled,
                ]}>
                    {displayValue}
                </Text>
                <Text style={[
                    styles.inputLabel,
                    isActive && styles.inputLabelActive,
                    dontKnow && styles.inputLabelDisabled,
                ]}>
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Title */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual é o seu{'\n'}
                    <Text style={styles.titleHighlight}>pace atual</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Ritmo médio por quilômetro (min/km).
                </Text>
            </View>

            {/* Pace Inputs */}
            <View style={styles.inputsContainer}>
                <PaceInputBlock label="min" value={minutes} field="minutes" />
                <Text style={styles.separator}>:</Text>
                <PaceInputBlock label="seg" value={seconds} field="seconds" />
                <Text style={styles.unitLabel}>/ km</Text>
            </View>

            {/* Don't Know Toggle */}
            <TouchableOpacity
                style={styles.toggleWrapper}
                onPress={handleToggleDontKnow}
                activeOpacity={0.8}
            >
                {dontKnow ? (
                    <LinearGradient
                        colors={['rgba(0, 212, 255, 0.15)', 'rgba(0, 212, 255, 0.05)']}
                        style={styles.toggleGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={[styles.toggleCheck, styles.toggleCheckActive]} />
                        <Text style={[styles.toggleText, styles.toggleTextActive]}>
                            Não sei meu pace
                        </Text>
                    </LinearGradient>
                ) : (
                    <View style={styles.toggleDefault}>
                        <View style={styles.toggleCheck} />
                        <Text style={styles.toggleText}>Não sei meu pace</Text>
                    </View>
                )}
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Custom Keypad */}
            <CustomKeypad
                onPress={handleKeyPress}
                onDelete={handleDelete}
                disabled={dontKnow}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    titleContainer: {
        marginTop: 20,
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 36,
        fontFamily: 'Inter-Bold',
    },
    titleHighlight: {
        color: DS.cyan,
    },
    subtitle: {
        fontSize: 15,
        color: DS.textSecondary,
        lineHeight: 22,
        marginTop: 8,
    },
    inputsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 24,
    },
    inputBlock: {
        width: 100,
        height: 120,
        borderRadius: 20,
        backgroundColor: DS.card,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 5,
    },
    inputBlockActive: {
        borderColor: DS.cyan,
        backgroundColor: 'rgba(28, 28, 46, 0.9)',
    },
    inputBlockDisabled: {
        opacity: 0.4,
    },
    inputValue: {
        fontSize: 32,
        fontWeight: '700',
        color: DS.text,
        fontFamily: 'Inter-Bold',
        marginBottom: 4,
    },
    inputValuePlaceholder: {
        color: DS.textSecondary,
    },
    inputValueDisabled: {
        color: DS.textSecondary,
    },
    inputLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: DS.textSecondary,
    },
    inputLabelActive: {
        color: DS.cyan,
        fontWeight: '600',
    },
    inputLabelDisabled: {
        color: DS.textSecondary,
    },
    separator: {
        fontSize: 32,
        fontWeight: '700',
        color: DS.text,
        fontFamily: 'Inter-Bold',
    },
    unitLabel: {
        fontSize: 18,
        fontWeight: '600',
        color: DS.textSecondary,
        marginLeft: 8,
    },
    toggleWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
    },
    toggleDefault: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        padding: 16,
        gap: 14,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        borderRadius: 16,
    },
    toggleGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: DS.cyan,
    },
    toggleCheck: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: DS.textSecondary,
    },
    toggleCheckActive: {
        backgroundColor: DS.cyan,
        borderColor: DS.cyan,
    },
    toggleText: {
        fontSize: 16,
        fontWeight: '500',
        color: DS.textSecondary,
    },
    toggleTextActive: {
        color: DS.cyan,
        fontWeight: '600',
    },
});

export default PaceConfirmScreen;
