// Synthetic public-applicability probe for PR #354's repeated API Tracking scan.
// Run each observation in a fresh process with the same Node executable (Node 24).
// Counts use an in-memory loader; time mode installs no hooks. Neither changes
// installed source. Timing excludes imports, fixture/index setup and serialization.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node scoped-applicability-tracking.mjs KIT_ROOT [counts|time] [DECISIONS] [API_ROWS] [FRESH_RESULT_FILE]

Defaults: counts, 120 unselected Decisions, 600 confirmed/active API Candidates.
KIT_ROOT is a frontend-workflow-kit directory with installed dependencies.
Use a fresh Node 24 process per observation. For example, time 1000 2000.
Counts observe actual localApiTrackingCells cache builds and API row visits only
for the unselected document. Time mode measures only the public resolver call.
FRESH_RESULT_FILE receives the complete JSON, without normalization, using wx.
Stdout reports its exact byte count and SHA-256; no result fields are removed.
This synthetic microbenchmark does not measure end-to-end consumer CLI latency.
`;
const [kitArgument, mode = 'counts', decisionArgument = '120', apiArgument = '600', resultArgument, ...extra] = process.argv.slice(2);
if (['--help', '-h'].includes(kitArgument)) { console.log(HELP); process.exit(0); }
const decisionCount = Number(decisionArgument), apiCount = Number(apiArgument);
if (!kitArgument || !['counts', 'time'].includes(mode) || extra.length ||
    ![decisionCount, apiCount].every((count) => Number.isSafeInteger(count) && count > 0)) {
  console.error(HELP); process.exit(2);
}
const resultFile = resultArgument ? path.resolve(resultArgument) : null;
if (resultFile) assert.equal(fs.existsSync(resultFile), false, 'use a fresh result file');
const kit = fs.realpathSync(path.resolve(kitArgument));
const lib = pathToFileURL(path.join(kit, 'scripts/lib') + path.sep);
const load = (name) => import(new URL(`${name}.mjs`, lib));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const counterKey = 'frontkit.benchmark.applicability.tracking';
const counters = { body: null, builds: 0, rows: 0 };
let hooks, instrumented = 0;
if (mode === 'counts') {
  globalThis[Symbol.for(counterKey)] = counters;
  hooks = registerHooks({ load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== new URL('scoped-work-graph.mjs', lib).href) return loaded;
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    const start = source.indexOf('function localApiTrackingCells(body, view) {');
    const end = source.indexOf('\nfunction dependencies(', start);
    assert(start >= 0 && end > start, 'supported Tracking helper boundaries required');
    let helper = source.slice(start, end);
    const insert = (marker, replacement) => {
      assert.equal(helper.split(marker).length, 2, `one Tracking observation point: ${marker}`);
      helper = helper.replace(marker, replacement);
    };
    // This point is after the cache-hit return in both baseline and fixed code.
    insert('  const cells = new Map();',
      `  const benchmarkTracking = globalThis[Symbol.for(${JSON.stringify(counterKey)})];\n` +
      '  const benchmarkTarget = body === benchmarkTracking.body;\n' +
      '  if (benchmarkTarget) benchmarkTracking.builds += 1;\n  const cells = new Map();');
    insert('  for (const row of table.children.slice(1)) {',
      '  for (const row of table.children.slice(1)) {\n    if (benchmarkTarget) benchmarkTracking.rows += 1;');
    instrumented += 1;
    return { ...loaded, source: source.slice(0, start) + helper + source.slice(end) };
  } });
}

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-applicability-tracking-')));
try {
  const { splitFrontmatter } = await load('util');
  const { buildReconciliationTargetIndex } = await load('reconciliation-target-index');
  const { resolveScopedApplicabilityProjection } = await load('scoped-work-applicability');
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit');
  fs.mkdirSync(docsDir); fs.mkdirSync(kitRoot);
  const put = (name, value) => {
    const file = path.join(kitRoot, name);
    fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' }); return file;
  };
  const owner = 'screen:RESULT-001', sourceRoot = 'src/features/result';
  const policyFile = put('policy.yaml', {});
  const policyOverlayFile = put('adoption.yaml', { work_execution: { version: 1, owners: [owner],
    profiles: ['behavior'], role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } });
  const layoutFile = put('layout.yaml', { roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } });
  const manifestFile = put('manifest.yaml', { version: 1, artifacts: {} });
  const docs = [], sources = [];
  const write = (name, fm, body) => {
    const file = path.join(docsDir, name), text = `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
    fs.writeFileSync(file, text, { flag: 'wx' });
    docs.push({ file, fm: splitFrontmatter(text).data });
    sources.push({ file: `docs/${name}`, bytes: Buffer.byteLength(text), sha256: hash(text) });
  };
  const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
  write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001',
    domain: 'result', status: 'draft', screen_entry: `${sourceRoot}/screens/RESULT-001.tsx`, work_execution: {
      version: 1, private_paths: { hook: [`${sourceRoot}/hooks/local/**`] }, test_paths: [`${sourceRoot}/tests/local/**`],
      units: [{ id: 'known', kind: 'behavior', contracts: ['artifact:RULES#rules'], sources: [] }],
    } }, '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.');
  write('unselected.md', { artifact_id: 'UNSELECTED', artifact_type: 'screen-spec', screen_id: 'OTHER-001',
    domain: 'foreign', status: 'draft', screen_entry: 'src/features/foreign/screens/OTHER-001.tsx' },
  `## API Candidates\n\n${table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'],
    Array.from({ length: apiCount }, (_, index) => ['GET', `/other-${index}`, 'confirmed', 'active', '-', `src/api/other-${index}/**`]))}\n\n` +
  `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
    Array.from({ length: decisionCount }, (_, index) => [`Review ${index + 1}`, 'Unrelated review.', 'A / B', 'api-integrated-ui', 'PM', 'open']))}`);
  const targetIndex = buildReconciliationTargetIndex({ docs });
  counters.body = targetIndex.artifacts.get('UNSELECTED').body;
  const options = { owner, projectRoot: root, docsDir, kitRoot, policyFile, policyOverlayFile, layoutFile, manifestFile, targetIndex };
  const started = performance.now();
  const result = resolveScopedApplicabilityProjection(options);
  const elapsed = performance.now() - started;
  assert.deepEqual(result.projection.known_units, ['known']);
  assert.deepEqual(result.projection.unapplied_relations.records, []);
  assert(result.read_set.some(({ file }) => file === 'docs/unselected.md'), 'the unselected document must be audited');
  if (mode === 'counts') assert.equal(instrumented, 1, 'the actual graph module must be instrumented once');
  const json = JSON.stringify(result);
  if (resultFile) fs.writeFileSync(resultFile, json, { flag: 'wx' });
  console.log(JSON.stringify({ benchmark: 'scoped-applicability-tracking', node: process.version, kit, mode,
    fixture: { decisions: decisionCount, api_rows: apiCount, sources },
    ...(mode === 'counts' ? { tracking: { builds: counters.builds, rows: counters.rows } } : { resolve_ms: elapsed }),
    result: { bytes: Buffer.byteLength(json), sha256: hash(json), ...(resultFile ? { file: resultFile } : {}) },
  }, null, 2));
} finally {
  hooks?.deregister(); delete globalThis[Symbol.for(counterKey)];
  fs.rmSync(root, { recursive: true, force: true });
}
