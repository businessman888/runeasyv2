/**
 * Templates de fala do coach (PT-BR), programáticos (não IA — latência, offline,
 * previsibilidade). Rotação sem repetir a última frase.
 *
 * REGRA DE OURO: o texto de EXIBIÇÃO ("Km 3 · 5:30") NÃO é o texto FALADO. O motor
 * TTS lê "5:30" como "cinco dois pontos trinta" e "km" como "ka-eme". Por isso o
 * spokenText troca o ":" por " e " e usa "quilômetro" por extenso. Ajustar após
 * testar a pronúncia real no device (a skill avisa que varia por motor/idioma).
 */

import type { CoachMessage } from './coachConfig';
import { COACH_PRIORITY, COACH_BUDGET } from './coachConfig';

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
  // Sem padding no falado: "5 e 5" → "cinco e cinco"; "5 e 30" → "cinco e trinta".
  // segundos 0 → "5 minutos" (evita "cinco e zero").
  return s === 0 ? `${m} minutos` : `${m} e ${s}`;
}

// Rotação de frases de split. {K}=km, {P}=pace falado.
const SPLIT_TEMPLATES: string[] = [
  'quilômetro {K}, {P}',
  'km {K} concluído em {P}',
  '{K} quilômetros, {P}',
  'parcial do quilômetro {K}: {P}',
];
// Nota: "km {K}" no template 2 — o TTS pode ler "ka-eme". Mantido na rotação para
// medir na prática; se soar mal no device, remover (é só editar este array).

let lastTemplateIdx = -1;

/** Sorteia um template diferente do último usado (evita virar ruído). */
function pickTemplate(): { text: string; idx: number } {
  if (SPLIT_TEMPLATES.length === 1) return { text: SPLIT_TEMPLATES[0], idx: 0 };
  let idx = Math.floor(Math.random() * SPLIT_TEMPLATES.length);
  if (idx === lastTemplateIdx) idx = (idx + 1) % SPLIT_TEMPLATES.length;
  return { text: SPLIT_TEMPLATES[idx], idx };
}

let seq = 0;

/** Monta a mensagem de split (spoken + display) para o km recém-completado. */
export function buildSplitMessage(km: number, paceSecPerKm: number): CoachMessage {
  const { text, idx } = pickTemplate();
  lastTemplateIdx = idx;
  const spokenText = text
    .replace('{K}', String(km))
    .replace('{P}', paceToSpoken(paceSecPerKm));
  const displayText = `Km ${km} · ${paceToDisplay(paceSecPerKm)}`;
  return {
    id: `split-${km}-${Date.now()}-${seq++}`,
    type: 'split',
    priority: COACH_PRIORITY.split,
    ephemeral: true,
    ttlMs: COACH_BUDGET.SPLIT_TTL_MS,
    createdAt: Date.now(),
    spokenText,
    displayText,
    meta: { km, paceSecPerKm },
  };
}
