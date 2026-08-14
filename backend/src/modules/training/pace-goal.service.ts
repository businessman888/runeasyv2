import { Injectable } from '@nestjs/common';
import { PaceCalculatorService } from '../../common/pace-calculator';

export const REALISTIC_VDOT_GAIN_PER_12_WEEKS = 1;
export const AGGRESSIVE_VDOT_BUFFER = 1;

export type PaceGoalVerdict = 'feasible' | 'aggressive' | 'unrealistic';

export interface PaceGoalFeasibility {
  verdict: PaceGoalVerdict;
  currentVDOT: number;
  targetVDOT: number;
  vdotGap: number;
  realisticGain: number;
  distanceMeters: number;
  targetTimeSeconds: number;
  targetPaceSeconds: number;
  alternativeTimeSeconds: number | null;
  alternativePaceSeconds: number | null;
}

@Injectable()
export class PaceGoalService {
  constructor(private readonly paceCalculator: PaceCalculatorService) {}

  assess(input: {
    distanceMeters: number;
    targetTimeSeconds: number;
    currentVDOT: number;
    targetWeeks: number;
  }): PaceGoalFeasibility {
    const { distanceMeters, targetTimeSeconds } = input;
    const targetVDOT = this.paceCalculator.estimateVDOTFromRace(
      distanceMeters,
      targetTimeSeconds,
    );
    const currentVDOT = this.clampVDOT(input.currentVDOT);
    const realisticGain = this.round1(
      REALISTIC_VDOT_GAIN_PER_12_WEEKS * (Math.max(1, input.targetWeeks) / 12),
    );
    const vdotGap = this.round1(targetVDOT - currentVDOT);

    let verdict: PaceGoalVerdict = 'feasible';
    if (vdotGap > realisticGain + AGGRESSIVE_VDOT_BUFFER) {
      verdict = 'unrealistic';
    } else if (vdotGap > realisticGain) {
      verdict = 'aggressive';
    }

    const shouldOfferAlternative = verdict === 'unrealistic';
    const alternativeVDOT = this.round1(currentVDOT + realisticGain);
    const alternativeTimeSeconds = shouldOfferAlternative
      ? this.paceCalculator.estimateRaceTimeFromVDOT(
          distanceMeters,
          alternativeVDOT,
        )
      : null;

    return {
      verdict,
      currentVDOT,
      targetVDOT,
      vdotGap,
      realisticGain,
      distanceMeters,
      targetTimeSeconds,
      targetPaceSeconds: Math.round(
        targetTimeSeconds / (distanceMeters / 1000),
      ),
      alternativeTimeSeconds,
      alternativePaceSeconds: alternativeTimeSeconds
        ? Math.round(alternativeTimeSeconds / (distanceMeters / 1000))
        : null,
    };
  }

  buildReachableTarget(input: {
    distanceMeters: number;
    currentVDOT: number;
    targetWeeks: number;
  }): PaceGoalFeasibility {
    const realisticGain = this.round1(
      REALISTIC_VDOT_GAIN_PER_12_WEEKS * (Math.max(1, input.targetWeeks) / 12),
    );
    const targetTimeSeconds = this.paceCalculator.estimateRaceTimeFromVDOT(
      input.distanceMeters,
      this.clampVDOT(input.currentVDOT) + realisticGain,
    );
    return this.assess({ ...input, targetTimeSeconds });
  }

  parseTargetTime(value: string): number {
    const parts = value.trim().split(':').map(Number);
    if (
      (parts.length !== 2 && parts.length !== 3) ||
      parts.some((part) => !Number.isInteger(part) || part < 0)
    ) {
      return 0;
    }
    const [hours, minutes, seconds] =
      parts.length === 3 ? parts : [0, parts[0], parts[1]];
    if (minutes > 59 || seconds > 59) return 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  formatTargetTime(seconds: number): string {
    const safe = Math.max(0, Math.round(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  private clampVDOT(vdot: number): number {
    const { min, max } = this.paceCalculator.bounds;
    return this.round1(Math.min(max, Math.max(min, vdot)));
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
