import { Injectable, Logger } from '@nestjs/common';
import { VDOT_REFERENCE_TABLE, VDOTRow } from './vdot-table';
import {
  FormattedTrainingPaces,
  TrainingPaces,
  TrainingZone,
} from './pace-calculator.types';

@Injectable()
export class PaceCalculatorService {
  private readonly logger = new Logger(PaceCalculatorService.name);

  /**
   * Piso alinhado à menor âncora da tabela (27). Era 25 — mas a tabela começava
   * em 30, então 25–30 colapsava tudo na linha 30 e todo iniciante recebia o
   * mesmo pace. Manter piso == menor âncora é o invariante que impede o colapso
   * de voltar: se uma âncora mais baixa for adicionada, baixe isto junto.
   * Abaixo de 27 o modelo entraria em velocidade de caminhada, e esse usuário
   * pertence ao protocolo caminhada/corrida (Fase B), não a um pace prescrito.
   */
  private readonly MIN_VDOT = 27;
  private readonly MAX_VDOT = 85;
  private readonly BEGINNER_VDOT = 30;

  /**
   * Daniels–Gilbert formula. Estimates VDOT from any race result.
   *
   * Returns a conservative BEGINNER_VDOT for invalid inputs instead of NaN
   * so the caller never has to special-case missing pace data.
   */
  estimateVDOTFromRace(distanceMeters: number, timeSeconds: number): number {
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0)
      return this.BEGINNER_VDOT;
    if (!Number.isFinite(timeSeconds) || timeSeconds <= 0)
      return this.BEGINNER_VDOT;

    const timeMinutes = timeSeconds / 60;
    const velocityMPerMin = distanceMeters / timeMinutes;

    const percentVO2 =
      0.8 +
      0.1894393 * Math.exp(-0.012778 * timeMinutes) +
      0.2989558 * Math.exp(-0.1932605 * timeMinutes);

    const vo2 =
      -4.6 +
      0.182258 * velocityMPerMin +
      0.000104 * velocityMPerMin * velocityMPerMin;

    if (percentVO2 <= 0) return this.BEGINNER_VDOT;

    return this.clamp(vo2 / percentVO2);
  }

  estimateVDOTFromPace5K(paceMinPerKm: number | null | undefined): number {
    if (!paceMinPerKm || !Number.isFinite(paceMinPerKm) || paceMinPerKm <= 0) {
      return this.BEGINNER_VDOT;
    }
    const timeSeconds = paceMinPerKm * 60 * 5;
    return this.estimateVDOTFromRace(5000, timeSeconds);
  }

  /**
   * Returns training paces (decimal min/km) for each Daniels zone.
   * Interpolates linearly between the closest VDOT anchors.
   */
  getTrainingPaces(vdot: number): TrainingPaces {
    const row = this.interpolate(this.clamp(vdot));
    return {
      easy: { min: row.e_min, max: row.e_max },
      marathon: { value: row.m },
      threshold: { value: row.t },
      interval: { value: row.i },
      repetition: { value: row.r },
    };
  }

  /**
   * Convenience helper for AI prompts: formats every zone as `m:ss/km`.
   * Easy zone is rendered as a range using an en-dash.
   */
  formatPaces(paces: TrainingPaces): FormattedTrainingPaces {
    return {
      easy: `${this.formatPace(paces.easy.min)}–${this.formatPace(paces.easy.max)}`,
      marathon: this.formatPace(paces.marathon.value),
      threshold: this.formatPace(paces.threshold.value),
      interval: this.formatPace(paces.interval.value),
      repetition: this.formatPace(paces.repetition.value),
    };
  }

  formatPace(minPerKm: number): string {
    if (!Number.isFinite(minPerKm) || minPerKm <= 0) return '—';
    const totalSeconds = Math.round(minPerKm * 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Tolerância (± segundos/km) usada para derivar uma FAIXA das zonas que o VDOT
   * entrega como ponto único (M/T/I/R). A zona Easy já tem faixa nativa. Valores
   * conservadores e ajustáveis — a Fase 4 (alertas) pode refiná-los. Zonas mais
   * intensas usam banda mais estreita (execução exige precisão).
   */
  private readonly ZONE_TOLERANCE_SEC: Record<'Z2' | 'Z3' | 'Z4' | 'Z5', number> =
    {
      Z2: 10, // marathon
      Z3: 8, // threshold
      Z4: 8, // interval
      Z5: 10, // repetition
    };

  /**
   * Faixa-alvo de pace por zona, em SEGUNDOS/KM inteiros (min = mais rápido,
   * max = mais lento). Fonte única de verdade para o pós-processamento que injeta
   * os paces nos segmentos e para o motor de alertas (Fase 4). Easy usa a faixa
   * nativa do VDOT; as zonas de ponto único derivam a faixa via ZONE_TOLERANCE_SEC.
   */
  getZonePaceRangesSeconds(
    vdot: number,
  ): Record<TrainingZone, { min: number; max: number }> {
    const p = this.getTrainingPaces(vdot);
    const toSec = (minPerKm: number) => Math.round(minPerKm * 60);
    const band = (
      valueMinPerKm: number,
      tolSec: number,
    ): { min: number; max: number } => {
      const center = toSec(valueMinPerKm);
      return { min: center - tolSec, max: center + tolSec };
    };
    return {
      Z1: { min: toSec(p.easy.min), max: toSec(p.easy.max) },
      Z2: band(p.marathon.value, this.ZONE_TOLERANCE_SEC.Z2),
      Z3: band(p.threshold.value, this.ZONE_TOLERANCE_SEC.Z3),
      Z4: band(p.interval.value, this.ZONE_TOLERANCE_SEC.Z4),
      Z5: band(p.repetition.value, this.ZONE_TOLERANCE_SEC.Z5),
    };
  }

  vdotForBeginner(): number {
    return this.BEGINNER_VDOT;
  }

  private clamp(vdot: number): number {
    if (!Number.isFinite(vdot) || vdot < this.MIN_VDOT) return this.MIN_VDOT;
    if (vdot > this.MAX_VDOT) return this.MAX_VDOT;
    return Math.round(vdot * 10) / 10;
  }

  private interpolate(vdot: number): VDOTRow {
    const anchors = Object.keys(VDOT_REFERENCE_TABLE)
      .map(Number)
      .sort((a, b) => a - b);

    if (vdot <= anchors[0]) return VDOT_REFERENCE_TABLE[anchors[0]];
    if (vdot >= anchors[anchors.length - 1]) {
      return VDOT_REFERENCE_TABLE[anchors[anchors.length - 1]];
    }

    let lower = anchors[0];
    let upper = anchors[anchors.length - 1];
    for (let k = 0; k < anchors.length - 1; k++) {
      if (vdot >= anchors[k] && vdot <= anchors[k + 1]) {
        lower = anchors[k];
        upper = anchors[k + 1];
        break;
      }
    }

    const lo = VDOT_REFERENCE_TABLE[lower];
    const hi = VDOT_REFERENCE_TABLE[upper];
    const frac = (vdot - lower) / (upper - lower);

    return {
      e_min: lo.e_min + (hi.e_min - lo.e_min) * frac,
      e_max: lo.e_max + (hi.e_max - lo.e_max) * frac,
      m: lo.m + (hi.m - lo.m) * frac,
      t: lo.t + (hi.t - lo.t) * frac,
      i: lo.i + (hi.i - lo.i) * frac,
      r: lo.r + (hi.r - lo.r) * frac,
    };
  }
}
