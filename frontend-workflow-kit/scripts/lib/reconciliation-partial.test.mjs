// Issue #232 P01-P13/P18-P20. Real file/parser/validator/CLI fixtures and guidance
// regressions, not evidence that an agent understands scope or resume-note prose.
// P14-P17 reuse the existing Git/CLI helpers in visual-refresh-boundary.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, splitFrontmatter, walkFiles } from './util.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './input-artifact.mjs';
import { parseReconciliationRegister, validateReconciliationRegister, REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { parseReconciliationItems, validateReconciliationV2, REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';

const INPUT = 'IN-20260909-qa-001';
const OWNER = 'demo-domain-rules';
const TARGET = 'domains/demo/domain-rules.md';
const REGISTER = '_meta/reconciliation-register.md';
const INPUT_PATH = `inputs/demo/${INPUT}.md`;
const PARTIAL = 'partially-reconciled';
const PREFIX = 'RR-LIFECYCLE-101:';
const itemLine = (cells) => `| ${cells.join(' | ')} |`;
const firstItem = () => [INPUT, '01', 'compatible-fact', 'simple-update', 'update', `artifact:${OWNER}#notes`, `input:${INPUT}#extracted-facts/03`, 'inherit', 'statement', 'inherit'];
const answerItem = (id, kind, fact) => [INPUT, id, `${kind}-answer`, `resolves-${kind}`, 'link-evidence', `${kind}:${kind === 'unknown' ? 'U' : 'D'}-232@${OWNER}`, `input:${INPUT}#extracted-facts/${fact}`, 'inherit', 'statement', 'inherit'];

function fixture(t, { version = 2, conflict = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciliation-partial-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs/frontend-workflow');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const f = { root, docs, version };
  f.write = (relative, content) => {
    const file = path.join(docs, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  };
  f.read = (relative) => fs.readFileSync(path.join(docs, relative), 'utf8');
  f.write(INPUT_PATH, `---
input_id: ${INPUT}
input_type: qa
source_type: qa
source_ref: fixture://partial/three-axes
captured_at: "2026-09-09T09:00:00+09:00"
captured_by: synthetic-fixture-author
status: captured
affected_domains: [demo]
affected_screens: [DEMO-001]
supersedes: null
---

## Summary

Three independent source facts, handled in more than one round.

## Extracted Facts

- Proposed answer for U-232: use Loading copy.
- ${conflict ? 'New requirement contradicts the resolved D-232 guest-entry choice.' : 'Proposed answer for D-232: preserve guest entry, awaiting human confirmation.'}
- Preserve a source-backed note about the current mobile layout.
`);
  f.write(TARGET, `---
artifact_id: ${OWNER}
artifact_type: domain-rules
domain: demo
status: draft
last_reviewed: "2026-09-09"
---

## Unknowns

| ID | Question | Status |
|---|---|---|
| U-232 | Loading copy? | open |

## Open Decisions

| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-232 | Guest entry | Preserve guest entry / require login | final-fixture-ui | PM | ${conflict ? 'resolved' : 'open'} |

## Notes

Original note.
`);
  f.inputBytes = f.read(INPUT_PATH);
  setRegister(f, { status: 'in-progress', items: [], classification: '-', touched: '-', notes: '' });
  return f;
}

function resumeNotes(pending = ['01', '02']) {
  const pointers = (Array.isArray(pending) ? pending : [pending]).map((id) => `input:${INPUT}#extracted-facts/${id}`).join('; ');
  return `\n## Partial Reconciliation Notes\n\n### ${INPUT}\n\n- 처리: source /03, 누적 Item 01, ${OWNER} Notes.\n- 미처리: ${pointers}.\n- 이유: 이번 회차 범위 분리.\n- 재개: immutable input과 누적 Items를 대조하고 같은 행을 in-progress로 이동한다.\n- 담당/연결 작업: 미정.\n`;
}

function setRegister(f, options = {}) {
  const { status = PARTIAL, result = 'pending', items = [firstItem()], classification = 'simple-update',
    touched = `artifact:${OWNER}`, created = '-', notes = resumeNotes(), summaries } = options;
  f.summaryLine = itemLine([INPUT, 'qa', classification, status, result, touched, created, '-']);
  const fm = f.version === 2 ? 'reconciliation_contract: 2\nreview_profile: reconcile-stage04-v1\nstructured_since: "2026-09-01T00:00:00+09:00"\n' : '';
  const details = f.version === 2 ? `\n## Reconciliation Items\n\n${itemLine(REQUIRED_ITEM_COLS)}\n|---|---|---|---|---|---|---|---|---|---|\n${items.map(itemLine).join('\n')}\n` : '';
  f.write(REGISTER, `---\ntitle: Reconciliation Register\nstatus: draft\nkind: meta-register\n${fm}---\n\n# Reconciliation Register\n\n${itemLine(REQUIRED_REGISTER_COLS)}\n|---|---|---|---|---|---|---|---|\n${(summaries ?? [f.summaryLine]).join('\n')}\n${details}${notes}`);
}

function firstCheckpoint(f) {
  f.write(TARGET, f.read(TARGET).replace('Original note.', `Original note.\n\nSource-backed mobile layout note (input:${INPUT}#extracted-facts/03).`));
  setRegister(f);
}

function check(f, enforce = false) {
  const registerFile = path.join(f.docs, REGISTER);
  const register = parseReconciliationRegister(registerFile);
  const inputArtifacts = collectInputArtifacts(path.join(f.docs, 'inputs'));
  const docs = walkFiles(f.docs, ['.md']).filter((file) => {
    const relative = path.relative(f.docs, file).split(path.sep).join('/');
    return !relative.startsWith('inputs/') && !relative.startsWith('_meta/');
  }).map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data }));
  const lifecycle = validateReconciliationRegister({ register, registerFile, inputArtifacts, enforce });
  const v2 = validateReconciliationV2({ register, registerFile, inputArtifacts, targetIndex: buildReconciliationTargetIndex({ docs }) });
  const inputs = validateInputArtifacts(inputArtifacts);
  return { register, items: parseReconciliationItems(register.body).rows, inputArtifacts,
    errors: [...inputs.errors, ...lifecycle.errors, ...v2.errors], warnings: [...lifecycle.warnings, ...v2.warnings] };
}

function assertCheckpoint(f, enforce = false) {
  const result = check(f, enforce);
  assert.deepEqual(result.errors, []);
  const warnings = result.warnings.filter((entry) => entry.message.startsWith(PREFIX));
  assert.equal(warnings.length, 1);
  assert.deepEqual(Object.keys(warnings[0]).sort(), ['file', 'message']);
  assert.ok(path.isAbsolute(warnings[0].file));
  for (const token of [INPUT, 'Partial Reconciliation Notes', '같은 행', 'in-progress', 'input_id/supersedes']) assert.ok(warnings[0].message.includes(token), token);
  return result;
}

for (const version of [1, 2]) {
  for (const enforce of [false, true]) {
    test(`P0${version === 1 ? (enforce ? 2 : 1) : (enforce ? 4 : 3)}: v${version} partial stays advisory (enforce=${enforce}) including real CLI JSON/exit`, (t) => {
      const f = fixture(t, { version });
      firstCheckpoint(f);
      const pure = assertCheckpoint(f, enforce);
      assert.equal(pure.warnings.length, 1);
      const run = spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts/validate.mjs'), '--root', f.root,
        '--docs', f.docs, '--src', path.join(f.root, 'src'), '--json', ...(enforce ? ['--enforce'] : [])],
      { cwd: KIT_ROOT, encoding: 'utf8', timeout: 30_000 });
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const json = JSON.parse(run.stdout);
      assert.deepEqual(Object.keys(json).sort(), ['count', 'errors', 'ok', 'warnings']);
      assert.equal(json.ok, true);
      assert.equal(json.count, 0);
      const warnings = json.warnings.filter((entry) => entry.message.startsWith(PREFIX));
      assert.equal(warnings.length, 1);
      assert.deepEqual(Object.keys(warnings[0]).sort(), ['check', 'file', 'message']);
      assert.equal(warnings[0].check, 12);
      assert.equal(warnings[0].message, pure.warnings[0].message);
      assert.equal(path.isAbsolute(warnings[0].file), false);
    });
  }
}

