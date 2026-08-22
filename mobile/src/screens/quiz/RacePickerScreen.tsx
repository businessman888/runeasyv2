import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    Pressable,
    Alert,
    Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius, fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useRaces } from '../../hooks/useRaces';
import { RaceCard } from '../../components/onboarding/RaceCard';
import { RaceDetailSheet } from '../../components/onboarding/RaceDetailSheet';
import type { Race } from '../../types/races.types';
import { weeksUntilRace } from '../../utils/raceFormat';

const MIN_WEEKS = 4;
const WARN_WEEKS = 8;

const DISTANCE_OPTIONS = [
    { label: 'Todas', value: undefined },
    { label: '5km', value: 5 },
    { label: '10km', value: 10 },
    { label: '21km', value: 21.1 },
    { label: '42km', value: 42.2 },
];

const STATE_OPTIONS = ['Todos', 'SP', 'RJ', 'MG', 'RS', 'SC', 'PR', 'BA', 'PE', 'CE', 'DF', 'GO'];

const DATE_OPTIONS = [
    { label: 'Qualquer', months: undefined },
    { label: 'Próximos 3 meses', months: 3 },
    { label: 'Próximos 6 meses', months: 6 },
    { label: 'Próximos 12 meses', months: 12 },
];

type FilterKey = 'distance' | 'state' | 'date' | null;

interface RacePickerScreenProps {
    onAdvance?: () => void;
}

export function RacePickerScreen({ onAdvance }: RacePickerScreenProps) {
    const updateData = useOnboardingStore((s) => s.updateData);

    const [search, setSearch] = useState('');
    const [distance, setDistance] = useState<number | undefined>(undefined);
    const [state, setState] = useState<string | undefined>(undefined);
    const [dateMonths, setDateMonths] = useState<number | undefined>(undefined);
    const [openFilter, setOpenFilter] = useState<FilterKey>(null);
    const [detailRace, setDetailRace] = useState<Race | null>(null);

    // Dismiss the keyboard first so the tap that opens the sheet isn't "eaten"
    // dismissing the search keyboard (which felt like needing a double tap).
    const openDetail = (race: Race) => {
        Keyboard.dismiss();
        setDetailRace(race);
    };

    const dateTo = useMemo(() => {
        if (!dateMonths) return undefined;
        const d = new Date();
        d.setMonth(d.getMonth() + dateMonths);
        return d.toISOString().split('T')[0];
    }, [dateMonths]);

    const { races, loading, error } = useRaces({ search, distance, state, dateTo, limit: 50 });

    const confirmRace = (race: Race, chosenDistance: number) => {
        const weeks = weeksUntilRace(race.race_date);
        if (weeks < MIN_WEEKS) {
            Alert.alert(
                'Prova muito próxima',
                'Esta prova está muito próxima para gerar um plano eficaz. Escolha uma prova com pelo menos 4 semanas de antecedência.',
            );
            return;
        }

        const save = () => {
            updateData({
                goal_type: 'race',
                race_id: race.id,
                race_date: race.race_date,
                race_name: race.name,
                race_distance: chosenDistance,
                use_manual_race_date: false,
            });
            setDetailRace(null);
            onAdvance?.();
        };

        if (weeks < WARN_WEEKS) {
            Alert.alert(
                'Prazo curto',
                'Com menos de 8 semanas, o plano será mais intenso. Deseja continuar?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Continuar', onPress: save },
                ],
            );
            return;
        }
        save();
    };

    const handleManual = () => {
        updateData({ goal_type: 'race', use_manual_race_date: true, race_id: null });
        onAdvance?.();
    };

    return (
        <View style={styles.container}>
            {/* Search */}
            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color={colors.textSecondary} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar por nome, cidade..."
                    placeholderTextColor={colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                    accessibilityLabel="Buscar prova"
                />
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
                <FilterPill
                    label={distance ? DISTANCE_OPTIONS.find((o) => o.value === distance)?.label ?? 'Distância' : 'Distância'}
                    active={distance != null}
                    onPress={() => setOpenFilter('distance')}
                />
                <FilterPill
                    label={state ?? 'Estado'}
                    active={!!state}
                    onPress={() => setOpenFilter('state')}
                />
                <FilterPill
                    label={dateMonths ? DATE_OPTIONS.find((o) => o.months === dateMonths)?.label ?? 'Data' : 'Data'}
                    active={!!dateMonths}
                    onPress={() => setOpenFilter('date')}
                />
            </View>

            <View style={styles.divider} />

            {/* List states */}
            {loading && (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            )}
            {!loading && error && (
                <Text style={styles.muted}>Não foi possível carregar as provas. Tente novamente.</Text>
            )}
            {!loading && !error && races.length === 0 && (
                <Text style={styles.muted}>Nenhuma prova encontrada com esses filtros.</Text>
            )}
            {!loading && !error &&
                races.map((race) => (
                    <RaceCard key={race.id} race={race} onPress={openDetail} />
                ))}

            {/* Manual fallback */}
            <TouchableOpacity
                style={styles.manualCard}
                onPress={handleManual}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Não encontrou sua prova? Inserir data manualmente"
            >
                <Text style={styles.flag}>🏁</Text>
                <View style={styles.manualText}>
                    <Text style={styles.manualTitle}>Não encontrou sua prova?</Text>
                    <Text style={styles.manualSubtitle}>Inserir data manualmente</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Detail sheet */}
            <RaceDetailSheet
                race={detailRace}
                visible={!!detailRace}
                onClose={() => setDetailRace(null)}
                onConfirm={confirmRace}
            />

            {/* Filter sheets */}
            <OptionSheet
                visible={openFilter === 'distance'}
                title="Distância"
                options={DISTANCE_OPTIONS.map((o) => o.label)}
                onClose={() => setOpenFilter(null)}
                onSelect={(i) => {
                    setDistance(DISTANCE_OPTIONS[i].value);
                    setOpenFilter(null);
                }}
            />
            <OptionSheet
                visible={openFilter === 'state'}
                title="Estado"
                options={STATE_OPTIONS}
                onClose={() => setOpenFilter(null)}
                onSelect={(i) => {
                    setState(i === 0 ? undefined : STATE_OPTIONS[i]);
                    setOpenFilter(null);
                }}
            />
            <OptionSheet
                visible={openFilter === 'date'}
                title="Data"
                options={DATE_OPTIONS.map((o) => o.label)}
                onClose={() => setOpenFilter(null)}
                onSelect={(i) => {
                    setDateMonths(DATE_OPTIONS[i].months);
                    setOpenFilter(null);
                }}
            />
        </View>
    );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity
            style={[styles.pill, active && styles.pillActive]}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                {label}
            </Text>
            <Ionicons
                name="chevron-down"
                size={14}
                color={active ? colors.primary : colors.textSecondary}
            />
        </TouchableOpacity>
    );
}

