import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, shadows } from '../theme';
import { useProFeature } from '../hooks/useProFeature';
import { PrePaywallBackground } from '../components/upgrade/PrePaywallBackground';

const SHIELD = require('../assets/images/shieldPro.png');

type BenefitIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Benefit {
  icon: BenefitIcon;
  title: string;
  body: string;
}

// Figma node 1276:1496 (screenPrePaywall) — card order follows the Figma y-stack.
// Iconify icons (octicon:goal, healthicons:chart-line, solar:shield) mapped to
// @expo/vector-icons (no new dependency).
const BENEFITS: Benefit[] = [
  {
    icon: 'target',
    title: 'CHEGUE NA SUA META',
    body: 'Cada treino é planejado pra te levar mais perto do seu objetivo.',
  },
  {
    icon: 'chart-line',
    title: 'CADA TREINO VIRA APRENDIZADO',
    body: 'Após cada treino você recebe uma análise completa do seu desempenho e os próximos passos para uma evolução contínua.',
  },
  {
    icon: 'shield-check',
    title: 'TREINE NO LIMITE CERTO',
    body: 'O Coach AI lê o seu corpo diariamente e ajusta a intensidade na medida certa. Supere seus limites com segurança.',
  },
];

const BenefitCard = memo(({ icon, title, body }: Benefit) => (
  <View style={styles.benefitCard}>
    {/* Glass: BlurView (iOS) behind the translucent fill; Android leans on the fill. */}
    <BlurView intensity={20} tint="dark" pointerEvents="none" style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.benefitVeil]} />
    <View style={styles.benefitContent}>
      <View style={styles.benefitHeader}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.white} />
        <Text style={styles.benefitTitle}>{title}</Text>
      </View>
      <Text style={styles.benefitBody}>{body}</Text>
    </View>
  </View>
));
BenefitCard.displayName = 'BenefitCard';

/**
 * Awareness interstitial shown to Free users before the paywall. Reached via
 * `openUpgrade()` from any upgrade card/teaser; its CTA opens the real Superwall
 * paywall (`presentPaywall`) and then pops back to where the user came from.
 * Presented as a modal sheet (rounded top, X + swipe-down to dismiss).
 */
export function PrePaywallScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { presentPaywall } = useProFeature();

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleStartTrial = useCallback(async () => {
    await presentPaywall();
    // Back to the origin screen; if the user converted it re-renders as Pro.
    navigation.goBack();
  }, [presentPaywall, navigation]);

  return (
    <View style={styles.root}>
      <PrePaywallBackground />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: 160 },
        ]}
      >
        <Image source={SHIELD} style={styles.shield} resizeMode="contain" />

        <Text style={styles.heroTitle}>Seu maior salto de{'\n'}performance começa aqui.</Text>
        <Text style={styles.heroSubtitle}>
          Treinos diários que se adaptam ao seu sono, sua frequência cardíaca e ao seu
          corpo a cada dia — pra você evoluir de verdade, sem se machucar.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <BenefitCard key={b.title} {...b} />
          ))}
        </View>

        <Text style={styles.closingCopy}>
          Sem planilha.{'\n'}Sem achismo.{'\n'}Sem dúvida.{'\n'}Tudo ajustado a você.{'\n'}
          Desbloqueie a sua melhor{'\n'}versão como corredor.
        </Text>
      </ScrollView>

      {/* Close (X) — above the scroll content */}
      <Pressable
        onPress={handleClose}
        hitSlop={12}
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        accessibilityHint="Fecha esta tela e volta sem assinar"
      >
        <Ionicons name="close" size={26} color={colors.white} />
      </Pressable>

      {/* Fixed CTA bar */}
      <View style={[styles.buttonArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={handleStartTrial}
          accessibilityRole="button"
          accessibilityLabel="Continuar"
          accessibilityHint="Abre a tela de assinatura para desbloquear as features Pro"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default PrePaywallScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  scrollContent: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },

  // Hero
  shield: {
    width: 120,
    height: 120,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 20,
  },
  heroSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.proMutedText,
    textAlign: 'center',
    marginTop: 12,
  },

  // Benefit cards
  benefits: {
    width: '100%',
    gap: 16,
    marginTop: 28,
  },
  benefitCard: {
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.proDivider,
  },
  benefitVeil: {
    backgroundColor: colors.proCardGlassFill,
  },
  benefitContent: {
    padding: 16,
  },
  benefitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitTitle: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.primary,
  },
  benefitBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.proMutedText,
    marginTop: 12,
  },

  // Closing copy
  closingCopy: {
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 28,
  },

  // Close button
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Fixed CTA bar
  buttonArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.streakCard,
    paddingHorizontal: 24,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 12,
  },
  cta: {
    height: 51,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.neon,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.backgroundLight,
  },
});
