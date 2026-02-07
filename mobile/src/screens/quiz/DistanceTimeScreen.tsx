import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius } from '../../theme';

interface DistanceTimeScreenProps {
    distance: number; // For pace calculation
    value: { hours: number; minutes: number; seconds: number };
    onChange: (time: { hours: number; minutes: number; seconds: number }) => void;
}

type TimeField = 'hours' | 'minutes' | 'seconds';

export const DistanceTimeScreen: React.FC<DistanceTimeScreenProps> = ({
    distance,
    value,
    onChange,
}) => {
    const [activeField, setActiveField] = useState<TimeField>('minutes');
    const [inputBuffer, setInputBuffer] = useState('');

    // Calculate pace in background
    const calculatePace = () => {
        const totalMinutes = value.hours * 60 + value.minutes + value.seconds / 60;
        if (distance > 0 && totalMinutes > 0) {
            const pacePerKm = totalMinutes / distance;
            const paceMinutes = Math.floor(pacePerKm);
            const paceSeconds = Math.round((pacePerKm - paceMinutes) * 60);
            return `${paceMinutes}'${paceSeconds.toString().padStart(2, '0')}"`;
        }
        return '--\'--"';
    };

    const handleNumberPress = async (num: string) => {
        // Haptic feedback
        if (Platform.OS !== 'web') {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        const newBuffer = inputBuffer + num;
        setInputBuffer(newBuffer);

        const numValue = parseInt(newBuffer, 10);

        // Update the active field based on max values
        if (activeField === 'hours' && numValue <= 23) {
            onChange({ ...value, hours: numValue });
        } else if (activeField === 'minutes' && numValue <= 59) {
            onChange({ ...value, minutes: numValue });
        } else if (activeField === 'seconds' && numValue <= 59) {
            onChange({ ...value, seconds: numValue });
        }

        // Auto-advance to next field after 2 digits
        if (newBuffer.length >= 2) {
            setInputBuffer('');
            if (activeField === 'hours') {
                setActiveField('minutes');
            } else if (activeField === 'minutes') {
                setActiveField('seconds');
            }
        }
    };

    const handleBackspace = async () => {
        // Haptic feedback
        if (Platform.OS !== 'web') {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        if (inputBuffer.length > 0) {
            const newBuffer = inputBuffer.slice(0, -1);
            setInputBuffer(newBuffer);

            const numValue = newBuffer.length > 0 ? parseInt(newBuffer, 10) : 0;
            onChange({ ...value, [activeField]: numValue });
        } else {
            // Clear current field and move to previous
            onChange({ ...value, [activeField]: 0 });
            if (activeField === 'seconds') {
                setActiveField('minutes');
            } else if (activeField === 'minutes') {
                setActiveField('hours');
            }
        }
    };

    const selectField = async (field: TimeField) => {
        if (Platform.OS !== 'web') {
            await Haptics.selectionAsync();
        }
        setActiveField(field);
        setInputBuffer('');
    };

    const formatValue = (val: number) => val.toString().padStart(2, '0');

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Em <Text style={styles.titleHighlight}>quanto tempo</Text>
                    {'\n'}você completou essa{'\n'}distância?
                </Text>
            </View>

            {/* Time Input Cards */}
            <View style={styles.timeCardsContainer}>
                <TouchableOpacity
                    style={[
                        styles.timeCard,
                        activeField === 'hours' && styles.timeCardActive,
                    ]}
                    onPress={() => selectField('hours')}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.timeValue,
                        activeField === 'hours' && styles.timeValueActive,
                    ]}>
                        {formatValue(value.hours)}
                    </Text>
                    <Text style={styles.timeLabel}>h</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.timeCard,
                        activeField === 'minutes' && styles.timeCardActive,
                    ]}
                    onPress={() => selectField('minutes')}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.timeValue,
                        activeField === 'minutes' && styles.timeValueActive,
                    ]}>
                        {formatValue(value.minutes)}
                    </Text>
                    <Text style={styles.timeLabel}>min</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.timeCard,
                        activeField === 'seconds' && styles.timeCardActive,
                    ]}
                    onPress={() => selectField('seconds')}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.timeValue,
                        activeField === 'seconds' && styles.timeValueActive,
                    ]}>
                        {formatValue(value.seconds)}
                    </Text>
                    <Text style={styles.timeLabel}>seg</Text>
                </TouchableOpacity>
            </View>

            {/* Pace Display */}
            <View style={styles.paceContainer}>
                <Text style={styles.paceLabel}>Pace calculado:</Text>
                <Text style={styles.paceValue}>{calculatePace()} /km</Text>
            </View>

            {/* Number Pad */}
            <View style={styles.numberPad}>
                <View style={styles.numberRow}>
                    {['1', '2', '3'].map((num) => (
                        <TouchableOpacity
                            key={num}
                            style={styles.numberButton}
                            onPress={() => handleNumberPress(num)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.numberText}>{num}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.numberRow}>
                    {['4', '5', '6'].map((num) => (
                        <TouchableOpacity
                            key={num}
                            style={styles.numberButton}
                            onPress={() => handleNumberPress(num)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.numberText}>{num}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.numberRow}>
                    {['7', '8', '9'].map((num) => (
                        <TouchableOpacity
                            key={num}
                            style={styles.numberButton}
                            onPress={() => handleNumberPress(num)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.numberText}>{num}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.numberRow}>
                    <View style={styles.numberButton} />
                    <TouchableOpacity
                        style={styles.numberButton}
                        onPress={() => handleNumberPress('0')}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.numberText}>0</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.numberButton}
                        onPress={handleBackspace}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="backspace-outline" size={24} color={colors.textLight} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 25,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.textLight,
        lineHeight: 32,
    },
    titleHighlight: {
        color: colors.primary,
    },
    timeCardsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingHorizontal: 11,
        gap: 16,
        marginTop: 20,
    },
    timeCard: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 15,
        paddingVertical: 20,
        paddingHorizontal: 24,
        minWidth: 90,
    },
    timeCardActive: {
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: 'rgba(0,127,153,0.2)',
    },
    timeValue: {
        fontSize: 32,
        fontWeight: '700',
        color: 'rgba(235,235,245,0.6)',
    },
    timeValueActive: {
        color: colors.primary,
    },
    timeLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.4)',
        marginTop: 4,
    },
    paceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        gap: 8,
    },
    paceLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
    },
    paceValue: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary,
    },
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
    numberText: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.textLight,
    },
});

export default DistanceTimeScreen;
