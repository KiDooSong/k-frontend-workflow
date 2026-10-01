// Packet-bound run regressions for the merged flow-consolidation design (#261).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { splitFrontmatter, DEFAULTS, KIT_ROOT } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';

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
  put('.kit/policy.yaml', `${fs.readFileSync(DEFAULTS.policy, 'utf8')}\nwork_execution: ${JSON.stringify(work)}\n`);
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
  return { root, outside, put, edit, commit, request, cli, json };
}
const surfaceRequest = { owner: SURFACE, authority: 'scoped', unit: 'panel', targets: [{ path: PANEL, change: 'M' }] };


// Instrument real exported entry points in the spawned process, without replacing
// authority or Git evaluation. The temporary loader is never consumer runtime.
const TRACE_LOADER = `
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!/\\/(current-work-execution-preflight|current-work-execution-backstop|scoped-work-execution)\\.mjs$/.test(url)) return result;
  const pattern = /export function (prepareCurrentWork|prepareScopedWork|evaluateCurrentGit|evaluateScopedGit)\\([^\\n]+\\) \\{\\n/g;
  const source = String(result.source).replace(pattern, (signature, name) => signature +
    '  workRunTrace(' + JSON.stringify(name) + ');\\n');
  return { ...result, source: source + '\\n' +
    'import { appendFileSync as traceAppend, mkdirSync as traceMkdir } from "node:fs";\\n' +
    'function workRunTrace(name) {\\n' +
    '  traceAppend(process.env.WORK_RUN_TRACE, name + "\\\\n");\\n' +
    '  if (name.startsWith("evaluate") && process.env.WORK_RUN_MUTATION) {\\n' +
    '    const mutation = JSON.parse(process.env.WORK_RUN_MUTATION);\\n' +
    '    if (mutation.file) traceAppend(mutation.file, mutation.append);\\n' +
    '    if (mutation.mkdir) traceMkdir(mutation.mkdir);\\n' +
    '  }\\n' +
    '}\\n' };
}
`;
function fixture(t, authority, state = 'ready') {
  const r = repository(t);
  let selection = authority === 'scoped' ? surfaceRequest : {
    owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: HOOK, change: 'M' }],
  };
  if (state === 'denied') {
    if (authority === 'scoped') r.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; });
    else selection = { ...selection, targets: [{ path: 'src/api/forbidden.ts', change: 'A' }] };
  }
  if (state === 'absorbed') {
    r.edit('screen-1.md', ({ fm }) => { fm.screen_lifecycle = 'absorbed'; fm.absorbed_into = 'RESULT-002'; fm.absorbed_at = '2026-09-23'; });
    // The lifecycle fixture is a screen request, independent of surface membership.
    fs.rmSync(path.join(r.root, DOCS, 'domains/result/surfaces'), { recursive: true });
    const policy = path.join(r.root, '.kit/policy.yaml');
    fs.writeFileSync(policy, fs.readFileSync(policy, 'utf8').replace('"surface:RESULT-PANEL",', ''));
    selection = authority === 'scoped'
      ? { owner: 'screen:RESULT-001', authority: 'scoped', unit: 'known', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }
      : { ...selection, targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] };
  }
  if (state === 'absorbed' || (state === 'denied' && authority === 'scoped')) r.commit(state);
  const work = r.request([selection]);
  const trace = path.join(r.outside, 'trace.txt'), loader = path.join(r.outside, 'trace-loader.mjs');
  fs.writeFileSync(loader, TRACE_LOADER);
  const cli = (script, extra = [], { mutation, human = false, kit = KIT_ROOT } = {}) => {
    fs.writeFileSync(trace, '');
    const result = spawnSync(process.execPath, ['--experimental-loader', loader, '--no-warnings',
      path.join(kit, 'scripts', `${script}.mjs`), '--work', work, '--root', r.root,
      '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml',
      ...extra, ...(human ? [] : ['--json'])], {
      cwd: r.root, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, WORK_RUN_TRACE: trace, WORK_RUN_MUTATION: mutation ? JSON.stringify(mutation) : '' },
    });
    const calls = fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean);
    return { ...result, prepares: calls.filter(name => name.startsWith('prepare')).length,
      backstops: calls.filter(name => name.startsWith('evaluate')).length };
  };
  const before = path.join(r.outside, 'before'), packet = path.join(before, 'work-packet.md');
  const preworkRun = cli('workflow-run', ['--out', before]);
  const prework = r.json(preworkRun);
  return { ...r, work, selection, cli, before, packet, prework, preworkRun,
    target: selection.targets[0].path, after: path.join(r.outside, 'after') };
}
function machine(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const match = /## Machine Envelope\s*\n```json\s*\n([\s\S]*?)\n```/.exec(raw);
  assert.ok(match, file);
  return JSON.parse(match[1]);
}
function tamper(file, update) {
  const raw = fs.readFileSync(file, 'utf8');
  const pattern = /(## Machine Envelope\s*\n```json\s*\n)([\s\S]*?)(\n```)/;
  const value = JSON.parse(pattern.exec(raw)[2]); update(value);
  fs.writeFileSync(file, raw.replace(pattern, (_, start, _value, end) => start + JSON.stringify(value) + end));
}
function assertCalls(run, prepares, backstops) {
  assert.equal(run.prepares, prepares, run.stderr); assert.equal(run.backstops, backstops, run.stderr);
}
function assertNoBundle(out) {
  for (const file of [path.join(out, 'work-packet.md'), path.join(out, 'run-report.md'), `${out}.md`]) assert.equal(fs.existsSync(file), false, file);
}
function assertError(run, pattern, out) {
  assert.equal(run.status, 2, run.stderr || run.stdout); assert.equal(run.stdout, ''); assert.match(run.stderr, pattern);
  if (out) assertNoBundle(out);
}
function assertEvidence(f, run, state, { out = true } = {}) {
  assertCalls(run, 1, 1);
  const actual = f.json(run);
  assert.equal(actual.state, state);
  assert.deepEqual(actual.checkpoint, { packet: path.resolve(f.packet), matched: true });
  const reportRun = f.cli('workflow-report', ['--packet', f.packet]);
  assertCalls(reportRun, 1, 1);
  const report = f.json(reportRun);
  for (const key of ['request_digest', 'snapshot', 'origin_inputs', 'requests', 'ready', 'backstop', 'required_reviews']) {
    assert.deepEqual(actual[key], report[key], `standalone report parity: ${key}`);
  }
  if (out) {
    assert.deepEqual(machine(path.join(f.after, 'run-report.md')), report);
    assert.deepEqual(machine(`${f.after}.md`), actual);
    assert.equal(machine(path.join(f.after, 'work-packet.md')).request_digest, actual.request_digest);
  }
  return actual;
}
for (const authority of ['current', 'scoped']) {
  test(`flow ${authority}: prepare/backstop 6/4 -> 2/2, all outputs use the same observation`, (t) => {
    const f = fixture(t, authority);
    assertCalls(f.preworkRun, 1, 1);
    const before = f.cli('workflow-run'); assertCalls(before, 1, 1);
    assert.equal(f.json(before).state, 'HALT_READY_FOR_WORK');
    assert.equal(Object.hasOwn(f.json(before), 'checkpoint'), false);
    f.put(f.target, 'export const implemented = 1;\n');
    const packetBefore = fs.readFileSync(f.packet);
    const done = assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), 'DONE_PENDING_REVIEW');
    assert.equal(done.backstop.ok, true); assert.equal(done.backstop.implementation_records.length, 1);
    assert.deepEqual(fs.readFileSync(f.packet), packetBefore);
    // The old representative flow is still independently executable.
    const old = ['readiness', 'workflow-packet', 'workflow-run', 'forbidden-paths', 'workflow-report', 'workflow-run']
      .map(script => f.cli(script, script === 'workflow-report' ? ['--packet', f.packet] : []));
    old.forEach(run => f.json(run));
    assert.equal(old.reduce((n, run) => n + run.prepares, 0), 6);
    assert.equal(old.reduce((n, run) => n + run.backstops, 0), 4);
  });
  for (const state of ['ready', 'denied', 'absorbed']) {
    for (const changed of [false, true]) {
      test(`flow ${authority}: ${state}, diff=${changed}, HALT precedence and full report parity`, (t) => {
        const f = fixture(t, authority, state);
        const expected = state === 'absorbed' ? 'HALT_NOT_APPLICABLE' : state === 'denied' ? 'HALT_AMBIGUITY'
          : changed ? 'DONE_PENDING_REVIEW' : 'HALT_READY_FOR_WORK';
        if (changed) {
          f.put(f.target, 'export const implementation = 1;\n');
          if (state !== 'ready') f.put('src/unrequested.ts', 'export const forbidden = 1;\n');
        }
        const actual = assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), expected);
        assert.equal(actual.backstop.changed_records.length > 0, changed);
        if (state !== 'ready') {
          assert.equal(actual.ready, false); assert.equal(actual.backstop.ok, false);
          assert.deepEqual(actual.denials, f.prework.denials);
          if (changed) assert.ok(actual.backstop.violations.some(v => /UNREQUESTED|DENIED-TARGET/.test(v.code)));
        }
        if (!changed) assert.ok(actual.backstop.violations.some(v => /MISSING-REQUESTED/.test(v.code)));
        const noOut = assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet]), expected, { out: false });
        assert.deepEqual(noOut.backstop, actual.backstop);
        const human = f.cli('workflow-run', ['--packet', f.packet], { human: true });
        assert.equal(human.status, 0, human.stderr); assert.ok(human.stdout.includes('## Machine Envelope'));
        assert.ok(human.stdout.includes(actual.backstop.snapshot.destination_tree));
        const legacyDir = path.join(f.outside, 'legacy');
        const legacy = f.cli('workflow-run', ['--out', legacyDir]);
        assertCalls(legacy, 1, state === 'ready' ? 1 : 0);
        const unbound = f.json(legacy);
        assert.equal(unbound.state, expected); assert.equal(Object.hasOwn(unbound, 'checkpoint'), false);
        assert.equal(Object.hasOwn(unbound, 'backstop'), state === 'ready' && changed);
        assert.equal(fs.existsSync(path.join(legacyDir, 'run-report.md')), state === 'ready' && changed);
        assert.equal(fs.readFileSync(`${legacyDir}.md`, 'utf8').includes('## Machine Envelope'), false);
      });
    }
    test(`flow ${authority}: ${state} cannot hide an unmerged index collection error`, (t) => {
      const f = fixture(t, authority, state);
      const oid = execFileSync('git', ['rev-parse', `HEAD:${HOOK}`], { cwd: f.root, encoding: 'utf8' }).trim();
      execFileSync('git', ['update-index', '--index-info'], { cwd: f.root,
        input: `0 ${'0'.repeat(oid.length)}\t${HOOK}\n100644 ${oid} 1\t${HOOK}\n100644 ${oid} 2\t${HOOK}\n` });
      const failure = f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]);
      assertCalls(failure, 1, 1); assertError(failure, /unsupported or unmerged entry/, f.after);
    });
  }
  test(`flow ${authority}: packet mismatch precedes collection and any output`, (t) => {
    const f = fixture(t, authority), original = fs.readFileSync(f.packet);
    for (const update of [
      v => v.request_digest = 'changed', v => v.snapshot.commit = '0'.repeat(40), v => v.snapshot.tree = '0'.repeat(40),
      v => v.snapshot.project_prefix = 'apps/other', v => v.snapshot.resources[0].path = 'other',
      v => v.snapshot.resources[0].mode = '100755', v => v.snapshot.resources[0].oid = '0'.repeat(40),
      v => v.snapshot.authority_read_set.pop(), v => v.origin_inputs.push({ input_id: 'IN-20261001-note-001', raw_hash: 'changed' }),
      ...(authority === 'scoped' ? [v => v.snapshot.target_read_set.push({ file: 'other' }),
        v => v.snapshot.scoped_directory_read_set.push({ file: 'other' })] : []),
    ]) {
      fs.writeFileSync(f.packet, original); tamper(f.packet, update);
      const run = f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]);
      assertError(run, /packet:/, f.after); assertCalls(run, 1, 0);
    }
    fs.writeFileSync(f.packet, original);
    fs.appendFileSync(f.work, '\n');
    assertError(f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), /request bytes changed/, f.after);
    const request = JSON.parse(fs.readFileSync(f.work)); request.requests[0].targets[0].path = 'src/other.ts';
    fs.writeFileSync(f.work, JSON.stringify(request));
    assertError(f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), /request digest changed/, f.after);
  });
  test(`flow ${authority}: actual HEAD movement and raw request recheck stay binding`, (t) => {
    const f = fixture(t, authority);
    const run = f.cli('workflow-run', ['--packet', f.packet, '--out', f.after], { mutation: { file: f.work, append: '\n' } });
    assertCalls(run, 1, 1); assertError(run, /work request changed after preflight/, f.after);
    fs.writeFileSync(f.work, fs.readFileSync(f.work, 'utf8').trimEnd());
    execFileSync('git', ['commit', '--allow-empty', '-qm', 'new HEAD, same tree'], { cwd: f.root });
    const moved = f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]);
    assertCalls(moved, 1, 0); assertError(moved, /Git baseline changed/, f.after);
  });
  test(`flow ${authority}: packet grants cannot bypass authority changes after comparison`, (t) => {
    const f = fixture(t, authority);
    tamper(f.packet, v => { v.ready = true; v.requests.forEach(r => { r.ready = true; r.path_authorizations.forEach(a => a.allowed = true); }); });
    f.put(f.target, 'export const implemented = 1;\n');
    const run = f.cli('workflow-run', ['--packet', f.packet, '--out', f.after], {
      mutation: { file: path.join(f.root, '.kit/policy.yaml'), append: '\n# changed after packet assertion\n' },
    });
    const actual = assertEvidence(f, run, 'DONE_PENDING_REVIEW');
    assert.equal(actual.backstop.ok, false);
    assert.ok(actual.backstop.violations.some(v => v.code.endsWith('AUTHORITY-CHANGED')));
  });
  test(`flow ${authority}: packet errors and unsupported run flags write nothing`, (t) => {
    const f = fixture(t, authority), original = fs.readFileSync(f.packet);
    for (const text of ['not a packet', '## Machine Envelope\n```json\n{bad}\n```', '## Machine Envelope\n```json\nnull\n```']) {
      fs.writeFileSync(f.packet, text);
      assertError(f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), /packet:|Cannot read/, f.after);
    }
    fs.writeFileSync(f.packet, original);
    assertError(f.cli('workflow-run', ['--packet', path.join(f.outside, 'missing.md'), '--out', f.after]), /ENOENT|file/, f.after);
    for (const extra of [['--packet'], ['--packet', ''], ['--staged'], ['--enforce'], ['--range', 'HEAD~1..HEAD'], ['--screen', 'RESULT-001'], ['--intent', 'visual-refresh']]) {
      const result = f.cli('workflow-run', [...extra, '--out', f.after]);
      assertError(result, /option|value/, f.after); assertCalls(result, 0, 0);
    }
    const other = fixture(t, authority === 'scoped' ? 'current' : 'scoped');
    assertError(f.cli('workflow-run', ['--packet', other.packet, '--out', f.after]), /unsupported .*work contract/, f.after);
  });
  test(`flow ${authority}: old bundles, input aliases and unrelated output files are preserved`, { skip: process.platform === 'win32' }, (t) => {
    const f = fixture(t, authority), original = fs.readFileSync(f.packet);
    for (const name of ['work-packet.md', 'run-report.md', 'status']) {
      const out = path.join(f.outside, `existing-${name}`);
      fs.mkdirSync(out);
      const file = name === 'status' ? `${out}.md` : path.join(out, name);
      fs.writeFileSync(file, 'preserve me');
      const run = f.cli('workflow-run', ['--packet', f.packet, '--out', out]);
      assertCalls(run, 1, 0); assertError(run, /output already exists/);
      assert.equal(fs.readFileSync(file, 'utf8'), 'preserve me');
      for (const other of [path.join(out, 'work-packet.md'), path.join(out, 'run-report.md'), `${out}.md`].filter(p => p !== file)) assert.equal(fs.existsSync(other), false);
    }
    const aliases = path.join(f.outside, 'aliases'); fs.mkdirSync(aliases);
    fs.symlinkSync(f.before, path.join(aliases, 'linked-directory'), 'dir');
    for (const out of [f.before, path.join(aliases, 'linked-directory')]) {
      const run = f.cli('workflow-run', ['--packet', f.packet, '--out', out]);
      assertCalls(run, 1, 0); assertError(run, /overlaps input packet/);
    }
    for (const alias of ['hardlink', 'symlink']) {
      const out = path.join(f.outside, alias); fs.mkdirSync(out);
      if (alias === 'hardlink') fs.linkSync(f.packet, `${out}.md`);
      else fs.symlinkSync(f.packet, path.join(out, 'run-report.md'));
      assertError(f.cli('workflow-run', ['--packet', f.packet, '--out', out]), /overlaps input packet/);
      assert.equal(fs.existsSync(path.join(out, 'work-packet.md')), false);
    }
    assert.deepEqual(fs.readFileSync(f.packet), original);
    fs.mkdirSync(f.after); fs.writeFileSync(path.join(f.after, 'unrelated.txt'), 'keep');
    assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), 'HALT_READY_FOR_WORK');
    assert.equal(fs.readFileSync(path.join(f.after, 'unrelated.txt'), 'utf8'), 'keep');
    const io = path.join(f.outside, 'file-as-directory'); fs.writeFileSync(io, 'keep');
    assertError(f.cli('workflow-run', ['--packet', f.packet, '--out', io]), /ENOTDIR/);
    assert.equal(fs.readFileSync(io, 'utf8'), 'keep'); assert.equal(fs.existsSync(`${io}.md`), false);
  });
}

