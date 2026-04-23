/**
 * Cálculo de splits por km e dados para o gráfico de pace a partir
 * dos pontos GPS brutos gravados durante o tracking.
 *
 * Os pontos chegam no formato:
 *   { latitude, longitude, altitude?, timestamp (ms), speed?, accuracy? }
 *
 * Splits: agrupados a cada 1 km (último split pode ser fracionário).
 * Pace chart: agrupado a cada 200 m com média móvel de 5 amostras.
 */

export interface RoutePoint {
    latitude: number;
    longitude: number;
    altitude: number | null;
    timestamp: number;
    speed: number | null;
    accuracy: number | null;
}

export interface SplitData {
    /** Número do km (1, 2, 3, ...). Para split final fracionário, mantém o número do km começado */
    kmNumber: number;
    /** Distância real desse split em metros (1000 para splits completos, < 1000 para o final) */
    distanceMeters: number;
    /** Tempo desse split em ms */
    durationMs: number;
    /** Pace em segundos por km */
    paceSecondsPerKm: number;
    /** Ganho de elevação no segmento (positivo apenas) */
    elevationGainM: number;
    /** Largura proporcional da barra (0..1), normalizada entre o melhor e o pior pace */
    barWidthRatio: number;
}

export interface PaceChartPoint {
    /** Distância acumulada em km (para eixo X) */
    distanceKm: number;
    /** Pace nesse intervalo em segundos por km */
    paceSecondsPerKm: number;
}

export interface PaceSummary {
    avgPaceSecondsPerKm: number;
    bestPaceSecondsPerKm: number;
    worstPaceSecondsPerKm: number;
    totalElevationGainM: number;
    maxAltitudeM: number;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/** Distância haversine entre dois pontos em metros */
function haversineMeters(a: RoutePoint, b: RoutePoint): number {
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Calcula splits de 1 km a partir dos pontos GPS.
 * O último split pode ser fracionário (< 1km) e tem pace ainda calculado por km.
 */
export function calculateSplits(points: RoutePoint[]): SplitData[] {
    if (points.length < 2) return [];

    const splits: Omit<SplitData, 'barWidthRatio'>[] = [];

    let cumulativeDistance = 0;
    let splitStartDistance = 0;
    let splitStartTimestamp = points[0].timestamp;
    let splitStartAltitude = points[0].altitude;
    let splitElevationGain = 0;
    let prevAltitude = points[0].altitude;
    let kmNumber = 1;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const segmentDistance = haversineMeters(prev, curr);
        cumulativeDistance += segmentDistance;

        if (curr.altitude != null && prevAltitude != null) {
            const delta = curr.altitude - prevAltitude;
            if (delta > 0) splitElevationGain += delta;
        }
        if (curr.altitude != null) prevAltitude = curr.altitude;

        // Quando ultrapassa o próximo marco de 1 km, fecha o split.
        while (cumulativeDistance - splitStartDistance >= 1000) {
            const splitDist = 1000;
            const splitDurationMs = curr.timestamp - splitStartTimestamp;
            const paceSecondsPerKm = splitDurationMs / 1000;

            splits.push({
                kmNumber,
                distanceMeters: splitDist,
                durationMs: splitDurationMs,
                paceSecondsPerKm,
                elevationGainM: Math.round(splitElevationGain),
            });

            splitStartDistance += 1000;
            splitStartTimestamp = curr.timestamp;
            splitStartAltitude = curr.altitude;
            splitElevationGain = 0;
            kmNumber += 1;
        }
    }

    // Split final fracionário (se houver distância restante)
    const lastPoint = points[points.length - 1];
    const remainingDistance = cumulativeDistance - splitStartDistance;
    if (remainingDistance > 50) {
        const remainingMs = lastPoint.timestamp - splitStartTimestamp;
        // Pace por km extrapolado
        const paceSecondsPerKm = remainingMs > 0 && remainingDistance > 0
            ? (remainingMs / remainingDistance) * 1000 / 1000 * 1000 / 1000
            : 0;
        // Recalcula limpo: pace = (tempo em segundos) / (distância em km)
        const paceClean = (remainingMs / 1000) / (remainingDistance / 1000);
        splits.push({
            kmNumber,
            distanceMeters: Math.round(remainingDistance),
            durationMs: remainingMs,
            paceSecondsPerKm: paceClean,
            elevationGainM: Math.round(splitElevationGain),
        });
    }

    if (splits.length === 0) return [];

    // Normaliza barWidthRatio: pace mais rápido = barra cheia (1.0), pace mais lento = barra menor.
    const paces = splits.map((s) => s.paceSecondsPerKm).filter((p) => isFinite(p) && p > 0);
    const minPace = Math.min(...paces);
    const maxPace = Math.max(...paces);
    const range = maxPace - minPace;

    return splits.map((s) => {
        if (range === 0) return { ...s, barWidthRatio: 1 };
        // pace mais rápido (menor) → ratio = 1; pace mais lento (maior) → ratio mínimo (~0.3)
        const normalized = (maxPace - s.paceSecondsPerKm) / range;
        const ratio = 0.3 + normalized * 0.7;
        return { ...s, barWidthRatio: ratio };
    });
}

/**
 * Gera pontos para o area chart de pace.
 * Agrupa GPS em intervalos de 200 m e aplica média móvel de 5 amostras.
 */
export function calculatePaceChart(points: RoutePoint[], intervalMeters = 200): PaceChartPoint[] {
    if (points.length < 2) return [];

    const raw: PaceChartPoint[] = [];
    let cumulativeDistance = 0;
    let segmentStartDistance = 0;
    let segmentStartTimestamp = points[0].timestamp;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        cumulativeDistance += haversineMeters(prev, curr);

        if (cumulativeDistance - segmentStartDistance >= intervalMeters) {
            const segDist = cumulativeDistance - segmentStartDistance;
            const segDurMs = curr.timestamp - segmentStartTimestamp;
            const paceSecondsPerKm = segDurMs > 0 && segDist > 0
                ? (segDurMs / 1000) / (segDist / 1000)
                : 0;

            if (isFinite(paceSecondsPerKm) && paceSecondsPerKm > 0) {
                raw.push({
                    distanceKm: cumulativeDistance / 1000,
                    paceSecondsPerKm,
                });
            }

            segmentStartDistance = cumulativeDistance;
            segmentStartTimestamp = curr.timestamp;
        }
    }

