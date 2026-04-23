import React, { useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { LineChart } from 'react-native-gifted-charts';
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

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bgPrimary: '#0E0E1F',
  cardSurface: '#1C1C2E',
  cardLight: '#252538',
  cyan: '#00D4FF',
  textPrimary: '#EBEBF5',
  textSecondary: 'rgba(235, 235, 245, 0.60)',
  textMuted: 'rgba(235, 235, 245, 0.35)',
  success: '#32CD32',
  warning: '#FFC400',
  danger: '#FF453A',
  routeColor: '#00D4FF',
  border: 'rgba(255,255,255,0.08)',
};

function formatDistance(meters: number) {
  return (meters / 1000).toFixed(2);
}

function formatTodayDate() {
  const d = new Date();
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
}

type Status = 'good' | 'ok' | 'bad';
function getDeltaStatus(actual: number, target: number, tolerance = 0.05): Status {
  const ratio = (actual - target) / target;
  if (Math.abs(ratio) <= tolerance) return 'good';
  if (Math.abs(ratio) <= tolerance * 2) return 'ok';
  return 'bad';
}

function statusColor(status: Status) {
  if (status === 'good') return T.success;
  if (status === 'ok') return T.warning;
  return T.danger;
}

function statusLabel(actual: number, target: number, formatter: (n: number) => string): string {
  const delta = actual - target;
  if (delta === 0) return 'No alvo';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatter(Math.abs(delta))}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RunSummaryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RunSummaryRouteParams, 'RunSummary'>>();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);

  const {
    distance = 0,
    timeMs = 0,
    routeCoordinates = [],
    routePoints = [],
    savedLocally = false,
    mode = 'free',
    targetPaceSeconds,
    targetDistanceKm,
    workoutTitle,
  } = route.params || {};

  // Métricas derivadas
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

  const distanceKm = formatDistance(distance);
  const timeStr = formatDurationMs(timeMs);
  const avgPaceStr = formatPaceSeconds(summary.avgPaceSecondsPerKm);

  // Bounds para o mapa
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

  const handleShare = useCallback(async () => {
    const titlePrefix = mode === 'free' ? 'Treino livre' : workoutTitle ?? 'Treino';
    const message = `${titlePrefix} 🏃\n\nDistância: ${distanceKm} km\nTempo: ${timeStr}\nPace médio: ${avgPaceStr} /km`;
    try {
      await Share.share({ message });
    } catch {
      /* user cancelled */
    }
  }, [mode, workoutTitle, distanceKm, timeStr, avgPaceStr]);

  // Snap points: 35% (vê mapa), 92% (full)
  const snapPoints = useMemo(() => ['35%', '92%'], []);

  // Planned vs executed (apenas no modo manual ou planejado se houver target)
  const showPlannedVsExecuted = mode === 'manual' && targetPaceSeconds && targetDistanceKm;
  const distanceStatus: Status | null = showPlannedVsExecuted
    ? getDeltaStatus(distance / 1000, targetDistanceKm!)
    : null;
  const paceStatus: Status | null = showPlannedVsExecuted && summary.avgPaceSecondsPerKm > 0
    // Para pace, "menor é melhor" — invertemos a leitura
    ? getDeltaStatus(targetPaceSeconds!, summary.avgPaceSecondsPerKm)
    : null;

  // Pace chart data
  const chartData = paceChart.map((p) => ({
    value: p.paceSecondsPerKm,
    label: '',
  }));
  const chartHasData = chartData.length > 1;

  return (
    <View style={styles.container}>
      {/* ── Mapa em tela cheia atrás ─────────────────────────────────────── */}
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
      </View>

      {/* Header overlay */}
      <SafeAreaView edges={['top']} style={styles.topOverlay}>
        <Pressable style={styles.iconBtn} onPress={handleClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={T.textPrimary} />
        </Pressable>
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark-circle" size={18} color={T.success} />
          <Text style={styles.completedText}>Treino concluído</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={handleShare} hitSlop={10}>
          <Ionicons name="share-outline" size={22} color={T.textPrimary} />
        </Pressable>
      </SafeAreaView>

      {savedLocally && (
        <View style={[styles.offlineBanner, { top: insets.top + 60 }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={T.warning} />
          <Text style={styles.offlineBannerText}>
            Salvo localmente. Será enviado quando houver conexão.
          </Text>
        </View>
      )}

      {/* ── Bottom Sheet estilo Strava ────────────────────────────────────── */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Cabeçalho do sheet */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {workoutTitle ?? (mode === 'free' ? 'Treino livre' : 'Treino')}
            </Text>
            <Text style={styles.sheetDate}>{formatTodayDate()}</Text>
          </View>

          {/* Métricas grandes */}
          <View style={styles.bigMetricsRow}>
            <View style={styles.bigMetric}>
              <Text style={styles.bigMetricValue}>{distanceKm}</Text>
              <Text style={styles.bigMetricUnit}>km</Text>
              <Text style={styles.bigMetricLabel}>Distância</Text>
            </View>
            <View style={styles.bigMetricDivider} />
            <View style={styles.bigMetric}>
              <Text style={styles.bigMetricValue}>{timeStr}</Text>
              <Text style={[styles.bigMetricUnit, { opacity: 0 }]}>.</Text>
              <Text style={styles.bigMetricLabel}>Tempo</Text>
            </View>
            <View style={styles.bigMetricDivider} />
            <View style={styles.bigMetric}>
              <Text style={styles.bigMetricValue}>{avgPaceStr}</Text>
              <Text style={styles.bigMetricUnit}>/km</Text>
              <Text style={styles.bigMetricLabel}>Pace médio</Text>
            </View>
          </View>

          {/* ── Planejado vs Executado (apenas modo manual) ──────────────── */}
          {showPlannedVsExecuted && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Planejado vs Executado</Text>
              <View style={styles.compareCard}>
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

          {/* ── Splits ───────────────────────────────────────────────────── */}
          {splits.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Splits por km</Text>
              <View style={styles.splitsCard}>
                <View style={styles.splitsHeaderRow}>
                  <Text style={[styles.splitsHeaderText, { flex: 0.5 }]}>Km</Text>
                  <Text style={[styles.splitsHeaderText, { flex: 2 }]}>Pace</Text>
                  <Text style={[styles.splitsHeaderText, { flex: 1, textAlign: 'right' }]}>↑ m</Text>
                </View>
                {splits.map((s) => (
                  <View key={s.kmNumber} style={styles.splitRow}>
                    <Text style={[styles.splitKm, { flex: 0.5 }]}>
                      {s.kmNumber}
                      {s.distanceMeters < 1000 && (
                        <Text style={styles.splitFraction}>
                          {' '}({(s.distanceMeters / 1000).toFixed(2)}km)
                        </Text>
                      )}
                    </Text>
                    <View style={[styles.splitBarContainer, { flex: 2 }]}>
                      <View style={[styles.splitBar, { width: `${s.barWidthRatio * 100}%` }]} />
                      <Text style={styles.splitPace}>{formatPaceSeconds(s.paceSecondsPerKm)}</Text>
                    </View>
                    <Text style={[styles.splitElevation, { flex: 1, textAlign: 'right' }]}>
                      {s.elevationGainM > 0 ? `+${s.elevationGainM}` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Gráfico de pace ──────────────────────────────────────────── */}
          {chartHasData && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pace ao longo da corrida</Text>
              <View style={styles.chartCard}>
                <LineChart
                  data={chartData}
                  height={140}
                  width={300}
                  hideDataPoints
                  thickness={2.5}
                  color={T.cyan}
                  startFillColor={T.cyan}
                  endFillColor={T.cyan}
                  startOpacity={0.45}
                  endOpacity={0.05}
                  areaChart
                  curved
                  yAxisColor="transparent"
                  xAxisColor="transparent"
                  hideRules
                  hideYAxisText
                  initialSpacing={0}
                  endSpacing={0}
                  spacing={Math.max(2, 280 / Math.max(chartData.length - 1, 1))}
                />
                <View style={styles.chartLegend}>
                  <Text style={styles.chartLegendText}>
                    Melhor: <Text style={{ color: T.cyan }}>{formatPaceSeconds(summary.bestPaceSecondsPerKm)}</Text>
                  </Text>
                  <Text style={styles.chartLegendText}>
                    Pior: <Text style={{ color: T.warning }}>{formatPaceSeconds(summary.worstPaceSecondsPerKm)}</Text>
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Resumo de pace + elevação ────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resumo</Text>
            <View style={styles.summaryGrid}>
              <SummaryItem
                icon="speedometer-outline"
                label="Pace médio"
                value={`${avgPaceStr}/km`}
              />
              <SummaryItem
                icon="trending-down"
                label="Pace mais rápido"
                value={`${formatPaceSeconds(summary.bestPaceSecondsPerKm)}/km`}
              />
              <SummaryItem
                icon="trending-up"
                label="Pace mais lento"
                value={`${formatPaceSeconds(summary.worstPaceSecondsPerKm)}/km`}
              />
              <SummaryItem
                icon="trail-sign-outline"
                label="Ganho de elevação"
                value={`${summary.totalElevationGainM} m`}
              />
              <SummaryItem
                icon="triangle-outline"
                label="Altitude máxima"
                value={`${summary.maxAltitudeM} m`}
              />
              <SummaryItem
                icon="flame-outline"
                label="Calorias (est.)"
                value={`${Math.round((distance / 1000) * 65)} kcal`}
              />
            </View>
          </View>

          {/* ── Compartilhamento ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Pressable style={styles.shareCard} onPress={handleShare} android_ripple={{ color: T.cardLight }}>
              <View style={styles.shareIconWrap}>
                <Ionicons name="share-social" size={20} color={T.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>Compartilhar treino</Text>
                <Text style={styles.shareSubtitle}>Mande os números pros amigos</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={T.textSecondary} />
            </Pressable>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* ── Botão fixo ────────────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.homeBtn} onPress={handleClose}>
          <Text style={styles.homeBtnText}>Concluir</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────
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
        <View style={[styles.compareDeltaBadge, { backgroundColor: statusColor(status) + '22', borderColor: statusColor(status) }]}>
          <View style={[styles.compareDot, { backgroundColor: statusColor(status) }]} />
          <Text style={[styles.compareDeltaText, { color: statusColor(status) }]}>{delta}</Text>
        </View>
      </View>
    </View>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryItemIcon}>
        <Ionicons name={icon} size={18} color={T.cyan} />
      </View>
      <Text style={styles.summaryItemValue}>{value}</Text>
      <Text style={styles.summaryItemLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bgPrimary,
  },

  // Header overlay
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
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 14, 31, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  completedText: {
    color: T.success,
    fontSize: 14,
    fontWeight: '600',
  },
  offlineBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 196, 0, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    zIndex: 9,
  },
  offlineBannerText: {
    color: T.warning,
    fontSize: 12,
    flex: 1,
  },

  // Bottom sheet
  sheetBackground: {
    backgroundColor: T.bgPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: {
    backgroundColor: T.textMuted,
    width: 48,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetHeader: {
    paddingVertical: 8,
    marginBottom: 12,
  },
  sheetTitle: {
    color: T.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  sheetDate: {
    color: T.textSecondary,
    fontSize: 13,
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Big metrics
  bigMetricsRow: {
    flexDirection: 'row',
    backgroundColor: T.cardSurface,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  bigMetric: {
    flex: 1,
    alignItems: 'center',
  },
  bigMetricDivider: {
    width: 1,
    height: 36,
    backgroundColor: T.border,
  },
  bigMetricValue: {
    color: T.cyan,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  bigMetricUnit: {
    color: T.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  bigMetricLabel: {
    color: T.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },

  // Sections
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: T.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  // Compare (planned vs executed)
  compareCard: {
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    padding: 14,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  compareDivider: {
    height: 1,
    backgroundColor: T.border,
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

  // Splits
  splitsCard: {
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    padding: 12,
  },
  splitsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  splitsHeaderText: {
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  splitKm: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  splitFraction: {
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  splitBarContainer: {
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  splitBar: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    backgroundColor: T.cyan + '55',
    borderRadius: 6,
  },
  splitPace: {
    color: T.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    zIndex: 1,
  },
  splitElevation: {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  // Chart
  chartCard: {
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  chartLegendText: {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  // Summary grid
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryItem: {
    flexBasis: '31.5%',
    flexGrow: 1,
    backgroundColor: T.cardSurface,
    borderRadius: 14,
    padding: 12,
    alignItems: 'flex-start',
  },
  summaryItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  summaryItemValue: {
    color: T.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryItemLabel: {
    color: T.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },

  // Share
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  shareIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTitle: {
    color: T.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  shareSubtitle: {
    color: T.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: T.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  homeBtn: {
    backgroundColor: T.cyan,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    color: T.bgPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
