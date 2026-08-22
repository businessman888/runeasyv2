import { StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { semanticColors } from '../../../theme/semanticColors';

/**
 * Estilos COMPARTILHADOS entre os cards do carrossel.
 *
 * Existem para que o card semanal e o de mesociclo pareçam o mesmo objeto visto
 * de duas alturas — não dois componentes diferentes que por acaso estão lado a
 * lado. Deslizar entre eles precisa parecer navegar na mesma coisa: mesmo
 * tamanho de número-herói, mesma altura de CTA, mesmo respiro.
 *
 * Reaproveitam o sistema que o app já tem (fundo escuro, ciano = tocável,
 * folha ancorada embaixo). Estender é consistência; reinventar tela a tela é o
 * oposto de premium.
 */
export const cardStyles = StyleSheet.create({
    body: { gap: spacing.base },

    headText: { flex: 1 },
    eyebrow: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
    },
    range: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },

    // Linha de números-herói: dois blocos separados por um fio.
    keyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.base,
    },
    keyBlock: { flex: 1, alignItems: 'center', gap: 2 },
    keyValue: {
        fontFamily: fonts.extrabold,
        fontSize: 30,
        lineHeight: 34,
        color: colors.text,
        letterSpacing: -0.6,
    },
    keyUnit: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
    },
    keyLabel: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
        textAlign: 'center',
    },
    keyDivider: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch',
        backgroundColor: colors.border,
        marginVertical: spacing.xs,
    },

    narrative: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        lineHeight: 21,
        color: colors.textLight,
    },

    // 54pt de altura: bem acima do mínimo de 44 para alvo de toque.
    cta: {
        height: 54,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    ctaText: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textOnAccent,
    },
});
