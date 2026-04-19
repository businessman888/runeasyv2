import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BadgeShield } from './BadgeShield';

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

interface WorkoutCardProps {
  workout: WorkoutData;
  isToday: boolean;
  isCompleted: boolean;
  onStartWorkout: () => void;
  allBadges: BadgeData[];
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
  };
  return `Nível de intensidade: ${labels[type] ?? 'Moderada'}`;
}

function getPaceMinutes(workout: WorkoutData): number {
  if (workout.instructions_json?.length > 0) {
    const main =
      workout.instructions_json.find((i) => i.type === 'main') ??
      workout.instructions_json[0];
    if (main?.pace_min) return main.pace_min;
  }
  const defaults: Record<string, number> = {
    easy_run: 6.5,
    long_run: 6.0,
    intervals: 5.0,
    tempo: 5.5,
    recovery: 7.0,
  };
  return defaults[workout.type] ?? 6.0;
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

function getEarnableSlugs(workout: WorkoutData): string[] {
  const pace = getPaceMinutes(workout);
  const dist = workout.distance_km;
  const estMins = pace * dist;

  type Candidate = { slug: string; priority: number };
  const candidates: Candidate[] = [];

  // Distance milestones
  if (dist >= 42) candidates.push({ slug: 'maratona_completa', priority: 10 });
  else if (dist >= 21) candidates.push({ slug: 'maratonista', priority: 9 });

  // Duration milestones
  if (estMins >= 120) candidates.push({ slug: 'duas_horas', priority: 8 });
  else if (estMins >= 60) candidates.push({ slug: 'uma_hora', priority: 7 });

  // Pace milestones (only performance workouts)
  if (workout.type === 'intervals' || workout.type === 'tempo') {
    if (pace < 3.5) candidates.push({ slug: 'foguete', priority: 6 });
    else if (pace < 4.0) candidates.push({ slug: 'velocista_iv', priority: 5 });
    else if (pace < 4.5) candidates.push({ slug: 'velocista_iii', priority: 5 });
    else if (pace < 5.0) candidates.push({ slug: 'velocista_ii', priority: 5 });
    else if (pace < 5.5) candidates.push({ slug: 'velocista_i', priority: 5 });
  }

  // Always relevant
  candidates.push({ slug: 'fiel_ao_plano', priority: 3 });
  candidates.push({ slug: 'primeiro_passo', priority: 1 });

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)
    .map((c) => c.slug);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const WorkoutCard = memo(
  ({ workout, isToday, isCompleted, onStartWorkout, allBadges }: WorkoutCardProps) => {
    const pace = getPaceMinutes(workout);
    const paceStr = formatPace(pace);
    const estimatedTime = formatEstimatedTime(workout);
    const dateLabel = formatCardDate(workout.scheduled_date);
    const intensityLabel = getIntensityLabel(workout.type);
    const workoutName = getWorkoutTypeName(workout.type);

    // Resolve earnable badges against the user's real badge list
    const earnableBadges = useMemo(() => {
      const slugs = getEarnableSlugs(workout);
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
              <Text style={styles.statValue}>
                {workout.distance_km.toFixed(2)} Km
              </Text>
            </View>
            <View style={[styles.statCol, styles.statColMiddle]}>
              <Text style={styles.statLabel}>Tempo</Text>
              <Text style={styles.statValue}>{estimatedTime}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Pace</Text>
              <Text style={styles.statValue}>{paceStr} /km</Text>
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
