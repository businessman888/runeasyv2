/**
 * REPLAY DE ESFORÇO — reconstrói, no servidor, o pace REAL de cada sub-etapa de
 * um treino a partir dos pontos GPS gravados.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * O device já sabe em qual repetição o atleta está: `segmentEngine` expande os
 * blocos numa timeline e `livePace` calcula o pace com as paradas descontadas.
 * Mas nada disso é enviado ao backend — o payload de conclusão é só
 * `route_points` + agregados, e o cursor morre no MMKV do aparelho.
 *
 * O que sobrevive é o suficiente: `workout_routes.raw_data` guarda o array de
 * pontos com timestamp, e `workouts.instructions_json` guarda a estrutura
 * prescrita. Com os dois, o pace de cada tiro é reconstruível — que é o único
 * sinal limpo do VDOT real (o pace do treino inteiro inclui aquecimento, trote
 * de recuperação e volta à calma, todos lentos de propósito).
 *
 * Precedente do repo: `ElevationService` já faz replay server-side sobre
 * `activities.gps_route`.
 *
 * ── A DUPLICAÇÃO É DELIBERADA ────────────────────────────────────────────────
 *
 * Este arquivo repete a lógica de `mobile/src/utils/segmentEngine.ts` e
 * `mobile/src/utils/livePace.ts`. Não dá para importar através da fronteira do
 * monorepo sem acoplar os dois builds. A mitigação é `effort-replay.spec.ts`,
 * que roda os DOIS lados sobre as mesmas entradas e exige resultado idêntico —
 * se alguém mexer num e esquecer do outro, o teste quebra.
 */

// ── Constantes (espelham livePace.ts) ────────────────────────────────────────

/**
 * Abaixo desta velocidade implícita o trecho é "parado" (semáforo, amarrar o
 * tênis) e sai do numerador E do denominador. É o que impede o pace de explodir
 * quando a pessoa para no meio de um tiro.
 */
export const MIN_MOVING_SPEED_MPS = 0.6;

/**
 * Cobertura mínima da distância prescrita para o replay valer. Abaixo disto o
 * GPS falhou (túnel, sinal ruim, esteira sem pontos) e o número seria ficção —
 * é melhor descartar o treino do que alimentar o VDOT com lixo.
 */
export const MIN_COVERAGE_RATIO = 0.6;

const EARTH_RADIUS_M = 6371000;
const toRad = (d: number): number => (d * Math.PI) / 180;

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ReplayPoint {
  latitude: number;
  longitude: number;
  /** ms (epoch). */
  timestamp: number;
}

export type EffortKind = 'warmup' | 'main' | 'cooldown' | 'work' | 'recovery';
export type EffortMetric = 'distance' | 'time';

/** Uma sub-etapa da timeline: um `repeat` de N reps vira 2N destas. */
export interface EffortStep {
  index: number;
  blockIndex: number;
  kind: EffortKind;
  metric: EffortMetric;
  /** Alvo: metros (distance) ou milissegundos (time). */
  target: number;
  /** Zona prescrita do sub-bloco (cai para a do bloco quando ausente). */
  zone: string | null;
  /** Faixa-alvo em segundos/km. */
  paceMin: number;
  paceMax: number;
  repIndex?: number;
  repTotal?: number;
}

/** Uma sub-etapa depois de casada com os pontos GPS. */
export interface ReplayedStep extends EffortStep {
  /** Distância percorrida EM MOVIMENTO dentro da sub-etapa, em km. */
  actualKm: number;
  /** Tempo EM MOVIMENTO dentro da sub-etapa, em segundos. */
  actualSeconds: number;
  /** `actualSeconds / actualKm`, ou null quando não deu para medir. */
  actualPaceSecPerKm: number | null;
}

// ── Expansão da timeline ─────────────────────────────────────────────────────

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

const numOr0 = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const zoneOf = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null;

function metricOf(effort: Record<string, unknown>): {
  metric: EffortMetric;
  target: number;
} {
  const km = numOr0(effort.distance_km);
  if (km > 0) return { metric: 'distance', target: km * 1000 };
  return { metric: 'time', target: numOr0(effort.duration_seconds) * 1000 };
}

/**
 * Expande `instructions_json` na timeline sequencial de sub-etapas.
 *
 * Espelha `segmentEngine.buildSegSteps` do mobile — inclusive o
 * `Math.max(1, Math.round(reps || 1))`, porque as duas contagens de repetição
 * precisam descrever a MESMA sessão. O único acréscimo é `zone`, que o motor do
 * mobile não precisa (ele só quer a faixa de pace) e o replay precisa (é o que
 * distingue esforço de qualidade de trote).
 */
