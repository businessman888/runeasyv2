import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const DS = {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    cyan: '#00D4FF',
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
        fontFamily: 'Poppins-Bold',
        fontSize: 24,
        fontWeight: '700',
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
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 22.5,
        marginTop: 8,
    },
    bodyContainer: {
        width: '100%',
    },
});

export default InterstitialBase;
