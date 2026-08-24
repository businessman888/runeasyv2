import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fonts, useThemeSubscription, createThemeStyles } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const getLocalThemePalette1 = () => ({
    text: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
    cyan: semanticColors.accent,
});



interface InterstitialBaseProps {
    title: string;
    titleHighlight?: string;
    titleAlign?: 'left' | 'center';
    subtitle?: string;
    children: React.ReactNode;
}

export function InterstitialBase({
    title,
    titleHighlight,
    titleAlign = 'left',
    subtitle,
    children,
}: InterstitialBaseProps) {
    useThemeSubscription();
    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={[styles.title, titleAlign === 'center' && styles.titleCenter]}>
                    {title}
                    {titleHighlight ? (
                        <Text style={styles.titleHighlight}>{titleHighlight}</Text>
                    ) : null}
                </Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.bodyContainer}>{children}</View>
        </>
    );
}

const styles = createThemeStyles(() => ({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: getLocalThemePalette1().text,
        lineHeight: 36,
    },
    titleCenter: {
        textAlign: 'center',
    },
    titleHighlight: {
        color: getLocalThemePalette1().cyan,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: getLocalThemePalette1().textSecondary,
        lineHeight: 22.5,
        marginTop: 8,
    },
    bodyContainer: {
        width: '100%',
    },
}));

export default InterstitialBase;
