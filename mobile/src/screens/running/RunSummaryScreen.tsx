import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

// ─── Tipos de rota ────────────────────────────────────────────────────────────
type RunSummaryRouteParams = {
  RunSummary: {
    workoutId?: string;
    distance: number;       // metros
    timeMs: number;         // milissegundos
    routeCoordinates: number[][]; // [lng, lat][]
    savedLocally?: boolean;
  };
};

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bgPrimary: '#0E0E1F',
  cardSurface: '#1C1C2E',
  cyan: '#00D4FF',
  textPrimary: '#EBEBF5',
  textSecondary: 'rgba(235, 235, 245, 0.60)',
  success: '#32CD32',
  warning: '#FFC400',
  routeColor: '#00D4FF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatPace(ms: number, meters: number): string {
  if (meters < 50) return '--:--';
  const distanceKm = meters / 1000;
  const timeMinutes = ms / 60000;
  const pace = timeMinutes / distanceKm;
  if (!isFinite(pace) || pace <= 0) return '--:--';
  const minutes = Math.floor(pace);
  const seconds = Math.floor((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function estimateCalories(meters: number, timeMs: number): number {
  // Estimativa simples: ~60-70 kcal/km para um corredor médio de ~70kg
  const distanceKm = meters / 1000;
  return Math.round(distanceKm * 65);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RunSummaryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RunSummaryRouteParams, 'RunSummary'>>();

  const {
    distance = 0,
    timeMs = 0,
    routeCoordinates = [],
    savedLocally = false,
  } = route.params || {};

  const distanceKm = (distance / 1000).toFixed(2);
  const pace = formatPace(timeMs, distance);
  const time = formatTime(timeMs);
  const calories = estimateCalories(distance, timeMs);

  // GeoJSON para desenhar a rota no mapa
  const geoJsonSource = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: routeCoordinates.length > 0 ? routeCoordinates : [[0, 0]],
        },
      },
    ],
  };

  // Centro e bounds do mapa baseado na rota
  const hasRoute = routeCoordinates.length > 1;
  let centerCoord = routeCoordinates[0] || [-46.6333, -23.5505]; // São Paulo fallback
  let bounds: { ne: number[]; sw: number[] } | undefined;

  if (hasRoute) {
    const lngs = routeCoordinates.map((c) => c[0]);
    const lats = routeCoordinates.map((c) => c[1]);
    const padding = 0.002; // ~200m buffer
    bounds = {
      ne: [Math.max(...lngs) + padding, Math.max(...lats) + padding],
      sw: [Math.min(...lngs) - padding, Math.min(...lats) - padding],
    };
    centerCoord = [
      (bounds.ne[0] + bounds.sw[0]) / 2,
      (bounds.ne[1] + bounds.sw[1]) / 2,
    ];
  }

  const handleGoHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' as never, params: { initialTab: 'Home' } }],
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {/* ── Banner de salvamento local ─────────────────────────────────── */}
        {savedLocally && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={T.warning} />
            <Text style={styles.offlineBannerText}>
              Treino salvo localmente. Será enviado quando houver conexão.
            </Text>
          </View>
        )}

        {/* ── Mapa com rota ──────────────────────────────────────────────── */}
        <View style={styles.mapContainer}>
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
              bounds={bounds ? { ne: bounds.ne, sw: bounds.sw, paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 } : undefined}
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

          {/* Header sobreposto */}
          <SafeAreaView style={styles.mapHeader} edges={['top']}>
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={T.success} />
              <Text style={styles.completedText}>Treino Concluído</Text>
            </View>
          </SafeAreaView>
        </View>

        {/* ── Métricas Principais ────────────────────────────────────────── */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCardLarge}>
            <Text style={styles.metricLargeValue}>{distanceKm}</Text>
            <Text style={styles.metricLargeUnit}>km</Text>
            <Text style={styles.metricLabel}>Distância</Text>
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Ionicons name="time-outline" size={20} color={T.cyan} style={styles.metricIcon} />
              <Text style={styles.metricValue}>{time}</Text>
              <Text style={styles.metricLabel}>Tempo</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="speedometer-outline" size={20} color={T.cyan} style={styles.metricIcon} />
              <Text style={styles.metricValue}>{pace}</Text>
              <Text style={styles.metricLabel}>Pace médio</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="flame-outline" size={20} color={T.cyan} style={styles.metricIcon} />
              <Text style={styles.metricValue}>{calories}</Text>
              <Text style={styles.metricLabel}>kcal (est.)</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Botão fixo no rodapé ────────────────────────────────────────── */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        <Pressable
          style={styles.homeBtn}
          onPress={handleGoHome}
          accessibilityRole="button"
          accessibilityLabel="Voltar para início"
        >
          <Text style={styles.homeBtnText}>Voltar ao Início</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bgPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // ── Offline banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 196, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  offlineBannerText: {
    color: T.warning,
    fontSize: 13,
    flex: 1,
  },

  // ── Map
  mapContainer: {
    height: 280,
    backgroundColor: T.cardSurface,
  },
  mapHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(14, 14, 31, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
    gap: 6,
  },
  completedText: {
    color: T.success,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Metrics
  metricsGrid: {
    padding: 16,
    gap: 12,
  },
  metricCardLarge: {
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  metricLargeValue: {
    color: T.cyan,
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 52,
  },
  metricLargeUnit: {
    color: T.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: T.cardSurface,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  metricIcon: {
    marginBottom: 6,
  },
  metricValue: {
    color: T.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  metricLabel: {
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    marginTop: 4,
  },

  // ── Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: T.bgPrimary,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(235, 235, 245, 0.08)',
  },
  homeBtn: {
    backgroundColor: T.cyan,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    color: T.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
