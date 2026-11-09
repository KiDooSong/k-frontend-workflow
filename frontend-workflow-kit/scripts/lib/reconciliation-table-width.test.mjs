// #244: real register/parser/CLI observations, including GFM's discarded extra cells.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, splitFrontmatter, walkFiles } from './util.mjs';
import { collectInputArtifacts } from './input-artifact.mjs';
import { parseReconciliationRegister, validateReconciliationRegister, REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { parseReconciliationItems, validateReconciliationV2 } from './reconciliation-items.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { splitRow } from './spec.mjs';

const PREFIX = 'RR-TABLE-101:';
const INPUT = 'IN-20260720-figma-001';
const row = (cells) => `| ${cells.join(' | ')} |`;
const header = row(REQUIRED_REGISTER_COLS) + '\n|---|---|---|---|---|---|---|---|\n';
const validRow = (id = 'IN-20260101-api-001', result = '결과') => row([id, 'api-doc', 'simple-update', 'reconciled', result, '[manifest](../api/api-manifest.md)', '-', '-']);
const brokenRows = [
  '| IN-20260101-api-001 | api-doc(스냅샷) | simple-update | reconciled | 대역 `6200-6299 | 409 | conflict` 를 확인했다 | [manifest](../api/api-manifest.md) | - | IN-20251231-api-009 |',
  '| IN-20260101-api-002 | api-doc(스냅샷) | simple-update | reconciled | 결과 | [a](./a.md) | [b](./b.md) | - | IN-20251231-api-008 |',
  '| IN-20260101-figma-001 | figma(spec) | simple-update | reconciled | 결과 | [c](./c.md) | - | - || IN-20260101-figma-002 | figma(spec) | simple-update | reconciled | 결과 | [d](./d.md) | - | - |',
];

// A complete v2 register and its input/target documents. Keep the fixture local
// so the packed suite does not depend on the development-only examples directory.
const V2_FIXTURE_FILES = {
  '_meta/reconciliation-register.md': `---
title: Reconciliation Register (reconciliation-validation / v2-pass)
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "2026-07-20T00:00:00+09:00"
---

# Reconciliation Register — v2-pass fixture (Check 12 / Contract v2)

> Contract v2 opt-in PASS 픽스처. summary Classification multiset ↔ item 개수, typed Touched/Created ref,
> resolved-decision-conflict 의 \`conflict create-open + decision reopen\` 페어, evidence section pointer,
> \`inherit\` provenance 가 전부 해소되어 에러·경고 0 (exit 0) 이어야 한다.
> HEADLINE GUARD 는 v1 과 동일: 자식 C-001/D-204 가 open 이어도 \`reconciled\` 는 통과한다.

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | figma | simple-update + component-gap | reconciled | accepted | artifact:COUPON-001-figma-component-mapping; artifact:component-gap-register | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001; gap:G-001@component-gap-register | - |
| IN-20260720-meeting-001 | meeting | conflict | reconciled | pending-user-decision | artifact:conflicts; artifact:open-decision-register | conflict:C-001@conflicts; decision:D-204@open-decision-register | - |

## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | 01 | visual-evidence | simple-update | create | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001 | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | instance | inherit |
| IN-20260720-figma-001 | 02 | component-missing | component-gap | create-open | gap:G-001@component-gap-register | input:IN-20260720-figma-001#extracted-facts/02 | figma://file/abc/node/1:235 | instance | inherit |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | create-open | conflict:C-001@conflicts | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | reopen | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |
`,
  'domains/coupons/screens/coupon-list/figma-component-mapping.md': `---
artifact_id: "COUPON-001-figma-component-mapping"
artifact_type: figma-component-mapping
domain: "coupons"
screen_id: "COUPON-001"
status: draft
sources:
  - { type: figma, ref: "figma://file/abc" }
last_reviewed: "2026-07-20"
---

# Figma Component Mapping

## Frame
- figma://file/abc

## Component Mapping
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| \`M-001\` · frame / node \`1:234\` | Primary CTA | components/ui/Button | variant=primary |

## Notes
- 시각 매핑.
`,
  'global/component-gap-register.md': `---
artifact_id: component-gap-register
artifact_type: component-gap-register
status: draft
last_reviewed: "2026-07-20"
---

# Component Gap Register

| ID | 제안 컴포넌트 | 필요한 화면 | 기존 카탈로그로 안 되는 이유 | Status |
|---|---|---|---|---|
| G-001 | SegmentedTabs | COUPON-001 | 상태 탭 분리 표현 불가 | open |
`,
  'global/conflicts.md': `---
artifact_id: conflicts
artifact_type: conflicts
status: draft
last_reviewed: "2026-07-20"
---

# Conflicts

| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |
|---|---|---|---|---|---|
| C-001 | 로그인 리다이렉트 | IN-20260720-meeting-001 / returnTo 우선 | D-204 / 항상 홈 | AUTH-001 | open |
`,
  'global/open-decisions.md': `---
artifact_id: open-decision-register
artifact_type: open-decision-register
status: draft
---

# Cross-Screen Open Decisions

## Open Decisions

| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |
`,
  'inputs/IN-20260720-figma-001.md': `---
input_id: "IN-20260720-figma-001"
input_type: "figma"
source_type: "figma"
source_ref: "figma://file/abc"
captured_at: "2026-07-20T10:00:00+09:00"
captured_by: "figma-input-skill"
status: "captured"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
---

## Summary
쿠폰 목록 시각 갱신.

## Extracted Facts
- Primary CTA instance 확인 (node 1:234)
- SegmentedTabs 컴포넌트가 카탈로그에 없음 (node 1:235)
`,
  'inputs/IN-20260720-meeting-001.md': `---
input_id: "IN-20260720-meeting-001"
input_type: "meeting"
source_type: "meeting"
source_ref: "meetings/2026-07-20.md"
captured_at: "2026-07-20T11:00:00+09:00"
captured_by: "meeting-note-input-skill"
status: "captured"
affected_domains: ["auth"]
affected_screens: ["AUTH-001"]
---

## Summary
로그인 리다이렉트 재논의.

## Extracted Facts
- returnTo 우선 정책 요구 (기존 D-204 resolved 와 충돌)
`,
};

function fixture(t, version = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciliation-table-width-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs/frontend-workflow');
  const file = path.join(docs, '_meta/reconciliation-register.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  if (version === 2) {
    for (const [relative, content] of Object.entries(V2_FIXTURE_FILES)) {
      const target = path.join(docs, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }
  const read = () => fs.readFileSync(file, 'utf8');
  const write = (text) => fs.writeFileSync(file, text);
  if (version === 1) write(header + validRow() + '\n');
  return { root, docs, file, read, write };
}

function check(f, enforce = false) {
  const register = parseReconciliationRegister(f.file);
  const inputArtifacts = collectInputArtifacts(path.join(f.docs, 'inputs'));
  const documents = walkFiles(f.docs, ['.md']).filter((file) => {
    const relative = path.relative(f.docs, file).split(path.sep).join('/');
    return !relative.startsWith('inputs/') && !relative.startsWith('_meta/');
  }).map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data }));
  const before = JSON.stringify(register);
  const common = validateReconciliationRegister({ register, registerFile: f.file, inputArtifacts, enforce });
  const v2 = validateReconciliationV2({ register, registerFile: f.file, inputArtifacts,
    targetIndex: buildReconciliationTargetIndex({ docs: documents }) });
  assert.equal(JSON.stringify(register), before, 'diagnostics must not repair or mutate parsed authority');
  return { register, errors: [...common.errors, ...v2.errors], warnings: [...common.warnings, ...v2.warnings] };
}

