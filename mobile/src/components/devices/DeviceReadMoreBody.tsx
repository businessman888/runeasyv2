/**
 * DeviceReadMoreBody — reusable "Ler mais" detail screen body.
 *
 * Renders the long-form explanation (`WEARABLES[provider].readMore`) of how a
 * device connection works, as structured typed blocks (title / headings /
 * numbered steps / highlighted notes). Header has a single close (X) and there
 * is NO connect action — it's a deeper read of the configuration screen.
 *
 * Mirrors `DeviceConnectBody`'s shell (ScreenContainer + top-bar close) and is
 * used in two places, exactly like DeviceConnectBody:
 *   - Profile (manage mode): `DeviceReadMoreScreen` route. X pops the modal.
 *   - Onboarding: rendered inside a nested <Modal> in WearableConnectionScreen.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer } from '../ScreenContainer';
import { colors, fonts, spacing } from '../../theme';
import {
    WEARABLES,
    type ReadMoreBlock,
    type WearableProvider,
} from '../../config/wearables.config';

export interface DeviceReadMoreBodyProps {
    provider: WearableProvider;
    /** Dismiss the screen (route goBack / close the onboarding overlay). */
    onClose: () => void;
}

export function DeviceReadMoreBody({ provider, onClose }: DeviceReadMoreBodyProps) {
    const config = WEARABLES[provider];
    const blocks = config.readMore ?? [];

    return (
        <ScreenContainer>
            {/* Close (X) — same pattern as DeviceConnectBody */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar"
                >
                    <Ionicons name="close" size={26} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {blocks.map((block, i) => (
                    <Block key={i} block={block} />
                ))}
            </ScrollView>
        </ScreenContainer>
    );
}

function Block({ block }: { block: ReadMoreBlock }) {
    switch (block.type) {
        case 'title':
            return <Text style={styles.title}>{block.text}</Text>;
        case 'heading':
            return <Text style={styles.heading}>{block.text}</Text>;
        case 'subheading':
            return <Text style={styles.subheading}>{block.text}</Text>;
        case 'paragraph':
            return <Text style={styles.paragraph}>{block.text}</Text>;
        case 'steps':
            return (
                <View style={styles.steps}>
                    {block.items.map((item, i) => (
                        <View key={i} style={styles.stepRow}>
                            <Text style={styles.stepIndex}>{i + 1}.</Text>
                            <Text style={styles.stepText}>{item}</Text>
                        </View>
                    ))}
                </View>
            );
        case 'note':
            return (
                <View style={styles.note}>
                    <Text style={styles.noteText}>
                        {block.label ? (
                            <Text style={styles.noteLabel}>{block.label} </Text>
                        ) : null}
                        {block.text}
                    </Text>
                </View>
            );
        default:
            return null;
    }
}

const styles = StyleSheet.create({
    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
    },
    closeButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing['2xl'],
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 26,
        lineHeight: 32,
        color: colors.text,
        marginBottom: spacing.md,
    },
    heading: {
        fontFamily: fonts.bold,
        fontSize: 18,
        lineHeight: 24,
        color: colors.text,
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
    },
    subheading: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        lineHeight: 22,
        color: colors.textLight,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
    },
    paragraph: {
        fontFamily: fonts.regular,
        fontSize: 15,
        lineHeight: 22,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },
    steps: {
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    stepIndex: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        lineHeight: 22,
        color: colors.primary,
        minWidth: 20,
    },
    stepText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 15,
        lineHeight: 22,
        color: colors.textSecondary,
    },
    note: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: 12,
        backgroundColor: colors.glassLight,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
    },
    noteText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 21,
        color: colors.textLight,
    },
    noteLabel: {
        fontFamily: fonts.bold,
        color: colors.primary,
    },
});

export default DeviceReadMoreBody;
