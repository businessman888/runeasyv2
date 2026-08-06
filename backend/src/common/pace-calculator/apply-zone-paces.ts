import { TrainingZone } from './pace-calculator.types';

/**
 * Crava `pace_min`/`pace_max` de TODOS os esforços de um treino a partir da
 * ZONA de cada sub-bloco e das faixas de um VDOT.
 *
 * ── FONTE ÚNICA ──────────────────────────────────────────────────────────────
 *
 * Dois caminhos precisam desta transformação e ela tem de ser a MESMA nos dois,
 * senão um plano gerado e um plano reajustado prescreveriam paces diferentes
 * para o mesmo VDOT:
 *
 *   1. GERAÇÃO      — `TrainingAIService.applyDeterministicPaces`, sobre o plano
 *                     recém-vindo da IA (que não preenche pace: o prompt manda
 *                     explicitamente deixar a cargo do sistema).
 *   2. REESTIMATIVA — `VdotService.applyPacesToFutureWorkouts`, sobre os
 *                     `instructions_json` já persistidos, quando o VDOT muda.
 *
 * Zona ausente cai para Z1 — o mais lento, e portanto o seguro: um segmento sem
 * zona nunca vira um tiro por acidente.
 *
 * Muta o array recebido e devolve quantos sub-blocos foram tocados.
 */
export function applyZonePacesToSegments(
  segments: unknown,
  ranges: Record<TrainingZone, { min: number; max: number }>,
): number {
  if (!Array.isArray(segments)) return 0;
  let touched = 0;

  const setEffort = (effort: unknown, zone: unknown): void => {
    if (!effort || typeof effort !== 'object') return;
    const target = effort as Record<string, unknown>;
    const range = ranges[zone as TrainingZone] ?? ranges.Z1;
    target.pace_min = range.min; // segundos/km — mais rápido
    target.pace_max = range.max; // segundos/km — mais lento
    touched += 1;
  };

  for (const raw of segments) {
    if (!raw || typeof raw !== 'object') continue;
    const seg = raw as Record<string, unknown>;

    if (seg.type === 'repeat') {
      const work = seg.work as Record<string, unknown> | undefined;
      const recovery = seg.recovery as Record<string, unknown> | undefined;
      setEffort(work, work?.zone ?? seg.zone);
      setEffort(recovery, recovery?.zone ?? seg.zone);
      continue;
    }
    setEffort(seg, seg.zone);
  }

  return touched;
}
