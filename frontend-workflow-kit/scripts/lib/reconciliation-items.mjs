// Reconciliation Contract v2 — `## Reconciliation Items` effect 표 + summary projection + typed
// target/evidence grammar + routing matrix (validate.mjs 검사 12 의 v2 확장, 순수 로직).
// 계약 단일 출처: input-reconciliation.md "Reconciliation Contract v2" + reconciliation-register.template.md.
//
// ── 경계 (설계 #202 결정 D4·D5) ────────────────────────────────────────────────
//  - hard 는 "선언된 구조·참조·routing" 만: enum/문법, 참조 해소, summary↔items multiset,
//    basis/classification/effect/target 허용 행렬, provenance 필수값·timestamp 형식.
//  - 자연어 의미 추정(Unknown 문구가 conflict 처럼 보임 등)은 여기 없다 — 202-C warning-only.
//  - Result ↔ 현재 자식 status 의 stale 대조도 여기 없다(202-C warning). effect 는 reconcile
//    시점의 역사적 행위 기록이며, target 의 "현재" status 를 hard 하게 요구하지 않는다.
//  - effect 어휘에 resolve/close/accept/confirm/implement 는 의도적으로 없다 —
//    machine record 차원의 gate-raising-only 경계. 실제 diff 의 금지 전이는 reviewer
//    (docs/reference/reconcile-review-rubric.md, review_profile=reconcile-stage04-v1)가 본다.
//  - v1 register(frontmatter 에 reconciliation_contract 없음)는 이 모듈이 아무것도 내지 않는다.
//
// 진단 메시지 stable prefix (설계 §11.1 — JSON shape 는 불변, message 접두로 제공):
//   RR-SCHEMA-0xx  register/frontmatter/표 구조·grammar (hard)
//   RR-ITEM-0xx    item/effect/summary projection (hard)
//   RR-REF-0xx     참조 해소 (hard)
//   RR-ROUTE-0xx   routing matrix (hard)
//   RP-0xx         provenance 필수값·형식 (hard)
//   *-1xx          warning-first (RR-SCHEMA-1xx annotation/Result 권고, RR-REF-1xx bullet/row-key,
//                  RP-1xx n/a·captured_at 파싱 불가). --enforce 로도 hard 승격하지 않는다.
//
// 이 모듈은 순수하다 — { errors:[{file,message}], warnings:[{file,message}] } 를 반환하고
// file 은 항상 절대경로다. validate.mjs 가 add()/warn() 으로 상대화한다.
import { readFileSafe, splitFrontmatter } from './util.mjs';
import { getSections, parseTables, hasHeader, col } from './spec.mjs';
import { RECONCILE_STATUS_VALUES } from './reconciliation-register.mjs';
import { INHERIT, SOURCE_UNIT_VALUES, isRfc3339, parseRfc3339 } from './provenance.mjs';
import {
  resolveArtifact,
  isDuplicateArtifactId,
  artifactHasSection,
  sectionRowKeyExists,
  resolveChildRow,
  bodyHasToken,
  slugifySectionTitle,
} from './reconciliation-target-index.mjs';

export const RECONCILIATION_CONTRACT_V2 = 2;
export const REVIEW_PROFILE_STAGE04 = 'reconcile-stage04-v1';

// classification enum — input-reconciliation.md §Classification 과 동일 어휘.
export const CLASSIFICATION_VALUES = [
  'simple-update',
  'resolves-unknown',
  'resolves-decision',
  'new-decision',
  'component-gap',
  'investigation-needed',
  'conflict',
  'scope-unclear',
  'reject-input',
];

// routing basis enum (설계 §5.4).
export const BASIS_VALUES = [
  'compatible-fact',
  'visual-evidence',
  'unknown-answer',
  'decision-answer',
  'new-choice',
  'component-missing',
  'verification-gap',
  'input-input-conflict',
  'resolved-decision-conflict',
  'scope-unclear',
  'reject',
];

// effect enum (설계 §5.5). resolve/close/accept/confirm/implement 는 의도적 부재 — gate-raising-only.
export const EFFECT_VALUES = ['update', 'create', 'create-open', 'reopen', 'link-evidence', 'record', 'reject'];

// summary `Created Items` 집합에 투영되는 effect (설계 §7.3).
export const CREATING_EFFECTS = ['create', 'create-open', 'reopen', 'link-evidence', 'record'];

// summary `Result` canonical code (설계 §5.2 — 초기 rollout warning-first).
export const RESULT_VALUES = [
  'pending',
  'accepted',
  'rejected',
  'pending-user-decision',
  'delegated',
  'no-change',
  'mixed',
  'failed',
];

// Reconcile Status → 권고 Result 조합 (warning-first).
const RESULT_BY_STATUS = {
  'not-started': ['pending'],
  'in-progress': ['pending'],
  failed: ['failed'],
  reconciled: ['accepted', 'rejected', 'pending-user-decision', 'delegated', 'no-change', 'mixed'],
};

export const ITEMS_SECTION_KEY = 'reconciliation items';
export const REQUIRED_ITEM_COLS = [
  'Input ID',
  'Item',
  'Basis',
  'Classification',
  'Effect',
  'Target',
  'Evidence',
  'Source Ref',
  'Source Unit',
  'Captured At',
];

// child target kind → 요구 ID 접두 (grammar 차원의 kind 검사).
const CHILD_KIND_PREFIX = {
  decision: 'D-',
  unknown: 'U-',
  conflict: 'C-',
  gap: 'G-',
  investigation: 'INV-',
  verification: 'VER-',
};

// canonical 표(row index)로 해소하는 child kind. INV-/VER- 는 canonical register 가 없어
// owner 문서 본문 토큰 존재로 해소한다(설계 §8.1 은 D-/C-/U-/G- 만 row 해소를 요구).
const TABLE_RESOLVED_KINDS = new Set(['decision', 'unknown', 'conflict', 'gap']);

