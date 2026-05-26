/**
 * Treadmill tracking state — mirrors the surface area of `useTracking` (the
 * GPS hook) so the Running screen can switch between the two without
 * rewriting its UI. Smart mode pulls samples from `useTreadmillStore`
 * (filled by the FTMS BLE stream); manual mode runs an internal 1s timer
 * and integrates `manualSpeedKmh × elapsed`.
 *
 * Persistence is intentionally simpler than the outdoor hook: a treadmill
 * session has no route to recover, only counters. We keep a lightweight
 * snapshot in MMKV so a foreground crash doesn't lose the session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { useTreadmillStore, TreadmillMode } from '../stores/treadmillStore';
import { TreadmillSample } from '../services/treadmillService';

export type TreadmillSessionState =
  | 'calculating' // waiting for first sample (smart) or first start (manual)
  | 'training'
  | 'paused'
  | 'finished';

export interface TreadmillTrackingResult {
  isReady: boolean;
  sessionState: TreadmillSessionState;
  distance: number; // meters
  timeMs: number;
  currentPace: string; // formatted min:ss
  formattedTime: string; // hh:mm:ss
  currentSpeedKmh: number;
  currentInclinePercent: number;
  heartRate: number | null;
  calories: number;
  /** Samples captured along the run, used to reconstruct the speed chart. */
  speedSamples: { t: number; kmh: number; incline?: number }[];
  startResumeTracking: () => void;
  pauseTracking: () => void;
  finishTracking: () => Promise<{
    distance: number;
    timeMs: number;
    treadmillData: {
      is_smart: boolean;
      device_name?: string;
      avg_speed_kmh?: number;
      max_speed_kmh?: number;
      avg_incline?: number;
      total_calories?: number;
      speed_samples: { t: number; kmh: number; incline?: number }[];
    };
    heartRateAvg: number | null;
    heartRateMax: number | null;
  }>;
  clearTracking: () => void;
}

const storage = createMMKV({ id: 'treadmill-tracking' });
const KEY_DISTANCE = 'treadmill_distance';
const KEY_ACC_TIME = 'treadmill_accumulated_ms';
const KEY_STATE = 'treadmill_state';

