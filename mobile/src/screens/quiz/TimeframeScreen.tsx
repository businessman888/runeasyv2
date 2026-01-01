import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions,
    Platform,
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import Svg, { Path, Rect } from 'react-native-svg';
import { QuizProgressBar } from '../../components/QuizProgressBar';

const { width } = Dimensions.get('window');

// Progress Step Icons
const WalkingIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M10.5 4.5C11.3284 4.5 12 3.82843 12 3C12 2.17157 11.3284 1.5 10.5 1.5C9.67157 1.5 9 2.17157 9 3C9 3.82843 9.67157 4.5 10.5 4.5ZM7.5 7.5L5 17L7.5 17.5L9 12L10.5 13.5V19.5H12.5V12L11 9L11.5 6.5L13.5 8.5H16.5V6.5H14.5L11.5 3.5C11.2239 3.22386 10.8978 3.08579 10.5217 3.08579C10.1457 3.08579 9.81957 3.22386 9.54343 3.5C9.34343 3.7 9.10914 4.09286 9 4.5L7.5 7.5Z"
            fill={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
        />
    </Svg>
);

const LockIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M14.1667 9.66667V7.16667C14.1667 4.86548 12.3012 3 10 3C7.69881 3 5.83333 4.86548 5.83333 7.16667V9.66667M6.5 18H13.5C14.9001 18 15.6002 18 16.135 17.7275C16.6054 17.4878 16.9878 17.1054 17.2275 16.635C17.5 16.1002 17.5 15.4001 17.5 14V13.6667C17.5 12.2665 17.5 11.5665 17.2275 11.0316C16.9878 10.5613 16.6054 10.1788 16.135 9.93915C15.6002 9.66667 14.9001 9.66667 13.5 9.66667H6.5C5.09987 9.66667 4.3998 9.66667 3.86502 9.93915C3.39462 10.1788 3.01217 10.5613 2.77248 11.0316C2.5 11.5665 2.5 12.2665 2.5 13.6667V14C2.5 15.4001 2.5 16.1002 2.77248 16.635C3.01217 17.1054 3.39462 17.4878 3.86502 17.7275C4.3998 18 5.09987 18 6.5 18Z"
            stroke={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
    </Svg>
);

// Running Icon for step 5
const RunningIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M13.3333 4.66667C14.2538 4.66667 15 3.92048 15 3C15 2.07952 14.2538 1.33333 13.3333 1.33333C12.4129 1.33333 11.6667 2.07952 11.6667 3C11.6667 3.92048 12.4129 4.66667 13.3333 4.66667ZM10.8333 7.5L8.33333 9.16667L10 12.5L7.5 17.5H9.58333L11.25 13.75L13.3333 15V18.3333H15V13.75L13.3333 11.25L14.1667 8.33333L15.8333 10H18.3333V8.33333H16.6667L14.1667 5.83333C13.75 5.41667 13.25 5.16667 12.6667 5.16667C12.0833 5.16667 11.5833 5.41667 11.1667 5.83333L9.16667 7.83333C8.75 8.25 8.5 8.75 8.5 9.33333C8.5 9.91667 8.75 10.4167 9.16667 10.8333L10.8333 12.5V7.5ZM5 10.8333L3.33333 17.5H5.41667L6.25 14.1667L7.5 15.4167V17.5H9.16667V14.1667L7.91667 12.9167L8.33333 11.25L5 10.8333Z"
            fill={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
        />
    </Svg>
);

// Backspace Icon
const BackspaceIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M22 3H7C6.31 3 5.77 3.35 5.41 3.88L0 12L5.41 20.11C5.77 20.64 6.31 21 7 21H22C23.1 21 24 20.1 24 19V5C24 3.9 23.1 3 22 3ZM19 15.59L17.59 17L14 13.41L10.41 17L9 15.59L12.59 12L9 8.41L10.41 7L14 10.59L17.59 7L19 8.41L15.41 12L19 15.59Z"
            fill="rgba(235, 235, 245, 0.6)"
        />
    </Svg>
);

