/**
 * DevMenuScreen — only registered under __DEV__ in AppNavigator. Lets us
 * exercise the Free flow in dev/preview builds without waiting on a real
 * RevenueCat sandbox event. Reads/writes useDevMenuStore, which the
 * subscriptionStore consults inside __DEV__ gates.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useDevMenuStore } from '../../stores/devMenuStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import type { DevPlanOverride } from '../../utils/devTools';
import { useTrainingStore } from '../../stores/trainingStore';
import {
  __simulateCompletedRun,
  __simulateDeviceStatus,
} from '../../services/garminConnect';

const OPTIONS: { value: DevPlanOverride; label: string; description: string }[] = [
  { value: null, label: 'Sem override', description: 'Usa estado real (RevenueCat + backend)' },
  { value: 'free', label: 'Forçar Free', description: 'Esconde features Pro, mostra UpgradeProCard' },
  { value: 'pro', label: 'Forçar Pro', description: 'Libera todas as features Pro' },
  { value: 'trial', label: 'Forçar Trial', description: '7 dias restantes como Pro' },
];

export function DevMenuScreen({ navigation }: any) {
  const { planOverride, setPlanOverride, hydrate } = useDevMenuStore();
  const subscription = useSubscriptionStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const applyOverride = async (value: DevPlanOverride) => {
    await setPlanOverride(value);
    await useSubscriptionStore.getState().fetchSubscription();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.white} />
        </Pressable>
        <Text style={styles.title}>Dev Menu</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.banner}>
        <Ionicons name="warning" size={20} color={colors.warning} />
        <Text style={styles.bannerText}>
          Disponível apenas em builds de desenvolvimento. Não aparece em produção.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Subscription Override</Text>
      <Text style={styles.helperText}>
        Override atual:{' '}
        <Text style={styles.helperHighlight}>
          {planOverride ?? '—'}
        </Text>
      </Text>

      <View style={styles.optionList}>
        {OPTIONS.map((option) => {
          const isActive = planOverride === option.value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => applyOverride(option.value)}
              style={[styles.optionRow, isActive && styles.optionRowActive]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              {isActive && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Estado atual</Text>
      <View style={styles.stateCard}>
        <StateRow label="Plan" value={subscription.plan} />
        <StateRow label="Status" value={subscription.status} />
        <StateRow label="isProUser" value={String(subscription.isProUser)} />
        <StateRow label="Trial expira" value={subscription.trialExpiresAt ?? '—'} />
        <StateRow label="Dias restantes (trial)" value={String(subscription.daysRemainingInTrial)} />
        <StateRow
          label="Last fetched"
          value={subscription.lastFetchedAt ? new Date(subscription.lastFetchedAt).toLocaleTimeString() : '—'}
        />
      </View>

      <Pressable
        onPress={() => useSubscriptionStore.getState().fetchSubscription()}
        style={styles.refreshButton}
      >
        <Ionicons name="refresh" size={18} color={colors.primary} />
        <Text style={styles.refreshText}>Refetch /users/me/subscription</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Garmin Connect IQ Mock</Text>
      <Text style={styles.helperText}>
        Simula eventos do relógio Garmin sem precisar do hardware. Útil pra validar
        o pipeline `completeWorkout` / `completeFreeRun` com source=&apos;garmin_watch&apos;.
      </Text>

      <View style={styles.optionList}>
        <Pressable
          style={styles.optionRow}
          onPress={() => __simulateCompletedRun()}
          accessibilityRole="button"
          accessibilityLabel="Simular corrida livre Garmin"
        >
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionLabel}>Simular corrida livre</Text>
            <Text style={styles.optionDescription}>
              Dispara WORKOUT_COMPLETE sem workout_id → completeFreeRun()
            </Text>
          </View>
          <Ionicons name="play-circle" size={28} color={colors.primary} />
        </Pressable>

        <Pressable
          style={styles.optionRow}
          onPress={() => {
            const today = useTrainingStore.getState().today;
            const workoutId = today?.workout?.id;
            if (!workoutId) {
              console.warn('[DevMenu] Nenhum treino do dia para simular');
              return;
            }
            __simulateCompletedRun({ workout_id: workoutId });
          }}
          accessibilityRole="button"
          accessibilityLabel="Simular treino do dia Garmin"
        >
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionLabel}>Simular treino do dia</Text>
            <Text style={styles.optionDescription}>
              Usa o today.workout.id → completeWorkout() + AI feedback
            </Text>
          </View>
          <Ionicons name="play-circle" size={28} color={colors.primary} />
        </Pressable>

        <Pressable
          style={styles.optionRow}
          onPress={() => __simulateDeviceStatus('connected')}
          accessibilityRole="button"
          accessibilityLabel="Simular dispositivo conectado"
        >
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionLabel}>Simular Garmin conectado</Text>
            <Text style={styles.optionDescription}>
              Emite onDeviceStatusChange(connected) — útil pra testar GarminCard
            </Text>
          </View>
          <Ionicons name="bluetooth" size={28} color={colors.primary} />
        </Pressable>

        <Pressable
          style={styles.optionRow}
          onPress={() => __simulateDeviceStatus('not_connected')}
          accessibilityRole="button"
          accessibilityLabel="Simular dispositivo desconectado"
        >
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionLabel}>Simular Garmin desconectado</Text>
            <Text style={styles.optionDescription}>
              Emite onDeviceStatusChange(not_connected)
            </Text>
          </View>
          <Ionicons name="cloud-offline" size={28} color={colors.warning} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={styles.stateValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 196, 0, 0.10)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  bannerText: {
    color: colors.textLight,
    fontSize: typography.fontSizes.md,
    flexShrink: 1,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    marginBottom: spacing.base,
  },
  helperHighlight: {
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  optionList: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  optionRow: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  optionRowActive: {
    borderColor: colors.primary,
  },
  optionTextWrap: {
    flexShrink: 1,
  },
  optionLabel: {
    color: colors.white,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  optionDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    marginTop: 2,
  },
  stateCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stateLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
  },
  stateValue: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  refreshText: {
    color: colors.primary,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
});

export default DevMenuScreen;
