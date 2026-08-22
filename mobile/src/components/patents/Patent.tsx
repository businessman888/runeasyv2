import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Path, Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { PATENTS, PatentDef } from '../../constants/patents';
import { semanticColors } from '../../theme/semanticColors';

interface PatentProps {
    /** Patent id (e.g. 'patent-4') OR patent definition. */
    id?: string;
    patent?: PatentDef;
    size?: number;
    locked?: boolean;
    glow?: boolean;
}

/**
 * Renders a single patent as an SVG arrow/boomerang with a radial-gradient fill.
 * Inspired by the "fast-arrow" / "tron-arrow" shapes from the game-icons.net set
 * referenced in Figma node 1094:1333.
 */
export function Patent({ id, patent: patentProp, size = 64, locked = false, glow = true }: PatentProps) {
    const patent = patentProp ?? PATENTS.find(p => p.id === id) ?? PATENTS[0];
    const [c0, c50, c75, c100] = patent.gradient;

    const gradientId = `grad-${patent.id}-${size}`;
    const innerGradientId = `grad-inner-${patent.id}-${size}`;

    return (
        <View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    shadowColor: glow && !locked ? patent.glow : 'transparent',
                    shadowOpacity: glow && !locked ? 0.55 : 0,
                    shadowRadius: glow && !locked ? size * 0.25 : 0,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: glow && !locked ? 6 : 0,
                },
            ]}
        >
            <Svg width={size} height={size} viewBox="0 0 100 100">
                <Defs>
                    <RadialGradient
                        id={gradientId}
                        cx="50%"
                        cy="50%"
                        rx="55%"
                        ry="55%"
                        fx="50%"
                        fy="50%"
                    >
                        <Stop offset="0%" stopColor={c0} stopOpacity={1} />
                        <Stop offset="50%" stopColor={c50} stopOpacity={1} />
                        <Stop offset="75%" stopColor={c75} stopOpacity={1} />
                        <Stop offset="100%" stopColor={c100} stopOpacity={1} />
                    </RadialGradient>
                    <RadialGradient
                        id={innerGradientId}
                        cx="40%"
                        cy="35%"
                        rx="45%"
                        ry="45%"
                    >
                        <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.55} />
                        <Stop offset="60%" stopColor="#FFFFFF" stopOpacity={0.05} />
                        <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                    </RadialGradient>
                </Defs>

                {/* Soft halo behind the arrow */}
                {glow && !locked ? (
                    <Circle cx="50" cy="50" r="48" fill={patent.glow} fillOpacity={0.08} />
                ) : null}

                {/* Fast-arrow / boomerang shape (double chevron pointing right) */}
                <G opacity={locked ? 0.35 : 1}>
                    <Path
                        d="M22 18 L52 50 L22 82 L34 82 L64 50 L34 18 Z"
                        fill={`url(#${gradientId})`}
                        stroke={c100}
                        strokeWidth={1.2}
                        strokeLinejoin="round"
                    />
                    <Path
                        d="M48 18 L78 50 L48 82 L60 82 L90 50 L60 18 Z"
                        fill={`url(#${gradientId})`}
                        stroke={c100}
                        strokeWidth={1.2}
                        strokeLinejoin="round"
                    />
                    {/* Inner glossy highlight */}
                    <Path
                        d="M22 18 L52 50 L22 82 L34 82 L64 50 L34 18 Z"
                        fill={`url(#${innerGradientId})`}
                    />
                    <Path
                        d="M48 18 L78 50 L48 82 L60 82 L90 50 L60 18 Z"
                        fill={`url(#${innerGradientId})`}
                    />
                </G>
            </Svg>

            {locked ? (
                <View style={[styles.lockOverlay, { width: size, height: size }]}>
                    <View style={[styles.lockBadge, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21 }]}>
                        <Ionicons name="lock-closed" size={size * 0.22} color="#FFFFFF" />
                    </View>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockBadge: {
        backgroundColor: semanticColors.overlayStrong,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
