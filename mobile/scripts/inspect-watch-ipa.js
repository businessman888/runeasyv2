const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plist = require('plist');
const bplistParser = require('bplist-parser');

const PRESENT = Symbol('present');
const EXPECTED_APP_VERSION = '1.0.9';
const WATCH_RUNTIME_MARKER = 'RUNEASY_WATCH_109_RC1_V7_20260901';
const input = process.argv[2] || process.env.RUNEASY_IPA_PATH;

if (!input) {
  console.error('Uso: npm run inspect:watch-ipa -- /caminho/RunEasy.ipa');
  process.exit(2);
}

let temporaryRoot = null;

function readPlist(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.slice(0, 6).toString('ascii') === 'bplist') {
    return bplistParser.parseBuffer(buffer)[0];
  }
  return plist.parse(buffer.toString('utf8'));
}

function locatePhoneApp(sourcePath) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) throw new Error(`Artefato não encontrado: ${resolved}`);

  if (resolved.endsWith('.ipa')) {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runeasy-ipa-check-'));
    if (process.platform === 'win32') {
      childProcess.execFileSync('tar', ['-xf', resolved, '-C', temporaryRoot], {
        stdio: 'inherit',
      });
    } else {
      childProcess.execFileSync('unzip', ['-q', resolved, '-d', temporaryRoot], {
        stdio: 'inherit',
      });
    }
    return locatePhoneApp(path.join(temporaryRoot, 'Payload'));
  }

  if (resolved.endsWith('.app') && fs.statSync(resolved).isDirectory()) return resolved;

  const payload = fs.existsSync(path.join(resolved, 'Payload'))
    ? path.join(resolved, 'Payload')
    : resolved;
  const appName = fs
    .readdirSync(payload)
    .find((name) => name.endsWith('.app') && fs.statSync(path.join(payload, name)).isDirectory());
  if (!appName) throw new Error(`Nenhum app iOS encontrado em ${payload}`);
  return path.join(payload, appName);
}

function expectValue(object, key, expected, label) {
  const received = object[key];
  const valid =
    expected === PRESENT
      ? received !== undefined && received !== null && received !== ''
      : JSON.stringify(received) === JSON.stringify(expected);
  const detail = valid || expected === PRESENT
    ? JSON.stringify(received)
    : `recebido=${JSON.stringify(received)} esperado=${JSON.stringify(expected)}`;
  console.log(`${valid ? 'PASS' : 'FAIL'} ${label}: ${detail}`);
  return valid ? 0 : 1;
}

function expectCondition(valid, label, detail) {
  console.log(`${valid ? 'PASS' : 'FAIL'} ${label}: ${detail}`);
  return valid ? 0 : 1;
}

function readEmbeddedEntitlements(appPath, info) {
  const executableName = info.CFBundleExecutable;
  if (!executableName) return null;
  const executablePath = path.join(appPath, executableName);
  if (!fs.existsSync(executablePath)) return null;

  // O blob de entitlements assinado é um plist XML dentro da assinatura
  // Mach-O. Lê-lo assim funciona também no Windows, onde `codesign` não existe.
  const binary = fs.readFileSync(executablePath).toString('latin1');
  const candidates = binary.match(/<\?xml[\s\S]*?<\/plist>/g) ?? [];
  for (const candidate of candidates) {
    try {
      const parsed = plist.parse(candidate);
      if (
        parsed
        && parsed['application-identifier']
        && Object.prototype.hasOwnProperty.call(parsed, 'com.apple.developer.healthkit')
      ) {
        return parsed;
      }
    } catch {
      // O executável pode conter outros plists; só interessa o de assinatura.
    }
  }
  return null;
}

function readCodeSignEntitlements(appPath, info) {
  if (process.platform === 'darwin') {
    try {
    const result = childProcess.spawnSync(
      'codesign',
      ['-d', '--entitlements', ':-', appPath],
      { encoding: 'utf8' },
    );
      if (result.error) throw result.error;
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      const start = output.indexOf('<?xml');
      if (start >= 0) return plist.parse(output.slice(start));
    } catch (error) {
      console.warn(`WARN codesign indisponível; usando leitura Mach-O: ${error.message}`);
    }
  }
  return readEmbeddedEntitlements(appPath, info);
}

