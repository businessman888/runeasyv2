/**
 * Orquestrador de fala do coach — o "cérebro". Decide SE, QUANDO e O QUÊ falar.
 *
 * Singleton de MÓDULO (não hook), de propósito: é chamado tanto do foreground
 * quanto da `locationTask` (background/headless). Toda decisão lê o contexto do
 * coach do MMKV de forma síncrona.
 *
 * Nesta fase só existe a mensagem de `split`, mas a fila (prioridade + TTL +
 * cooldown + estados de silêncio) já está pronta para os tipos da Fase 4 (pace,
 * structure, motivational) sem reescrita.
 */

import * as Speech from 'expo-speech';
import { createMMKV } from 'react-native-mmkv';
import {
  computeLiveSplits,
  computeSmoothedPaceSeconds,
  type LivePoint,
} from '../../utils/livePace';
import {
  buildSegSteps,
  advanceCursor,
  totalPlannedDistanceM,
  type SegStep,
  type SegCursor,
} from '../../utils/segmentEngine';
import {
  buildSplitMessage,
  buildPaceMessage,
  buildPrepMessage,
  buildGoMessage,
  buildRecoverMessage,
  buildMotivStart,
  buildMotivLastKm,
} from './coachMessages';
import { ensureCoachAudioSession } from './coachAudioSession';
import {
  COACH_BUDGET,
  COACH_MMKV,
  COACH_PACE,
  COACH_TRANSITION,
  COACH_MOTIV,
  type CoachMessage,
} from './coachConfig';

// Mesma storage da locationTask (mesmo id) — instância própria para evitar import
// circular (a locationTask importa este módulo). MMKV com o mesmo id compartilha
// o mesmo armazenamento subjacente.
const storage = createMMKV({ id: 'running-tracking-storage' });

// Estado em memória (por contexto JS). O que precisa sobreviver a um relaunch
// headless vive no MMKV (lastKm, speakCountKm) → idempotência preservada.
let queue: CoachMessage[] = [];
let speaking = false;
let lastSpokeAt = 0;
let currentSpeaking: CoachMessage | null = null; // p/ preempção por prioridade

const num = (k: string, d = 0): number => storage.getNumber(k) ?? d;
const bool = (k: string): boolean => storage.getBoolean(k) ?? false;
const str = (k: string): string => storage.getString(k) ?? '';

/**
 * Ordem de verificação: 1) coach ligado? 2) não pausado/finalizado? 3) tudo da
 * Fase 4 (pace, structure, motivational) exige treino do PLANO E Pro. Só o `split`
 * (Free) passa direto, em qualquer tipo de treino.
 */
function isAllowed(msg: CoachMessage): boolean {
  if (!bool(COACH_MMKV.enabled)) return false;
  if (bool(COACH_MMKV.paused)) return false;
  if (bool(COACH_MMKV.finished)) return false;
  if (msg.type !== 'split') {
    const isPro = bool(COACH_MMKV.isPro);
    const mode = storage.getString(COACH_MMKV.mode);
    if (mode !== 'planned' || !isPro) return false;
  }
  return true;
}

function withinBudget(): boolean {
  if (Date.now() - lastSpokeAt < COACH_BUDGET.MIN_GAP_MS) return false;
  if (num(COACH_MMKV.speakCountKm) >= COACH_BUDGET.MAX_PER_KM) return false;
  return true;
}

function dropExpired(): void {
  const now = Date.now();
  queue = queue.filter((m) => !(m.ephemeral && now - m.createdAt > m.ttlMs));
}

function pickNext(): CoachMessage | undefined {
  dropExpired();
  if (queue.length === 0) return undefined;
  // Maior prioridade primeiro; empate → mais antigo primeiro.
  queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  return queue[0];
}

function publishToUi(msg: CoachMessage): void {
  storage.set(COACH_MMKV.lastMessage, msg.displayText);
  storage.set(COACH_MMKV.unread, true);
  if (msg.type === 'split' && msg.meta) {
    try {
      const arr = JSON.parse(storage.getString(COACH_MMKV.spokenSplits) || '[]');
      arr.push({ km: msg.meta.km, paceSecPerKm: msg.meta.paceSecPerKm, at: Date.now() });
      storage.set(COACH_MMKV.spokenSplits, JSON.stringify(arr));
    } catch {
      /* histórico é best-effort */
    }
  }
}

function processQueue(): void {
  if (speaking) return;
  const msg = pickNext();
  if (!msg) return;
  if (!isAllowed(msg)) {
    queue = queue.filter((m) => m.id !== msg.id);
    return processQueue();
  }
  // Cooldown/orçamento: se ainda não pode falar, deixa na fila; o próximo evento
  // (onProgress / onDone) reprocessa. `structure` (inadiável) bypassa o orçamento.
  if (msg.type !== 'structure' && !withinBudget()) return;

  queue = queue.filter((m) => m.id !== msg.id);
  speaking = true;
  currentSpeaking = msg;
  publishToUi(msg);

  const done = (): void => {
    speaking = false;
    currentSpeaking = null;
    lastSpokeAt = Date.now();
    storage.set(COACH_MMKV.speakCountKm, num(COACH_MMKV.speakCountKm) + 1);
    processQueue();
  };

  // Reassegura a sessão (ducking/background) antes de falar; barato e idempotente.
  ensureCoachAudioSession().finally(() => {
    try {
      Speech.speak(msg.spokenText, {
        language: 'pt-BR',
        onDone: done,
        onStopped: done,
        onError: done,
      });
    } catch (e) {
      console.warn('[coach] Speech.speak falhou:', e);
      done();
    }
  });
}

