// Public #359 synthetic acceptance probe. Use actual kit:pack payloads.
// Usage: node scoped-api-fanout.mjs KIT_ROOT REF_COUNT [--snapshot] [--check] [--contexts] [--result FILE]
// --contexts counts allocations in a separate runtime copy; the source/payload
// stays untouched. Compare its result hash with an uninstrumented execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [kitArgument, countArgument, ...extra] = process.argv.slice(2);
const count = Number(countArgument), flags = new Set();
let resultFile;
for (let index = 0; index < extra.length; index += 1) {
  if (extra[index] === '--result' && extra[index + 1]) resultFile = path.resolve(extra[++index]);
  else if (['--snapshot', '--check', '--contexts'].includes(extra[index])) flags.add(extra[index]);
  else throw new Error('Unknown or incomplete argument: ' + extra[index]);
}
if (!kitArgument || !Number.isSafeInteger(count) || count < 1) {
  console.error('Usage: node scoped-api-fanout.mjs KIT_ROOT REF_COUNT [--snapshot] [--check] [--contexts] [--result FILE]');
  process.exit(2);
}
if (resultFile) assert.equal(fs.existsSync(resultFile), false, 'use a fresh result path');
let kit = fs.realpathSync(kitArgument), diagnosticRoot;
const counts = { builds: 0, builtRefs: 0, copies: 0, copiedRefs: 0, merges: 0, mergedRefs: 0 };
const probeKey = Symbol.for('frontkit.synthetic.graph-context-counts');
if (flags.has('--contexts')) {
  diagnosticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-context-probe-'));
  process.once('exit', () => fs.rmSync(diagnosticRoot, { recursive: true, force: true }));
  const copied = path.join(diagnosticRoot, 'kit');
  fs.cpSync(kit, copied, { recursive: true, filter: (file) => path.basename(file) !== 'node_modules' });
  fs.symlinkSync(fs.realpathSync(path.join(kit, 'node_modules')), path.join(copied, 'node_modules'), 'dir');
  kit = copied;
  const file = path.join(kit, 'scripts/lib/scoped-work-graph.mjs');
  let source = fs.readFileSync(file, 'utf8');
  const hook = 'globalThis[Symbol.for("frontkit.synthetic.graph-context-counts")]';
  const replaceOne = (from, to) => {
    assert.equal(source.split(from).length, 2, 'expected one diagnostic insertion point');
    source = source.replace(from, to);
  };
  replaceOne('const context = graphContexts.get(graph);',
    'const context = graphContexts.get(graph);\n  if (context) ' + hook +
    '?.("copies", context.authoredRefs.length + context.trackingRefs.length + context.ordinaryRefs.length);');
  replaceOne('graphContexts.set(graph, { authoredRefs: [...authored], trackingRefs: [...tracking], ordinaryRefs: [...ordinary] });',
    hook + '?.("builds", authored.size + tracking.size + ordinary.size);\n  ' +
    'graphContexts.set(graph, { authoredRefs: [...authored], trackingRefs: [...tracking], ordinaryRefs: [...ordinary] });');
  replaceOne('graphContexts.set(to, Object.fromEntries(Object.entries(merged).map(([name, refs]) => [name, [...refs]])));',
    hook + '?.("merges", Object.values(merged).reduce((sum, refs) => sum + refs.size, 0));\n  ' +
    'graphContexts.set(to, Object.fromEntries(Object.entries(merged).map(([name, refs]) => [name, [...refs]])));');
  fs.writeFileSync(file, source);
  globalThis[probeKey] = (kind, size) => {
    counts[kind] += 1;
    counts[{ builds: 'builtRefs', copies: 'copiedRefs', merges: 'mergedRefs' }[kind]] += size;
  };
}
const lib = pathToFileURL(path.join(kit, 'scripts/lib') + path.sep);
const load = (name) => import(new URL(name + '.mjs', lib));
const { buildReconciliationTargetIndex } = await load('reconciliation-target-index');
const { inspectScopedDecisionScopes, inspectScopedSnapshotDecisionScopes } = await load('scoped-work-decision-scopes');
const inspect = flags.has('--snapshot') ? inspectScopedSnapshotDecisionScopes : inspectScopedDecisionScopes;

