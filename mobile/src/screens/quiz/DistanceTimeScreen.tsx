import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomKeypad } from '../../components/CustomKeypad';

// Design System
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
    glassBg: 'rgba(28, 28, 46, 0.7)',
    activeBorder: '#00D4FF',
};

interface DistanceTimeValue {
    hours: number;
    minutes: number;
    seconds: number;
}

interface DistanceTimeScreenProps {
    value?: DistanceTimeValue | null;
    recentDistance?: number; // km
    onChange?: (value: DistanceTimeValue) => void;
}

type FieldType = 'hours' | 'minutes' | 'seconds';

export function DistanceTimeScreen({ value, recentDistance = 5, onChange }: DistanceTimeScreenProps) {
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    const [seconds, setSeconds] = useState('');
    const [activeField, setActiveField] = useState<FieldType>('minutes'); // Default focus on minutes? Or hours?

    // Load initial values
    useEffect(() => {
        if (value) {
            setHours(value.hours > 0 ? String(value.hours).padStart(2, '0') : '');
            setMinutes(value.minutes > 0 ? String(value.minutes).padStart(2, '0') : '');
            setSeconds(value.seconds > 0 ? String(value.seconds).padStart(2, '0') : '');
        } else {
            // Focus on start
            setActiveField('hours');
        }
    }, [value]);

    // Handle updates and persistence
    useEffect(() => {
        const h = parseInt(hours || '0', 10);
        const m = parseInt(minutes || '0', 10);
        const s = parseInt(seconds || '0', 10);

        if (onChange) {
            onChange({ hours: h, minutes: m, seconds: s });
        }
    }, [hours, minutes, seconds]);

    const handlePressKey = (key: string) => {
        let currentVal = '';
        let setter: React.Dispatch<React.SetStateAction<string>> | null = null;
        let nextField: FieldType | null = null;

        if (activeField === 'hours') {
            currentVal = hours;
            setter = setHours;
            nextField = 'minutes';
        } else if (activeField === 'minutes') {
            currentVal = minutes;
            setter = setMinutes;
            nextField = 'seconds';
        } else {
            currentVal = seconds;
            setter = setSeconds;
            nextField = null;
        }

        if (currentVal.length < 2 && setter) {
            const newVal = currentVal + key;

            // Validation for minutes/seconds overflow > 59
            if (activeField !== 'hours') {
                if (parseInt(newVal, 10) > 59) {
                    // Option 1: auto-correct to 59? Option 2: reject?
                    // User says: "Minutos e Segundos não podem ultrapassar 59."
                    // Let's cap at 59 for better UX than silent reject
                    setter('59');
                    // Auto-advance if we hit max length (2)
                    if (nextField) setActiveField(nextField);
                    return;
                }
            }

            setter(newVal);

            // Auto-advance if filled 2 digits
            if (newVal.length === 2 && nextField) {
                setActiveField(nextField);
            }
        }
    };

    const handleDelete = () => {
        if (activeField === 'hours') {
            if (hours.length > 0) setHours(prev => prev.slice(0, -1));
        } else if (activeField === 'minutes') {
            if (minutes.length > 0) {
                setMinutes(prev => prev.slice(0, -1));
            } else {
                // Backtrack to hours
                setActiveField('hours');
            }
        } else if (activeField === 'seconds') {
            if (seconds.length > 0) {
                setSeconds(prev => prev.slice(0, -1));
            } else {
                // Backtrack to minutes
                setActiveField('minutes');
            }
        }
    };

    const TimeInputBlock = ({
        label,
        value,
        field,
        placeholder = '00'
    }: { label: string, value: string, field: FieldType, placeholder?: string }) => {
        const isActive = activeField === field;
        const displayValue = value.length > 0 ? value.padStart(2, '0') : placeholder;

        // Highlight logic if empty: show 00 dimmed. If typing, show what is typed.
        // Actually, user wants "00" placeholder.
        const showPlaceholder = value.length === 0;

        return (
            <TouchableOpacity
                style={[
                    styles.inputBlock,
                    isActive && styles.inputBlockActive
                ]}
                onPress={() => setActiveField(field)}
                activeOpacity={0.8}
            >
                <Text style={[
                    styles.inputValue,
                    showPlaceholder && styles.inputValuePlaceholder,
                    (field !== 'hours' && parseInt(value || '0') > 59) && styles.inputValueError // Just in case
                ]}>
                    {value ? value.padStart(2, '0') : '00'}
                </Text>
                <Text style={[styles.inputLabel, isActive && styles.inputLabelActive]}>
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Em <Text style={styles.titleHighlight}>quanto tempo</Text> você{'\n'}
                    completou essa{'\n'}
                    distância?
                </Text>
            </View>

            {/* Segmented Inputs */}
            <View style={styles.inputsContainer}>
                <TimeInputBlock label="h" value={hours} field="hours" />
                <TimeInputBlock label="min" value={minutes} field="minutes" />
                <TimeInputBlock label="seg" value={seconds} field="seconds" />
            </View>

            <View style={{ flex: 1 }} />

            {/* Custom Keypad */}
            <CustomKeypad
                onPress={handlePressKey}
                onDelete={handleDelete}
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
        marginBottom: 40,
        paddingHorizontal: 0,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 36,
        fontFamily: 'Inter-Bold', // Ensure font matches
    },
    titleHighlight: {
        color: DS.cyan,
    },
    inputsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 24,
    },
    inputBlock: {
        width: 100,
        height: 120,
        borderRadius: 20,
        backgroundColor: DS.card, // Fallback
        borderWidth: 1,
        borderColor: DS.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        // Glassmorphism effect simulation
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 5,
    },
    inputBlockActive: {
        borderColor: DS.activeBorder,
        borderWidth: 1, // Can make it 1.5 or 2 for stronger focus
        backgroundColor: 'rgba(28, 28, 46, 0.9)', // Slightly lighter/solid on focus
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
    inputValueError: {
        color: '#FF453A',
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
});

export default DistanceTimeScreen;
