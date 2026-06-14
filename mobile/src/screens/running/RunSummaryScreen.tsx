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
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SharingModal } from '../sharing/SharingModal';
import {
  calculateSplits,
  calculatePaceChart,
  calculatePaceSummary,
  calculateElevationProfile,
  buildStatMapRoute,
  formatPaceSeconds,
  formatDurationMs,
  type RoutePoint,
  type SplitData,
  type ElevationPoint,
} from '../../utils/runMetrics';
import { Terrain3DLayers } from '../../components/map/Terrain3DLayers';
import { StatMapRoute } from '../../components/map/StatMapRoute';
import { StatMapSelector, type StatMapMode } from '../../components/map/StatMapSelector';
import { FinishFlagMarker } from '../../components/map/FinishFlagMarker';
import { loadTreadmillCache } from '../../utils/treadmillCache';
import {
  downsampleSpeedSamples,
  computeSpeedChartSpacing,
} from '../../utils/treadmillChart';
import type { RunMode } from './RunningScreen';

export interface TreadmillSummaryData {
  is_smart: boolean;
  device_name?: string;
  avg_speed_kmh?: number;
  max_speed_kmh?: number;
  avg_incline?: number;
  total_calories?: number;
  speed_samples?: { t: number; kmh: number; incline?: number }[];
}

// ─── Tipos de rota ────────────────────────────────────────────────────────────
/**
 * RunSummary supports two entry shapes:
 *
 *  1. Live finish — Running/TreadmillRunningView pass the full payload
 *     (`distance`, `timeMs`, `routePoints`, `routeCoordinates`,
 *     `environment`, `treadmillData`) so the first paint shows real values
 *     immediately, before any network call.
 *
 *  2. Dumb redirect — Calendar / Home / TrainingHistory pass only
 *     `{ workoutId, mode }`. The screen fetches everything via
 *     `fetchWorkoutDetails(workoutId)` and renders outdoor or treadmill
 *     based on the persisted data. A loading skeleton covers the gap so
 *     no zeros are ever shown.
 *
 * All fields except `workoutId` are optional; missing values fall back to
 * the hydrated data or to a sensible neutral default.
 */