// The positive fixture must satisfy the existing input contract. An empty scope
// is deliberately invalid, not a partial-checkpoint exemption (CI regression).
for (const version of [1, 2]) {
  test(`P05/P06: v${version} partial retains the empty affected_screens hard error in validator and CLI`, (t) => {
    const f = fixture(t, { version });
    firstCheckpoint(f);
    assertCheckpoint(f, true);
    const invalid = f.inputBytes.replace('affected_screens: [DEMO-001]', 'affected_screens: []');
    assert.notEqual(invalid, f.inputBytes);
    f.write(INPUT_PATH, invalid);
    const message = '필수 frontmatter 누락: affected_screens (정본 입력 스키마)';
    for (const enforce of [false, true]) {
      const result = check(f, enforce);
      assert.deepEqual(result.errors.map((entry) => entry.message), [message]);
      assert.equal(result.warnings.filter((entry) => entry.message.startsWith(PREFIX)).length, 1);
      const run = spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts/validate.mjs'), '--root', f.root,
        '--docs', f.docs, '--src', path.join(f.root, 'src'), '--json', ...(enforce ? ['--enforce'] : [])],
      { cwd: KIT_ROOT, encoding: 'utf8', timeout: 30_000 });
      assert.equal(run.status, 1, run.stderr || run.stdout);
      const json = JSON.parse(run.stdout);
      assert.equal(json.ok, false);
      assert.ok(json.errors.some((entry) => entry.check === 11 && entry.message === message));
      assert.equal(json.warnings.filter((entry) => entry.check === 12 && entry.message.startsWith(PREFIX)).length, 1);
    }
  });
}