/** Enfileira uma mensagem (respeitando os estados de silêncio). */
export function enqueue(msg: CoachMessage): void {
  if (!isAllowed(msg)) return; // silêncio: nem enfileira
  queue.push(msg);
  // Preempção: uma transição de intervalado (structure, inadiável) interrompe uma
  // fala de prioridade MENOR em andamento. Speech.stop() → onStopped → done →
  // processQueue escolhe a structure (maior prioridade).
  if (
    msg.type === 'structure' &&
    speaking &&
    currentSpeaking &&
    currentSpeaking.priority < msg.priority
  ) {
    try {
      Speech.stop();
    } catch {
      /* noop */
    }
    return;
  }
  processQueue();
}

/**
 * Chamado pela `locationTask` a cada update de GPS aceito (foreground E background).
 * Detecta km(s) novo(s) via `computeLiveSplits` (mesma fonte que a UI → número
 * consistente) e enfileira o split. Idempotente via `coach_last_km` no MMKV.
 */
export function onProgress(points: LivePoint[]): void {
  if (!bool(COACH_MMKV.enabled)) return; // curto-circuito barato quando desligado
  if (!points || points.length === 0) return;

  // ── Splits (Fase 3, Free/todos os treinos) ────────────────────────────────
  try {
    const completed = computeLiveSplits(points).completed;
    const lastKm = num(COACH_MMKV.lastKm);
    if (completed.length > lastKm) {
      for (let i = lastKm; i < completed.length; i++) {
        storage.set(COACH_MMKV.speakCountKm, 0); // km novo zera o orçamento do km
        enqueue(buildSplitMessage(completed[i].km, completed[i].paceSecPerKm));
      }
      storage.set(COACH_MMKV.lastKm, completed.length);
    }
  } catch {
    /* splits best-effort */
  }

  // ── Fase 4 (só treino do plano + Pro): pace, transições, motivacional ─────
  try {
    runPlanCoach(points);
  } catch (e) {
    console.warn('[coach] runPlanCoach falhou (ignorado):', e);
  }
}

/** Ativo apenas em treino do plano, Pro, coach ligado, não pausado/finalizado. */
function planCoachActive(): boolean {
  return (
    bool(COACH_MMKV.enabled) &&
    !bool(COACH_MMKV.paused) &&
    !bool(COACH_MMKV.finished) &&
    bool(COACH_MMKV.isPro) &&
    str(COACH_MMKV.mode) === 'planned'
  );
}

let cachedSegs: { json: string; steps: SegStep[] } | null = null;
function getSegSteps(): SegStep[] {
  const json = str(COACH_MMKV.segments);
  if (!json) return [];
  if (cachedSegs && cachedSegs.json === json) return cachedSegs.steps;
  try {
    const blocks = JSON.parse(json);
    const steps = buildSegSteps(blocks);
    cachedSegs = { json, steps };
    return steps;
  } catch {
    return [];
  }
}

/**
 * Motor da Fase 4: computa o segmento ativo (segmentEngine + cursor no MMKV) e
 * emite pace/transições/motivacional. Roda em todo update de GPS (foreground e
 * background). Toda mensagem passa pela mesma fila/gate do orquestrador.
 */
