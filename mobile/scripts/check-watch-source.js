const fs = require('fs');
const path = require('path');
const plist = require('plist');

const mobileRoot = path.resolve(__dirname, '..');
const watchRoot = path.join(mobileRoot, 'targets', 'runeasy-watch');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function expect(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

const targetConfig = require(path.join(watchRoot, 'expo-target.config.js'));
const info = plist.parse(read('targets/runeasy-watch/Info.plist'));
const diagnostics = read('targets/runeasy-watch/Services/WatchLaunchDiagnostics.swift');
const inspector = read('scripts/inspect-watch-ipa.js');
const watchApp = read('targets/runeasy-watch/RunEasyWatchApp.swift');
const bridge = read('targets/runeasy-watch/Services/PhoneBridge.swift');
const activeRun = read('targets/runeasy-watch/Views/ActiveRunView.swift');
const watchSync = read('src/hooks/useWatchSync.ts');
const watchContract = read('src/services/watchContextContract.ts');
const schema2Fixture = JSON.parse(read('shared/watch-contract/fixtures/schema2-context.json'));
const schema3Fixture = JSON.parse(read('shared/watch-contract/fixtures/schema3-context.json'));

const marker = diagnostics.match(/runtimeMarker\s*=\s*"([^"]+)"/)?.[1];

expect(targetConfig.deploymentTarget === '10.0', 'deployment target watchOS 10');
expect(targetConfig.frameworks.includes('MapKit'), 'MapKit configurado no target');
expect(targetConfig.frameworks.includes('AVFAudio'), 'AVFAudio configurado no target');
expect(info.UIBackgroundModes?.includes('location'), 'background location declarado');
expect(info.UIBackgroundModes?.includes('audio'), 'background audio declarado');
expect(Boolean(marker) && inspector.includes(marker), 'marker runtime alinhado ao inspetor');
expect(
  watchApp.includes('.backgroundTask(.watchConnectivity)'),
  'wake SwiftUI de WatchConnectivity registrado',
);
expect(
  bridge.includes('static let shared = PhoneBridge()')
    && !read('targets/runeasy-watch/ContentView.swift').includes('PhoneBridge()'),
  'PhoneBridge único em todo o target',
);
expect(
  bridge.includes('supportedSchemaVersions = 2...3'),
  'decoder aceita schemas 2 e 3',
);
expect(
  watchContract.includes('WATCH_CONTEXT_SCHEMA_VERSION = 3')
    && watchContract.includes('watch_map_enabled')
    && watchContract.includes('watch_coach_enabled'),
  'sender publica schema 3 e flags independentes',
);
expect(
  watchContract.includes('coach_policy')
    && watchContract.includes('execution_steps')
    && watchContract.includes('policy_versions'),
  'contratos opcionais de policy e execucao declarados',
);
expect(
  schema2Fixture.schema_version === 2 && schema3Fixture.schema_version === 3,
  'fixtures compartilhadas cobrem schemas 2 e 3',
);
expect(
  activeRun.includes('LiveRouteMapView(')
    && activeRun.includes('featureFlags.liveMapEnabled'),
  'mapa protegido por flag',
);
expect(
  activeRun.includes('CoachCaptionOverlay')
    && activeRun.includes('featureFlags.audioCoachEnabled'),
  'coach protegido por flag',
);
expect(
  watchSync.includes('EXPO_PUBLIC_WATCH_LIVE_MAP_ENABLED')
    && watchSync.includes('EXPO_PUBLIC_WATCH_AUDIO_COACH_ENABLED'),
  'rollout mobile explicitamente opt-in',
);

if (process.exitCode) {
  console.error('\nGate de fonte do Apple Watch falhou.');
} else {
  console.log('\nGate de fonte do Apple Watch aprovado.');
}