function widthWarnings(result) { return result.warnings.filter(({ message }) => message.startsWith(PREFIX)); }
function assertWidth(warning, { expected, actual, ordinal, id, table, item }) {
  assert.ok(warning, 'missing row-width warning');
  assert.ok(warning.message.includes(`기대 ${expected}, 실제 ${actual}`), warning.message);
  assert.ok(warning.message.includes(`데이터 행 ${ordinal}`), warning.message);
  for (const token of [id, table, ...(item ? [item] : [])]) assert.ok(warning.message.includes(token), warning.message);
  assert.deepEqual(Object.keys(warning).sort(), ['file', 'message']);
}

function cli(f, enforce = false) {
  const run = spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts/validate.mjs'), '--root', f.root,
    '--docs', f.docs, '--src', path.join(f.root, 'src'), '--json', ...(enforce ? ['--enforce'] : [])],
  { cwd: KIT_ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

test('v1 warns on unescaped code pipes, an extra separator and fused rows without changing parsed fields', (t) => {
  const f = fixture(t);
  f.write(header + brokenRows.join('\n') + '\n');
  const bytes = f.read();
  const result = check(f);
  assert.deepEqual(result.errors, []);
  const warnings = widthWarnings(result);
  assert.equal(warnings.length, 3);
  [10, 9, 17].forEach((actual, index) => assertWidth(warnings[index], {
    expected: 8, actual, ordinal: index + 1,
    id: ['IN-20260101-api-001', 'IN-20260101-api-002', 'IN-20260101-figma-001'][index], table: 'Summary',
  }));
  assert.equal(result.register.rows[0].supersedes, '[manifest](../api/api-manifest.md)', 'report the damage; never silently repair it');
  assert.equal(f.read(), bytes);
});

for (const enforce of [false, true]) {
  test(`v1 CLI reports all three damage types as check 12 warnings, enforce=${enforce}`, (t) => {
    const f = fixture(t);
    f.write(header + brokenRows.join('\n') + '\n');
    const pure = check(f, enforce);
    const result = cli(f, enforce);
    assert.deepEqual(Object.keys(result).sort(), ['count', 'errors', 'ok', 'warnings']);
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
    assert.deepEqual(result.errors, []);
    const warnings = widthWarnings(result);
    assert.equal(warnings.length, 3);
    assert.deepEqual(warnings.map(({ message }) => message), widthWarnings(pure).map(({ message }) => message));
    for (const warning of warnings) {
      assert.equal(warning.check, 12);
      assert.deepEqual(Object.keys(warning).sort(), ['check', 'file', 'message']);
      assert.equal(path.isAbsolute(warning.file), false);
    }
  });
}

test('v1 warns on missing trailing cells and retains existing lifecycle errors', (t) => {
  const f = fixture(t);
  f.write(header + '| IN-20260101-api-001 | api-doc | simple-update | failed | 結果 | - | - |\n');
  const result = check(f, true);
  assertWidth(widthWarnings(result)[0], { expected: 8, actual: 7, ordinal: 1, id: 'IN-20260101-api-001', table: 'Summary' });
  assert.ok(result.errors.some(({ message }) => message.includes('Reconcile Status=failed')));
});

test('v1 preserves escaped pipes, comments, empty cells and unrelated tables', (t) => {
  const f = fixture(t);
  const good = [
    validRow('IN-20260101-api-001', '`A \\| null` and `left \\|\\| right`'),
    row(['IN-20260101-api-002', 'api', 'simple-update', 'reconciled', '결과<!-- ignored | | -->', '', '', 'tail \\|']),
    row(['IN-20260101-api-003', 'api', 'simple-update', 'reconciled', '결과', '', '', '']),
  ];
  f.write(header + good.join('\n') + '\n\n## Notes\n| Note |\n|---|\n| one | extra |\n\n## Reconciliation Items\n| Input ID | Item |\n|---|---|\n| ignored | 01 | extra |\n');
  assert.deepEqual(check(f, true).warnings, []);
  assert.deepEqual(check(f).errors, []);
});

test('v1 additional and reordered columns use the real header width and named Input ID', (t) => {
  const f = fixture(t);
  const headers = ['Note', ...REQUIRED_REGISTER_COLS];
  f.write(row(headers) + '\n' + row(headers.map(() => '---')) + '\n' +
    row(['note', 'IN-20260101-api-001', 'api', 'simple-update', 'reconciled', 'result', '-', '-', '-', 'extra']) + '\n');
  const result = check(f);
  assert.deepEqual(result.errors, []);
  assertWidth(widthWarnings(result)[0], { expected: 9, actual: 10, ordinal: 1, id: 'IN-20260101-api-001', table: 'Summary' });
});

test('missing register and malformed headers retain existing behavior without a misleading width warning', (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.file);
  assert.deepEqual(check(f).warnings, []);
  f.write('| Note |\n|---|\n| example | extra |\n');
  const result = check(f);
  assert.deepEqual(widthWarnings(result), []);
  assert.ok(result.errors.some(({ message }) => message.includes('필수 컬럼 누락')));
});

