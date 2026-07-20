/**
 * Templates de fala do coach (PT-BR), programáticos (não IA — latência, offline,
 * previsibilidade). Rotação sem repetir a última frase, por categoria.
 *
 * REGRA DE OURO: o texto de EXIBIÇÃO ("Km 3 · 5:30") NÃO é o texto FALADO. O motor
 * TTS lê "5:30" como "cinco dois pontos trinta" e "km" como "ka-eme". Por isso o
 * spokenText troca o ":" por " e " e usa "quilômetro" por extenso. Ajustar após
 * testar a pronúncia real no device (a skill avisa que varia por motor/idioma).
 *
 * Tom: SECO no meio (pace, transições); CONVERSACIONAL no início/fim (motivacional).
 */

import type { CoachMessage, CoachMessageType } from './coachConfig';
import {
  COACH_PRIORITY,
  COACH_BUDGET,
  COACH_PACE,
  COACH_TRANSITION,
  COACH_MOTIV,
} from './coachConfig';

/** "5:30" — para os olhos. */
export function paceToDisplay(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "cinco e trinta" — para o ouvido. Sem ":" (o TTS o lê como "dois pontos"). */
export function paceToSpoken(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 0 ? `${m} minutos` : `${m} e ${s}`;
}

// ─── Rotação genérica (último índice por categoria) ──────────────────────────
const lastIdxByKey = new Map<string, number>();

function rotate(templates: string[], key: string): string {
  if (templates.length <= 1) return templates[0] ?? '';
  let idx = Math.floor(Math.random() * templates.length);
  if (idx === lastIdxByKey.get(key)) idx = (idx + 1) % templates.length;
  lastIdxByKey.set(key, idx);
  return templates[idx];
}

let seq = 0;
function mk(
  type: CoachMessageType,
  priority: number,
  ttlMs: number,
  spokenText: string,
  displayText: string,
  meta?: Record<string, number | string>,
): CoachMessage {
  return {
    id: `${type}-${Date.now()}-${seq++}`,
    type,
    priority,
    ephemeral: true, // todos os tipos são efêmeros (aviso velho = mentira → descarta)
    ttlMs,
    createdAt: Date.now(),
    spokenText,
    displayText,
    meta,
  };
}

// ─── Split (Fase 3) ──────────────────────────────────────────────────────────
const SPLIT_TEMPLATES = [
  'quilômetro {K}, {P}',
  'km {K} concluído em {P}',
  '{K} quilômetros, {P}',
  'parcial do quilômetro {K}: {P}',
];

export function buildSplitMessage(km: number, paceSecPerKm: number): CoachMessage {
  const spokenText = rotate(SPLIT_TEMPLATES, 'split')
    .replace('{K}', String(km))
    .replace('{P}', paceToSpoken(paceSecPerKm));
  return mk(
    'split',
    COACH_PRIORITY.split,
    COACH_BUDGET.SPLIT_TTL_MS,
    spokenText,
    `Km ${km} · ${paceToDisplay(paceSecPerKm)}`,
    { km, paceSecPerKm },
  );
}

// ─── Alerta de pace (Fase 4) ─────────────────────────────────────────────────
export type PaceDirection = 'slow' | 'fast';

const PACE_SLOW = ['acelere um pouco', 'aperta o passo', 'um pouco mais rápido'];
const PACE_FAST = ['segura o ritmo', 'controla, tá rápido', 'guarda energia'];

export function buildPaceMessage(dir: PaceDirection): CoachMessage {
  const spoken =
    dir === 'slow' ? rotate(PACE_SLOW, 'pace_slow') : rotate(PACE_FAST, 'pace_fast');
  const display = dir === 'slow' ? 'Acelere' : 'Segura o ritmo';
  return mk('pace', COACH_PRIORITY.pace, COACH_PACE.TTL_MS, spoken, display, { dir });
}

// ─── Transições de intervalado (Fase 4, structure/inadiável) ─────────────────
const PREP = [
  'prepara, tiro em {S} segundos',
  'próximo tiro em {S} segundos',
  'atenção, tiro chegando em {S}',
];
const GO = ['vai! tiro {R} de {N}', 'agora, forte — tiro {R} de {N}', 'manda o tiro {R} de {N}'];
const RECOVER = ['recupera, trote leve', 'afrouxa, respira', 'trote de recuperação'];

export function buildPrepMessage(secs: number): CoachMessage {
  const spoken = rotate(PREP, 'prep').replace('{S}', String(secs));
  return mk(
    'structure',
    COACH_PRIORITY.structure,
    COACH_TRANSITION.PREP_TTL_MS,
    spoken,
    `Próximo tiro em ${secs}s`,
  );
}

export function buildGoMessage(repIndex: number, repTotal: number): CoachMessage {
  const spoken = rotate(GO, 'go')
    .replace('{R}', String(repIndex))
    .replace('{N}', String(repTotal));
  return mk(
    'structure',
    COACH_PRIORITY.structure,
    COACH_TRANSITION.BOUNDARY_TTL_MS,
    spoken,
    `Tiro ${repIndex}/${repTotal} — vai!`,
  );
}

export function buildRecoverMessage(): CoachMessage {
  return mk(
    'structure',
    COACH_PRIORITY.structure,
    COACH_TRANSITION.BOUNDARY_TTL_MS,
    rotate(RECOVER, 'recover'),
    'Recuperação',
  );
}

// ─── Motivacional (Fase 4, início/fim, conversacional) ───────────────────────
const MOTIV_START = [
  'bora, primeiro quilômetro é reconhecimento',
  'vamos que vamos, aquece com calma',
  'começa leve, o treino é longo',
];
const MOTIV_LAST_KM = [
  'último quilômetro, finaliza forte',
  'reta final, dá o resto',
  'falta pouco, mantém firme',
];
const MOTIV_FINISH = [
  'treino concluído, mandou bem',
  'acabou, excelente trabalho',
  'fechou o treino, parabéns',
];

export function buildMotivStart(): CoachMessage {
  return mk('motivational', COACH_PRIORITY.motivational, COACH_MOTIV.TTL_MS, rotate(MOTIV_START, 'm_start'), 'Bora!');
}
export function buildMotivLastKm(): CoachMessage {
  return mk('motivational', COACH_PRIORITY.motivational, COACH_MOTIV.TTL_MS, rotate(MOTIV_LAST_KM, 'm_last'), 'Último km');
}
export function buildMotivFinish(): CoachMessage {
  return mk('motivational', COACH_PRIORITY.motivational, COACH_MOTIV.TTL_MS, rotate(MOTIV_FINISH, 'm_finish'), 'Treino concluído');
}
