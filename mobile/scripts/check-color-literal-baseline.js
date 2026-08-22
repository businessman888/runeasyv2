const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const BASELINE_PATH = path.join(__dirname, 'design-color-baseline.json');
const SHOULD_UPDATE = process.argv.includes('--update');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const PROTECTED_FILES = new Set([
  'components/map/MapLocationPuck.tsx',
  'components/map/UserLocationIndicator.tsx',
]);

const COLOR_LITERAL_PATTERN =
  /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|(?<=['"`])#[0-9a-fA-F]{3,4}\b|rgba?\([^\r\n)]*\)/g;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function normalizeLiteral(literal) {
  return literal.replace(/\s+/g, '').toLowerCase();
}

function collectSnapshot() {
  const snapshot = {};

  for (const absolutePath of walk(SRC_ROOT)) {
    if (!SOURCE_EXTENSIONS.has(path.extname(absolutePath))) continue;

    const relativePath = path.relative(SRC_ROOT, absolutePath).replaceAll('\\', '/');
    if (relativePath.startsWith('theme/')) continue;
    if (PROTECTED_FILES.has(relativePath)) continue;

    const source = fs.readFileSync(absolutePath, 'utf8');
    const literals = source.match(COLOR_LITERAL_PATTERN) ?? [];
    if (literals.length === 0) continue;

    const counts = {};
    for (const literal of literals) {
      const normalized = normalizeLiteral(literal);
      counts[normalized] = (counts[normalized] ?? 0) + 1;
    }

    snapshot[relativePath] = Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  return Object.fromEntries(
    Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function flatten(snapshot) {
  const entries = new Map();

  for (const [file, colors] of Object.entries(snapshot)) {
    for (const [color, count] of Object.entries(colors)) {
      entries.set(`${file}|${color}`, count);
    }
  }

  return entries;
}

function describeChanges(baseline, current) {
  const baselineEntries = flatten(baseline);
  const currentEntries = flatten(current);
  const keys = new Set([...baselineEntries.keys(), ...currentEntries.keys()]);
  const changes = [];

  for (const key of [...keys].sort()) {
    const before = baselineEntries.get(key) ?? 0;
    const after = currentEntries.get(key) ?? 0;
    if (before === after) continue;

    const separator = key.lastIndexOf('|');
    const file = key.slice(0, separator);
    const color = key.slice(separator + 1);
    changes.push(`${file}: ${color} ${before} -> ${after}`);
  }

  return changes;
}

const currentSnapshot = collectSnapshot();

if (SHOULD_UPDATE) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(currentSnapshot, null, 2)}\n`);
  console.log(`Updated color-literal baseline: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('Color-literal baseline is missing. Run npm run design:update-baseline.');
  process.exit(1);
}

const baselineSnapshot = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const changes = describeChanges(baselineSnapshot, currentSnapshot);

if (changes.length > 0) {
  console.error('Color-literal baseline changed.');
  console.error('Migrate colors to theme/domain tokens, or intentionally refresh the baseline.');
  changes.forEach((change) => console.error(`- ${change}`));
  process.exit(1);
}

console.log('Color-literal baseline passed: no unreviewed hardcode changes.');