for (const enforce of [false, true]) {
  test(`v2 Summary and Items excess cells warn once each with no new hard error, enforce=${enforce}`, (t) => {
    const f = fixture(t, 2);
    f.write(f.read().replace(new RegExp(`^(\\| ${INPUT} \\| figma \\|.*)$`, 'm'), '$1 extra |')
      .replace(new RegExp(`^(\\| ${INPUT} \\| 01 \\|.*)$`, 'm'), '$1 extra |'));
    const result = check(f, enforce);
    assert.deepEqual(result.errors, []);
    const warnings = widthWarnings(result);
    assert.equal(warnings.length, 2);
    assertWidth(warnings[0], { expected: 8, actual: 9, ordinal: 1, id: INPUT, table: 'Summary' });
    assertWidth(warnings[1], { expected: 10, actual: 11, ordinal: 1, id: INPUT, table: 'Reconciliation Items', item: '01' });
    const publicResult = cli(f, enforce);
    assert.equal(widthWarnings(publicResult).length, 2);
    assert.ok(widthWarnings(publicResult).every(({ check }) => check === 12));
  });
}

test('v2 inspects canonical Summary even when an earlier fenced table has the same projected fields', (t) => {
  const f = fixture(t, 2);
  const original = f.read();
  const start = original.indexOf(header);
  assert.notEqual(start, -1);
  const end = original.indexOf('\n\n## Reconciliation Items', start);
  const summary = original.slice(start, end);
  const damaged = summary.replace(new RegExp(`^(\\| ${INPUT} \\| figma \\|.*)$`, 'm'), '$1 extra |');
  f.write(original.slice(0, start) + '```md\n' + summary + '\n```\n\n' + damaged + original.slice(end));
  const result = check(f);
  assert.deepEqual(result.errors, [], 'RR-SCHEMA-020 only compares the projected fields, so it does not catch the extra cell');
  const warnings = widthWarnings(result);
  assert.equal(warnings.length, 1);
  assertWidth(warnings[0], { expected: 8, actual: 9, ordinal: 1, id: INPUT, table: 'Summary' });
});

