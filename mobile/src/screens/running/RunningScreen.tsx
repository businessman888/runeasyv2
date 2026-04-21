import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTracking } from '../../hooks/useTracking';
import { useWorkoutGoals } from '../../hooks/useWorkoutGoals';
import { useTrainingStore } from '../../stores';
import { GoalsModal } from '../../components/GoalsModal';
import { MapLocationPuck } from '../../components/map/MapLocationPuck';
import type { WorkoutBlockAPI } from '../../types/workoutGoals';

// ─── Tipos de rota ────────────────────────────────────────────────────────────
type RunningRouteParams = {
  Running: {
    workoutId?: string;
    dayLabel?: string;
    title?: string;
    workoutBlocks?: WorkoutBlockAPI[];
  };
};

// ─── Design Tokens (Figma) ────────────────────────────────────────────────────
const T = {
  // Backgrounds
  bgPrimary: '#0E0E1F',
  cardSurface: '#1C1C2E',
  // Accent
  cyan: '#00D4FF',
  warning: '#FFC400',
  // Text
  textPrimary: '#EBEBF5',
  textSecondary: 'rgba(235, 235, 245, 0.60)',
  // Route
  routeColor: '#00D4FF',
};



// ─── Component ────────────────────────────────────────────────────────────────
export function RunningScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RunningRouteParams, 'Running'>>();
  const insets = useSafeAreaInsets();
  const [hasGPSFix, setHasGPSFix] = useState(false);
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const cameraRef = useRef<Mapbox.Camera>(null);

  const {
    isReady,
    sessionState,
    routeCoordinates,
    distance,
    timeMs,
    currentPace,
    formattedTime,
    initialPosition,
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
  } = useTracking(route.params?.workoutId);

  const completeWorkout = useTrainingStore((s) => s.completeWorkout);

  // ── Finalização segura do treino ──────────────────────────────────────
  const handleFinish = useCallback(async () => {
    const workoutId = route.params?.workoutId;
    console.log(`[RunningScreen] handleFinish iniciado. workoutId=${workoutId}`);

    setIsFinishing(true);

    // 1. Captura dados finais (GPS para, mas MMKV NÃO é limpo ainda)
    let trackingData: { distance: number; timeMs: number; routeData: any[] };
    try {
      trackingData = await finishTracking();
      console.log(`[RunningScreen] finishTracking OK. dist=${trackingData.distance}m, time=${trackingData.timeMs}ms, pontos=${trackingData.routeData.length}`);
    } catch (error) {
      console.error('[RunningScreen] Erro no finishTracking:', error);
      Alert.alert(
        'Erro ao capturar dados',
        'Não foi possível finalizar a captura GPS. Seus dados de tracking estão preservados no dispositivo. Tente novamente.',
        [{ text: 'OK' }],
      );
      setIsFinishing(false);
      return;
    }

    // 2. Envia ao backend (save-first: dados salvos em MMKV ANTES da tentativa de API)
    let savedLocally = false;
    try {
      const result = await completeWorkout({
        workoutId: workoutId || `local_${Date.now()}`,
        route_points: trackingData.routeData,
        total_distance_meters: trackingData.distance,
        duration_seconds: Math.round(trackingData.timeMs / 1000),
      });
      savedLocally = result.savedLocally;
      console.log(`[RunningScreen] completeWorkout resultado: success=${result.success}, savedLocally=${result.savedLocally}`);
    } catch (error) {
      // completeWorkout já salva localmente internamente, mas por segurança:
      console.error('[RunningScreen] Erro inesperado no completeWorkout:', error);
      savedLocally = true;
    }

    // 3. Dados foram salvos (backend OU local) — agora limpa o tracking MMKV
    clearTracking();
    console.log('[RunningScreen] clearTracking executado');

    // 4. Navega para tela de resumo
    try {
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Main' as never },
          {
            name: 'RunSummary' as never,
            params: {
              workoutId: workoutId || undefined,
              distance: trackingData.distance,
              timeMs: trackingData.timeMs,
              routeCoordinates: trackingData.routeData.map(
                (p: { longitude: number; latitude: number }) => [p.longitude, p.latitude]
              ),
              savedLocally,
            },
          },
        ],
      });
    } catch (navError) {
      console.error('[RunningScreen] Erro na navegação pós-treino:', navError);
      // Dados já foram salvos — fallback: volta pra Home
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' as never }],
        });
      } catch (e) {
        console.error('[RunningScreen] Erro crítico na navegação fallback:', e);
      }
    } finally {
      setIsFinishing(false);
    }
  }, [route.params?.workoutId, finishTracking, completeWorkout, clearTracking, navigation]);

  // ── Sistema de Metas ────────────────────────────────────────────────────
  const workoutBlocks = route.params?.workoutBlocks;
  const { goalSteps, allCompleted, hasGoals } = useWorkoutGoals({
    workoutBlocks,
    distance,
    timeMs,
    sessionState,
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Carregando módulo GPS...</Text>
      </View>
    );
  }

  // ── GeoJSON da rota ───────────────────────────────────────────────────────
  const geoJsonSource = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates.length > 0 ? routeCoordinates : [[0, 0]],
        },
      },
    ],
  };

  // ── Status derivados ──────────────────────────────────────────────────────
  const isCalculating = sessionState === 'calculating';
  const isTraining    = sessionState === 'training';
  const isPaused      = sessionState === 'paused';
  const isFinished    = sessionState === 'finished';

  const statusBannerBg =
    isTraining  ? T.cyan :
    isPaused    ? T.warning :
    T.cardSurface;

  const statusText =
    isCalculating ? (hasGPSFix ? 'GPS Pronto' : 'Calculando GPS') :
    isTraining    ? 'Treinando' :
    'Parado';

  const statusTextColor =
    isCalculating ? T.cyan :
    T.bgPrimary;

  // Valores numéricos coloridos apenas quando treinando
  const metricColor = isTraining ? T.cyan : T.textPrimary;

  // Label de distância formatada (km com 2 casas)
  const distanceFormatted = (distance / 1000).toFixed(2);

  // Data/treino extraídos dos params de rota (passados pelo HomeScreen)
  const now = new Date();
  const dayLabel = route.params?.dayLabel
    ?? `Hoje ${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}`;
  const workoutTitle = route.params?.title ?? 'Meu Treino';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── MAP FULL SCREEN ─────────────────────────────────────────────── */}
      <Mapbox.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/dark-v11'}
        logoEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          pitch={0}
          zoomLevel={18.5}
          animationDuration={800}
          followUserLocation={isFollowingUser}
          followUserMode={Mapbox.UserTrackingMode.FollowWithHeading}
          onUserTrackingModeChange={(e) => {
            // Mapbox desabilita follow quando o usuário arrasta o mapa manualmente
            if (!e.nativeEvent.payload.followUserLocation) {
              setIsFollowingUser(false);
            }
          }}
          defaultSettings={{
            zoomLevel: 18.5,
            animationDuration: 0,
            centerCoordinate: initialPosition || undefined,
          }}
        />
        {/* Indicador de localização customizado (componentizado) */}
        <MapLocationPuck onGPSFix={() => { if (!hasGPSFix) setHasGPSFix(true); }} />

        {/* Rastro da corrida — glow + linha principal */}
        {routeCoordinates.length > 1 && (
          <Mapbox.ShapeSource id="routeSource" shape={geoJsonSource as any}>
            <Mapbox.LineLayer
              id="routeGlow"
              style={{
                lineColor: T.routeColor,
                lineWidth: 16,
                lineOpacity: 0.35,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
            <Mapbox.LineLayer
              id="routeFill"
              style={{
                lineColor: T.routeColor,
                lineWidth: 7,
                lineOpacity: 1,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>

      {/* ── HEADER OVERLAY ──────────────────────────────────────────────── */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.headerRow}>

          {/* Botão voltar */}
          <Pressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={22} color={T.textPrimary} />
          </Pressable>

          {/* Card de info do treino */}
          <View style={styles.workoutCard}>
            <Text style={styles.workoutDay}>{dayLabel}</Text>
            <Text style={styles.workoutTitle} numberOfLines={1}>{workoutTitle}</Text>
          </View>

          {/* Botão de Metas — check verde quando todas concluídas */}
          {hasGoals && (
            <Pressable
              style={[
                styles.goalsBtn,
                allCompleted && styles.goalsBtnCompleted,
              ]}
              onPress={() => setGoalsModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Ver metas do treino"
            >
              {allCompleted ? (
                <Ionicons name="checkmark-circle" size={24} color="#32CD32" />
              ) : (
                <Ionicons name="cellular" size={22} color={T.cyan} />
              )}
            </Pressable>
          )}

        </View>
      </SafeAreaView>

      {/* ── RECENTER FAB — aparece quando o usuário arrasta o mapa ──────── */}
      {!isFollowingUser && (
        <Pressable
          style={[styles.recenterBtn, { top: insets.top + 70 }]}
          onPress={() => {
            // Re-habilita follow: seta false primeiro para forçar re-mount do Camera
            setIsFollowingUser(false);
            requestAnimationFrame(() => setIsFollowingUser(true));
          }}
          accessibilityRole="button"
          accessibilityLabel="Centralizar no meu local"
        >
          <Ionicons name="locate" size={22} color={T.cyan} />
        </Pressable>
      )}

      {/* ── BOTTOM PANEL ────────────────────────────────────────────────── */}
      <View style={styles.bottomPanel}>

        {/* Card de telemetria flutuante */}
        <View style={styles.telemetryCard}>

          {/* Banner de status */}
          <View style={[styles.statusBanner, { backgroundColor: statusBannerBg }]}>
            {isCalculating && (
              <Ionicons
                name="locate"
                size={14}
                color={T.cyan}
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={[styles.statusText, { color: statusTextColor }]}>
              {statusText}
            </Text>
            {/* Ícone de expandir */}
            <Pressable style={styles.expandBtn} accessibilityLabel="Expandir">
              <Ionicons
                name="expand-outline"
                size={16}
                color={isCalculating ? T.textSecondary : T.bgPrimary}
              />
            </Pressable>
          </View>

          {/* Métricas */}
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: metricColor }]}>{formattedTime}</Text>
              <Text style={styles.metricLabel}>Tempo</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: metricColor }]}>{currentPace}</Text>
              <Text style={styles.metricLabel}>Pace</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: metricColor }]}>{distanceFormatted}</Text>
              <Text style={styles.metricLabel}>Distância</Text>
            </View>
          </View>
        </View>

        {/* Área de botões */}
        <View style={[styles.btnArea, { paddingBottom: insets.bottom + 16 }]}>

          {/* Estado: Calculando → Iniciar */}
          {isCalculating && (
            <Pressable
              style={[styles.ctaBtn, styles.ctaBtnOutline]}
              onPress={startResumeTracking}
              accessibilityRole="button"
              accessibilityLabel="Iniciar treino"
            >
              <Ionicons name="play" size={20} color={T.textPrimary} style={{ marginRight: 8 }} />
              <Text style={[styles.ctaBtnText, { color: T.textPrimary }]}>Iniciar</Text>
            </Pressable>
          )}

          {/* Estado: Treinando → Parar */}
          {isTraining && (
            <Pressable
              style={[styles.ctaBtn, styles.ctaBtnOutlineCyan]}
              onPress={pauseTracking}
              accessibilityRole="button"
              accessibilityLabel="Parar treino"
            >
              <Ionicons name="pause" size={20} color={T.cyan} style={{ marginRight: 8 }} />
              <Text style={[styles.ctaBtnText, { color: T.cyan }]}>Parar</Text>
            </Pressable>
          )}

          {/* Estado: Pausado → Continuar + Finalizar */}
          {isPaused && (
            <>
              <Pressable
                style={[styles.ctaBtn, styles.ctaBtnOutlineCyan, { flex: 1 }]}
                onPress={startResumeTracking}
                disabled={isFinishing}
                accessibilityRole="button"
                accessibilityLabel="Continuar treino"
              >
                <Ionicons name="play" size={20} color={T.cyan} style={{ marginRight: 8 }} />
                <Text style={[styles.ctaBtnText, { color: T.cyan }]}>Continuar</Text>
              </Pressable>
              <Pressable
                style={[styles.ctaBtn, styles.ctaBtnFilled, { flex: 1 }, isFinishing && { opacity: 0.6 }]}
                onPress={handleFinish}
                disabled={isFinishing}
                accessibilityRole="button"
                accessibilityLabel="Finalizar treino"
              >
                {isFinishing ? (
                  <ActivityIndicator size="small" color={T.bgPrimary} />
                ) : (
                  <>
                    <Ionicons name="flag" size={20} color={T.bgPrimary} style={{ marginRight: 8 }} />
                    <Text style={[styles.ctaBtnText, { color: T.bgPrimary }]}>Finalizar</Text>
                  </>
                )}
              </Pressable>
            </>
          )}

        </View>
      </View>

      {/* ── GOALS MODAL ──────────────────────────────────────────────── */}
      <GoalsModal
        visible={goalsModalVisible}
        onClose={() => setGoalsModalVisible(false)}
        goalSteps={goalSteps}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Layout base
  container: {
    flex: 1,
    backgroundColor: '#0E0E1F',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0E0E1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(235,235,245,0.60)',
    fontSize: 14,
  },

  // ── Header
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: {
    width: 44,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workoutCard: {
    flex: 1,
    height: 50,
    backgroundColor: '#1C1C2E',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#EBEBF5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  workoutDay: {
    color: 'rgba(235,235,245,0.60)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  workoutTitle: {
    color: '#EBEBF5',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  goalsBtn: {
    width: 50,
    height: 50,
    backgroundColor: '#1C1C2E',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  goalsBtnCompleted: {
    borderWidth: 2,
    borderColor: '#32CD32',
  },

  // ── Recenter FAB
  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1C1C2E',
    borderWidth: 1,
    borderColor: '#00D4FF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },

  // ── Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },

  // ── Telemetry card
  telemetryCard: {
    backgroundColor: '#0E0E1F',
    marginHorizontal: 11,
    marginBottom: 8,
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  statusBanner: {
    height: 37,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  expandBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 67,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(235,235,245,0.12)',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  metricLabel: {
    color: 'rgba(235,235,245,0.60)',
    fontSize: 11,
    fontWeight: '400',
  },

  // ── Buttons area
  btnArea: {
    backgroundColor: '#0E0E1F',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 16, // overridden inline with insets.bottom + 16
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 20,
    paddingHorizontal: 20,
  },
  ctaBtnOutline: {
    backgroundColor: '#1C1C2E',
    borderWidth: 1,
    borderColor: '#EBEBF5',
  },
  ctaBtnOutlineCyan: {
    backgroundColor: '#1C1C2E',
    borderWidth: 1,
    borderColor: '#00D4FF',
  },
  ctaBtnFilled: {
    backgroundColor: '#00D4FF',
    borderWidth: 1,
    borderColor: '#00D4FF',
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
