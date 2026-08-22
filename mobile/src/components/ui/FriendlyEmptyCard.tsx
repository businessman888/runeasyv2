import React, { memo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

/**
 * Friendly empty-state card for the "Atividades" tab — shown when the user has
 * no manual/free workouts (or no results) for the selected day. Intentionally
 * warm and non-blocking (unlike the Pro "locked" cards), since activities are
 * available to every user regardless of subscription.
 */

interface FriendlyEmptyCardProps {
    title: string;
    subtitle?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    style?: StyleProp<ViewStyle>;
}

function FriendlyEmptyCardInner({
    title,
    subtitle,
    icon = 'sparkles-outline',
    style,
}: FriendlyEmptyCardProps) {
    return (
        <View
            style={[styles.card, style]}
            accessibilityRole="text"
            accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        >
            <View style={styles.iconWrap}>
                <Ionicons name={icon} size={26} color={colors.primary} />
            </View>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: semanticColors.surface1,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
    },
    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.accentSubtle,
        marginBottom: spacing.md,
    },
    title: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: semanticColors.textPrimary,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.xs,
        lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    },
});

export const FriendlyEmptyCard = memo(FriendlyEmptyCardInner);
