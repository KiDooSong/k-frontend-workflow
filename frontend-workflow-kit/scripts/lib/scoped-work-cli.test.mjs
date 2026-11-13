import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
  const command = (script, work, ...extra) => [path.join(KIT_ROOT, 'scripts', script), '--work', work, '--root', root,
    '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', ...extra];
  const cli = (script, work, ...extra) => spawnSync(process.execPath, command(script, work, ...extra),
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };
  return { root, outside, docs, put, edit, commit, request, command, cli, json };
}
const surfaceRequest = { owner: SURFACE, authority: 'scoped', unit: 'panel', targets: [{ path: PANEL, change: 'M' }] };

const screenRequests = () => MEMBERS.map((id) => ({ owner: `screen:${id}`, authority: 'scoped', unit: 'known',
  targets: [{ path: ENTRY(id), change: 'M' }] }));
const runBundle = (directory) => ['work-packet.md', 'run-report.md'].map((name) => path.join(directory, name)).concat(`${directory}.md`)
  .map((file) => fs.existsSync(file) ? fs.readFileSync(file) : null);

for (const denied of [false, true]) test(`#321 progress CLI: ${denied ? 'denied' : 'ready'} two-owner pre-work keeps stdout and packet bytes identical`, (t) => {
  const r = repository(t);
  if (denied) { r.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); r.commit('unconfirmed second host contract'); }
  const work = r.request(screenRequests()), plainDir = path.join(r.outside, 'plain'), observedDir = path.join(r.outside, 'observed');
  const plain = r.cli('workflow-run.mjs', work, '--out', plainDir, '--json');
  const observed = r.cli('workflow-run.mjs', work, '--out', observedDir, '--json', '--progress');
  const expected = r.json(plain), actual = r.json(observed);
  assert.equal(expected.state, denied ? 'HALT_AMBIGUITY' : 'HALT_READY_FOR_WORK');
  assert.equal(plain.stderr, '');
  assert.equal(observed.stdout, plain.stdout);
  assert.deepEqual(actual, expected);
  assert.deepEqual(runBundle(observedDir), runBundle(plainDir));
  for (const phase of ['run:start', 'snapshot:start', 'snapshot:done', 'baseline-inputs:start', 'baseline-inputs:done',
    'composition-audit:start', 'composition-audit:done', 'authority:start', 'authority:done', 'packet:start', 'packet:done', 'cleanup:done', 'run:done']) {
    assert.ok(observed.stderr.includes(phase), `missing progress phase ${phase}`);
  }
  for (const [index, id] of MEMBERS.entries()) {
    assert.ok(observed.stderr.includes(`owner:start "${index + 1}/2 screen:${id}/known"`));
    assert.ok(observed.stderr.includes(`owner:done "${index + 1}/2 screen:${id}/known"`));
  }
  assert.equal(observed.stderr.includes('backstop:start'), !denied);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: r.root, encoding: 'utf8' }), '');
});

test('#321 progress CLI: packet-bound post-work keeps checkpoint, backstop and every output byte identical', (t) => {
  const r = repository(t), work = r.request(screenRequests()), before = path.join(r.outside, 'before');
  r.json(r.cli('workflow-run.mjs', work, '--out', before, '--json'));
  const packet = path.join(before, 'work-packet.md'), packetBytes = fs.readFileSync(packet);
  for (const id of MEMBERS) r.put(ENTRY(id), `export default function Result() { return '${id}'; }\n`);
  const plainDir = path.join(r.outside, 'plain'), observedDir = path.join(r.outside, 'observed');
  const plain = r.cli('workflow-run.mjs', work, '--packet', packet, '--out', plainDir, '--json');
  const observed = r.cli('workflow-run.mjs', work, '--packet', packet, '--out', observedDir, '--json', '--progress');
  assert.equal(r.json(plain).state, 'DONE_PENDING_REVIEW');
  assert.equal(r.json(observed).backstop.ok, true);
  assert.equal(plain.stderr, '');
  assert.equal(observed.stdout, plain.stdout);
  assert.deepEqual(runBundle(observedDir), runBundle(plainDir));
  assert.deepEqual(fs.readFileSync(packet), packetBytes);
  for (const phase of ['checkpoint:start', 'checkpoint:done', 'backstop:start', 'backstop:done', 'report:start', 'report:done']) {
    assert.ok(observed.stderr.includes(phase));
  }
});