test('v2 missing and fused Item cells retain required-cell/projection hard errors', (t) => {
  const f = fixture(t, 2);
  const original = f.read();
  f.write(original.replace(new RegExp(`^(\\| ${INPUT} \\| 01 \\|.*) \\| inherit \\|$`, 'm'), '$1 |'));
  let result = check(f, true);
  assertWidth(widthWarnings(result)[0], { expected: 10, actual: 9, ordinal: 1, id: INPUT, table: 'Reconciliation Items', item: '01' });
  assert.ok(result.errors.some(({ message }) => message.startsWith('RR-SCHEMA-009:') && message.includes('Captured At')));
  f.write(original.replace(new RegExp(`^(\\| ${INPUT} \\| 01 \\|.*)\\n(\\| ${INPUT} \\| 02 \\|.*)$`, 'm'), '$1$2'));
  result = check(f);
  assertWidth(widthWarnings(result)[0], { expected: 10, actual: 21, ordinal: 1, id: INPUT, table: 'Reconciliation Items', item: '01' });
  assert.ok(result.errors.some(({ message }) => message.startsWith('RR-ITEM-')));
});

test('v2 ignores malformed non-content examples and supplementary tables', (t) => {
  const f = fixture(t, 2);
  const examples = '## Reconciliation Items\n\n| Input ID | Item |\n|---|---|\n| example | 01 | extra |';
  f.write(f.read() + '\n## Examples\n\n```md\n' + examples + '\n```\n\n<!--\n' + examples + '\n-->\n\n' +
    examples.split('\n').map((line) => `> ${line}`).join('\n') + '\n\n' +
    examples.split('\n').map((line) => `    ${line}`).join('\n') + '\n\n## Notes\n| Note |\n|---|\n| one | extra |\n');
  const result = check(f);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('v2 Items preserve escaped pipes in ordinary source-ref cells', (t) => {
  const f = fixture(t, 2);
  f.write(f.read().replace(/\| inherit \| statement \| inherit \|/g,
    '| https://fixture.test/left\\|right | statement | inherit |'));
  const result = check(f);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

for (const damaged of [false, true]) {
  for (const enforce of [false, true]) {
    test(`v2 Items literal comment markers preserve row-width diagnostics, damaged=${damaged}, enforce=${enforce}`, (t) => {
      const f = fixture(t, 2);
      const input = 'IN-20260720-meeting-001';
      f.write(f.read().split('\n').map((line) => {
        const cells = splitRow(line);
        if (cells[0] !== input) return line;
        if (cells[4] === 'create-open') {
          cells[7] = 'notes/template.md: opening `<!--`';
          if (damaged) cells.push('extra');
        } else if (cells[4] === 'reopen') {
          cells[7] = 'notes/template.md: closing `-->`';
        } else return line;
        return row(cells);
      }).join('\n'));

      const result = check(f, enforce);
      const items = parseReconciliationItems(result.register.body);
      assert.equal(items.rows.length, 4, 'literal markers must not hide authored Item rows');
      assert.deepEqual(items.table.sourceText.split('\n').slice(2).map((line) => splitRow(line).length),
        [10, 10, damaged ? 11 : 10, 10]);
      assert.deepEqual(result.errors, []);
      const publicResult = cli(f, enforce);
      assert.equal(publicResult.ok, true);
      assert.equal(publicResult.count, 0);
      assert.deepEqual(publicResult.errors, []);
      assert.equal(result.warnings.length, damaged ? 1 : 0);
      assert.equal(publicResult.warnings.length, damaged ? 1 : 0);
      assert.deepEqual(publicResult.warnings.map(({ message }) => message), result.warnings.map(({ message }) => message));
      if (damaged) {
        assertWidth(widthWarnings(result)[0], {
          expected: 10, actual: 11, ordinal: 3, id: input, table: 'Reconciliation Items', item: "Item: '01'",
        });
        assert.equal(publicResult.warnings[0].check, 12);
      }
    });
  }
}

for (const decorated of ['**Input ID** | Item', '**Input ID** | *Item*']) {
  test(`v2 width diagnostics preserve identity under accepted formatted headers: ${decorated}`, (t) => {
    const f = fixture(t, 2);
    f.write(f.read().replace('| Input ID | Item |', `| ${decorated} |`)
      .replace(new RegExp(`^(\\| ${INPUT} \\| 01 \\|.*)$`, 'm'), '$1 extra |'));
    const result = check(f);
    assert.deepEqual(result.errors, []);
    const warnings = widthWarnings(result);
    assert.equal(warnings.length, 1);
    assertWidth(warnings[0], { expected: 10, actual: 11, ordinal: 1, id: INPUT, table: 'Reconciliation Items', item: "Item: '01'" });
  });
}

for (const eol of ['\n', '\r\n', '\r']) {
  test(`v2 Items raw width diagnosis accepts ${JSON.stringify(eol)} line endings`, (t) => {
    const f = fixture(t, 2);
    const original = f.read();
    const start = original.indexOf('## Reconciliation Items');
    const items = original.slice(start).replace(new RegExp(`^(\\| ${INPUT} \\| 01 \\|.*)$`, 'm'), '$1 extra |');
    f.write(original.slice(0, start) + items.replace(/\n/g, eol));
    const result = check(f);
    assert.deepEqual(result.errors, []);
    assert.equal(widthWarnings(result).length, 1);
    assertWidth(widthWarnings(result)[0], { expected: 10, actual: 11, ordinal: 1, id: INPUT, table: 'Reconciliation Items', item: '01' });
  });
}
