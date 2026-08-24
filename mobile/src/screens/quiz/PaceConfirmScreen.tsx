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
import { fonts, useThemeSubscription, createThemeStyles } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const getLocalThemePalette1 = () => ({
    bg: semanticColors.onboardingIconInkAlt,
    cardBg: semanticColors.surface2,
    inputBgActive: semanticColors.accentSubtle,
    inputBgInactive: semanticColors.transparent,
    cyan: semanticColors.accent,
    text: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
    glassBorder: semanticColors.borderSubtle,
});

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design System — Figma exact tokens (node 565:481)


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
    useThemeSubscription();
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
                                fill={getLocalThemePalette1().bg}
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

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        paddingTop: 24,
    },

    // — Single Card Container (Figma: 339×128px, border-radius 15) —
    card: {
        backgroundColor: getLocalThemePalette1().cardBg,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: getLocalThemePalette1().glassBorder,
        paddingTop: 14,
        paddingBottom: 20,
        paddingHorizontal: 20,
        alignItems: 'center',
        marginHorizontal: 4,
        // Figma shadow
        shadowColor: semanticColors.shadow,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    cardActive: {
        borderColor: getLocalThemePalette1().cyan,
    },
    cardDisabled: {
        opacity: 0.45,
    },

    // — Title: "Ritmo Médio" —
    cardTitle: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: getLocalThemePalette1().textSecondary,
        marginBottom: 16,
        letterSpacing: 0.3,
        textAlign: 'center',
    },
    cardTitleActive: {
        color: getLocalThemePalette1().cyan,
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
        borderColor: getLocalThemePalette1().glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    inputBlockActive: {
        backgroundColor: getLocalThemePalette1().inputBgActive,
        borderColor: getLocalThemePalette1().cyan,
    },

    // — Number Text (Figma: 32px SemiBold) —
    inputValue: {
        fontFamily: fonts.semibold,
        fontSize: 32,
        color: getLocalThemePalette1().textSecondary,
    },
    inputValueDim: {
        color: getLocalThemePalette1().textSecondary,
    },
    inputValueFilled: {
        color: getLocalThemePalette1().text,
    },

    // — Separator ":" —
    separator: {
        fontFamily: fonts.semibold,
        fontSize: 32,
        color: getLocalThemePalette1().textSecondary,
        marginHorizontal: 6,
    },
    separatorFilled: {
        color: getLocalThemePalette1().text,
    },

    // — Unit "min/km" —
    unitLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: getLocalThemePalette1().textSecondary,
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
        borderColor: getLocalThemePalette1().glassBorder,
        backgroundColor: getLocalThemePalette1().glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        backgroundColor: getLocalThemePalette1().cyan,
        borderColor: getLocalThemePalette1().cyan,
    },
    checkboxText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: getLocalThemePalette1().textSecondary,
    },
    checkboxTextActive: {
        color: getLocalThemePalette1().text,
    },
}));

export default PaceConfirmScreen;
