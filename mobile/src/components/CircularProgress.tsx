import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, typography, createThemeStyles, useThemeSubscription } from '../theme';

interface CircularProgressProps {
    percentage: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    backgroundColor?: string;
    showPercentage?: boolean;
    children?: React.ReactNode;
}

export function CircularProgress({
    percentage,
    size = 80,
    strokeWidth = 8,
    color = colors.primary,
    backgroundColor = colors.border,
    showPercentage = true,
    children,
}: CircularProgressProps) {
    useThemeSubscription();
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    // For web, use SVG
    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, { width: size, height: size }]}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    {/* Background circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={backgroundColor}
                        strokeWidth={strokeWidth}
                        fill="none"
                    />
                    {/* Progress circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                    />
                </svg>
                <View style={styles.content}>
                    {children || (showPercentage && (
                        <Text style={styles.percentageText}>{Math.round(percentage)}%</Text>
                    ))}
                </View>
            </View>
        );
    }

    // For native, use View-based approach (simplified)
    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <View
                style={[
                    styles.circleBackground,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        borderWidth: strokeWidth,
                        borderColor: backgroundColor,
                    },
                ]}
            />
            <View style={styles.content}>
                {children || (showPercentage && (
                    <Text style={styles.percentageText}>{Math.round(percentage)}%</Text>
                ))}
            </View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleBackground: {
        position: 'absolute',
    },
    content: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    percentageText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
}));

export default CircularProgress;
