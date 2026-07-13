/**
 * Pace suavizado e splits AO VIVO durante a corrida (Fase 2 do coach de áudio).
 *
 * Funções PURAS sobre a lista de pontos GPS (route_points do MMKV). Ficam separadas
 * do hook de propósito: a Fase 3 vai chamá-las a partir da locationTask (background),
 * então elas não podem depender de React nem de estado de UI.
 *
 * Unidade: tudo em SEGUNDOS/KM inteiros (consistente com o reparo de pace).
 * A exibição converte para "m:ss/km" na camada de UI.
 */

export interface LivePoint {
  latitude: number;
  longitude: number;
  timestamp: number; // ms
  speed?: number | null; // m/s (do GPS; pode faltar)
  altitude?: number | null;
  accuracy?: number | null;
}

// ─── Constantes ajustáveis (calibrar em teste de campo) ──────────────────────
/** Tamanho da janela deslizante, em metros de deslocamento REAL (em movimento). */
export const SMOOTHING_WINDOW_METERS = 250;
/** Teto de tempo (ms) de MOVIMENTO considerado — evita janela stale em ritmo muito lento. */
export const SMOOTHING_MAX_WINDOW_MS = 90_000;
/** Distância mínima de movimento na janela para reportar um valor (senão, congela). */
export const SMOOTHING_MIN_METERS = 40;
/** Abaixo desta velocidade implícita, o segmento é "parado" e sai do cálculo. */
export const MIN_MOVING_SPEED_MPS = 0.6; // ~2.2 km/h

const EARTH_RADIUS_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineMeters(a: LivePoint, b: LivePoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Pace suavizado (segundos/km) sobre a janela deslizante mais recente.
 *
 * Estratégia: janela POR DISTÂNCIA (mais estável fisicamente e padrão em apps de
 * corrida), caminhando do ponto mais novo para trás até acumular
 * SMOOTHING_WINDOW_METERS de movimento OU atingir o teto de tempo. Segmentos com
 * velocidade implícita abaixo de MIN_MOVING_SPEED_MPS (semáforo, parada) são
 * EXCLUÍDOS do numerador e do denominador — é isso que impede o pace de "explodir"
 * quando a pessoa para. Se ainda não há movimento suficiente, retorna null e o
 * chamador mantém o último valor (congela, não zera).
 *
 * @returns segundos/km inteiros, ou null se não há amostra suficiente.
 */
export function computeSmoothedPaceSeconds(
  points: LivePoint[],
  opts?: { windowMeters?: number; maxWindowMs?: number },
): number | null {
  if (!points || points.length < 2) return null;
  const windowMeters = opts?.windowMeters ?? SMOOTHING_WINDOW_METERS;
  const maxWindowMs = opts?.maxWindowMs ?? SMOOTHING_MAX_WINDOW_MS;

  let movingDist = 0; // metros
  let movingTime = 0; // ms

  for (let i = points.length - 1; i >= 1; i--) {
    const b = points[i];
    const a = points[i - 1];
    const dt = b.timestamp - a.timestamp;
    if (dt <= 0) continue;

    const dd = haversineMeters(a, b);
    const speed = dd / (dt / 1000); // m/s implícita do segmento
    if (speed < MIN_MOVING_SPEED_MPS) continue; // segmento-ponte de parada → ignora

    movingDist += dd;
    movingTime += dt;

    if (movingDist >= windowMeters || movingTime >= maxWindowMs) break;
  }

  if (movingDist < SMOOTHING_MIN_METERS || movingTime <= 0) return null;
  return Math.round(movingTime / 1000 / (movingDist / 1000));
}

// ─── Splits por km AO VIVO ────────────────────────────────────────────────────

export interface LiveSplit {
  /** Número do km (1, 2, 3, ...). */
  km: number;
  /** Duração do km em segundos. */
  durationSec: number;
  /** Pace do km em segundos/km (= durationSec, já que é 1 km cheio). */
  paceSecPerKm: number;
}

export interface LiveSplitsResult {
  /** Splits de km JÁ COMPLETADOS (o que a Fase 3 anuncia: "Km 3 em 5:30"). */
  completed: LiveSplit[];
  /** Km em andamento (fracionário). */
  current: {
    km: number;
    distanceM: number;
    elapsedSec: number;
    /** Pace parcial extrapolado do trecho já corrido no km atual (seg/km). */
    paceSecPerKm: number | null;
  };
}

/**
 * Calcula splits de 1km de forma incremental a partir dos pontos GPS. Espelha a
 * lógica pós-corrida de runMetrics.calculateSplits, mas separa km COMPLETOS do km
 * em andamento e devolve tudo em segundos/km. Pontos parados já vêm filtrados da
 * ingestão, então o tempo do split reflete o esforço real.
 */
export function computeLiveSplits(points: LivePoint[]): LiveSplitsResult {
  const empty: LiveSplitsResult = {
    completed: [],
    current: { km: 1, distanceM: 0, elapsedSec: 0, paceSecPerKm: null },
  };
  if (!points || points.length < 2) return empty;

  const completed: LiveSplit[] = [];
  let cumulative = 0; // metros desde o início
  let splitStartDist = 0; // metros no início do km atual
  let splitStartTs = points[0].timestamp;
  let km = 1;

  for (let i = 1; i < points.length; i++) {
    cumulative += haversineMeters(points[i - 1], points[i]);

    // Fecha todos os marcos de 1km ultrapassados neste passo.
    while (cumulative - splitStartDist >= 1000) {
      const durationSec = Math.max(
        0,
        Math.round((points[i].timestamp - splitStartTs) / 1000),
      );
      completed.push({ km, durationSec, paceSecPerKm: durationSec });
      splitStartDist += 1000;
      splitStartTs = points[i].timestamp;
      km += 1;
    }
  }

  const last = points[points.length - 1];
  const distanceM = Math.max(0, cumulative - splitStartDist);
  const elapsedSec = Math.max(0, Math.round((last.timestamp - splitStartTs) / 1000));
  const paceSecPerKm =
    distanceM > 20 && elapsedSec > 0
      ? Math.round(elapsedSec / (distanceM / 1000))
      : null;

  return {
    completed,
    current: { km, distanceM, elapsedSec, paceSecPerKm },
  };
}
