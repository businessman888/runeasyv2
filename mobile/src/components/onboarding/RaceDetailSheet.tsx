import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    ScrollView,
    ImageBackground,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius } from '../../theme';
import type { Race } from '../../types/races.types';
import { formatRaceDateLong, raceLevelLabel } from '../../utils/raceFormat';
import { RaceDistanceSelectorSheet } from './RaceDistanceSelectorSheet';

interface RaceDetailSheetProps {
    race: Race | null;
    visible: boolean;
    onClose: () => void;
    /** Called with the chosen distance once the user confirms. */
    onConfirm: (race: Race, distance: number) => void;
}

const TERRAIN_LABELS: Record<string, string> = {
    road: 'Asfalto',
    trail: 'Trilha',
    track: 'Pista',
    mixed: 'Misto',
};

export function RaceDetailSheet({ race, visible, onClose, onConfirm }: RaceDetailSheetProps) {
    const insets = useSafeAreaInsets();
    const [distanceSheetOpen, setDistanceSheetOpen] = useState(false);

    if (!race) return null;

    const imageUri = race.image_url || race.image_thumbnail_url || undefined;
    const location = [race.city, race.state, race.country].filter(Boolean).join(', ');
    const multipleDistances = (race.distances?.length ?? 0) > 1;

    const handleSelect = () => {
        if (multipleDistances) {
            setDistanceSheetOpen(true);
        } else {
            onConfirm(race, race.distances?.[0] ?? race.main_distance);
        }
    };

    const openUrl = (url?: string | null) => {
        if (url) Linking.openURL(url).catch(() => undefined);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    <ImageBackground
                        source={imageUri ? { uri: imageUri } : undefined}
                        style={styles.image}
                        imageStyle={styles.imageRadius}
                    >
                        <LinearGradient
                            colors={['rgba(10,10,24,0.1)', 'rgba(14,14,31,1)']}
                            locations={[0, 1]}
                            style={StyleSheet.absoluteFill}
                        />
                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Fechar"
                        >
                            <Ionicons name="close" size={22} color={colors.white} />
                        </TouchableOpacity>
                    </ImageBackground>

                    <View style={styles.body}>
                        <Text style={styles.name}>{race.name}</Text>

                        <View style={styles.pills}>
                            {(race.distances_labels?.length
                                ? race.distances_labels
                                : race.distances.map((d) => `${d}km`)
                            ).map((label, i) => (
                                <View key={`${label}-${i}`} style={styles.pill}>
                                    <Text style={styles.pillText}>{label}</Text>
                                </View>
                            ))}
                        </View>

                        <InfoRow icon="calendar-outline" text={formatRaceDateLong(race.race_date)} />
                        <InfoRow icon="location-outline" text={location || '—'} />
                        {race.terrain && (
                            <InfoRow
                                icon="trail-sign-outline"
                                text={TERRAIN_LABELS[race.terrain] ?? race.terrain}
                            />
                        )}
                        <InfoRow icon="speedometer-outline" text={raceLevelLabel(race.level)} />

                        {!!race.description && (
                            <Text style={styles.description}>{race.description}</Text>
                        )}

                        {!!(race.registration_url || race.official_website) && (
                            <TouchableOpacity
                                style={styles.linkRow}
                                onPress={() => openUrl(race.registration_url || race.official_website)}
                                accessibilityRole="link"
                            >
                                <Ionicons name="globe-outline" size={18} color={colors.textLight} />
                                <Text style={styles.linkText}>Visitar site</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.cta}
                        onPress={handleSelect}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Selecionar esta prova"
                    >
                        <Text style={styles.ctaText}>Selecionar esta prova</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <RaceDistanceSelectorSheet
                visible={distanceSheetOpen}
                distances={race.distances ?? []}
                labels={race.distances_labels ?? undefined}
                onClose={() => setDistanceSheetOpen(false)}
                onConfirm={(distance) => {
                    setDistanceSheetOpen(false);
                    onConfirm(race, distance);
                }}
            />
        </Modal>
    );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={icon} size={18} color={colors.textSecondary} />
            <Text style={styles.infoText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '90%',
        backgroundColor: colors.cardDark,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        overflow: 'hidden',
    },
    image: { height: 200, justifyContent: 'flex-start' },
    imageRadius: {
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
    },
    closeBtn: {
        margin: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: { paddingHorizontal: 20, paddingTop: 16 },
    name: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: 14,
    },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
    pill: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: borderRadius.full,
        backgroundColor: colors.card,
    },
    pillText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: colors.textLight,
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    infoText: {
        fontSize: typography.fontSizes.lg,
        color: colors.textLight,
        flex: 1,
    },
    description: {
        fontSize: typography.fontSizes.md,
        lineHeight: 20,
        color: colors.textSecondary,
        marginTop: 8,
        marginBottom: 16,
    },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    linkText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textLight,
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    cta: {
        height: 56,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaText: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.semibold,
        color: '#0F0F1E',
    },
});

export default RaceDetailSheet;