type RunSummaryRouteParams = {
  RunSummary: {
    workoutId?: string;
    distance?: number;       // metros
    timeMs?: number;         // milissegundos
    routeCoordinates?: number[][]; // [lng, lat][]
    routePoints?: RoutePoint[];
    savedLocally?: boolean;
    mode?: RunMode;
    targetPaceSeconds?: number;
    targetDistanceKm?: number;
    workoutTitle?: string;
    /** Ambiente do treino — quando 'treadmill', oculta mapa e mostra gráfico de velocidade. */
    environment?: 'outdoor' | 'treadmill';
    treadmillData?: TreadmillSummaryData;
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
  // Tablet landscape: master-detail — mídia (mapa/esteira) à esquerda e o sheet
  // de resultado vira uma coluna à direita. Phone (sideLayout=false) mantém o
  // mapa fullscreen + bottom sheet original.
  const { isTablet, isLandscape } = useBreakpoint();
  const sideLayout = isTablet && isLandscape;
  const sheetRef = useRef<BottomSheet>(null);
  const [sharingVisible, setSharingVisible] = useState(false);
  // Stat Maps: coloração da rota. 'default' = polyline cyan original (estado inicial).
  const [statMapMode, setStatMapMode] = useState<StatMapMode>('default');
  // Terreno 3D: desligado por padrão (preserva o comportamento atual do mapa).
  const [is3D, setIs3D] = useState(false);

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
    environment: initialEnvironment,
    treadmillData: initialTreadmillData,
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
    /** Métricas de saúde quando vierem do wearable (Apple Watch / Garmin / etc.) */
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
    calories?: number | null;
    /** Fonte da activity — usado pra mostrar badge "Apple Watch" se relevante */
    activitySource?: string | null;
    environment?: 'outdoor' | 'treadmill';
    treadmillData?: TreadmillSummaryData | null;
    /** Perfil de elevação corrigido pelo DEM (backend). Quando presente, a
     *  altimetria usa este em vez de recalcular do GPS. */
    elevationProfile?: ElevationPoint[];
    /** Ganho de elevação corrigido pelo DEM (m), do backend. */
    elevationGain?: number | null;
  };
  const [enriched, setEnriched] = useState<Enriched | null>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (hasInitialRoute || !workoutId) return;
    let cancelled = false;
    setEnriching(true);

    // Local-first: read the on-device treadmill cache synchronously so the
    // "Velocidade na esteira" card paints immediately, before the backend
    // round-trip resolves. The fetch below still runs to confirm/refresh
    // server-side fields — but the chart never disappears while we wait.
    const cachedTreadmill = loadTreadmillCache(workoutId);
    if (__DEV__) {
      console.log('[RunSummary] cache lookup', {
        workoutId,
        hit: !!cachedTreadmill,
        sampleCount: cachedTreadmill?.speed_samples?.length ?? 0,
      });
    }
    if (cachedTreadmill) {
      setEnriched((prev) => ({
        routePoints: prev?.routePoints ?? [],
        routeCoordinates: prev?.routeCoordinates ?? [],
        distance: prev?.distance ?? initialDistance,
        timeMs: prev?.timeMs ?? initialTimeMs,
        mode: prev?.mode,
        targetPaceSeconds: prev?.targetPaceSeconds,
        targetDistanceKm: prev?.targetDistanceKm,
        workoutTitle: prev?.workoutTitle,
        avgHeartRate: prev?.avgHeartRate ?? null,
        maxHeartRate: prev?.maxHeartRate ?? null,
        calories: prev?.calories ?? null,
        activitySource: prev?.activitySource ?? null,
        // Force environment to treadmill since we have local cache data
        // for this workout — only treadmill runs ever get cached.
        environment: 'treadmill',
        treadmillData: cachedTreadmill as TreadmillSummaryData,
      }));
    }

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

      // Environment chain: activity.environment is the canonical source
      // (set on every completion), but the top-level workout row mirrors
      // it as a safety net. Fall back to 'outdoor' only when both are
      // genuinely absent.
      const activityEnv = (activity as any)?.environment as
        | 'outdoor'
        | 'treadmill'
        | undefined;
      const workoutEnv = (details as any)?.environment as
        | 'outdoor'
        | 'treadmill'
        | undefined;
      const resolvedEnv: 'outdoor' | 'treadmill' | undefined =
        activityEnv ?? workoutEnv ?? undefined;

      // Treadmill payload may arrive as a parsed object (Supabase JSONB) or
      // as a JSON string in degraded paths (column scanned as text, REST
      // proxy that doesn't deserialize, etc.). Normalize defensively so the
      // UI is immune to both shapes.
      const rawTm = (activity as any)?.treadmill_data;
      let parsedTm: TreadmillSummaryData | null = null;
      if (rawTm && typeof rawTm === 'object') {
        parsedTm = rawTm as TreadmillSummaryData;
      } else if (typeof rawTm === 'string' && rawTm.length > 0) {
        try {
          parsedTm = JSON.parse(rawTm) as TreadmillSummaryData;
        } catch {
          parsedTm = null;
        }
      }

      // Diagnostic logging — verbose on purpose. Filter Metro logs with
      // `[RunSummary] hydrate` to see exactly what the backend returned for
      // this workout, including whether treadmill_data was preserved.
      if (__DEV__) {
        console.log('[RunSummary] hydrate', {
          workoutId,
          workoutEnv,
          activityId: (activity as any)?.id,
          activityEnv,
          resolvedEnv,
          rawTmType: typeof rawTm,
          rawTmIsNull: rawTm === null,
          rawTmIsUndefined: rawTm === undefined,
          parsedTmHasSamples:
            parsedTm?.speed_samples && parsedTm.speed_samples.length > 0,
          parsedTmAvgSpeed: parsedTm?.avg_speed_kmh,
        });
      }

      // Workout row carries `distance_run` (km) and `time_run_seconds` —
      // written by `completeWorkout` regardless of whether the activity
      // insert succeeded. Use them as the second layer of fallback so
      // the header is never blank when the activity row is missing or
      // when the activity exists but its execution metrics are 0
      // (degraded inserts, esteira sem activity_id, etc).
      const workoutDistanceM =
        (details as any)?.distance_run != null
          ? Number((details as any).distance_run) * 1000
          : null;
      const workoutTimeS =
        (details as any)?.time_run_seconds != null
          ? Number((details as any).time_run_seconds)
          : null;

      const activityDistance =
        activity?.distance != null && activity.distance > 0
          ? activity.distance
          : null;
      const activityTimeS =
        activity?.moving_time != null && activity.moving_time > 0
          ? activity.moving_time
          : null;

      const resolvedDistance =
        activityDistance ?? workoutDistanceM ?? initialDistance;
      const resolvedTimeS =
        activityTimeS ?? workoutTimeS ?? Math.round(initialTimeMs / 1000);

      setEnriched({
        routePoints: gps,
        routeCoordinates: coords,
        distance: resolvedDistance,
        timeMs: resolvedTimeS * 1000,
        mode: enrichedMode,
        targetPaceSeconds: details.target_pace_seconds ?? undefined,
        targetDistanceKm: details.distance_km ?? undefined,
        workoutTitle: details.title ?? undefined,
        avgHeartRate: activity?.average_heartrate ?? null,
        maxHeartRate: activity?.max_heartrate ?? null,
        calories: activity?.calories ?? null,
        activitySource: activity?.source ?? null,
        // Perfil/ganho de elevação corrigidos pelo DEM (quando o job já rodou).
        elevationProfile:
          Array.isArray(activity?.elevation_profile) &&
          activity!.elevation_profile!.length > 1
            ? (activity!.elevation_profile as ElevationPoint[])
            : undefined,
        elevationGain: activity?.elevation_gain ?? null,
        // If backend didn't return env but we have local treadmill cache,
        // we know it was a treadmill run.
        environment: resolvedEnv ?? (cachedTreadmill ? 'treadmill' : undefined),
        // Prefer backend data when present (latest authoritative copy),
        // but fall back to the local cache so a degraded server response
        // never erases the in-app chart.
        treadmillData: parsedTm ?? (cachedTreadmill as TreadmillSummaryData | null),
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
  const environment: 'outdoor' | 'treadmill' =
    enriched?.environment ?? initialEnvironment ?? 'outdoor';
  const treadmillData: TreadmillSummaryData | null =
    enriched?.treadmillData ?? initialTreadmillData ?? null;
  const isTreadmill = environment === 'treadmill';
  const avgHeartRate = enriched?.avgHeartRate ?? null;
  const maxHeartRate = enriched?.maxHeartRate ?? null;
  const calories = enriched?.calories ?? null;
  const activitySource = enriched?.activitySource ?? null;
  const hasHealthMetrics =
    (avgHeartRate != null && avgHeartRate > 0) ||
    (maxHeartRate != null && maxHeartRate > 0) ||
    (calories != null && calories > 0);

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
  // Prefere o perfil corrigido pelo DEM (backend) quando já enriquecido;
  // senão recalcula da altitude do GPS (comportamento original).
  const isDemElevation = (enriched?.elevationProfile?.length ?? 0) > 1;
  const elevationProfile: ElevationPoint[] = useMemo(
    () =>
      isDemElevation
        ? enriched!.elevationProfile!
        : routePoints.length > 1
          ? calculateElevationProfile(routePoints)
          : [],
    [isDemElevation, enriched, routePoints],
  );
  const hasElevation = elevationProfile.length > 1;
  // Ganho/altitude máx: usa os valores DEM quando disponíveis, senão o summary GPS.
  const resolvedElevationGain =
    isDemElevation && enriched?.elevationGain != null
      ? Math.round(enriched.elevationGain)
      : summary.totalElevationGainM;
  const resolvedMaxAltitude = isDemElevation
    ? Math.round(Math.max(...elevationProfile.map((p) => p.altitudeM)))
    : summary.maxAltitudeM;
  // Rota colorida por métrica — só recalcula quando sai do modo 'default'.
  const statMapRoute = useMemo(
    () =>
      statMapMode === 'default' || routePoints.length < 2
        ? null
        : buildStatMapRoute(routePoints, statMapMode),
    [statMapMode, routePoints],
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
  // Zoom que enquadra a rota — usado no modo 3D, onde a câmera usa center+zoom+pitch
  // em vez de bounds (bounds e pitch conflitam no rnmapbox). Mantém a rota visível
  // mesmo num mapa travado.
  let fit3DZoom = 14;
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
    const maxSpan = Math.max(
      Math.abs(bounds.ne[0] - bounds.sw[0]),
      Math.abs(bounds.ne[1] - bounds.sw[1]),
      0.0005,
    );
    // Aproximação log2(360 / span) com folga; clamp para um range usável.
    fit3DZoom = Math.max(11, Math.min(16, Math.log2(360 / maxSpan) - 0.8));
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

  // Snap points: phone 35% (vê mapa) / 92% (full). Em tablet landscape o sheet
  // vive numa coluna à direita, então abre praticamente cheio.
  const snapPoints = useMemo(() => (sideLayout ? ['100%'] : ['35%', '92%']), [sideLayout]);

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
  const elevCfg = useMemo(
    () => buildElevationChartConfig(elevationProfile, chartAvailableWidth),
    [elevationProfile, chartAvailableWidth],
  );

  // Treadmill speed chart — memo a downsampled copy of the samples plus
  // the calculated per-point spacing. Keeps the render branch tiny and
  // the downsample work out of the hot path.
  const treadmillChart = useMemo(() => {
    const raw = treadmillData?.speed_samples;
    if (!raw || raw.length < 2) return null;
    const samples = downsampleSpeedSamples(raw, 120);
    if (samples.length < 2) return null;
    const spacing = computeSpeedChartSpacing(
      samples.length,
      chartAvailableWidth,
      CHART_INITIAL_SPACING,
      CHART_END_SPACING,
    );
    return {
      data: samples.map((s) => ({ value: s.kmh, label: '' })),
      spacing,
    };
  }, [treadmillData?.speed_samples, chartAvailableWidth]);

  if (__DEV__) {
    console.log('[RunSummary] treadmill render', {
      isTreadmill,
      hasTreadmillData: !!treadmillData,
      isSmart: treadmillData?.is_smart,
      avgSpeed: treadmillData?.avg_speed_kmh,
      rawSampleCount: treadmillData?.speed_samples?.length ?? 0,
      firstSample: treadmillData?.speed_samples?.[0],
      lastSample:
        treadmillData?.speed_samples?.[
          (treadmillData?.speed_samples?.length ?? 0) - 1
        ],
      chartPoints: treadmillChart?.data.length ?? 0,
      cameFromLiveFinish: hasInitialRoute,
      hasInitialTreadmillData: initialTreadmillData != null,
    });
  }

  // Cold-start loading guard. When we were opened as a "dumb redirect"
  // (no live route data passed, only workoutId) and the hydration hasn't
  // resolved yet, render a clean spinner instead of a half-populated UI
  // showing zeros — the screens are persistent in data, never in a
  // half-state.
  //
  // The live-finish path (RunningScreen / TreadmillRunningView) passes at
  // least distance>0 or treadmillData or routePoints, so this branch is
  // skipped and the live values paint immediately. The dumb-redirect path
  // (Calendar / Home / History) passes only workoutId — that's the case
  // we cover here.
  const hasLiveData =
    hasInitialRoute ||
    initialDistance > 0 ||
    initialTimeMs > 0 ||
    initialTreadmillData != null ||
    initialEnvironment === 'treadmill';
  const showColdStartLoading =
    !hasLiveData && !enriched && enriching && !!workoutId;
  if (showColdStartLoading) {
    return (
      <View style={[styles.container, styles.coldStartLoading]}>
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
          <View style={styles.iconBtn} />
        </SafeAreaView>
        <View style={styles.coldStartCenter}>
          <ActivityIndicator size="large" color={T.cyan} />
          <Text style={styles.coldStartText}>Carregando treino...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Mapa fullscreen atrás OU placeholder de esteira ───────────────── */}
      {isTreadmill ? (
        <View style={[sideLayout ? styles.mediaHalf : StyleSheet.absoluteFillObject, styles.treadmillBackdrop]}>
          <View style={styles.treadmillBackdropContent}>
            <Ionicons name="walk" size={56} color={T.cyan} />
            <Text style={styles.treadmillBackdropTitle}>Esteira</Text>
            <Text style={styles.treadmillBackdropSubtitle}>
              {treadmillData?.is_smart && treadmillData?.device_name
                ? treadmillData.device_name
                : treadmillData?.is_smart === false
                  ? 'Modo manual'
                  : 'Treino interno'}
            </Text>
          </View>
        </View>
      ) : (
      <View style={sideLayout ? styles.mediaHalf : StyleSheet.absoluteFillObject}>
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
            zoomLevel={is3D ? fit3DZoom : hasRoute ? undefined : 15}
            pitch={is3D ? 55 : 0}
            bounds={
              !is3D && bounds
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
            animationDuration={is3D ? 800 : 0}
          />

          {/* Terreno 3D (relevo + céu) — só montado quando o usuário ativa o 3D */}
          {is3D && <Terrain3DLayers />}

          {/* Rota padrão (cyan) — estado inicial, idêntico ao original */}
          {hasRoute && statMapMode === 'default' && (
            <Mapbox.ShapeSource id="summaryRoute" shape={geoJsonSource as any}>
              <Mapbox.LineLayer
                id="summaryRouteGlow"
                style={{
                  lineColor: T.routeColor,
                  lineWidth: 12,
                  lineOpacity: 0.25,
                  lineJoin: 'round',
                  lineCap: 'round',
                  lineEmissiveStrength: 1,
                }}
              />
              <Mapbox.LineLayer
                id="summaryRouteFill"
                style={{
                  lineColor: T.routeColor,
                  lineWidth: 5,
                  lineJoin: 'round',
                  lineCap: 'round',
                  lineEmissiveStrength: 1,
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Rota colorida por métrica (Stat Maps) — substitui a polyline padrão */}
          {hasRoute && statMapRoute && <StatMapRoute shape={statMapRoute} />}

          {/* Linha de chegada — bandeira no último ponto gravado */}
          {hasRoute && (
            <FinishFlagMarker coordinate={routeCoordinates[routeCoordinates.length - 1]} />
          )}
        </Mapbox.MapView>

        {/* Toggle de Terreno 3D — chip flutuante no canto do mapa */}
        {hasRoute && (
          <Pressable
            style={[styles.chip3d, { top: insets.top + 52 }, is3D && styles.chip3dActive]}
            onPress={() => setIs3D((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={is3D ? 'Desativar terreno 3D' : 'Ativar terreno 3D'}
            accessibilityState={{ selected: is3D }}
          >
            <Text style={[styles.chip3dText, is3D && { color: T.cyan }]}>3D</Text>
          </Pressable>
        )}

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
      )}

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

      {/* ── Bottom Sheet (modal de resultado) ────────────────────────────
          Tablet landscape: contido numa coluna à direita (master-detail).
          gorhom mede a altura do container pai, então o wrapper absoluto à
          direita transforma o "bottom sheet" num painel lateral. */}
      <View
        style={sideLayout ? styles.sheetSideWrap : StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
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

          {/* Título — usa o título real persistido no backend. autoTitle só
              é fallback quando o backend não devolveu título (ex: workout
              criado antes desse campo existir). Não filtra por mode: free
              runs também têm título salvo ("Corrida da manhã/tarde/noite"
              ancorado ao horário real de início, não ao "agora"). */}
          <View style={styles.titleWrap}>
            <Text style={styles.runTitle}>
              {workoutTitle ?? autoTitle}
            </Text>
          </View>

          {/* Row de 5 métricas */}
          <View style={styles.metricsRow}>
            <MetricCell label="Distância" value={`${distanceKm} Km`} />
            <MetricCell label="Tempo" value={timeStr} />
            <MetricCell label="Pace" value={`${avgPaceStr} /Km`} />
            <MetricCell label="Elev. Gan" value={`${resolvedElevationGain} m`} />
            <MetricCell label="Elev Max" value={`${resolvedMaxAltitude} m`} />
          </View>

          {/* Card Mapa — seletor de coloração da rota (Stat Maps). Só outdoor com rota. */}
          {!isTreadmill && hasRoute && (
            <View style={styles.cardDark}>
              <Text style={styles.cardTitle}>Mapa</Text>
              <View style={{ marginTop: 12 }}>
                <StatMapSelector
                  mode={statMapMode}
                  onChange={setStatMapMode}
                  hasElevation={hasElevation}
                />
              </View>
            </View>
          )}

          {/* Card Saúde — métricas vindas de wearable (FC + calorias). Só renderiza
              quando há dados, então corridas sem Watch/Garmin/etc. seguem com o
              layout original. */}
          {hasHealthMetrics && (
            <View style={styles.cardDark}>
              <View style={styles.paceCardHeader}>
                <Text style={styles.cardTitle}>Saúde</Text>
                {activitySource === 'apple_watch' && (
                  <View style={styles.sourceBadge}>
                    <Ionicons name="watch-outline" size={11} color={T.cyan} />
                    <Text style={styles.sourceBadgeText}>Apple Watch</Text>
                  </View>
                )}
              </View>
              <View style={{ marginTop: 4 }}>
                {avgHeartRate != null && avgHeartRate > 0 && (
                  <PaceStatRow label="FC média" value={`${avgHeartRate} bpm`} />
                )}
                {maxHeartRate != null && maxHeartRate > 0 && (
                  <PaceStatRow label="FC máxima" value={`${maxHeartRate} bpm`} />
                )}
                {calories != null && calories > 0 && (
                  <PaceStatRow label="Calorias" value={`${calories} kcal`} isLast />
                )}
              </View>
            </View>
          )}

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

          {/* Card de velocidade da esteira — aparece sempre que o treino é
              em esteira. O chart usa downsample + spacing explícito pra
              evitar o crash do Canvas Android com bitmap gigante. Quando
              `treadmillData` ou `speed_samples` faltam (ex.: workout
              legado sem cache local nem coluna populada no backend), o
              card ainda aparece com fallback explicativo — o usuário
              precisa enxergar que aquilo foi um treino interno. */}
          {isTreadmill ? (
            <View style={styles.treadmillChartCard}>
              <Text style={styles.treadmillChartTitle}>Velocidade na esteira</Text>
              <Text style={styles.treadmillChartSubtitle}>
                {treadmillData?.is_smart
                  ? 'Dados lidos diretamente da esteira via Bluetooth FTMS.'
                  : treadmillData?.is_smart === false
                    ? 'Modo manual — velocidade configurada pelo usuário.'
                    : 'Treino executado em esteira.'}
              </Text>
              {treadmillChart ? (
                <View style={styles.chartWrap}>
                  <LineChart
                    data={treadmillChart.data}
                    height={150}
                    width={chartAvailableWidth}
                    spacing={treadmillChart.spacing}
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
                    yAxisColor="transparent"
                    xAxisColor={T.divider}
                    rulesType="solid"
                    rulesColor="rgba(235,235,245,0.06)"
                    yAxisTextStyle={styles.chartAxisText}
                    xAxisLabelTextStyle={styles.chartAxisLabelText}
                    showVerticalLines={false}
                    hideDataPoints
                  />
                </View>
              ) : (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyText}>
                    Sem variação de velocidade registrada para este treino.
                  </Text>
                </View>
              )}
              <View style={styles.treadmillStatsRow}>
                <View style={styles.treadmillStatBlock}>
                  <Text style={styles.treadmillStatValue}>
                    {treadmillData?.avg_speed_kmh != null
                      ? treadmillData.avg_speed_kmh.toFixed(1)
                      : '—'}
                  </Text>
                  <Text style={styles.treadmillStatLabel}>Vel. média km/h</Text>
                </View>
                <View style={styles.treadmillStatBlock}>
                  <Text style={styles.treadmillStatValue}>
                    {treadmillData?.max_speed_kmh != null
                      ? treadmillData.max_speed_kmh.toFixed(1)
                      : '—'}
                  </Text>
                  <Text style={styles.treadmillStatLabel}>Vel. máx km/h</Text>
                </View>
                <View style={styles.treadmillStatBlock}>
                  <Text style={styles.treadmillStatValue}>
                    {treadmillData?.avg_incline != null
                      ? `${treadmillData.avg_incline.toFixed(1)}%`
                      : '—'}
                  </Text>
                  <Text style={styles.treadmillStatLabel}>Inclinação média</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Card Splits — só faz sentido para corridas outdoor (depende de GPS) */}
          {!isTreadmill && (
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
          )}

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

          {/* Card Altimetria — perfil de elevação (outdoor com altitude de GPS) */}
          {!isTreadmill && (
            <View style={styles.cardDark}>
              <View style={styles.paceCardHeader}>
                <Text style={styles.cardTitle}>Altimetria</Text>
                <Text style={styles.chartUnitInline}>
                  ↑ +{resolvedElevationGain}m · máx {resolvedMaxAltitude}m
                </Text>
              </View>

              {hasElevation ? (
                <View style={styles.chartWrap}>
                  <LineChart
                    data={elevCfg.data}
                    height={140}
                    width={elevCfg.width}
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
                    spacing={elevCfg.spacing}
                    yAxisColor="transparent"
                    xAxisColor={T.divider}
                    rulesType="solid"
                    rulesColor="rgba(235,235,245,0.06)"
                    yAxisTextStyle={styles.chartAxisText}
                    xAxisLabelTextStyle={styles.chartAxisLabelText}
                    yAxisLabelTexts={elevCfg.yAxisLabelTexts}
                    noOfSections={elevCfg.yAxisLabelTexts.length - 1}
                    maxValue={elevCfg.maxValue}
                    yAxisLabelWidth={CHART_Y_AXIS_LABEL_WIDTH}
                    xAxisLabelTexts={elevCfg.xLabels}
                    showVerticalLines={false}
                    hideDataPoints
                  />
                </View>
              ) : (
                <CardEmptyState
                  icon="trending-up-outline"
                  title={enriching ? 'Carregando altimetria...' : 'Sem dados de elevação'}
                  subtitle={
                    enriching
                      ? undefined
                      : 'Este treino não registrou variação de altitude pelo GPS.'
                  }
                  loading={enriching}
                />
              )}
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
      </View>

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

interface ElevationChartConfig {
  data: { value: number }[];
  yAxisLabelTexts: string[];
  maxValue: number;
  xLabels: string[];
  width: number;
  spacing: number;
}

// Config do chart de altimetria. Diferente do pace: NÃO é invertido (altitude
// maior = mais alto no gráfico) e a baseline é o ponto mais baixo da corrida
// (subtraído de cada valor), com labels do eixo Y em metros reais.
function buildElevationChartConfig(
  profile: ElevationPoint[],
  availableWidth: number,
): ElevationChartConfig {
  if (profile.length === 0) {
    return { data: [], yAxisLabelTexts: [], maxValue: 0, xLabels: [], width: availableWidth, spacing: 0 };
  }

  const alts = profile.map((p) => p.altitudeM);
  const rawMin = Math.min(...alts);
  const rawMax = Math.max(...alts);
  const minFloor = Math.floor(rawMin / 10) * 10;
  const maxCeil = Math.max(minFloor + 10, Math.ceil(rawMax / 10) * 10);
  const range = maxCeil - minFloor;

  const data = profile.map((p) => ({ value: p.altitudeM - minFloor }));

  const ySteps = 4;
  const yAxisLabelTexts: string[] = [];
  for (let i = 0; i <= ySteps; i++) {
    const meters = minFloor + (range / ySteps) * i;
    yAxisLabelTexts.push(`${Math.round(meters)}`);
  }

  const targetLabels = 4;
  const stride = Math.max(1, Math.round((profile.length - 1) / (targetLabels - 1)));
  const xLabels: string[] = profile.map((p, i) => {
    const isLast = i === profile.length - 1;
    if (i === 0 || isLast || i % stride === 0) {
      return `${p.distanceKm.toFixed(1)} km`;
    }
    return '';
  });

  const drawableWidth = Math.max(
    1,
    availableWidth - CHART_Y_AXIS_LABEL_WIDTH - CHART_INITIAL_SPACING - CHART_END_SPACING,
  );
  const spacing = drawableWidth / Math.max(profile.length - 1, 1);

  return { data, yAxisLabelTexts, maxValue: range, xLabels, width: availableWidth, spacing };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bgPrimary,
  },
  // ── Tablet landscape (master-detail; phone nunca usa) ──────────────────────
  // Mídia (mapa/esteira) ocupa ~60% à esquerda.
  mediaHalf: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '60%',
  },
  // Coluna direita que contém o BottomSheet (vira painel lateral de ~40%).
  sheetSideWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '40%',
  },

  // Toggle de Terreno 3D — chip flutuante sobre o mapa
  chip3d: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 28, 46, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(235, 235, 245, 0.12)',
    zIndex: 20,
  },
  chip3dActive: {
    borderColor: T.cyan,
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
  },
  chip3dText: {
    color: T.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },

  // Cold-start loading state — shown when opened via dumb-redirect entry
  // points (Calendar / Home / History) while hydration is in progress.
  coldStartLoading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  coldStartCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  coldStartText: {
    color: T.textSecondary,
    fontSize: 14,
  },

  // Treadmill backdrop (no map for treadmill runs)
  treadmillBackdrop: {
    backgroundColor: T.bgPrimary,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 90,
  },
  treadmillBackdropContent: {
    alignItems: 'center',
    gap: 6,
  },
  treadmillBackdropTitle: {
    color: T.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  treadmillBackdropSubtitle: {
    color: T.textSecondary,
    fontSize: 13,
  },

  // Treadmill speed chart card (replaces map area in the sheet)
  treadmillChartCard: {
    backgroundColor: T.cardDarker,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  treadmillChartTitle: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  treadmillChartSubtitle: {
    color: T.textSecondary,
    fontSize: 12,
    marginBottom: 12,
  },
  treadmillStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.divider,
  },
  treadmillStatBlock: {
    alignItems: 'center',
    flex: 1,
  },
  treadmillStatValue: {
    color: T.cyan,
    fontSize: 16,
    fontWeight: '700',
  },
  treadmillStatLabel: {
    color: T.textSecondary,
    fontSize: 11,
    marginTop: 2,
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

  // Badge de origem ("Apple Watch" no card de Saúde) — discreto à direita do título
  sourceBadge: {
    position: 'absolute',
    right: 0,
    top: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,212,255,0.30)',
  },
  sourceBadgeText: {
    color: T.cyan,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
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
  chartEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: {
    color: T.textSecondary,
    fontSize: 12,
    textAlign: 'center',
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
