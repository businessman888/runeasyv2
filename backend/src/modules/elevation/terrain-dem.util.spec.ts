import {
  DEM_ZOOM,
  decodeElevation,
  lngLatToTilePixel,
  lngLatToTileFractional,
  sampleElevationFromTile,
  haversineMeters,
  smoothProfile,
  computeElevationGain,
  uniqueTilesForPoints,
  tileKey,
  type ElevationProfilePoint,
} from './terrain-dem.util';

describe('terrain-dem.util', () => {
  describe('decodeElevation', () => {
    it('decodes black pixel to the -10000m floor', () => {
      expect(decodeElevation(0, 0, 0)).toBe(-10000);
    });

    it('decodes RGB(1,134,160) to sea level (0 m)', () => {
      // 1*65536 + 134*256 + 160 = 100000 → *0.1 - 10000 = 0
      expect(decodeElevation(1, 134, 160)).toBeCloseTo(0, 6);
    });

    it('one unit of blue = 0.1 m above the floor', () => {
      expect(decodeElevation(0, 0, 1)).toBeCloseTo(-9999.9, 6);
    });
  });

  describe('lngLatToTilePixel', () => {
    it('maps lng/lat to integer tile + in-bounds pixel', () => {
      const r = lngLatToTilePixel(-46.6333, -23.5505, DEM_ZOOM);
      expect(Number.isInteger(r.tileX)).toBe(true);
      expect(Number.isInteger(r.tileY)).toBe(true);
      expect(r.px).toBeGreaterThanOrEqual(0);
      expect(r.px).toBeLessThan(512);
      expect(r.py).toBeGreaterThanOrEqual(0);
      expect(r.py).toBeLessThan(512);
    });

    it('places (0,0) at the center tile for the zoom', () => {
      const n = Math.pow(2, DEM_ZOOM);
      const { x, y } = lngLatToTileFractional(0, 0, DEM_ZOOM);
      expect(x).toBeCloseTo(n / 2, 6);
      expect(y).toBeCloseTo(n / 2, 6);
    });

    it('tileX/tileY are independent of tileSize argument', () => {
      const a = lngLatToTilePixel(10, 45, DEM_ZOOM, 256);
      const b = lngLatToTilePixel(10, 45, DEM_ZOOM, 512);
      expect(a.tileX).toBe(b.tileX);
      expect(a.tileY).toBe(b.tileY);
    });
  });

  describe('sampleElevationFromTile', () => {
    it('reads the RGBA pixel at (px,py) and decodes it', () => {
      const size = 2;
      const data = new Uint8Array(size * size * 4);
      // pixel (1,0) → index (0*2 + 1)*4 = 4
      data[4] = 1;
      data[5] = 134;
      data[6] = 160;
      expect(sampleElevationFromTile(data, 1, 0, size)).toBeCloseTo(0, 6);
    });
  });

  describe('haversineMeters', () => {
    it('≈111 km for 1° of longitude at the equator', () => {
      const d = haversineMeters({ lng: 0, lat: 0 }, { lng: 1, lat: 0 });
      expect(d).toBeGreaterThan(111000);
      expect(d).toBeLessThan(111400);
    });

    it('is zero for identical points', () => {
      expect(
        haversineMeters({ lng: -46, lat: -23 }, { lng: -46, lat: -23 }),
      ).toBe(0);
    });
  });

  describe('smoothProfile', () => {
    it('returns same length and softens a spike', () => {
      const pts: ElevationProfilePoint[] = [
        { distanceKm: 0, altitudeM: 100 },
        { distanceKm: 0.1, altitudeM: 100 },
        { distanceKm: 0.2, altitudeM: 200 }, // spike
        { distanceKm: 0.3, altitudeM: 100 },
        { distanceKm: 0.4, altitudeM: 100 },
      ];
      const out = smoothProfile(pts, 5);
      expect(out).toHaveLength(5);
      expect(out[2].altitudeM).toBeLessThan(200); // spike attenuated
      expect(out[2].distanceKm).toBe(0.2); // x preserved
    });

    it('handles empty input', () => {
      expect(smoothProfile([])).toEqual([]);
    });
  });

  describe('computeElevationGain', () => {
    it('sums only positive deltas above threshold', () => {
      const pts: ElevationProfilePoint[] = [
        { distanceKm: 0, altitudeM: 100 },
        { distanceKm: 1, altitudeM: 110 }, // +10
        { distanceKm: 2, altitudeM: 105 }, // -5 (ignored)
        { distanceKm: 3, altitudeM: 125 }, // +20
      ];
      expect(computeElevationGain(pts, 1)).toBe(30);
    });

    it('ignores sub-threshold noise', () => {
      const pts: ElevationProfilePoint[] = [
        { distanceKm: 0, altitudeM: 100 },
        { distanceKm: 1, altitudeM: 100.4 }, // +0.4 < 1m
        { distanceKm: 2, altitudeM: 100.8 }, // +0.4 < 1m
      ];
      expect(computeElevationGain(pts, 1)).toBe(0);
    });
  });

  describe('uniqueTilesForPoints', () => {
    it('dedupes tiles shared by nearby points', () => {
      const tiles = uniqueTilesForPoints(
        [
          { lng: -46.6333, lat: -23.5505 },
          { lng: -46.6334, lat: -23.5506 }, // same tile
          { lng: -46.6335, lat: -23.5507 }, // same tile
        ],
        DEM_ZOOM,
      );
      expect(tiles.length).toBe(1);
      const keys = new Set(tiles.map((t) => tileKey(t.z, t.x, t.y)));
      expect(keys.size).toBe(tiles.length);
    });
  });
});
