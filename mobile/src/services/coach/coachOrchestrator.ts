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
import { computeLiveSplits, type LivePoint } from '../../utils/livePace';
import { buildSplitMessage } from './coachMessages';
import { ensureCoachAudioSession } from './coachAudioSession';
import { COACH_BUDGET, COACH_MMKV, type CoachMessage } from './coachConfig';

// Mesma storage da locationTask (mesmo id) — instância própria para evitar import
// circular (a locationTask importa este módulo). MMKV com o mesmo id compartilha
// o mesmo armazenamento subjacente.
const storage = createMMKV({ id: 'running-tracking-storage' });

// Estado em memória (por contexto JS). O que precisa sobreviver a um relaunch
// headless vive no MMKV (lastKm, speakCountKm) → idempotência preservada.
let queue: CoachMessage[] = [];
let speaking = false;
let lastSpokeAt = 0;

const num = (k: string, d = 0): number => storage.getNumber(k) ?? d;
const bool = (k: string): boolean => storage.getBoolean(k) ?? false;

/**
 * Ordem de verificação (a mesma para todos os tipos; Fase 4 só acrescenta dados):
 * 1) coach ligado? 2) não pausado/finalizado? 3) se pace/structure: treino do
 * plano E Pro? Split (Free) passa direto.
 */
function isAllowed(msg: CoachMessage): boolean {
  if (!bool(COACH_MMKV.enabled)) return false;
  if (bool(COACH_MMKV.paused)) return false;
  if (bool(COACH_MMKV.finished)) return false;
  if (msg.type === 'pace' || msg.type === 'structure') {
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
  // (onProgress / onDone) reprocessa. Splits ficam minutos apart → raramente bloqueia.
  if (!withinBudget()) return;

  queue = queue.filter((m) => m.id !== msg.id);
  speaking = true;
  publishToUi(msg);

  const done = (): void => {
    speaking = false;
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
  processQueue();
}

/**
 * Chamado pela `locationTask` a cada update de GPS aceito (foreground E background).
 * Detecta km(s) novo(s) via `computeLiveSplits` (mesma fonte que a UI → número
 * consistente) e enfileira o split. Idempotente via `coach_last_km` no MMKV.
 */
export function onProgress(points: LivePoint[]): void {
  if (!bool(COACH_MMKV.enabled)) return; // curto-circuito barato quando desligado
  let completed;
  try {
    completed = computeLiveSplits(points).completed;
  } catch {
    return;
  }
  const lastKm = num(COACH_MMKV.lastKm);
  if (completed.length <= lastKm) return; // nenhum km novo cruzado
  for (let i = lastKm; i < completed.length; i++) {
    storage.set(COACH_MMKV.speakCountKm, 0); // km novo zera o orçamento do km
    enqueue(buildSplitMessage(completed[i].km, completed[i].paceSecPerKm));
  }
  storage.set(COACH_MMKV.lastKm, completed.length);
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
  storage.set(COACH_MMKV.lastKm, 0);
  storage.set(COACH_MMKV.speakCountKm, 0);
  storage.remove(COACH_MMKV.lastMessage);
  storage.set(COACH_MMKV.unread, false);
  storage.set(COACH_MMKV.spokenSplits, '[]');
}
