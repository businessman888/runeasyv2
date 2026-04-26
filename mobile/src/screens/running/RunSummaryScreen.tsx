import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { LineChart } from 'react-native-gifted-charts';
import * as Location from 'expo-location';
import { useAuthStore, getDisplayName, getAvatarUrl } from '../../stores/authStore';
import { useTrainingStore } from '../../stores';
import { SharingModal } from '../sharing/SharingModal';
import {
  calculateSplits,
  calculatePaceChart,
  calculatePaceSummary,
  formatPaceSeconds,
  formatDurationMs,
  type RoutePoint,
  type SplitData,
} from '../../utils/runMetrics';
import type { RunMode } from './RunningScreen';

// ─── Tipos de rota ────────────────────────────────────────────────────────────
type RunSummaryRouteParams = {
  RunSummary: {
    workoutId?: string;
    distance: number;       // metros
    timeMs: number;         // milissegundos
    routeCoordinates: number[][]; // [lng, lat][]
    routePoints?: RoutePoint[];
    savedLocally?: boolean;
    mode?: RunMode;
    targetPaceSeconds?: number;
    targetDistanceKm?: number;
    workoutTitle?: string;
  };
};

// ─── Design Tokens (Figma) ────────────────────────────────────────────────────
const T = {
  bgPrimary: '#0E0E1F',
  cardSurface: '#1C1C2E',
  cardDarker: '#15152A',
  cyan: '#00D4FF',
  textPrimary: '#EBEBF5',
  textSecondary: 'rgba(235, 235, 245, 0.60)',
  textMuted: 'rgba(235, 235, 245, 0.35)',
  divider: 'rgba(235, 235, 245, 0.10)',
  success: '#32CD32',
  warning: '#FFC400',
  danger: '#FF453A',
  routeColor: '#00D4FF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDistanceKm(meters: number) {
  return (meters / 1000).toFixed(2);
}

