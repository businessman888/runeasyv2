import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ScrollView,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../theme';
import { ScreenContainer } from '../components/ScreenContainer';
import { BASE_API_URL } from '../config/api.config';
import * as Storage from '../utils/storage';
import { useNavigation, useRoute } from '@react-navigation/native';

// Interfaces
interface CustomizeGoalScreenParams {
    retrospectiveId: string;
}

export function CustomizeGoalScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const params = route.params as CustomizeGoalScreenParams;
    const { retrospectiveId } = params || {};
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(false);

    // Form State
    const [distanceGoal, setDistanceGoal] = useState<string | null>(null); // '5k', '10k', '21km', '42km'
    const [durationWeeks, setDurationWeeks] = useState(8);
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [targetTime, setTargetTime] = useState(''); // HH:MM:SS
    const [targetPace, setTargetPace] = useState('06:00'); // MM:SS

    // Selection Options
    const distances = [
        { id: '5k', label: '5km' },
        { id: '10k', label: '10km' },
        { id: '21km', label: '21km' },
        { id: '42km', label: '42km' },
    ];

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const toggleDay = (day: string) => {
        if (selectedDays.includes(day)) {
            setSelectedDays(selectedDays.filter(d => d !== day));
        } else {
            setSelectedDays([...selectedDays, day]);
        }
    };

    const adjustPace = (seconds: number) => {
        const [mins, secs] = targetPace.split(':').map(Number);
        const totalSeconds = mins * 60 + secs + seconds;
        const newMins = Math.floor(totalSeconds / 60);
        const newSecs = totalSeconds % 60;
        setTargetPace(`${String(newMins).padStart(2, '0')}:${String(newSecs).padStart(2, '0')}`);
    };

    const handleGeneratePlan = async () => {
        if (!distanceGoal || selectedDays.length === 0) {
            Alert.alert('Campos obrigatórios', 'Selecione uma meta de distância e pelo menos um dia de treino.');
            return;
        }

        setLoading(true);
        try {
            const userId = await Storage.getItemAsync('user_id');
            const data = {
                distance_goal: distanceGoal,
                time_goal: targetTime || undefined, // Optional
                duration_weeks: durationWeeks,
                training_days: selectedDays,
                target_pace: targetPace,
            };

            const response = await fetch(`${BASE_API_URL}/training/retrospective/${retrospectiveId}/customize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || '',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) throw new Error('Falha ao gerar plano');

            // Success: Reset to Home
            (navigation as any).reset({
                index: 0,
                routes: [{ name: 'MainTabs' }],
            });
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Não foi possível gerar o plano. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenContainer>
            <View style={[styles.header, { marginTop: insets.top }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Personalizar Metas</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Distance Goal */}
                <Text style={styles.sectionTitle}>Nova Meta de Distância</Text>
                <View style={styles.pillsContainer}>
                    {distances.map((dist) => (
                        <TouchableOpacity
                            key={dist.id}
                            style={[
                                styles.pill,
                                distanceGoal === dist.id && styles.pillActive,
                            ]}
                            onPress={() => setDistanceGoal(dist.id)}
                        >
                            <Text style={[
                                styles.pillText,
                                distanceGoal === dist.id && styles.pillTextActive,
                            ]}>{dist.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Target Time (Optional) */}
                <Text style={styles.sectionTitle}>Tempo Alvo (Opcional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="00:00:00"
                    placeholderTextColor={colors.textSecondary}
                    value={targetTime}
                    onChangeText={setTargetTime}
                    keyboardType="numeric"
                />

                {/* Duration Slider/Selector */}
                <Text style={styles.sectionTitle}>Duração do Ciclo</Text>
                <View style={styles.durationControl}>
                    <TouchableOpacity onPress={() => setDurationWeeks(Math.max(4, durationWeeks - 1))}>
                        <Ionicons name="remove-circle-outline" size={32} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.durationValue}>{durationWeeks} semanas</Text>
                    <TouchableOpacity onPress={() => setDurationWeeks(Math.min(16, durationWeeks + 1))}>
                        <Ionicons name="add-circle-outline" size={32} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Training Days */}
                <Text style={styles.sectionTitle}>Dias de Treino ({selectedDays.length})</Text>
                <View style={styles.daysContainer}>
                    {weekDays.map((day) => (
                        <TouchableOpacity
                            key={day}
                            style={[
                                styles.dayCircle,
                                selectedDays.includes(day) && styles.dayCircleActive,
                            ]}
                            onPress={() => toggleDay(day)}
                        >
                            <Text style={[
                                styles.dayText,
                                selectedDays.includes(day) && styles.dayTextActive,
                            ]}>{day.charAt(0)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Target Pace */}
                <Text style={styles.sectionTitle}>Pace Alvo (min/km)</Text>
                <View style={styles.paceControl}>
                    <TouchableOpacity onPress={() => adjustPace(5)}>
                        <Ionicons name="add" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.paceValue}>{targetPace}</Text>
                    <TouchableOpacity onPress={() => adjustPace(-5)}>
                        <Ionicons name="remove" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.helperText}>Use + para ficar mais lento, - para mais rápido</Text>

            </ScrollView>

            {/* Submit Button */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        (!distanceGoal || selectedDays.length === 0) && styles.disabledButton
                    ]}
                    onPress={handleGeneratePlan}
                    disabled={!distanceGoal || selectedDays.length === 0 || loading}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.background} />
                    ) : (
                        <Text style={styles.submitButtonText}>Gerar Novo Plano</Text>
                    )}
                </TouchableOpacity>
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },
    backButton: {
        padding: spacing.xs,
    },
    headerTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
        marginLeft: spacing.md,
    },
    content: {
        padding: spacing.md,
        paddingBottom: 100,
    },
    sectionTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.medium,
        color: colors.text,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    pillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    pill: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
    },
    pillActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    pillText: {
        fontSize: typography.fontSizes.base,
        color: colors.text,
    },
    pillTextActive: {
        color: colors.background,
        fontWeight: 'bold',
    },
    input: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        color: colors.text,
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        textAlign: 'center',
    },
    durationControl: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        backgroundColor: colors.card,
        padding: spacing.md,
        borderRadius: borderRadius.md,
    },
    durationValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
    daysContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dayCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    dayCircleActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    dayText: {
        fontSize: typography.fontSizes.sm,
        color: colors.text,
    },
    dayTextActive: {
        color: colors.background,
        fontWeight: 'bold',
    },
    paceControl: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        backgroundColor: colors.card,
        padding: spacing.md,
        borderRadius: borderRadius.md,
    },
    paceValue: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        fontVariant: ['tabular-nums'],
    },
    helperText: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.xs,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.md,
    },
    submitButton: {
        backgroundColor: colors.primary,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: colors.border,
        opacity: 0.5,
    },
    submitButtonText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.background,
    },
});
