// Reconciliation Contract v2 (검사 12 확장) 테스트 — reconciliation-items.mjs + provenance.mjs +
// reconciliation-target-index.mjs. 설계 #202 의 테스트 계획(§15) 을 따른다:
//   - v1 compatibility: contract 필드 없는 register 는 v2 검사가 완전 무발화 + 기존 fixture 출력 유지.
//   - v2 pass: summary multiset/typed target/evidence/provenance inherit 가 전부 해소.
//   - v2 hard failures: 구조·참조·routing·provenance 필수값.
//   - warning-only: annotation·Result 권고·bullet index·row-key·n/a — --enforce 승격 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isRfc3339 } from './provenance.mjs';
import { splitFrontmatter, readFileSafe } from './util.mjs';
import { collectInputArtifacts } from './input-artifact.mjs';
import { parseReconciliationRegister, validateReconciliationRegister } from './reconciliation-register.mjs';
import {
  buildReconciliationTargetIndex,
  stripFencedCodeBlocks,
  stripNonContent,
} from './reconciliation-target-index.mjs';
import {
  parseRegisterContract,
  parseSummaryClassification,
  parseTargetRef,
  parseEvidenceRef,
  parseReconciliationItems,
  validateReconciliationV2,
} from './reconciliation-items.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VALIDATE = path.join(KIT_ROOT, 'scripts', 'validate.mjs');
const RECON_EXAMPLES = path.join(KIT_ROOT, 'examples', 'reconciliation-validation');

// ── fixture builder ──────────────────────────────────────────────────────────

const DEFAULT_FRONTMATTER = [
  'title: Reconciliation Register',
  'status: draft',
  'kind: meta-register',
  'reconciliation_contract: 2',
  'review_profile: reconcile-stage04-v1',
  'structured_since: "2026-07-20T00:00:00+09:00"',
];

const SUMMARY_HEADER = [
  '| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |',
  '|---|---|---|---|---|---|---|---|',
];

const ITEMS_HEADER = [
  '| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |',
  '|---|---|---|---|---|---|---|---|---|---|',
];

const DEFAULT_SUMMARY_ROWS = [
  '| IN-20260720-figma-001 | figma | simple-update + component-gap | reconciled | accepted | artifact:COUPON-001-figma-component-mapping; artifact:component-gap-register | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001; gap:G-001@component-gap-register | - |',
  '| IN-20260720-meeting-001 | meeting | conflict | reconciled | pending-user-decision | artifact:conflicts; artifact:open-decision-register | conflict:C-001@conflicts; decision:D-204@open-decision-register | - |',
];

const DEFAULT_ITEM_ROWS = [
  '| IN-20260720-figma-001 | 01 | visual-evidence | simple-update | create | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001 | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | instance | inherit |',
  '| IN-20260720-figma-001 | 02 | component-missing | component-gap | create-open | gap:G-001@component-gap-register | input:IN-20260720-figma-001#extracted-facts/02 | figma://file/abc/node/1:235 | instance | inherit |',
  '| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | create-open | conflict:C-001@conflicts | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |',
  '| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | reopen | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |',
];

const FIGMA_INPUT = `---
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
`;

const MEETING_INPUT = `---
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
`;

// legacy 입력: structured_since 이전 capture — summary-only 허용 대상.
const LEGACY_INPUT = `---
input_id: "IN-20260601-planning-001"
input_type: "planning"
source_type: "planning-doc"
source_ref: "planning/coupon-v1.md"
captured_at: "2026-06-01T09:00:00+09:00"
captured_by: "planning-doc-input-skill"
status: "captured"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
---

## Summary
초기 기획 입력 (legacy).
`;

const MAPPING_DOC = `---
artifact_id: "COUPON-001-figma-component-mapping"
artifact_type: figma-component-mapping
screen_id: "COUPON-001"
status: draft
---

# Figma Component Mapping

## Component Mapping
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| \`M-001\` · frame / node \`1:234\` | Primary CTA | components/ui/Button | variant=primary |

## Notes
- 시각 매핑.
`;

const GAP_DOC = `---
artifact_id: component-gap-register
artifact_type: component-gap-register
status: draft
---

# Component Gap Register

| ID | 제안 컴포넌트 | 필요한 화면 | 기존 카탈로그로 안 되는 이유 | Status |
|---|---|---|---|---|
| G-001 | SegmentedTabs | COUPON-001 | 상태 탭 분리 표현 불가 | open |
`;

const CONFLICTS_DOC = `---
artifact_id: conflicts
artifact_type: conflicts
status: draft
---

# Conflicts

| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |
|---|---|---|---|---|---|
| C-001 | 로그인 리다이렉트 | IN-20260720-meeting-001 / returnTo 우선 | D-204 / 항상 홈 | AUTH-001 | open |
`;

const DECISION_DOC = `---
artifact_id: open-decision-register
artifact_type: open-decision-register
status: draft
---

# Cross-Screen Open Decisions

## Open Decisions

| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |
`;

const SCREEN_SPEC_DOC = `---
artifact_id: "COUPON-001-screen-spec"
artifact_type: screen-spec
screen_id: "COUPON-001"
status: draft
---

# ScreenSpec

## UI Sections
1. Header

## Interaction Matrix
| Trigger | Action | Result |
|---|---|---|
| tap | open | detail |

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 페이지 크기 | open |
`;

const DOMAIN_RULES_DOC = `---
artifact_id: "coupons-domain-rules"
artifact_type: domain-rules
status: draft
---

# Domain Rules

## Rules
- 쿠폰 만료 규칙.
`;

// temp docs 트리를 만들고 v2 validator 실행 결과를 돌려준다. overrides 로 행/파일을 바꾼다.
function runV2(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-v2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  const write = (rel, content) => {
    const p = path.join(docsDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    return p;
  };

  const files = {
    'inputs/IN-20260720-figma-001.md': FIGMA_INPUT,
    'inputs/IN-20260720-meeting-001.md': MEETING_INPUT,
    'domains/coupons/screens/coupon-list/figma-component-mapping.md': MAPPING_DOC,
    'domains/coupons/screens/coupon-list/screen-spec.md': SCREEN_SPEC_DOC,
    'domains/coupons/domain-rules.md': DOMAIN_RULES_DOC,
    'global/component-gap-register.md': GAP_DOC,
    'global/conflicts.md': CONFLICTS_DOC,
    'global/open-decisions.md': DECISION_DOC,
    ...(overrides.files || {}),
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content !== null) write(rel, content);
  }

  const frontmatter = overrides.frontmatter || DEFAULT_FRONTMATTER;
  const summaryRows = overrides.summaryRows || DEFAULT_SUMMARY_ROWS;
  const itemRows = overrides.itemRows || DEFAULT_ITEM_ROWS;
  const itemsSection = overrides.omitItemsSection
    ? ''
    : ['## Reconciliation Items', '', ...(overrides.itemsHeader || ITEMS_HEADER), ...itemRows].join('\n');
  const registerContent = [
    '---',
    ...frontmatter,
    '---',
    '',
    '# Reconciliation Register',
    '',
    overrides.summaryPrefix || '',
    ...(overrides.omitSummaryTable ? [] : [...SUMMARY_HEADER, ...summaryRows]),
    '',
    itemsSection,
    '',
    overrides.registerExtra || '',
  ].join('\n');
  const registerFile = write('_meta/reconciliation-register.md', registerContent);

  // validate.mjs 의 docs 수집과 동형: docs/ 하위 md 중 _meta 제외 + artifact_type 보유만.
  const docs = [];
  const stack = [docsDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_meta' || entry.name === 'inputs') continue;
        stack.push(full);
      } else if (entry.name.endsWith('.md')) {
        const { data, hasFrontmatter } = splitFrontmatter(readFileSafe(full));
        if (hasFrontmatter && data.artifact_type) docs.push({ file: full, fm: data });
      }
    }
  }

  const inputArtifacts = collectInputArtifacts(path.join(docsDir, 'inputs'));
  const register = parseReconciliationRegister(registerFile);
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const result = validateReconciliationV2({ register, registerFile, inputArtifacts, targetIndex });
  return { ...result, register, registerFile, inputArtifacts, docsDir };
}

