import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInUp,
  ReduceMotion,
  ZoomIn,
} from 'react-native-reanimated';
import { colors, fonts } from '../../theme';
import { storyType, StoryGradient } from './storyTheme';
import type { RetrospectiveData } from './types';

/**
 * Os 7 cards do arco da retrospectiva.
 *
 * Regras que valem para todos (herdadas da pesquisa do Wrapped):
 *  • UM número por card — cada card entrega uma ideia, grande e legível.
 *  • Estatística enquadrada como conquista, não dado cru.
 *  • Comparação só contra o PRÓPRIO usuário. Nunca contra outros corredores:
 *    não há base populacional, e afirmar percentil seria número inventado.
 *  • Nada aqui calcula métrica — todos os números vêm prontos do backend.
 */

// ── Shell comum ──────────────────────────────────────────────────────────────

interface ShellProps {
  gradient: StoryGradient;
  children: React.ReactNode;
  /** Compartilhar ESTE card. Fica discreto no canto — não compete com o conteúdo. */
  onShare?: () => void;
}

export const StoryCardShell = memo(function StoryCardShell({
  gradient,
  children,
  onShare,
}: ShellProps) {
  return (
    <LinearGradient
      colors={gradient.colors}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.shell}
    >
      <View style={styles.shellContent}>{children}</View>

      {onShare && (
        <Pressable
          onPress={onShare}
          style={styles.shareBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar este card"
          accessibilityHint="Gera uma imagem deste card e abre as opções de compartilhamento"
        >
          <Ionicons name="share-outline" size={18} color="rgba(235,235,245,0.75)" />
        </Pressable>
      )}
    </LinearGradient>
  );
});

/** Número grande + unidade colada. O "um número" de cada card. */
const HeroNumber = memo(function HeroNumber({
  value,
  unit,
  climax = false,
}: {
  value: string;
  unit?: string;
  climax?: boolean;
}) {
  return (
    <Animated.View style={styles.heroRow} entering={ENTER_HERO}>
      <Text
        style={climax ? storyType.heroClimax : storyType.hero}
        // O número é o conteúdo — deixá-lo encolher em fonte grande do sistema
        // quebraria o layout do card, que é de tamanho fixo para captura.
        allowFontScaling={false}
      >
        {value}
      </Text>
      {unit ? <Text style={[storyType.unit, styles.unit]}>{unit}</Text> : null}
    </Animated.View>
  );
});

const Eyebrow = memo(function Eyebrow({ children }: { children: string }) {
  return (
    <Animated.Text style={storyType.eyebrow} entering={ENTER_EYEBROW}>
      {children.toUpperCase()}
    </Animated.Text>
  );
});

// ── Card 1 — Abertura ────────────────────────────────────────────────────────

export const CardOpening = memo(function CardOpening({ data }: { data: RetrospectiveData }) {
  const weeks = data.planDurationWeeks;
  const goal = data.planGoalLabel;
  const context = [goal && `Meta ${goal}`, weeks && `${weeks} semanas`].filter(Boolean).join(' · ');

  return (
    <View style={styles.center}>
      <MaterialCommunityIcons
        name="calendar-check-outline"
        size={40}
        color="rgba(235,235,245,0.55)"
      />
      <Animated.Text
        style={[storyType.title, styles.openingTitle]}
        entering={ENTER_SUPPORTING}
      >
        Seu ciclo,{'\n'}revisitado
      </Animated.Text>
      {context ? <Text style={storyType.body}>{context}</Text> : null}

      {/* A voz do coach entra aqui como UMA frase — o texto integral da IA num
          card seria parede de texto, o oposto do "um número por card". */}
      {data.aiInsights ? (
        <Text style={[storyType.caption, styles.coachVoice]} numberOfLines={3}>
          {firstSentence(data.aiInsights)}
        </Text>
      ) : null}
    </View>
  );
});

// ── Card 2 — Volume total ────────────────────────────────────────────────────

