import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface LowPowerBannerProps {
  /** Modo de economia de bateria ativo (vindo de useLowPowerMode). */
  active: boolean;
}

/**
 * Banner de alerta de modo de economia de bateria, inspirado no Runna.
 * Aparece no topo da tela de corrida quando o aparelho está economizando
 * energia, avisando que o GPS pode perder precisão. Tocável (expande com
 * explicação + atalho para as configurações) e dispensável.
 */
export function LowPowerBanner({ active }: LowPowerBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!active || dismissed) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.row}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="Aviso de modo de economia de bateria"
        accessibilityHint="Toque para ver detalhes sobre o impacto no GPS"
        accessibilityState={{ expanded }}
      >
        <Ionicons name="battery-charging-outline" size={18} color={colors.warning} />
        <Text style={styles.title} numberOfLines={1}>
          Modo de economia detectado
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.warning}
          style={styles.chevron}
        />
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dispensar aviso"
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </Pressable>

      {expanded && (
        <View style={styles.expandedArea}>
          <Text style={styles.body}>
            O modo de economia de bateria pode reduzir a precisão do GPS.
            Desative-o para um tracking mais preciso da sua corrida.
          </Text>
          <Pressable
            style={styles.settingsBtn}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Abrir configurações do aparelho"
          >
            <Ionicons name="settings-outline" size={15} color={colors.warning} />
            <Text style={styles.settingsBtnText}>Abrir configurações</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: semanticColors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255, 196, 0, 0.45)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 44,
    gap: 8,
  },
  title: {
    flex: 1,
    color: semanticColors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  chevron: {
    marginLeft: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedArea: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  body: {
    color: semanticColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 196, 0, 0.45)',
    backgroundColor: semanticColors.warningSubtle,
  },
  settingsBtnText: {
    color: colors.warning,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
});
