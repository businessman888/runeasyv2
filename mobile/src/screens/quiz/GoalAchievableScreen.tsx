import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { getGoalAchievableCopy } from '../../utils/onboardingCopyMatrix';

const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    cyan: '#00D4FF',
};

export function GoalAchievableScreen() {
    const { data } = useOnboardingStore();
    const { goalLabel, levelLabel, difficulty, realistic } = getGoalAchievableCopy(
        data.goal,
        data.experience_level,
        {
            goalType: data.goal_type,
            raceDistance: data.race_distance,
            raceName: data.race_name,
        },
    );

    return (
        <View style={styles.container}>
            <Text style={styles.mainText}>
                Alcançar a meta de{' '}
                <Text style={styles.highlight}>{goalLabel}</Text>{' '}
                com o nível{' '}
                <Text style={styles.highlight}>{levelLabel}</Text>{' '}
                é uma tarefa{' '}
                <Text style={styles.highlight}>{difficulty}</Text>.{' '}
                É uma meta considerada {realistic}.
            </Text>

            <Text style={styles.secondaryText}>
                90% dos usuários dizem que as suas metas são batidas em menos tempo
                e com extrema tranquilidade após usarem a RunEasy. Alcançando cada
                vez mais níveis mais altos de distância, com menos tempo e com 0 lesões.
            </Text>
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
