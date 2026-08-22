import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTracking } from '../../hooks/useTracking';
import { useWorkoutGoals } from '../../hooks/useWorkoutGoals';
import { GoalsModal } from '../../components/GoalsModal';
import { LocationDisclosureModal } from '../../components/LocationDisclosureModal';
import { MapLocationPuck } from '../../components/map/MapLocationPuck';
import { getGpsQuality } from '../../components/map/GpsSignalBars';
import { ExpandedMetricsOverlay } from './ExpandedMetricsOverlay';
import { LowPowerBanner } from '../../components/map/LowPowerBanner';
import { OSMOverlayLayers } from '../../components/map/OSMOverlayLayers';
import { useLowPowerMode } from '../../hooks/useLowPowerMode';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { trackingStorage } from '../../tasks/locationTask';
import { TreadmillRunningView } from './TreadmillRunningView';
import type { WorkoutBlockAPI } from '../../types/workoutGoals';
import { useCoach } from '../../hooks/useCoach';
import { CoachBell } from '../../components/coach/CoachBell';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { COACH_MMKV } from '../../services/coach/coachConfig';
import { resetCoachRun, stopCoach, enqueue as enqueueCoach } from '../../services/coach/coachOrchestrator';
import { buildMotivFinish } from '../../services/coach/coachMessages';
import { LinearGradient } from 'expo-linear-gradient';
import { semanticColors } from '../../theme/semanticColors';

// ─── Tipos de rota ────────────────────────────────────────────────────────────
export type RunMode = 'planned' | 'manual' | 'free';

type RunningRouteParams = {
  Running: {
    workoutId?: string;
    dayLabel?: string;
    title?: string;
    workoutBlocks?: WorkoutBlockAPI[];
    mode?: RunMode;
    /** Para modo 'manual': pace alvo em segundos/km (usado em Goals e na comparação no Summary) */
    targetPaceSeconds?: number;
    /** Para modo 'manual': distância alvo em km */
    targetDistanceKm?: number;
    /** Ambiente do treino. 'treadmill' substitui o fluxo GPS por leitura FTMS/manual. */
    environment?: 'outdoor' | 'treadmill';
  };
};

// ─── Design Tokens (Figma) ────────────────────────────────────────────────────
const T = {
  // Backgrounds
  bgPrimary: semanticColors.canvas,
  cardSurface: semanticColors.surface2,
  // Accent
  cyan: semanticColors.accent,
  warning: '#FFC400',
  // Text
  textPrimary: semanticColors.textPrimary,
  textSecondary: semanticColors.textSecondary,
  // Route
  routeColor: semanticColors.accent,
};



