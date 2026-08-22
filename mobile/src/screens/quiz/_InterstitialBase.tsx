import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const DS = {
    text: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
    cyan: semanticColors.accent,
};

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

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: DS.text,
        lineHeight: 36,
    },
    titleCenter: {
        textAlign: 'center',
    },
    titleHighlight: {
        color: DS.cyan,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: DS.textSecondary,
        lineHeight: 22.5,
        marginTop: 8,
    },
    bodyContainer: {
        width: '100%',
    },
});

export default InterstitialBase;
