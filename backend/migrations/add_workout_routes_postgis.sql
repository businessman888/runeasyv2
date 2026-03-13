-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create workout_routes table
CREATE TABLE IF NOT EXISTS workout_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    route geometry(LineString, 4326),
    raw_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Spatial Index
CREATE INDEX IF NOT EXISTS workout_routes_route_gix ON workout_routes USING GIST (route);
CREATE INDEX IF NOT EXISTS workout_routes_workout_id_idx ON workout_routes(workout_id);
