import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { ScreenContainer } from '../components/ScreenContainer';
import { CustomCalendar } from '../components/CustomCalendar';
import { WorkoutCreatedPopup } from '../components/WorkoutCreatedPopup';
import { useTrainingStore, type ManualWorkoutDto } from '../stores/trainingStore';

type ManualType = 'easy_run' | 'long_run' | 'intervals' | 'fartlek' | 'tempo' | 'recovery' | 'progressive';

interface TypeConfig {
    id: ManualType;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    description: string;
    distanceMin: number; // km
    distanceMax: number;
    distanceDefault: number;
    paceMinSec: number; // seconds per km (faster)
    paceMaxSec: number; // (slower)
    paceDefaultSec: number;
}

const TYPES: TypeConfig[] = [
    {
        id: 'easy_run',
        label: 'Rodagem',
        icon: 'run',
        description: 'Corrida tranquila para volume base',
        distanceMin: 3, distanceMax: 12, distanceDefault: 6,
        paceMinSec: 270, paceMaxSec: 450, paceDefaultSec: 360, // 4:30-7:30, default 6:00
    },
    {
        id: 'long_run',
        label: 'Longão',
        icon: 'road-variant',
        description: 'Distância longa em ritmo confortável',
        distanceMin: 10, distanceMax: 42, distanceDefault: 15,
        paceMinSec: 300, paceMaxSec: 480, paceDefaultSec: 390, // 5:00-8:00, default 6:30
    },
    {
        id: 'intervals',
        label: 'Intervalados',
        icon: 'lightning-bolt',
        description: 'Tiros curtos e rápidos com recuperação',
        distanceMin: 2, distanceMax: 10, distanceDefault: 5,
        paceMinSec: 180, paceMaxSec: 360, paceDefaultSec: 270, // 3:00-6:00, default 4:30
    },
    {
        id: 'fartlek',
        label: 'Fartlek',
        icon: 'speedometer',
        description: 'Variação livre de ritmo (jogo de velocidade)',
        distanceMin: 3, distanceMax: 15, distanceDefault: 7,
        paceMinSec: 210, paceMaxSec: 420, paceDefaultSec: 330, // 3:30-7:00, default 5:30
    },
    {
        id: 'tempo',
        label: 'Tempo',
        icon: 'timer-sand',
        description: 'Ritmo limiar sustentado',
        distanceMin: 3, distanceMax: 15, distanceDefault: 8,
        paceMinSec: 210, paceMaxSec: 390, paceDefaultSec: 300, // 3:30-6:30, default 5:00
    },
    {
        id: 'recovery',
        label: 'Recuperação',
        icon: 'leaf',
        description: 'Trote leve para regenerar',
        distanceMin: 2, distanceMax: 8, distanceDefault: 4,
        paceMinSec: 330, paceMaxSec: 540, paceDefaultSec: 420, // 5:30-9:00, default 7:00
    },
    {
        id: 'progressive',
        label: 'Progressivo',
        icon: 'trending-up',
        description: 'Aumenta o ritmo gradualmente',
        distanceMin: 5, distanceMax: 20, distanceDefault: 10,
        paceMinSec: 210, paceMaxSec: 450, paceDefaultSec: 330, // 3:30-7:30, default 5:30
    },
];

function paceToString(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDateLabel(date: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 3600 * 1000));
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Amanhã';
    return target.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
}

