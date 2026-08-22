import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { colors } from "../../../theme";
import type { ActivityResultRoutePoint } from "../../../stores/feedbackStore";
import { NoRoutePreview } from "./NoRoutePreview";
import { FinishFlagMarker } from "../../map/FinishFlagMarker";

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
  const bounds = useMemo(() => {
    if (route.length < 2) return null;
    const lng = route.map((point) => point.longitude);
    const lat = route.map((point) => point.latitude);
    return {
      ne: [Math.max(...lng), Math.max(...lat)] as [number, number],
      sw: [Math.min(...lng), Math.min(...lat)] as [number, number],
    };
  }, [route]);

  if (isTreadmill || route.length < 2) {
    return <NoRoutePreview isTreadmill={isTreadmill} />;
  }

  // Inactive pages sit off-screen. Keeping them as a neutral surface avoids
  // five simultaneous native maps; once selected, the exact Mapbox map below
  // mounts. No streets or geography are ever synthesized.
  if (!isActive || !bounds) {
    return <View style={styles.inactiveSurface} />;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Mapbox.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={
          process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ||
          "mapbox://styles/mapbox/dark-v11"
        }
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
          bounds={{
            ne: bounds.ne,
            sw: bounds.sw,
            paddingTop: 20,
            paddingBottom: 28,
            paddingLeft: 24,
            paddingRight: 24,
          }}
          animationDuration={0}
        />
        <Mapbox.ShapeSource id={`homeResultSource${id}`} shape={shape}>
          <Mapbox.LineLayer
            id={`homeResultGlow${id}`}
            style={{
              lineColor: colors.primary,
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
              lineColor: colors.primary,
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
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: "#11151B" },
  inactiveSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#11151B",
  },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,11,0.08)",
  },
});
