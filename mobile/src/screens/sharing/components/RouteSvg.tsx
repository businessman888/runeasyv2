import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';

interface RouteSvgProps {
  points: Array<{ latitude: number; longitude: number }>;
  width: number;
  height: number;
  strokeColor?: string;
  padding?: number;
}

export function RouteSvg({
  points,
  width,
  height,
  strokeColor = '#FFFFFF',
  padding = 12,
}: RouteSvgProps) {
  const pathData = useMemo(() => {
    if (!points || points.length < 2) return null;

    // Convert to GeoJSON and simplify
    const coords = points.map((p) => [p.longitude, p.latitude] as [number, number]);
    const line = lineString(coords);
    const simplified = simplify(line, { tolerance: 0.0001, highQuality: true });
    const simpleCoords = simplified.geometry.coordinates;

    if (simpleCoords.length < 2) return null;

    // Compute bounds
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of simpleCoords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const rangeLng = maxLng - minLng || 0.001;
    const rangeLat = maxLat - minLat || 0.001;
    const drawW = width - padding * 2;
    const drawH = height - padding * 2;

    // Normalize to viewport
    const normalized = simpleCoords.map(([lng, lat]) => {
      const x = padding + ((lng - minLng) / rangeLng) * drawW;
      const y = padding + ((maxLat - lat) / rangeLat) * drawH; // flip Y
      return [x, y] as [number, number];
    });

    // Build path string
    return normalized
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
  }, [points, width, height, padding]);

  if (!pathData) return null;

  return (
    <Svg width={width} height={height}>
      {/* Outer glow */}
      <Path
        d={pathData}
        stroke={strokeColor}
        strokeWidth={8}
        strokeOpacity={0.08}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Medium glow */}
      <Path
        d={pathData}
        stroke={strokeColor}
        strokeWidth={4}
        strokeOpacity={0.25}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Main line */}
      <Path
        d={pathData}
        stroke={strokeColor}
        strokeWidth={2}
        strokeOpacity={1.0}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
