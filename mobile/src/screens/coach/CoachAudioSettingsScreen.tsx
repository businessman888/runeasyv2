/**
 * Tela de configuração do coach de áudio (Figma screenConnectCoachAudio 1599:1924).
 * Lugar PERMANENTE da preferência (o onboarding, fase futura, será só um atalho).
 *
 * Comportamento do botão (SEM modal): tocar em "Habilitar Coach" habilita DIRETO;
 * quando ativo, o botão vira "Coach ativado" (tocar de novo desativa). A pessoa já
 * leu os bullets — pedir confirmação de novo é o app duvidando dela.
 *
 * Este toggle é SÓ preferência — não concede alertas de pace a um Free (o direito
 * é verificado no disparo). A tela deixa claro o que é Free (splits) e o que
 * depende do plano (via os bullets), sem virar paywall.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../components/ScreenContainer';
import { semanticColors } from '../../theme/semanticColors';
import { useCoachStore } from '../../stores/coachStore';
import {
  checkPtBrVoice,
  openAndroidTtsSettings,
  type VoiceStatus,
} from '../../services/coach/ttsVoice';

const T = {
  bg: semanticColors.canvas,
  cyan: semanticColors.accent,
  textPrimary: semanticColors.textPrimary,
  textSecondary: semanticColors.textSecondary,
  buttonOff: semanticColors.textPrimary,
  buttonOffText: semanticColors.surface2,
  warnBg: 'rgba(255, 196, 0, 0.12)',
  warnBorder: 'rgba(255, 196, 0, 0.40)',
  warnText: '#FFC400',
};

const BULLETS = [
  'Conecte seus fones e receba avisos por voz enquanto corre, sem precisar olhar para a tela.',
  'A cada quilômetro completado, você ouve o tempo e o ritmo daquele trecho.',
  'Nos treinos do seu plano, o coach avisa quando você sai do ritmo-alvo e prepara você para cada tiro do intervalado.',
  'Sua música abaixa só no momento do aviso e volta logo em seguida. Funciona com o celular no bolso e a tela apagada.',
];

export function CoachAudioSettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const enabled = useCoachStore((s) => s.enabled);
  const setEnabled = useCoachStore((s) => s.setEnabled);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('ok');

  // Verificação de voz pt-BR: silenciosa quando ok. Só Android tem risco real.
  const runVoiceCheck = useCallback(async () => {
    const status = await checkPtBrVoice();
    setVoiceStatus(status);
    return status;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') runVoiceCheck();
  }, [runVoiceCheck]);

  const handleToggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    // Ao habilitar: verifica a voz (Android). 'missing' → mostra o aviso, mas NÃO
    // bloqueia (degrada para só-visual). 'ok'/'unknown' → habilita silencioso.
    if (Platform.OS === 'android') {
      const status = await runVoiceCheck();
      if (status === 'missing') {
        setEnabled(true); // habilita mesmo assim; a UI visual funciona
        return;
      }
    }
    setEnabled(true);
  }, [enabled, setEnabled, runVoiceCheck]);

  const showVoiceWarning = voiceStatus === 'missing';

  return (
    <ScreenContainer>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.closeBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={8}
        >
          <Ionicons name="close" size={26} color={T.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../../assets/images/wearables/imgCoachAudio.png')}
          style={styles.illustration}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <Text style={styles.title}>Habilite seu coach{'\n'}de áudio</Text>

        <View style={styles.bullets}>
          {BULLETS.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>

        {showVoiceWarning && (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Voz em português não encontrada</Text>
            <Text style={styles.warnBody}>
              O coach vai mostrar os splits na tela, mas para OUVIR os avisos instale
              uma voz em português nas configurações de conversão de texto em voz do
              seu aparelho.
            </Text>
            <Pressable
              style={styles.warnBtn}
              onPress={openAndroidTtsSettings}
              accessibilityRole="button"
              accessibilityLabel="Abrir configurações de voz do Android"
            >
              <Text style={styles.warnBtnText}>Abrir configurações de voz</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Pressable
          style={[styles.cta, enabled ? styles.ctaOn : styles.ctaOff]}
          onPress={handleToggle}
          accessibilityRole="button"
          accessibilityLabel={enabled ? 'Coach ativado, tocar para desativar' : 'Habilitar coach de áudio'}
          accessibilityState={{ selected: enabled }}
        >
          {enabled ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.ctaContent}>
              <Ionicons name="checkmark-circle" size={20} color={T.cyan} style={{ marginRight: 8 }} />
              <Text style={[styles.ctaText, { color: T.cyan }]}>Coach ativado</Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(200)} style={styles.ctaContent}>
              <Text style={[styles.ctaText, { color: T.buttonOffText }]}>Habilitar Coach</Text>
            </Animated.View>
          )}
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

export default CoachAudioSettingsScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  illustration: {
    width: 218,
    height: 218,
    marginTop: 8,
    marginBottom: 20,
  },
  title: {
    color: T.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 28,
  },
  bullets: {
    alignSelf: 'stretch',
    gap: 18,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: T.textSecondary,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    color: T.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  warnCard: {
    alignSelf: 'stretch',
    marginTop: 24,
    backgroundColor: T.warnBg,
    borderWidth: 1,
    borderColor: T.warnBorder,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  warnTitle: {
    color: T.warnText,
    fontSize: 14,
    fontWeight: '700',
  },
  warnBody: {
    color: T.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  warnBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: T.warnBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  warnBtnText: {
    color: T.warnText,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cta: {
    height: 52,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: {
    backgroundColor: T.buttonOff,
  },
  ctaOn: {
    backgroundColor: semanticColors.accentSubtle,
    borderWidth: 1,
    borderColor: T.cyan,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