    // Adiciona o último ponto se houver resto significativo
    const lastPoint = points[points.length - 1];
    const remaining = cumulativeDistance - segmentStartDistance;
    if (remaining > intervalMeters / 2) {
        const segDurMs = lastPoint.timestamp - segmentStartTimestamp;
        const paceSecondsPerKm = segDurMs > 0 && remaining > 0
            ? (segDurMs / 1000) / (remaining / 1000)
            : 0;
        if (isFinite(paceSecondsPerKm) && paceSecondsPerKm > 0) {
            raw.push({
                distanceKm: cumulativeDistance / 1000,
                paceSecondsPerKm,
            });
        }
    }

    // Média móvel de 5 amostras pra suavizar
    const window = 5;
    const smoothed: PaceChartPoint[] = raw.map((point, idx) => {
        const start = Math.max(0, idx - Math.floor(window / 2));
        const end = Math.min(raw.length, idx + Math.ceil(window / 2));
        const slice = raw.slice(start, end);
        const avg = slice.reduce((sum, p) => sum + p.paceSecondsPerKm, 0) / slice.length;
        return { distanceKm: point.distanceKm, paceSecondsPerKm: avg };
    });

    return smoothed;
}

/**
 * Resumo de pace + elevação para a seção "Resumo de pace".
 */
export function calculatePaceSummary(
    points: RoutePoint[],
    totalDistanceMeters: number,
    totalDurationMs: number,
): PaceSummary {
    const chart = calculatePaceChart(points);

    let avgPace = 0;
    if (totalDistanceMeters > 50 && totalDurationMs > 0) {
        avgPace = (totalDurationMs / 1000) / (totalDistanceMeters / 1000);
    }

    const paces = chart.map((p) => p.paceSecondsPerKm).filter((p) => isFinite(p) && p > 0);
    const bestPace = paces.length > 0 ? Math.min(...paces) : avgPace;
    const worstPace = paces.length > 0 ? Math.max(...paces) : avgPace;

    let elevationGain = 0;
    let maxAltitude = -Infinity;
    let prevAltitude: number | null = null;
    for (const p of points) {
        if (p.altitude == null) continue;
        if (prevAltitude != null) {
            const delta = p.altitude - prevAltitude;
            if (delta > 0) elevationGain += delta;
        }
        if (p.altitude > maxAltitude) maxAltitude = p.altitude;
        prevAltitude = p.altitude;
    }

    return {
        avgPaceSecondsPerKm: avgPace,
        bestPaceSecondsPerKm: bestPace,
        worstPaceSecondsPerKm: worstPace,
        totalElevationGainM: Math.round(elevationGain),
        maxAltitudeM: maxAltitude === -Infinity ? 0 : Math.round(maxAltitude),
    };
}

/** Formata pace (segundos por km) como "M:SS" */
export function formatPaceSeconds(secondsPerKm: number): string {
    if (!isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:--';
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Formata duração em ms como "MM:SS" ou "H:MM:SS" */
export function formatDurationMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