export const CardVolume = memo(function CardVolume({ data }: { data: RetrospectiveData }) {
  return (
    <View style={styles.center}>
      <Eyebrow>Você correu</Eyebrow>
      <HeroNumber value={fmt(data.totalDistanceKm)} unit="km" />
      <Text style={storyType.body}>
        em {data.totalRunsInPeriod} {data.totalRunsInPeriod === 1 ? 'corrida' : 'corridas'} neste
        ciclo
      </Text>
    </View>
  );
});

// ── Card 3 — Treinos + consistência ──────────────────────────────────────────

export const CardConsistency = memo(function CardConsistency({
  data,
}: {
  data: RetrospectiveData;
}) {
  return (
    <View style={styles.center}>
      <Eyebrow>Consistência</Eyebrow>
      <HeroNumber value={String(data.totalWorkoutsCompleted)} />
      <Text style={storyType.body}>
        treinos do plano concluídos, de {data.totalWorkoutsPlanned}
      </Text>

      {/* Os DOIS números da Fase 1A, lado a lado e SEPARADOS. Somá-los seria
          reintroduzir exatamente o defeito que a 1A corrigiu: corrida livre
          inflando a aderência. */}
      <View style={styles.splitRow}>
        <View style={styles.splitCell}>
          <Text style={styles.splitValue}>{Math.round(data.distanceVsGoalPercent)}%</Text>
          <Text style={styles.splitLabel}>aderência{'\n'}ao plano</Text>
        </View>
        <View style={styles.splitDivider} />
        <View style={styles.splitCell}>
          <Text style={styles.splitValue}>{fmt(data.totalDistanceKm)} km</Text>
          <Text style={styles.splitLabel}>total{'\n'}corrido</Text>
        </View>
      </View>

      {data.freeRunDistanceKm > 0 ? (
        <Text style={storyType.caption}>
          {fmt(data.freeRunDistanceKm)} km vieram de corridas livres
        </Text>
      ) : null}
    </View>
  );
});

// ── Card 4 — Pace ────────────────────────────────────────────────────────────

export const CardPace = memo(function CardPace({ data }: { data: RetrospectiveData }) {
  const hasTarget = data.targetPaceFormatted && data.targetPaceFormatted !== '—';
  // Pace menor = mais rápido. `paceVsGoalPercent` já vem como alvo/real × 100:
  // acima de 100 significa que correu MAIS RÁPIDO que o alvo.
  const beatTarget = data.paceVsGoalPercent > 100;

  return (
    <View style={styles.center}>
      <Eyebrow>Pace médio</Eyebrow>
      <HeroNumber value={data.avgPaceFormatted} unit="/km" />
      {hasTarget ? (
        <Text style={storyType.body}>
          {beatTarget ? 'Mais rápido que a meta de' : 'A meta era'} {data.targetPaceFormatted}/km
        </Text>
      ) : (
        <Text style={storyType.body}>nos treinos deste plano</Text>
      )}

      {/* Cadência semanal — a métrica que a 1A tornou real (antes era cópia da
          taxa de conclusão). */}
      {data.frequencyTargetPerWeek > 0 ? (
        <Text style={[storyType.caption, styles.paceFooter]}>
          {data.frequencyActualPerWeek} de {data.frequencyTargetPerWeek} treinos por semana
        </Text>
      ) : null}
    </View>
  );
});

// ── Card 5 — Comparação lúdica ───────────────────────────────────────────────

const MARATHON_KM = 42.195;

