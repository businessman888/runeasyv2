/**
 * Sino do coach + balão do último aviso (Figma componentAlert 1604:1967).
 *
 * Princípio de UX: áudio é primário, a tela é histórico consultável — PULL, não
 * push. Nada aparece sozinho cobrindo o mapa. O balão só abre/fecha ao TOCAR
 * (nunca some por timeout — quem corre precisa de tempo para ler).
 *
 * Estados do sino (Figma): idle (bg escuro, sino ciano) / não-lido (bg ciano,
 * sino escuro + dot). Alvo de toque 46pt (≥44, acessibilidade) — o Figma usa 40.
 */

import React, { memo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const T = {
  bell: '#0E0E1F',
  cyan: '#00D4FF',
  textPrimary: '#EBEBF5',
  balloonBg: 'rgba(0, 127, 153, 0.30)', // = insightCard existente
  balloonBorder: 'rgba(0, 212, 255, 0.35)',
};

interface Props {
  unread: boolean;
  message: string | null;
  /** Chamado ao ABRIR o balão (marca como lido). */
  onOpen: () => void;
}

export const CoachBell = memo(({ unread, message, onOpen }: Props) => {
  const [open, setOpen] = useState(false);
  // "não-lido" visual só enquanto o balão está fechado.
  const active = unread && !open;

  const handlePress = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) onOpen();
      return next;
    });
  }, [onOpen]);

  return (
    <View style={styles.row}>
      {open && !!message && (
        <View style={styles.balloon} accessibilityRole="text" accessibilityLabel={`Último aviso: ${message}`}>
          <Text style={styles.balloonText} numberOfLines={3}>
            {message}
          </Text>
        </View>
      )}

      <Pressable
        onPress={handlePress}
        style={[styles.bell, active && styles.bellActive]}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Fechar avisos do coach' : 'Ver último aviso do coach'}
        accessibilityState={{ selected: open }}
        hitSlop={8}
      >
        <MaterialCommunityIcons
          name="bell"
          size={20}
          color={active ? T.bell : T.cyan}
        />
        {active && <View style={styles.dot} />}
      </Pressable>
    </View>
  );
});

CoachBell.displayName = 'CoachBell';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  balloon: {
    maxWidth: 220,
    backgroundColor: T.balloonBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.balloonBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balloonText: {
    color: T.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: T.bell,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellActive: {
    backgroundColor: T.cyan,
    borderColor: T.cyan,
    shadowColor: T.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.bell,
    borderWidth: 1.5,
    borderColor: T.cyan,
  },
});