const messages = (list) => list.map((e) => e.message);
const hasCode = (list, code) => messages(list).some((m) => m.startsWith(`${code}:`));

// ── provenance ───────────────────────────────────────────────────────────────

test('provenance: RFC3339 with timezone 만 허용', () => {
  assert.equal(isRfc3339('2026-07-20T10:15:30+09:00'), true);
  assert.equal(isRfc3339('2026-07-20T01:15:30Z'), true);
  assert.equal(isRfc3339('2026-07-20T01:15:30.123Z'), true);
  assert.equal(isRfc3339('2026-07-20'), false);
  assert.equal(isRfc3339('2026/07/20 10:15'), false);
  assert.equal(isRfc3339('2026-07-20T10:15:30'), false); // 타임존 없음
  assert.equal(isRfc3339('2026-13-40T10:15:30Z'), false); // 달력 불가값
  assert.equal(isRfc3339(null), false);
});

test('provenance: Date.parse 정규화에 기대지 않는 달력 구성요소 검증', () => {
  // V8 의 Date.parse 는 아래 값 일부를 유효 시각으로 정규화한다 — 구성요소 검증으로 fail-closed.
  assert.equal(isRfc3339('2026-02-30T00:00:00Z'), false); // 존재하지 않는 날
  assert.equal(isRfc3339('2026-04-31T00:00:00+09:00'), false); // 4월 31일
  assert.equal(isRfc3339('2026-01-01T24:00:00Z'), false); // 24시(자정 이월 표기) 거부
  assert.equal(isRfc3339('2026-01-01T00:60:00Z'), false); // 분 60
  assert.equal(isRfc3339('2026-02-29T00:00:00Z'), false); // 평년 2/29
  assert.equal(isRfc3339('2024-02-29T00:00:00Z'), true); // 윤년 2/29
  assert.equal(isRfc3339('2000-02-29T00:00:00Z'), true); // 400 배수 윤년
  assert.equal(isRfc3339('1900-02-28T00:00:00Z'), true); // 100 배수 평년의 유효일
});

// ── contract/frontmatter parse ───────────────────────────────────────────────

test('contract: 필드 없으면 v1 (에러 0)', () => {
  const c = parseRegisterContract({ title: 'x' });
  assert.equal(c.version, 1);
  assert.deepEqual(c.errors, []);
});

test('contract: v2 필수 필드 — 잘못된 버전/누락 profile/structured_since', () => {
  const bad = parseRegisterContract({ reconciliation_contract: 3 });
  assert.equal(bad.version, null);
  assert.ok(bad.errors.some((m) => m.startsWith('RR-SCHEMA-001:')));

  const missing = parseRegisterContract({ reconciliation_contract: 2 });
  assert.ok(missing.errors.some((m) => m.startsWith('RR-SCHEMA-002:')));
  assert.ok(missing.errors.some((m) => m.startsWith('RR-SCHEMA-003:')));

  const ok = parseRegisterContract({
    reconciliation_contract: 2,
    review_profile: 'reconcile-stage04-v1',
    structured_since: '2026-07-20T00:00:00+09:00',
  });
  assert.equal(ok.version, 2);
  assert.deepEqual(ok.errors, []);
  assert.equal(typeof ok.structuredSinceMs, 'number');
});

// ── grammar parsers ──────────────────────────────────────────────────────────

test('grammar: summary Classification multiset', () => {
  const parsed = parseSummaryClassification('simple-update×2 + conflict + new-decision');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries.get('simple-update'), 2);
  assert.equal(parsed.entries.get('conflict'), 1);
  assert.equal(parsed.entries.get('new-decision'), 1);
  assert.equal(parsed.hasAnnotation, false);

  const annotated = parseSummaryClassification('conflict (decision reopen)');
  assert.equal(annotated.hasAnnotation, true);
  assert.deepEqual(annotated.errors, []);

  const bad = parseSummaryClassification('simple-update + not-a-class');
  assert.equal(bad.errors.length, 1);
});

test('grammar: typed target/evidence', () => {
  assert.deepEqual(parseTargetRef('artifact:COUPON-001#state-matrix/offline'), {
    kind: 'artifact',
    artifactId: 'COUPON-001',
    section: 'state-matrix',
    rowKey: 'offline',
    raw: 'artifact:COUPON-001#state-matrix/offline',
  });
  assert.equal(parseTargetRef('decision:D-204@AUTH-001').kind, 'decision');
  assert.equal(parseTargetRef('verification:VER-001@COUPON-001').kind, 'verification');
  assert.equal(parseTargetRef('-').kind, 'none');
  assert.equal(parseTargetRef('decision:U-001@AUTH-001'), null); // kind ↔ ID 접두 모순
  assert.equal(parseTargetRef('D-204'), null);
  assert.equal(parseTargetRef('decision:D-204'), null); // owner 필수

  const ev = parseEvidenceRef('input:IN-20260720-figma-001#extracted-facts/02');
  assert.equal(ev.section, 'extracted-facts');
  assert.equal(ev.bulletIndex, 2);
  assert.equal(parseEvidenceRef('IN-x#summary'), null);
});

// ── v2 pass ──────────────────────────────────────────────────────────────────

test('v2 pass: multiset·effect pair·typed target·inherit 전부 해소 (에러/경고 0)', (t) => {
  const r = runV2(t);
  assert.deepEqual(messages(r.errors), []);
  assert.deepEqual(messages(r.warnings), []);
});