function table(headers, rows) {
  return ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|',
    ...rows.map((row) => '| ' + row.join(' | ') + ' |')].join('\n');
}
function fixture(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontkit-r6-check-')));
  try {
    const docsDir = path.join(root, 'docs');
    const kitRoot = path.join(root, '.kit');
    fs.mkdirSync(docsDir);
    fs.mkdirSync(kitRoot);
    const docs = [];
    const put = (name, value) => {
      const file = path.join(kitRoot, name);
      fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' });
      return file;
    };
    const write = (name, fm, body) => {
      const file = path.join(docsDir, name);
      fs.writeFileSync(file, '---\n' + JSON.stringify(fm) + '\n---\n' + body, { flag: 'wx' });
      docs.push({ file, fm });
    };
    return run({ root, docsDir, kitRoot, docs, put, write });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const result = fixture(({ root, docsDir, kitRoot, docs, put, write }) => {
  const owner = 'screen:RESULT-001';
  const sections = Array.from({ length: count }, (_, i) => 'rule-' + i);
  const behavior = 'artifact:SCREEN-RESULT-001#behavior';
  const policyFile = put('policy.yaml', {});
  const policyOverlayFile = put('adoption.yaml', { work_execution: { version: 1, owners: [owner],
    profiles: ['behavior'], role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } });
  const layoutFile = put('layout.yaml', { roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'],
    test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } });
  const manifestFile = put('manifest.yaml', { version: 1, artifacts: {} });
  write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001',
    domain: 'result', status: 'draft', screen_entry: 'src/features/result/screens/RESULT-001.tsx',
    work_execution: { version: 1, private_paths: { hook: ['src/features/result/hooks/local/**'] },
      test_paths: ['src/features/result/tests/local/**'], units: [

        { id: 'api', kind: 'behavior', contracts: [behavior], sources: [],
          api_candidates: [{ method: 'GET', path: '/items' }] },
        { id: 'control', kind: 'behavior', contracts: [behavior], sources: [] },
      ],
    } },
  '## Behavior\n\nSelected behavior.\n\n## API Candidates\n\n' +
    table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Note'],
      [['GET', '/items', 'confirmed', 'active', '-', 'src/api/items/example.ts', sections.map((id) => String.fromCharCode(96) + 'artifact:RULES#' + id + String.fromCharCode(96)).join(' ')]]));
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    sections.map((id) => '## ' + id + '\n\nIndependent rule.').join('\n\n'));
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const originalOpen = fs.openSync;
  let ruleOpens = 0;
  fs.openSync = (file, ...args) => {
    if (String(file).endsWith('/rules.md')) ruleOpens += 1;
    return originalOpen(file, ...args);
  };
  try {
    const result = inspect({ owner, projectRoot: root, docsDir, kitRoot,
      policyFile, policyOverlayFile, layoutFile, manifestFile, targetIndex });
    const semantic = JSON.stringify(result);
    if (resultFile) fs.writeFileSync(resultFile, semantic, { flag: 'wx' });
    return {
      count, mode: flags.has('--snapshot') ? 'snapshot' : 'standalone',
      ruleOpens,
      ...(flags.has('--contexts') ? { contexts: counts } : {}),
      resultBytes: Buffer.byteLength(semantic),
      resultSha256: createHash('sha256').update(semantic).digest('hex'),
      blockingUnits: result.blocking_units,
      checks: result.unit_checks.map(({ unit, decisions_clear }) => ({ unit, decisions_clear })),
      decisionApplications: result.checks.flatMap((check) => check.applications).map(({ unit, decision }) => ({ unit, decision })),
    };
  } finally {
    fs.openSync = originalOpen;
  }
});
delete globalThis[probeKey];
console.log(JSON.stringify(result));
if (flags.has('--check')) {
  assert.deepEqual(result.blockingUnits, []);
  assert.deepEqual(result.checks, [{ unit: 'api', decisions_clear: true }, { unit: 'control', decisions_clear: true }]);
  assert.deepEqual(result.decisionApplications, []);
  assert.ok(result.ruleOpens <= 64, 'independent roots must not trigger per-reference file audits: ' + result.ruleOpens);
  if (result.contexts) {
    assert.ok(counts.builds <= 16, 'independent roots must share a bounded set of graph builds');
    assert.ok(counts.builtRefs <= 32 * (count + 1), 'retained context entries must scale linearly with roots');
    assert.ok(counts.copiedRefs <= 64 * (count + 1), 'copied context entries must scale linearly with roots');
  }
}
