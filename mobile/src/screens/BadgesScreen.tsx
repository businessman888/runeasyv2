import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useGamificationStore } from '../stores';
import { ScreenContainer } from '../components/ScreenContainer';
import { BadgeShield } from '../components/BadgeShield';
import {
    BADGE_STAT_LABELS,
    BADGE_TYPE_SECTION_LABELS,
    BADGE_TYPE_ORDER,
} from '../constants/badgeLabels';
import { BADGE_STAT_COLORS } from '../constants/badgeColors';

interface BadgeItem {
    id: string;
    name: string;
    slug: string;
    description: string;
    type: string;
    tier: number;
    xp_reward: number;
    earned: boolean;
    earned_at?: string;
}

interface BadgeDetailModalProps {
    badge: BadgeItem | null;
    onClose: () => void;
}

function BadgeDetailModal({ badge, onClose }: BadgeDetailModalProps) {
    if (!badge) return null;

    const statLabel = BADGE_STAT_LABELS[badge.slug] ?? badge.description;
    const statColor = BADGE_STAT_COLORS[badge.type] ?? colors.primary;
    const earnedDate = badge.earned_at
        ? new Date(badge.earned_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        : null;

    return (
        <Modal transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.modalOverlay} onPress={onClose}>
                <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
                    <BadgeShield
                        type={badge.type}
                        tier={badge.tier}
                        slug={badge.slug}
                        size={96}
                        earned={badge.earned}
                    />

                    <Text style={styles.modalBadgeName}>{badge.name.toUpperCase()}</Text>
                    <Text style={styles.modalDescription}>{badge.description}</Text>

                    <View style={[styles.statPill, { backgroundColor: `${statColor}20` }]}>
                        <Text style={[styles.statPillText, { color: statColor }]}>{statLabel}</Text>
                    </View>

                    <View style={styles.modalMeta}>
                        <View style={styles.modalMetaRow}>
                            <Text style={styles.modalMetaLabel}>XP</Text>
                            <Text style={[styles.modalMetaValue, { color: '#FFD700' }]}>+{badge.xp_reward ?? 100}</Text>
                        </View>
                        <View style={styles.modalMetaRow}>
                            <Text style={styles.modalMetaLabel}>Tier</Text>
                            <Text style={styles.modalMetaValue}>{badge.tier} / 5</Text>
                        </View>
                    </View>

                    {badge.earned && earnedDate ? (
                        <Text style={styles.earnedDateText}>Conquistado em {earnedDate}</Text>
                    ) : (
                        <Text style={styles.lockedHintText}>Continue treinando para desbloquear</Text>
                    )}

                    <TouchableOpacity
                        style={styles.modalCloseButton}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar detalhes do badge"
                    >
                        <Text style={styles.modalCloseText}>Fechar</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

export function BadgesScreen({ navigation }: any) {
    const { badges, stats, fetchBadges, fetchStats, isLoading } = useGamificationStore();
    const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);

    React.useEffect(() => {
        fetchBadges();
        fetchStats();
    }, []);

    const currentLevel = stats?.current_level ?? 1;
    const totalXP = stats?.total_points ?? 0;
    const currentStreak = stats?.current_streak ?? 0;
    const xpToNext = stats?.points_to_next_level ?? 1000;
    const progressPct = Math.min((totalXP / (totalXP + xpToNext)) * 100, 100);

    const getLevelName = (level: number) => {
        if (level === 1) return 'Iniciante';
        if (level <= 3) return 'Corredor Amador';
        if (level <= 5) return 'Corredor Nato';
        if (level <= 10) return 'Atleta';
        return 'Campeão';
    };

    const earnedTotal = useMemo(() => badges.filter(b => b.earned).length, [badges]);
    const totalBadges = badges.length;

    // Group badges by type, preserving display order
    const badgesByType = useMemo(() => {
        const grouped: Record<string, BadgeItem[]> = {};
        for (const type of BADGE_TYPE_ORDER) {
            grouped[type] = badges.filter(b => b.type === type);
        }
        // Any type not in the order goes into a catch-all
        const others = badges.filter(b => !(BADGE_TYPE_ORDER as readonly string[]).includes(b.type));
        if (others.length > 0) grouped['other'] = others;
        return grouped;
    }, [badges]);

    const handleBadgePress = useCallback((badge: BadgeItem) => {
        setSelectedBadge(badge);
    }, []);

    return (
        <ScreenContainer>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation?.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Minhas Conquistas</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Level Card */}
                <View style={styles.levelCard}>
                    <View style={styles.levelCardTopRow}>
                        <View style={styles.levelBadgeChip}>
                            <Text style={styles.levelBadgeChipText}>Nível Atual</Text>
                        </View>
                        <View style={styles.xpChip}>
                            <Ionicons name="flash" size={18} color="#FFD700" />
                            <View>
                                <Text style={styles.xpValue}>{totalXP.toLocaleString('pt-BR')}</Text>
                                <Text style={styles.xpLabel}>xp acumulado</Text>
                            </View>
                        </View>
                    </View>

                    <Text style={styles.levelName}>{getLevelName(currentLevel)}</Text>
                    <Text style={styles.levelNumber}>{currentLevel}</Text>

                    <View style={styles.streakRow}>
                        <Ionicons name="flame" size={18} color={colors.completed} />
                        <Text style={styles.streakText}>Combo: {currentStreak} dias</Text>
                    </View>

                    <View style={styles.progressSection}>
                        <View style={styles.progressLabelRow}>
                            <Text style={styles.progressLabel}>Nível {currentLevel}</Text>
                            <Text style={styles.progressLabel}>Nível {currentLevel + 1}</Text>
                            <Text style={styles.xpRemaining}>{xpToNext} XP restantes</Text>
                        </View>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
                        </View>
                    </View>
                </View>

                {/* Conquistas Header */}
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="trophy" size={20} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Conquistas</Text>
                    </View>
                    <View style={styles.countChip}>
                        <Text style={styles.countChipNumber}>{earnedTotal}</Text>
                        <Text style={styles.countChipTotal}>/{totalBadges} desbloqueados</Text>
                    </View>
                </View>

                {/* Badges grouped by type */}
                {BADGE_TYPE_ORDER.map(type => {
                    const group = badgesByType[type];
                    if (!group || group.length === 0) return null;

                    const groupEarned = group.filter(b => b.earned).length;
                    const statColor = BADGE_STAT_COLORS[type] ?? colors.primary;

                    return (
                        <View key={type} style={styles.categorySection}>
                            <View style={styles.categoryHeader}>
                                <Text style={styles.categoryTitle}>
                                    {BADGE_TYPE_SECTION_LABELS[type] ?? type.toUpperCase()}
                                </Text>
                                <Text style={[styles.categoryCount, { color: statColor }]}>
                                    {groupEarned}/{group.length}
                                </Text>
                            </View>

                            <View style={styles.badgesGrid}>
                                {group.map(badge => {
                                    const stat = BADGE_STAT_LABELS[badge.slug] ?? badge.description;
                                    const sc = BADGE_STAT_COLORS[badge.type] ?? colors.primary;

                                    return (
                                        <TouchableOpacity
                                            key={badge.id}
                                            style={[
                                                styles.badgeCard,
                                                badge.earned && styles.badgeCardEarned,
                                            ]}
                                            onPress={() => handleBadgePress(badge)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Badge ${badge.name}${badge.earned ? ', conquistado' : ', bloqueado'}`}
                                            activeOpacity={0.75}
                                        >
                                            <BadgeShield
                                                type={badge.type}
                                                tier={badge.tier}
                                                slug={badge.slug}
                                                size={56}
                                                earned={badge.earned}
                                            />
                                            <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}>
                                                {badge.name.toUpperCase()}
                                            </Text>
                                            <View style={[styles.statPill, { backgroundColor: `${sc}${badge.earned ? '30' : '12'}` }]}>
                                                <Text style={[styles.statPillText, { color: badge.earned ? sc : 'rgba(235,235,245,0.4)' }]}>
                                                    {stat}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    );
                })}

                <View style={styles.bottomPad} />
            </ScrollView>

            <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },

    // ── Header ───────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    backButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
    },
    headerSpacer: { width: 44 },

    // ── Level Card ───────────────────────────────────────────────────────
    levelCard: {
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.xl,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
    },
    levelCardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.lg,
    },
    levelBadgeChip: {
        borderWidth: 2,
        borderColor: colors.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
    },
    levelBadgeChipText: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
    },
    xpChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 2,
        borderColor: '#FFD700',
        borderRadius: borderRadius.xl,
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    xpValue: {
        fontSize: 20,
        fontWeight: typography.fontWeights.bold,
        color: '#FFD700',
        lineHeight: 24,
        textAlign: 'right',
    },
    xpLabel: {
        fontSize: 10,
        color: '#FFD700',
        textAlign: 'right',
    },
    levelName: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: 2,
    },
    levelNumber: {
        fontSize: 56,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        lineHeight: 64,
        marginBottom: spacing.sm,
    },
    streakRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: spacing.xl,
    },
    streakText: {
        fontSize: typography.fontSizes.base,
        color: colors.completed,
        fontWeight: typography.fontWeights.semibold,
    },
    progressSection: { width: '100%' },
    progressLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.sm,
    },
    progressLabel: {
        fontSize: typography.fontSizes.sm,
        color: colors.text,
        fontWeight: typography.fontWeights.semibold,
    },
    xpRemaining: {
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
        marginLeft: 'auto',
    },
    progressTrack: {
        width: '100%',
        height: 10,
        backgroundColor: `${colors.primary}30`,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: borderRadius.full,
    },

    // ── Section Header ───────────────────────────────────────────────────
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    sectionTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
    },
    countChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.xl,
    },
    countChipNumber: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
    countChipTotal: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },

    // ── Category ─────────────────────────────────────────────────────────
    categorySection: {
        marginBottom: spacing.xl,
    },
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
    },
    categoryTitle: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
        letterSpacing: 1,
    },
    categoryCount: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
    },

    // ── Badges Grid ───────────────────────────────────────────────────────
    badgesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
    },
    badgeCard: {
        width: '47%',
        backgroundColor: '#1C1C2E',
        borderRadius: borderRadius['2xl'],
        padding: spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    badgeCardEarned: {
        borderColor: 'rgba(255,255,255,0.08)',
    },
    badgeName: {
        fontSize: 10,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.sm,
        marginBottom: spacing.xs,
        letterSpacing: 0.5,
    },
    badgeNameLocked: {
        color: 'rgba(235,235,245,0.3)',
    },
    statPill: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: borderRadius.full,
    },
    statPillText: {
        fontSize: 9,
        fontWeight: typography.fontWeights.semibold,
    },

    // ── Detail Modal ──────────────────────────────────────────────────────
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
    },
    modalCard: {
        width: '100%',
        backgroundColor: '#1C1C2E',
        borderRadius: borderRadius['2xl'],
        padding: spacing.xl,
        alignItems: 'center',
        gap: spacing.md,
    },
    modalBadgeName: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        textAlign: 'center',
        letterSpacing: 1,
    },
    modalDescription: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: typography.fontSizes.sm * 1.5,
    },
    modalMeta: {
        flexDirection: 'row',
        gap: spacing.xl,
        marginTop: spacing.xs,
    },
    modalMetaRow: {
        alignItems: 'center',
        gap: 2,
    },
    modalMetaLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    modalMetaValue: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    earnedDateText: {
        fontSize: typography.fontSizes.xs,
        color: colors.completed,
        fontWeight: typography.fontWeights.medium,
    },
    lockedHintText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235,235,245,0.4)',
        textAlign: 'center',
    },
    modalCloseButton: {
        marginTop: spacing.sm,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: colors.primary,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCloseText: {
        fontSize: typography.fontSizes.base,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
    },

    bottomPad: { height: 120 },
});