test('v2: legacy(structured_since 이전) 입력은 summary-only 자유서술 허용', (t) => {
  const r = runV2(t, {
    files: { 'inputs/IN-20260601-planning-001.md': LEGACY_INPUT },
    summaryRows: [
      ...DEFAULT_SUMMARY_ROWS,
      // legacy 행: v1 자유서술 그대로 — item 행 없음. grammar/projection 검사 대상이 아니다.
      '| IN-20260601-planning-001 | planning | conflict (decision reopen) | reconciled | pending user decision | COUPON-001 screen-spec (UI Sections) | D-001 (open) | - |',
    ],
  });
  assert.deepEqual(messages(r.errors), []);
  assert.deepEqual(messages(r.warnings), []);
});

test('v1 register 는 v2 validator 완전 무발화', (t) => {
  const r = runV2(t, {
    frontmatter: ['title: Reconciliation Register', 'status: draft', 'kind: meta-register'],
    summaryRows: ['| IN-20260720-figma-001 | figma | simple-update | reconciled | accepted | 자유서술 | D-001 (open) | - |'],
    omitItemsSection: true,
  });
  assert.deepEqual(messages(r.errors), []);
  assert.deepEqual(messages(r.warnings), []);
});

// ── v2 hard failures ─────────────────────────────────────────────────────────

test('v2 hard: items 섹션/컬럼 구조', (t) => {
  const noSection = runV2(t, { omitItemsSection: true });
  assert.ok(hasCode(noSection.errors, 'RR-SCHEMA-004'));

  const missingCol = runV2(t, {
    itemsHeader: [
      '| Input ID | Item | Basis | Classification | Effect | Target | Evidence |',
      '|---|---|---|---|---|---|---|',
    ],
    itemRows: ['| IN-20260720-figma-001 | 01 | visual-evidence | simple-update | create | artifact:COUPON-001-figma-component-mapping#notes | input:IN-20260720-figma-001#extracted-facts |'],
  });
  assert.ok(hasCode(missingCol.errors, 'RR-SCHEMA-005'));
});

test('v2 hard: structured 입력인데 item 행 없음 (RR-ITEM-001)', (t) => {
  const r = runV2(t, {
    itemRows: DEFAULT_ITEM_ROWS.filter((row) => !row.includes('meeting')),
    summaryRows: DEFAULT_SUMMARY_ROWS,
  });
  assert.ok(hasCode(r.errors, 'RR-ITEM-001'));
  assert.ok(messages(r.errors).some((m) => m.includes('IN-20260720-meeting-001')));
});

test('v2 hard: orphan item input / summary 행 없는 item (RR-REF-002/003)', (t) => {
  const r = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-ghost-001 | 01 | compatible-fact | simple-update | update | artifact:component-gap-register | input:IN-20260720-ghost-001#summary | inherit | statement | inherit |',
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-002'));
  assert.ok(hasCode(r.errors, 'RR-REF-003'));
});

