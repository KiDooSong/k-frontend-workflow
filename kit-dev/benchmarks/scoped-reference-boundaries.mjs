// Public synthetic reproductions for #355–#357; no consumer files are used.
// Usage: node scoped-reference-boundaries.mjs KIT_ROOT [--check]
// Run in a fresh process against a source or actual packed runtime with its
// installed dependencies. Default mode prints observations on either version;
// --check also asserts the corrected public behavior. The dedicated test suites
// additionally cover current bindings, raw table replacement/addition and audit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [kitArgument, mode, ...extra] = process.argv.slice(2);
if (!kitArgument || (mode && mode !== '--check') || extra.length) {
  console.error('Usage: node scoped-reference-boundaries.mjs KIT_ROOT [--check]');
  process.exit(2);
}
const kit = fs.realpathSync(kitArgument);
const lib = pathToFileURL(path.join(kit, 'scripts/lib') + path.sep);
const load = (name) => import(new URL(name + '.mjs', lib));
const { parseReconciliationReferenceView } = await load('reconciliation-markdown-ast');
const { scopedAuthoredView } = await load('scoped-work-authored');
const { createScopedReferenceResolver } = await load('scoped-work-refs');
const { buildReconciliationTargetIndex } = await load('reconciliation-target-index');
const { scopedGraphSelectionRefs } = await load('scoped-work-graph');
const { resolveScopedApplicabilityProjection } = await load('scoped-work-applicability');
const { inspectScopedDecisionScopes } = await load('scoped-work-decision-scopes');

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
const observe = (read) => {
  try { return { value: read() }; }
  catch (error) { return { error: error.message }; }
};

const applicability = fixture(({ root, docsDir, kitRoot, docs, put, write }) => {
  const owner = 'screen:RESULT-001';
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
      test_paths: ['src/features/result/tests/local/**'], units: [{ id: 'known', kind: 'behavior',
        contracts: ['artifact:RULES#rules'], sources: [] }] } }, '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' }, '## Rules\nKnown contract.');
  write('unselected.md', { artifact_id: 'UNSELECTED', artifact_type: 'screen-spec', screen_id: 'OTHER-001',
    domain: 'foreign', status: 'draft', screen_entry: 'src/features/foreign/screens/OTHER-001.tsx' },
  '## Unknowns\n\n' + table(['ID', 'Question', 'Status'], [['U-001', 'Original?', 'open']]) +
    '\n\n## Open Decisions\n\nIncomplete paragraph without a table.\n');
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const body = targetIndex.artifacts.get('UNSELECTED').body;
  const header = (raw) => scopedAuthoredView(body, raw).byName.get('unknowns')[0].tables[0].headers;
  header(parseReconciliationReferenceView(body))[1] = 'Edited';
  const before = header(null)[1];
  const result = resolveScopedApplicabilityProjection({ owner, projectRoot: root, docsDir, kitRoot,
    policyFile, policyOverlayFile, layoutFile, manifestFile, targetIndex });
  assert.deepEqual(result.projection.known_units, ['known']);
  return { before, after: header(null)[1] };
});

const tracking = fixture(({ root, docs, write }) => {
  const id = 'CACHE-SCREEN', name = 'api-candidates';
  const fm = { artifact_id: id, artifact_type: 'screen-spec', screen_id: 'CACHE-001', domain: 'cache', status: 'draft' };
  write('tracked.md', fm,
    '## API Candidates\n\n' +
      table(['ID', 'Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'],
        [['chosen', 'GET', '/later', 'candidate', 'deferred', 'unknown:U-LATER', 'src/api/later/**', '']]) +
      '\n\n## Unknowns\n\n' + table(['ID', 'Question', 'Status'], [['U-LATER', 'Later API?', 'open']]));
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const body = targetIndex.artifacts.get(id).body;
  const selected = createScopedReferenceResolver({ projectRoot: root, targetIndex, inputArtifacts: [] })
    .contract('artifact:' + id + '#' + name + '/chosen').selection;
  const custom = parseReconciliationReferenceView(body);
  const section = custom.sections.find(({ slug }) => slug === name);
  assert.equal(section.tableNodes.length, 1);
  const read = () => scopedGraphSelectionRefs(body, fm, selected, custom);
  const before = observe(read);
  section.tableNodes.length = 0;
  section.tables.length = 0;
  return { before, remainingRawTables: section.tableNodes.length, after: observe(read) };
});
const apiDecision = fixture(({ root, docsDir, kitRoot, docs, put, write }) => {
  const owner = 'screen:RESULT-001';
  const decision = 'decision:D-SHARED@OTHER-SPEC';
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
        { id: 'explicit', kind: 'behavior', contracts: [decision], sources: [] },
        { id: 'api', kind: 'behavior', contracts: [behavior], sources: [],
          api_candidates: [{ method: 'GET', path: '/items' }] },
        { id: 'control', kind: 'behavior', contracts: [behavior], sources: [] },
      ],
    } },
  '## Behavior\n\nSelected behavior.\n\n## API Candidates\n\n' +
    table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Note'],
      [['GET', '/items', 'confirmed', 'active', '-', 'src/api/items/example.ts', 'See ' + String.fromCharCode(96) + decision + String.fromCharCode(96)]]));
  write('decision.md', { artifact_id: 'OTHER-SPEC', artifact_type: 'screen-spec', screen_id: 'OTHER-001',
    domain: 'foreign', status: 'draft', screen_entry: 'src/features/foreign/screens/OTHER-001.tsx' },
  '## Open Decisions\n\n' + table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
    [['D-SHARED', 'Pick an option', 'A/B', 'api-integrated-ui', 'PM', 'open']]) + '\n');
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const result = inspectScopedDecisionScopes({ owner, projectRoot: root, docsDir, kitRoot,
    policyFile, policyOverlayFile, layoutFile, manifestFile, targetIndex });
  return {
    blockingUnits: result.blocking_units,
    checks: result.unit_checks.map(({ unit, decisions_clear }) => ({ unit, decisions_clear })),
    decisionApplications: result.checks.flatMap((check) => check.applications).map(({ unit, decision }) => ({ unit, decision })),
  };
});
console.log(JSON.stringify({ apiDecision, applicability, tracking }));
if (mode === '--check') {
  assert.deepEqual(apiDecision.blockingUnits, ['api', 'explicit']);
  assert.deepEqual(apiDecision.checks, [
    { unit: 'api', decisions_clear: false },
    { unit: 'control', decisions_clear: true },
    { unit: 'explicit', decisions_clear: false },
  ]);
  assert.deepEqual(apiDecision.decisionApplications, ['api', 'explicit'].map((unit) =>
    ({ unit, decision: 'decision:D-SHARED@OTHER-SPEC' })));
  assert.deepEqual(applicability, { before: 'Edited', after: 'Edited' });
  assert.equal(tracking.remainingRawTables, 0);
  assert.equal(tracking.after.value?.includes('unknown:U-LATER@CACHE-SCREEN') ?? false, false,
    'a removed custom API table must not supply its old Tracking home');
}
