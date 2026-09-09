const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '..');

function readFromMobile(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function readFromRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expect(condition, message) {
  if (condition) {
    console.log('PASS ' + message);
    return;
  }
  console.error('FAIL ' + message);
  process.exitCode = 1;
}

const workoutManager = readFromMobile(
  'targets/runeasy-watch/Services/WorkoutManager.swift',
);
const completedRun = readFromMobile(
  'targets/runeasy-watch/Models/CompletedRun.swift',
);
const appleWatchStore = readFromMobile('src/stores/appleWatchStore.ts');
const trainingStore = readFromMobile('src/stores/trainingStore.ts');
const wellnessStore = readFromMobile('src/stores/wellnessStore.ts');
const overview = readFromMobile('src/components/home/OverviewSection.tsx');
const trainingService = readFromRepo(
  'backend/src/modules/training/training.service.ts',
);
const wellnessService = readFromRepo(
  'backend/src/modules/training/wellness/wellness.service.ts',
);

expect(
  workoutManager.includes('HKQuantityType(.heartRate)'),
  'Watch coleta frequencia cardiaca pelo HKLiveWorkoutBuilder',
);
expect(
  workoutManager.includes('HKQuantityType(.activeEnergyBurned)') &&
    workoutManager.includes('metrics.calories = Int(value.rounded())'),
  'Watch coleta energia ativa em kcal',
);
expect(
  completedRun.includes('case avgHeartRate') &&
    completedRun.includes('case maxHeartRate') &&
    completedRun.includes('case calories'),
  'CompletedRun serializa FC media, FC maxima e calorias',
);
expect(
  appleWatchStore.includes(
    'average_heartrate: run.avg_heart_rate ?? undefined',
  ) &&
    appleWatchStore.includes(
      'max_heartrate: run.max_heart_rate ?? undefined',
    ) &&
    appleWatchStore.includes('calories: run.calories ?? undefined'),
  'companion preserva metricas do Watch no payload mobile',
);
expect(
  trainingStore.includes(
    'payload.average_heartrate != null && { average_heartrate: payload.average_heartrate }',
  ) &&
    trainingStore.includes(
      'payload.max_heartrate     != null && { max_heartrate: payload.max_heartrate }',
    ) &&
    trainingStore.includes(
      'payload.calories          != null && { calories: payload.calories }',
    ),
  'envio inicial e retry preservam FC e calorias',
);
expect(
  trainingService.includes(
    'average_heartrate: payload.average_heartrate ?? null',
  ) &&
    trainingService.includes('max_heartrate: payload.max_heartrate ?? null') &&
    trainingService.includes('calories: payload.calories ?? null'),
  'backend persiste metricas de saude em activities',
);
expect(
  wellnessService.includes(
    ".in('provider', ['apple_health', 'apple_watch'])",
  ) &&
    wellnessService.includes('provider: device.provider'),
  'wellness reconhece Apple Health e companion Apple Watch',
);
expect(
  wellnessStore.includes('forcedRefreshQueued') &&
    trainingStore.includes('wellnessStore.fetchSummary(true)') &&
    overview.includes('useFocusEffect'),
  'Home revalida o resumo depois da entrega do Watch e ao recuperar foco',
);

if (process.exitCode) {
  console.error('\nGate do pipeline de saude do Apple Watch falhou.');
} else {
  console.log('\nGate do pipeline de saude do Apple Watch aprovado.');
}
