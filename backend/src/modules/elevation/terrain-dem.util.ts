/**
 * Pure helpers for Mapbox Terrain-DEM elevation enrichment.
 *
 * Kept free of I/O (no axios/pngjs) so the math is trivially unit-testable.
 * The PNG decode (pngjs) happens in ElevationService; here we only consume the
 * already-decoded RGBA pixel buffer.
 *
 * DEM source: `mapbox.mapbox-terrain-dem-v1` (same tileset used by the mobile
 * 3D terrain). RGB-encoded; decode formula is the standard Terrain-RGB one.
 */

/** Zoom level for DEM sampling. z14 @2x ≈ 4.7 m/pixel — good for run routes. */
export const DEM_ZOOM = 14;
/** `@2x.pngraw` tiles are 512×512. */
export const DEM_TILE_SIZE = 512;

export interface LngLat {
  lng: number;
  lat: number;
}

export interface ElevationProfilePoint {
  distanceKm: number;
  altitudeM: number;
}

/** Fractional slippy-map tile coordinates for a lng/lat at a given zoom. */
export function lngLatToTileFractional(
  lng: number,
  lat: number,
  z: number,
): { x: number; y: number } {
  const n = Math.pow(2, z);
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Integer tile containing the point + the pixel within a tileSize image. */
export function lngLatToTilePixel(
  lng: number,
  lat: number,
  z: number,
  tileSize: number = DEM_TILE_SIZE,
): { tileX: number; tileY: number; px: number; py: number } {
  const { x, y } = lngLatToTileFractional(lng, lat, z);
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  const px = Math.min(
    tileSize - 1,
    Math.max(0, Math.floor((x - tileX) * tileSize)),
  );
  const py = Math.min(
    tileSize - 1,
    Math.max(0, Math.floor((y - tileY) * tileSize)),
  );
  return { tileX, tileY, px, py };
}

/** Mapbox Terrain-RGB / Terrain-DEM pixel → elevation in meters. */
export function decodeElevation(r: number, g: number, b: number): number {
  return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
}

/** Sample elevation (m) from a decoded RGBA buffer (e.g. pngjs `PNG.data`). */
export function sampleElevationFromTile(
  data: Uint8Array | Buffer,
  px: number,
  py: number,
  tileSize: number = DEM_TILE_SIZE,
): number {
  const idx = (py * tileSize + px) * 4; // RGBA
  return decodeElevation(data[idx], data[idx + 1], data[idx + 2]);
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

export function demTileUrl(
  z: number,
  x: number,
  y: number,
  token: string,
): string {
  return `https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${z}/${x}/${y}@2x.pngraw?access_token=${token}`;
}

/** Haversine distance in meters. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Moving-average smoothing (default window 5) over altitudeM. */
export function smoothProfile(
  points: ElevationProfilePoint[],
  window = 5,
): ElevationProfilePoint[] {
  if (points.length === 0) return [];
  return points.map((p, idx) => {
    const start = Math.max(0, idx - Math.floor(window / 2));
    const end = Math.min(points.length, idx + Math.ceil(window / 2));
    const slice = points.slice(start, end);
    const avg = slice.reduce((s, q) => s + q.altitudeM, 0) / slice.length;
    return { distanceKm: p.distanceKm, altitudeM: avg };
  });
}

/** Total positive elevation gain (m); ignores per-segment deltas below threshold. */
export function computeElevationGain(
  points: ElevationProfilePoint[],
  thresholdM = 1,
): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].altitudeM - points[i - 1].altitudeM;
    if (diff >= thresholdM) gain += diff;
  }
  return Math.round(gain);
}

/** Unique tile keys covering a set of points (for batched fetching). */
export function uniqueTilesForPoints(
  points: LngLat[],
  z: number = DEM_ZOOM,
): { z: number; x: number; y: number }[] {
  const seen = new Set<string>();
  const tiles: { z: number; x: number; y: number }[] = [];
  for (const p of points) {
    const { tileX, tileY } = lngLatToTilePixel(p.lng, p.lat, z);
    const key = tileKey(z, tileX, tileY);
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push({ z, x: tileX, y: tileY });
    }
  }
  return tiles;
}