// visual-evidence 가 허용하는 artifact_type (설계 §6.1).
const VISUAL_ALLOWED_ARTIFACT_TYPES = new Set([
  'figma-component-mapping',
  'visual-consistency-contract',
  'component-gap-register',
]);
// visual-evidence 가 ScreenSpec 안에서 허용하는 섹션 — 시각 reference 를 담는 제한된 섹션만.
const VISUAL_ALLOWED_SCREEN_SECTIONS = new Set(['ui-sections', 'notes', 'sources']);
// scope-unclear/visual 판단용: screen-level 로 보는 artifact_type.
const SCREEN_LEVEL_ARTIFACT_TYPES = new Set(['screen-spec', 'figma-component-mapping']);

// ── frontmatter contract ─────────────────────────────────────────────────────

// register frontmatter 의 contract 버전/필드 파싱 (설계 §5.1).
//   { version: 1|2|null, reviewProfile, structuredSince, structuredSinceMs, errors: [message] }
//   - reconciliation_contract 부재 → version 1 (v1 동작 그대로, 에러 없음).
//   - 2 이외의 값 → version null + RR-SCHEMA-001 (v2 검사를 켜지 않되 hard fail).
export function parseRegisterContract(fm) {
  const errors = [];
  const raw = fm?.reconciliation_contract;
  if (raw === undefined || raw === null) return { version: 1, errors };
  if (!(raw === RECONCILIATION_CONTRACT_V2 || raw === String(RECONCILIATION_CONTRACT_V2))) {
    errors.push(
      `RR-SCHEMA-001: reconciliation_contract 값 '${raw}' 미지원 → 해소: 2 를 쓰거나 필드를 제거해 v1 로 두세요`,
    );
    return { version: null, errors };
  }
  const reviewProfile = fm.review_profile;
  if (reviewProfile !== REVIEW_PROFILE_STAGE04) {
    errors.push(
      `RR-SCHEMA-002: v2 register 는 review_profile: ${REVIEW_PROFILE_STAGE04} 가 필수 (현재: ${JSON.stringify(reviewProfile ?? null)}) — 계약: docs/reference/reconcile-review-rubric.md`,
    );
  }
  const structuredSince = fm.structured_since;
  let structuredSinceMs = null;
  if (typeof structuredSince !== 'string' || !isRfc3339(structuredSince)) {
    errors.push(
      `RR-SCHEMA-003: v2 register 는 structured_since 가 RFC3339(with timezone) 필수 (현재: ${JSON.stringify(structuredSince ?? null)}) — 예: "2026-07-20T00:00:00+09:00"`,
    );
  } else {
    structuredSinceMs = parseRfc3339(structuredSince);
  }
  return { version: 2, reviewProfile, structuredSince, structuredSinceMs, errors };
}

// ── grammar parsers ──────────────────────────────────────────────────────────

// summary Classification 셀: `<classification>[×N] + <classification>[×N] ...`
//   { entries: Map(name → count), hasAnnotation, errors: [message-fragment] }
export function parseSummaryClassification(cell) {
  const entries = new Map();
  const errors = [];
  let text = String(cell || '').trim();
  // 괄호 annotation 은 v2 summary 에서 warning-first (설계 §5.2) — 파싱에선 제거하고 표시만.
  const hasAnnotation = /\([^)]*\)/.test(text);
  text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) {
    errors.push('Classification 셀이 비어 있음');
    return { entries, hasAnnotation, errors };
  }
  for (const partRaw of text.split('+')) {
    const part = partRaw.trim();
    if (!part) {
      errors.push("빈 '+' 항목");
      continue;
    }
    const m = /^([a-z][a-z-]*)(?:×(\d+))?$/.exec(part);
    if (!m) {
      errors.push(`'${part}' 는 <classification>[×N] 문법이 아님`);
      continue;
    }
    const name = m[1];
    const count = m[2] ? Number(m[2]) : 1;
    if (!CLASSIFICATION_VALUES.includes(name)) {
      errors.push(`classification enum 위반: '${name}' (기대 ${CLASSIFICATION_VALUES.join('|')})`);
      continue;
    }
    if (count < 1) {
      errors.push(`'${part}' 의 ×N 은 1 이상이어야 함`);
      continue;
    }
    entries.set(name, (entries.get(name) || 0) + count);
  }
  return { entries, hasAnnotation, errors };
}

