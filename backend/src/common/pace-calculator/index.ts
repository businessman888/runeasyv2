export { PaceCalculatorService } from './pace-calculator.service';
export { PaceCalculatorModule } from './pace-calculator.module';
export type {
  TrainingPaces,
  FormattedTrainingPaces,
  TrainingZone,
} from './pace-calculator.types';
export { VDOT_REFERENCE_TABLE } from './vdot-table';
export type { VDOTRow } from './vdot-table';
export {
  paceValueToSecondsPerKm,
  formatPaceLabel,
  formatPaceRangeLabel,
} from './pace-format';
