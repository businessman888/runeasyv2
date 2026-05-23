export type TrainingZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

export interface TrainingPaces {
  easy: { min: number; max: number }; // min/km, Z1 (range)
  marathon: { value: number }; // min/km, Z2
  threshold: { value: number }; // min/km, Z3
  interval: { value: number }; // min/km, Z4
  repetition: { value: number }; // min/km, Z5
}

export interface FormattedTrainingPaces {
  easy: string; // ex: "6:33–7:14 min/km"
  marathon: string; // ex: "5:54 min/km"
  threshold: string; // ex: "5:31 min/km"
  interval: string; // ex: "5:05 min/km"
  repetition: string; // ex: "4:42 min/km"
}
