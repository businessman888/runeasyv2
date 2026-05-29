import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PNG } from 'pngjs';
import { SupabaseService } from '../../database';
import {
  DEM_ZOOM,
  DEM_TILE_SIZE,
  type LngLat,
  type ElevationProfilePoint,
  lngLatToTilePixel,
  sampleElevationFromTile,
  tileKey,
  demTileUrl,
  haversineMeters,
  smoothProfile,
  computeElevationGain,
  uniqueTilesForPoints,
} from './terrain-dem.util';

/** Max points sampled per route (bounds work + keeps the stored profile small). */
const MAX_SAMPLE_POINTS = 256;

interface DecodedTile {
  data: Buffer;
  size: number;
}

/** Minimal shape of a stored GPS route point (activities.gps_route). */
interface RawRoutePoint {
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class ElevationService {
  private readonly logger = new Logger(ElevationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Enriches an activity's elevation with precise Mapbox Terrain-DEM data.
   *
   * Best-effort and idempotent: on ANY failure (no token, no route, all tiles
   * unreachable, decode error) it logs and leaves the existing GPS-based
   * `elevation_gain` untouched — never throws, so the BullMQ job won't churn.
   */
  async enrichActivity(activityId: string): Promise<void> {
    try {
      const token = this.config.get<string>('MAPBOX_ACCESS_TOKEN');
      if (!token) {
        this.logger.warn(
          `[elevation] MAPBOX_ACCESS_TOKEN not set — skipping activity ${activityId}`,
        );
        return;
      }

      const { data: activity, error } = await this.supabaseService
        .from('activities')
        .select('id, gps_route, environment')
        .eq('id', activityId)
        .single();

      if (error || !activity) {
        this.logger.warn(
          `[elevation] activity ${activityId} not found: ${error?.message ?? 'no row'}`,
        );
        return;
      }
      if (activity.environment === 'treadmill') return;

      const route: RawRoutePoint[] = Array.isArray(activity.gps_route)
        ? (activity.gps_route as RawRoutePoint[])
        : [];
      const points: LngLat[] = [];
      for (const p of route) {
        if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
          points.push({ lng: p.longitude, lat: p.latitude });
        }
      }

      if (points.length < 2) {
        this.logger.log(
          `[elevation] activity ${activityId}: no usable route points — skipping`,
        );
        return;
      }

      const sampled = this.downsample(points, MAX_SAMPLE_POINTS);
      const tiles = uniqueTilesForPoints(sampled, DEM_ZOOM);

      // Fetch + decode each unique tile once.
      const tileCache = new Map<string, DecodedTile>();
      await Promise.all(
        tiles.map(async (t) => {
          try {
            const buf = await this.fetchTile(t.z, t.x, t.y, token);
            const png = PNG.sync.read(buf);
            tileCache.set(tileKey(t.z, t.x, t.y), {
              data: png.data,
              size: png.width || DEM_TILE_SIZE,
            });
          } catch (e) {
            this.logger.warn(
              `[elevation] tile ${tileKey(t.z, t.x, t.y)} failed: ${(e as Error).message}`,
            );
          }
        }),
      );

      if (tileCache.size === 0) {
        this.logger.warn(
          `[elevation] activity ${activityId}: all ${tiles.length} tiles failed — keeping GPS elevation`,
        );
        return;
      }

      // Build the profile: cumulative distance (km) + sampled DEM elevation (m).
      let cumDistM = 0;
      const raw: ElevationProfilePoint[] = [];
      for (let i = 0; i < sampled.length; i++) {
        if (i > 0) cumDistM += haversineMeters(sampled[i - 1], sampled[i]);
        const { tileX, tileY } = lngLatToTilePixel(
          sampled[i].lng,
          sampled[i].lat,
          DEM_ZOOM,
        );
        const tile = tileCache.get(tileKey(DEM_ZOOM, tileX, tileY));
        if (!tile) continue; // tile fetch failed → skip this point
        const { px, py } = lngLatToTilePixel(
          sampled[i].lng,
          sampled[i].lat,
          DEM_ZOOM,
          tile.size,
        );
        const altitudeM = sampleElevationFromTile(tile.data, px, py, tile.size);
        raw.push({ distanceKm: cumDistM / 1000, altitudeM });
      }

      if (raw.length < 2) {
        this.logger.warn(
          `[elevation] activity ${activityId}: not enough sampled points — keeping GPS elevation`,
        );
        return;
      }

      const profile = smoothProfile(raw).map((p) => ({
        distanceKm: Number(p.distanceKm.toFixed(3)),
        altitudeM: Math.round(p.altitudeM * 10) / 10,
      }));
      const gain = computeElevationGain(profile);

      const { error: updateError } = await this.supabaseService
        .from('activities')
        .update({
          elevation_profile: profile,
          elevation_gain: gain,
          elevation_source: 'dem',
        })
        .eq('id', activityId);

      if (updateError) {
        this.logger.error(
          `[elevation] failed to persist activity ${activityId}: ${updateError.message}`,
        );
        return;
      }

      this.logger.log(
        `[elevation] activity ${activityId}: ${tiles.length} tile(s), ${profile.length} pts, gain=${gain}m`,
      );
    } catch (e) {
      // Catch-all: enrichment is best-effort, never breaks the pipeline.
      this.logger.error(
        `[elevation] unexpected error enriching activity ${activityId}: ${(e as Error).message}`,
      );
    }
  }

  private async fetchTile(
    z: number,
    x: number,
    y: number,
    token: string,
  ): Promise<Buffer> {
    const res = await axios.get(demTileUrl(z, x, y, token), {
      responseType: 'arraybuffer',
      timeout: 8000,
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  /** Uniform downsample to at most `max` points, always keeping the last point. */
  private downsample<T>(arr: T[], max: number): T[] {
    if (arr.length <= max) return arr;
    const stride = Math.ceil(arr.length / max);
    const out: T[] = [];
    for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
    if (out[out.length - 1] !== arr[arr.length - 1])
      out.push(arr[arr.length - 1]);
    return out;
  }
}
