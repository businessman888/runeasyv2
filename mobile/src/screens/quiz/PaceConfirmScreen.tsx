import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { CustomKeypad } from '../../components/CustomKeypad';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design System Colors (Figma exact)
const DS = {
    bg: '#0F0F1E',
    cardBg: '#111126',
    inputBg: '#0D0D1F',
    cyan: '#00D4FF',
    cyanDim: 'rgba(0, 212, 255, 0.35)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(0, 212, 255, 0.5)',
    inputBorder: 'rgba(235, 235, 245, 0.12)',
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
            setMinutes('');
            setSeconds('');
            notify('', '', true);
        } else {
            notify(minutes, seconds, false);
        }
    }, [dontKnow, minutes, seconds, notify]);

    // Display values
    const displayMin = minutes.length > 0 ? minutes.padStart(2, '0') : '00';
    const displaySec = seconds.length > 0 ? seconds.padStart(2, '0') : '00';
    const isMinActive = activeField === 'minutes' && !dontKnow;
    const isSecActive = activeField === 'seconds' && !dontKnow;

    return (
        <View style={styles.container}>
            {/* =========================================
                GLASSMORPHISM CARD — Figma main container
                ========================================= */}
            <LinearGradient
                colors={['rgba(0, 212, 255, 0.08)', 'rgba(0, 212, 255, 0.02)']}
                style={styles.glassCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                {/* Title inside card */}
                <Text style={styles.cardTitle}>Ritmo Médio</Text>

                {/* Input row: [MM] : [SS]  min/km */}
                <View style={styles.inputRow}>
                    {/* Minutes block */}
                    <TouchableOpacity
                        style={[
                            styles.inputBlock,
                            isMinActive && styles.inputBlockActive,
                            dontKnow && styles.inputBlockDisabled,
                        ]}
                        onPress={() => !dontKnow && setActiveField('minutes')}
                        activeOpacity={0.8}
                        disabled={dontKnow}
                    >
                        <Text style={[
                            styles.inputValue,
                            minutes.length === 0 && !dontKnow && styles.inputValuePlaceholder,
                            dontKnow && styles.inputValueDisabled,
                        ]}>
                            {displayMin}
                        </Text>
                    </TouchableOpacity>

                    {/* Separator */}
                    <Text style={styles.separator}>:</Text>

                    {/* Seconds block */}
                    <TouchableOpacity
                        style={[
                            styles.inputBlock,
                            isSecActive && styles.inputBlockActive,
                            dontKnow && styles.inputBlockDisabled,
                        ]}
                        onPress={() => !dontKnow && setActiveField('seconds')}
                        activeOpacity={0.8}
                        disabled={dontKnow}
                    >
                        <Text style={[
                            styles.inputValue,
                            seconds.length === 0 && !dontKnow && styles.inputValuePlaceholder,
                            dontKnow && styles.inputValueDisabled,
                        ]}>
                            {displaySec}
                        </Text>
                    </TouchableOpacity>

                    {/* Unit label */}
                    <Text style={styles.unitLabel}>min/km</Text>
                </View>
            </LinearGradient>

            {/* =========================================
                CHECKBOX — "Não sei meu pace atual"
                ========================================= */}
            <TouchableOpacity
                style={styles.checkboxRow}
                onPress={handleToggleDontKnow}
                activeOpacity={0.7}
            >
                <View style={[styles.circleCheck, dontKnow && styles.circleCheckActive]}>
                    {dontKnow && (
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                                fill={DS.bg}
                            />
                        </Svg>
                    )}
                </View>
                <Text style={[styles.checkboxText, dontKnow && styles.checkboxTextActive]}>
                    Não sei meu pace atual
                </Text>
            </TouchableOpacity>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* =========================================
                CUSTOM KEYPAD
                ========================================= */}
            <CustomKeypad
                onPress={handleKeyPress}
                onDelete={handleDelete}
                disabled={dontKnow}
            />
        </View>
    );
}

// ============================================
// STYLES — Figma faithful
// ============================================
const INPUT_BLOCK_SIZE = (SCREEN_WIDTH - 40 - 24 - 60 - 32) / 2; // Account for padding, gap, separator, unit

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 16,
    },

    // — Glass Card —
    glassCard: {
        borderWidth: 1.5,
        borderColor: DS.glassBorder,
        borderRadius: 20,
        paddingVertical: 24,
        paddingHorizontal: 20,
        alignItems: 'center',
        // Glassmorphism shadow
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 4,
    },
    cardTitle: {
        fontFamily: 'Inter-Bold',
        fontSize: 18,
        fontWeight: '700',
        color: DS.cyan,
        marginBottom: 20,
        letterSpacing: 0.5,
    },

    // — Input Row —
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    inputBlock: {
        width: INPUT_BLOCK_SIZE,
        height: 80,
        borderRadius: 14,
        backgroundColor: DS.inputBg,
        borderWidth: 1.5,
        borderColor: DS.inputBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputBlockActive: {
        borderColor: DS.cyan,
        // Cyan glow on active
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 6,
    },
    inputBlockDisabled: {
        opacity: 0.35,
    },
    inputValue: {
        fontFamily: 'Inter-Bold',
        fontSize: 36,
        fontWeight: '700',
        color: DS.text,
    },
    inputValuePlaceholder: {
        color: DS.textSecondary,
    },
    inputValueDisabled: {
        color: DS.textSecondary,
    },
    separator: {
        fontFamily: 'Inter-Bold',
        fontSize: 32,
        fontWeight: '700',
        color: DS.text,
    },
    unitLabel: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 16,
        fontWeight: '600',
        color: DS.textSecondary,
        marginLeft: 4,
    },

    // — Checkbox Row —
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 24,
        paddingVertical: 8,
    },
    circleCheck: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: DS.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    circleCheckActive: {
        backgroundColor: DS.cyan,
        borderColor: DS.cyan,
    },
    checkboxText: {
        fontFamily: 'Inter-Regular',
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
    },
    checkboxTextActive: {
        color: DS.text,
    },
});

export default PaceConfirmScreen;
