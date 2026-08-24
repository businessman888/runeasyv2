const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const SHOULD_WRITE = process.argv.includes('--write');
const SHOULD_CHECK = process.argv.includes('--check');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const PROTECTED_FILES = new Set([
  'components/map/MapLocationPuck.tsx',
  'components/map/UserLocationIndicator.tsx',
]);
const LEGACY_NAMES = new Set(['colors', 'semanticColors', 'mapViz', 'QUIZ']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function isThemeModule(moduleName) {
  return /(?:^|\/)theme(?:\/semanticColors)?$/.test(moduleName);
}

function getLegacyImports(sourceFile) {
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = normalizePath(statement.moduleSpecifier.text);
    const isQuizTokenModule = /(?:^|\/)_tokens$/.test(moduleName);
    if (!isThemeModule(moduleName) && !isQuizTokenModule) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (LEGACY_NAMES.has(importedName)) names.add(element.name.text);
    }
  }

  return names;
}

function containsIdentifier(node, names) {
  let found = false;

  function visit(current) {
    if (found) return;
    if (ts.isIdentifier(current) && names.has(current.text)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }

  visit(node);
  return found;
}

function unwrapFunction(initializer) {
  let current = initializer;

  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return current;
    if (ts.isCallExpression(current) && current.arguments.length > 0) {
      current = current.arguments[0];
      continue;
    }
    break;
  }

  return null;
}

function isPascalCase(name) {
  return /^[A-Z]/.test(name);
}

function collectComponentBodies(sourceFile) {
  const bodies = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const isDefault = statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if ((isDefault || (statement.name && isPascalCase(statement.name.text))) && statement.body) {
        bodies.push(statement.body);
      }
      continue;
    }

    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !isPascalCase(declaration.name.text)) continue;
      const component = unwrapFunction(declaration.initializer);
      if (component && ts.isBlock(component.body)) bodies.push(component.body);
    }
  }

  return bodies;
}

