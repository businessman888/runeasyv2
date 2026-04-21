import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import haversine from 'haversine';
import { createMMKV } from 'react-native-mmkv';

export const LOCATION_TRACKING_TASK = 'BACKGROUND_LOCATION_TASK';

export const trackingStorage = createMMKV({ id: 'running-tracking-storage' });

// ─── Constantes de filtro anti-drift ─────────────────────────────────────────
// Limiar de precisão: pontos com erro > 10m são descartados.
// Reduzido de 15m para 10m: com 15m de tolerância, o GPS oscilava ±15m mesmo parado,
// gerando saltos falsos de 8–15m que passavam pelo filtro de distância mínima.
const MAX_ACCURACY_METERS = 10;

// Distância mínima entre dois pontos consecutivos para ser aceito como movimento real.
// Aumentado de 8m para 10m: exige deslocamento maior para descartar ruído residual
// de GPS com 10m de precisão (oscilação ~5–8m ainda possível).
const MIN_DISTANCE_METERS = 10;

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
  // Após resume, GPS precisa de "warm-up" — primeiros pontos podem ter accuracy pior.
  // Grace period: aceita até 30m nos primeiros pontos pós-resume.
  const graceCount = trackingStorage.getNumber('resume_grace_count') || 0;
  // Grace após resume: aceita até 20m (era 30m) — GPS precisa de warm-up mas 30m era excessivo
  const accuracyLimit = graceCount > 0 ? 20 : MAX_ACCURACY_METERS;

  if (!loc.coords.accuracy || loc.coords.accuracy > accuracyLimit) {
    console.log(`[Tracking Task] Ponto ignorado. Precisão ruim: ${loc.coords.accuracy?.toFixed(1)}m (máx: ${accuracyLimit}m)`);
    return;
  }

  // Decrementar grace counter se aplicável
  if (graceCount > 0) {
    trackingStorage.set('resume_grace_count', graceCount - 1);
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

    // ── RESUME PÓS-PAUSA: novo segmento ──────────────────────────────────
    // Quando o usuário pausa e se desloca, o primeiro ponto pós-resume pode
    // estar a centenas de metros do último ponto salvo. Sem este tratamento,
    // o filtro anti-teleporte (FILTRO 5) rejeitaria este e TODOS os pontos
    // seguintes permanentemente ("teleport filter deadlock").
    //
    // Solução: aceitar o ponto como nova referência SEM somar distância.
    const wasPaused = trackingStorage.getBoolean('tracking_paused');
    if (wasPaused && routePointsList.length > 0) {
      trackingStorage.set('tracking_paused', false);
      trackingStorage.set('resume_grace_count', 3);

      routePointsList.push(newPoint);
      trackingStorage.set('route_points', JSON.stringify(routePointsList));
      trackingStorage.set('last_update_ts', Date.now());
      console.log(`[Tracking Task] ✓ Novo segmento pós-pausa. Ponto aceito como referência (sem distância). Precisão: ${newPoint.accuracy?.toFixed(1)}m`);
      return;
    }

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