export const CardFun = memo(function CardFun({ data }: { data: RetrospectiveData }) {
  const marathons = data.totalDistanceKm / MARATHON_KM;
  // Abaixo de uma maratona, "0,4 maratonas" é desanimador e pouco legível —
  // nesse caso o enquadramento vira "voltas na pista", que é concreto e sempre
  // um número inteiro simpático.
  const useMarathons = marathons >= 1;
  const laps = Math.round(data.totalDistanceKm / 0.4); // pista olímpica = 400 m

  return (
    <View style={styles.center}>
      <MaterialCommunityIcons
        name={useMarathons ? 'medal-outline' : 'stadium-outline'}
        size={40}
        color="rgba(235,235,245,0.55)"
      />
      <Eyebrow>Isso equivale a</Eyebrow>
      {useMarathons ? (
        <>
          <HeroNumber value={marathons.toFixed(1).replace('.', ',')} />
          <Text style={storyType.body}>{marathons >= 2 ? 'maratonas' : 'maratona'} completas</Text>
        </>
      ) : (
        <>
          <HeroNumber value={String(laps)} />
          <Text style={storyType.body}>voltas numa pista olímpica</Text>
        </>
      )}
    </View>
  );
});

// ── Card 6 — CLÍMAX: maior corrida única ─────────────────────────────────────

export const CardClimax = memo(function CardClimax({ data }: { data: RetrospectiveData }) {
  return (
    <View style={styles.center}>
      <MaterialCommunityIcons name="trophy-outline" size={48} color={colors.accent} />
      <Eyebrow>Seu recorde do ciclo</Eyebrow>
      <HeroNumber value={fmt(data.longestRunKm)} unit="km" climax />
      <Text style={[storyType.title, styles.climaxSubtitle]}>numa só corrida</Text>
      {data.longestRunDate ? (
        <Text style={storyType.caption}>{formatLongDate(data.longestRunDate)}</Text>
      ) : null}
    </View>
  );
});

// ── Card 7 — CTA + próxima meta ──────────────────────────────────────────────