test('v2 hard: summary Input ID 가 input artifact 로 해소 안 됨 (RR-REF-001)', (t) => {
  const r = runV2(t, {
    summaryRows: [
      ...DEFAULT_SUMMARY_ROWS,
      '| IN-20260720-ghost-001 | figma | simple-update | reconciled | accepted | - | - | - |',
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-001'));
});

test('v2 hard: 중복 effect 행 (RR-ITEM-004)', (t) => {
  const r = runV2(t, { itemRows: [...DEFAULT_ITEM_ROWS, DEFAULT_ITEM_ROWS[1]] });
  assert.ok(hasCode(r.errors, 'RR-ITEM-004'));
});

test('v2 hard: 같은 item 의 Basis/Classification 불일치 (RR-ITEM-002/003)', (t) => {
  const r = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0],
      DEFAULT_ITEM_ROWS[1],
      DEFAULT_ITEM_ROWS[2],
      DEFAULT_ITEM_ROWS[3]
        .replace('resolved-decision-conflict', 'input-input-conflict')
        .replace('| conflict |', '| new-decision |'),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-ITEM-002'));
  assert.ok(hasCode(r.errors, 'RR-ITEM-003'));
});

test('v2 hard: summary Classification multiset 불일치 (RR-ITEM-005, canonical order 제안)', (t) => {
  const r = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace('simple-update + component-gap', 'simple-update×2 + component-gap'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-ITEM-005'));
  assert.ok(messages(r.errors).some((m) => m.includes("'simple-update + component-gap'")));
});

test('v2 hard: Created Items 누락/과잉 (RR-ITEM-006) + Touched 누락/과잉 (RR-ITEM-007)', (t) => {
  const r = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0]
        .replace('gap:G-001@component-gap-register', 'gap:G-001@component-gap-register; conflict:C-001@conflicts')
        .replace('; artifact:component-gap-register', ''),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-ITEM-006'));
  assert.ok(hasCode(r.errors, 'RR-ITEM-007'));
});

test('v2 hard: created 주석 금지 + typed ref grammar (RR-SCHEMA-007/008)', (t) => {
  const r = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0]
        .replace('gap:G-001@component-gap-register', 'gap:G-001@component-gap-register (open)')
        .replace('artifact:component-gap-register', 'component-gap-register'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-007'));
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-008'));
});

test('v2 hard: target 해소 실패 계열 (RR-REF-006/007/008)', (t) => {
  const r = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('COUPON-001-figma-component-mapping#component-mapping/M-001', 'NO-SUCH-DOC'),
      DEFAULT_ITEM_ROWS[1].replace('gap:G-001@component-gap-register', 'gap:G-999@component-gap-register'),
      DEFAULT_ITEM_ROWS[2],
      DEFAULT_ITEM_ROWS[3],
    ],
    summaryRows: [
      '| IN-20260720-figma-001 | figma | simple-update + component-gap | reconciled | accepted | artifact:NO-SUCH-DOC; artifact:component-gap-register | artifact:NO-SUCH-DOC; gap:G-999@component-gap-register | - |',
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-006'));
  assert.ok(hasCode(r.errors, 'RR-REF-008'));

  const badSection = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('#component-mapping/M-001', '#no-such-section'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace('#component-mapping/M-001', '#no-such-section'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(badSection.errors, 'RR-REF-007'));
});

test('v2 hard: target kind ↔ 섹션 가족 불일치 (RR-REF-009)', (t) => {
  // C-777 행이 open-decisions 가족 섹션에만 존재 → conflict target 은 가족 모순.
  const decisionWithConflictId = DECISION_DOC.replace(
    '| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |',
    '| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |\n| C-777 | 잘못 놓인 행 | a / b | final-fixture-ui | PM | open |',
  );
  const r = runV2(t, {
    files: { 'global/open-decisions.md': decisionWithConflictId },
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | input-input-conflict | conflict | create-open | conflict:C-777@open-decision-register | input:IN-20260720-meeting-001#extracted-facts | inherit | statement | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1]
        .replace('| conflict |', '| conflict×2 |')
        .replace('conflict:C-001@conflicts;', 'conflict:C-001@conflicts; conflict:C-777@open-decision-register;'),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-009'));
});

test('v2 hard: routing matrix — basis↔classification, 허용 조합, 필수 target', (t) => {
  // unknown-answer 가 decision target 으로 감 (설계 §15.3).
  const misrouted = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | unknown-answer | resolves-unknown | link-evidence | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#extracted-facts | inherit | statement | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1]
        .replace('| conflict |', '| conflict + resolves-unknown |')
        .replace('conflict:C-001@conflicts;', 'conflict:C-001@conflicts; decision:D-204@open-decision-register;'),
    ],
  });
  assert.ok(hasCode(misrouted.errors, 'RR-ROUTE-002'));
  assert.ok(hasCode(misrouted.errors, 'RR-ROUTE-006')); // unknown:* target 부재

  // basis ↔ classification 불일치.
  const wrongClass = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('| simple-update |', '| new-decision |'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace('simple-update + component-gap', 'new-decision + component-gap'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(wrongClass.errors, 'RR-ROUTE-001'));
});

test('v2 hard: resolved-decision-conflict 는 create-open + reopen 페어 필수 (RR-ROUTE-003)', (t) => {
  const r = runV2(t, {
    itemRows: DEFAULT_ITEM_ROWS.slice(0, 3), // reopen effect 행 제거
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1]
        .replace('; decision:D-204@open-decision-register', '')
        .replace('; artifact:open-decision-register', ''),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-ROUTE-003'));
});

test('v2 hard: visual-evidence 의 behavior 누출 (RR-ROUTE-004)', (t) => {
  // ScreenSpec interaction-matrix 를 update — 명백한 visual→behavior 누출.
  const r = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-figma-001 | 03 | visual-evidence | simple-update | update | artifact:COUPON-001-screen-spec#interaction-matrix | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | node | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0]
        .replace('simple-update + component-gap', 'simple-update×2 + component-gap')
        .replace('artifact:COUPON-001-figma-component-mapping;', 'artifact:COUPON-001-figma-component-mapping; artifact:COUPON-001-screen-spec;'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-ROUTE-004'));

  // 허용 대상이 아닌 artifact_type (domain-rules).
  const domainLeak = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-figma-001 | 03 | visual-evidence | simple-update | update | artifact:coupons-domain-rules#rules | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | node | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0]
        .replace('simple-update + component-gap', 'simple-update×2 + component-gap')
        .replace('artifact:COUPON-001-figma-component-mapping;', 'artifact:COUPON-001-figma-component-mapping; artifact:coupons-domain-rules;'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(domainLeak.errors, 'RR-ROUTE-004'));
});

test('v2 hard: scope-unclear 는 screen-level artifact write 금지 (RR-ROUTE-005)', (t) => {
  const r = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | scope-unclear | scope-unclear | update | artifact:COUPON-001-screen-spec#ui-sections | input:IN-20260720-meeting-001#extracted-facts | inherit | statement | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1]
        .replace('| conflict |', '| conflict + scope-unclear |')
        .replace('artifact:conflicts;', 'artifact:conflicts; artifact:COUPON-001-screen-spec;'),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-ROUTE-005'));
});

test('v2 hard: provenance — Source Unit enum / RFC3339 / inherit 부재 (RP-001/002/003)', (t) => {
  const badUnit = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('| instance |', '| pixels |'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.ok(hasCode(badUnit.errors, 'RP-001'));

  const badTime = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('| instance | inherit |', '| instance | 2026/07/20 10:15 |'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.ok(hasCode(badTime.errors, 'RP-002'));

  const noSourceRef = runV2(t, {
    files: {
      'inputs/IN-20260720-meeting-001.md': MEETING_INPUT.replace('source_ref: "meetings/2026-07-20.md"\n', 'source_ref: ""\n'),
    },
  });
  assert.ok(hasCode(noSourceRef.errors, 'RP-003'));
});

test('v2 hard: gate-lowering 계열 effect 어휘 자체가 없음 (resolve → enum 위반)', (t) => {
  const r = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | decision-answer | resolves-decision | resolve | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#extracted-facts | inherit | statement | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1]
        .replace('| conflict |', '| conflict + resolves-decision |')
        .replace('conflict:C-001@conflicts;', 'conflict:C-001@conflicts; decision:D-204@open-decision-register;'),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-013'));
});

test('v2 hard: register frontmatter YAML 오류는 v1 downgrade 가 아니라 검사 12 hard error (fail-closed)', (t) => {
  // v2 필드에 오타(닫히지 않은 배열)가 나면 fm 이 빈 객체가 되어 contract 판정이 v1 로 기운다.
  // v2 검사가 무발화인 것 자체는 판정 불가라 어쩔 수 없지만, v1 lifecycle 검사가 frontmatter
  // 파싱 실패를 항상 에러로 잡아야 조용한 downgrade 가 게이트를 통과하지 못한다.
  const r = runV2(t, {
    frontmatter: [
      'title: Reconciliation Register',
      'reconciliation_contract: 2',
      'review_profile: [reconcile-stage04-v1', // YAML 오류
      'structured_since: "2026-07-20T00:00:00+09:00"',
    ],
    omitItemsSection: true, // items 표까지 없어도 frontmatter 오류가 게이트를 막아야 한다
  });
  assert.equal(r.register.fmParseError !== null, true);
  // contract 판정 불가 → v2 validator 는 무발화 (downgrade 문서화)…
  assert.deepEqual(messages(r.errors), []);
  // …대신 v1 구조 검사가 hard error 로 fail-closed 한다.
  const v1 = validateReconciliationRegister({
    register: r.register,
    inputArtifacts: r.inputArtifacts,
    registerFile: r.registerFile,
  });
  assert.ok(v1.errors.some((e) => e.message.includes('frontmatter YAML 파싱 실패')));
});

test('v2 hard: reject 의 input target 은 자기 Input ID 만 허용 (RR-REF-011)', (t) => {
  const cross = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | reject | reject-input | reject | input:IN-20260720-figma-001 | input:IN-20260720-meeting-001#extracted-facts | inherit | n/a | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('| conflict |', '| conflict + reject-input |'),
    ],
  });
  assert.ok(hasCode(cross.errors, 'RR-REF-011'));

  const self = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | reject | reject-input | reject | input:IN-20260720-meeting-001 | input:IN-20260720-meeting-001#extracted-facts | inherit | n/a | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('| conflict |', '| conflict + reject-input |'),
    ],
  });
  assert.equal(hasCode(self.errors, 'RR-REF-011'), false);
  assert.deepEqual(messages(self.errors), []);
});

test('v2 hard: 비-canonical ID 참조 표(Notes 등)로는 child target 이 해소되지 않음 (RR-REF-008)', (t) => {
  // mapping 문서 Notes 에 D-204 를 인용한 단순 참조 표를 둔다 — canonical 가족 표가 아니므로
  // decision:D-204@COUPON-001-figma-component-mapping 은 not found 여야 한다.
  const mappingWithRefTable = MAPPING_DOC.replace(
    '## Notes\n- 시각 매핑.',
    '## Notes\n\n| ID | 설명 |\n|---|---|\n| D-204 | 기존 결정을 문서에서 언급 |',
  );
  const r = runV2(t, {
    files: { 'domains/coupons/screens/coupon-list/figma-component-mapping.md': mappingWithRefTable },
    itemRows: [
      DEFAULT_ITEM_ROWS[0],
      DEFAULT_ITEM_ROWS[1],
      DEFAULT_ITEM_ROWS[2],
      DEFAULT_ITEM_ROWS[3].replace(
        'decision:D-204@open-decision-register',
        'decision:D-204@COUPON-001-figma-component-mapping',
      ),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1]
        .replace('decision:D-204@open-decision-register', 'decision:D-204@COUPON-001-figma-component-mapping')
        .replace('artifact:open-decision-register', 'artifact:COUPON-001-figma-component-mapping'),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-008'));
  assert.equal(hasCode(r.errors, 'RR-REF-009'), false); // 가족 미판정 표는 mismatch 가 아니라 not-found
});

test('v2 hard: 중복 artifact_id 는 해소 가능한 target 이 아님 (RR-REF-012)', (t) => {
  const r = runV2(t, {
    files: {
      // 같은 artifact_id 를 다른 경로에 한 번 더 선언 — owner 결정 불가.
      'global/component-gap-register-copy.md': GAP_DOC,
    },
  });
  assert.ok(hasCode(r.errors, 'RR-REF-012'));
});

test('v2 hard: inherit 로 해소된 captured_at 도 RFC3339 계약을 통과해야 함 (RP-004)', (t) => {
  const r = runV2(t, {
    files: {
      'inputs/IN-20260720-meeting-001.md': MEETING_INPUT.replace(
        'captured_at: "2026-07-20T11:00:00+09:00"',
        'captured_at: "not-a-date"',
      ),
    },
  });
  assert.ok(hasCode(r.errors, 'RP-004'));

  const normalized = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('| instance | inherit |', '| instance | 2026-02-30T00:00:00Z |'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.ok(hasCode(normalized.errors, 'RP-002')); // Date.parse 가 정규화하는 값도 거부
});

test('v2 hard: structured_since 도 구성요소 검증을 통과해야 함 (RR-SCHEMA-003)', (t) => {
  const r = runV2(t, {
    frontmatter: [
      'title: Reconciliation Register',
      'reconciliation_contract: 2',
      'review_profile: reconcile-stage04-v1',
      'structured_since: "2026-01-01T24:00:00Z"',
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-003'));
});

test('v2: Result 빈값은 warning, Supersedes 빈값은 hard (RR-SCHEMA-102/016)', (t) => {
  const r = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace('| accepted |', '|  |').replace(/\| - \|$/, '|  |'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-016'));
  assert.ok(messages(r.warnings).some((m) => m.startsWith('RR-SCHEMA-102:') && m.includes('(빈값)')));
});

test('v2 hard: evidence bullet index 는 1-based — /00 은 문법 위반 (RR-SCHEMA-015)', (t) => {
  const r = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('#extracted-facts/01', '#extracted-facts/00'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-015'));
});

test('v2 hard: frontmatter envelope/top-level type 오류도 v1 downgrade 없이 검사 12 hard error', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-fm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const writeRegister = (name, content) => {
    const p = path.join(root, name);
    fs.writeFileSync(p, content, 'utf8');
    return p;
  };
  const summary = [...SUMMARY_HEADER, ...DEFAULT_SUMMARY_ROWS].join('\n');

  // (a) 닫는 --- 누락 — 전체 원문이 body 로 흘러 Summary 표만 v1 검사되던 경로.
  const noClose = parseReconciliationRegister(
    writeRegister(
      'no-close.md',
      ['---', 'reconciliation_contract: 2', 'review_profile: reconcile-stage04-v1', '', summary, ''].join('\n'),
    ),
  );
  assert.ok(noClose.fmStructuralError?.includes('종료 구분자'));

  // (b) top-level sequence — v2 선언이 리스트 항목 안에 "숨는" 경우.
  const sequence = parseReconciliationRegister(
    writeRegister(
      'sequence.md',
      ['---', '- reconciliation_contract: 2', '- review_profile: reconcile-stage04-v1', '---', '', summary, ''].join('\n'),
    ),
  );
  assert.ok(sequence.fmStructuralError?.includes('mapping 이 아님'));

  // (c) top-level scalar.
  const scalar = parseReconciliationRegister(
    writeRegister('scalar.md', ['---', 'just a string', '---', '', summary, ''].join('\n')),
  );
  assert.ok(scalar.fmStructuralError?.includes('mapping 이 아님'));

  // 세 경우 모두 v1 lifecycle 검사가 hard error 로 fail-closed 한다.
  for (const register of [noClose, sequence, scalar]) {
    const v1 = validateReconciliationRegister({
      register,
      inputArtifacts: [],
      registerFile: path.join(root, 'x.md'),
    });
    assert.ok(v1.errors.some((e) => e.message.includes('frontmatter 구조 오류')));
  }

  // (d) 정상 mapping 은 구조 오류가 아니다.
  const ok = parseReconciliationRegister(
    writeRegister('ok.md', ['---', 'title: Register', '---', '', summary, ''].join('\n')),
  );
  assert.equal(ok.fmStructuralError, null);
  // frontmatter 가 아예 없는(--- 로 시작하지 않는) legacy 파일은 기존 v1 동작 유지.
  const bare = parseReconciliationRegister(writeRegister('bare.md', `${summary}\n`));
  assert.equal(bare.fmStructuralError, null);
  assert.equal(bare.fmParseError, null);
});

test('v2 hard: canonical 위치 밖의 canonical-looking 표로는 child 가 해소되지 않음', (t) => {
  // (a) Notes 에 full decision signature(ID/Status/Blocking Mode) 예시 표 — decision family 아님.
  const decisionWithNotesTable =
    DECISION_DOC +
    '\n## Notes\n\n| ID | Status | Blocking Mode |\n|---|---|---|\n| D-999 | open | final-fixture-ui |\n';
  const a = runV2(t, {
    files: { 'global/open-decisions.md': decisionWithNotesTable },
    itemRows: [
      ...DEFAULT_ITEM_ROWS.slice(0, 3),
      DEFAULT_ITEM_ROWS[3].replace('decision:D-204@open-decision-register', 'decision:D-999@open-decision-register'),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('decision:D-204@open-decision-register', 'decision:D-999@open-decision-register'),
    ],
  });
  assert.ok(hasCode(a.errors, 'RR-REF-008'));
  assert.equal(hasCode(a.errors, 'RR-REF-009'), false);

  // (b) artifact_type=conflicts 문서의 Notes ID+Status 표 — preamble 이 아니므로 conflict family 아님.
  const conflictsWithNotesTable =
    CONFLICTS_DOC + '\n## Notes\n\n| ID | Status |\n|---|---|\n| C-999 | open |\n';
  const b = runV2(t, {
    files: { 'global/conflicts.md': conflictsWithNotesTable },
    itemRows: [
      ...DEFAULT_ITEM_ROWS.slice(0, 2),
      DEFAULT_ITEM_ROWS[2].replace('conflict:C-001@conflicts', 'conflict:C-999@conflicts'),
      DEFAULT_ITEM_ROWS[3],
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('conflict:C-001@conflicts', 'conflict:C-999@conflicts'),
    ],
  });
  assert.ok(hasCode(b.errors, 'RR-REF-008'));

  // (c) gap register 의 Notes G-xxx 표 — artifact_type fallback 은 h1 직속(preamble)에만 적용.
  const gapWithNotesTable = GAP_DOC + '\n## Notes\n\n| ID | Status |\n|---|---|\n| G-777 | open |\n';
  const c = runV2(t, {
    files: { 'global/component-gap-register.md': gapWithNotesTable },
    itemRows: [
      DEFAULT_ITEM_ROWS[0],
      DEFAULT_ITEM_ROWS[1].replace('gap:G-001@component-gap-register', 'gap:G-777@component-gap-register'),
      ...DEFAULT_ITEM_ROWS.slice(2),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace('gap:G-001@component-gap-register', 'gap:G-777@component-gap-register'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  assert.ok(hasCode(c.errors, 'RR-REF-008'));

  // (d) `## Open Decisions` 섹션 안이라도 fenced code block 의 full-signature 표는 후보가 아니다.
  const decisionWithFencedTable = DECISION_DOC.replace(
    '| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |',
    '| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |\n\n```md\n| ID | Status | Blocking Mode |\n|---|---|---|\n| D-888 | open | final-fixture-ui |\n```',
  );
  const d = runV2(t, {
    files: { 'global/open-decisions.md': decisionWithFencedTable },
    itemRows: [
      ...DEFAULT_ITEM_ROWS.slice(0, 3),
      DEFAULT_ITEM_ROWS[3].replace('decision:D-204@open-decision-register', 'decision:D-888@open-decision-register'),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('decision:D-204@open-decision-register', 'decision:D-888@open-decision-register'),
    ],
  });
  assert.ok(hasCode(d.errors, 'RR-REF-008'));
});

test('v2 hard: Reconciliation Items 섹션의 두 번째 표는 검증 우회가 아니라 RR-SCHEMA-017', (t) => {
  // 두 번째 full-signature 표에 금지 effect(resolve)와 미등록 item 을 숨긴다 — 첫 표만 읽으면 전부 invisible.
  const r = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '',
      '추가 항목:',
      '',
      ...ITEMS_HEADER,
      '| IN-20260720-meeting-001 | 03 | decision-answer | resolves-decision | resolve | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#extracted-facts | inherit | statement | inherit |',
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-017'));

  // fenced code block 안의 예시 표는 개수에 세지 않는다 — 정상 register 는 계속 통과.
  const fenced = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '',
      '```md',
      ...ITEMS_HEADER,
      '| {IN-...} | {01} | {basis} | {classification} | {effect} | {target} | {evidence} | {ref} | {unit} | {at} |',
      '```',
    ],
  });
  assert.deepEqual(messages(fenced.errors), []);
});

test('markdown 전처리: fence 는 {char,length} 로 추적하고 주석/fence 안의 heading 은 섹션이 아님', () => {
  // 4-backtick outer fence 안의 3-backtick 예시 — 내부 fence 가 outer 를 닫으면 표가 노출된다.
  const nested = ['````md', '```', '| ID | Status | Blocking Mode |', '|---|---|---|', '| D-777 | open | final-fixture-ui |', '````', '뒤 내용'].join('\n');
  const strippedNested = stripFencedCodeBlocks(nested);
  assert.ok(!strippedNested.includes('D-777'));
  assert.ok(strippedNested.includes('뒤 내용'));

  // fence 안의 heading 이 실제 섹션으로 승격되지 않는다 (stripNonContent 가 section 분리보다 먼저).
  const fencedHeading = ['## Notes', '', '```md', '## Open Decisions', '', '| ID | Status | Blocking Mode |', '|---|---|---|', '| D-999 | open | final-fixture-ui |', '```', ''].join('\n');
  const cleaned = stripNonContent(fencedHeading);
  assert.ok(!cleaned.includes('## Open Decisions'));
  assert.ok(!cleaned.includes('D-999'));

  // HTML 주석 안의 heading/표도 non-content 다.
  const commented = ['## Notes', '<!--', '## Open Decisions', '| ID | Status | Blocking Mode |', '|---|---|---|', '| D-666 | open | final-fixture-ui |', '-->'].join('\n');
  assert.ok(!stripNonContent(commented).includes('D-666'));
});

test('v2 hard: fence 안의 `## Open Decisions` heading 은 canonical 섹션을 만들지 않음 (RR-REF-008)', (t) => {
  // 리뷰 시나리오: Notes 의 fenced 예시가 heading 을 포함 — section 분리가 fence 를 모르면
  // closing fence 가 고아가 되어 D-999 가 실제 open-decisions 섹션 행으로 해소된다.
  const decisionWithFencedHeading =
    DECISION_DOC +
    '\n## Notes\n\n```md\n## Open Decisions\n\n| ID | Status | Blocking Mode |\n|---|---|---|\n| D-999 | open | final-fixture-ui |\n```\n';
  const r = runV2(t, {
    files: { 'global/open-decisions.md': decisionWithFencedHeading },
    itemRows: [
      ...DEFAULT_ITEM_ROWS.slice(0, 3),
      DEFAULT_ITEM_ROWS[3].replace('decision:D-204@open-decision-register', 'decision:D-999@open-decision-register'),
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('decision:D-204@open-decision-register', 'decision:D-999@open-decision-register'),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-008'));

  // 같은 문서의 진짜 canonical 행(D-204)은 계속 해소된다.
  const sane = runV2(t, { files: { 'global/open-decisions.md': decisionWithFencedHeading } });
  assert.deepEqual(messages(sane.errors), []);
});

test('v2 hard: 중복 `## Reconciliation Items` heading 은 첫 표 은닉이 아니라 RR-SCHEMA-018', (t) => {
  // getSections 는 중복 heading 에서 앞 섹션을 덮어쓴다 — 금지 effect(resolve)가 든 두 번째 섹션을
  // 붙여도(또는 반대 순서여도) heading 개수 자체로 fail-closed 해야 한다.
  const r = runV2(t, {
    registerExtra: [
      '## Reconciliation Items',
      '',
      ...ITEMS_HEADER,
      '| IN-20260720-meeting-001 | 99 | decision-answer | resolves-decision | resolve | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#summary | inherit | statement | inherit |',
      '',
    ].join('\n'),
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-018'));
});

test('v2: fence 안의 `## Reconciliation Items` 예시는 섹션/표 개수에 세지 않음', (t) => {
  const r = runV2(t, {
    registerExtra: [
      '## 메모',
      '',
      '```md',
      '## Reconciliation Items',
      '',
      ...ITEMS_HEADER,
      '| {IN-...} | {01} | {basis} | {classification} | {effect} | {target} | {evidence} | {ref} | {unit} | {at} |',
      '```',
      '',
    ].join('\n'),
  });
  assert.equal(hasCode(r.errors, 'RR-SCHEMA-018'), false);
  assert.equal(hasCode(r.errors, 'RR-SCHEMA-017'), false);
  assert.deepEqual(messages(r.errors), []);
});

test('v2 hard: fence 안의 heading 으로 만든 가짜 evidence 섹션은 해소되지 않음 (RR-REF-005)', (t) => {
  const inputWithFencedSection = FIGMA_INPUT + '\n```md\n## Ghost Section\n- fake bullet\n```\n';
  const r = runV2(t, {
    files: { 'inputs/IN-20260720-figma-001.md': inputWithFencedSection },
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('#extracted-facts/01', '#ghost-section/01'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.ok(hasCode(r.errors, 'RR-REF-005'));
});

test('markdown 전처리: 주석 안의 fence marker 는 이후 실제 내용을 삼키지 않음 (state machine)', () => {
  // 순차 2-pass(fence→comment)면 주석 안의 ``` 가 fence opener 로 오인돼 --> 뒤 내용이 통째로 사라진다.
  const text = ['앞 내용', '<!--', '```md', '-->', '## Reconciliation Items', '| a |', '뒤 내용'].join('\n');
  const cleaned = stripNonContent(text);
  assert.ok(cleaned.includes('앞 내용'));
  assert.ok(cleaned.includes('## Reconciliation Items')); // 주석 종료 뒤 내용은 살아 있어야 한다
  assert.ok(cleaned.includes('뒤 내용'));
  assert.ok(!cleaned.includes('```md'));

  // 인라인 주석 + 주석 종료 뒤 나머지 재처리.
  assert.ok(stripNonContent('a <!-- x --> b').includes('a  b'));
  const tail = stripNonContent(['<!-- 열림', '--> ```md', '| 표 |', '```'].join('\n'));
  assert.ok(!tail.includes('| 표 |')); // --> 뒤의 fence opener 는 유효 — 내부 표 제거
});

test('v2 hard: 주석 안 fence marker 로 중복 Items heading 을 숨길 수 없음 (RR-SCHEMA-018)', (t) => {
  const r = runV2(t, {
    registerExtra: [
      '<!--',
      '```md',
      '-->',
      '## Reconciliation Items',
      '',
      ...ITEMS_HEADER,
      '| IN-20260720-meeting-001 | 99 | decision-answer | resolves-decision | resolve | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#summary | inherit | statement | inherit |',
      '',
    ].join('\n'),
  });
  assert.ok(hasCode(r.errors, 'RR-SCHEMA-018'));
});

test('v2 hard: canonical Summary 표 부재/중복은 RR-SCHEMA-019', (t) => {
  // fence 안의 8컬럼 예시만 있고 실제 Summary 가 없음.
  const fencedOnly = runV2(t, {
    omitSummaryTable: true,
    summaryPrefix: ['```md', ...SUMMARY_HEADER, DEFAULT_SUMMARY_ROWS[0], '```'].join('\n'),
    itemRows: [],
  });
  assert.ok(hasCode(fencedOnly.errors, 'RR-SCHEMA-019'));

  // top-level 8컬럼 표가 2개.
  const duplicated = runV2(t, {
    summaryPrefix: [...SUMMARY_HEADER, DEFAULT_SUMMARY_ROWS[0]].join('\n') + '\n',
  });
  assert.ok(hasCode(duplicated.errors, 'RR-SCHEMA-019'));
});

test('v2 hard: fence 안 Summary 가 canonical 을 가리면 RR-SCHEMA-020, 주석 안 예시는 무해', (t) => {
  // fenced 예시 표가 raw body 의 "첫 파이프 표"가 되어 v1 파서가 그것을 읽는 경우 — canonical(실제 표)과
  // 불일치를 hard 로 표면화한다.
  const masked = runV2(t, {
    summaryPrefix: [
      '```md',
      ...SUMMARY_HEADER,
      '| IN-20260720-figma-001 | figma | simple-update | reconciled | accepted | - | - | - |',
      '```',
    ].join('\n'),
  });
  assert.ok(hasCode(masked.errors, 'RR-SCHEMA-020'));

  // HTML 주석 안의 Summary 예시는 v1/v2 어느 파서에도 보이지 않는다 — 정상 통과.
  const commented = runV2(t, {
    summaryPrefix: ['<!--', ...SUMMARY_HEADER, '| IN-X | figma | simple-update | reconciled | accepted | - | - | - |', '-->'].join('\n'),
  });
  assert.deepEqual(messages(commented.errors), []);
});

test('v2 hard: indented code 표·malformed 구분자는 canonical 표가 아님', (t) => {
  // 4칸 들여쓴 Items 표 — 렌더링상 code block 이므로 표로 인정하지 않는다 → 표 없음(RR-SCHEMA-004).
  const indentedItems = runV2(t, {
    itemsHeader: ITEMS_HEADER.map((l) => `    ${l}`),
    itemRows: DEFAULT_ITEM_ROWS.map((l) => `    ${l}`),
  });
  assert.ok(hasCode(indentedItems.errors, 'RR-SCHEMA-004'));

  // hyphen 없는 구분자(| | | ... |)는 delimiter 가 아니다.
  const noHyphen = runV2(t, {
    itemsHeader: [ITEMS_HEADER[0], '| ' + Array(10).fill(' ').join(' | ') + ' |'],
  });
  assert.ok(hasCode(noHyphen.errors, 'RR-SCHEMA-004'));

  // header(10칸) ↔ delimiter(9칸) 칸 수 불일치도 표가 아니다.
  const mismatched = runV2(t, {
    itemsHeader: [ITEMS_HEADER[0], `|${Array(9).fill('---').join('|')}|`],
  });
  assert.ok(hasCode(mismatched.errors, 'RR-SCHEMA-004'));

  // 4칸 들여쓴 Open Decisions 예시 표는 canonical decision row 가 아니다 → D-204 미해소.
  const indentedDecisions = DECISION_DOC.replace(
    '| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n|---|---|---|---|---|---|\n| D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |',
    '    | ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n    |---|---|---|---|---|---|\n    | D-204 | 로그인 성공 후 이동 위치 | home / returnTo | final-fixture-ui | PM | open |',
  );
  const r = runV2(t, { files: { 'global/open-decisions.md': indentedDecisions } });
  assert.ok(hasCode(r.errors, 'RR-REF-008'));
});

// ── warning-only ─────────────────────────────────────────────────────────────

test('v2 warning: annotation·Result 어휘·권고 조합·bullet index·row-key·n/a (에러 아님)', (t) => {
  const r = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0]
        .replace('simple-update + component-gap', 'simple-update (visual) + component-gap')
        .replace('| accepted |', '| pending user decision |'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
    itemRows: [
      DEFAULT_ITEM_ROWS[0]
        .replace('#extracted-facts/01', '#extracted-facts/09') // bullet 2개뿐 → index 미해소
        .replace('#component-mapping/M-001', '#component-mapping/M-999'), // row-key 미해소
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  // summary created 는 M-001 로 남아 target 문자열이 달라져 RR-ITEM-006 이 뜨는 것을 피하려면 summary 도 맞춘다.
  const r2 = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0]
        .replace('simple-update + component-gap', 'simple-update (visual) + component-gap')
        .replace('| accepted |', '| pending user decision |')
        .replace('#component-mapping/M-001', '#component-mapping/M-999'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
    itemRows: [
      DEFAULT_ITEM_ROWS[0]
        .replace('#extracted-facts/01', '#extracted-facts/09')
        .replace('#component-mapping/M-001', '#component-mapping/M-999'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.deepEqual(messages(r2.errors), []);
  const w = messages(r2.warnings);
  assert.ok(w.some((m) => m.startsWith('RR-SCHEMA-101:'))); // annotation
  assert.ok(w.some((m) => m.startsWith('RR-SCHEMA-102:'))); // Result 어휘 (warning-first)
  assert.ok(w.some((m) => m.startsWith('RR-REF-101:'))); // bullet index
  assert.ok(w.some((m) => m.startsWith('RR-REF-102:'))); // row-key
  assert.ok(r.errors.length >= 0); // r 은 참조용 (RR-ITEM-006 발화 여부와 무관)
});

test('v2 warning: Source Unit=n/a 는 reject 전용 (RP-101)', (t) => {
  const r = runV2(t, {
    itemRows: [
      DEFAULT_ITEM_ROWS[0].replace('| instance |', '| n/a |'),
      ...DEFAULT_ITEM_ROWS.slice(1),
    ],
  });
  assert.deepEqual(messages(r.errors), []);
  assert.ok(messages(r.warnings).some((m) => m.startsWith('RP-101:')));
});

// ── reject 라우팅 ─────────────────────────────────────────────────────────────

test('v2 pass: reject item 은 target - 와 Source Unit n/a 허용', (t) => {
  const r = runV2(t, {
    itemRows: [
      ...DEFAULT_ITEM_ROWS,
      '| IN-20260720-meeting-001 | 02 | reject | reject-input | reject | - | input:IN-20260720-meeting-001#extracted-facts | inherit | n/a | inherit |',
    ],
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0],
      DEFAULT_SUMMARY_ROWS[1].replace('| conflict |', '| conflict + reject-input |'),
    ],
  });
  assert.deepEqual(messages(r.errors), []);
  assert.deepEqual(messages(r.warnings), []);
});

// ── v1 compatibility (기존 fixture 출력 유지) ─────────────────────────────────

function runValidateJson(docsRel, extraArgs = []) {
  // validate 는 위반 시 exit 1 이므로(execFileSync throw) stdout 을 양쪽 경로에서 회수한다.
  try {
    const out = execFileSync(
      process.execPath,
      [VALIDATE, '--docs', path.join(RECON_EXAMPLES, docsRel, 'docs', 'frontend-workflow'), '--json', ...extraArgs],
      { encoding: 'utf8', cwd: KIT_ROOT },
    );
    return JSON.parse(out);
  } catch (err) {
    if (typeof err.stdout !== 'string' || err.stdout === '') throw err;
    return JSON.parse(err.stdout);
  }
}

test('v1 compat: reconciliation-validation/pass 는 여전히 에러 0 · RR- 메시지 0', () => {
  const json = runValidateJson('pass');
  assert.equal(json.ok, true);
  assert.equal(json.count, 0);
  const all = [...json.errors, ...json.warnings].map((e) => e.message);
  assert.ok(all.every((m) => !/^R[RP]-/.test(m)), `v1 fixture 에 v2 진단이 새면 안 됨: ${all}`);
});

test('v1 compat: reconciliation-validation/fail 은 기존 에러 4건·경고 구성 유지', () => {
  const json = runValidateJson('fail');
  assert.equal(json.ok, false);
  assert.equal(json.count, 4);
  const check12Warnings = json.warnings.filter((w) => w.check === 12);
  assert.equal(check12Warnings.length, 2);
  const all = [...json.errors, ...json.warnings].map((e) => e.message);
  assert.ok(all.every((m) => !/^R[RP]-/.test(m)));
});

test('v1 compat: --enforce 는 v1 미처리만 승격 (fail 트리 에러 6건)', () => {
  const json = runValidateJson('fail', ['--enforce']);
  assert.equal(json.count, 6);
});

test('v2 fixtures: examples/reconciliation-validation/v2-pass 는 에러·경고 0, v2-fail 은 메모의 기대 에러 11건', () => {
  const pass = runValidateJson('v2-pass');
  assert.equal(pass.ok, true);
  assert.equal(pass.count, 0);
  assert.deepEqual(pass.warnings, []);

  const fail = runValidateJson('v2-fail');
  assert.equal(fail.ok, false);
  assert.equal(fail.count, 11, JSON.stringify(fail.errors, null, 2));
  const codes = fail.errors.map((e) => e.message.split(':')[0]).sort();
  assert.deepEqual(codes, [
    'RP-001',
    'RP-002',
    'RR-ITEM-005',
    'RR-ITEM-006',
    'RR-ITEM-006',
    'RR-ITEM-007',
    'RR-REF-008',
    'RR-ROUTE-003',
    'RR-ROUTE-004',
    'RR-SCHEMA-008',
    'RR-SCHEMA-008',
  ]);
});

// ── v1 검사(validateReconciliationRegister)가 v2 register 에서도 그대로 동작 ────

test('v2 register 에서도 v1 lifecycle 검사(Reconcile Status)는 그대로 적용', (t) => {
  const r = runV2(t, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace('| reconciled |', '| in-progress |'),
      DEFAULT_SUMMARY_ROWS[1],
    ],
  });
  // v1 검사는 별도 모듈 — 여기서 직접 호출해 in-progress 가 여전히 에러인지 확인.
  const v1 = validateReconciliationRegister({
    register: r.register,
    inputArtifacts: r.inputArtifacts,
    registerFile: r.registerFile,
  });
  assert.ok(v1.errors.some((e) => e.message.includes('in-progress')));
});

// ── items parser 단독 ─────────────────────────────────────────────────────────

test('parseReconciliationItems: 섹션/표/행 파싱', () => {
  const body = [
    '# Register',
    '',
    ...SUMMARY_HEADER,
    ...DEFAULT_SUMMARY_ROWS,
    '',
    '## Reconciliation Items',
    '',
    ...ITEMS_HEADER,
    ...DEFAULT_ITEM_ROWS,
  ].join('\n');
  const parsed = parseReconciliationItems(body);
  assert.equal(parsed.sectionExists, true);
  assert.deepEqual(parsed.missingCols, []);
  assert.equal(parsed.rows.length, 4);
  assert.equal(parsed.rows[0].item, '01');
  assert.equal(parsed.rows[3].effect, 'reopen');

  const noSection = parseReconciliationItems('# Register\n\n표 없음');
  assert.equal(noSection.sectionExists, false);
});
