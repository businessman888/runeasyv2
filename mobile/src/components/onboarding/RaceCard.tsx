import React, { memo } from 'react';
import { View, Text, StyleSheet, ImageBackground, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import type { Race } from '../../types/races.types';
import { formatRaceDateShort, formatDistances, raceLevelLabel } from '../../utils/raceFormat';

interface RaceCardProps {
    race: Race;
    onPress: (race: Race) => void;
}

function RaceCardComponent({ race, onPress }: RaceCardProps) {
    useThemeSubscription();
    const imageUri = race.image_url || race.image_thumbnail_url || undefined;
    const location = [race.city, race.country].filter(Boolean).join(', ');

    return (
        <Pressable
            onPress={() => onPress(race)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${race.name}, ${formatRaceDateShort(race.race_date)}`}
        >
            <ImageBackground
                source={imageUri ? { uri: imageUri } : undefined}
                style={styles.image}
                imageStyle={styles.imageRadius}
            >
                {/* Dark gradient so text stays legible over any photo */}
                <LinearGradient
                    colors={[semanticColors.transparent, semanticColors.canvas]}
                    locations={[0, 1]}
                    style={StyleSheet.absoluteFill}
                />
                {!imageUri && <View style={styles.fallbackBg} />}

                <View style={styles.content}>
                    <View style={styles.textBlock}>
                        <Text style={styles.metaLine} numberOfLines={1}>
                            {formatRaceDateShort(race.race_date)} · {formatDistances(race)}
                        </Text>
                        <Text style={styles.name} numberOfLines={2}>
                            {race.name}
                        </Text>
                        <Text style={styles.location} numberOfLines={1}>
                            {location}
                            {race.level ? ` · ${raceLevelLabel(race.level)}` : ''}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color={colors.white} />
                </View>
            </ImageBackground>
        </Pressable>
    );
}

export const RaceCard = memo(RaceCardComponent);

const styles = createThemeStyles(() => ({
    card: {
        borderRadius: borderRadius.xl,
        overflow: 'hidden',
        marginBottom: 12,
        backgroundColor: semanticColors.surface2,
    },
    pressed: { opacity: 0.85 },
    image: {
        minHeight: 116,
        justifyContent: 'flex-end',
    },
    imageRadius: { borderRadius: borderRadius.xl },
    fallbackBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: semanticColors.surface2,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    textBlock: { flex: 1 },
    metaLine: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        marginBottom: 4,
    },
    name: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: semanticColors.textPrimary,
        marginBottom: 2,
    },
    location: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
    },
}));

export default RaceCard;