test('#321 progress CLI: current authority retains its independent preparation and existing denial', (t) => {
  const r = repository(t), work = r.request([{ owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui',
    targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }]);
  const plain = r.cli('workflow-run.mjs', work, '--json'), observed = r.cli('workflow-run.mjs', work, '--json', '--progress');
  assert.equal(r.json(plain).state, 'HALT_AMBIGUITY');
  assert.ok(r.json(observed).denials.some((entry) => entry.code === 'CW-WORK-SELECTION-REQUIRED'));
  assert.equal(plain.stderr, ''); assert.equal(observed.stdout, plain.stdout);
  assert.match(observed.stderr, /prepare:start "current"/); assert.match(observed.stderr, /prepare:done "current"/);
  assert.doesNotMatch(observed.stderr, /snapshot:start|owner:start/);
});

test('#321 progress CLI: a closed diagnostic sink preserves the full run output and packet', (t) => {
  const r = repository(t), work = r.request(screenRequests()), plainDir = path.join(r.outside, 'plain'), observedDir = path.join(r.outside, 'observed');
  const plain = r.cli('workflow-run.mjs', work, '--out', plainDir, '--json'); r.json(plain);
  const preload = path.join(r.outside, 'closed-progress.cjs');
  fs.writeFileSync(preload, `
const fs = require('node:fs'), write = fs.writeSync;
fs.writeSync = function(fd, ...args) {
  if (fd === 2) throw Object.assign(new Error('closed diagnostic sink'), { code: 'EPIPE' });
  return write.call(this, fd, ...args);
};
`);
  const observed = spawnSync(process.execPath, ['--require', preload,
    ...r.command('workflow-run.mjs', work, '--out', observedDir, '--json', '--progress')],
  { cwd: r.root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  r.json(observed);
  assert.equal(observed.stderr, ''); assert.equal(observed.stdout, plain.stdout);
  assert.deepEqual(runBundle(observedDir), runBundle(plainDir));
});

test('#321 progress CLI: failing owner preserves the original error and exit without publishing a packet', (t) => {
  const r = repository(t);
  r.edit('screen-1.md', ({ fm }) => { fm.work_execution.units[0].contracts = ['artifact:MISSING#rules']; });
  r.commit('broken selected contract');
  const work = r.request(screenRequests()), plainDir = path.join(r.outside, 'plain'), observedDir = path.join(r.outside, 'observed');
  const plain = r.cli('workflow-run.mjs', work, '--out', plainDir, '--json');
  const observed = r.cli('workflow-run.mjs', work, '--out', observedDir, '--json', '--progress');
  assert.equal(plain.status, 2); assert.equal(observed.status, plain.status);
  assert.equal(plain.stdout, ''); assert.equal(observed.stdout, plain.stdout);
  assert.ok(observed.stderr.endsWith(plain.stderr), 'the existing tool error remains verbatim');
  assert.match(observed.stderr, /owner:start "1\/2 screen:RESULT-001\/known"/);
  assert.match(observed.stderr, /run:failed/); assert.doesNotMatch(observed.stderr, /run:done|packet:done/);
  assert.equal(fs.existsSync(observedDir), false); assert.equal(fs.existsSync(plainDir), false);
});

test('#321 progress CLI: snapshot progress reaches stderr while synchronous preparation is still blocked', async (t) => {
  const r = repository(t), work = r.request(screenRequests()), plain = r.cli('workflow-run.mjs', work, '--json');
  r.json(plain);
  const preload = path.join(r.outside, 'pause-on-progress.cjs');
  const acknowledged = path.join(r.outside, 'progress-acknowledged');
  fs.writeFileSync(preload, `
const fs = require('node:fs'), write = fs.writeSync;
let paused = false;
fs.writeSync = function(fd, bytes, ...args) {
  const result = write.call(this, fd, bytes, ...args);
  if (!paused && fd === 2 && Buffer.isBuffer(bytes) && bytes.includes(Buffer.from('snapshot:start'))) {
    paused = true;
    const ack = Buffer.alloc(1);
    if (fs.readSync(0, ack, 0, 1, null) !== 1 || ack[0] !== 120) throw new Error('missing progress acknowledgment');
    fs.writeFileSync(${JSON.stringify(acknowledged)}, 'acknowledged');
  }
  return result;
};
`);
  const child = spawn(process.execPath, ['--require', preload, ...r.command('workflow-run.mjs', work, '--json', '--progress')],
    { cwd: r.root, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000, killSignal: 'SIGKILL' });
  let stdout = '', stderr = '', released = false, stdoutAtProgress = null, runningAtProgress = false;
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (!released && stderr.includes('snapshot:start')) {
      released = true; stdoutAtProgress = stdout; runningAtProgress = child.exitCode === null;
      child.stdin.end('x');
    }
  });
  let stdinError;
  child.stdin.on('error', (error) => { stdinError = error; });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.code, 0, stderr); assert.equal(result.signal, null);
  assert.equal(stdinError, undefined); assert.equal(released, true); assert.equal(runningAtProgress, true);
  assert.equal(fs.readFileSync(acknowledged, 'utf8'), 'acknowledged', 'the synchronous pause must receive the parent handshake');
  assert.equal(stdoutAtProgress, '', 'progress is observable before a complete JSON envelope exists');
  assert.equal(stdout, plain.stdout);
  assert.match(stderr, /run:done/);
});

