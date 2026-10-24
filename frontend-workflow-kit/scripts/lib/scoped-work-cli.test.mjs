import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { splitFrontmatter, DEFAULTS, KIT_ROOT } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { resolveScopedSourceRelations } from './scoped-work-source-relations.mjs';
import { hashBytes } from './current-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const SURFACE = 'surface:RESULT-PANEL', MEMBERS = ['RESULT-001', 'RESULT-002'];
const DOCS = 'docs/frontend-workflow', PREFIX = 'src/features/result', SHARED = `${PREFIX}/components/panel`;
const PANEL = `${SHARED}/Panel.tsx`, ENTRY = (id) => `${PREFIX}/screens/${id}.tsx`, HOOK = `${PREFIX}/hooks/useResult.ts`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const SURFACE_BODY = ['# Shared result panel', '## Purpose\nUniform result panel.',
  `## Host Contract\n${table(['Direction', 'Name', 'Meaning', 'Required'], [['output', 'onRetry', 'Retry intent', 'yes']])}`,
  `## State Matrix\n${table(['State', 'Condition', 'UI'], ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map((state) => [state, state, state]))}`,
  `## Interaction Matrix\n${table(['User Action', 'Trigger', 'Result', 'Result Type', 'Target', 'Params', 'Analytics Event'], [['Retry', 'press', 'retry', 'state', 'result', '-', '-']])}`,
  '## Mutation Matrix\n없음', '## Data Requirements\n- none', '## API Candidates\n없음',
  `## Copy Keys\n${table(['Key', '문구', 'Status'], [['panel.retry', 'Retry', 'draft']])}`,
  '## Accessibility\n- labelled retry', '## Acceptance Criteria\n- [ ] same retry intent',
  `## Unknowns\n${table(['ID', 'Question', 'Status'], [])}`].join('\n\n');

function repository(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-cli-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-cli-out-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  const docs = new Map();
  const put = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); return file; };
  const write = (name, relative, fm, body) => { const file = put(`${DOCS}/${relative}`, md(fm, body)); docs.set(name, file); return file; };
  const edit = (name, update) => {
    const file = docs.get(name), before = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const next = { fm: before.data, body: before.body }; update(next); fs.writeFileSync(file, md(next.fm, next.body));
  };
  const work = { version: 1, owners: [SURFACE, ...MEMBERS.map((id) => `screen:${id}`)], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
  put('.kit/policy.yaml', fs.readFileSync(DEFAULTS.policy, 'utf8'));
  put('.kit/adoption.yaml', `work_execution: ${JSON.stringify(work)}\n`);
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  for (const number of [0, 1, 2]) write(`rules-${number}.md`, `domains/result/rules/rules-${number}.md`, { artifact_id: `RULES-${number}`,
    artifact_type: 'domain-rules', domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-09-23',
    decision_id: `fixture-rules-${number}` }, `## Rules\nKnown local behavior ${number}.`);
  MEMBERS.forEach((id, index) => write(`screen-${index + 1}.md`, `domains/result/screens/${id.toLowerCase()}/screen-spec.md`, {
    artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec', screen_id: id, domain: 'result', route: `/${id.toLowerCase()}`,
    status: 'draft', api_required: false, screen_entry: ENTRY(id),
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] },
  }, '## Notes\nExisting host.'));
  write('surface.md', 'domains/result/surfaces/result-panel/surface-spec.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS],
    implementation_paths: [`${SHARED}/**`],
    work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] },
  }, SURFACE_BODY);
  for (const file of [PANEL, HOOK, ...MEMBERS.map(ENTRY)]) put(file, 'export default null;\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = (message) => {
    const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
    put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir: path.join(root, DOCS), srcDir: path.join(root, 'src'),
      date: '2026-09-23', layout, projectRoot: root }).state));
    git('add', '-A'); git('commit', '-qm', message);
  };
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test');
  commit('baseline');
  const request = (requests, name = 'request.json') => {
    const file = path.join(outside, name); fs.writeFileSync(file, JSON.stringify({ version: 1, origin_inputs: [], requests })); return file;
  };
  const cli = (script, work, ...extra) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', script), '--work', work, '--root', root,
    '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', ...extra],
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };
  return { root, outside, docs, put, edit, commit, request, cli, json };
}
const surfaceRequest = { owner: SURFACE, authority: 'scoped', unit: 'panel', targets: [{ path: PANEL, change: 'M' }] };

