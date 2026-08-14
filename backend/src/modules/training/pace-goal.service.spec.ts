import { PaceCalculatorService } from '../../common/pace-calculator';
import { PaceGoalService } from './pace-goal.service';

describe('PaceGoalService', () => {
  const calculator = new PaceCalculatorService();
  const service = new PaceGoalService(calculator);
  const distanceMeters = 5000;
  const currentVDOT = 40;
  const targetWeeks = 12;

  const assessGap = (gap: number) =>
    service.assess({
      distanceMeters,
      currentVDOT,
      targetWeeks,
      targetTimeSeconds: calculator.estimateRaceTimeFromVDOT(
        distanceMeters,
        currentVDOT + gap,
      ),
    });

  it.each([
    [1, 'feasible'],
    [2, 'aggressive'],
    [3, 'unrealistic'],
  ] as const)('classifica ganho de +%i VDOT como %s', (gap, verdict) => {
    expect(assessGap(gap).verdict).toBe(verdict);
  });

  it('oferece alternativa alcançável apenas quando a meta é inviável', () => {
    const result = assessGap(3);
    expect(result.alternativeTimeSeconds).toBeGreaterThan(0);
    expect(result.alternativePaceSeconds).toBeGreaterThan(0);
    expect(
      calculator.estimateVDOTFromRace(
        distanceMeters,
        result.alternativeTimeSeconds!,
      ),
    ).toBeCloseTo(currentVDOT + 1, 0);
    expect(assessGap(2).alternativeTimeSeconds).toBeNull();
  });

  it('aceita MM:SS e HH:MM:SS sem ambiguidades', () => {
    expect(service.parseTargetTime('24:30')).toBe(1470);
    expect(service.parseTargetTime('1:45:30')).toBe(6330);
    expect(service.parseTargetTime('1:75')).toBe(0);
  });
});
