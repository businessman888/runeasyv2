import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../../theme";
import type { ActivityResultRoutePoint } from "../../../stores/feedbackStore";
import { NoRoutePreview } from "./NoRoutePreview";

interface ResultRoutePreviewProps {
  activityId: string;
  route: ActivityResultRoutePoint[];
  isTreadmill: boolean;
  isActive: boolean;
}

function routePath(route: ActivityResultRoutePoint[]) {
  if (route.length < 2) return "";
  const latitudes = route.map((point) => point.latitude);
  const longitudes = route.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;
  return route
    .map((point, index) => {
      const x = 14 + ((point.longitude - minLng) / lngRange) * 327;
      const y = 12 + (1 - (point.latitude - minLat) / latRange) * 172;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
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

  if (!isActive || !bounds) {
    const path = routePath(route);
    return (
      <View style={styles.staticMap}>
        <Svg width="100%" height="100%" viewBox="0 0 355 196">
          <Path
            d="M-20 52 C58 30 83 92 152 67 S255 18 380 43"
            fill="none"
            stroke="rgba(235,235,245,0.065)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Path
            d="M20 188 C76 121 129 139 194 105 S291 70 375 119"
            fill="none"
            stroke="rgba(235,235,245,0.065)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Path
            d="M72 -20 C84 45 57 92 103 220"
            fill="none"
            stroke="rgba(235,235,245,0.065)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Path
            d="M269 -20 C245 48 294 102 252 220"
            fill="none"
            stroke="rgba(235,235,245,0.065)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Path
            d={path}
            fill="none"
            stroke="rgba(0,212,255,0.2)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={path}
            fill="none"
            stroke={colors.primary}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        styleURL={
          process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ||
          "mapbox://styles/mapbox/dark-v11"
        }
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
      >
        <Mapbox.Camera
          bounds={{
            ...bounds,
            paddingTop: 28,
            paddingBottom: 42,
            paddingLeft: 28,
            paddingRight: 28,
          }}
          animationDuration={0}
        />
        <Mapbox.ShapeSource id={`homeResultSource${id}`} shape={shape}>
          <Mapbox.LineLayer
            id={`homeResultGlow${id}`}
            style={{
              lineColor: colors.primary,
              lineWidth: 8,
              lineOpacity: 0.18,
              lineBlur: 4,
              lineJoin: "round",
              lineCap: "round",
            }}
          />
          <Mapbox.LineLayer
            id={`homeResultLine${id}`}
            style={{
              lineColor: colors.primary,
              lineWidth: 4,
              lineOpacity: 1,
              lineJoin: "round",
              lineCap: "round",
              lineEmissiveStrength: 1,
            }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>
      <View style={styles.mapShade} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: "#11151B" },
  staticMap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#11151B" },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,11,0.12)",
  },
});
