const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const SOURCE_EXTENSIONS = new Set(['.tsx']);
const PROTECTED_FILES = new Set([
  'components/map/MapLocationPuck.tsx',
  'components/map/UserLocationIndicator.tsx',
]);
const STATIC_ART_EXCEPTIONS = new Map([
  ['components/ui/AppPressable.tsx', 'primitivo de movimento sem propriedades de cor'],
  ['components/landing/StoryProgressBars.tsx', 'overlay branco sobre mídia'],
  ['screens/sharing/components/CardBrand.tsx', 'assinatura visual exportável'],
  ['screens/sharing/components/cards/CardBase.tsx', 'canvas exportável de marca'],
  ['screens/retrospective/StoryProgressBar.tsx', 'overlay imersivo sobre mídia'],
  ['screens/weekly-insight/components/CountUp.tsx', 'helper de animação sem cor'],
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function getSemanticImports(sourceFile) {
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const moduleName = normalizePath(statement.moduleSpecifier.text);
    if (!/(?:^|\/)(?:theme(?:\/semanticColors)?|_tokens)$/.test(moduleName)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (['colors', 'semanticColors', 'mapViz', 'QUIZ'].includes(importedName)) {
        names.add(element.name.text);
      }
    }
  }

  return names;
}

const violations = [];
const coverage = {
  screens: 0,
  components: 0,
  semanticConsumers: 0,
  runtimeSubscribers: 0,
  protectedFiles: PROTECTED_FILES.size,
  staticArtExceptions: STATIC_ART_EXCEPTIONS.size,
};

for (const absolutePath of walk(SRC_ROOT)) {
  if (!SOURCE_EXTENSIONS.has(path.extname(absolutePath))) continue;

  const relativePath = normalizePath(path.relative(SRC_ROOT, absolutePath));
  if (!relativePath.startsWith('screens/') && !relativePath.startsWith('components/')) continue;
  if (PROTECTED_FILES.has(relativePath)) continue;

  if (relativePath.startsWith('screens/')) coverage.screens += 1;
  if (relativePath.startsWith('components/')) coverage.components += 1;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const semanticImports = getSemanticImports(sourceFile);
  const consumesTheme = semanticImports.size > 0;
  const subscribes =
    /\b(?:useThemeSubscription|useAppTheme|useThemedStyles)\s*\(/.test(source);

  if (consumesTheme) coverage.semanticConsumers += 1;
  if (subscribes) coverage.runtimeSubscribers += 1;

  if (consumesTheme && !subscribes) {
    violations.push(`${relativePath}: consome tokens dinâmicos sem assinar o ThemeProvider`);
  }

  if (consumesTheme && /\bStyleSheet\.create\s*\(/.test(source)) {
    violations.push(`${relativePath}: StyleSheet estático captura tokens no carregamento do módulo`);
  }

  if (/\btint\s*=\s*["']dark["']/.test(source)) {
    violations.push(`${relativePath}: BlurView possui tint dark fixo`);
  }

  if (/\bbarStyle\s*=\s*["']light-content["']/.test(source)) {
    violations.push(`${relativePath}: StatusBar possui conteúdo claro fixo`);
  }

  if (/\bstyle\s*=\s*["']light["']/.test(source) && /expo-status-bar/.test(source)) {
    violations.push(`${relativePath}: Expo StatusBar possui estilo light fixo`);
  }

  const hasStyles = /\bStyleSheet\.(?:create|absoluteFillObject|absoluteFill)\b/.test(source);
  const hasAnyThemeModule = /from\s+["'][^"']*(?:theme|_tokens)["']/.test(source);
  if (
    hasStyles &&
    !hasAnyThemeModule &&
    !STATIC_ART_EXCEPTIONS.has(relativePath)
  ) {
    violations.push(`${relativePath}: estilos visuais sem vínculo com o design system`);
  }
}

console.log(JSON.stringify({
  coverage,
  exceptions: Object.fromEntries(STATIC_ART_EXCEPTIONS),
  violations,
}, null, 2));

if (violations.length > 0) {
  process.exitCode = 1;
}
