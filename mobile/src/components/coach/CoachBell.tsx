/**
 * Sino do coach + balão do último aviso (baseado no Figma componentAlert 1604:1967,
 * refinado para bolha de chat premium).
 *
 * Princípio de UX: áudio é primário, a tela é histórico consultável — PULL, não
 * push. O balão só abre/fecha ao TOCAR (nunca some por timeout — quem corre precisa
 * de tempo para ler).
 *
 * Estados do sino:
 *  - idle: superfície neutra (igual aos outros botões do mapa), sino ciano, SEM borda ciano.
 *  - destacado (não-lido OU aberto): bg ciano, sino escuro. Dot só quando não-lido.
 *
 * O balão é `position: absolute` de propósito: se estivesse no fluxo, ao abrir ele
 * alargaria a coluna de controles (alignItems: center) e "empurraria" os botões de
 * baixo. Absoluto → o componente mantém 46×46 e nada mais se move.
 */

import React, { memo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, FadeIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { semanticColors } from '../../theme/semanticColors';
import { elevation, createThemeStyles, useThemeSubscription } from '../../theme';

const getLocalThemePalette1 = () => ({
  dark: semanticColors.textOnAccent,
  surface: semanticColors.surface2,
  cyan: semanticColors.accent,
  textPrimary: semanticColors.textPrimary,
  textMuted: semanticColors.textSecondary,
  neutralBorder: semanticColors.borderSubtle,
});



const BELL = 46;

interface Props {
  unread: boolean;
  message: string | null;
  /** Chamado ao ABRIR o balão (marca como lido). */
  onOpen: () => void;
}

export const CoachBell = memo(({ unread, message, onOpen }: Props) => {
  useThemeSubscription();
  const [open, setOpen] = useState(false);
  const [balloonH, setBalloonH] = useState(44);

  // Destaque ciano quando há aviso não-lido OU o balão está aberto.
  const highlight = unread || open;

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) onOpen();
      return next;
    });
  }, [onOpen]);

  return (
    <View style={styles.wrap}>
      {open && !!message && (
        <Animated.View
          entering={FadeIn.duration(160)}
          onLayout={(e) => setBalloonH(e.nativeEvent.layout.height)}
          style={[styles.balloon, { top: BELL / 2 - balloonH / 2 }]}
          accessibilityRole="text"
          accessibilityLabel={`Aviso do coach: ${message}`}
        >
          <Text style={styles.balloonSender}>COACH</Text>
          <Text style={styles.balloonText}>{message}</Text>
          {/* Cauda apontando para o sino (à direita). */}
          <View style={styles.tail} />
        </Animated.View>
      )}

      <Pressable
        onPress={handlePress}
        onPressIn={() => {
          scale.value = withSpring(0.9, { damping: 12, stiffness: 260 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        }}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Fechar avisos do coach' : 'Ver último aviso do coach'}
        accessibilityState={{ selected: open }}
        hitSlop={8}
      >
        <Animated.View style={[styles.bell, highlight ? styles.bellOn : styles.bellIdle, pressStyle]}>
          <MaterialCommunityIcons name="bell" size={20} color={highlight ? getLocalThemePalette1().dark : getLocalThemePalette1().cyan} />
          {unread && <View style={styles.dot} />}
        </Animated.View>
      </Pressable>
    </View>
  );
});

CoachBell.displayName = 'CoachBell';

const styles = createThemeStyles(() => ({
  // Tamanho fixo = só o sino. O balão (absoluto) NÃO altera esta largura.
  wrap: {
    width: BELL,
    height: BELL,
  },
  bell: {
    width: BELL,
    height: BELL,
    borderRadius: BELL / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  bellIdle: {
    backgroundColor: getLocalThemePalette1().surface,
    borderColor: getLocalThemePalette1().neutralBorder, // sem borda ciano por padrão
  },
  bellOn: {
    backgroundColor: getLocalThemePalette1().cyan,
    borderColor: getLocalThemePalette1().cyan,
    ...elevation.sm,
  },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: getLocalThemePalette1().dark,
    borderWidth: 1.5,
    borderColor: getLocalThemePalette1().cyan,
  },

  // ── Balão de chat (absoluto, à esquerda do sino) ──
  balloon: {
    position: 'absolute',
    right: BELL + 12, // 12px à esquerda do sino
    maxWidth: 210,
    minWidth: 96,
    backgroundColor: getLocalThemePalette1().surface,
    borderRadius: 16,
    borderTopRightRadius: 6, // canto "de chat" do lado da cauda
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...elevation.md,
    zIndex: 30,
  },
  balloonSender: {
    color: getLocalThemePalette1().cyan,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  balloonText: {
    color: getLocalThemePalette1().textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  tail: {
    position: 'absolute',
    right: -5,
    top: 16,
    width: 12,
    height: 12,
    backgroundColor: getLocalThemePalette1().surface,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: semanticColors.borderSubtle,
    transform: [{ rotate: '45deg' }],
  },
}));
