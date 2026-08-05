import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, fonts } from '../../../theme';

/**
 * Cabeçalho de seção — eyebrow + título (+ nota opcional à direita).
 *
 * Existe para as seções terem IDENTIDADE. Antes eram cinco headings idênticos
 * (`xl bold`), o que faz o olho ler a tela como uma lista contínua em vez de
 * blocos navegáveis. O eyebrow em caixa alta e cor muda cria a marcação de
 * hierarquia sem custar altura.
 */

interface SectionHeaderProps {
    eyebrow: string;
    title: string;
    /** Nota curta alinhada à direita — unidade, período, contagem. */
    note?: string;
}

export const SectionHeader = memo(function SectionHeader({
    eyebrow,
    title,
    note,
}: SectionHeaderProps) {
    return (
        <View style={styles.wrap}>
            <View style={styles.left}>
                <Text style={styles.eyebrow}>{eyebrow}</Text>
                <Text style={styles.title}>{title}</Text>
            </View>
            {!!note && <Text style={styles.note}>{note}</Text>}
        </View>
    );
});

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    left: { flex: 1, gap: 1 },
    eyebrow: {
        fontFamily: fonts.bold,
        fontSize: 10,
        color: colors.textMuted,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
        letterSpacing: -0.2,
    },
    note: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
        paddingBottom: 2,
    },
});