try {
  const phoneApp = locatePhoneApp(input);
  const watchDirectory = path.join(phoneApp, 'Watch');
  if (!fs.existsSync(watchDirectory)) throw new Error('IPA não contém a pasta Watch/.');

  const watchName = fs.readdirSync(watchDirectory).find((name) => name.endsWith('.app'));
  if (!watchName) throw new Error('IPA não contém um app watchOS embutido.');
  const watchApp = path.join(watchDirectory, watchName);
  const phoneInfo = readPlist(path.join(phoneApp, 'Info.plist'));
  const watchInfo = readPlist(path.join(watchApp, 'Info.plist'));

  console.log(`iPhone: ${phoneApp}`);
  console.log(`Watch:  ${watchApp}`);

  let failures = 0;
  failures += expectValue(phoneInfo, 'CFBundleIdentifier', 'com.oytotec.runeasy', 'bundle iPhone');
  failures += expectValue(
    phoneInfo,
    'CFBundleShortVersionString',
    EXPECTED_APP_VERSION,
    'versão esperada iPhone',
  );
  failures += expectValue(watchInfo, 'CFBundleIdentifier', 'com.oytotec.runeasy.watchkitapp', 'bundle Watch');
  failures += expectValue(watchInfo, 'WKApplication', true, 'WKApplication');
  failures += expectValue(
    watchInfo,
    'WKCompanionAppBundleIdentifier',
    phoneInfo.CFBundleIdentifier,
    'companion bundle',
  );
  failures += expectCondition(
    Array.isArray(watchInfo.WKBackgroundModes)
      && watchInfo.WKBackgroundModes.includes('workout-processing'),
    'workout background mode',
    JSON.stringify(watchInfo.WKBackgroundModes),
  );
  failures += expectCondition(
    Array.isArray(watchInfo.UIBackgroundModes)
      && watchInfo.UIBackgroundModes.includes('location'),
    'location background mode',
    JSON.stringify(watchInfo.UIBackgroundModes),
  );
  failures += expectCondition(
    Array.isArray(watchInfo.UIBackgroundModes)
      && watchInfo.UIBackgroundModes.includes('audio'),
    'audio background mode',
    JSON.stringify(watchInfo.UIBackgroundModes),
  );
  failures += expectValue(watchInfo, 'MinimumOSVersion', '10.0', 'watchOS mínimo');
  failures += expectValue(watchInfo, 'NSHealthShareUsageDescription', PRESENT, 'Health read usage');
  failures += expectValue(watchInfo, 'NSHealthUpdateUsageDescription', PRESENT, 'Health write usage');
  failures += expectValue(watchInfo, 'NSLocationWhenInUseUsageDescription', PRESENT, 'Location usage');
  failures += expectValue(
    watchInfo,
    'CFBundleShortVersionString',
    phoneInfo.CFBundleShortVersionString,
    'versão iPhone/Watch',
  );
  failures += expectValue(
    watchInfo,
    'CFBundleVersion',
    phoneInfo.CFBundleVersion,
    'build iPhone/Watch',
  );

  const watchExecutableName = watchInfo.CFBundleExecutable;
  const watchExecutable = watchExecutableName
    ? path.join(watchApp, watchExecutableName)
    : null;
  const hasRuntimeMarker = Boolean(
    watchExecutable
      && fs.existsSync(watchExecutable)
      && fs.readFileSync(watchExecutable).includes(Buffer.from(WATCH_RUNTIME_MARKER)),
  );
  failures += expectCondition(
    hasRuntimeMarker,
    'runtime de tracking Watch',
    hasRuntimeMarker ? WATCH_RUNTIME_MARKER : 'marker ausente no executável watchOS',
  );

  const entitlements = readCodeSignEntitlements(watchApp, watchInfo);
  if (entitlements) {
    failures += expectValue(
      entitlements,
      'com.apple.developer.healthkit',
      true,
      'HealthKit entitlement assinado',
    );
    failures += expectCondition(
      String(entitlements['application-identifier'] ?? '').endsWith(`.${watchInfo.CFBundleIdentifier}`),
      'application identifier assinado Watch',
      JSON.stringify(entitlements['application-identifier']),
    );
  } else {
    failures += expectCondition(
      false,
      'entitlements assinados Watch',
      'blob de assinatura não encontrado no executável',
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam — não distribua este IPA.`);
    process.exitCode = 1;
  } else {
    console.log('\nIPA aprovado nas verificações estruturais do Apple Watch.');
  }
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryRoot && temporaryRoot.startsWith(os.tmpdir())) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
