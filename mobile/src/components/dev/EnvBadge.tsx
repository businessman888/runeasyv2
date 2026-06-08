/**
 * EnvBadge — discreet, non-interactive environment indicator.
 *
 * Renders a small pill at the top-center of the screen on any non-production
 * build (see SHOW_ENV_BADGE) so internal testers instantly know whether they're
 * pointed at staging. It is purely an overlay: `pointerEvents="none"` guarantees
 * it never intercepts a tap, and it renders nothing at all in production.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../theme';
import { APP_VARIANT, ENV_LABEL, SHOW_ENV_BADGE } from '../../config/env';

export function EnvBadge() {
    const insets = useSafeAreaInsets();

    if (!SHOW_ENV_BADGE) return null;

    return (
        <View
            pointerEvents="none"
            style={[styles.container, { top: insets.top + 2 }]}
        >
            <View style={styles.pill}>
                <View style={styles.dot} />
                <Text style={styles.label}>{ENV_LABEL[APP_VARIANT]}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999,
        elevation: 9999,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 9999,
        backgroundColor: 'rgba(245, 158, 11, 0.18)', // accent/amber veil
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(245, 158, 11, 0.55)',
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 9999,
        backgroundColor: colors.accent,
        marginRight: 5,
    },
    label: {
        color: colors.accent,
        fontFamily: fonts.bold,
        fontSize: 9,
        letterSpacing: 1,
    },
});