test('D34 CLI: the five public work CLIs run a scoped request from preflight to review evidence', (t) => {
  const r = repository(t), work = r.request([surfaceRequest]);
  const ready = r.json(r.cli('readiness.mjs', work, '--json'));
  assert.deepEqual([ready.authority, ready.ready, ready.requests[0].unit], ['scoped', true, 'panel']);
  assert.match(r.cli('readiness.mjs', work).stdout, /^scoped-work readiness — ready=true requests=1 origins=0\n  surface:RESULT-PANEL\/panel: kind=behavior/);
  const packet = path.join(r.outside, 'packet.md');
  assert.equal(r.json(r.cli('workflow-packet.mjs', work, '--out', packet, '--json')).packet_type, 'scoped-work');
  assert.match(fs.readFileSync(packet, 'utf8'), /^---\nkind: scoped-work-packet\n/);
  assert.equal(r.json(r.cli('workflow-run.mjs', work, '--json')).state, 'HALT_READY_FOR_WORK');

  r.put(PANEL, 'export default function Panel() { return null; }\n');
  const gate = r.json(r.cli('forbidden-paths.mjs', work, '--json'));
  assert.deepEqual([gate.authority, gate.ok, gate.violations], ['scoped', true, []]);
  assert.equal(r.cli('forbidden-paths.mjs', work, '--enforce').status, 0);
  const report = r.json(r.cli('workflow-report.mjs', work, '--packet', packet, '--json'));
  assert.deepEqual([report.report_type, report.backstop.ok, report.approval_verified], ['scoped-work', true, false]);
  const outDir = path.join(r.outside, 'run');
  const done = r.json(r.cli('workflow-run.mjs', work, '--packet', packet, '--out', outDir, '--json'));
  assert.deepEqual([done.authority, done.state, done.backstop.ok], ['scoped', 'DONE_PENDING_REVIEW', true]);
  assert.match(fs.readFileSync(`${outDir}.md`, 'utf8'), /kind: scoped-work-run-status[\s\S]*# Scoped Work Run — DONE_PENDING_REVIEW/);
  assert.ok(fs.existsSync(path.join(outDir, 'run-report.md')));
  assert.deepEqual(done.backstop, report.backstop);
  assert.deepEqual(done.checkpoint, { packet, matched: true });
});

test('#276 CLI: a scoped delete runs from packet to review evidence while the baseline still has the file', (t) => {
  const r = repository(t), work = r.request([{ ...surfaceRequest, targets: [{ path: PANEL, change: 'D' }] }]);
  const packet = path.join(r.outside, 'packet.md');
  r.json(r.cli('workflow-packet.mjs', work, '--out', packet, '--json'));
  assert.equal(r.json(r.cli('workflow-run.mjs', work, '--json')).state, 'HALT_READY_FOR_WORK');
  fs.rmSync(path.join(r.root, PANEL));
  const gate = r.json(r.cli('forbidden-paths.mjs', work, '--json'));
  assert.deepEqual([gate.ok, gate.implementation_records.map((record) => `${record.status}:${record.projectPath}`)], [true, [`D:${PANEL}`]]);
  assert.equal(r.json(r.cli('workflow-report.mjs', work, '--packet', packet, '--json')).backstop.ok, true);
  const done = r.json(r.cli('workflow-run.mjs', work, '--packet', packet, '--json'));
  assert.deepEqual([done.state, done.backstop.ok], ['DONE_PENDING_REVIEW', true]);
});

test('D34 CLI: unrequested changes, packet drift and baseline denials are never reported as success', (t) => {
  const r = repository(t), work = r.request([surfaceRequest]), packet = path.join(r.outside, 'packet.md');
  r.json(r.cli('workflow-packet.mjs', work, '--out', packet, '--json'));
  r.put(PANEL, 'export const changed = 1;\n'); r.put(`${PREFIX}/components/other/Other.tsx`, 'export const other = 1;\n');
  const gate = r.cli('forbidden-paths.mjs', work, '--json', '--enforce');
  assert.equal(gate.status, 1); assert.deepEqual(JSON.parse(gate.stdout).violations.map((entry) => entry.code), ['SW-GIT-UNREQUESTED']);
  const tampered = fs.readFileSync(packet, 'utf8').replace(/"commit": "[0-9a-f]+"/, `"commit": "${'0'.repeat(40)}"`);
  fs.writeFileSync(packet, tampered);
  const report = r.cli('workflow-report.mjs', work, '--packet', packet, '--json');
  assert.equal(report.status, 2); assert.match(report.stderr, /packet: Git baseline changed since packet creation/);
  const s = repository(t); s.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); s.commit('draft host contract');
  const run = s.json(s.cli('workflow-run.mjs', s.request([surfaceRequest]), '--json'));
  assert.equal(run.state, 'HALT_AMBIGUITY'); assert.equal(run.ready, false);
  assert.ok(run.denials.some((entry) => entry.code === 'confirmed-behavior-contract-required' && entry.host === 'screen:RESULT-002'));
});

