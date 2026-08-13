import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BadgeShield } from './BadgeShield';
import {
  getEarnableBadgeSlugs,
  resolveWorkoutPaceSeconds,
} from '../utils/workoutPreview';
import {
  workoutDurationSeconds,
  formatDurationLabel,
  isTimeBasedWorkout,
} from '../utils/workoutTransform';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkoutInstruction {
  type: string;
  distance_km: number;
  pace_min: number;
  pace_max?: number;
}

interface BadgeData {
  id: string;
  slug: string;
  type: string;
  tier: number;
  earned: boolean;
}

export interface WorkoutData {
  id: string;
  type: string;
  distance_km: number;
  scheduled_date?: string;
  instructions_json: WorkoutInstruction[];
  objective?: string | null;
  status?: 'pending' | 'completed' | 'skipped' | 'missed';
}

interface ExecutedOverride {
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
}

interface WorkoutCardProps {
  workout: WorkoutData;
  isToday: boolean;
  isCompleted: boolean;
  onStartWorkout: () => void;
  allBadges: BadgeData[];
  /**
   * When provided AND the workout is completed, the stats row renders these
   * actual executed metrics instead of the planned distance/time/pace.
   * Lets the Goals screen show real values without forking the component.
   */
  executedOverride?: ExecutedOverride;
}

// ─── Figma design tokens ──────────────────────────────────────────────────────

const CARD_BG = '#15152A';
const CARD_BORDER_ACTIVE = '#00D4FF';
const TEXT_PRIMARY = '#EBEBF5';
const TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';
const SEPARATOR = 'rgba(235, 235, 245, 0.1)';
const BTN_ACTIVE_BG = '#00D4FF';
const BTN_ACTIVE_TEXT = '#0E0E1F';
const BTN_DISABLED_BG = 'rgba(235, 235, 245, 0.1)';
const BTN_DISABLED_TEXT = 'rgba(235, 235, 245, 0.6)';
const CHECKBOX_BORDER = 'rgba(235, 235, 245, 0.6)';
const CHECKBOX_CHECKED_BG = '#00D4FF';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWorkoutTypeName(type: string): string {
  const names: Record<string, string> = {
    easy_run: 'Rodagem Leve',
    long_run: 'Longão',
    intervals: 'Intervalado',
    tempo: 'Tempo Run',
    recovery: 'Recuperação',
    walk_run: 'Caminhada e Corrida',
  };
  return names[type] ?? type;
}

function getIntensityLabel(type: string): string {
  const labels: Record<string, string> = {
    easy_run: 'Leve',
    long_run: 'Moderada',
    intervals: 'Alta',
    tempo: 'Moderada-Alta',
    recovery: 'Leve',
    walk_run: 'Leve',
  };
  return `Nível de intensidade: ${labels[type] ?? 'Moderada'}`;
}

function getPaceMinutes(workout: WorkoutData): number {
  return (resolveWorkoutPaceSeconds(workout) ?? 360) / 60;
}