const hardMutations = [
  ['Target', (s) => s.replace(`artifact:${OWNER}#notes`, 'artifact:missing#notes'), 'RR-REF-006:'],
  ['Evidence', (s) => s.replace(`#extracted-facts/03 |`, '#missing/03 |'), 'RR-REF-005:'],
  ['required cell', (s) => s.replace('| inherit | statement | inherit |', '|  | statement | inherit |'), 'RR-SCHEMA-009:'],
  ['Classification projection', (s) => s.replace('| simple-update | partially-reconciled |', '| simple-update×2 | partially-reconciled |'), 'RR-ITEM-005:'],
  ['Touched projection', (s) => s.replace(`| artifact:${OWNER} | - | - |`, '| - | - | - |'), 'RR-ITEM-007:'],
  ['Created projection', (s) => s.replace(`| artifact:${OWNER} | - | - |`, `| artifact:${OWNER} | unknown:U-232@${OWNER} | - |`), 'RR-ITEM-006:'],
  ['timestamp provenance', (s) => s.replace('| statement | inherit |', '| statement | yesterday |'), 'RP-002:'],
  ['source unit provenance', (s) => s.replace('| statement | inherit |', '| invented | inherit |'), 'RP-001:'],
  ['duplicate effect', (s) => s.replace(itemLine(firstItem()), `${itemLine(firstItem())}\n${itemLine(firstItem())}`), 'RR-ITEM-004:'],
  ['structured item required', (s) => s.replace(itemLine(firstItem()), ''), 'RR-ITEM-001:'],
];
for (const [label, mutate, prefix] of hardMutations) {
  test(`P05: partial does not exempt ${label}`, (t) => {
    const f = fixture(t);
    firstCheckpoint(f);
    assertCheckpoint(f);
    const before = f.read(REGISTER);
    const after = mutate(before);
    assert.notEqual(after, before, `${label}: mutation must change the fixture before checking its diagnostic`);
    f.write(REGISTER, after);
    for (const enforce of [false, true]) {
      const result = check(f, enforce);
      assert.ok(result.errors.some((entry) => entry.message.startsWith(prefix)), JSON.stringify(result.errors));
      assert.ok(result.warnings.some((entry) => entry.message.startsWith(PREFIX)));
    }
  });
}

test('P05/P06: malformed or duplicated inputs and inherited provenance still fail', (t) => {
  const f = fixture(t);
  firstCheckpoint(f);
  f.write(INPUT_PATH, f.inputBytes.replace('source_ref: fixture://partial/three-axes\n', ''));
  assert.ok(check(f).errors.some((entry) => entry.message.startsWith('RP-003:')));
  f.write(INPUT_PATH, f.inputBytes);
  f.write(`inputs/duplicate/${INPUT}.md`, f.inputBytes);
  assert.ok(check(f).errors.some((entry) => /중복/.test(entry.message)));
  fs.unlinkSync(path.join(f.docs, `inputs/duplicate/${INPUT}.md`));
  f.write(INPUT_PATH, f.inputBytes.replace('input_type: qa', 'input_type: [broken'));
  assert.ok(check(f).errors.length > 0);
});