function formatTime(totalMs: number): string {
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatPace(speedKmh: number): string {
  if (speedKmh <= 0) return '--:--';
  const paceSec = (60 / speedKmh) * 60;
  const min = Math.floor(paceSec / 60);
  const sec = Math.floor(paceSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function useTreadmillTracking(
  mode: TreadmillMode,
): TreadmillTrackingResult {
  const currentSample = useTreadmillStore((s) => s.currentSample);
  const manualSpeedKmh = useTreadmillStore((s) => s.manualSpeedKmh);
  const connectedDevice = useTreadmillStore((s) => s.connectedDevice);

  const [sessionState, setSessionState] =
    useState<TreadmillSessionState>('calculating');
  const [distance, setDistance] = useState(0);
  const [timeMs, setTimeMs] = useState(0);

  // Smart-mode baseline: the treadmill reports cumulative distance from its
  // own start. We capture the value at "Iniciar" so our distance counter
  // starts at zero regardless of where the treadmill is in its session.
  const smartDistanceBaselineRef = useRef<number | null>(null);
  const lastStartTickRef = useRef<number | null>(null);
  const samplesRef = useRef<{ t: number; kmh: number; incline?: number }[]>([]);
  const sessionStartRef = useRef<number | null>(null);
  const heartRateSumRef = useRef(0);
  const heartRateCountRef = useRef(0);
  const heartRateMaxRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const inclineSumRef = useRef(0);
  const inclineCountRef = useRef(0);
  const lastCaloriesRef = useRef(0);

  // 1-second tick for the elapsed time + manual distance integration.
  useEffect(() => {
    if (sessionState !== 'training') {
      lastStartTickRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const last = lastStartTickRef.current ?? now;
      const deltaMs = now - last;
      lastStartTickRef.current = now;

      setTimeMs((prev) => {
        const next = prev + deltaMs;
        storage.set(KEY_ACC_TIME, next);
        return next;
      });

      if (mode === 'manual') {
        const deltaSec = deltaMs / 1000;
        const meters = (manualSpeedKmh / 3.6) * deltaSec;
        setDistance((prev) => {
          const next = prev + meters;
          storage.set(KEY_DISTANCE, next);
          return next;
        });

        const elapsedSec =
          sessionStartRef.current != null
            ? Math.floor((now - sessionStartRef.current) / 1000)
            : 0;
        samplesRef.current.push({ t: elapsedSec, kmh: manualSpeedKmh });
        if (manualSpeedKmh > maxSpeedRef.current)
          maxSpeedRef.current = manualSpeedKmh;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState, mode, manualSpeedKmh]);

  // Smart-mode reaction to the latest FTMS sample.
  useEffect(() => {
    if (mode !== 'smart') return;
    if (sessionState !== 'training') return;
    if (!currentSample) return;

    const sample = currentSample;

    if (smartDistanceBaselineRef.current == null) {
      smartDistanceBaselineRef.current = sample.distance;
    }
    const relativeDistance = Math.max(
      0,
      sample.distance - smartDistanceBaselineRef.current,
    );
    setDistance(relativeDistance);
    storage.set(KEY_DISTANCE, relativeDistance);

    if (sample.heartRate != null && sample.heartRate > 0) {
      heartRateSumRef.current += sample.heartRate;
      heartRateCountRef.current += 1;
      if (sample.heartRate > heartRateMaxRef.current)
        heartRateMaxRef.current = sample.heartRate;
    }
    if (sample.speed > maxSpeedRef.current) maxSpeedRef.current = sample.speed;
    if (sample.incline != null) {
      inclineSumRef.current += sample.incline;
      inclineCountRef.current += 1;
    }
    if (sample.calories > 0) lastCaloriesRef.current = sample.calories;

    const elapsedSec =
      sessionStartRef.current != null
        ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
        : sample.elapsedTime;
    samplesRef.current.push({
      t: elapsedSec,
      kmh: sample.speed,
      incline: sample.incline,
    });
  }, [currentSample, sessionState, mode]);

  const startResumeTracking = useCallback(() => {
    setSessionState('training');
    storage.set(KEY_STATE, 'training');
    if (sessionStartRef.current == null) {
      sessionStartRef.current = Date.now();
    }
    lastStartTickRef.current = Date.now();
  }, []);

  const pauseTracking = useCallback(() => {
    setSessionState('paused');
    storage.set(KEY_STATE, 'paused');
  }, []);

  const finishTracking = useCallback(async () => {
    setSessionState('finished');
    storage.set(KEY_STATE, 'finished');

    const avgSpeed =
      samplesRef.current.length > 0
        ? samplesRef.current.reduce((a, s) => a + s.kmh, 0) /
          samplesRef.current.length
        : 0;
    const avgIncline =
      inclineCountRef.current > 0
        ? inclineSumRef.current / inclineCountRef.current
        : 0;
    const heartRateAvg =
      heartRateCountRef.current > 0
        ? Math.round(heartRateSumRef.current / heartRateCountRef.current)
        : null;
    const heartRateMax =
      heartRateMaxRef.current > 0 ? heartRateMaxRef.current : null;

    return {
      distance,
      timeMs,
      treadmillData: {
        is_smart: mode === 'smart',
        device_name: connectedDevice?.name ?? (mode === 'manual' ? 'Manual' : undefined),
        avg_speed_kmh: avgSpeed > 0 ? Math.round(avgSpeed * 100) / 100 : undefined,
        max_speed_kmh:
          maxSpeedRef.current > 0
            ? Math.round(maxSpeedRef.current * 100) / 100
            : undefined,
        avg_incline:
          inclineCountRef.current > 0
            ? Math.round(avgIncline * 10) / 10
            : undefined,
        total_calories:
          lastCaloriesRef.current > 0 ? lastCaloriesRef.current : undefined,
        speed_samples: samplesRef.current,
      },
      heartRateAvg,
      heartRateMax,
    };
  }, [distance, timeMs, mode, connectedDevice]);

  const clearTracking = useCallback(() => {
    setSessionState('calculating');
    setDistance(0);
    setTimeMs(0);
    smartDistanceBaselineRef.current = null;
    sessionStartRef.current = null;
    samplesRef.current = [];
    heartRateSumRef.current = 0;
    heartRateCountRef.current = 0;
    heartRateMaxRef.current = 0;
    maxSpeedRef.current = 0;
    inclineSumRef.current = 0;
    inclineCountRef.current = 0;
    lastCaloriesRef.current = 0;
    storage.remove(KEY_DISTANCE);
    storage.remove(KEY_ACC_TIME);
    storage.remove(KEY_STATE);
  }, []);

  const currentSpeedKmh =
    mode === 'smart' ? currentSample?.speed ?? 0 : manualSpeedKmh;
  const currentInclinePercent =
    mode === 'smart' ? currentSample?.incline ?? 0 : 0;
  const heartRate = mode === 'smart' ? currentSample?.heartRate ?? null : null;
  const calories =
    mode === 'smart' ? currentSample?.calories ?? 0 : Math.floor(timeMs / 1000 * 0.15);

  return {
    isReady: true,
    sessionState,
    distance,
    timeMs,
    currentPace: formatPace(currentSpeedKmh),
    formattedTime: formatTime(timeMs),
    currentSpeedKmh,
    currentInclinePercent,
    heartRate,
    calories,
    speedSamples: samplesRef.current,
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
  };
}
