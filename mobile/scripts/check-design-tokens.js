const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const LEGACY_NEUTRALS = new Set([
  '#0A0A18',
  '#0E0E1F',
  '#0F0F1E',
  '#11111F',
  '#121225',
  '#15152A',
  '#16162A',
  '#18182C',
  '#1A1A2E',
  '#1C1C2E',
  '#1E1E32',
  '#2A2A3E',
]);

// The location puck is deliberately outside visual migrations until the
// product owner explicitly requests a redesign of it.
const PROTECTED_FILES = new Set([
  'components/map/MapLocationPuck.tsx',
  'components/map/UserLocationIndicator.tsx',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

const violations = [];

for (const absolutePath of walk(SRC_ROOT)) {
  if (!SOURCE_EXTENSIONS.has(path.extname(absolutePath))) continue;

  const relativePath = path.relative(SRC_ROOT, absolutePath).replaceAll('\\', '/');
  if (PROTECTED_FILES.has(relativePath)) continue;
  if (relativePath.startsWith('theme/')) continue;

  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const isProtectedOnboardingIconLine =
      relativePath.startsWith('screens/quiz/') &&
      /\b(fill|stroke)=/.test(line);
    if (isProtectedOnboardingIconLine) return;

    for (const color of LEGACY_NEUTRALS) {
      if (line.toUpperCase().includes(color)) {
        violations.push(`${relativePath}:${index + 1} ${color}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Legacy dark-theme literals found. Use semanticColors/theme tokens:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('Design token check passed: no legacy neutral literals found.');
}