function dateToISODate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function ManualWorkoutConfigScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const createManualWorkout = useTrainingStore((s) => s.createManualWorkout);

    const [typeId, setTypeId] = useState<ManualType>('easy_run');
    const config = useMemo(() => TYPES.find((t) => t.id === typeId)!, [typeId]);

    const [distance, setDistance] = useState<number>(config.distanceDefault);
    const [paceSec, setPaceSec] = useState<number>(config.paceDefaultSec);
    const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
    const [showPicker, setShowPicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);

    const handleTypeChange = (newType: ManualType) => {
        const newConfig = TYPES.find((t) => t.id === newType)!;
        setTypeId(newType);
        // Reseta valores pra defaults do tipo (e clampa se já tiverem fora do range)
        setDistance(newConfig.distanceDefault);
        setPaceSec(newConfig.paceDefaultSec);
    };

    const adjustDistance = (delta: number) => {
        const next = Math.round((distance + delta) * 10) / 10;
        if (next < config.distanceMin || next > config.distanceMax) return;
        setDistance(next);
    };

    const adjustPace = (delta: number) => {
        const next = paceSec + delta;
        if (next < config.paceMinSec || next > config.paceMaxSec) return;
        setPaceSec(next);
    };

    const totalDurationSec = Math.round(distance * paceSec);

    const formatTotal = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
        return `${m}min ${String(s).padStart(2, '0')}s`;
    };

    const handleSave = async () => {
        if (submitting) return;
        const dto: ManualWorkoutDto = {
            title: `${config.label} - ${distance.toFixed(1).replace(/\.0$/, '')}km`,
            type: typeId,
            scheduled_date: dateToISODate(scheduledDate),
            distance_km: distance,
            target_pace_seconds: paceSec,
            target_duration_seconds: totalDurationSec,
        };

        setSubmitting(true);
        try {
            await createManualWorkout(dto);
            setShowSuccessPopup(true);
        } catch (e: any) {
            Alert.alert('Erro', e?.message || 'Não foi possível criar o treino manual');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSuccessClose = () => {
        setShowSuccessPopup(false);
        navigation.goBack();
    };

    return (
        <ScreenContainer style={{ paddingTop: 0 }}>
            <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={26} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Treino Manual</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Tipo de treino */}
                <Text style={styles.sectionLabel}>Tipo de treino</Text>
                <View style={styles.typeGrid}>
                    {TYPES.map((t) => {
                        const active = t.id === typeId;
                        return (
                            <TouchableOpacity
                                key={t.id}
                                style={[styles.typeCard, active && styles.typeCardActive]}
                                onPress={() => handleTypeChange(t.id)}
                                activeOpacity={0.85}
                            >
                                <MaterialCommunityIcons
                                    name={t.icon}
                                    size={26}
                                    color={active ? colors.background : colors.primary}
                                />
                                <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{t.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.typeDescription}>{config.description}</Text>

                {/* Distância */}
                <View style={styles.controlBlock}>
                    <View style={styles.controlHeader}>
                        <Text style={styles.controlLabel}>Distância</Text>
                        <Text style={styles.controlRange}>
                            {config.distanceMin}–{config.distanceMax} km
                        </Text>
                    </View>
                    <View style={styles.stepperRow}>
                        <TouchableOpacity
                            style={[styles.stepBtn, distance <= config.distanceMin && styles.stepBtnDisabled]}
                            onPress={() => adjustDistance(-0.5)}
                        >
                            <Ionicons name="remove" size={22} color={colors.text} />
                        </TouchableOpacity>
                        <View style={styles.valueDisplay}>
                            <Text style={styles.valueText}>{distance.toFixed(1)}</Text>
                            <Text style={styles.valueUnit}>km</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.stepBtn, distance >= config.distanceMax && styles.stepBtnDisabled]}
                            onPress={() => adjustDistance(0.5)}
                        >
                            <Ionicons name="add" size={22} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Pace */}
                <View style={styles.controlBlock}>
                    <View style={styles.controlHeader}>
                        <Text style={styles.controlLabel}>Pace alvo</Text>
                        <Text style={styles.controlRange}>
                            {paceToString(config.paceMinSec)}–{paceToString(config.paceMaxSec)} /km
                        </Text>
                    </View>
                    <View style={styles.stepperRow}>
                        <TouchableOpacity
                            style={[styles.stepBtn, paceSec >= config.paceMaxSec && styles.stepBtnDisabled]}
                            onPress={() => adjustPace(15)}
                        >
                            <Ionicons name="remove" size={22} color={colors.text} />
                        </TouchableOpacity>
                        <View style={styles.valueDisplay}>
                            <Text style={styles.valueText}>{paceToString(paceSec)}</Text>
                            <Text style={styles.valueUnit}>min/km</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.stepBtn, paceSec <= config.paceMinSec && styles.stepBtnDisabled]}
                            onPress={() => adjustPace(-15)}
                        >
                            <Ionicons name="add" size={22} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.paceHint}>
                        Esquerda diminui o ritmo (mais devagar) · Direita aumenta (mais rápido)
                    </Text>
                </View>

                {/* Data */}
                <View style={styles.controlBlock}>
                    <View style={styles.controlHeader}>
                        <Text style={styles.controlLabel}>Data</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => setShowPicker(true)}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                        <Text style={styles.dateButtonText}>{formatDateLabel(scheduledDate)}</Text>
                        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <CustomCalendar
                        visible={showPicker}
                        selectedDate={scheduledDate}
                        onDateSelect={setScheduledDate}
                        onClose={() => setShowPicker(false)}
                        minDate={new Date()}
                    />
                </View>

                {/* Resumo */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resumo</Text>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Duração estimada</Text>
                        <Text style={styles.summaryValue}>{formatTotal(totalDurationSec)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Distância × pace</Text>
                        <Text style={styles.summaryValue}>
                            {distance.toFixed(1)}km × {paceToString(paceSec)}/km
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* Footer fixo */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
                <TouchableOpacity
                    style={[styles.saveBtn, submitting && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={submitting}
                    activeOpacity={0.85}
                >
                    {submitting ? (
                        <ActivityIndicator color={colors.background} />
                    ) : (
                        <Text style={styles.saveBtnText}>Salvar treino</Text>
                    )}
                </TouchableOpacity>
            </View>

            <WorkoutCreatedPopup
                visible={showSuccessPopup}
                onClose={handleSuccessClose}
            />
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: colors.text,
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
    },
    content: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
    },
    sectionLabel: {
        color: colors.textSecondary,
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.md,
    },
    typeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    typeCard: {
        flexBasis: '31%',
        flexGrow: 1,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    typeCardActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        ...shadows.neon,
    },
    typeLabel: {
        marginTop: spacing.xs,
        color: colors.text,
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold,
        textAlign: 'center',
    },
    typeLabelActive: {
        color: colors.background,
    },
    typeDescription: {
        color: colors.textSecondary,
        fontSize: typography.fontSizes.md,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    controlBlock: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: spacing.base,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    controlHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    controlLabel: {
        color: colors.text,
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
    },
    controlRange: {
        color: colors.textSecondary,
        fontSize: typography.fontSizes.sm,
    },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    stepBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.cardDark,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    stepBtnDisabled: {
        opacity: 0.35,
    },
    valueDisplay: {
        alignItems: 'center',
    },
    valueText: {
        color: colors.primary,
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        lineHeight: 36,
    },
    valueUnit: {
        color: colors.textSecondary,
        fontSize: typography.fontSizes.sm,
        marginTop: 2,
    },
    paceHint: {
        marginTop: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.fontSizes.xs,
        textAlign: 'center',
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.cardDark,
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.base,
        borderWidth: 1,
        borderColor: colors.border,
    },
    dateButtonText: {
        flex: 1,
        color: colors.text,
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        textTransform: 'capitalize',
    },
    summaryCard: {
        backgroundColor: colors.cardDark,
        borderRadius: borderRadius.xl,
        padding: spacing.base,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    summaryTitle: {
        color: colors.textSecondary,
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.xs,
    },
    summaryLabel: {
        color: colors.textLight,
        fontSize: typography.fontSizes.md,
    },
    summaryValue: {
        color: colors.text,
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    saveBtn: {
        backgroundColor: colors.primary,
        paddingVertical: spacing.base,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        ...shadows.neon,
    },
    saveBtnText: {
        color: colors.background,
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
    },
});
