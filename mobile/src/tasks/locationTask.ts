import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import haversine from 'haversine';
import { createMMKV } from 'react-native-mmkv';

export const LOCATION_TRACKING_TASK = 'BACKGROUND_LOCATION_TASK';

export const trackingStorage = createMMKV({ id: 'running-tracking-storage' });

// ─── Constantes de filtro anti-drift ─────────────────────────────────────────
// Limiar de precisão: pontos com erro > 15m são descartados (GPS indoor ruim)
const MAX_ACCURACY_METERS = 15;

// Distância mínima entre dois pontos consecutivos para ser aceito como movimento real
// Abaixo disso (< 8m) é ruído do GPS parado, não deslocamento real
const MIN_DISTANCE_METERS = 8;

// Distância máxima por intervalo: > 200m em 2s = ~360 km/h, impossível a pé → descarta
const MAX_DISTANCE_PER_INTERVAL_METERS = 200;

// Velocidade máxima aceitável para corrida: 15 m/s ≈ 54 km/h (recorde mundial sprint)
const MAX_SPEED_MS = 15;

// Se GPS reportar speed ≥ 0 e ≤ este valor, consideramos parado de verdade
// e não acumulamos distância mesmo que haja pequena variação nas coords
const MIN_SPEED_TO_MOVE_MS = 0.5; // < 1.8 km/h = parado ou andando bem devagar

TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[Tracking Task] Erro na task de localização:', error);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations[0];

  // ── FILTRO 1: Precisão do GPS ──────────────────────────────────────────────
  // Descarta pontos com erro horizontal > MAX_ACCURACY_METERS
  if (!loc.coords.accuracy || loc.coords.accuracy > MAX_ACCURACY_METERS) {
    console.log(`[Tracking Task] Ponto ignorado. Precisão ruim: ${loc.coords.accuracy?.toFixed(1)}m (máx: ${MAX_ACCURACY_METERS}m)`);
    return;
  }

  // ── FILTRO 2: Velocidade zero (parado) ────────────────────────────────────
  // Se o GPS reportar speed válido e muito baixo, ignora o ponto
  // Isso elimina o "samba" quando o usuário está parado
  const speed = loc.coords.speed ?? -1;
  if (speed >= 0 && speed < MIN_SPEED_TO_MOVE_MS) {
    console.log(`[Tracking Task] Ponto ignorado. Velocidade muito baixa: ${speed.toFixed(2)} m/s`);
    return;
  }

  // ── FILTRO 3: Velocidade máxima (spike impossível) ─────────────────────────
  // Speed > 15 m/s para corrida é absurdo: rejeita
  if (speed > MAX_SPEED_MS) {
    console.log(`[Tracking Task] Ponto ignorado. Velocidade impossível: ${speed.toFixed(2)} m/s`);
    return;
  }

  try {
    const storedPoints = trackingStorage.getString('route_points');
    const routePointsList: Array<{
      latitude: number;
      longitude: number;
      altitude: number | null;
      timestamp: number;
      speed: number | null;
      accuracy: number | null;
    }> = storedPoints ? JSON.parse(storedPoints) : [];

    const newPoint = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      altitude: loc.coords.altitude,
      timestamp: loc.timestamp,
      speed: loc.coords.speed,
      accuracy: loc.coords.accuracy,
    };

    let currentDistance = trackingStorage.getNumber('current_distance') || 0;

    if (routePointsList.length > 0) {
      const lastPoint = routePointsList[routePointsList.length - 1];

      // Proteção contra timestamp duplicado
      if (lastPoint.timestamp === newPoint.timestamp) {
        console.log('[Tracking Task] Ponto ignorado. Timestamp duplicado.');
        return;
      }

      const addedDistance = haversine(
        { latitude: lastPoint.latitude, longitude: lastPoint.longitude },
        { latitude: newPoint.latitude, longitude: newPoint.longitude },
        { unit: 'meter' }
      );

      // ── FILTRO 4: Distância mínima ─────────────────────────────────────────
      // Movimento de < MIN_DISTANCE_METERS entre dois pontos = ruído do GPS parado
      if (addedDistance < MIN_DISTANCE_METERS) {
        console.log(`[Tracking Task] Ponto ignorado. Distância < mínima: ${addedDistance.toFixed(1)}m (mín: ${MIN_DISTANCE_METERS}m)`);
        return;
      }

      // ── FILTRO 5: Distância máxima por intervalo (teleport) ───────────────
      // Salto de > MAX_DISTANCE_PER_INTERVAL_METERS = coordenada errada ou bug de GPS
      if (addedDistance > MAX_DISTANCE_PER_INTERVAL_METERS) {
        console.log(`[Tracking Task] Ponto ignorado. Salto impossível: ${addedDistance.toFixed(1)}m`);
        return;
      }

      currentDistance += addedDistance;
      console.log(`[Tracking Task] ✓ Ponto aceito. +${addedDistance.toFixed(1)}m | Total: ${(currentDistance / 1000).toFixed(3)}km | Speed: ${speed.toFixed(2)} m/s`);
    } else {
      // Primeiro ponto: apenas registra, sem somar distância
      console.log(`[Tracking Task] ✓ Primeiro ponto registrado. Precisão: ${newPoint.accuracy?.toFixed(1)}m`);
    }

    routePointsList.push(newPoint);

    trackingStorage.set('current_distance', currentDistance);
    trackingStorage.set('route_points', JSON.stringify(routePointsList));
    trackingStorage.set('last_update_ts', Date.now());

  } catch (e) {
    console.error('[Tracking Task] Erro processando coordenadas em background', e);
  }
});
