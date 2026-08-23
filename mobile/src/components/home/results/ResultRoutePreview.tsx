import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { useMapThemePalette } from "../../../theme";
import { semanticColors } from "../../../theme/semanticColors";
import type { ActivityResultRoutePoint } from "../../../stores/feedbackStore";
import { NoRoutePreview } from "./NoRoutePreview";
import { FinishFlagMarker } from "../../map/FinishFlagMarker";
import {
  mapboxStyleURL,
  ThemedMapStyle,
} from "../../map/ThemedMapStyle";

interface ResultRoutePreviewProps {
  activityId: string;
  route: ActivityResultRoutePoint[];
  isTreadmill: boolean;
  isActive: boolean;
}

export const ResultRoutePreview = memo(function ResultRoutePreview({
  activityId,
  route,
  isTreadmill,
  isActive,
}: ResultRoutePreviewProps) {
  const mapPalette = useMapThemePalette();
  const id = activityId.replace(/[^a-zA-Z0-9]/g, "").slice(-20) || "route";
  const shape = useMemo(
    () => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: route.map((point) => [point.longitude, point.latitude]),
      },
    }),
    [route],
  );
  const streetCenter = useMemo(() => {
    if (route.length < 2) return null;
    const midpoint = route[Math.floor(route.length / 2)];
    return [midpoint.longitude, midpoint.latitude] as [number, number];
  }, [route]);

  if (isTreadmill || route.length < 2) {
    return <NoRoutePreview isTreadmill={isTreadmill} />;
  }

  // Inactive pages sit off-screen. Keeping them as a neutral surface avoids
  // five simultaneous native maps; once selected, the exact Mapbox map below
  // mounts. No streets or geography are ever synthesized.
  if (!isActive || !streetCenter) {
    return <View style={styles.inactiveSurface} />;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Mapbox.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={mapboxStyleURL}
        logoEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        zoomEnabled={false}
      >
        <ThemedMapStyle />
        <Mapbox.Camera
          centerCoordinate={streetCenter}
          zoomLevel={14}
          animationDuration={0}
        />
        <Mapbox.ShapeSource id={`homeResultSource${id}`} shape={shape}>
          <Mapbox.LineLayer
            id={`homeResultGlow${id}`}
            style={{
              lineColor: mapPalette.routeGlow,
              lineWidth: 12,
              lineOpacity: 0.25,
              lineJoin: "round",
              lineCap: "round",
              lineEmissiveStrength: 1,
            }}
          />
          <Mapbox.LineLayer
            id={`homeResultLine${id}`}
            style={{
              lineColor: mapPalette.route,
              lineWidth: 5,
              lineOpacity: 1,
              lineJoin: "round",
              lineCap: "round",
              lineEmissiveStrength: 1,
            }}
          />
        </Mapbox.ShapeSource>
        <FinishFlagMarker
          coordinate={[
            route[route.length - 1].longitude,
            route[route.length - 1].latitude,
          ]}
          size={24}
        />
      </Mapbox.MapView>
      <View style={styles.mapShade} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: semanticColors.surface1 },
  inactiveSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: semanticColors.surface1,
  },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,11,0.08)",
  },
});
