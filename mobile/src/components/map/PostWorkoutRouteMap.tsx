import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import type { FeatureCollection, LineString } from 'geojson';

import type { StatMapFeatureCollection } from '../../utils/runMetrics';
import { useMotionPreferences } from '../../hooks/useMotionPreferences';
import {
  createThemeStyles,
  useAppTheme,
  useMapThemePalette,
  useThemeSubscription,
} from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { AppPressable } from '../ui/AppPressable';
import { FinishFlagMarker } from './FinishFlagMarker';
import { StatMapRoute } from './StatMapRoute';
import { Terrain3DLayers } from './Terrain3DLayers';
import { mapboxStyleURL, ThemedMapStyle } from './ThemedMapStyle';

type Coordinate = [number, number];

interface PostWorkoutRouteMapProps {
  routeCoordinates: number[][];
  statMapRoute: StatMapFeatureCollection | null;
  sourceId: string;
  topInset: number;
  bottomCameraPadding?: number;
  isSheetCollapsed: boolean;
  onToggleSheet: () => void;
  showSheetControl?: boolean;
  enriching?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface RouteViewport {
  center: Coordinate;
  northEast: Coordinate;
  southWest: Coordinate;
  zoom3D: number;
}

const FALLBACK_CENTER: Coordinate = [-46.6333, -23.5505];

function isCoordinate(value: number[]): value is Coordinate {
  return (
    value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
  );
}

function buildViewport(routeCoordinates: Coordinate[]): RouteViewport {
  if (routeCoordinates.length < 2) {
    return {
      center: FALLBACK_CENTER,
      northEast: FALLBACK_CENTER,
      southWest: FALLBACK_CENTER,
      zoom3D: 15,
    };
  }

  const longitudes = routeCoordinates.map((coordinate) => coordinate[0]);
  const latitudes = routeCoordinates.map((coordinate) => coordinate[1]);
  const padding = 0.002;
  const northEast: Coordinate = [
    Math.max(...longitudes) + padding,
    Math.max(...latitudes) + padding,
  ];
  const southWest: Coordinate = [
    Math.min(...longitudes) - padding,
    Math.min(...latitudes) - padding,
  ];
  const maxSpan = Math.max(
    Math.abs(northEast[0] - southWest[0]),
    Math.abs(northEast[1] - southWest[1]),
    0.0005,
  );

  return {
    center: [
      (northEast[0] + southWest[0]) / 2,
      (northEast[1] + southWest[1]) / 2,
    ],
    northEast,
    southWest,
    zoom3D: Math.max(11, Math.min(16, Math.log2(360 / maxSpan) - 0.8)),
  };
}

function PostWorkoutRouteMapComponent({
  routeCoordinates,
  statMapRoute,
  sourceId,
  topInset,
  bottomCameraPadding = 320,
  isSheetCollapsed,
  onToggleSheet,
  showSheetControl = true,
  enriching = false,
  style,
}: PostWorkoutRouteMapProps) {
  useThemeSubscription();
  const cameraRef = useRef<Mapbox.Camera>(null);
  const [is3D, setIs3D] = useState(true);
  const { theme } = useAppTheme();
  const { resolveDuration } = useMotionPreferences();
  const mapPalette = useMapThemePalette();
  const coordinates = useMemo(
    () => routeCoordinates.filter(isCoordinate),
    [routeCoordinates],
  );
  const hasRoute = coordinates.length > 1;
  const viewport = useMemo(() => buildViewport(coordinates), [coordinates]);
  const routeShape = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: hasRoute ? coordinates : [FALLBACK_CENTER],
          },
        },
      ],
    }),
    [coordinates, hasRoute],
  );

  const frameRoute = useCallback(
    (use3D: boolean) => {
      if (!hasRoute) {
        cameraRef.current?.setCamera({
          centerCoordinate: FALLBACK_CENTER,
          zoomLevel: 15,
          pitch: use3D ? 55 : 0,
          heading: 0,
          animationDuration: resolveDuration(500),
          animationMode: 'easeTo',
        });
        return;
      }

      if (use3D) {
        cameraRef.current?.setCamera({
          centerCoordinate: viewport.center,
          zoomLevel: viewport.zoom3D,
          pitch: 55,
          heading: 0,
          animationDuration: resolveDuration(600),
          animationMode: 'easeTo',
        });
        return;
      }

      cameraRef.current?.fitBounds(
        viewport.northEast,
        viewport.southWest,
        [80, 40, bottomCameraPadding, 40],
        resolveDuration(600),
      );
    }, [bottomCameraPadding, hasRoute, resolveDuration, viewport],
  );

  const toggle3D = useCallback(() => {
    setIs3D((current) => {
      const next = !current;
      requestAnimationFrame(() => frameRoute(next));
      return next;
    });
  }, [frameRoute]);

  return (
    <View style={style ?? StyleSheet.absoluteFillObject}>
      <Mapbox.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={mapboxStyleURL}
        logoEnabled={false}
        compassEnabled
        compassFadeWhenNorth
        compassPosition={{ top: topInset + 202, right: 18 }}
        attributionEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled
        zoomEnabled
        pitchEnabled
        rotateEnabled
        maxPitch={65}
        requestDisallowInterceptTouchEvent
        localizeLabels={{ locale: 'current' }}
        gestureSettings={{
          panEnabled: true,
          pinchPanEnabled: true,
          pinchZoomEnabled: true,
          doubleTapToZoomInEnabled: true,
          doubleTouchToZoomOutEnabled: true,
          quickZoomEnabled: true,
          rotateEnabled: true,
          pitchEnabled: true,
        }}
        accessibilityLabel="Mapa interativo da rota do treino"
        accessibilityHint="Arraste para mover, faça pinça para aproximar e use dois dedos para inclinar ou girar"
      >
        <ThemedMapStyle />
        <Mapbox.Camera
          ref={cameraRef}
          centerCoordinate={viewport.center}
          zoomLevel={is3D ? viewport.zoom3D : hasRoute ? undefined : 15}
          pitch={is3D ? 55 : 0}
          heading={0}
          minZoomLevel={3}
          maxZoomLevel={20}
          bounds={
            !is3D && hasRoute
              ? {
                  ne: viewport.northEast,
                  sw: viewport.southWest,
                  paddingTop: 80,
                  paddingBottom: bottomCameraPadding,
                  paddingLeft: 40,
                  paddingRight: 40,
                }
              : undefined
          }
          animationDuration={resolveDuration(600)}
          animationMode="easeTo"
        />

        {is3D && <Terrain3DLayers />}

        {hasRoute && !statMapRoute && (
          <Mapbox.ShapeSource id={sourceId} shape={routeShape}>
            <Mapbox.LineLayer
              id={`${sourceId}Glow`}
              style={{
                lineColor: mapPalette.routeGlow,
                lineWidth: 12,
                lineOpacity: 0.25,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
            <Mapbox.LineLayer
              id={`${sourceId}Fill`}
              style={{
                lineColor: mapPalette.route,
                lineWidth: 5,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {hasRoute && statMapRoute && <StatMapRoute shape={statMapRoute} />}
        {hasRoute && (
          <FinishFlagMarker coordinate={coordinates[coordinates.length - 1]} />
        )}
      </Mapbox.MapView>

      {hasRoute && (
        <View style={[styles.controls, { top: topInset + 52 }]} pointerEvents="box-none">
          <MapControl
            label={is3D ? 'Usar mapa em 2D' : 'Usar mapa em 3D'}
            hint={is3D ? 'Remove a inclinação e o relevo do mapa' : 'Mostra inclinação, relevo e objetos tridimensionais'}
            selected={is3D}
            onPress={toggle3D}
          >
            <Text style={[styles.modeText, is3D && styles.modeTextActive]}>
              {is3D ? '2D' : '3D'}
            </Text>
          </MapControl>

          <MapControl
            label="Reenquadrar rota"
            hint="Centraliza a rota completa novamente no mapa"
            onPress={() => frameRoute(is3D)}
          >
            <Ionicons name="scan-outline" size={21} color={theme.colors.textPrimary} />
          </MapControl>

          {showSheetControl && (
            <MapControl
              label={isSheetCollapsed ? 'Mostrar resumo do treino' : 'Ampliar mapa'}
              hint={isSheetCollapsed ? 'Restaura o painel de resumo' : 'Recolhe o painel para aumentar a área visível do mapa'}
              selected={isSheetCollapsed}
              onPress={onToggleSheet}
            >
              <Ionicons
                name={isSheetCollapsed ? 'chevron-up' : 'expand-outline'}
                size={21}
                color={isSheetCollapsed ? theme.colors.accent : theme.colors.textPrimary}
              />
            </MapControl>
          )}
        </View>
      )}

      {!hasRoute && (
        <View style={styles.mapOverlay} pointerEvents="none">
          <View style={styles.mapOverlayPill}>
            {enriching ? (
              <>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.mapOverlayText}>Carregando rota...</Text>
              </>
            ) : (
              <>
                <Ionicons name="map-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.mapOverlayText}>Rota não disponível</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

interface MapControlProps {
  label: string;
  hint: string;
  selected?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

function MapControl({ label, hint, selected = false, onPress, children }: MapControlProps) {
  useThemeSubscription();

  return (
    <AppPressable
      style={[styles.control, selected && styles.controlSelected]}
      interactionScale="icon"
      hapticFeedback="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
    >
      {children}
    </AppPressable>
  );
}

export const PostWorkoutRouteMap = memo(PostWorkoutRouteMapComponent);

const styles = createThemeStyles(() => ({
  controls: {
    position: 'absolute',
    right: 16,
    gap: 8,
    zIndex: 20,
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderStrong,
  },
  controlSelected: {
    borderColor: semanticColors.accent,
    backgroundColor: semanticColors.accentSubtle,
  },
  modeText: {
    color: semanticColors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  modeTextActive: {
    color: semanticColors.accent,
  },
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
    backgroundColor: semanticColors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderSubtle,
  },
  mapOverlayText: {
    color: semanticColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
}));
