// Public synthetic probes for PR #358's API application/binding basis review.
// Usage: node scoped-api-decision-basis.mjs KIT_ROOT BASELINE_KIT_ROOT [--check] [FRESH_RESULT_FILE]
// Use the actual 8a66aa6 runtime as BASELINE_KIT_ROOT to calculate an old binding,
// then inspect the unchanged fixture with KIT_ROOT. No source hooks or consumer
// files are used. --check asserts the repaired behavior and fails on f6c4fb0.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [kitArgument, baselineArgument, ...rest] = process.argv.slice(2);
const check = rest[0] === '--check';
if (check) rest.shift();
if (!kitArgument || !baselineArgument || rest.length > 1) {
  console.error('Usage: node scoped-api-decision-basis.mjs KIT_ROOT BASELINE_KIT_ROOT [--check] [FRESH_RESULT_FILE]');
  process.exit(2);
}
const resultFile = rest[0] && path.resolve(rest[0]);
if (resultFile) assert.equal(fs.existsSync(resultFile), false, 'use a fresh result file');
async function runtime(directory) {
  const lib = pathToFileURL(path.join(fs.realpathSync(directory), 'scripts/lib') + path.sep);
  const load = (name) => import(new URL(name + '.mjs', lib));
  return { ...(await load('reconciliation-target-index')), ...(await load('scoped-work-basis')),
    ...(await load('scoped-work-decision-scopes')) };
}
const current = await runtime(kitArgument), baseline = await runtime(baselineArgument);
const OWNER = 'screen:RESULT-001', DECISION = 'decision:D-GLOBAL@open-decision-register';
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
  .map((row) => '| ' + row.join(' | ') + ' |').join('\n');
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(direct, run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-api-basis-')));
  try {
    const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
    fs.mkdirSync(docsDir); fs.mkdirSync(kitRoot);
    const put = (name, value) => {
      const file = path.join(kitRoot, name); fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' }); return file;
    };
    const policyFile = put('policy.yaml', {});
    const policyOverlayFile = put('adoption.yaml', { work_execution: { version: 1, owners: [OWNER],
      profiles: ['behavior'], role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } });
    const layoutFile = put('layout.yaml', { roles: {
      screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
      hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'],
      test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
    } });
    const manifestFile = put('manifest.yaml', { version: 1, artifacts: {} });
    const write = (name, fm, body) => {
      const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '---\n' + JSON.stringify(fm) + '\n---\n\n' + body);
      docs.set(name, { file, fm, body });
    };
    const unit = (id, contracts) => ({ id, kind: 'behavior', contracts, sources: [] });
    const behavior = 'artifact:SCREEN-RESULT-001#behavior';
    write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001',
      domain: 'result', status: 'draft', screen_entry: 'src/features/result/screens/RESULT-001.tsx',
      work_execution: { version: 1, private_paths: { hook: ['src/features/result/hooks/local/**'] },
        test_paths: ['src/features/result/tests/local/**'], units: [
          unit('explicit', [DECISION]),
          { ...unit('api', [behavior]), api_candidates: [{ method: 'GET', path: '/items' }] },
          unit('control', [behavior]),
        ] } },
    '## Behavior\n\nSelected behavior.\n\n## API Candidates\n\n' +
      table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Note'], [
        ['GET', '/items', 'confirmed', 'active', '-', 'src/api/items/example.ts',
          'See `' + (direct ? DECISION : 'artifact:RULES#rules') + '`'],
      ]));
    write('rules.md', { artifact_id: 'RULES', artifact_type: 'screen-spec', screen_id: 'OTHER-001',
      domain: 'foreign', status: 'draft', screen_entry: 'src/features/foreign/screens/OTHER-001.tsx' },
    '## Rules\n\nKnown behavior.\n\n## Other\n\nUnselected behavior.');
    write('global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register',
      status: 'draft', decision_work_scopes: { version: 1, bindings: [{ decision_id: 'D-GLOBAL', owner: OWNER,
        known_units: ['api', 'control', 'explicit'], blocks: ['explicit'],
        basis_digest: 'sha256:' + '0'.repeat(64), approval_ref: 'review:synthetic-unverified' }] } },
    '## Open Decisions\n\n' + table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
      [['D-GLOBAL', 'Choose behavior.', 'A / B', 'api-integrated-ui', 'PM', 'open']]));
    const options = (api) => ({ owner: OWNER, projectRoot: root, docsDir, kitRoot, policyFile, policyOverlayFile,
      layoutFile, manifestFile, decisionRef: DECISION,
      targetIndex: api.buildReconciliationTargetIndex({ docs: [...docs.values()].map(({ file, fm }) => ({ file, fm })) }) });
    const record = (digest) => {
      const { fm, body } = docs.get('global/open-decisions.md');
      fm.decision_work_scopes.bindings[0].basis_digest = digest;
      write('global/open-decisions.md', fm, body);
    };
    const addDecisionRef = () => {
      const { fm, body } = docs.get('rules.md');
      write('rules.md', { ...fm, decision_refs: ['D-GLOBAL'] }, body);
    };
    const stages = [];
    const observe = (api) => {
      const opts = options(api), basis = api.resolveScopedBindingBasis(opts);
      const inspection = api.inspectScopedDecisionScopes(opts);
      assert.deepEqual(api.inspectScopedSnapshotDecisionScopes(opts), inspection, 'standalone/snapshot parity');
      const inspected = inspection.checks.find((entry) => entry.decision === DECISION);
      assert(inspected, 'the target Decision must be inspected');
      const units = (applications) => [...new Set(applications.filter((entry) => entry.decision === DECISION)
        .map((entry) => entry.unit))].sort();
      stages.push({ basis, inspection });
      return { applications: units(inspected.applications), basisApplications: units(basis.basis.decision_relations.applications),
        basisDigest: basis.basis_digest, recordedDigest: basis.recorded_binding.basis_digest,
        bindingState: inspected.binding_state, blockingUnits: inspection.blocking_units, unitChecks: inspection.unit_checks };
    };
    const result = run({ options, record, addDecisionRef, observe });
    return { result, stages };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