export interface NextGoalOption {
  kind: 'coach' | 'distance' | 'pace' | 'manual';
  label: string;
  description: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const CardNextGoal = memo(function CardNextGoal({
  data,
  options,
  compact = false,
}: {
  data: RetrospectiveData;
  /**
   * Lista de opções de meta. Hoje chega com uma (distância); a Fase 5 vai
   * acrescentar a de pace/tempo. O card renderiza o que receber — por isso não
   * há nada aqui presumindo "meta = distância".
   */
  options: NextGoalOption[];
  compact?: boolean;
}) {
  return (
    <View style={styles.ctaLayout}>
      <View style={[styles.ctaIntro, compact && styles.ctaIntroCompact]}>
        <Animated.Text
          style={[storyType.title, styles.ctaTitle, compact && styles.ctaTitleCompact]}
          entering={ENTER_SUPPORTING}
          maxFontSizeMultiplier={1.15}
        >
          E agora?
        </Animated.Text>

        {data.suggestedNextGoal ? (
          <>
            <Eyebrow>O treinador sugere</Eyebrow>
            <Animated.Text
              style={[storyType.hero, styles.ctaGoal, compact && styles.ctaGoalCompact]}
              allowFontScaling={false}
              entering={ENTER_HERO}
              numberOfLines={2}
            >
              {data.suggestedNextGoal}
            </Animated.Text>
          </>
        ) : null}
      </View>

      <View style={[styles.ctaActions, compact && styles.ctaActionsCompact]}>
        {options.map((opt, optionIndex) => (
          <Animated.View
            key={opt.kind}
            style={styles.ctaOption}
            entering={enterAction(optionIndex)}
          >
            <Pressable
              onPress={opt.onPress}
              style={({ pressed }) => [
                styles.ctaBtn,
                compact && styles.ctaBtnCompact,
                opt.kind === 'coach' && styles.ctaBtnPrimary,
                opt.kind === 'manual' && styles.ctaBtnManual,
                pressed && styles.ctaBtnPressed,
                opt.disabled && styles.ctaBtnDisabled,
              ]}
              disabled={opt.disabled}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityHint={opt.description}
              accessibilityState={{ disabled: opt.disabled, busy: opt.loading }}
            >
              <View style={styles.ctaBtnCopy}>
                <Text
                  style={[
                    styles.ctaBtnText,
                    opt.kind === 'coach' && styles.ctaBtnTextPrimary,
                    opt.kind === 'manual' && styles.ctaBtnTextManual,
                  ]}
                  maxFontSizeMultiplier={1.2}
                >
                  {opt.loading ? 'Gerando seu plano…' : opt.label}
                </Text>
                {opt.kind !== 'manual' ? (
                  <Text
                    style={[
                      styles.ctaBtnDescription,
                      opt.kind === 'coach' && styles.ctaBtnDescriptionPrimary,
                    ]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {opt.description}
                  </Text>
                ) : null}
              </View>
              <Ionicons
                name={opt.kind === 'coach' ? 'sparkles' : 'arrow-forward'}
                size={18}
                color={opt.kind === 'coach' ? colors.background : colors.primary}
              />
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
});

const ENTER_EYEBROW = FadeInDown.duration(320).reduceMotion(ReduceMotion.System);
const ENTER_HERO = ZoomIn
  .delay(80)
  .springify()
  .damping(18)
  .stiffness(190)
  .reduceMotion(ReduceMotion.System);
const ENTER_SUPPORTING = FadeInUp
  .delay(120)
  .springify()
  .damping(20)
  .stiffness(180)
  .reduceMotion(ReduceMotion.System);

function enterAction(index: number) {
  return FadeInUp
    .delay(160 + index * 55)
    .springify()
    .damping(20)
    .stiffness(185)
    .reduceMotion(ReduceMotion.System);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Número em PT-BR, sem casa decimal desnecessária ("12" e não "12,0"). */
function fmt(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/** Primeira frase de um texto — a voz do coach cabe em uma. */
function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : text).trim();
}

/** 'YYYY-MM-DD' → '15 de junho'. Sem fuso: a string já é o dia local. */
function formatLongDate(dateStr: string): string {
  const MONTHS = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1] ?? ''}`;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  shellContent: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  shareBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44, // alvo de toque mínimo da HIG
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  unit: {
    paddingBottom: 12,
  },
  openingTitle: {
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 40,
  },
  coachVoice: {
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 20,
  },
  splitCell: {
    alignItems: 'center',
    gap: 4,
  },
  splitValue: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.textLight,
  },
  splitLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: 'rgba(235,235,245,0.55)',
  },
  splitDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(235,235,245,0.18)',
  },
  paceFooter: {
    marginTop: 16,
  },
  climaxSubtitle: {
    fontSize: 22,
    opacity: 0.85,
  },
  ctaTitle: {
    fontSize: 34,
    lineHeight: 46,
    paddingHorizontal: 4,
  },
  ctaTitleCompact: {
    fontSize: 28,
    lineHeight: 40,
  },
  ctaGoal: {
    fontSize: 34,
    lineHeight: 44,
    textAlign: 'center',
    maxWidth: '94%',
  },
  ctaGoalCompact: {
    fontSize: 29,
    lineHeight: 40,
  },
  ctaLayout: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIntro: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  ctaIntroCompact: {
    gap: 8,
  },
  ctaActions: {
    marginTop: 24,
    width: '100%',
    gap: 12,
  },
  ctaActionsCompact: {
    marginTop: 18,
    gap: 10,
  },
  ctaOption: {
    width: '100%',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(235,235,245,0.14)',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ctaBtnCompact: {
    minHeight: 58,
    paddingVertical: 9,
  },
  ctaBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ctaBtnManual: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingVertical: 8,
  },
  ctaBtnDisabled: {
    opacity: 0.55,
  },
  ctaBtnCopy: {
    flex: 1,
  },
  ctaBtnPressed: {
    opacity: 0.75,
  },
  ctaBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textLight,
  },
  ctaBtnTextPrimary: {
    color: colors.background,
  },
  ctaBtnTextManual: {
    color: 'rgba(235,235,245,0.68)',
    textAlign: 'center',
    fontSize: 14,
  },
  ctaBtnDescription: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(235,235,245,0.55)',
  },
  ctaBtnDescriptionPrimary: {
    color: 'rgba(10,10,24,0.68)',
  },
});