function runPlanCoach(points: LivePoint[]): void {
  if (!planCoachActive()) return;
  const steps = getSegSteps();
  if (steps.length === 0) return;

  const currentDist = num('current_distance');
  const currentTs = points[points.length - 1].timestamp;
  const smoothed = computeSmoothedPaceSeconds(points); // segundos/km ou null
  const speedMps = smoothed && smoothed > 0 ? 1000 / smoothed : null;

  // Cursor persistido; inicializa o relógio da 1ª sub-etapa no 1º tick.
  let startTs = num(COACH_MMKV.cursorStartTs, 0);
  if (startTs === 0) startTs = currentTs;
  const cursorIn: SegCursor = {
    idx: num(COACH_MMKV.cursorIdx, 0),
    startDist: num(COACH_MMKV.cursorStartDist, 0),
    startTs,
  };

  const adv = advanceCursor(steps, cursorIn, currentDist, currentTs, speedMps);
  storage.set(COACH_MMKV.cursorIdx, adv.cursor.idx);
  storage.set(COACH_MMKV.cursorStartDist, adv.cursor.startDist);
  storage.set(COACH_MMKV.cursorStartTs, adv.cursor.startTs);

  // ── Motivacional de início (1×) ──
  if (!bool(COACH_MMKV.startedSpoken) && currentDist > COACH_MOTIV.START_MIN_M) {
    storage.set(COACH_MMKV.startedSpoken, true);
    enqueue(buildMotivStart());
  }

  const active = adv.active;

  // ── Transições de intervalado ──
  if (active && active.index !== num(COACH_MMKV.lastTransitionStep, -1)) {
    if (active.kind === 'work') {
      enqueue(buildGoMessage(active.repIndex ?? 1, active.repTotal ?? 1));
    } else if (active.kind === 'recovery') {
      enqueue(buildRecoverMessage());
    }
    // warmup/main/cooldown não anunciam borda (transições são só do intervalado).
    storage.set(COACH_MMKV.lastTransitionStep, active.index);
  }

  // "Prepare-se, tiro em Ns" antes do próximo work (durante recovery/warmup).
  const next = active ? steps[active.index + 1] : undefined;
  if (
    active &&
    next &&
    next.kind === 'work' &&
    num(COACH_MMKV.preparedStep, -1) !== next.index &&
    adv.remainingSec != null &&
    adv.remainingSec > 1 &&
    adv.remainingSec <= COACH_TRANSITION.PREP_LEAD_SEC
  ) {
    storage.set(COACH_MMKV.preparedStep, next.index);
    enqueue(buildPrepMessage(Math.round(adv.remainingSec)));
  }

  // ── Alerta de pace (histerese) ──
  if (smoothed != null && active) {
    const elapsedSegSec = (currentTs - adv.cursor.startTs) / 1000;
    if (elapsedSegSec >= COACH_PACE.GRACE_SEC) {
      const tol =
        COACH_PACE.TOL_SEC +
        (active.kind === 'recovery' ? COACH_PACE.RECOVERY_EXTRA_TOL_SEC : 0);
      const dir: 'slow' | 'fast' | 'in' =
        smoothed > active.paceMax + tol
          ? 'slow'
          : smoothed < active.paceMin - tol
            ? 'fast'
            : 'in';

      if (dir === 'in') {
        storage.set(COACH_MMKV.paceOutSince, 0);
        storage.set(COACH_MMKV.paceDir, 'in');
        // Retorno à faixa: silencioso por padrão (COACH_PACE.ANNOUNCE_RETURN=false).
      } else {
        const prevDir = str(COACH_MMKV.paceDir);
        const outSince = num(COACH_MMKV.paceOutSince, 0);
        if (prevDir !== dir || outSince === 0) {
          storage.set(COACH_MMKV.paceOutSince, currentTs);
          storage.set(COACH_MMKV.paceDir, dir);
        } else {
          const outForSec = (currentTs - outSince) / 1000;
          const cooldownOk =
            (currentTs - num(COACH_MMKV.paceLastAlertAt, 0)) / 1000 >=
            COACH_PACE.COOLDOWN_SEC;
          if (outForSec >= COACH_PACE.TRIGGER_SEC && cooldownOk) {
            enqueue(buildPaceMessage(dir));
            storage.set(COACH_MMKV.paceLastAlertAt, currentTs);
            storage.set(COACH_MMKV.paceOutSince, currentTs); // reinicia janela
          }
        }
      }
    }
  }

  // ── Motivacional de último km (1×) ── total = soma dos sub-blocos por distância.
  const total = totalPlannedDistanceM(steps);
  if (
    total > 0 &&
    !bool(COACH_MMKV.lastKmSpoken) &&
    currentDist >= total - COACH_MOTIV.LAST_KM_M
  ) {
    storage.set(COACH_MMKV.lastKmSpoken, true);
    enqueue(buildMotivLastKm());
  }
}

/** Interrompe a fala atual e limpa a fila (ao pausar). */
export function stopCoach(): void {
  queue = [];
  speaking = false;
  try {
    Speech.stop();
  } catch {
    /* noop */
  }
}

/** Reset de sessão (início/fim da corrida): zera fila + estado de coach no MMKV. */
export function resetCoachRun(): void {
  stopCoach();
  lastSpokeAt = 0;
  currentSpeaking = null;
  cachedSegs = null;
  storage.set(COACH_MMKV.lastKm, 0);
  storage.set(COACH_MMKV.speakCountKm, 0);
  storage.remove(COACH_MMKV.lastMessage);
  storage.set(COACH_MMKV.unread, false);
  storage.set(COACH_MMKV.spokenSplits, '[]');

  // Fase 4: cursor + histerese + flags de idempotência.
  storage.set(COACH_MMKV.cursorIdx, 0);
  storage.set(COACH_MMKV.cursorStartDist, 0);
  storage.set(COACH_MMKV.cursorStartTs, 0);
  storage.set(COACH_MMKV.paceOutSince, 0);
  storage.set(COACH_MMKV.paceDir, 'in');
  storage.set(COACH_MMKV.paceLastAlertAt, 0);
  storage.set(COACH_MMKV.lastTransitionStep, -1);
  storage.set(COACH_MMKV.preparedStep, -1);
  storage.set(COACH_MMKV.startedSpoken, false);
  storage.set(COACH_MMKV.lastKmSpoken, false);
  // segments/totalDist NÃO são zerados aqui — são snapshotados pela RunningScreen
  // no start (senão o reset apagaria o que ela acabou de escrever).
}