function formatHeaderDate(d: Date = new Date()) {
  const day = d.getDate().toString().padStart(2, '0');
  const monthsShort = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const month = monthsShort[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month}, ${year}`;
}

function getAutoTitle(d: Date = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Corrida da manhã';
  if (h < 18) return 'Corrida da tarde';
  return 'Corrida da noite';
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Status = 'good' | 'ok' | 'bad';
function getDeltaStatus(actual: number, target: number, tolerance = 0.05): Status {
  const ratio = (actual - target) / target;
  if (Math.abs(ratio) <= tolerance) return 'good';
  if (Math.abs(ratio) <= tolerance * 2) return 'ok';
  return 'bad';
}
function statusColor(s: Status) {
  if (s === 'good') return T.success;
  if (s === 'ok') return T.warning;
  return T.danger;
}
function statusLabel(actual: number, target: number, fmt: (n: number) => string) {
  const delta = actual - target;
  if (delta === 0) return 'No alvo';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${fmt(Math.abs(delta))}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RunSummaryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RunSummaryRouteParams, 'RunSummary'>>();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [sharingVisible, setSharingVisible] = useState(false);

  const {
    workoutId,
    distance: initialDistance = 0,
    timeMs: initialTimeMs = 0,
    routeCoordinates: initialRouteCoords = [],
    routePoints: initialRoutePoints = [],
    savedLocally = false,
    mode: initialMode = 'free',
    targetPaceSeconds: initialTargetPaceSeconds,
    targetDistanceKm: initialTargetDistanceKm,
    workoutTitle: initialWorkoutTitle,
  } = route.params || {};

  // ── Hidratação opcional via backend ─────────────────────────────────────
  // Quando a tela é aberta da Home/Histórico, os params vêm sem rota nem
  // amostras GPS — e em alguns fluxos (Histórico) também sem mode/targets/
  // title. Chamamos GET /training/workouts/:id (que devolve o workout +
  // activity com gps_route) e enriquecemos TUDO o que está faltando, para
  // que o mapa, splits, gráfico de pace e card de "Planejado vs Executado"
  // funcionem identicamente nos 3 fluxos (pós-finalização, Home, Histórico).
  const fetchWorkoutDetails = useTrainingStore((s) => s.fetchWorkoutDetails);
  const hasInitialRoute = initialRoutePoints.length > 1;

  type Enriched = {
    routePoints: RoutePoint[];
    routeCoordinates: number[][];
    distance: number;
    timeMs: number;
    mode?: RunMode;
    targetPaceSeconds?: number;
    targetDistanceKm?: number;
    workoutTitle?: string;
  };
  const [enriched, setEnriched] = useState<Enriched | null>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (hasInitialRoute || !workoutId) return;
    let cancelled = false;
    setEnriching(true);
    (async () => {
      const details = await fetchWorkoutDetails(workoutId);
      if (cancelled) return;
      if (!details) {
        setEnriching(false);
        return;
      }

      // Mapeia o `source` do banco ('plan' | 'manual' | 'free') para o RunMode
      // do app ('planned' | 'manual' | 'free'). Plan workouts não devem cair
      // aqui (vão para CoachAnalysis), mas caímos no 'planned' por segurança.
      const dbSource = (details as any).source as 'plan' | 'manual' | 'free' | null | undefined;
      const enrichedMode: RunMode | undefined =
        dbSource === 'plan' ? 'planned' :
        dbSource === 'manual' ? 'manual' :
        dbSource === 'free' ? 'free' :
        undefined;

      const activity = details.activity;
      const gps = (activity?.gps_route ?? []) as RoutePoint[];
      const coords = gps
        .filter((p) => p && typeof p.longitude === 'number' && typeof p.latitude === 'number')
        .map((p) => [p.longitude, p.latitude]);

      setEnriched({
        routePoints: gps,
        routeCoordinates: coords,
        distance: activity?.distance ?? initialDistance,
        timeMs: ((activity?.moving_time ?? Math.round(initialTimeMs / 1000))) * 1000,
        mode: enrichedMode,
        targetPaceSeconds: details.target_pace_seconds ?? undefined,
        targetDistanceKm: details.distance_km ?? undefined,
        workoutTitle: details.title ?? undefined,
      });
      setEnriching(false);
    })();
    return () => { cancelled = true; };
  }, [workoutId, hasInitialRoute, fetchWorkoutDetails, initialDistance, initialTimeMs]);

  const distance = enriched?.distance ?? initialDistance;
  const timeMs = enriched?.timeMs ?? initialTimeMs;
  const routeCoordinates = enriched?.routeCoordinates ?? initialRouteCoords;
  const routePoints = enriched?.routePoints ?? initialRoutePoints;
  const mode: RunMode = enriched?.mode ?? initialMode;
  const targetPaceSeconds = enriched?.targetPaceSeconds ?? initialTargetPaceSeconds;
  const targetDistanceKm = enriched?.targetDistanceKm ?? initialTargetDistanceKm;
  const workoutTitle = enriched?.workoutTitle ?? initialWorkoutTitle;

  // ── Usuário (avatar + nome) ────────────────────────────────────────────
  const user = useAuthStore((s) => s.user);
  const displayName = useMemo(() => getDisplayName(user) || 'Corredor', [user]);
  const avatarUrl = useMemo(() => getAvatarUrl(user), [user]);
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  // ── Reverse geocode → cidade ───────────────────────────────────────────
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function loadCity() {
      if (routeCoordinates.length === 0) return;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const mid = routeCoordinates[Math.floor(routeCoordinates.length / 2)];
        const [lng, lat] = mid;
        const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (cancelled) return;
        const first = results?.[0];
        const cityName = first?.city || first?.subregion || first?.region;
        if (cityName) setCity(cityName);
      } catch {
        /* silent — fica só com a data */
      }
    }
    loadCity();
    return () => { cancelled = true; };
  }, [routeCoordinates]);

  // ── Métricas ───────────────────────────────────────────────────────────
  const splits: SplitData[] = useMemo(
    () => (routePoints.length > 1 ? calculateSplits(routePoints) : []),
    [routePoints],
  );
  const paceChart = useMemo(
    () => (routePoints.length > 1 ? calculatePaceChart(routePoints) : []),
    [routePoints],
  );
  const summary = useMemo(
    () => calculatePaceSummary(routePoints, distance, timeMs),
    [routePoints, distance, timeMs],
  );

  const distanceKm = formatDistanceKm(distance);
  const timeStr = formatDurationMs(timeMs);
  const avgPaceStr = formatPaceSeconds(summary.avgPaceSecondsPerKm);

  const headerDate = useMemo(() => formatHeaderDate(), []);
  const autoTitle = useMemo(() => getAutoTitle(), []);
  const dateLine = city ? `${headerDate} — ${city}` : headerDate;

  // ── Mapa: bounds da rota ───────────────────────────────────────────────
  const hasRoute = routeCoordinates.length > 1;
  let centerCoord = routeCoordinates[0] || [-46.6333, -23.5505];
  let bounds: { ne: number[]; sw: number[] } | undefined;
  if (hasRoute) {
    const lngs = routeCoordinates.map((c) => c[0]);
    const lats = routeCoordinates.map((c) => c[1]);
    const padding = 0.002;
    bounds = {
      ne: [Math.max(...lngs) + padding, Math.max(...lats) + padding],
      sw: [Math.min(...lngs) - padding, Math.min(...lats) - padding],
    };
    centerCoord = [
      (bounds.ne[0] + bounds.sw[0]) / 2,
      (bounds.ne[1] + bounds.sw[1]) / 2,
    ];
  }
  const geoJsonSource = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: hasRoute ? routeCoordinates : [[0, 0]],
        },
      },
    ],
  };

  const handleClose = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' as never, params: { initialTab: 'Home' } }],
    });
  };

  const handleShare = () => {
    if (!workoutId) return;
    setSharingVisible(true);
  };

  // Snap points: 35% (vê mapa), 92% (full)
  const snapPoints = useMemo(() => ['35%', '92%'], []);

  // ── Planejado vs Executado (apenas modo manual) ────────────────────────
  const showPlannedVsExecuted = mode === 'manual' && targetPaceSeconds && targetDistanceKm;
  const distanceStatus: Status | null = showPlannedVsExecuted
    ? getDeltaStatus(distance / 1000, targetDistanceKm!)
    : null;
  const paceStatus: Status | null =
    showPlannedVsExecuted && summary.avgPaceSecondsPerKm > 0
      ? getDeltaStatus(targetPaceSeconds!, summary.avgPaceSecondsPerKm)
      : null;

  // ── Chart de pace (eixo Y invertido) ───────────────────────────────────
  // Largura disponível para o chart = largura da tela menos paddings:
  //   sheetContent.paddingHorizontal (16) × 2  +  cardDark.paddingHorizontal (16) × 2
  // O chart ocupa 100% do espaço interno do card, sem `paddingLeft` extra
  // no chartWrap, para evitar overflow.
  const { width: screenWidth } = useWindowDimensions();
  const chartAvailableWidth = Math.max(220, screenWidth - 16 * 2 - 16 * 2);
  const chartCfg = useMemo(
    () => buildChartConfig(paceChart, summary.avgPaceSecondsPerKm, chartAvailableWidth),
    [paceChart, summary.avgPaceSecondsPerKm, chartAvailableWidth],
  );

  return (
    <View style={styles.container}>
      {/* ── Mapa fullscreen atrás ───────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFillObject}>
        <Mapbox.MapView
          style={StyleSheet.absoluteFillObject}
          styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/dark-v11'}
          logoEnabled={false}
          compassEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          zoomEnabled={false}
        >
          <Mapbox.Camera
            centerCoordinate={centerCoord}
            zoomLevel={hasRoute ? undefined : 15}
            bounds={
              bounds
                ? {
                    ne: bounds.ne,
                    sw: bounds.sw,
                    paddingTop: 80,
                    paddingBottom: 320,
                    paddingLeft: 40,
                    paddingRight: 40,
                  }
                : undefined
            }
            animationDuration={0}
          />
          {hasRoute && (
            <Mapbox.ShapeSource id="summaryRoute" shape={geoJsonSource as any}>
              <Mapbox.LineLayer
                id="summaryRouteGlow"
                style={{
                  lineColor: T.routeColor,
                  lineWidth: 12,
                  lineOpacity: 0.25,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
              <Mapbox.LineLayer
                id="summaryRouteFill"
                style={{
                  lineColor: T.routeColor,
                  lineWidth: 5,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
            </Mapbox.ShapeSource>
          )}
        </Mapbox.MapView>

        {/* Overlay no mapa: rota indisponível ou hidratando */}
        {!hasRoute && (
          <View style={styles.mapOverlay} pointerEvents="none">
            <View style={styles.mapOverlayPill}>
              {enriching ? (
                <>
                  <ActivityIndicator size="small" color={T.cyan} />
                  <Text style={styles.mapOverlayText}>Carregando rota...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="map-outline" size={16} color={T.textSecondary} />
                  <Text style={styles.mapOverlayText}>Rota não disponível</Text>
                </>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ── Header da screen (chevron + "Relatório" + share) ───────────── */}
      <SafeAreaView edges={['top']} style={styles.topOverlay}>
        <Pressable
          style={styles.iconBtn}
          onPress={handleClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={T.textPrimary} />
        </Pressable>
        <Text style={styles.screenTitle}>Relatório</Text>
        <Pressable
          style={styles.iconBtn}
          onPress={handleShare}
          hitSlop={10}
          disabled={!workoutId}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar"
        >
          <Ionicons name="share-outline" size={20} color={workoutId ? T.textPrimary : T.textMuted} />
        </Pressable>
      </SafeAreaView>

      {/* ── Bottom Sheet (modal de resultado) ──────────────────────────── */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar + nome + data + cidade */}
          <View style={styles.userRow}>
            <Avatar uri={avatarUrl} initials={initials} />
            <View style={styles.userTextWrap}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.userDate} numberOfLines={1}>{dateLine}</Text>
            </View>
          </View>

          {/* Pill offline (discreta) */}
          {savedLocally && (
            <View style={styles.offlinePill}>
              <Ionicons name="cloud-offline-outline" size={13} color={T.warning} />
              <Text style={styles.offlinePillText}>
                Salvo localmente — será enviado quando houver conexão
              </Text>
            </View>
          )}

          {/* Título auto */}
          <View style={styles.titleWrap}>
            <Text style={styles.runTitle}>
              {workoutTitle && mode !== 'free' ? workoutTitle : autoTitle}
            </Text>
          </View>

          {/* Row de 5 métricas */}
          <View style={styles.metricsRow}>
            <MetricCell label="Distância" value={`${distanceKm} Km`} />
            <MetricCell label="Tempo" value={timeStr} />
            <MetricCell label="Pace" value={`${avgPaceStr} /Km`} />
            <MetricCell label="Elev. Gan" value={`${summary.totalElevationGainM} m`} />
            <MetricCell label="Elev Max" value={`${summary.maxAltitudeM} m`} />
          </View>

          {/* Planejado vs Executado (modo manual) */}
          {showPlannedVsExecuted && (
            <View style={styles.cardDark}>
              <Text style={styles.cardTitle}>Planejado vs Executado</Text>
              <View style={{ marginTop: 4 }}>
                <CompareRow
                  label="Distância"
                  planned={`${targetDistanceKm!.toFixed(1)} km`}
                  executed={`${distanceKm} km`}
                  status={distanceStatus!}
                  delta={statusLabel(distance / 1000, targetDistanceKm!, (n) => `${n.toFixed(2)} km`)}
                />
                <View style={styles.compareDivider} />
                <CompareRow
                  label="Pace médio"
                  planned={`${formatPaceSeconds(targetPaceSeconds!)}/km`}
                  executed={`${avgPaceStr}/km`}
                  status={paceStatus!}
                  delta={statusLabel(
                    summary.avgPaceSecondsPerKm,
                    targetPaceSeconds!,
                    (n) => `${Math.round(n)}s`,
                  )}
                />
              </View>
            </View>
          )}

          {/* Card Splits — sempre presente, com empty state se não houver dados */}
          <View style={styles.cardDark}>
            <Text style={styles.cardTitle}>Splits</Text>

            {splits.length > 0 ? (
              <>
                <View style={styles.splitsHeader}>
                  <Text style={[styles.splitsHeaderText, styles.colKm]}>Km</Text>
                  <Text style={[styles.splitsHeaderText, styles.colPace]}>Pace</Text>
                  <View style={styles.colBar} />
                  <Text style={[styles.splitsHeaderText, styles.colElev]}>Elev</Text>
                </View>
                <View style={styles.splitsBody}>
                  {splits.map((s) => (
                    <SplitRow key={s.kmNumber} split={s} />
                  ))}
                </View>
              </>
            ) : (
              <CardEmptyState
                icon="speedometer-outline"
                title={enriching ? 'Carregando splits...' : 'Sem splits para esse treino'}
                subtitle={
                  enriching
                    ? undefined
                    : 'Treinos curtos (menos de 1 km) ou sem GPS contínuo não geram splits.'
                }
                loading={enriching}
              />
            )}
          </View>

          {/* Card Pace — sempre presente, com empty state se não houver dados */}
          <View style={styles.cardDark}>
            <View style={styles.paceCardHeader}>
              <Text style={styles.cardTitle}>Pace</Text>
              <Text style={styles.chartUnitInline}>min/km</Text>
            </View>

            {paceChart.length > 1 ? (
              <>
                <View style={styles.chartWrap}>
                  <LineChart
                    data={chartCfg.data}
                    height={170}
                    width={chartCfg.width}
                    thickness={2}
                    color={T.cyan}
                    areaChart
                    curved
                    startFillColor={T.cyan}
                    endFillColor={T.cyan}
                    startOpacity={0.45}
                    endOpacity={0.05}
                    initialSpacing={CHART_INITIAL_SPACING}
                    endSpacing={CHART_END_SPACING}
                    spacing={chartCfg.spacing}
                    yAxisColor="transparent"
                    xAxisColor={T.divider}
                    rulesType="solid"
                    rulesColor="rgba(235,235,245,0.06)"
                    yAxisTextStyle={styles.chartAxisText}
                    xAxisLabelTextStyle={styles.chartAxisLabelText}
                    yAxisLabelTexts={chartCfg.yAxisLabelTexts}
                    noOfSections={chartCfg.yAxisLabelTexts.length - 1}
                    maxValue={chartCfg.maxValue}
                    yAxisLabelWidth={CHART_Y_AXIS_LABEL_WIDTH}
                    yAxisLabelSuffix=""
                    xAxisLabelTexts={chartCfg.xLabels}
                    showVerticalLines={false}
                    hideDataPoints={false}
                    dataPointsRadius={3.5}
                    dataPointsColor={'#FFFFFF'}
                    dataPointsShape={'circular'}
                    showReferenceLine1={chartCfg.refValue > 0}
                    referenceLine1Position={chartCfg.refValue}
                    referenceLine1Config={{
                      color: 'rgba(255,255,255,0.35)',
                      dashWidth: 4,
                      dashGap: 3,
                      thickness: 1,
                    }}
                  />
                </View>

                <View style={styles.paceList}>
                  <PaceStatRow label="Pace" value={`${avgPaceStr} /Km`} />
                  <PaceStatRow label="Tempo" value={timeStr} />
                  <PaceStatRow
                    label="Pace mais lento"
                    value={`${formatPaceSeconds(summary.worstPaceSecondsPerKm)} /Km`}
                  />
                  <PaceStatRow
                    label="Melhor pace"
                    value={`${formatPaceSeconds(summary.bestPaceSecondsPerKm)} /Km`}
                    isLast
                  />
                </View>
              </>
            ) : (
              <>
                <CardEmptyState
                  icon="trending-up-outline"
                  title={enriching ? 'Carregando gráfico...' : 'Sem variação de pace registrada'}
                  subtitle={
                    enriching
                      ? undefined
                      : 'Treino muito curto ou sem GPS suficiente para gerar a curva.'
                  }
                  loading={enriching}
                />
                {/* Mesmo sem o chart, mostramos o resumo numérico (vem do summary geral) */}
                <View style={styles.paceList}>
                  <PaceStatRow label="Pace" value={`${avgPaceStr} /Km`} />
                  <PaceStatRow label="Tempo" value={timeStr} isLast />
                </View>
              </>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {workoutId && (
        <SharingModal
          visible={sharingVisible}
          onClose={() => setSharingVisible(false)}
          workoutId={workoutId}
        />
      )}
    </View>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Avatar({ uri, initials }: { uri: string | null; initials: string }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

function SplitRow({ split }: { split: SplitData }) {
  const isFractional = split.distanceMeters < 1000;
  return (
    <View style={styles.splitRow}>
      <View style={styles.colKm}>
        <Text style={styles.splitKmText}>
          {split.kmNumber}
          {isFractional && (
            <Text style={styles.splitFraction}>
              {` (${(split.distanceMeters / 1000).toFixed(2)})`}
            </Text>
          )}
        </Text>
      </View>
      <View style={styles.colPace}>
        <Text style={styles.splitText}>{formatPaceSeconds(split.paceSecondsPerKm)}</Text>
      </View>
      <View style={styles.colBar}>
        <View style={[styles.splitBar, { width: `${Math.max(8, split.barWidthRatio * 100)}%` }]} />
      </View>
      <View style={styles.colElev}>
        <Text style={styles.splitText}>
          {split.elevationGainM > 0 ? `+${split.elevationGainM}` : split.elevationGainM === 0 ? '0' : split.elevationGainM}
        </Text>
      </View>
    </View>
  );
}

function CardEmptyState({
  icon,
  title,
  subtitle,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.emptyState}>
      {loading ? (
        <ActivityIndicator size="small" color={T.cyan} />
      ) : (
        <View style={styles.emptyStateIconWrap}>
          <Ionicons name={icon} size={22} color={T.textSecondary} />
        </View>
      )}
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function PaceStatRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.paceStatRow, !isLast && styles.paceStatRowBorder]}>
      <Text style={styles.paceStatLabel}>{label}</Text>
      <Text style={styles.paceStatValue}>{value}</Text>
    </View>
  );
}

function CompareRow({
  label,
  planned,
  executed,
  status,
  delta,
}: {
  label: string;
  planned: string;
  executed: string;
  status: Status;
  delta: string;
}) {
  return (
    <View style={styles.compareRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.compareLabel}>{label}</Text>
        <Text style={styles.comparePlanned}>Planejado: {planned}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.compareExecuted}>{executed}</Text>
        <View
          style={[
            styles.compareDeltaBadge,
            { backgroundColor: statusColor(status) + '22', borderColor: statusColor(status) },
          ]}
        >
          <View style={[styles.compareDot, { backgroundColor: statusColor(status) }]} />
          <Text style={[styles.compareDeltaText, { color: statusColor(status) }]}>{delta}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

interface ChartConfig {
  data: { value: number }[];
  yAxisLabelTexts: string[];
  maxValue: number;
  refValue: number;
  xLabels: string[];
  width: number;
  spacing: number;
}

// Constantes do layout do chart — usadas tanto no buildChartConfig quanto no
// próprio LineChart para garantir que largura, spacing e labels permaneçam
// consistentes (sem o chart estourar a borda do card).
const CHART_Y_AXIS_LABEL_WIDTH = 40;
const CHART_INITIAL_SPACING = 8;
const CHART_END_SPACING = 12;

function buildChartConfig(
  paceChart: { distanceKm: number; paceSecondsPerKm: number }[],
  avgPace: number,
  availableWidth: number,
): ChartConfig {
  if (paceChart.length === 0) {
    return { data: [], yAxisLabelTexts: [], maxValue: 0, refValue: 0, xLabels: [], width: availableWidth, spacing: 0 };
  }

  // Range em segundos arredondado para minutos cheios
  const allPaces = paceChart.map((p) => p.paceSecondsPerKm);
  const rawMin = Math.min(...allPaces);
  const rawMax = Math.max(...allPaces);
  const paceMinFloor = Math.max(60, Math.floor(rawMin / 60) * 60);
  const paceMaxCeil = Math.max(paceMinFloor + 60, Math.ceil(rawMax / 60) * 60);
  const range = paceMaxCeil - paceMinFloor;

  // Inversão: valores no chart = (paceMaxCeil - paceSeconds), pace rápido fica no topo
  const data = paceChart.map((p) => ({
    value: paceMaxCeil - p.paceSecondsPerKm,
  }));

  // Y axis labels: gifted-charts vai de baixo (idx 0) para cima
  const ySteps = Math.min(5, Math.max(3, Math.round(range / 60)));
  const yAxisLabelTexts: string[] = [];
  for (let i = 0; i <= ySteps; i++) {
    // i=0 → base → pace mais lento (paceMaxCeil)
    // i=ySteps → topo → pace mais rápido (paceMinFloor)
    const pace = paceMaxCeil - (range / ySteps) * i;
    yAxisLabelTexts.push(formatPaceSeconds(pace));
  }

  // Reference line do pace médio (no espaço invertido)
  const refValue = avgPace > 0 ? Math.max(0, paceMaxCeil - avgPace) : 0;

  // X axis: ~4 labels em km. Sempre garantimos primeiro e último; os
  // intermediários são selecionados por stride. Strings vazias suprimem o
  // label naquele índice (gifted-charts não desenha texto vazio).
  const targetLabels = 4;
  const stride = Math.max(1, Math.round((paceChart.length - 1) / (targetLabels - 1)));
  const xLabels: string[] = paceChart.map((p, i) => {
    const isLast = i === paceChart.length - 1;
    if (i === 0 || isLast || i % stride === 0) {
      return `${p.distanceKm.toFixed(1)} km`;
    }
    return '';
  });

  // Largura/spacing dinâmicos: o chart deve caber EXATAMENTE no card.
  // gifted-charts mede `width` como a largura total (eixo Y + área de plot),
  // então subtraímos yAxisLabelWidth + os paddings interno do chart para
  // distribuir o espaçamento entre os pontos sem extrapolar.
  const drawableWidth = Math.max(
    1,
    availableWidth - CHART_Y_AXIS_LABEL_WIDTH - CHART_INITIAL_SPACING - CHART_END_SPACING,
  );
  const spacing = drawableWidth / Math.max(paceChart.length - 1, 1);

  return {
    data,
    yAxisLabelTexts,
    maxValue: range,
    refValue,
    xLabels,
    width: availableWidth,
    spacing,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bgPrimary,
  },

  // Header overlay (screen)
  topOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14, 14, 31, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: T.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(14, 14, 31, 0.85)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },

  // Bottom sheet
  sheetBackground: {
    backgroundColor: T.cardSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    backgroundColor: 'rgba(235,235,245,0.10)',
    width: 60,
    height: 6,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },

  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 4,
    paddingBottom: 14,
  },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: T.cardDarker,
  },
  avatarFallback: {
    backgroundColor: 'rgba(0, 212, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.cyan,
  },
  avatarInitials: {
    color: T.cyan,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  userTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  userDate: {
    color: T.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 2,
  },

  // Offline pill
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 196, 0, 0.14)',
    borderColor: 'rgba(255, 196, 0, 0.40)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 6,
    marginBottom: 12,
  },
  offlinePillText: {
    color: T.warning,
    fontSize: 11,
    fontWeight: '500',
  },

  // Title
  titleWrap: {
    paddingTop: 4,
    paddingBottom: 14,
    alignItems: 'center',
  },
  runTitle: {
    color: T.textPrimary,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 30,
    textAlign: 'center',
  },

  // Métricas (5 colunas)
  metricsRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    marginBottom: 18,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
    gap: 6,
  },
  metricLabel: {
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  metricValue: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Cards (Splits / Pace / Compare)
  cardDark: {
    backgroundColor: T.cardDarker,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 14,
  },
  cardTitle: {
    color: T.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    paddingBottom: 16,
  },

  // Splits layout (Km | Pace | Bar | Elev)
  colKm: {
    width: 48,
    paddingLeft: 4,
    justifyContent: 'center',
  },
  colPace: {
    width: 56,
    justifyContent: 'center',
  },
  colBar: {
    flex: 1,
    height: 16,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  colElev: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  splitsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(235,235,245,0.10)',
  },
  splitsHeaderText: {
    color: T.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  splitsBody: {
    paddingTop: 4,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  splitKmText: {
    color: T.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  splitFraction: {
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '400',
  },
  splitText: {
    color: T.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  splitBar: {
    height: 8,
    backgroundColor: T.cyan,
    borderRadius: 4,
  },

  // Pace card / chart
  paceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    // paddingBottom já vem do `cardTitle` (16px). Não somar aqui para não
    // afastar demais o título do gráfico.
  },
  chartUnitInline: {
    position: 'absolute',
    right: 0,
    top: 4,
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  chartWrap: {
    // Sem padding lateral: a largura passada ao LineChart já considera o
    // espaço interno do card. Padding aqui causaria overflow horizontal.
    paddingTop: 4,
    paddingBottom: 8,
    minHeight: 200,
    overflow: 'hidden',
  },
  chartAxisText: {
    color: T.textSecondary,
    fontSize: 10,
  },
  chartAxisLabelText: {
    color: T.textSecondary,
    fontSize: 10,
    width: 48,
    textAlign: 'center',
    marginLeft: -24,
  },

  paceList: {
    marginTop: 12,
    paddingTop: 4,
  },
  paceStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  paceStatRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(235,235,245,0.08)',
  },
  paceStatLabel: {
    color: T.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  paceStatValue: {
    color: T.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Map overlay (rota indisponível / hidratando)
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 110,
  },
  mapOverlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(14, 14, 31, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(235, 235, 245, 0.10)',
  },
  mapOverlayText: {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  // Empty state (cards Splits / Pace sem dados)
  emptyState: {
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(235, 235, 245, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyStateTitle: {
    color: T.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: T.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 16,
  },

  // Compare (modo manual)
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  compareDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.divider,
    marginVertical: 6,
  },
  compareLabel: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  comparePlanned: {
    color: T.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  compareExecuted: {
    color: T.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  compareDeltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    marginTop: 4,
  },
  compareDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  compareDeltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
