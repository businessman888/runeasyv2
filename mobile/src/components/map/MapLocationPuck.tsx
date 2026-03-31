import React, { useState, useCallback } from 'react';
import Mapbox from '@rnmapbox/maps';

// ─── Assets ──────────────────────────────────────────────────────────────────
// Registered via Mapbox.Images — rnmapbox handles native resolution on both
// Android & iOS without manual URI conversion (avoids the "not a string" crash).
const puckImages = {
  puckCenter: require('../../assets/map/puckCenter.png'),
  puckShadow: require('../../assets/map/leckPuck.png'),
  puckCone: require('../../assets/map/neewPuckCone.png'),
};

// ─── Tuning Constants ────────────────────────────────────────────────────────
// newPuckCone.png: triangle pointing RIGHT, white dot at LEFT tip.
// Bounding box is roughly square. The white dot sits ~30% from the left edge,
// so the center of the bounding box is to the RIGHT of the white dot.
//
// To make the white dot the rotation pivot:
//   iconAnchor: 'center' → bounding-box center placed at user location
//   iconOffset: [X, 0]   → shift image RIGHT so the white dot moves to center
//                           X ≈ (imageWidth/2 - whiteDotX) in original px
//
// iconRotate compensates the image pointing right (90°) vs Mapbox north (0°).
const CONE_OFFSET_X = 32;    // px to shift cone right (hides white dot under center)
const CONE_OFFSET_Y = -19;    // px to shift cone down (white dot is at top-left, not center-left)
const CONE_ROTATION_COMP = -90; // compensate horizontal PNG → Mapbox north
const CONE_SIZE = 0.8;
const CENTER_SIZE = 1.15;     // slightly larger to fully cover the cone origin
const SHADOW_SIZE = 1.0;

interface MapLocationPuckProps {
  onGPSFix?: () => void;
}

/**
 * Custom location indicator for RunEasy map.
 *
 * Renders three stacked Mapbox SymbolLayers (bottom → top):
 *   1. Shadow/accuracy circle (leckPuck.png)
 *   2. Heading cone (newPuckCone.png) — rotates dynamically
 *   3. Center circle (puckCenter.png) — covers the cone origin
 *
 * Must be placed inside a <Mapbox.MapView>.
 */
export function MapLocationPuck({ onGPSFix }: MapLocationPuckProps) {
  const [heading, setHeading] = useState(0);
  const [hasFix, setHasFix] = useState(false);

  const handleUpdate = useCallback(
    (location: Mapbox.Location) => {
      if (!hasFix) {
        setHasFix(true);
        onGPSFix?.();
      }
      if (location.coords.heading != null && location.coords.heading >= 0) {
        setHeading(location.coords.heading);
      }
    },
    [hasFix, onGPSFix],
  );

  return (
    <>
      {/* Register PNG assets as native Mapbox images */}
      <Mapbox.Images images={puckImages} />

      <Mapbox.UserLocation
        visible={true}
        renderMode="normal"
        showsUserHeadingIndicator={false}
        onUpdate={handleUpdate}
      >
        {/* Layer 1 (bottom): Accuracy / shadow circle */}
        <Mapbox.SymbolLayer
          id="userLocationShadow"
          style={{
            iconImage: 'puckShadow',
            iconSize: SHADOW_SIZE,
            iconAllowOverlap: true,
            iconPitchAlignment: 'map',
          }}
        />

        {/* Layer 2 (middle): Heading cone — white dot hidden at center */}
        <Mapbox.SymbolLayer
          id="userLocationCone"
          style={{
            iconImage: 'puckCone',
            iconSize: CONE_SIZE,
            iconAllowOverlap: true,
            iconAnchor: 'center',
            iconOffset: [CONE_OFFSET_X, CONE_OFFSET_Y],
            iconRotate: heading + CONE_ROTATION_COMP,
            iconRotationAlignment: 'map',
          }}
        />

        {/* Layer 3 (top): Center circle — covers cone origin completely */}
        <Mapbox.SymbolLayer
          id="userLocationCenter"
          style={{
            iconImage: 'puckCenter',
            iconSize: CENTER_SIZE,
            iconAllowOverlap: true,
          }}
        />
      </Mapbox.UserLocation>
    </>
  );
}