// Pace de split (segundos/km) → "M:SS". Exibição da unidade única de armazenamento.
function formatSplit(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm == null || !isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:--';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * Top-level Running route. Switches between the outdoor GPS view and the
 * treadmill view based on the `environment` param. Splitting at the route
 * level lets the outdoor branch keep using its hooks (useTracking, etc.)
 * unchanged — the treadmill branch never instantiates them.
 */
export function RunningScreen() {
  const route = useRoute<RouteProp<RunningRouteParams, 'Running'>>();

  if (route.params?.environment === 'treadmill') {
    const mode: RunMode =
      route.params?.mode ?? (route.params?.workoutId ? 'planned' : 'free');
    return (
      <TreadmillRunningView
        workoutId={route.params?.workoutId}
        dayLabel={route.params?.dayLabel}
        title={route.params?.title}
        mode={mode}
        targetPaceSeconds={route.params?.targetPaceSeconds}
        targetDistanceKm={route.params?.targetDistanceKm}
        workoutBlocks={route.params?.workoutBlocks}
      />
    );
  }

  return <OutdoorRunningView />;
}

function OutdoorRunningView() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RunningRouteParams, 'Running'>>();
  const insets = useSafeAreaInsets();
  // Tablet landscape: mapa ocupa a esquerda e o painel de telemetria vira uma
  // coluna lateral à direita (controles do mapa migram p/ a esquerda). Phone
  // (sideLayout=false) mantém o painel inferior flutuante original.
  const { isTablet, isLandscape } = useBreakpoint();
  const sideLayout = isTablet && isLandscape;
  const [hasGPSFix, setHasGPSFix] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const cameraRef = useRef<Mapbox.Camera>(null);
  const isLowPower = useLowPowerMode();
  // Camada de trilhas/parques OSM — preferência persistida; default OFF (mapa limpo).
  const [showTrails, setShowTrails] = useState(
    () => trackingStorage.getBoolean('pref_show_trails') ?? false,
  );
  const toggleTrails = useCallback(() => {
    setShowTrails((prev) => {
      const next = !prev;
      trackingStorage.set('pref_show_trails', next);
      return next;
    });
  }, []);

  const {
    isReady,
    sessionState,
    routeCoordinates,
    distance,
    timeMs,
    currentPace,
    smoothedPace,
    liveSplits,
    formattedTime,
    gpsAccuracy,
    initialPosition,
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
    locationDisclosureVisible,
    requestLocationPermission,
    dismissLocationDisclosure,
  } = useTracking(route.params?.workoutId);

  const mode: RunMode = route.params?.mode ?? (route.params?.workoutId ? 'planned' : 'free');
  const isFreeMode = mode === 'free';

  // ── Coach de áudio ──────────────────────────────────────────────────────
  const isProUser = useSubscriptionStore((s) => s.isProUser);
  const { enabled: coachEnabled, lastMessage, unread, markRead } = useCoach(true);

  // Reset do estado de split SÓ na montagem (nova corrida) — não herda km/último
  // aviso de uma sessão anterior. Separado do snapshot para que uma atualização de
  // assinatura no meio da corrida não apague os splits já falados.
  useEffect(() => {
    resetCoachRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot idempotente do contexto do coach no MMKV para o orquestrador (que roda
  // no background/locationTask) ler síncrono. Split é Free/todos os treinos; isPro +
  // mode só passam a importar na Fase 4 (alertas de pace).
  useEffect(() => {
    trackingStorage.set(COACH_MMKV.enabled, coachEnabled); // fecha a janela do rehydrate assíncrono
    trackingStorage.set(COACH_MMKV.mode, mode);
    trackingStorage.set(COACH_MMKV.isPro, isProUser);
    // Estrutura do treino p/ a Fase 4 (segmento ativo/faixa/transições) — só plano.
    // O orquestrador (background) lê daqui, pois não tem acesso a route params.
    if (mode === 'planned') {
      trackingStorage.set(
        COACH_MMKV.segments,
        JSON.stringify(route.params?.workoutBlocks ?? []),
      );
    } else {
      trackingStorage.set(COACH_MMKV.segments, '');
    }
  }, [mode, isProUser, coachEnabled, route.params?.workoutBlocks]);

  // Ao pausar, interrompe qualquer fala em andamento (a flag tracking_paused já
  // silencia novos avisos; isto corta o que estiver falando na hora).
  useEffect(() => {
    if (sessionState === 'paused') stopCoach();
  }, [sessionState]);

  // ── Prominent Disclosure de localização (Google Play) ──────────────────
  // "Permitir" dispara o pedido nativo; "Agora não" fecha sem consentir. Em
  // ambos, se a corrida não pode prosseguir (sem permissão de foreground), saímos
  // da tela em vez de ficar preso no loader "Localizando você...".
  const handleAllowLocation = useCallback(async () => {
    const canProceed = await requestLocationPermission();
    if (!canProceed) navigation.goBack();
  }, [requestLocationPermission, navigation]);

  const handleDismissLocation = useCallback(async () => {
    const canProceed = await dismissLocationDisclosure();
    if (!canProceed) navigation.goBack();
  }, [dismissLocationDisclosure, navigation]);

  // ── Finalização segura do treino ──────────────────────────────────────
  const handleFinish = useCallback(async () => {
    const workoutId = route.params?.workoutId;
    console.log(`[RunningScreen] handleFinish iniciado. mode=${mode}, workoutId=${workoutId}`);

    // Motivacional de encerramento — enfileirado ANTES de finishTracking (que seta
    // tracking_finished e silencia o coach). Gated internamente a plano+Pro+coach on.
    enqueueCoach(buildMotivFinish());

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

    // 2. Limpa o tracking MMKV — protegido: NUNCA pode bloquear a navegação.
    // (clearTracking chama mmkv.delete + setSessionState; se algo lançar aqui,
    // a Promise rejeita silenciosamente e o overlay de loading nunca sai.)
    try {
      clearTracking();
      console.log('[RunningScreen] clearTracking executado');
    } catch (clearError) {
      console.error('[RunningScreen] Erro ao limpar tracking (ignorado):', clearError);
    }

    // 3. Entrega à WorkoutProcessingScreen, que faz o envio ao backend
    // (save-first dentro da store), o polling do feedback do plano e o
    // roteamento correto: plano → CoachAnalysis (análise pronta) senão Home;
    // manual/livre → RunSummary. Isso substitui o modal de "Finalizando" na
    // própria tela de tracking e impede voltar para o tracking.
    const durationSeconds = Math.round(trackingData.timeMs / 1000);
    // Um treino de plano/manual sempre deveria ter um workoutId real do backend.
    // Se faltar, NÃO inventamos um id sintético (`local_...`) — o backend o
    // rejeita ("Workout not found") e o item ficaria preso no pending. Em vez
    // disso degradamos para free-run, que tem idempotência própria por
    // external_id. `effectiveMode` reflete essa degradação para o roteamento.
    const degradeToFree = !isFreeMode && !workoutId;
    const effectiveMode = degradeToFree ? 'free' : mode;
    const submit = (isFreeMode || degradeToFree)
      ? {
          kind: 'free' as const,
          payload: {
            localId: `free_${Date.now()}`,
            route_points: trackingData.routeData,
            total_distance_meters: trackingData.distance,
            duration_seconds: durationSeconds,
            started_at: new Date(Date.now() - trackingData.timeMs).toISOString(),
          },
        }
      : {
          kind: 'workout' as const,
          payload: {
            workoutId: workoutId as string,
            route_points: trackingData.routeData,
            total_distance_meters: trackingData.distance,
            duration_seconds: durationSeconds,
          },
        };

    const summaryParams = {
      workoutId: workoutId || undefined,
      distance: trackingData.distance,
      timeMs: trackingData.timeMs,
      routePoints: trackingData.routeData,
      routeCoordinates: trackingData.routeData.map(
        (p: { longitude: number; latitude: number }) => [p.longitude, p.latitude]
      ),
      mode: effectiveMode,
      targetPaceSeconds: route.params?.targetPaceSeconds,
      targetDistanceKm: route.params?.targetDistanceKm,
      workoutTitle: route.params?.title,
    };

    console.log('[RunningScreen] Navegando para WorkoutProcessing...');
    try {
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' as never, params: { initialTab: 'Home' } },
          { name: 'WorkoutProcessing' as never, params: { mode: effectiveMode, submit, summaryParams } as never },
        ],
      });
      console.log('[RunningScreen] navigation.reset disparado');
    } catch (navError) {
      console.error('[RunningScreen] Erro no navigation.reset:', navError);
      // Fallback 1: navigate normal
      try {
        (navigation as any).navigate('WorkoutProcessing', { mode: effectiveMode, submit, summaryParams });
      } catch (e) {
        console.error('[RunningScreen] Erro no navigate fallback:', e);
        // Fallback 2: volta pra Home
        try {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Main' as never, params: { initialTab: 'Home' } }],
          });
        } catch (e2) {
          console.error('[RunningScreen] Erro crítico na navegação:', e2);
        }
      }
    } finally {
      setIsFinishing(false);
    }
  }, [route.params?.workoutId, route.params?.title, route.params?.targetPaceSeconds, route.params?.targetDistanceKm, mode, isFreeMode, finishTracking, clearTracking, navigation]);

  // ── Sistema de Metas ────────────────────────────────────────────────────
  const workoutBlocks = route.params?.workoutBlocks;
  const { goalSteps, allCompleted, hasGoals } = useWorkoutGoals({
    workoutBlocks,
    distance,
    timeMs,
    sessionState,
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  // Bloqueia a renderização do Mapbox enquanto a posição inicial não estiver
  // resolvida. Renderizar o MapView sem centerCoordinate faz com que ele
  // inicialize em [0,0] (oceano Atlântico → vista continental). Só montamos
  // o mapa quando temos coordenadas reais para passar à Camera.
  if (!isReady || !initialPosition) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={T.cyan} />
        <Text style={[styles.loadingText, { marginTop: 12 }]}>
          {!isReady ? 'Carregando módulo GPS...' : 'Localizando você...'}
        </Text>

        {/* ── PROMINENT DISCLOSURE de localização (Google Play) ────────────
            Renderizada AQUI (não só na árvore principal) porque o pedido de
            permissão acontece enquanto initialPosition ainda é null — ou seja,
            durante este estado de loading. Aparece ANTES de qualquer popup
            nativo; só "Permitir localização" dispara o pedido real. */}
        <LocationDisclosureModal
          visible={locationDisclosureVisible}
          onAllow={handleAllowLocation}
          onDismiss={handleDismissLocation}
        />
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

  // GPS "pronto" exige fix do puck E precisão decente (good/excellent) — antes do
  // treino o banner reflete o sinal real em vez de só a presença de um fix grosseiro.
  const gpsQuality = getGpsQuality(gpsAccuracy);
  const gpsReady = hasGPSFix && (gpsQuality === 'excellent' || gpsQuality === 'good');

  const statusText =
    isCalculating ? (gpsReady ? 'GPS Pronto' : 'Calculando GPS') :
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

      {/* ── MAP (full screen no phone; ~65% à esquerda em tablet landscape) ── */}
      <Mapbox.MapView
        style={sideLayout ? styles.mapSide : StyleSheet.absoluteFillObject}
        styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/dark-v11'}
        logoEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          pitch={0}
          zoomLevel={17}
          centerCoordinate={initialPosition}
          animationMode="flyTo"
          animationDuration={800}
          followUserLocation={isFollowingUser}
          followUserMode={Mapbox.UserTrackingMode.FollowWithHeading}
          followZoomLevel={17}
          minZoomLevel={12}
          maxZoomLevel={20}
          onUserTrackingModeChange={(e) => {
            // Mapbox desabilita follow quando o usuário arrasta o mapa manualmente
            if (!e.nativeEvent.payload.followUserLocation) {
              setIsFollowingUser(false);
            }
          }}
          defaultSettings={{
            zoomLevel: 17,
            animationDuration: 0,
            centerCoordinate: initialPosition,
          }}
        />

        {/* Realce de trilhas/parques (OSM) — opt-in. Declarado ANTES da rota para
            ficar por baixo do traçado da corrida. */}
        {showTrails && <OSMOverlayLayers />}

        {/* Rastro da corrida — declarado ANTES do puck para que o traçado fique
            ABAIXO do indicador do corredor (Mapbox empilha na ordem de declaração).
            Halo + linha principal no cyan da marca, estilo Strava. */}
        {routeCoordinates.length > 1 && (
          <Mapbox.ShapeSource id="routeSource" shape={geoJsonSource as any}>
            <Mapbox.LineLayer
              id="routeGlow"
              style={{
                lineColor: T.routeColor,
                lineWidth: 14,
                lineOpacity: 0.5,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
            <Mapbox.LineLayer
              id="routeFill"
              style={{
                lineColor: T.routeColor,
                lineWidth: 6,
                lineOpacity: 1,
                lineBlur: 1, // brilho sutil na borda — visual premium
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Indicador de localização customizado — declarado por último para
            renderizar SEMPRE por cima do traçado. */}
        <MapLocationPuck onGPSFix={() => { if (!hasGPSFix) setHasGPSFix(true); }} />
      </Mapbox.MapView>

      {/* ── HEADER OVERLAY ──────────────────────────────────────────────── */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        {/* Scrim de sombra difusa — background quase transparente que escurece no
            topo e desvanece suavemente para baixo, dando legibilidade aos controles
            sobre o mapa sem um container sólido. Fica atrás de tudo (absoluto). */}
        <LinearGradient
          colors={[semanticColors.scrim, semanticColors.glass, semanticColors.transparent]}
          locations={[0, 0.55, 1]}
          pointerEvents="none"
          style={styles.headerScrim}
        />
        <View style={styles.headerRow}>

          {/* Botão voltar — ícone limpo sobre o scrim (sem container). */}
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={24} color={T.textPrimary} />
          </Pressable>

          {/* Título — texto puro centralizado (sem fundo/borda). Absoluto p/ ficar
              sempre no centro da tela, independente das larguras laterais.
              Só aparece em treinos manuais e do plano. */}
          {!isFreeMode && (
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerTitleDay}>{dayLabel}</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{workoutTitle}</Text>
            </View>
          )}

          {/* Metas — canto direito do header (ícone limpo). Movido da coluna
              lateral. Só quando há metas e não é modo livre. */}
          {hasGoals && !isFreeMode ? (
            <Pressable
              style={styles.headerIconBtn}
              onPress={() => setGoalsModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Ver metas do treino"
            >
              {allCompleted ? (
                <Ionicons name="checkmark-circle" size={24} color="#32CD32" />
              ) : (
                <MaterialCommunityIcons name="bullseye-arrow" size={24} color={T.cyan} />
              )}
            </Pressable>
          ) : (
            // Spacer da largura do ícone p/ manter o título centralizado.
            <View style={styles.headerRightSpacer} />
          )}

        </View>

        {/* Banner de modo de economia de bateria — só aparece se o aparelho estiver
            economizando energia (pode degradar a precisão do GPS). */}
        <LowPowerBanner active={isLowPower} />
      </SafeAreaView>

      {/* ── COLUNA DE CONTROLES (lateral direita) ───────────────────────────
          Empilha automaticamente: Metas (topo) → Trilhas → Recentralizar.
          O recenter fica por último, então aparecer/sumir não desloca os outros. */}
      <View
        style={[sideLayout ? styles.rightControlsLeft : styles.rightControls, { top: insets.top + 70 }]}
        pointerEvents="box-none"
      >
        {/* Sino do coach — topo da coluna, só quando o coach está ligado. O balão
            abre à esquerda (não cobre o mapa sozinho — pull, não push). */}
        {coachEnabled && (
          <CoachBell unread={unread} message={lastMessage} onOpen={markRead} />
        )}

        {/* Metas foi movido para o header (canto superior direito). */}

        {/* Trilhas/parques OSM (opt-in) */}
        <Pressable
          style={[styles.mapCircleBtn, showTrails && styles.mapCircleBtnActive]}
          onPress={toggleTrails}
          accessibilityRole="button"
          accessibilityLabel={showTrails ? 'Ocultar trilhas e parques' : 'Mostrar trilhas e parques'}
          accessibilityState={{ selected: showTrails }}
        >
          <Ionicons name="leaf" size={20} color={showTrails ? T.cyan : T.textSecondary} />
        </Pressable>

        {/* Recentralizar — só quando o usuário arrastou o mapa e quebrou o follow */}
        {!isFollowingUser && (
          <Pressable
            style={[styles.mapCircleBtn, styles.mapCircleBtnActive]}
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
      </View>

      {/* ── BOTTOM PANEL (phone) / SIDE PANEL (tablet landscape) ──────────── */}
      <View style={sideLayout ? styles.sidePanel : styles.bottomPanel}>

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
            {/* Ícone de expandir — abre a visão em tela cheia (estilo Strava) */}
            <Pressable
              style={styles.expandBtn}
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Expandir métricas"
              hitSlop={10}
            >
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
              {/* Pace SUAVIZADO (janela deslizante) — base estável p/ a Fase 4.
                  Cai para o cumulativo enquanto a janela não tem amostra. */}
              <Text style={[styles.metricValue, { color: metricColor }]}>
                {smoothedPace !== '--:--' ? smoothedPace : currentPace}
              </Text>
              <Text style={styles.metricLabel}>Pace</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: metricColor }]}>{distanceFormatted}</Text>
              <Text style={styles.metricLabel}>Distância</Text>
            </View>
          </View>

          {/* Splits por km ao vivo (validação da Fase 2; UI colapsável completa é Fase 3) */}
          {liveSplits.length > 0 && (
            <View style={styles.splitsRow}>
              {liveSplits.slice(-4).map((s) => (
                <View key={s.km} style={styles.splitChip}>
                  <Text style={styles.splitKm}>KM {s.km}</Text>
                  <Text style={styles.splitPace}>{formatSplit(s.paceSecPerKm)}</Text>
                </View>
              ))}
            </View>
          )}
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

      {/* ── EXPANDED METRICS (tela cheia, estilo Strava) ──────────────────
          Slide-in por cima de tudo; oculta o mapa e reaproveita o visual da
          esteira (hero "Tempo" + grid de métricas). Puramente apresentacional. */}
      {expanded && (
        <ExpandedMetricsOverlay
          onClose={() => setExpanded(false)}
          timeText={formattedTime}
          paceText={smoothedPace !== '--:--' ? smoothedPace : currentPace}
          distanceText={distanceFormatted}
          isCalculating={isCalculating}
          isTraining={isTraining}
          isPaused={isPaused}
          isFinishing={isFinishing}
          gpsStatusText={statusText}
          onStart={startResumeTracking}
          onPause={pauseTracking}
          onFinish={handleFinish}
          dayLabel={isFreeMode ? undefined : dayLabel}
          workoutTitle={isFreeMode ? undefined : workoutTitle}
          splits={liveSplits}
        />
      )}

      {/* ── GOALS MODAL ──────────────────────────────────────────────── */}
      <GoalsModal
        visible={goalsModalVisible}
        onClose={() => setGoalsModalVisible(false)}
        goalSteps={goalSteps}
      />

      {/* ── FINISHING OVERLAY (pré-carregamento até abrir o RunSummary) ── */}
      {isFinishing && (
        <View style={styles.finishingOverlay}>
          <View style={styles.finishingCard}>
            <View style={styles.finishingSpinnerWrap}>
              <ActivityIndicator size="large" color={T.cyan} />
              <Ionicons
                name="flag"
                size={26}
                color={T.cyan}
                style={styles.finishingFlagIcon}
              />
            </View>
            <Text style={styles.finishingTitle}>Finalizando treino</Text>
            <Text style={styles.finishingSubtitle}>
              Calculando splits, pace e elevação…
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Layout base
  container: {
    flex: 1,
    backgroundColor: semanticColors.canvas,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: semanticColors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: semanticColors.textSecondary,
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Scrim de sombra difusa — gradiente vertical quase transparente atrás do
  // header. Cobre a safe-area do topo + a altura do headerRow e desvanece.
  headerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  // Botão de ícone limpo (sem container), com alvo de toque de 44×44.
  headerIconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Título absolutamente centralizado na tela (independe das larguras laterais).
  headerTitleWrap: {
    position: 'absolute',
    left: 64,
    right: 64,
    alignItems: 'center',
  },
  headerTitleDay: {
    color: semanticColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  headerTitle: {
    color: semanticColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Mantém o título centralizado quando não há botão de metas à direita.
  headerRightSpacer: {
    width: 44,
    height: 44,
  },

  // ── Coluna de controles da lateral direita (Metas / Trilhas / Recentralizar)
  rightControls: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: 12,
    zIndex: 20,
  },
  // Tablet landscape: controles migram p/ a esquerda (o painel ocupa a direita).
  rightControlsLeft: {
    position: 'absolute',
    left: 16,
    alignItems: 'center',
    gap: 12,
    zIndex: 20,
  },
  mapCircleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: semanticColors.surface2,
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: semanticColors.canvas,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  mapCircleBtnActive: {
    borderColor: semanticColors.accent,
    shadowColor: semanticColors.canvas,
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
  // Tablet landscape: mapa ocupa ~65% à esquerda.
  mapSide: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '65%',
  },
  // Tablet landscape: painel sólido à direita (~35%), telemetria + botões
  // ancorados embaixo (coeso, não flutua solto sobre o mapa).
  sidePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '35%',
    backgroundColor: semanticColors.surface1,
    borderLeftWidth: 1,
    borderLeftColor: semanticColors.borderSubtle,
    justifyContent: 'flex-end',
    zIndex: 20,
  },

  // ── Telemetry card
  telemetryCard: {
    backgroundColor: semanticColors.surface1,
    marginHorizontal: 11,
    marginBottom: 8,
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: semanticColors.canvas,
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
    backgroundColor: semanticColors.borderSubtle,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  metricLabel: {
    color: semanticColors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
  },

  // ── Splits ao vivo (chips compactos; validação Fase 2)
  splitsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  splitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: semanticColors.accentSubtle,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  splitKm: {
    color: semanticColors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  splitPace: {
    color: semanticColors.accent,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Buttons area
  btnArea: {
    backgroundColor: semanticColors.surface1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 16, // overridden inline with insets.bottom + 16
    gap: 10,
    shadowColor: semanticColors.canvas,
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
    backgroundColor: semanticColors.surface2,
    borderWidth: 1,
    borderColor: semanticColors.borderStrong,
  },
  ctaBtnOutlineCyan: {
    backgroundColor: semanticColors.surface2,
    borderWidth: 1,
    borderColor: semanticColors.accent,
  },
  ctaBtnFilled: {
    backgroundColor: semanticColors.accent,
    borderWidth: 1,
    borderColor: semanticColors.accent,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Finishing overlay
  finishingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: semanticColors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    paddingHorizontal: 32,
  },
  finishingCard: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    padding: 28,
    borderRadius: 24,
    backgroundColor: semanticColors.surface2,
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    shadowColor: semanticColors.canvas,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  finishingSpinnerWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  finishingFlagIcon: {
    position: 'absolute',
  },
  finishingTitle: {
    color: semanticColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  finishingSubtitle: {
    color: semanticColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
