import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { getGoalAchievableCopy } from '../../utils/onboardingCopyMatrix';

const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    cyan: '#00D4FF',
};

export function GoalAchievableScreen() {
    const { data } = useOnboardingStore();
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => sub.remove();
    }, []);

    const { goalLabel, levelLabel, difficulty, realistic } = getGoalAchievableCopy(
        data.goal,
        data.experience_level,
        {
            goalType: data.goal_type,
            raceDistance: data.race_distance,
            raceName: data.race_name,
        },
    );

    // Smooth staggered fade-in. Reduce motion → short fade, no translate.
    const mainEntering = reduceMotion ? FadeIn.duration(150) : FadeIn.duration(500);
    const secondaryEntering = reduceMotion
        ? FadeIn.duration(150)
        : FadeInDown.delay(220).duration(550);

    return (
        <View style={styles.container}>
            <Animated.Text entering={mainEntering} style={styles.mainText}>
                Alcançar a meta de{' '}
                <Text style={styles.highlight}>{goalLabel}</Text>{' '}
                com o nível{' '}
                <Text style={styles.highlight}>{levelLabel}</Text>{' '}
                é uma tarefa{' '}
                <Text style={styles.highlight}>{difficulty}</Text>.{' '}
                É uma meta considerada {realistic}.
            </Animated.Text>

            <Animated.Text entering={secondaryEntering} style={styles.secondaryText}>
                Na RunEasy você recebe um plano partindo de onde você está hoje até a
                conclusão da sua meta, tudo personalizado de acordo com seu objetivo.
            </Animated.Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 28,
        paddingHorizontal: 16,
        gap: 60,
    },
    mainText: {
        fontFamily: 'Poppins-Medium',
        fontSize: 20,
        fontWeight: '500',
        color: DS.text,
        lineHeight: 30,
        textAlign: 'center',
    },
    highlight: {
        color: DS.cyan,
        fontWeight: '600',
    },
    secondaryText: {
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 22.5,
        textAlign: 'center',
    },
});

export default GoalAchievableScreen;