for (const [label, mutate, expected] of [
  ['YAML', (s) => s.replace('reconciliation_contract: 2', 'reconciliation_contract: [broken'), /frontmatter/],
  ['header', (s) => s.replace('| Reconcile Status |', '| Unexpected Status |'), /필수 컬럼|RR-SCHEMA-019/],
  ['duplicate Summary', (s, f) => s.replace(f.summaryLine, `${f.summaryLine}\n${f.summaryLine}`), /Input ID 중복/],
  ['invalid enum', (s) => s.replaceAll(PARTIAL, 'almost-reconciled'), /Reconcile Status enum/],
]) {
  test(`P06: partial cannot hide ${label}`, (t) => {
    const f = fixture(t);
    firstCheckpoint(f);
    f.write(REGISTER, mutate(f.read(REGISTER), f));
    for (const enforce of [false, true]) assert.ok(check(f, enforce).errors.some((entry) => expected.test(entry.message)));
  });
}

for (const version of [1, 2]) {
  for (const status of ['in-progress', 'failed', 'not-started', 'missing-row']) {
    test(`P07/P08: v${version} ${status} keeps its existing default/enforce severity`, (t) => {
      const f = fixture(t, { version });
      firstCheckpoint(f);
      setRegister(f, status === 'missing-row' ? { summaries: [], items: [] } : { status, result: status === 'failed' ? 'failed' : 'pending' });
      for (const enforce of [false, true]) {
        const result = check(f, enforce);
        const hard = enforce || ['in-progress', 'failed'].includes(status);
        assert.equal(result.errors.length > 0, hard, JSON.stringify(result));
        const findings = hard ? result.errors : result.warnings;
        assert.ok(findings.some((entry) => entry.message.includes(status === 'missing-row' ? 'register 에 행 없음' : `Reconcile Status=${status}`)));
        assert.equal(result.warnings.some((entry) => entry.message.startsWith(PREFIX)), false);
      }
    });
  }
}

test('P09/P10: two actual rounds keep one immutable input/summary and accumulate effects; open children are reconciled', (t) => {
  const f = fixture(t);
  assert.ok(check(f).errors.some((entry) => entry.message.includes('Reconcile Status=in-progress')));
  firstCheckpoint(f);
  const first = assertCheckpoint(f);
  const firstBytes = itemLine(firstItem());
  setRegister(f, { status: 'in-progress' });
  assert.ok(check(f).errors.some((entry) => entry.message.includes('Reconcile Status=in-progress')));
  f.write(TARGET, f.read(TARGET).replace('Loading copy?', `Loading copy? Proposed: Loading; input:${INPUT}#extracted-facts/01`).replace('Guest entry |', `Guest entry (proposed answer: preserve; input:${INPUT}#extracted-facts/02) |`));
  setRegister(f, { status: 'reconciled', result: 'pending-user-decision',
    items: [firstItem(), answerItem('02', 'unknown', '01'), answerItem('03', 'decision', '02')],
    classification: 'simple-update + resolves-unknown + resolves-decision',
    created: `unknown:U-232@${OWNER}; decision:D-232@${OWNER}`,
    notes: '\n## Partial Reconciliation Notes\n\n### ' + INPUT + '\n\n현재 미처리 범위: 없음. 이전 checkpoint는 역사 기록이며 사람 결정은 아직 open.\n' });
  const completed = check(f, true);
  assert.deepEqual(completed.errors, []);
  assert.equal(completed.warnings.some((entry) => entry.message.startsWith(PREFIX)), false);
  assert.equal(completed.register.rows.length, 1);
  assert.equal(completed.register.rows[0].reconcileStatus, 'reconciled');
  assert.equal(completed.register.rows[0].supersedes, '-');
  assert.deepEqual(completed.items.slice(0, 1), first.items);
  assert.deepEqual(completed.items.map((row) => row.item), ['01', '02', '03']);
  assert.equal(f.read(REGISTER).split(firstBytes).length - 1, 1);
  assert.equal(completed.inputArtifacts.length, 1);
  assert.equal(f.read(INPUT_PATH), f.inputBytes);
  assert.match(f.read(TARGET), /U-232.*\| open \|/);
  assert.match(f.read(TARGET), /D-232.*\| open \|/);
});