function OptionSheet({
    visible,
    title,
    options,
    onSelect,
    onClose,
}: {
    visible: boolean;
    title: string;
    options: string[];
    onSelect: (index: number) => void;
    onClose: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.optionSheet}>
                <Text style={styles.optionTitle}>{title}</Text>
                {options.map((opt, i) => (
                    <TouchableOpacity
                        key={opt}
                        style={styles.optionRow}
                        onPress={() => onSelect(i)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.optionText}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        paddingHorizontal: 16,
        height: 56,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
        padding: 0,
    },
    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: 'transparent',
        flexShrink: 1,
    },
    pillActive: { borderColor: semanticColors.accent, backgroundColor: semanticColors.accentSubtle },
    pillText: { fontSize: typography.fontSizes.md, color: colors.textSecondary, flexShrink: 1 },
    pillTextActive: { color: colors.primary },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 16 },
    center: { paddingVertical: 32, alignItems: 'center' },
    muted: {
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingVertical: 24,
    },
    manualCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 16,
        marginTop: 4,
    },
    flag: { fontSize: 24 },
    manualText: { flex: 1 },
    manualTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    manualSubtitle: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        marginTop: 2,
    },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: semanticColors.scrim },
    optionSheet: {
        position: 'absolute',
        left: 20,
        right: 20,
        top: '30%',
        backgroundColor: colors.cardDark,
        borderRadius: borderRadius.xl,
        paddingVertical: 8,
    },
    optionTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    optionRow: { paddingHorizontal: 20, paddingVertical: 14 },
    optionText: { fontSize: typography.fontSizes.lg, color: colors.textLight },
});

export default RacePickerScreen;
