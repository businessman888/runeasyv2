import { Test, TestingModule } from '@nestjs/testing';
import {
  TrainingAIService,
  TrainingPlanRequest,
  GeneratedPlan,
} from './training-ai.service';
import { AIRouterService } from '../../common/ai';
import { PaceCalculatorService } from '../../common/pace-calculator';

/**
 * Focused on the VDOT resolution introduced to fix the critical bug where the
 * pace measured in onboarding (recent distance + time) never reached plan
 * generation, so every plan was generated at beginner VDOT.
 *
 * Strategy: use the REAL PaceCalculatorService (so VDOT math is genuine) and
 * mock AIRouterService.call to capture the userMessage. The prompt embeds
 * `VDOT ESTIMADO: <n>`, which we parse back to assert the resolution path.
 */
describe('TrainingAIService — VDOT resolution', () => {
  let service: TrainingAIService;
  let callMock: jest.Mock;

  const BEGINNER_VDOT = 30; // PaceCalculatorService.BEGINNER_VDOT

  const baseRequest: TrainingPlanRequest = {
    goal: '10k',
    level: 'intermediate',
    daysPerWeek: 4,
    currentPace5k: null,
    targetWeeks: 12,
    limitations: null,
    preferredDays: [1, 3, 5, 6],
  };

  const emptyPlan: GeneratedPlan = {
    duration_weeks: 12,
    frequency_per_week: 4,
    weeks: [{ week_number: 1, phase: 'base', workouts: [] }],
  };

  beforeEach(async () => {
    callMock = jest.fn().mockResolvedValue({ data: emptyPlan, latencyMs: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingAIService,
        PaceCalculatorService,
        {
          provide: AIRouterService,
          useValue: { isAvailable: true, call: callMock },
        },
      ],
    }).compile();

    service = module.get<TrainingAIService>(TrainingAIService);
  });

  /** Extract the VDOT number the service embedded in the user prompt. */
  function vdotFromPrompt(): number {
    const calls = callMock.mock.calls as Array<[{ userMessage: string }]>;
    const userMessage = calls[0][0].userMessage;
    const match = userMessage.match(/VDOT ESTIMADO:\s*([\d.]+)/);
    if (!match) throw new Error('VDOT ESTIMADO not found in user prompt');
    return Number(match[1]);
  }

  it('uses race-based VDOT when recent distance + measured pace are provided', async () => {
    // 10 km @ 5:00/km → ~50 min 10k, clearly a fit runner (VDOT well above beginner)
    await service.generateTrainingPlan({
      ...baseRequest,
      recentDistanceKm: 10,
      calculatedPace: 5.0,
    });

    expect(vdotFromPrompt()).toBeGreaterThan(BEGINNER_VDOT + 5);
  });

  it('does NOT collapse a 10/15km result into a slow 5k pace', async () => {
    // Same pace (6:00/km) but at 15 km should yield a HIGHER VDOT than if that
    // pace were naively treated as a 5k pace — the whole point of the fix.
    await service.generateTrainingPlan({
      ...baseRequest,
      recentDistanceKm: 15,
      calculatedPace: 6.0,
    });
    const raceBased = vdotFromPrompt();

    const fivekVdot = new PaceCalculatorService().estimateVDOTFromPace5K(6.0);
    expect(raceBased).toBeGreaterThan(fivekVdot);
  });

  it('falls back to pace-based VDOT when only currentPace5k is set (retrospective path)', async () => {
    await service.generateTrainingPlan({
      ...baseRequest,
      currentPace5k: 5.0,
    });

    const expected = new PaceCalculatorService().estimateVDOTFromPace5K(5.0);
    expect(vdotFromPrompt()).toBeCloseTo(expected, 1);
    expect(vdotFromPrompt()).toBeGreaterThan(BEGINNER_VDOT);
  });

  it('falls back to beginner VDOT when no pace signal exists', async () => {
    await service.generateTrainingPlan({ ...baseRequest });

    expect(vdotFromPrompt()).toBeCloseTo(BEGINNER_VDOT, 1);
  });

  it('clamps an unrealistic calculatedPace before estimating', async () => {
    // Pace 0.5 min/km is impossible; guard clamps to 3.0 instead of producing
    // a garbage (max-clamped) VDOT path. Should still generate without throwing.
    await service.generateTrainingPlan({
      ...baseRequest,
      recentDistanceKm: 5,
      calculatedPace: 0.5,
    });

    expect(vdotFromPrompt()).toBeGreaterThan(0);
    expect(callMock).toHaveBeenCalledTimes(1);
  });
});
