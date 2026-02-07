import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import * as Haptics from 'expo-haptics';

interface DistanceTimeValue {
    hours: number;
    minutes: number;
    seconds: number;
}

interface DistanceTimeScreenProps {
    value?: DistanceTimeValue | null;
    recentDistance?: number;
    onChange?: (value: DistanceTimeValue) => void;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

export function DistanceTimeScreen({ value, recentDistance = 5, onChange }: DistanceTimeScreenProps) {
    const [timeString, setTimeString] = useState<string>(
        value ? `${String(value.hours).padStart(2, '0')}${String(value.minutes).padStart(2, '0')}${String(value.seconds).padStart(2, '0')}` : ''
    );

    useEffect(() => {
        if (value) {
            setTimeString(`${String(value.hours).padStart(2, '0')}${String(value.minutes).padStart(2, '0')}${String(value.seconds).padStart(2, '0')}`);
        }
    }, [value]);

    const handleKeyPress = async (key: string) => {
        // Haptic feedback
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {
            // Haptics not available
        }

        let newTimeString = timeString;

        if (key === '⌫') {
            newTimeString = timeString.slice(0, -1);
        } else if (key === '00') {
            if (timeString.length <= 4) {
                newTimeString = timeString + '00';
            }
        } else {
            if (timeString.length < 6) {
                newTimeString = timeString + key;
            }
        }

        setTimeString(newTimeString);
        updateValue(newTimeString);
    };

    const updateValue = (str: string) => {
        const padded = str.padStart(6, '0');
        const hours = parseInt(padded.slice(0, 2), 10);
        const minutes = parseInt(padded.slice(2, 4), 10);
        const seconds = parseInt(padded.slice(4, 6), 10);

        if (onChange) {
            onChange({ hours, minutes, seconds });
        }
    };

    const formatDisplay = () => {
        const padded = timeString.padStart(6, '0');
        return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
    };

    const calculatePace = () => {
        const padded = timeString.padStart(6, '0');
        const hours = parseInt(padded.slice(0, 2), 10);
        const minutes = parseInt(padded.slice(2, 4), 10);
        const seconds = parseInt(padded.slice(4, 6), 10);

        const totalMinutes = hours * 60 + minutes + seconds / 60;
        if (totalMinutes === 0 || recentDistance === 0) return '--:--';

        const paceMinutes = totalMinutes / recentDistance;
        const paceMins = Math.floor(paceMinutes);
        const paceSecs = Math.round((paceMinutes - paceMins) * 60);

        return `${paceMins}:${String(paceSecs).padStart(2, '0')}`;
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Em quanto tempo você{'\n'}
                    <Text style={styles.titleHighlight}>correu {recentDistance}km?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Informe o tempo aproximado da sua última corrida de {recentDistance}km.
                </Text>
            </View>

            {/* Time Display */}
            <View style={styles.displayContainer}>
                <Text style={styles.displayText}>{formatDisplay()}</Text>
                <Text style={styles.displayLabel}>hh:mm:ss</Text>
            </View>

            {/* Pace Display */}
            <View style={styles.paceContainer}>
                <Text style={styles.paceLabel}>Pace estimado</Text>
                <Text style={styles.paceValue}>{calculatePace()} min/km</Text>
            </View>

            {/* Keypad */}
            <View style={styles.keypadContainer}>
                {KEYPAD.map((key) => (
                    <TouchableOpacity
                        key={key}
                        style={[
                            styles.keypadButton,
                            key === '⌫' && styles.keypadButtonDelete
                        ]}
                        onPress={() => handleKeyPress(key)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.keypadText,
                            key === '⌫' && styles.keypadTextDelete
                        ]}>
                            {key}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 40,
        marginBottom: 12,
    },
    titleHighlight: {
        color: colors.primary,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    displayContainer: {
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 24,
        borderWidth: 2,
        borderColor: colors.primary,
        ...shadows.neon,
    },
    displayText: {
        fontSize: 48,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        fontVariant: ['tabular-nums'],
    },
    displayLabel: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        marginTop: 4,
    },
    paceContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: 16,
        marginBottom: 24,
    },
    paceLabel: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    paceValue: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.success,
    },
    keypadContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
    },
    keypadButton: {
        width: '28%',
        aspectRatio: 1.5,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keypadButtonDelete: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    keypadText: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
    },
    keypadTextDelete: {
        color: colors.error,
    },
});

export default DistanceTimeScreen;
