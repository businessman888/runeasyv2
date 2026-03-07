import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CustomKeypad } from '../../components/CustomKeypad';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design System — Figma exact tokens (node 565:481)
const DS = {
    bg: '#0F0F1E',
    cardBg: '#1C1C2E',
    inputBgActive: 'rgba(0, 127, 153, 0.3)',  // Figma: accent/surface-muted
    inputBgInactive: 'transparent',
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

    // Stable ref for onChange
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
    const hasMinValue = minutes.length > 0;
    const hasSecValue = seconds.length > 0;

    return (
        <View style={styles.container}>
            {/* =========================================
                SINGLE CARD — Figma container (128px height)
                ========================================= */}
            <View style={[
                styles.card,
                (isMinActive || isSecActive) && styles.cardActive,
                dontKnow && styles.cardDisabled,
            ]}>
                {/* Title: "Ritmo Médio" — centered top */}
                <Text style={[
                    styles.cardTitle,
                    (isMinActive || isSecActive) && styles.cardTitleActive,
                ]}>
                    Ritmo Médio
                </Text>

                {/* Input row: [MM] : [SS]  min/km */}
                <View style={styles.inputRow}>
                    {/* Minutes input */}
                    <TouchableOpacity
                        style={[
                            styles.inputBlock,
                            isMinActive && styles.inputBlockActive,
                        ]}
                        onPress={() => !dontKnow && setActiveField('minutes')}
                        activeOpacity={0.8}
                        disabled={dontKnow}
                    >
                        <Text style={[
                            styles.inputValue,
                            !hasMinValue && !dontKnow && styles.inputValueDim,
                            hasMinValue && styles.inputValueFilled,
                            dontKnow && styles.inputValueDim,
                        ]}>
                            {displayMin}
                        </Text>
                    </TouchableOpacity>

                    {/* Separator : */}
                    <Text style={[
                        styles.separator,
                        (hasMinValue || hasSecValue) && styles.separatorFilled,
                    ]}>:</Text>

                    {/* Seconds input */}
                    <TouchableOpacity
                        style={[
                            styles.inputBlock,
                            isSecActive && styles.inputBlockActive,
                        ]}
                        onPress={() => !dontKnow && setActiveField('seconds')}
                        activeOpacity={0.8}
                        disabled={dontKnow}
                    >
                        <Text style={[
                            styles.inputValue,
                            !hasSecValue && !dontKnow && styles.inputValueDim,
                            hasSecValue && styles.inputValueFilled,
                            dontKnow && styles.inputValueDim,
                        ]}>
                            {displaySec}
                        </Text>
                    </TouchableOpacity>

                    {/* Unit label — right aligned */}
                    <Text style={styles.unitLabel}>min/km</Text>
                </View>
            </View>

            {/* =========================================
                CHECKBOX — "Não sei meu pace atual"
                ========================================= */}
            <TouchableOpacity
                style={styles.checkboxRow}
                onPress={handleToggleDontKnow}
                activeOpacity={0.7}
            >
                <View style={[styles.checkbox, dontKnow && styles.checkboxActive]}>
                    {dontKnow && (
                        <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
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
// STYLES — Figma node 565:481 faithful
// ============================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 24,
    },

    // — Single Card Container (Figma: 339×128px, border-radius 15) —
    card: {
        backgroundColor: DS.cardBg,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        paddingTop: 14,
        paddingBottom: 20,
        paddingHorizontal: 20,
        alignItems: 'center',
        marginHorizontal: 4,
        // Figma shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    cardActive: {
        borderColor: DS.cyan,
    },
    cardDisabled: {
        opacity: 0.45,
    },

    // — Title: "Ritmo Médio" —
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: DS.textSecondary,
        marginBottom: 16,
        letterSpacing: 0.3,
        textAlign: 'center',
    },
    cardTitleActive: {
        color: DS.cyan,
    },

    // — Input Row —
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // — Individual Input Block (Figma: 98×65px, radius 15) —
    inputBlock: {
        width: 98,
        height: 65,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    inputBlockActive: {
        backgroundColor: DS.inputBgActive,
        borderColor: DS.cyan,
    },

    // — Number Text (Figma: 32px SemiBold) —
    inputValue: {
        fontSize: 32,
        fontWeight: '600',
        color: DS.textSecondary,
    },
    inputValueDim: {
        color: DS.textSecondary,
    },
    inputValueFilled: {
        color: DS.text,
    },

    // — Separator ":" —
    separator: {
        fontSize: 32,
        fontWeight: '600',
        color: DS.textSecondary,
        marginHorizontal: 6,
    },
    separatorFilled: {
        color: DS.text,
    },

    // — Unit "min/km" —
    unitLabel: {
        fontSize: 12,
        fontWeight: '400',
        color: DS.textSecondary,
        marginLeft: 14,
    },

    // — Checkbox Row —
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        paddingVertical: 8,
    },
    checkbox: {
        width: 15,
        height: 15,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        backgroundColor: DS.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        backgroundColor: DS.cyan,
        borderColor: DS.cyan,
    },
    checkboxText: {
        fontSize: 12,
        fontWeight: '400',
        color: DS.textSecondary,
    },
    checkboxTextActive: {
        color: DS.text,
    },
});

export default PaceConfirmScreen;
