-- Precise elevation enrichment (Mapbox Terrain-DEM) for activities.
--
-- elevation_profile : smoothed DEM-derived profile, array of {distanceKm, altitudeM}
--                     consumed directly by the RunSummary altimetry chart.
-- elevation_source  : 'gps' (raw GPS altitude, legacy) | 'dem' (Mapbox Terrain-DEM corrected)
--
-- The existing `elevation_gain` column is OVERWRITTEN with the DEM-derived gain
-- when the async enrichment job (elevation-queue) succeeds; on failure the GPS
-- values are left untouched. Both columns are additive and nullable, so this
-- migration is non-destructive and safe to run on a live table.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS elevation_profile JSONB;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS elevation_source TEXT;