function themeImportPath(absolutePath) {
  const directory = path.dirname(absolutePath);
  let relative = normalizePath(path.relative(directory, path.join(SRC_ROOT, 'theme')));
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function addHelperImport(sourceFile, source, edits, absolutePath, helperNames) {
  let targetImport = null;
  const existingNames = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (!/(?:^|\/)theme$/.test(moduleName)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    targetImport = statement;

    for (const element of bindings.elements) existingNames.add(element.name.text);
    break;
  }

  const missing = helperNames.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return;

  if (targetImport) {
    const bindings = targetImport.importClause.namedBindings;
    const closeBrace = bindings.getEnd() - 1;
    const prefix = bindings.elements.length > 0 ? ', ' : '';
    edits.push({ start: closeBrace, end: closeBrace, text: `${prefix}${missing.join(', ')}` });
    return;
  }

  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const insertionPoint = imports.length > 0 ? imports[imports.length - 1].getEnd() : 0;
  const leadingNewline = insertionPoint > 0 ? '\n' : '';
  edits.push({
    start: insertionPoint,
    end: insertionPoint,
    text: `${leadingNewline}import { ${missing.join(', ')} } from '${themeImportPath(absolutePath)}';`,
  });
}

function transformStyleSheetCalls(sourceFile, source, edits, legacyNames) {
  let count = 0;

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'StyleSheet'
      && node.expression.name.text === 'create'
      && node.arguments.length === 1
    ) {
      const typeArguments = node.typeArguments?.length
        ? `<${node.typeArguments.map((argument) => argument.getText(sourceFile)).join(', ')}>`
        : '';
      const argument = node.arguments[0];
      edits.push({
        start: node.expression.getStart(sourceFile),
        end: argument.getStart(sourceFile),
        text: `createThemeStyles${typeArguments}(() => (`,
      });
      edits.push({ start: argument.getEnd(), end: argument.getEnd(), text: ')' });
      count += 1;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return count;
}



function inlineTopLevelThemeSnapshots(sourceFile, source, edits, legacyNames) {
  const snapshots = new Map();
  const snapshotStatements = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (statement.declarationList.declarations.length !== 1) continue;

    const declaration = statement.declarationList.declarations[0];
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    if (!/^[A-Z][A-Z0-9_]*$/.test(declaration.name.text)) continue;
    if (!containsIdentifier(declaration.initializer, legacyNames)) continue;

    snapshots.set(declaration.name.text, { declaration, statement });
    snapshotStatements.add(statement);
  }

  if (snapshots.size === 0) return 0;

  function belongsToSnapshotStatement(node) {
    let current = node.parent;
    while (current && current !== sourceFile) {
      if (snapshotStatements.has(current)) return true;
      current = current.parent;
    }
    return false;
  }

  function visit(node) {
    if (ts.isIdentifier(node) && snapshots.has(node.text) && !belongsToSnapshotStatement(node)) {
      const { declaration } = snapshots.get(node.text);
      const initializerText = declaration.initializer.getText(sourceFile);
      const needsParentheses = !ts.isPropertyAccessExpression(declaration.initializer);
      edits.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        text: needsParentheses ? `(${initializerText})` : initializerText,
      });
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  for (const { statement } of snapshots.values()) {
    edits.push({ start: statement.getStart(sourceFile), end: statement.getEnd(), text: '' });
  }

  return snapshots.size;
}
function transformNativeThemeProps(source, edits) {
  const helpers = new Set();
  const replacements = [
    { pattern: /tint="dark"/g, text: 'tint={getThemeBlurTint()}', helper: 'getThemeBlurTint' },
    {
      pattern: /barStyle="light-content"/g,
      text: 'barStyle={getThemeStatusBarStyle()}',
      helper: 'getThemeStatusBarStyle',
    },
    {
      pattern: /style="light"/g,
      text: 'style={getThemeExpoStatusBarStyle()}',
      helper: 'getThemeExpoStatusBarStyle',
    },
  ];
  let count = 0;

  for (const replacement of replacements) {
    for (const match of source.matchAll(replacement.pattern)) {
      edits.push({
        start: match.index,
        end: match.index + match[0].length,
        text: replacement.text,
      });
      helpers.add(replacement.helper);
      count += 1;
    }
  }

  return { count, helpers: [...helpers] };
}
function addSubscriptions(sourceFile, source, edits) {
  let count = 0;

  for (const body of collectComponentBodies(sourceFile)) {
    const bodyText = source.slice(body.getStart(sourceFile), body.getEnd());
    if (/\buseThemeSubscription\s*\(/.test(bodyText)) continue;
    if (/\buseAppTheme\s*\(/.test(bodyText)) continue;
    if (/\buseThemedStyles\s*\(/.test(bodyText)) continue;

    const firstStatement = body.statements[0];
    const indentation = firstStatement
      ? ' '.repeat(sourceFile.getLineAndCharacterOfPosition(firstStatement.getStart(sourceFile)).character)
      : '  ';
    edits.push({
      start: body.getStart(sourceFile) + 1,
      end: body.getStart(sourceFile) + 1,
      text: `\n${indentation}useThemeSubscription();`,
    });
    count += 1;
  }

  return count;
}

function applyEdits(source, edits) {
  return [...edits]
    .sort((left, right) => right.start - left.start || right.end - left.end)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      source,
    );
}

const report = [];

for (const absolutePath of walk(SRC_ROOT)) {
  if (!SOURCE_EXTENSIONS.has(path.extname(absolutePath))) continue;

  const relativePath = normalizePath(path.relative(SRC_ROOT, absolutePath));
  if (relativePath.startsWith('theme/')) continue;
  if (PROTECTED_FILES.has(relativePath)) continue;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const scriptKind = absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const legacyNames = getLegacyImports(sourceFile);
  if (legacyNames.size === 0) continue;

  const edits = [];
  const snapshots = absolutePath.endsWith('.tsx')
    ? inlineTopLevelThemeSnapshots(sourceFile, source, edits, legacyNames)
    : 0;
  const styleSheets = transformStyleSheetCalls(sourceFile, source, edits, legacyNames);
  const nativeProps = transformNativeThemeProps(source, edits);
  const subscriptions = absolutePath.endsWith('.tsx')
    ? addSubscriptions(sourceFile, source, edits)
    : 0;

  if (styleSheets === 0 && subscriptions === 0 && nativeProps.count === 0 && snapshots === 0) continue;

  addHelperImport(
    sourceFile,
    source,
    edits,
    absolutePath,
    [
      ...(styleSheets > 0 ? ['createThemeStyles'] : []),
      ...(subscriptions > 0 ? ['useThemeSubscription'] : []),
      ...nativeProps.helpers,
    ],
  );
  const output = applyEdits(source, edits);

  if (SHOULD_WRITE) fs.writeFileSync(absolutePath, output);
  report.push({ file: relativePath, styleSheets, subscriptions, nativeProps: nativeProps.count, snapshots });
}

const totals = report.reduce(
  (result, entry) => ({
    files: result.files + 1,
    styleSheets: result.styleSheets + entry.styleSheets,
    subscriptions: result.subscriptions + entry.subscriptions,
    nativeProps: result.nativeProps + entry.nativeProps,
    snapshots: result.snapshots + entry.snapshots,
  }),
  { files: 0, styleSheets: 0, subscriptions: 0, nativeProps: 0, snapshots: 0 },
);

console.log(JSON.stringify({ mode: SHOULD_WRITE ? 'write' : SHOULD_CHECK ? 'check' : 'dry-run', totals, files: report }, null, 2));

if (SHOULD_CHECK && totals.files > 0) {
  console.error('Theme runtime migration is incomplete. Run: node scripts/migrate-theme-runtime.js --write');
  process.exitCode = 1;
}