export function buildEffortSteps(blocks: unknown): EffortStep[] {
  const list = Array.isArray(blocks) ? blocks : [];
  const steps: EffortStep[] = [];
  let index = 0;

  list.forEach((raw, blockIndex) => {
    const block = asRecord(raw);
    if (!block) return;
    const blockZone = zoneOf(block.zone);

    if (block.type === 'repeat') {
      const reps = Math.max(1, Math.round(numOr0(block.reps) || 1));
      const work = asRecord(block.work);
      const recovery = asRecord(block.recovery);

      for (let r = 1; r <= reps; r++) {
        if (work) {
          const m = metricOf(work);
          steps.push({
            index: index++,
            blockIndex,
            kind: 'work',
            metric: m.metric,
            target: m.target,
            zone: zoneOf(work.zone) ?? blockZone,
            paceMin: numOr0(work.pace_min),
            paceMax: numOr0(work.pace_max),
            repIndex: r,
            repTotal: reps,
          });
        }
        if (recovery) {
          const m = metricOf(recovery);
          steps.push({
            index: index++,
            blockIndex,
            kind: 'recovery',
            metric: m.metric,
            target: m.target,
            zone: zoneOf(recovery.zone) ?? blockZone,
            paceMin: numOr0(recovery.pace_min),
            paceMax: numOr0(recovery.pace_max),
            repIndex: r,
            repTotal: reps,
          });
        }
      }
      return;
    }

    const m = metricOf(block);
    steps.push({
      index: index++,
      blockIndex,
      kind: (block.type as EffortKind) ?? 'main',
      metric: m.metric,
      target: m.target,
      zone: blockZone,
      paceMin: numOr0(block.pace_min),
      paceMax: numOr0(block.pace_max),
    });
  });

  return steps;
}

// ── Replay sobre os pontos ───────────────────────────────────────────────────

export function haversineMeters(a: ReplayPoint, b: ReplayPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Normaliza o `raw_data`/`gps_route` cru em pontos utilizáveis e ordenados. */
export function normalizePoints(raw: unknown): ReplayPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: ReplayPoint[] = [];
  for (const item of raw) {
    const p = asRecord(item);
    if (!p) continue;
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    const ts = Number(p.timestamp);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!Number.isFinite(ts) || ts <= 0) continue;
    points.push({ latitude: lat, longitude: lng, timestamp: ts });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

export interface ReplayCursor {
  idx: number;
  /** Metros acumulados no início da sub-etapa ativa. */
  startDist: number;
  /** Milissegundos desde a largada no início da sub-etapa ativa. */
  startTs: number;
}

/**
 * Avança o cursor sobre as sub-etapas já concluídas.
 *
 * Porte 1:1 de `segmentEngine.advanceCursor` do mobile — mesma assinatura,
 * mesma condição de fechamento, mesmo tratamento de alvo zerado. É ESTA função
 * que o teste de paridade compara ponto a ponto com a do device: enquanto as
 * duas concordarem, backend e aparelho recortam o treino nos mesmos limites.
 */
export function advanceReplayCursor(
  steps: EffortStep[],
  cursor: ReplayCursor,
  currentDist: number,
  currentTs: number,
): ReplayCursor {
  let { idx, startDist, startTs } = cursor;

  while (idx < steps.length) {
    const step = steps[idx];
    const progress =
      step.metric === 'distance'
        ? currentDist - startDist
        : currentTs - startTs;
    if (step.target <= 0 || progress >= step.target) {
      idx += 1;
      startDist = currentDist;
      startTs = currentTs;
      continue;
    }
    break;
  }

  return { idx, startDist, startTs };
}

/**
 * Caminha os pontos GPS avançando o cursor sobre as sub-etapas, e devolve cada
 * uma com a distância e o tempo EM MOVIMENTO que couberam nela.
 *
 * Trechos parados (abaixo de `MIN_MOVING_SPEED_MPS`) continuam avançando o eixo
 * TEMPO — o cronômetro da prova não para — mas ficam fora do pace, exatamente
 * como no `livePace`.
 *
 * ── PRECISÃO ─────────────────────────────────────────────────────────────────
 *
 * O recorte tem a granularidade do GPS: os pontos vêm a cada ~10 m, então uma
 * fronteira de sub-etapa cai no meio de um trecho e ele inteiro é creditado à
 * sub-etapa que estava aberta. Num tiro de 500 m isso é ≤2% de contaminação —
 * ordem de grandeza abaixo da margem que move o VDOT, e por isso aceitável.
 */
export function replaySteps(
  steps: EffortStep[],
  points: ReplayPoint[],
): ReplayedStep[] {
  const out: ReplayedStep[] = steps.map((s) => ({
    ...s,
    actualKm: 0,
    actualSeconds: 0,
    actualPaceSecPerKm: null,
  }));
  if (steps.length === 0 || points.length < 2) return out;

  const t0 = points[0].timestamp;
  let cursor: ReplayCursor = { idx: 0, startDist: 0, startTs: 0 };
  let cumulativeM = 0;

  for (let i = 1; i < points.length && cursor.idx < steps.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dtMs = b.timestamp - a.timestamp;
    if (dtMs <= 0) continue;

    const ddM = haversineMeters(a, b);
    const moving = ddM / (dtMs / 1000) >= MIN_MOVING_SPEED_MPS;

    cumulativeM += ddM;
    const elapsedMs = b.timestamp - t0;

    if (moving) {
      out[cursor.idx].actualKm += ddM / 1000;
      out[cursor.idx].actualSeconds += dtMs / 1000;
    }

    cursor = advanceReplayCursor(steps, cursor, cumulativeM, elapsedMs);
  }

  for (const s of out) {
    s.actualPaceSecPerKm =
      s.actualKm > 0 && s.actualSeconds > 0
        ? Math.round(s.actualSeconds / s.actualKm)
        : null;
  }
  return out;
}
