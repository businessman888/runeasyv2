import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

import LockIcon from '../assets/quiz-icons/lock.svg';
import Step1Icon from '../assets/quiz-icons/step1.svg';
import Step2Icon from '../assets/quiz-icons/step2.svg';
import Step3Icon from '../assets/quiz-icons/step3.svg';
import Step4Icon from '../assets/quiz-icons/step4.svg';
import Step5Icon from '../assets/quiz-icons/step5.svg';
import Step6Icon from '../assets/quiz-icons/step6.svg';

interface QuizProgressBarProps {
    currentStep: number;
    totalSteps?: number;
}

export function QuizProgressBar({ currentStep, totalSteps = 6 }: QuizProgressBarProps) {
    const getStepIcon = (step: number, isActive: boolean) => {
        if (!isActive) return LockIcon;

        switch (step) {
            case 1: return Step1Icon;
            case 2: return Step2Icon;
            case 3: return Step3Icon;
            case 4: return Step4Icon;
            case 5: return Step5Icon;
            case 6: return Step6Icon;
            default: return LockIcon;
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.text}>
                Passo <Text style={styles.activeText}>{currentStep}</Text> DE {totalSteps}
            </Text>

            <View style={styles.stepsContainer}>
                {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
                    const isActive = step <= currentStep;
                    const IconComponent = getStepIcon(step, isActive);

                    return (
                        <View key={step} style={styles.stepItem}>
                            <View style={styles.iconContainer}>
                                <IconComponent
                                    width="100%"
                                    height="100%"
                                    fill={isActive ? '#00D4FF' : '#3A3A3C'}
                                    style={{
                                        opacity: isActive ? 1 : 0.6,
                                    }}
                                />
                            </View>
                            <View style={[
                                styles.bar,
                                isActive && styles.activeBar
                            ]} />
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 32,
    },
    text: {
        color: 'rgba(235, 235, 245, 0.6)',
        fontSize: 13,
        fontWeight: '400',
        marginBottom: 12,
    },
    activeText: {
        color: '#00D4FF',
        fontWeight: '600',
    },
    stepsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    stepItem: {
        flex: 1,
        alignItems: 'center',
    },
    iconContainer: {
        height: 24,
        width: 24,
        marginBottom: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bar: {
        height: 4,
        width: '100%',
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 2,
    },
    activeBar: {
        backgroundColor: '#00D4FF',
    },
});
