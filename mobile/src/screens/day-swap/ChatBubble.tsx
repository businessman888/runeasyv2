import React, { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
    borderRadius,
    fonts,
    spacing,
    typography,
    useThemedStyles,
    type ThemeColors,
} from '../../theme';
import { motionSpring } from '../../theme/motion';
import { useTypingReveal } from '../../hooks/useTypingReveal';

/**
 * Uma bolha da conversa.
 *
 * ── SÓ A ÚLTIMA DO BOT DIGITA ────────────────────────────────────────────────
 *
 * `typing` é decidido pela tela, e só para a mensagem mais recente. Sem isso,
 * qualquer re-render (uma escolha, um estado novo) redigitaria a conversa
 * inteira de cima — o efeito viraria defeito.
 *
 * O `useTypingReveal` é o MESMO do briefing do treinador, e ele já respeita
 * Reduce Motion: com a preferência ligada, o texto aparece inteiro.
 *
 * ── O TEXTO COMPLETO ESTÁ SEMPRE NO `accessibilityLabel` ─────────────────────
 *
 * O leitor de tela nunca lê texto pela metade, mesmo enquanto a animação corre.
 */

interface ChatBubbleProps {
    from: 'bot' | 'user';
    text: string;
    /** Revela caractere a caractere. Só para a última bolha do bot. */
    typing?: boolean;
    /** O widget de escolha, renderizado dentro da bolha do bot. */
    children?: ReactNode;
}

function ChatBubbleInner({ from, text, typing = false, children }: ChatBubbleProps) {
    const styles = useThemedStyles(createStyles);
    const isBot = from === 'bot';

    const { displayed } = useTypingReveal(text, { enabled: typing });
    const visible = typing ? displayed : text;

    return (
        <Animated.View
            entering={FadeInDown.springify()
                .damping(motionSpring.layout.damping)
                .stiffness(motionSpring.layout.stiffness)}
            style={[styles.row, isBot ? styles.rowBot : styles.rowUser]}
        >
            <View style={[styles.bubble, isBot ? styles.bubbleBot : styles.bubbleUser]}>
                <Text
                    style={[styles.text, !isBot && styles.textUser]}
                    accessibilityLabel={text}
                    maxFontSizeMultiplier={1.4}
                >
                    {visible}
                </Text>
                {!!children && <View style={styles.widget}>{children}</View>}
            </View>
        </Animated.View>
    );
}

export const ChatBubble = memo(ChatBubbleInner);

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        row: {
            flexDirection: 'row',
            marginBottom: spacing.sm,
        },
        rowBot: {
            justifyContent: 'flex-start',
            paddingRight: spacing.xl,
        },
        rowUser: {
            justifyContent: 'flex-end',
            paddingLeft: spacing.xl,
        },
        bubble: {
            maxWidth: '100%',
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.sm + 2,
            borderRadius: borderRadius.lg,
        },
        bubbleBot: {
            backgroundColor: colors.surface2,
            borderTopLeftRadius: borderRadius.sm,
        },
        bubbleUser: {
            backgroundColor: colors.accentSubtle,
            borderTopRightRadius: borderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        text: {
            fontSize: typography.fontSizes.base,
            fontFamily: fonts.regular,
            color: colors.textPrimary,
            lineHeight: 22,
        },
        textUser: {
            fontFamily: fonts.medium,
        },
        widget: {
            marginTop: spacing.base,
        },
    });
}

export default ChatBubble;