test('D34 CLI: current and scoped documents stay separate; a mixed document is an input error', (t) => {
  const r = repository(t);
  const current = { owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: HOOK, change: 'M' }] };
  const legacy = r.json(r.cli('readiness.mjs', r.request([current], 'current.json'), '--json'));
  assert.deepEqual([legacy.authority, legacy.ready], ['current', true]);
  const mixed = r.cli('readiness.mjs', r.request([current, surfaceRequest], 'mixed.json'), '--json');
  assert.equal(mixed.status, 2); assert.match(mixed.stderr, /mixed current\/scoped work documents are not supported/);
  const adopted = r.json(r.cli('readiness.mjs', r.request([{ ...current, targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }], 'adopted.json'), '--json'));
  assert.deepEqual(adopted.denials.map((entry) => entry.code), ['CW-WORK-SELECTION-REQUIRED']);
});

// Synthetic v2 Items and review attachments on real committed Git snapshots.
// No receipt here authenticates a reviewer or represents a consumer dry-run.
function sourceAdmissionFixture(t, result) {
  const r = repository(t), input = 'IN-20261024-meeting-001', owner = 'screen:RESULT-001';
  const ref = (item) => `input:${input}#extracted-facts/${item}`;
  const selection = (item = '01') => ({ input_id: input, items: [item], source_refs: [ref(item)] });
  const inputPath = `${DOCS}/inputs/${input}.md`, registerPath = `${DOCS}/_meta/reconciliation-register.md`;
  const reportPath = `${DOCS}/_meta/reviews/source-coverage.md`;
  r.put(inputPath, md({ input_id: input, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:synthetic-source-admission',
    captured_at: '2026-10-24T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: MEMBERS },
  '## Extracted Facts\n- Existing first-screen rule.\n- Second-screen choice remains open.'));
  r.edit('screen-1.md', ({ fm }) => { fm.work_execution.units[0].sources = [selection()]; });
  r.edit('screen-2.md', (doc) => { doc.body += `\n\n## Open Decisions\n${table(
    ['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
    [['D-OTHER', 'Choose the second-screen rule.', 'A / B', 'rough-fixture-ui', 'PM', 'open']])}`; });
  r.put(registerPath, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    `${table(REQUIRED_REGISTER_COLS, [[input, 'meeting', 'simple-update + new-decision', 'reconciled', result,
      'artifact:RULES-1; artifact:HOST-2', 'decision:D-OTHER@HOST-2', '-']])}\n\n## Reconciliation Items\n` +
    table(REQUIRED_ITEM_COLS, [
      [input, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES-1#rules', ref('01'), 'inherit', 'statement', 'inherit'],
      [input, '02', 'new-choice', 'new-decision', 'create-open', 'decision:D-OTHER@HOST-2', ref('02'), 'inherit', 'statement', 'inherit'],
    ])));
  const options = () => ({ owner, unit: 'known', projectRoot: r.root, docsDir: path.join(r.root, DOCS), kitRoot: path.join(r.root, '.kit'),
    policyFile: path.join(r.root, '.kit/policy.yaml'), policyOverlayFile: path.join(r.root, '.kit/adoption.yaml'),
    layoutFile: path.join(r.root, '.kit/layout.yaml'), manifestFile: path.join(r.root, '.kit/manifest.yaml'),
    registerFile: path.join(r.root, registerPath), inputArtifacts: [loadInputArtifact(path.join(r.root, inputPath))],
    layout: loadLayoutProfile({ kitRoot: r.root, flags: { layout: path.join(r.root, '.kit/layout.yaml') } }),
    targetIndex: buildReconciliationTargetIndex({ docs: [...r.docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  const proof = (selected = selection(), extra = {}) => {
    const source = createScopedSourceResolver(options()).source(selected), relations = resolveScopedSourceRelations(options());
    const hash = (value) => hashBytes(Buffer.from(scopeJson(value)));
    return { version: 1, owner, unit: 'known', input_id: input, item_ids: selected.items, source_refs: selected.source_refs,
      input_sha256: source.input.input_sha256,
      effects_sha256: hash(scopeSet(source.groups.flatMap((group) => group.effects.map((effect) => effect.fields)))),
      contracts_sha256: hash(relations.contract_hashes), review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit', ...extra };
  };
  const report = (receipt = proof()) => r.put(reportPath, `# Synthetic Stage 04 review\n\n\`\`\`work-coverage\n${JSON.stringify(receipt)}\n\`\`\`\n`);
  const request = (withReport = true, item = '01', target = ENTRY('RESULT-001')) => {
    const file = r.request([{ owner, authority: 'scoped', unit: 'known', coverage_reports: withReport ? [reportPath] : [],
      targets: [{ path: target, change: 'M' }] }], `source-${withReport}-${item}-${target.replaceAll('/', '-')}.json`);
    const document = JSON.parse(fs.readFileSync(file)); document.origin_inputs = [{ input_id: input, source_refs: [ref(item)] }];
    fs.writeFileSync(file, JSON.stringify(document)); return file;
  };
  const run = (work) => r.json(r.cli('readiness.mjs', work, '--json'));
  r.commit('synthetic source and open second-screen decision');
  return { r, input, inputPath, registerPath, selection, proof, report, request, run };
}

for (const result of ['pending-user-decision', 'mixed']) {
  test(`source admission CLI: reconciled/${result} needs committed current coverage; other gates still deny`, (t) => {
    const f = sourceAdmissionFixture(t, result), { r } = f;
    const before = [f.inputPath, f.registerPath].map((file) => fs.readFileSync(path.join(r.root, file)));
    const missing = f.run(f.request(false)); assert.equal(missing.ready, false);
    assert.ok(missing.denials.some((entry) => entry.code === 'source-coverage-unready'));
    f.report(); r.commit('synthetic current complete-for-unit attachment');
    const work = f.request(), current = f.run(work);
    assert.equal(current.ready, true, JSON.stringify(current.denials));
    assert.deepEqual(current.requests[0].evidence.coverage, [{ input_id: f.input, accepted_for_source: true, receipt_state: 'current' }]);
    assert.deepEqual(current.origin_inputs.map(({ input_id, source_refs }) => ({ input_id, source_refs })),
      [{ input_id: f.input, source_refs: f.selection().source_refs }]);
    const forbidden = f.run(f.request(true, '01', PANEL));
    assert.equal(forbidden.ready, false); assert.equal(forbidden.requests[0].evidence.coverage[0].accepted_for_source, true);
    assert.equal(forbidden.requests[0].path_authorizations[0].allowed, false);
    [f.inputPath, f.registerPath].forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(r.root, file)), before[i]));

    fs.appendFileSync(path.join(r.root, f.inputPath), '\nChanged original bytes in synthetic test.');
    assert.equal(f.run(work).ready, true, 'uncommitted bytes cannot replace the HEAD authority');
    r.commit('synthetic changed input bytes');
    const stale = f.run(work); assert.equal(stale.ready, false);
    assert.equal(stale.requests[0].evidence.coverage[0].receipt_state, 'stale');

    r.edit('rules-1.md', (doc) => { doc.body += `\n\n## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-ONE', 'What remains unknown?', 'open']])}`; });
    f.report(); r.commit('synthetic open unit Unknown with current coverage');
    const unknown = f.run(work); assert.equal(unknown.ready, false);
    assert.equal(unknown.requests[0].evidence.coverage[0].accepted_for_source, true);
    assert.ok(unknown.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved'));
    r.edit('screen-1.md', (doc) => { doc.body += `\n\n## Open Decisions\n${table(
      ['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
      [['D-ONE', 'Choose the first-screen behavior.', 'A / B', 'rough-fixture-ui', 'PM', 'open']])}`; });
    r.commit('synthetic open unit Decision');
    const decision = f.run(work); assert.equal(decision.ready, false);
    assert.equal(decision.requests[0].evidence.coverage[0].accepted_for_source, true);
    assert.ok(decision.denials.some((entry) => entry.code === 'unit-decision-blocked'));
  });

  test(`source admission CLI: reconciled/${result} unrelated origin needs current no-effect routing`, (t) => {
    const f = sourceAdmissionFixture(t, result), { r } = f;
    r.edit('screen-1.md', ({ fm }) => { fm.work_execution.units[0].sources = []; });
    r.commit('synthetic canonical unit without source selection');
    const noProof = f.run(f.request(false, '02')); assert.equal(noProof.ready, false);
    const receipt = f.proof(f.selection('02'), { origin_source_refs: f.selection('02').source_refs, origin_relation: 'no-effect-on-unit' });
    f.report(receipt); r.commit('synthetic unrelated origin routing attachment');
    const out = f.run(f.request(true, '02')); assert.equal(out.ready, true, JSON.stringify(out.denials));
    assert.deepEqual(out.requests[0].evidence.coverage, []);
    f.report({ ...receipt, origin_source_refs: [] }); r.commit('synthetic mismatched routing scope');
    const wrongScope = f.run(f.request(true, '02')); assert.equal(wrongScope.ready, false);
    assert.ok(wrongScope.denials.some((entry) => entry.code === 'origin-input-unreconciled' && entry.reasons.includes('origin-scope-mismatch')));
  });
}
