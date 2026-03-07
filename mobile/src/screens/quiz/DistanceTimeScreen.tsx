import React, { useState, useRef } from 'react';
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

// Helper: convert value prop to display string (once, on mount)
function initFromProp(val: DistanceTimeValue | null | undefined, field: 'hours' | 'minutes' | 'seconds'): string {
    if (!val) return '';
    const n = val[field];
    return n > 0 ? String(n).padStart(2, '0') : '';
}

export function DistanceTimeScreen({ value, recentDistance = 5, onChange }: DistanceTimeScreenProps) {
    // ===== ISOLATED LOCAL STATE =====
    // Initialized from props ONCE on mount. No useEffect, no sync loop.
    const [hours, setHours] = useState(() => initFromProp(value, 'hours'));
    const [minutes, setMinutes] = useState(() => initFromProp(value, 'minutes'));
    const [seconds, setSeconds] = useState(() => initFromProp(value, 'seconds'));
    const [activeField, setActiveField] = useState<FieldType>('minutes');

    // Stable ref to onChange — never triggers re-renders
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // ===== REPORT TO PARENT — only called by user actions =====
    // This is the ONLY place onChange fires. No useEffect involved.
    const reportToParent = (h: string, m: string, s: string) => {
        onChangeRef.current?.({
            hours: parseInt(h || '0', 10),
            minutes: parseInt(m || '0', 10),
            seconds: parseInt(s || '0', 10),
        });
    };

    // ===== KEY PRESS HANDLER =====
    const handlePressKey = (key: string) => {
        let currentVal = '';
        let nextField: FieldType | null = null;
        let fieldName: FieldType = activeField;

        if (activeField === 'hours') {
            currentVal = hours;
            nextField = 'minutes';
        } else if (activeField === 'minutes') {
            currentVal = minutes;
            nextField = 'seconds';
        } else {
            currentVal = seconds;
            nextField = null;
        }

        if (currentVal.length >= 2) return; // Already full

        const newVal = currentVal + key;

        // Validation: minutes/seconds cannot exceed 59
        if (activeField !== 'hours' && parseInt(newVal, 10) > 59) {
            // Cap at 59
            const cappedVal = '59';
            const newH = hours;
            const newM = activeField === 'minutes' ? cappedVal : minutes;
            const newS = activeField === 'seconds' ? cappedVal : seconds;

            if (activeField === 'minutes') setMinutes(cappedVal);
            else setSeconds(cappedVal);

            if (nextField) setActiveField(nextField);
            reportToParent(newH, newM, newS);
            return;
        }

        // Set the value
        const newH = activeField === 'hours' ? newVal : hours;
        const newM = activeField === 'minutes' ? newVal : minutes;
        const newS = activeField === 'seconds' ? newVal : seconds;

        if (activeField === 'hours') setHours(newVal);
        else if (activeField === 'minutes') setMinutes(newVal);
        else setSeconds(newVal);

        // Auto-advance if filled 2 digits
        if (newVal.length === 2 && nextField) {
            setActiveField(nextField);
        }

        // Report to parent on every keypress
        reportToParent(newH, newM, newS);
    };

    // ===== DELETE HANDLER =====
    const handleDelete = () => {
        let newH = hours;
        let newM = minutes;
        let newS = seconds;

        if (activeField === 'hours') {
            if (hours.length > 0) {
                newH = hours.slice(0, -1);
                setHours(newH);
            }
        } else if (activeField === 'minutes') {
            if (minutes.length > 0) {
                newM = minutes.slice(0, -1);
                setMinutes(newM);
            } else {
                setActiveField('hours');
                return; // Just moving focus, no value change
            }
        } else if (activeField === 'seconds') {
            if (seconds.length > 0) {
                newS = seconds.slice(0, -1);
                setSeconds(newS);
            } else {
                setActiveField('minutes');
                return; // Just moving focus, no value change
            }
        }

        reportToParent(newH, newM, newS);
    };

    // ===== UI COMPONENTS =====
    const TimeInputBlock = ({
        label,
        blockValue,
        field,
        placeholder = '00'
    }: { label: string, blockValue: string, field: FieldType, placeholder?: string }) => {
        const isActive = activeField === field;
        const showPlaceholder = blockValue.length === 0;

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
                ]}>
                    {blockValue ? blockValue.padStart(2, '0') : '00'}
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
                <TimeInputBlock label="h" blockValue={hours} field="hours" />
                <TimeInputBlock label="min" blockValue={minutes} field="minutes" />
                <TimeInputBlock label="seg" blockValue={seconds} field="seconds" />
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
        fontFamily: 'Inter-Bold',
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
        backgroundColor: DS.card,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 5,
    },
    inputBlockActive: {
        borderColor: DS.activeBorder,
        borderWidth: 1,
        backgroundColor: 'rgba(28, 28, 46, 0.9)',
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