// typed target 토큰 하나를 파싱한다 (설계 §5.6).
//   artifact:<artifact_id>[#<section-slug>[/<row-key>]]
//   decision:<D-ID>@<owner-artifact-id>  (unknown/conflict/gap/investigation/verification 동형)
//   input:<input_id>   (reject 전용 — 원 input 을 가리킬 때)
//   '-'                (target 없음 — reject 전용)
// 반환: { kind, ... } 또는 null(문법 위반).
export function parseTargetRef(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (t === '-') return { kind: 'none', raw: t };
  let m = /^artifact:([A-Za-z0-9][A-Za-z0-9._-]*)(?:#([a-z0-9][a-z0-9-]*)(?:\/([A-Za-z0-9][A-Za-z0-9._: -]*))?)?$/.exec(t);
  if (m) return { kind: 'artifact', artifactId: m[1], section: m[2] || null, rowKey: m[3] || null, raw: t };
  m = /^(decision|unknown|conflict|gap|investigation|verification):([A-Z][A-Z]*-[A-Za-z0-9-]+)@([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(t);
  if (m) {
    const kind = m[1];
    const rowId = m[2];
    if (!rowId.startsWith(CHILD_KIND_PREFIX[kind])) return null; // kind ↔ ID 접두 모순은 문법 위반
    return { kind, rowId, ownerArtifactId: m[3], raw: t };
  }
  m = /^input:([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(t);
  if (m) return { kind: 'input', inputId: m[1], raw: t };
  return null;
}

// evidence 토큰: input:<input_id>#<section-slug>[/<bullet-index>] (설계 §5.7).
// bullet index 는 1-based(01, 02...) — `/00` 은 어떤 bullet 도 가리킬 수 없으므로 문법 위반이다.
export function parseEvidenceRef(token) {
  const t = String(token || '').trim();
  const m = /^input:([A-Za-z0-9][A-Za-z0-9._-]*)#([a-z0-9][a-z0-9-]*)(?:\/(\d+))?$/.exec(t);
  if (!m) return null;
  const bulletIndex = m[3] ? Number(m[3]) : null;
  if (bulletIndex !== null && bulletIndex < 1) return null;
  return { inputId: m[1], section: m[2], bulletIndex, raw: t };
}

// 세미콜론 구분 typed ref 목록 셀 (Touched Artifacts / Created Items). '-' = 빈 목록.
function splitRefList(cell) {
  const text = String(cell || '').trim();
  if (!text || text === '-') return [];
  return text
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── items 표 파싱 ─────────────────────────────────────────────────────────────

// register 본문에서 `## Reconciliation Items` 표를 파싱한다.
//   { sectionExists, table, missingCols, rows }
//   rows: [{ inputId, item, basis, classification, effect, target, evidence, sourceRef, sourceUnit, capturedAt, line }]
export function parseReconciliationItems(body) {
  const sections = getSections(String(body || ''));
  const sectionText = sections[ITEMS_SECTION_KEY];
  if (sectionText === undefined) {
    return { sectionExists: false, table: null, missingCols: [], rows: [] };
  }
  const tables = parseTables(sectionText);
  const table = tables.length ? tables[0] : null;
  if (!table) return { sectionExists: true, table: null, missingCols: [], rows: [] };
  const missingCols = REQUIRED_ITEM_COLS.filter((c) => !hasHeader(table.headers, c));
  const rows = [];
  for (const r of table.rows) {
    const row = {
      inputId: (col(r, 'Input ID') || '').trim(),
      item: (col(r, 'Item') || '').trim(),
      basis: (col(r, 'Basis') || '').trim(),
      classification: (col(r, 'Classification') || '').trim(),
      effect: (col(r, 'Effect') || '').trim(),
      target: (col(r, 'Target') || '').trim(),
      evidence: (col(r, 'Evidence') || '').trim(),
      sourceRef: (col(r, 'Source Ref') || '').trim(),
      sourceUnit: (col(r, 'Source Unit') || '').trim(),
      capturedAt: (col(r, 'Captured At') || '').trim(),
    };
    const allEmpty = Object.values(row).every((v) => v === '');
    if (!allEmpty) rows.push(row);
  }
  return { sectionExists: true, table, missingCols, rows };
}

// ── routing matrix (설계 §6) ──────────────────────────────────────────────────

// basis → 요구 classification.
const ROUTING_CLASSIFICATION = {
  'compatible-fact': 'simple-update',
  'visual-evidence': 'simple-update',
  'unknown-answer': 'resolves-unknown',
  'decision-answer': 'resolves-decision',
  'new-choice': 'new-decision',
  'component-missing': 'component-gap',
  'verification-gap': 'investigation-needed',
  'input-input-conflict': 'conflict',
  'resolved-decision-conflict': 'conflict',
  'scope-unclear': 'scope-unclear',
  reject: 'reject-input',
};

// basis 별 (effect, target.kind) 허용 조합. scope-unclear 의 artifact 는 screen-level 금지를
// 별도 검사(RR-ROUTE-005)로 얹는다. visual-evidence 의 artifact 는 §6.1 시각 target 규칙을 얹는다.
const ROUTING_COMBOS = {
  'compatible-fact': [{ effects: ['update', 'create'], kinds: ['artifact'] }],
  'visual-evidence': [{ effects: ['update', 'create'], kinds: ['artifact'] }],
  'unknown-answer': [{ effects: ['link-evidence'], kinds: ['unknown'] }],
  'decision-answer': [{ effects: ['link-evidence'], kinds: ['decision'] }],
  'new-choice': [{ effects: ['create-open'], kinds: ['decision'] }],
  'component-missing': [{ effects: ['create-open'], kinds: ['gap'] }],
  'verification-gap': [
    { effects: ['create-open', 'record'], kinds: ['investigation', 'verification'] },
    { effects: ['create-open'], kinds: ['decision'] },
  ],
  'input-input-conflict': [
    { effects: ['create-open', 'record'], kinds: ['conflict'] },
    { effects: ['create-open'], kinds: ['decision'] },
  ],
  'resolved-decision-conflict': [
    { effects: ['create-open'], kinds: ['conflict'] },
    { effects: ['reopen'], kinds: ['decision'] },
  ],
  'scope-unclear': [
    { effects: ['create-open', 'link-evidence', 'record'], kinds: ['unknown', 'decision'] },
    { effects: ['update', 'create', 'record'], kinds: ['artifact'] },
  ],
  reject: [{ effects: ['reject'], kinds: ['none', 'input'] }],
};

// basis 별 group-level 필수 target kind (하나 이상 존재해야 함).
const ROUTING_REQUIRED_KINDS = {
  'unknown-answer': [['unknown']],
  'decision-answer': [['decision']],
  'new-choice': [['decision']],
  'component-missing': [['gap']],
  'verification-gap': [['investigation', 'verification']],
  'input-input-conflict': [['conflict']],
};

function comboAllowed(basis, effect, kind) {
  const combos = ROUTING_COMBOS[basis] || [];
  return combos.some((c) => c.effects.includes(effect) && c.kinds.includes(kind));
}

// ── main v2 validator ─────────────────────────────────────────────────────────

// Reconciliation Contract v2 검증. v1 검사(validateReconciliationRegister)에 얹는 추가 검사다.
//   register       parseReconciliationRegister 결과 (fm/body 포함)
//   registerFile   register 절대경로
//   inputArtifacts collectInputArtifacts 결과 (검사 11·12 와 동일 객체 공유)
//   targetIndex    buildReconciliationTargetIndex 결과
// v1 register(contract 필드 없음)면 빈 결과 — v1 출력 byte-compatible.
export function validateReconciliationV2({ register, registerFile, inputArtifacts = [], targetIndex }) {
  const errors = [];
  const warnings = [];
  if (!register || !register.exists) return { errors, warnings };
  const contract = parseRegisterContract(register.fm || {});
  if (contract.version === 1) return { errors, warnings };
  const add = (message) => errors.push({ file: registerFile, message });
  const warn = (message) => warnings.push({ file: registerFile, message });
  for (const message of contract.errors) add(message);
  if (contract.version !== 2) return { errors, warnings };

  // --- 입력 인덱스 (검사 11 과 동일 수집 결과 공유) ---
  const inputsById = new Map();
  for (const a of inputArtifacts) {
    if (a.parseError) continue;
    const id = a.fm?.input_id;
    if (typeof id === 'string' && id.trim() !== '' && !inputsById.has(id)) inputsById.set(id, a);
  }
  // evidence 섹션 해소용 입력 본문 인덱스 (lazy — 참조된 입력만 읽는다).
  const inputSectionCache = new Map();
  const inputSectionsOf = (inputId) => {
    if (inputSectionCache.has(inputId)) return inputSectionCache.get(inputId);
    const a = inputsById.get(inputId);
    let value = null;
    if (a) {
      const { body } = splitFrontmatter(readFileSafe(a.file));
      const slugs = new Map(); // slug → bullet count
      const sections = getSections(String(body || ''));
      for (const [title, text] of Object.entries(sections)) {
        const bullets = String(text)
          .split(/\r?\n/)
          .filter((l) => /^\s*(?:[-*]|\d+[.)])\s+/.test(l)).length;
        slugs.set(slugifySectionTitle(title), bullets);
      }
      value = slugs;
    }
    inputSectionCache.set(inputId, value);
    return value;
  };

  // --- items 표 (v2 필수 구조) ---
  const items = parseReconciliationItems(register.body || '');
  if (!items.sectionExists || !items.table) {
    add(
      'RR-SCHEMA-004: v2 register 에 `## Reconciliation Items` 표 없음 → 해소: 10컬럼 표(| ' +
        REQUIRED_ITEM_COLS.join(' | ') +
        ' |)를 두세요 (입력 전이면 헤더만)',
    );
  } else if (items.missingCols.length) {
    add(`RR-SCHEMA-005: Reconciliation Items 표 필수 컬럼 누락: ${items.missingCols.join(', ')}`);
  }
  const itemRowsUsable = items.sectionExists && items.table && items.missingCols.length === 0;

  // --- summary 행 분류: structured vs legacy (structured_since 기준, 설계 §5.1·§16) ---
  const summaryByInput = new Map();
  for (const row of register.rows) {
    if (!row.inputId) continue;
    if (!summaryByInput.has(row.inputId)) summaryByInput.set(row.inputId, row); // 중복은 v1 검사가 에러
  }
  const itemsByInput = new Map();
  if (itemRowsUsable) {
    for (const row of items.rows) {
      if (!row.inputId) continue;
      if (!itemsByInput.has(row.inputId)) itemsByInput.set(row.inputId, []);
      itemsByInput.get(row.inputId).push(row);
    }
  }

  const structuredInputs = new Set(); // summary grammar + projection 대상
  for (const inputId of summaryByInput.keys()) {
    const input = inputsById.get(inputId);
    if (!input) {
      add(`RR-REF-001: summary Input ID '${inputId}' 가 inputs/ 의 input artifact 로 해소되지 않음`);
      continue;
    }
    const hasItems = (itemsByInput.get(inputId) || []).length > 0;
    let structuredByTime = false;
    if (contract.structuredSinceMs !== null) {
      // cutoff 비교는 공유 parser(parseRfc3339)만 쓴다 — raw Date.parse 는 타임존 없는 local
      // timestamp 를 실행 환경에 따라 다르게 해석하므로 결정적 게이트 입력이 될 수 없다.
      const capturedAt = input.fm?.captured_at;
      const capturedMs = typeof capturedAt === 'string' ? parseRfc3339(capturedAt) : null;
      if (capturedMs === null) {
        if (!hasItems) {
          warn(
            `RP-102: '${inputId}' 의 captured_at ('${capturedAt ?? ''}') 이 RFC3339(with timezone) 가 아니라 legacy(summary-only) 로 취급 — 형식을 고치면 structured 판정에 들어갑니다`,
          );
        }
      } else {
        structuredByTime = capturedMs >= contract.structuredSinceMs;
      }
    }
    if (structuredByTime && !hasItems && itemRowsUsable) {
      add(
        `RR-ITEM-001: '${inputId}' 는 structured_since(${contract.structuredSince}) 이후 capture 된 입력인데 Reconciliation Items 행이 없음`,
      );
    }
    if (structuredByTime || hasItems) structuredInputs.add(inputId);
  }

  // --- structured summary 행의 grammar 검사 (legacy 행은 건드리지 않는다 — §16.2) ---
  const knownInputIds = new Set(inputsById.keys());
  const summaryParsed = new Map(); // inputId → { classification, touchedRefs, createdRefs }
  for (const inputId of structuredInputs) {
    const row = summaryByInput.get(inputId);
    if (!row) continue;

    const cls = parseSummaryClassification(row.classification);
    for (const e of cls.errors) {
      add(`RR-SCHEMA-006: '${inputId}' summary Classification: ${e} (문법 <classification>[×N] + ...)`);
    }
    if (cls.hasAnnotation) {
      warn(
        `RR-SCHEMA-101: '${inputId}' summary Classification 에 괄호 annotation 사용 — v2 에서는 annotation 을 item 표에 두세요 (향후 금지 후보)`,
      );
    }

    const touchedRefs = [];
    for (const token of splitRefList(row.touched)) {
      const ref = parseTargetRef(token);
      if (!ref || ref.kind !== 'artifact') {
        add(
          `RR-SCHEMA-007: '${inputId}' summary Touched Artifacts 항목 '${token}' 은 typed artifact ref(artifact:<artifact_id>[#section]) 가 아님`,
        );
        continue;
      }
      touchedRefs.push(ref);
    }

    const createdRefs = [];
    if (/\([^)]*\)/.test(String(row.created || ''))) {
      add(
        `RR-SCHEMA-008: '${inputId}' summary Created Items 에 '(open)' 류 상태 주석 금지 — 현재 상태의 단일 출처는 대상 표 (typed ref 만)`,
      );
    }
    for (const token of splitRefList(row.created)) {
      const ref = parseTargetRef(token);
      if (!ref || ref.kind === 'none' || ref.kind === 'input') {
        add(
          `RR-SCHEMA-008: '${inputId}' summary Created Items 항목 '${token}' 은 typed target ref(decision:D-x@owner / artifact:<id> 등) 가 아님`,
        );
        continue;
      }
      createdRefs.push(ref);
    }

    // Result — 초기 rollout warning-first (설계 §5.2). 빈 셀도 canonical code 가 아니므로 경고한다.
    const result = row.result;
    if (!result || !RESULT_VALUES.includes(result)) {
      warn(
        `RR-SCHEMA-102: '${inputId}' summary Result '${result || '(빈값)'}' 는 canonical code 가 아님 (기대 ${RESULT_VALUES.join('|')}) — 초기 rollout warning-first`,
      );
    } else if (
      RECONCILE_STATUS_VALUES.includes(row.reconcileStatus) &&
      !(RESULT_BY_STATUS[row.reconcileStatus] || []).includes(result)
    ) {
      warn(
        `RR-SCHEMA-103: '${inputId}' Reconcile Status=${row.reconcileStatus} 와 Result=${result} 의 권고 조합 위반 (허용: ${(RESULT_BY_STATUS[row.reconcileStatus] || []).join('|')})`,
      );
    }

    // Supersedes — '-' 또는 존재하는 input_id (설계 §5.2). 빈 셀은 문법 위반(hard) — 대체 안 함은 '-' 로 명시.
    const sup = row.supersedes;
    if (!sup) {
      add(`RR-SCHEMA-016: '${inputId}' summary Supersedes 가 비어 있음 — '-'(대체 없음) 또는 존재하는 input_id 를 쓰세요`);
    } else if (sup !== '-' && !knownInputIds.has(sup)) {
      add(`RR-REF-010: '${inputId}' summary Supersedes '${sup}' 가 존재하는 input_id 로 해소되지 않음`);
    }

    summaryParsed.set(inputId, { classification: cls.entries, touchedRefs, createdRefs });
  }

  if (!itemRowsUsable) return { errors, warnings }; // 표 구조가 없으면 행 검사 불가 — 여기서 끝

  // --- item/effect 행 검사 ---
  const groups = new Map(); // `${inputId}\0${item}` → { rows: [{row, target(parsed)|null}] }
  const effectDupSeen = new Set();
  for (const row of items.rows) {
    const label = `item ${row.inputId || '(no-input)'}#${row.item || '?'}`;

    // 필수 셀 (10컬럼 전부 계약 필수 — 설계 §5.3).
    const requiredCells = [
      ['Input ID', row.inputId],
      ['Item', row.item],
      ['Basis', row.basis],
      ['Classification', row.classification],
      ['Effect', row.effect],
      ['Target', row.target],
      ['Evidence', row.evidence],
      ['Source Ref', row.sourceRef],
      ['Source Unit', row.sourceUnit],
      ['Captured At', row.capturedAt],
    ];
    const missing = requiredCells.filter(([, v]) => !v).map(([name]) => name);
    if (missing.length) {
      add(`RR-SCHEMA-009: ${label} 행의 필수 셀 빈값: ${missing.join(', ')}`);
    }

    if (row.item && !/^\d{2}$/.test(row.item)) {
      add(`RR-SCHEMA-010: ${label} 의 Item ID '${row.item}' 형식 위반 (input-scoped 2자리: 01, 02...)`);
    }
    if (row.basis && !BASIS_VALUES.includes(row.basis)) {
      add(`RR-SCHEMA-011: ${label} 의 Basis enum 위반: '${row.basis}' (기대 ${BASIS_VALUES.join('|')})`);
    }
    if (row.classification && !CLASSIFICATION_VALUES.includes(row.classification)) {
      add(
        `RR-SCHEMA-012: ${label} 의 Classification enum 위반: '${row.classification}' (기대 ${CLASSIFICATION_VALUES.join('|')})`,
      );
    }
    if (row.effect && !EFFECT_VALUES.includes(row.effect)) {
      add(
        `RR-SCHEMA-013: ${label} 의 Effect enum 위반: '${row.effect}' (기대 ${EFFECT_VALUES.join('|')} — resolve/close/accept/confirm 은 사람 전용이라 어휘에 없음)`,
      );
    }

    // Input ID 참조: summary 행 + input artifact 양쪽 (설계 §8.1).
    if (row.inputId) {
      if (!summaryByInput.has(row.inputId)) {
        add(`RR-REF-002: ${label} 의 Input ID 가 Summary Table 에 없음 (orphan item)`);
      }
      if (!inputsById.has(row.inputId)) {
        add(`RR-REF-003: ${label} 의 Input ID 가 inputs/ 의 input artifact 로 해소되지 않음`);
      }
    }

    // Target grammar + 참조 해소.
    let target = null;
    if (row.target) {
      target = parseTargetRef(row.target);
      if (!target) {
        add(`RR-SCHEMA-014: ${label} 의 Target '${row.target}' 문법 위반 (artifact:<id>[#sec[/row]] | decision:D-x@owner | ... | input:<id> | -)`);
      } else if (target.kind === 'artifact') {
        const rec = resolveArtifact(targetIndex, target.artifactId);
        if (isDuplicateArtifactId(targetIndex, target.artifactId)) {
          add(
            `RR-REF-012: ${label} 의 target artifact '${target.artifactId}' 가 여러 문서에 중복 선언돼 owner 를 결정할 수 없음 — artifact_id 를 전역 유일하게 만드세요`,
          );
        } else if (!rec) {
          add(`RR-REF-006: ${label} 의 target artifact '${target.artifactId}' 가 실제 문서(artifact_id)로 해소되지 않음`);
        } else {
          if (target.section && !artifactHasSection(rec, target.section)) {
            add(`RR-REF-007: ${label} 의 target section '#${target.section}' 이 '${target.artifactId}' 문서에 없음`);
          } else if (target.section && target.rowKey && !sectionRowKeyExists(rec, target.section, target.rowKey)) {
            warn(
              `RR-REF-102: ${label} 의 target row '#${target.section}/${target.rowKey}' 를 해당 섹션 표에서 찾지 못함 (warning-first)`,
            );
          }
        }
      } else if (target.kind !== 'none' && target.kind !== 'input') {
        const rec = resolveArtifact(targetIndex, target.ownerArtifactId);
        if (isDuplicateArtifactId(targetIndex, target.ownerArtifactId)) {
          add(
            `RR-REF-012: ${label} 의 target owner artifact '${target.ownerArtifactId}' 가 여러 문서에 중복 선언돼 owner 를 결정할 수 없음 — artifact_id 를 전역 유일하게 만드세요`,
          );
        } else if (!rec) {
          add(
            `RR-REF-006: ${label} 의 target owner artifact '${target.ownerArtifactId}' 가 실제 문서(artifact_id)로 해소되지 않음`,
          );
        } else if (TABLE_RESOLVED_KINDS.has(target.kind)) {
          const resolved = resolveChildRow(rec, target.rowId, target.kind);
          if (!resolved.found) {
            add(`RR-REF-008: ${label} 의 target row '${target.rowId}' 가 '${target.ownerArtifactId}' 의 표에서 해소되지 않음`);
          } else if (resolved.familyMismatch) {
            add(
              `RR-REF-009: ${label} 의 target kind '${target.kind}' 와 '${target.rowId}' 가 실제로 사는 섹션 가족이 불일치`,
            );
          }
        } else if (!bodyHasToken(rec, target.rowId)) {
          add(`RR-REF-008: ${label} 의 target '${target.rowId}' 토큰이 '${target.ownerArtifactId}' 문서 본문에 없음`);
        }
      } else if (target.kind === 'input') {
        // input target 은 reject item 이 "원 input(자기 자신)" 을 가리키는 용도다 — 다른 입력을
        // 가리키면 기각 기록이 엉뚱한 입력에 걸린다(routing matrix: `-` 또는 원 input).
        if (row.inputId && target.inputId !== row.inputId) {
          add(
            `RR-REF-011: ${label} 의 target input '${target.inputId}' 은 이 item 의 Input ID('${row.inputId}')와 같아야 함 (reject 의 원 input 전용)`,
          );
        } else if (!knownInputIds.has(target.inputId)) {
          add(`RR-REF-006: ${label} 의 target input '${target.inputId}' 가 해소되지 않음`);
        }
      }
    }

    // Evidence grammar + 같은 input + 섹션 존재(hard) / bullet index(warning) (설계 §5.7).
    if (row.evidence) {
      const ev = parseEvidenceRef(row.evidence);
      if (!ev) {
        add(`RR-SCHEMA-015: ${label} 의 Evidence '${row.evidence}' 문법 위반 (input:<input_id>#<section-slug>[/NN])`);
      } else {
        if (row.inputId && ev.inputId !== row.inputId) {
          add(`RR-REF-004: ${label} 의 Evidence 가 다른 입력(${ev.inputId})을 가리킴 — 같은 Input ID 여야 함`);
        }
        const sections = inputSectionsOf(ev.inputId);
        if (sections) {
          if (!sections.has(ev.section)) {
            add(`RR-REF-005: ${label} 의 Evidence section '#${ev.section}' 이 input '${ev.inputId}' 문서에 없음`);
          } else if (ev.bulletIndex !== null && ev.bulletIndex > (sections.get(ev.section) || 0)) {
            warn(
              `RR-REF-101: ${label} 의 Evidence bullet index '/${String(ev.bulletIndex).padStart(2, '0')}' 가 '#${ev.section}' 의 bullet 수(${sections.get(ev.section) || 0})를 넘음 (warning-first)`,
            );
          }
        }
        // input 자체가 해소 안 되는 경우는 RR-REF-003 이 이미 가리킨다.
      }
    }

    // Provenance 필수값 (item 표는 신규 계약이라 처음부터 hard — 설계 D4·§9).
    if (row.sourceUnit && !SOURCE_UNIT_VALUES.includes(row.sourceUnit)) {
      add(`RP-001: ${label} 의 Source Unit enum 위반: '${row.sourceUnit}' (기대 ${SOURCE_UNIT_VALUES.join('|')})`);
    } else if (row.sourceUnit === 'n/a' && row.effect && row.effect !== 'reject') {
      warn(`RP-101: ${label} 의 Source Unit=n/a 는 reject 또는 source 없는 procedural item 전용 (현재 Effect=${row.effect})`);
    }
    if (row.capturedAt && row.capturedAt !== INHERIT && !isRfc3339(row.capturedAt)) {
      add(`RP-002: ${label} 의 Captured At '${row.capturedAt}' 은 '${INHERIT}' 또는 RFC3339(with timezone) 여야 함`);
    }
    const inputFm = inputsById.get(row.inputId)?.fm;
    if (row.sourceRef === INHERIT && inputFm && (typeof inputFm.source_ref !== 'string' || inputFm.source_ref.trim() === '')) {
      add(`RP-003: ${label} 의 Source Ref=inherit 인데 input '${row.inputId}' frontmatter 에 source_ref 가 없음`);
    }
    if (row.capturedAt === INHERIT && inputFm) {
      if (typeof inputFm.captured_at !== 'string' || inputFm.captured_at.trim() === '') {
        add(`RP-003: ${label} 의 Captured At=inherit 인데 input '${row.inputId}' frontmatter 에 captured_at 가 없음`);
      } else if (!isRfc3339(inputFm.captured_at)) {
        // inherit 는 상속값을 이 item 의 provenance 로 채택하는 선언이다 — 해소된 값도 같은 RFC3339
        // 계약을 통과해야 한다(검사 11 전체의 형식 hard 승격은 202-B 지만, v2 item 이 상속을 선택한
        // 순간 그 timestamp 는 이미 v2 hard contract 의 입력이다).
        add(
          `RP-004: ${label} 의 Captured At=inherit 인데 input '${row.inputId}' 의 captured_at ('${inputFm.captured_at}') 이 RFC3339(with timezone) 가 아님`,
        );
      }
    }

    // 중복 (Input ID, Item, Effect, Target) 금지 (설계 §8.1).
    if (row.inputId && row.item && row.effect && row.target) {
      const dupKey = [row.inputId, row.item, row.effect, row.target].join(' ');
      if (effectDupSeen.has(dupKey)) {
        add(`RR-ITEM-004: 중복 effect 행: (${row.inputId}, ${row.item}, ${row.effect}, ${row.target})`);
      }
      effectDupSeen.add(dupKey);
    }

    if (row.inputId && row.item) {
      const key = `${row.inputId} ${row.item}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ row, target });
    }
  }

  // --- item group 검사: Basis/Classification 일관성 + routing matrix ---
  for (const [key, entries] of groups) {
    const [inputId, itemId] = key.split(' ');
    const label = `item ${inputId}#${itemId}`;
    const bases = [...new Set(entries.map((e) => e.row.basis).filter(Boolean))];
    const classifications = [...new Set(entries.map((e) => e.row.classification).filter(Boolean))];
    if (bases.length > 1) {
      add(`RR-ITEM-003: ${label} 의 effect 행들의 Basis 불일치: ${bases.join(' vs ')}`);
    }
    if (classifications.length > 1) {
      add(`RR-ITEM-002: ${label} 의 effect 행들의 Classification 불일치: ${classifications.join(' vs ')}`);
    }
    const basis = bases[0];
    if (!basis || !BASIS_VALUES.includes(basis) || bases.length > 1) continue; // enum/불일치는 위에서 보고

    const expectedClassification = ROUTING_CLASSIFICATION[basis];
    if (classifications.length === 1 && classifications[0] !== expectedClassification &&
        CLASSIFICATION_VALUES.includes(classifications[0])) {
      add(
        `RR-ROUTE-001: ${label} — Basis=${basis} 는 Classification=${expectedClassification} 여야 함 (현재: ${classifications[0]})`,
      );
    }

    for (const { row, target } of entries) {
      if (!row.effect || !EFFECT_VALUES.includes(row.effect) || !target) continue; // enum/문법은 위에서 보고
      if (!comboAllowed(basis, row.effect, target.kind)) {
        const combos = (ROUTING_COMBOS[basis] || [])
          .map((c) => `${c.effects.join('|')} + ${c.kinds.join('|')}:*`)
          .join(' / ');
        add(`RR-ROUTE-002: ${label} — Basis=${basis} 에 허용되지 않는 조합: Effect=${row.effect} + Target=${target.raw} (허용: ${combos})`);
        continue;
      }
      // visual-evidence: 시각 허용 target 규칙 (설계 §6.1). 중복 artifact_id 는 RR-REF-012 가 이미
      // 해소 불가로 보고했으므로 첫 문서 기준의 routing 판정을 하지 않는다.
      if (basis === 'visual-evidence' && target.kind === 'artifact') {
        const rec = isDuplicateArtifactId(targetIndex, target.artifactId)
          ? null
          : resolveArtifact(targetIndex, target.artifactId);
        if (rec) {
          const type = rec.fm?.artifact_type;
          if (VISUAL_ALLOWED_ARTIFACT_TYPES.has(type)) {
            // OK
          } else if (type === 'screen-spec') {
            if (!target.section) {
              add(
                `RR-ROUTE-004: ${label} — visual-evidence 가 ScreenSpec '${target.artifactId}' 전체를 target — 시각 허용 섹션(#${[...VISUAL_ALLOWED_SCREEN_SECTIONS].join('|#')})을 명시하세요`,
              );
            } else if (!VISUAL_ALLOWED_SCREEN_SECTIONS.has(target.section)) {
              add(
                `RR-ROUTE-004: ${label} — visual-evidence 는 behavior 정본을 바꿀 수 없음: '${target.raw}' (금지: interaction-matrix/state-matrix/data-requirements/api-candidates/acceptance-criteria 등 — behavior 충돌은 별도 item 을 new-choice/resolved-decision-conflict 로)`,
              );
            }
          } else {
            add(
              `RR-ROUTE-004: ${label} — visual-evidence 의 target artifact_type '${type || '(없음)'}' 은 시각 허용 대상이 아님 (허용: ${[...VISUAL_ALLOWED_ARTIFACT_TYPES].join('|')} 또는 ScreenSpec 시각 섹션)`,
            );
          }
        }
      }
      // scope-unclear: canonical screen identity 해소 전 screen-level write 금지 (설계 §6.2).
      if (basis === 'scope-unclear' && target.kind === 'artifact') {
        const rec = isDuplicateArtifactId(targetIndex, target.artifactId)
          ? null
          : resolveArtifact(targetIndex, target.artifactId);
        if (rec) {
          const fm = rec.fm || {};
          const screenLevel =
            SCREEN_LEVEL_ARTIFACT_TYPES.has(fm.artifact_type) ||
            (fm.screen_id !== undefined && fm.screen_id !== null && fm.screen_id !== '');
          if (screenLevel) {
            add(
              `RR-ROUTE-005: ${label} — scope-unclear 는 screen-level artifact('${target.artifactId}') 를 target 할 수 없음 (identity 해소 전 — unknown/decision 또는 domain/app-level artifact 만)`,
            );
          }
        }
      }
    }

    // group-level 필수 target (설계 §6).
    const kindsInGroup = new Set(entries.map((e) => e.target?.kind).filter(Boolean));
    for (const required of ROUTING_REQUIRED_KINDS[basis] || []) {
      if (!required.some((k) => kindsInGroup.has(k))) {
        add(`RR-ROUTE-006: ${label} — Basis=${basis} 는 ${required.map((k) => `${k}:*`).join(' 또는 ')} target 이 최소 1개 필요`);
      }
    }
    if (basis === 'resolved-decision-conflict') {
      const hasConflictOpen = entries.some((e) => e.row.effect === 'create-open' && e.target?.kind === 'conflict');
      const hasDecisionReopen = entries.some((e) => e.row.effect === 'reopen' && e.target?.kind === 'decision');
      if (!hasConflictOpen || !hasDecisionReopen) {
        add(
          `RR-ROUTE-003: ${label} — resolved-decision-conflict 는 같은 Item 에 conflict:* create-open 과 decision:* reopen 둘 다 필수 (이전 값 보존 + 게이트 재상승)`,
        );
      }
    }
  }

  // --- summary ↔ items projection (설계 §7) ---
  for (const [inputId, parsed] of summaryParsed) {
    const rows = itemsByInput.get(inputId) || [];
    if (rows.length === 0) continue; // structured-no-items 는 RR-ITEM-001 이 이미 보고

    // 7.1 classification multiset — unique (Input ID, Item) 기준.
    const perItem = new Map();
    for (const row of rows) {
      if (!row.item || !row.classification) continue;
      if (!perItem.has(row.item)) perItem.set(row.item, row.classification);
    }
    const projected = new Map();
    for (const cls of perItem.values()) projected.set(cls, (projected.get(cls) || 0) + 1);
    const multisetEqual =
      projected.size === parsed.classification.size &&
      [...projected].every(([name, count]) => parsed.classification.get(name) === count);
    if (!multisetEqual) {
      const canonical = [...projected]
        .sort((a, b) => CLASSIFICATION_VALUES.indexOf(a[0]) - CLASSIFICATION_VALUES.indexOf(b[0]))
        .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))
        .join(' + ');
      add(
        `RR-ITEM-005: '${inputId}' summary Classification 이 item multiset 과 불일치 → 해소: '${canonical || '(items 비어 있음)'}'`,
      );
    }

    // 7.3 Created Items — creating effect 의 target 집합과 exact 일치.
    const projectedCreated = new Set();
    for (const row of rows) {
      if (CREATING_EFFECTS.includes(row.effect) && row.target && row.target !== '-') projectedCreated.add(row.target);
    }
    const summaryCreated = new Set(parsed.createdRefs.map((r) => r.raw));
    const missingCreated = [...projectedCreated].filter((t) => !summaryCreated.has(t));
    const extraCreated = [...summaryCreated].filter((t) => !projectedCreated.has(t));
    if (missingCreated.length || extraCreated.length) {
      const parts = [];
      if (missingCreated.length) parts.push(`누락: ${missingCreated.join(', ')}`);
      if (extraCreated.length) parts.push(`과잉: ${extraCreated.join(', ')}`);
      add(`RR-ITEM-006: '${inputId}' summary Created Items ≠ item effects (${parts.join(' / ')})`);
    }

    // 7.2 Touched Artifacts — 모든 effect target 의 owner artifact 집합과 exact 일치 (artifact id 수준).
    const projectedOwners = new Set();
    const projectedSections = new Set(); // `${artifactId}#${section}` — section detail warning 용
    for (const row of rows) {
      const target = parseTargetRef(row.target);
      if (!target) continue;
      if (target.kind === 'artifact') {
        projectedOwners.add(target.artifactId);
        if (target.section) projectedSections.add(`${target.artifactId}#${target.section}`);
      } else if (target.kind !== 'none' && target.kind !== 'input') {
        projectedOwners.add(target.ownerArtifactId);
      }
    }
    const summaryOwners = new Set(parsed.touchedRefs.map((r) => r.artifactId));
    const missingOwners = [...projectedOwners].filter((t) => !summaryOwners.has(t));
    const extraOwners = [...summaryOwners].filter((t) => !projectedOwners.has(t));
    if (missingOwners.length || extraOwners.length) {
      const parts = [];
      if (missingOwners.length) parts.push(`누락: ${missingOwners.join(', ')}`);
      if (extraOwners.length) parts.push(`과잉: ${extraOwners.join(', ')}`);
      add(`RR-ITEM-007: '${inputId}' summary Touched Artifacts ≠ item target owner 집합 (${parts.join(' / ')})`);
    } else {
      for (const ref of parsed.touchedRefs) {
        if (ref.section && !projectedSections.has(`${ref.artifactId}#${ref.section}`)) {
          warn(
            `RR-ITEM-101: '${inputId}' summary Touched Artifacts 의 section detail '${ref.raw}' 가 item target 과 다름 (초기 warning — dogfood 후 hard 후보)`,
          );
        }
      }
    }
  }

  return { errors, warnings };
}
