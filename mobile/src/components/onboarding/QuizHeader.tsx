/**
 * Standard title + subtitle block for every onboarding quiz screen.
 *
 * One typography scale everywhere (the audit found titles of 20/24/28/30px in
 * four font families). Pass a string or JSX; use <Hl> to highlight a segment in
 * the brand cyan (it inherits size/weight from the surrounding title).
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { QUIZ } from '../../screens/quiz/_tokens';

export const Hl = ({ children }: { children: React.ReactNode }) => (
    <Text style={styles.highlight}>{children}</Text>
);

interface QuizHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export function QuizHeader({ title, subtitle, style }: QuizHeaderProps) {
    return (
        <View style={[styles.container, style]}>
            <Text style={styles.title} accessibilityRole="header">
                {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    title: {
        fontFamily: QUIZ.title.fontFamily,
        fontSize: QUIZ.title.fontSize,
        lineHeight: QUIZ.title.lineHeight,
        color: QUIZ.color.text,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: QUIZ.subtitle.fontSize,
        lineHeight: QUIZ.subtitle.lineHeight,
        color: QUIZ.color.textDim,
    },
    highlight: {
        color: QUIZ.color.cyan,
    },
});

export default QuizHeader;