// Next Button with Runner Icon
const NextButton = ({ onPress, disabled }: { onPress: () => void; disabled: boolean }) => (
    <TouchableOpacity
        style={[styles.nextButton, disabled && styles.nextButtonDisabled]}
        onPress={onPress}
        activeOpacity={0.8}
        disabled={disabled}
    >
        <Svg width={54} height={54} viewBox="0 0 54 54" fill="none">
            <Rect width={54} height={54} rx={27} fill={disabled ? 'rgba(0, 212, 255, 0.3)' : '#00D4FF'} />
            <Path d="M18.3985 16.125C18.3985 14.6766 19.5751 13.5 21.0235 13.5C22.472 13.5 23.6485 14.6766 23.6485 16.125C23.6485 17.5734 22.472 18.75 21.0235 18.75C19.5751 18.75 18.3985 17.5734 18.3985 16.125ZM18.0235 24.6234L16.9642 25.6828C16.6829 25.9641 16.5235 26.3438 16.5235 26.7422V28.5C16.5235 29.3297 15.8532 30 15.0235 30C14.1938 30 13.5235 29.3297 13.5235 28.5V26.7422C13.5235 25.5469 13.997 24.4031 14.8407 23.5594L16.486 21.9141C17.5548 20.8453 18.9985 20.2453 20.5079 20.2453C22.2376 20.2453 23.8735 21.0328 24.9517 22.3828L25.7954 23.4375C26.0813 23.7937 26.5126 24 26.9673 24H28.5235C29.3532 24 30.0235 24.6703 30.0235 25.5C30.0235 26.3297 29.3532 27 28.5235 27H26.9673C25.5985 27 24.3095 26.3766 23.4517 25.3125L23.2735 25.0922V30.4922L24.8907 31.8797C25.7204 32.5922 26.2642 33.5766 26.4188 34.6594L27.0095 38.7891C27.1267 39.6094 26.5548 40.3688 25.7345 40.4859C24.9142 40.6031 24.1548 40.0312 24.0376 39.2109L23.447 35.0812C23.3954 34.7203 23.2126 34.3922 22.936 34.1531L19.5938 31.2891C18.5954 30.4359 18.0235 29.1844 18.0235 27.8719V24.6234ZM18.0282 32.3906C18.1407 32.4984 18.2532 32.6062 18.3751 32.7094L20.5313 34.5563L20.4282 34.9125C20.2173 35.6484 19.8235 36.3187 19.2845 36.8578L16.0829 40.0594C15.497 40.6453 14.5454 40.6453 13.9595 40.0594C13.3735 39.4734 13.3735 38.5219 13.9595 37.9359L17.161 34.7344C17.3392 34.5562 17.4704 34.3313 17.5407 34.0875L18.0282 32.3906ZM37.1954 31.1719C36.7548 31.6125 36.0423 31.6125 35.6063 31.1719C35.1704 30.7313 35.1657 30.0188 35.6063 29.5828L37.0595 28.1297H32.2735C31.6501 28.1297 31.1485 27.6281 31.1485 27.0047C31.1485 26.3813 31.6501 25.8797 32.2735 25.8797H37.0595L35.6063 24.4266C35.1657 23.9859 35.1657 23.2734 35.6063 22.8375C36.047 22.4016 36.7595 22.3969 37.1954 22.8375L40.5704 26.2125C41.011 26.6531 41.011 27.3656 40.5704 27.8016L37.1954 31.1766V31.1719Z" fill="#0E0E1F" />
        </Svg>
    </TouchableOpacity>
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

export function TimeframeScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const [paceMinutes, setPaceMinutes] = useState('');
    const [paceSeconds, setPaceSeconds] = useState('');
    const [isEditingMinutes, setIsEditingMinutes] = useState(true);
    const [dontKnowPace, setDontKnowPace] = useState(false);

    const handleNumberPress = (num: string) => {
        if (dontKnowPace) return;

        if (isEditingMinutes) {
            if (paceMinutes.length < 2) {
                const newValue = paceMinutes + num;
                setPaceMinutes(newValue);
                // Auto-advance if 2 digits entered
                if (newValue.length === 2) {
                    setIsEditingMinutes(false);
                }
            }
        } else {
            if (paceSeconds.length < 2) {
                setPaceSeconds(paceSeconds + num);
            }
        }
    };

    const handleBackspace = () => {
        if (dontKnowPace) return;

        if (isEditingMinutes) {
            if (paceMinutes.length > 0) {
                setPaceMinutes(paceMinutes.slice(0, -1));
            }
        } else {
            if (paceSeconds.length > 0) {
                setPaceSeconds(paceSeconds.slice(0, -1));
            } else {
                // If seconds empty, go back to minutes
                setIsEditingMinutes(true);
            }
        }
    };

    const handleNext = () => {
        navigation.navigate('Quiz_PlanPreview', { userId });
    };

    const formatTime = (value: string) => {
        if (!value) return '00';
        return value.padStart(2, '0');
    };

    // Valid if both fields have content OR user selected "don't know"
    const canProceed = dontKnowPace || (paceMinutes.length > 0 && paceSeconds.length > 0);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <View style={styles.content}>
                {/* Progress Indicator */}
                <QuizProgressBar currentStep={5} />

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

                {/* Don't know pace checkbox */}
                <Checkbox checked={dontKnowPace} onPress={() => setDontKnowPace(!dontKnowPace)} />

                {/* Numeric Keypad */}
                <View style={styles.keypad}>
                    {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'backspace']].map((row, rowIndex) => (
                        <View key={rowIndex} style={styles.keypadRow}>
                            {row.map((key, keyIndex) => (
                                <TouchableOpacity
                                    key={keyIndex}
                                    style={styles.keypadButton}
                                    onPress={() => {
                                        if (key === 'backspace') {
                                            handleBackspace();
                                        } else if (key !== '') {
                                            handleNumberPress(key);
                                        }
                                    }}
                                    disabled={key === '' || dontKnowPace}
                                    activeOpacity={0.6}
                                >
                                    {key === 'backspace' ? (
                                        <BackspaceIcon />
                                    ) : (
                                        <Text style={[styles.keypadText, dontKnowPace && styles.keypadTextDisabled]}>
                                            {key}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                </View>

                {/* Next Button */}
                <View style={styles.nextButtonContainer}>
                    <NextButton onPress={handleNext} disabled={!canProceed} />
                </View>
            </View>
        </View>
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