const metadata = fixture(false, ({ options, record, addDecisionRef, observe }) => {
  record(current.resolveScopedBindingBasis(options(current)).basis_digest);
  const before = observe(current);
  addDecisionRef();
  const after = observe(current);
  record(after.basisDigest);
  return { before, after, renewed: observe(current) };
});
const upgrade = fixture(true, ({ options, record, observe }) => {
  record(baseline.resolveScopedBindingBasis(options(baseline)).basis_digest);
  const before = observe(baseline), after = observe(current);
  record(after.basisDigest);
  return { before, after, renewed: observe(current) };
});
const semantic = { metadata, upgrade };
const json = JSON.stringify(semantic);
if (resultFile) fs.writeFileSync(resultFile, json, { flag: 'wx' });
console.log(JSON.stringify({ node: process.version, metadata: metadata.result, upgrade: upgrade.result,
  resultBytes: Buffer.byteLength(json), resultSha256: hash(json) }, null, 2));
if (check) for (const { before, after, renewed } of [metadata.result, upgrade.result]) {
  assert.equal(before.bindingState, 'current-unverified');
  assert.deepEqual(before.blockingUnits, ['explicit']);
  assert.deepEqual(after.applications, ['api', 'explicit']);
  assert.deepEqual(after.basisApplications, ['api', 'explicit']);
  assert.notEqual(after.basisDigest, before.basisDigest);
  assert.equal(after.bindingState, 'stale-basis');
  assert.deepEqual(after.blockingUnits, ['api', 'explicit']);
  assert.deepEqual(after.unitChecks, [{ unit: 'api', decisions_clear: false },
    { unit: 'control', decisions_clear: true }, { unit: 'explicit', decisions_clear: false }]);
  assert.equal(renewed.bindingState, 'current-unverified');
  assert.deepEqual(renewed.basisApplications, ['api', 'explicit']);
  assert.deepEqual(renewed.blockingUnits, ['explicit']);
}