function formatPace(paceMin: number): string {
  const min = Math.floor(paceMin);
  const sec = Math.round((paceMin - min) * 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatEstimatedTime(workout: WorkoutData): string {
  const pace = getPaceMinutes(workout);
  const totalMin = pace * workout.distance_km;
  const hours = Math.floor(totalMin / 60);
  const mins = Math.floor(totalMin % 60);
  const secs = Math.round((totalMin - Math.floor(totalMin)) * 60);
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDurationFromSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatPaceFromSecondsPerKm(secondsPerKm: number): string {
  const safe = Math.max(0, Math.round(secondsPerKm));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatCardDate(dateStr?: string): string {
  if (!dateStr) return 'Hoje';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const tag = `${dd}/${mm}`;

  if (date.getTime() === today.getTime()) return `Hoje, ${tag}`;
  if (date.getTime() === tomorrow.getTime()) return `Amanhã, ${tag}`;
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, -1)}, ${tag}`;
}

// ─── Badge logic ──────────────────────────────────────────────────────────────
// Determines which badge slugs are most relevant for a given workout,
// so the card can preview what the user might earn.

// ─── Component ────────────────────────────────────────────────────────────────

export const WorkoutCard = memo(
  ({ workout, isToday, isCompleted, onStartWorkout, allBadges, executedOverride }: WorkoutCardProps) => {
    const pace = getPaceMinutes(workout);
    const dateLabel = formatCardDate(workout.scheduled_date);
    const intensityLabel = getIntensityLabel(workout.type);
    const workoutName = getWorkoutTypeName(workout.type);

    const useExecuted = !!executedOverride && isCompleted;
    // Treino planejado por tempo (caminhada/corrida): sem distância nem pace —
    // exibir a duração dos segmentos, nunca "0.00 Km / 0:00 / pace falso".
    const timeBased =
      !useExecuted && isTimeBasedWorkout(workout.distance_km, workout.instructions_json);
    const distanceLabel = useExecuted
      ? `${executedOverride!.distanceKm.toFixed(2)} Km`
      : timeBased
        ? '—'
        : `${workout.distance_km.toFixed(2)} Km`;
    const timeLabel = useExecuted
      ? formatDurationFromSeconds(executedOverride!.durationSeconds)
      : timeBased
        ? formatDurationLabel(workoutDurationSeconds(workout.instructions_json))
        : formatEstimatedTime(workout);
    const paceLabel = useExecuted
      ? `${formatPaceFromSecondsPerKm(executedOverride!.paceSecondsPerKm)} /km`
      : timeBased
        ? 'No seu ritmo'
        : `${formatPace(pace)} /km`;

    // Resolve earnable badges against the user's real badge list
    const earnableBadges = useMemo(() => {
      const slugs = getEarnableBadgeSlugs(workout);
      return slugs
        .map((slug) => allBadges.find((b) => b.slug === slug) ?? null)
        .filter((b): b is BadgeData => b !== null);
    }, [workout, allBadges]);

    const isButtonEnabled = isToday && !isCompleted;

    return (
      <View style={[styles.card, isCompleted ? styles.cardCompleted : styles.cardActive]}>

        {/* ── Section 1: Header ─────────────────────────────────────────── */}
        <View style={styles.section1}>
          {/* Left: workout info */}
          <View style={styles.textArea}>
            <Text style={styles.dateText}>{dateLabel}</Text>
            <Text style={styles.workoutName}>{workoutName}</Text>
            <Text style={styles.intensityText}>{intensityLabel}</Text>
          </View>

          {/* Right: checkbox */}
          <View style={styles.checkboxArea}>
            <View style={[styles.checkbox, isCompleted && styles.checkboxChecked]}>
              {isCompleted && (
                <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
              )}
            </View>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ── Section 2: Stats + Badges ─────────────────────────────────── */}
        <View style={styles.section2}>
          {/* Stats columns */}
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Distância</Text>
              <Text style={styles.statValue}>{distanceLabel}</Text>
            </View>
            <View style={[styles.statCol, styles.statColMiddle]}>
              <Text style={styles.statLabel}>Tempo</Text>
              <Text style={styles.statValue}>{timeLabel}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Pace</Text>
              <Text style={styles.statValue}>{paceLabel}</Text>
            </View>
          </View>

          {/* Badge shields */}
          <View style={styles.badgesArea}>
            {earnableBadges.length > 0 ? (
              earnableBadges.map((badge) => (
                <BadgeShield
                  key={badge.slug}
                  type={badge.type}
                  tier={badge.tier}
                  slug={badge.slug}
                  size={30}
                  earned={badge.earned}
                />
              ))
            ) : (
              // Fallback when badges haven't loaded yet
              <BadgeShield
                type="adherence"
                tier={1}
                slug="fiel_ao_plano"
                size={30}
                earned={false}
              />
            )}
          </View>
        </View>

        <View style={styles.separator} />

        {/* ── Section 3: Start button ───────────────────────────────────── */}
        <View style={styles.section3}>
          <Pressable
            style={[styles.startBtn, !isButtonEnabled && styles.startBtnDisabled]}
            onPress={isButtonEnabled ? onStartWorkout : undefined}
            disabled={!isButtonEnabled}
            accessibilityRole="button"
            accessibilityLabel="Começar treino"
            accessibilityState={{ disabled: !isButtonEnabled }}
          >
            <MaterialCommunityIcons
              name="run"
              size={20}
              color={isButtonEnabled ? '#FFFFFF' : BTN_DISABLED_TEXT}
            />
            <Text
              style={[
                styles.startBtnText,
                !isButtonEnabled && styles.startBtnTextDisabled,
              ]}
            >
              Começar treino
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
);

WorkoutCard.displayName = 'WorkoutCard';

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card container
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  cardActive: {
    borderWidth: 2,
    borderColor: CARD_BORDER_ACTIVE,
  },
  cardCompleted: {
    borderWidth: 0,
  },

  // Section 1
  section1: {
    flexDirection: 'row',
    paddingTop: 17,
    paddingBottom: 17,
    paddingLeft: 19,
    minHeight: 107,
  },
  textArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  workoutName: {
    fontSize: 20,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  intensityText: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  checkboxArea: {
    width: 93,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: CHECKBOX_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: CHECKBOX_CHECKED_BG,
    borderColor: CHECKBOX_CHECKED_BG,
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: SEPARATOR,
    marginHorizontal: 13,
  },

  // Section 2
  section2: {
    flexDirection: 'row',
    minHeight: 68,
    alignItems: 'center',
    paddingLeft: 13,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    paddingLeft: 12,
    paddingVertical: 9,
    justifyContent: 'center',
    gap: 6,
  },
  statColMiddle: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: SEPARATOR,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  badgesArea: {
    width: 94,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: SEPARATOR,
    paddingRight: 4,
  },

  // Section 3
  section3: {
    paddingHorizontal: 15,
    paddingVertical: 19,
  },
  startBtn: {
    backgroundColor: BTN_ACTIVE_BG,
    borderRadius: 10,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  startBtnDisabled: {
    backgroundColor: BTN_DISABLED_BG,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  startBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: BTN_ACTIVE_TEXT,
  },
  startBtnTextDisabled: {
    color: BTN_DISABLED_TEXT,
  },
});