for (const authority of ['current', 'scoped']) {
  test(`flow ${authority}: every actual resource selector and monorepo prefix stays bound`, (t) => {
    const f = fixture(t, authority);
    for (const name of ['policy', 'manifest', 'layout']) fs.copyFileSync(path.join(f.root, `.kit/${name}.yaml`), path.join(f.root, `.kit/${name}-copy.yaml`));
    f.put('.kit/ci.yaml', '{}\n');
    fs.cpSync(path.join(f.root, 'docs'), path.join(f.root, 'docs-copy'), { recursive: true });
    fs.cpSync(path.join(f.root, 'src'), path.join(f.root, 'src-copy'), { recursive: true });
    const twin = path.join(f.root, 'apps/twin'); fs.mkdirSync(twin, { recursive: true });
    for (const name of ['docs', 'src', '.kit']) fs.cpSync(path.join(f.root, name), path.join(twin, name), { recursive: true });
    f.commit('alternate selectors');
    f.json(f.cli('workflow-packet', ['--out', f.packet]));
    for (const [flag, value] of [['policy', '.kit/policy-copy.yaml'], ['manifest', '.kit/manifest-copy.yaml'], ['layout', '.kit/layout-copy.yaml'],
      ['docs', 'docs-copy/frontend-workflow'], ['src', 'src-copy'], ['ci', '.kit/ci.yaml'], ['root', twin]]) {
      const failure = f.cli('workflow-run', ['--packet', f.packet, `--${flag}`, value, '--out', f.after]);
      assertCalls(failure, 1, 0); assertError(failure, /project\/resource/, f.after);
    }
    f.json(f.cli('workflow-packet', ['--ci', '.kit/ci.yaml', '--out', f.packet]));
    assertError(f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), /project\/resource/, f.after);
  });
  test(`flow ${authority}: no packet allow fields can lift a denied target`, (t) => {
    const f = fixture(t, authority, 'denied');
    tamper(f.packet, v => { v.ready = true; v.denials = []; v.requests.forEach(r => { r.ready = true; r.path_authorizations.forEach(a => a.allowed = true); }); });
    f.put(f.target, 'export const denied = 1;\n');
    const actual = assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), 'HALT_AMBIGUITY');
    assert.equal(actual.ready, false);
    assert.ok(actual.backstop.violations.some(v => v.code.endsWith('DENIED-TARGET')));
  });
  test(`flow ${authority}: an output I/O race exits 2 and never publishes success`, (t) => {
    const f = fixture(t, authority), original = fs.readFileSync(f.packet);
    const run = f.cli('workflow-run', ['--packet', f.packet, '--out', f.after], { mutation: { mkdir: `${f.after}.md` } });
    assertCalls(run, 1, 1); assertError(run, /EEXIST|EISDIR/);
    assert.deepEqual(fs.readFileSync(f.packet), original);
    assert.ok(fs.existsSync(path.join(f.after, 'work-packet.md')), 'partial output is possible but never stdout success');
  });
  test(`flow ${authority}: raw mode/type and unstaged changes keep standalone backstop evidence`, { skip: process.platform === 'win32' }, (t) => {
    const f = fixture(t, authority);
    f.put(f.target, 'export const staged = 1;\n');
    execFileSync('git', ['add', f.target], { cwd: f.root });
    f.put(f.target, 'export const unstaged = 2;\n');
    fs.chmodSync(path.join(f.root, f.target), 0o755);
    f.put('src/unrequested.ts', 'export const extra = 1;\n');
    const index = fs.readFileSync(path.join(f.root, '.git/index'));
    const actual = assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet, '--out', f.after]), 'DONE_PENDING_REVIEW');
    assert.ok(actual.backstop.violations.some(v => v.code.endsWith('MODE')));
    assert.ok(actual.backstop.violations.some(v => v.code.endsWith('UNREQUESTED')));
    assert.equal(actual.backstop.changed_records.find(r => r.projectPath === f.target).evidence.git_mode, '100755');
    assert.deepEqual(fs.readFileSync(path.join(f.root, '.git/index')), index);
    fs.unlinkSync(path.join(f.root, f.target)); fs.symlinkSync('absent.ts', path.join(f.root, f.target));
    const typed = assertEvidence(f, f.cli('workflow-run', ['--packet', f.packet]), 'DONE_PENDING_REVIEW', { out: false });
    assert.ok(typed.backstop.violations.some(v => /TYPE|UNSUPPORTED-CHANGE/.test(v.code)));
  });
}
