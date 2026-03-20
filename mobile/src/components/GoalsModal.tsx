import React, { memo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { GoalStep } from '../types/workoutGoals';

// ─── Design Tokens (Figma node 666:560) ──────────────────────────────────────
const T = {
  modalBg: '#1C1C2E',
  blockBg: '#15152A',
  borderDefault: 'rgba(235,235,245,0.1)',
  borderActive: '#00D4FF',
  borderCompleted: 'rgba(0,127,153,0.3)',
  cyan: '#00D4FF',
  textPrimary: '#EBEBF5',
  textSecondary: 'rgba(235,235,245,0.60)',
  checkGreen: '#32CD32',
  circleGray: 'rgba(235,235,245,0.30)',
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Props ───────────────────────────────────────────────────────────────────
interface GoalsModalProps {
  visible: boolean;
  onClose: () => void;
  goalSteps: GoalStep[];
}

// ─── Block Card ──────────────────────────────────────────────────────────────
const GoalBlockCard = memo(({ step, blockDistance }: { step: GoalStep; blockDistance: number }) => {
  const isMain = step.type === 'main';
  const isCompleted = step.status === 'completed';
  const isActive = step.status === 'active';

  // Border color: completed → accent muted, active main → cyan, default → glass stroke
  const borderColor = isCompleted
    ? T.borderCompleted
    : isActive && isMain
    ? T.borderActive
    : T.borderDefault;

  // Progress: currentValue já é relativo ao bloco (calculado no hook)
  const progress = blockDistance > 0
    ? Math.min(step.currentValue / blockDistance, 1)
    : 0;

  // Formato de distância para exibição
  const distKm = blockDistance / 1000;
  const durationLabel = distKm >= 1
    ? `${distKm.toFixed(1)} km`
    : `${Math.round(blockDistance)}m`;

  return (
    <View style={[styles.blockCard, { borderColor }]}>
      {/* ── Header do bloco ─────────────────────────────────────────────── */}
      <View style={styles.blockHeader}>
        <View style={styles.blockHeaderText}>
          <Text
            style={[
              styles.blockLabel,
              isActive && isMain && styles.blockLabelGlow,
            ]}
          >
            {step.blockLabel}
          </Text>
          <Text
            style={[
              styles.blockTitle,
              isCompleted && { color: T.cyan },
            ]}
          >
            {step.title}
          </Text>
        </View>

        {/* Ícone de status */}
        <View style={styles.blockStatusIcon}>
          {isCompleted ? (
            <Ionicons name="checkmark-circle" size={30} color={T.cyan} />
          ) : (
            <MaterialCommunityIcons
              name="circle-outline"
              size={30}
              color={isActive ? T.cyan : T.circleGray}
            />
          )}
        </View>
      </View>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <View style={styles.blockDivider} />

      {/* ── Detalhes do bloco ───────────────────────────────────────────── */}
      <View style={styles.blockDetails}>
        {/* Ícone de tempo (para warmup/cooldown) ou sem ícone para main */}
        {!isMain && (
          <View style={styles.timeIconContainer}>
            <Ionicons name="time-outline" size={30} color={T.textSecondary} />
          </View>
        )}

        <View style={styles.blockDetailsText}>
          <Text style={styles.detailTitle}>{durationLabel}</Text>
          <Text style={styles.detailDescription}>{step.description}</Text>
        </View>

        {/* Pace (só para main) */}
        {isMain && step.pace && (
          <View style={styles.paceContainer}>
            <Text style={styles.paceText}>{step.pace}</Text>
          </View>
        )}
      </View>

      {/* ── Recovery section (só para main) ─────────────────────────────── */}
      {isMain && step.recovery && (
        <View style={styles.blockRecovery}>
          <View style={styles.blockDetailsText}>
            <Text style={styles.detailTitle}>Recuperação 1:30 min</Text>
            <Text style={styles.detailDescription}>Trote ou caminhada leve</Text>
          </View>
        </View>
      )}

      {/* ── Progress bar (sutil, só etapa ativa) ────────────────────────── */}
      {isActive && (
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
        </View>
      )}
    </View>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────
export function GoalsModal({ visible, onClose, goalSteps }: GoalsModalProps) {

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={styles.modalContainer}
          onPress={(e) => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Etapas do treino</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Fechar modal de metas"
            >
              <Ionicons name="close" size={24} color={T.textPrimary} />
            </Pressable>
          </View>

          {/* ── Blocks ScrollView ───────────────────────────────────────── */}
          <ScrollView
            style={styles.blocksScroll}
            contentContainerStyle={styles.blocksContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {goalSteps.map((step, index) => {
              const prevTarget = index > 0 ? goalSteps[index - 1].targetValue : 0;
              const blockDistance = step.targetValue - prevTarget;
              return (
                <GoalBlockCard key={step.id} step={step} blockDistance={blockDistance} />
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '92%',
    maxHeight: SCREEN_HEIGHT * 0.90,
    backgroundColor: T.modalBg,
    borderRadius: 20,
    paddingHorizontal: 5,
    paddingTop: 15,
    paddingBottom: 0,
    overflow: 'hidden',
  },

  // ── Header
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    marginBottom: 5,
    position: 'relative',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: T.cyan,
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 8,
    top: 4,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Blocks scroll
  blocksScroll: {
    flexShrink: 1,
  },
  blocksContent: {
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 10,
  },

  // ── Block card
  blockCard: {
    backgroundColor: T.blockBg,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  blockHeaderText: {
    flex: 1,
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: T.textSecondary,
    marginBottom: 2,
  },
  blockLabelGlow: {
    color: T.cyan,
    textShadowColor: T.cyan,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: T.textPrimary,
  },
  blockStatusIcon: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Divider
  blockDivider: {
    height: 1,
    backgroundColor: T.borderDefault,
    marginHorizontal: 11,
  },

  // ── Details
  blockDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    paddingVertical: 12,
  },
  timeIconContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockDetailsText: {
    flex: 1,
    paddingLeft: 9,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: T.cyan,
    marginBottom: 2,
  },
  detailDescription: {
    fontSize: 13,
    fontWeight: '500',
    color: T.textSecondary,
  },
  paceContainer: {
    paddingLeft: 8,
  },
  paceText: {
    fontSize: 13,
    fontWeight: '500',
    color: T.cyan,
  },

  // ── Recovery section
  blockRecovery: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    paddingBottom: 14,
    paddingTop: 4,
  },

  // ── Progress bar
  progressBarContainer: {
    height: 3,
    backgroundColor: 'rgba(0,212,255,0.15)',
  },
  progressBar: {
    height: 3,
    backgroundColor: T.cyan,
    borderRadius: 2,
  },
});
