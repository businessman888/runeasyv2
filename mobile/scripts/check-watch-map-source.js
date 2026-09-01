const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function expect(condition, message) {
  if (condition) {
    console.log('PASS ' + message);
    return;
  }
  console.error('FAIL ' + message);
  process.exitCode = 1;
}

const presentation = read(
  'targets/runeasy-watch/Models/LiveRoutePresentation.swift',
);
const checkpoint = read(
  'targets/runeasy-watch/Services/ActiveWorkoutCheckpointStore.swift',
);
const workoutManager = read(
  'targets/runeasy-watch/Services/WorkoutManager.swift',
);
const mapView = read(
  'targets/runeasy-watch/Views/LiveRouteMapView.swift',
);
const activeRun = read(
  'targets/runeasy-watch/Views/ActiveRunView.swift',
);
const routeRecorder = read(
  'targets/runeasy-watch/Services/WorkoutRouteRecorder.swift',
);

expect(
  presentation.includes('maximumPointCount: Int = 240')
    && presentation.includes('nonEmpty.suffix(maximumPointCount)')
    && presentation.includes('allocatePointLimits'),
  'apresentacao da rota respeita orçamento máximo de 240 pontos',
);
expect(
  checkpoint.includes('route-segments.json')
    && checkpoint.includes('recordSegmentBoundary(pointIndex:')
    && checkpoint.includes('return [0]'),
  'divisoes de rota persistidas com fallback retrocompativel',
);
expect(
  checkpoint.includes('completeFileProtectionUntilFirstUserAuthentication')
    && checkpoint.includes('try excludeFromBackup(pendingCompletedURL)')
    && checkpoint.includes('isExcludedFromBackup = true'),
  'journal e corrida pendente protegidos e excluidos de backup',
);
expect(
  workoutManager.includes('restoreLiveRoute(from: snapshot.routeSegments)')
    && workoutManager.includes(
      'checkpointStore.recordSegmentBoundary(pointIndex:',
    ),
  'recovery preserva pausas sem criar linhas artificiais',
);
for (const state of [
  'case seeking',
  'case active',
  'case reducedAccuracy',
  'case denied',
  'case unavailable',
  'case paused',
]) {
  expect(presentation.includes(state), 'estado GPS declarado: ' + state);
}
expect(
  mapView.includes('latitudinalMeters: 300')
    && mapView.includes('longitudinalMeters: 300'),
  'camera MVP acompanha o atleta em uma regiao de 300 metros',
);
expect(
  activeRun.includes('TabView(selection: $selectedTrackingPage)')
    && activeRun.includes('isActivePage: selectedTrackingPage == .map')
    && activeRun.includes('scenePhase == .active')
    && mapView.includes('if !isActivePage'),
  'MapKit nao e montado fora da pagina selecionada ou com cena inativa',
);
expect(
  routeRecorder.includes('sealAndDrain(timeoutSeconds: TimeInterval = 5)')
    && routeRecorder.includes('resolveWaiter(id: id, timedOut: true)')
    && workoutManager.includes('saveWorkoutWithDeadline')
    && workoutManager.includes('finishRouteWithDeadline')
    && workoutManager.includes('route.finish.timeout'),
  'drain, salvamento HealthKit e anexo da rota possuem deadlines',
);
expect(
  workoutManager.includes('acceptedLocationAccuracyMeters = 50.0')
    && workoutManager.includes('locationFreshnessSeconds: TimeInterval = 15')
    && workoutManager.includes('refreshLocationFreshness()'),
  'estado GPS usa o mesmo limiar da rota e expira leituras antigas',
);

if (process.exitCode) {
  console.error('\nGate local da fundacao de mapa falhou.');
} else {
  console.log('\nGate local da fundacao de mapa aprovado.');
}
