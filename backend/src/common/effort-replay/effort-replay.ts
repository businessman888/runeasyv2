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

/**
 * Caminha os pontos GPS e devolve cada sub-etapa com a distância e o tempo EM
 * MOVIMENTO que couberam nela.
 *
 * ── FRONTEIRA INTERPOLADA (e por que não é o cursor do device) ───────────────
 *
 * `segmentEngine.advanceCursor`, no aparelho, responde "em qual tiro o atleta
 * está AGORA" — e para isso reancora na posição real dele a cada bloco que
 * fecha. É o certo para o coach de áudio, e é impreciso de propósito.
 *
 * Medir exige outra coisa. Atribuindo a amostra inteira ao bloco que estava
 * aberto, a fronteira só pode cair de 10 em 10 m, e o erro COMPÕE quando os
 * eixos se misturam: um tiro por distância fecha ~10 m além do alvo, o trote
 * por TEMPO seguinte roda 90 s a partir dali e termina ainda mais adiante, o
 * tiro seguinte começa mais tarde ainda. Medido num 6×400 m com trote por
 * tempo, os tiros saíam a 285, 295, 308, 328, 349 e 400 s/km — todos corridos
 * a 275. Na última volta a janela do "tiro" estava inteiramente sobre o trote.
 *
 * A correção é dividir a amostra que CRUZA a fronteira, em vez de atribuí-la
 * inteira: cada bloco recebe exatamente a fração de distância e de tempo que
 * lhe cabe. A única aproximação que sobra é velocidade constante DENTRO de uma
 * amostra — a ~10 m de espaçamento, irrelevante.
 *
 * Trechos parados (abaixo de `MIN_MOVING_SPEED_MPS`) continuam avançando o eixo
 * TEMPO — o cronômetro da prova não para — mas ficam fora do pace, como no
 * `livePace`.
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

  let idx = 0;
  // Quanto do alvo da sub-etapa ativa já foi consumido, no eixo dela.
  let progressM = 0;
  let progressMs = 0;

  for (let i = 1; i < points.length && idx < steps.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dtMs = b.timestamp - a.timestamp;
    if (dtMs <= 0) continue;

    const ddM = haversineMeters(a, b);
    const moving = ddM / (dtMs / 1000) >= MIN_MOVING_SPEED_MPS;

    // O que sobra desta amostra para distribuir entre as sub-etapas que ela
    // atravessa. Uma amostra pode fechar mais de uma (alvos muito curtos).
    let restM = ddM;
    let restMs = dtMs;

    while (idx < steps.length && (restM > 0 || restMs > 0)) {
      const step = steps[idx];

      // Alvo não-positivo: sub-etapa degenerada, fecha sem consumir nada.
      if (step.target <= 0) {
        idx += 1;
        progressM = 0;
        progressMs = 0;
        continue;
      }

      const byDistance = step.metric === 'distance';
      const falta = byDistance
        ? step.target - progressM
        : step.target - progressMs;
      const disponivel = byDistance ? restM : restMs;

      if (disponivel < falta) {
        // Não fecha aqui: a amostra inteira pertence a esta sub-etapa.
        if (moving) {
          out[idx].actualKm += restM / 1000;
          out[idx].actualSeconds += restMs / 1000;
        }
        progressM += restM;
        progressMs += restMs;
        break;
      }

      // Fecha DENTRO desta amostra: divide na proporção exata em que a
      // fronteira cai. É isto que impede o erro de acumular de um bloco para
      // o seguinte.
      const frac = disponivel > 0 ? falta / disponivel : 0;
      const fatiaM = restM * frac;
      const fatiaMs = restMs * frac;

      if (moving) {
        out[idx].actualKm += fatiaM / 1000;
        out[idx].actualSeconds += fatiaMs / 1000;
      }

      restM -= fatiaM;
      restMs -= fatiaMs;
      idx += 1;
      progressM = 0;
      progressMs = 0;
    }
  }

  for (const s of out) {
    s.actualPaceSecPerKm =
      s.actualKm > 0 && s.actualSeconds > 0
        ? Math.round(s.actualSeconds / s.actualKm)
        : null;
  }
  return out;
}