test('P11: another partial checkpoint preserves old effects/IDs and rejects last-round-only projection', (t) => {
  const f = fixture(t);
  firstCheckpoint(f);
  const first = assertCheckpoint(f);
  setRegister(f, { status: 'in-progress' });
  f.write(TARGET, f.read(TARGET).replace('Loading copy?', `Loading copy? Proposed: Loading; input:${INPUT}#extracted-facts/01`));
  const options = { items: [firstItem(), answerItem('02', 'unknown', '01')],
    classification: 'simple-update + resolves-unknown', created: `unknown:U-232@${OWNER}`,
    notes: resumeNotes('02') + '- 추가 처리: /01, Item 02, 원래 open U-232에 answer evidence만 연결.\n' };
  setRegister(f, options);
  const second = assertCheckpoint(f, true);
  assert.equal(second.register.rows.length, 1);
  assert.deepEqual(second.items.slice(0, 1), first.items);
  assert.deepEqual(second.items.map((row) => row.item), ['01', '02']);
  assert.equal(f.read(INPUT_PATH), f.inputBytes);
  setRegister(f, { ...options, classification: 'resolves-unknown' });
  assert.ok(check(f).errors.some((entry) => entry.message.startsWith('RR-ITEM-005:')));
  setRegister(f, options);
  assertCheckpoint(f);
});

test('P12: a conflict/reopen pair cannot be divided into normal checkpoints or different Item IDs', (t) => {
  const f = fixture(t, { conflict: true });
  firstCheckpoint(f);
  assertCheckpoint(f);
  setRegister(f, { status: 'in-progress' });
  f.write('global/conflicts.md', '---\nartifact_id: conflicts\nartifact_type: conflicts\nstatus: draft\n---\n\n## Conflicts\n\n| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |\n|---|---|---|---|---|---|\n| C-232 | Guest entry | Prior D-232: preserve guest entry | New requirement: require login | - | open |\n');
  const conflict = [INPUT, '02', 'resolved-decision-conflict', 'conflict', 'create-open', 'conflict:C-232@conflicts', `input:${INPUT}#extracted-facts/02`, 'inherit', 'statement', 'inherit'];
  const reopen = [...conflict]; reopen[4] = 'reopen'; reopen[5] = `decision:D-232@${OWNER}`;
  const options = { items: [firstItem(), conflict], classification: 'simple-update + conflict', touched: `artifact:${OWNER}; artifact:conflicts`, created: 'conflict:C-232@conflicts', notes: resumeNotes('01') + '- 이번 회차 /02 충돌은 같은 Item 02의 create-open + reopen을 모두 마쳐야 한다.\n' };
  setRegister(f, options);
  for (const enforce of [false, true]) assert.ok(check(f, enforce).errors.some((entry) => entry.message.startsWith('RR-ROUTE-003:')));
  const split = [...reopen]; split[1] = '03';
  setRegister(f, { ...options, items: [firstItem(), conflict, split], classification: 'simple-update + conflict×2', created: `conflict:C-232@conflicts; decision:D-232@${OWNER}` });
  assert.ok(check(f, true).errors.some((entry) => entry.message.startsWith('RR-ROUTE-003:')));
  // Repair the rejected round atomically; a later valid snapshot does not make
  // the earlier missing-pair checkpoint a valid completion.
  f.write(TARGET, f.read(TARGET).replace('| PM | resolved |', '| PM | open |'));
  setRegister(f, { ...options, items: [firstItem(), conflict, reopen], created: `conflict:C-232@conflicts; decision:D-232@${OWNER}` });
  assertCheckpoint(f, true);
  assert.equal(f.read(INPUT_PATH), f.inputBytes);
});

test('P13: partial + accepted keeps lifecycle and v2 Result warnings; v1 Result stays free text', (t) => {
  const f = fixture(t);
  firstCheckpoint(f);
  setRegister(f, { result: 'accepted' });
  for (const enforce of [false, true]) {
    const result = assertCheckpoint(f, enforce);
    assert.ok(result.warnings.some((entry) => entry.message.startsWith('RR-SCHEMA-103:')));
  }
  f.version = 1;
  setRegister(f, { result: '회차 종료, 원본의 다른 범위는 후속 처리' });
  assert.equal(assertCheckpoint(f, true).warnings.length, 1);
});