test('#321 progress CLI: opt-in is restricted to boolean workflow-run --work and help documents stderr', (t) => {
  const r = repository(t), work = r.request(screenRequests());
  for (const script of ['readiness.mjs', 'workflow-packet.mjs', 'workflow-report.mjs', 'forbidden-paths.mjs']) {
    const result = r.cli(script, work, '--progress', '--json');
    assert.equal(result.status, 2); assert.match(result.stderr, /unknown option --progress/); assert.equal(result.stdout, '');
  }
  const malformed = r.cli('workflow-run.mjs', work, '--progress=true', '--json');
  assert.equal(malformed.status, 2); assert.match(malformed.stderr, /--progress does not accept a value/);
  const ordinary = spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts/workflow-run.mjs'), '--progress', '--help'], { encoding: 'utf8' });
  assert.equal(ordinary.status, 2); assert.match(ordinary.stderr, /--progress requires --work/);
  const help = r.cli('workflow-run.mjs', work, '--help');
  assert.equal(help.status, 0); assert.match(help.stdout, /--progress.*stderr/); assert.equal(help.stderr, '');
});

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

test('#300 scoped readiness CLI: matching Decision bindings and profile applicability reuse their whole-owner units', (t) => {
  const r = repository(t), owner = 'screen:RESULT-001', ids = Array.from({ length: 6 }, (_, index) => `D-${index + 1}`);
  const binding = (id) => ({ decision_id: id, owner, known_units: ['known'], blocks: [],
    basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:synthetic-readiness-scope' });
  r.edit('screen-1.md', (doc) => {
    doc.fm.decision_work_scopes = { version: 1, bindings: [binding(ids[0])] };
    doc.body += `\n\n## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
      ids.map((id) => [id, `Choose ${id}?`, 'A / B', 'api-integrated-ui', 'PM', 'open']))}`;
  });
  // A native Unknown expands the applicability relation closure, so the
  // mutable profile builds units for its boundary and both uncertainty passes.
  r.edit('rules-1.md', (doc) => { doc.body += `\n\n## Unknowns\n${table(['ID', 'Question', 'Status'],
    [['U-PROFILE', 'What remains unresolved for the selected behavior?', 'open']])}`; });
  const work = r.request([{ owner, authority: 'scoped', unit: 'known', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }]);
  const countsFile = path.join(r.outside, 'readiness-counts.json'), preload = path.join(r.outside, 'count-readiness.cjs');
  // Observe actual policy reads in unit construction inside the spawned CLI.
  // Fresh audits are still required and may grow with the number of bindings;
  // they must not be mistaken for another full applicability computation.
  fs.writeFileSync(preload, `
const fs = require('node:fs'), path = require('node:path');
const open = fs.openSync;
Error.stackTraceLimit = 40;
let unitProjectionPolicyReads = 0, profileApplicabilityPolicyReads = 0;
fs.openSync = function(file, ...args) {
  if (typeof file === 'string') {
    const parts = path.normalize(file).split(path.sep);
    if (parts.includes('checkout') && parts.slice(-2).join('/') === '.kit/policy.yaml') {
      const stack = new Error().stack;
      if (stack.includes('at resolveScopedUnitProjection')) {
        unitProjectionPolicyReads++;
        if ((stack.includes('at inspectProfile') || stack.includes('at inspectScopedProfile')) &&
            stack.includes('at applicabilityProjection') && !stack.includes('at inspectScopedInputCoverage')) {
          profileApplicabilityPolicyReads++;
        }
      }
    }
  }
  return open.call(this, file, ...args);
};
require('node:module').syncBuiltinESMExports();
process.on('exit', () => fs.writeFileSync(${JSON.stringify(countsFile)}, JSON.stringify({ unitProjectionPolicyReads, profileApplicabilityPolicyReads })));
`);
  const measure = () => {
    const run = spawnSync(process.execPath, ['--require', preload, path.join(KIT_ROOT, 'scripts/readiness.mjs'),
      '--work', work, '--root', r.root, '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml',
      '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', '--json'],
    { cwd: r.root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
    const report = r.json(run), counts = JSON.parse(fs.readFileSync(countsFile, 'utf8'));
    assert.ok(counts.unitProjectionPolicyReads > 0, 'the diagnostic must observe real snapshot unit construction');
    // A unit construction reads this policy once initially and once in its own
    // final audit. The profile's applicability therefore needs one pair, rather
    // than the three pairs from independently rebuilding boundary/relations.
    // Coverage retains its independent boundary and is excluded above.
    assert.equal(counts.profileApplicabilityPolicyReads, 2,
      'the profile applicability must construct its units once while retaining the final policy audit');
    return { report, ...counts };
  };
  r.commit('six open Decisions with one recorded binding');
  const one = measure();
  r.edit('screen-1.md', ({ fm }) => { fm.decision_work_scopes.bindings = ids.map(binding); });
  r.commit('record bindings for all six existing Decisions');
  const before = fs.readFileSync(r.docs.get('screen-1.md')), many = measure();
  assert.equal(many.unitProjectionPolicyReads, one.unitProjectionPolicyReads,
    'matching Decision bindings must reuse their owner projection instead of rebuilding its units');
  const { snapshot: oneSnapshot, ...onePublic } = one.report, { snapshot: manySnapshot, ...manyPublic } = many.report;
  assert.deepEqual(manyPublic, onePublic, 'missing and stale scopes retain the same full public readiness result and conservative gates');
  assert.deepEqual([many.report.authority, many.report.ready, many.report.approval_verified, many.report.semantic_coverage_verified],
    ['scoped', false, false, false]);
  assert.deepEqual(many.report.requests[0].evidence.decisions.map((entry) => [entry.decision, entry.scope_source, entry.blocking_units]),
    ids.map((id) => [`decision:${id}@HOST-1`, 'conservative-default', ['known']]));
  assert.ok(many.report.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved'),
    'reusing unit facts must retain the native Unknown denial after relation closure');
  assert.notEqual(manySnapshot.commit, oneSnapshot.commit, 'fresh HEAD and authority bytes remain independently pinned');
  assert.notDeepEqual(manySnapshot.authority_read_set, oneSnapshot.authority_read_set);
  assert.deepEqual(manySnapshot.work_request, oneSnapshot.work_request);
  assert.deepEqual(r.json(r.cli('readiness.mjs', work, '--json')), many.report, 'instrumentation changes neither output nor repeated-call results');
  assert.deepEqual(fs.readFileSync(r.docs.get('screen-1.md')), before);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: r.root, encoding: 'utf8' }), '');
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
