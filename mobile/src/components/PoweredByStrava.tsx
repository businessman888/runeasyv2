import React from 'react';
import { View, StyleSheet, Image, ImageStyle, ViewStyle } from 'react-native';

/**
 * PoweredByStrava component - Strava API compliance branding
 * Uses official Strava "Powered by Strava" image asset
 * 
 * Per Strava API Guidelines:
 * - Must display "Powered by Strava" when showing Strava data
 * - Logo minimum width: 76px for legibility
 */

// Import official Strava branding image
const STRAVA_POWERED_BY_LOGO = require('../assets/images/strava/api_logo_pwrdBy_strava_stack_white.png');

interface PoweredByStravaProps {
    /** Width of the badge (default: 76px per Strava guidelines) */
    width?: number;
    /** Optional custom style for the container */
    style?: ViewStyle;
    /** Alignment - 'left', 'center', or 'right' */
    align?: 'left' | 'center' | 'right';
}

export function PoweredByStrava({
    width = 76,
    style,
    align = 'right'
}: PoweredByStravaProps) {
    const alignmentStyle = {
        left: { alignSelf: 'flex-start' as const },
        center: { alignSelf: 'center' as const },
        right: { alignSelf: 'flex-end' as const },
    };

    return (
        <View style={[styles.container, alignmentStyle[align], style]}>
            <Image
                source={STRAVA_POWERED_BY_LOGO}
                style={[styles.logo, { width }] as ImageStyle[]}
                resizeMode="contain"
            />
        </View>
    );
}

/**
 * Helper function to check if data comes from Strava
 * Use this to conditionally render the PoweredByStrava badge
 */
export function isStravaData(data: { external_source?: string; strava_id?: string | number } | null | undefined): boolean {
    if (!data) return false;
    return data.external_source === 'strava' || !!data.strava_id;
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 4,
    },
    logo: {
        height: undefined,
        aspectRatio: 2.5, // Approximate aspect ratio of the Strava logo
    },
});

export default PoweredByStrava;