test('P18: pre-structured_since legacy and existing v1 corpus do not gain new unrelated warnings', (t) => {
  const f = fixture(t);
  f.write(INPUT_PATH, f.inputBytes.replace('2026-09-09T09:00:00+09:00', '2026-08-01T09:00:00+09:00'));
  for (const status of ['reconciled', PARTIAL]) {
    setRegister(f, { status, result: 'legacy prose', items: [], classification: 'legacy prose', touched: 'old free text', created: 'D-232 (open)' });
    const result = check(f, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.warnings.length, status === PARTIAL ? 1 : 0);
  }
  let checked = 0;
  for (const file of walkFiles(path.join(KIT_ROOT, 'examples'), ['.md']).filter((file) => path.basename(file) === 'reconciliation-register.md')) {
    const register = parseReconciliationRegister(file);
    if (register.fm.reconciliation_contract != null || register.rows.some((row) => row.reconcileStatus === PARTIAL)) continue;
    const result = validateReconciliationRegister({ register, registerFile: file });
    assert.equal(result.warnings.some((entry) => entry.message.startsWith(PREFIX)), false, file);
    checked++;
  }
  assert.ok(checked > 0, 'existing v1 corpus must actually be visited');
});

test('P20: missing prose Notes remains reviewer-rejected, not a new natural-language parser gate', (t) => {
  const f = fixture(t);
  firstCheckpoint(f);
  setRegister(f, { notes: '' });
  assertCheckpoint(f, true);
  assert.equal(f.read(REGISTER).includes('## Partial Reconciliation Notes'), false);
  // The README/rubric require reviewer rejection. This structural pass is NOT
  // evidence that missing notes, unknown scope or repeated work is acceptable.
});

test('partial regression is explicitly included in both test scripts', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
  for (const name of ['test', 'test:spec']) assert.equal(scripts[name].split('scripts/lib/reconciliation-partial.test.mjs').length - 1, 1);
});

// P19 deliberately tests the shipped authoring instructions, NOT input/Notes
// semantics. No production prose parser or new input coverage gate is added.
const GUIDE_PATHS = {
  skill: 'skills/reconcile-input/SKILL.md',
  local: '../.claude/skills/reconcile-input/SKILL.md',
  stage: 'docs/reference/workflow-stages/04-reconcile-input.md',
  reference: 'docs/reference/input-reconciliation.md',
  rubric: 'docs/reference/reconcile-review-rubric.md',
  template: 'templates/meta/reconciliation-register.template.md',
  upgrade: 'docs/reference/upgrade-notes.md',
};
const readGuide = (name) => fs.readFileSync(path.resolve(KIT_ROOT, GUIDE_PATHS[name]), 'utf8');

function guideSection(text, heading) {
  const marker = `\n## ${heading}\n`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing guide section: ${heading}`);
  const bodyStart = start + marker.length;
  const end = text.indexOf('\n## ', bodyStart);
  return text.slice(bodyStart, end < 0 ? undefined : end);
}

test('P19: all seven authoring surfaces describe partial state, Notes, resume, Result and severity', () => {
  for (const name of Object.keys(GUIDE_PATHS)) {
    const text = readGuide(name);
    for (const token of [PARTIAL, 'Partial Reconciliation Notes', 'in-progress', 'reconciled', 'pending', 'RR-LIFECYCLE-101', '--enforce']) {
      assert.ok(text.includes(token), `${name}: missing ${token}`);
    }
  }
});

test('P19: runtime severity matrix and every repeated procedure preserve the checkpoint/full completion fork', () => {
  const text = readGuide('reference');
  const matrix = guideSection(text, 'Partial Reconciliation Checkpoints');
  const expected = new Map([
    ['행 없음', ['warning', 'error']], ['not-started', ['warning', 'error']],
    ['in-progress', ['error', 'error']], ['failed', ['error', 'error']],
    [PARTIAL, ['warning', 'warning']], ['reconciled', ['정상', '정상']],
  ]);
  for (const line of matrix.split('\n').filter((line) => line.startsWith('| '))) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''));
    if (!expected.has(cells[0])) continue;
    assert.deepEqual(cells.slice(1, 3), expected.get(cells[0]), cells[0]);
    expected.delete(cells[0]);
  }
  assert.equal(expected.size, 0, 'every lifecycle row is documented');
  for (const heading of ['Reconciliation Flow', 'Code Change Gate', 'Skill Shape', 'Consumer Summary']) {
    const section = guideSection(text, heading);
    for (const token of [PARTIAL, 'in-progress', 'reconciled']) assert.ok(section.includes(token), `${heading}: ${token}`);
    assert.match(section, /누적|cumulative/i, heading);
    assert.match(section, /미처리|incomplete|unhandled/i, heading);
  }
});

test('P19: both skills and Stage 04 keep an actionable same-row resume and normal completed stop', () => {
  for (const name of ['skill', 'local', 'stage']) {
    const text = readGuide(name);
    const resume = text.split('\n').find((line) => line.includes('`partially-reconciled`') && /in-progress/.test(line));
    assert.ok(resume, `${name}: partial resume branch`);
    for (const pattern of [/immutable input/, /누적 Items|cumulative Items/, /Partial Reconciliation Notes/, /같은 Summary 행|same Summary row/]) {
      assert.match(resume, pattern, name);
    }
    const stop = text.split('\n').find((line) => line.includes('`reconciled`') && /멈춘다|\*\*Stop/.test(line));
    assert.ok(stop, `${name}: ordinary reconciled retry still stops`);
    assert.match(text, /reconciled \+ accepted/);
    assert.match(text, /single-item/);
    assert.match(text, /VR-RR-005/);
    assert.match(text, /입력 전체 미완료|whole input incomplete/);
  }
});

test('P19: checkpoint links resolve to canonical protocol while deployed router stays at most 120 raw lines', () => {
  const canonical = path.resolve(KIT_ROOT, GUIDE_PATHS.reference);
  for (const name of ['skill', 'local', 'stage', 'rubric', 'upgrade']) {
    const file = path.resolve(KIT_ROOT, GUIDE_PATHS[name]);
    const text = readGuide(name);
    const links = [...text.matchAll(/\]\(([^)]+)#partial-reconciliation-checkpoints\)/g)];
    assert.ok(links.length > 0, `${name}: link to the canonical checkpoint protocol`);
    for (const match of links) assert.equal(path.resolve(path.dirname(file), match[1]), canonical);
  }
  assert.ok(readGuide('skill').split('\n').length <= 120, 'existing raw router ceiling must not be raised');
  assert.match(readGuide('upgrade'), /^## Partial Reconciliation Checkpoints \(#232\)$/m);
  // Preserve the existing #231 discovery route, not just partial prose.
  for (const name of ['skill', 'local', 'stage', 'rubric']) {
    const text = readGuide(name);
    for (const token of ['Unknowns', 'Open Decisions', 'decision_refs', '#decision-aware-preclassification']) {
      assert.ok(text.includes(token), `${name}: decision-aware ${token}`);
    }
  }
});

test('P19/P20: unchanged 8/10-column template places actionable Notes after Items and reviewer rejects prose counterexamples', () => {
  const template = readGuide('template');
  const headers = template.split('\n').filter((line) => line.startsWith('| Input ID |'));
  assert.deepEqual(headers, [itemLine(REQUIRED_REGISTER_COLS), itemLine(REQUIRED_ITEM_COLS)]);
  const itemSection = template.indexOf('\n## Reconciliation Items\n');
  const notesSection = template.indexOf('\n## Partial Reconciliation Notes\n');
  assert.ok(itemSection >= 0 && notesSection > itemSection);
  const notes = guideSection(template, 'Partial Reconciliation Notes');
  assert.match(notes, /^### \{input_id\}$/m);
  for (const label of ['처리', '미처리', '이유', '재개', '담당/연결 작업']) {
    assert.ok(notes.includes(`- ${label}:`), `resume note field ${label}`);
  }
  for (const name of ['reference', 'rubric']) {
    const text = readGuide(name);
    assert.match(text, /자연어 parser|새 parser/);
    assert.match(text, /완료 effect 재수행|완료 effect를/);
  }
  const rubric = readGuide('rubric');
  for (const id of ['P20-a:', 'P20-b:', 'P20-c:']) {
    const row = rubric.split('\n').find((line) => line.includes(id));
    assert.ok(row, id);
    assert.match(row, /Major \/ CHANGES_REQUIRED/, id);
  }
  assert.match(rubric, /hard errors 0/);
  assert.match(rubric, /Critical\/Major 0/);
  assert.match(rubric, /gate-lowering diff 0/);
  assert.match(readGuide('upgrade'), /Upgrade the runtime first/);
  assert.match(readGuide('upgrade'), /explicit maintenance\/human confirmation/);
});
