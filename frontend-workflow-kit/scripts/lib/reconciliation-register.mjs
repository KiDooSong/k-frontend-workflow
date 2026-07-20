// Reconciliation Register(_meta/reconciliation-register.md) 검증 — validate.mjs 검사 12 의 순수 로직.
// 계약 단일 출처: input-reconciliation.md "Reconciliation Register" + "status vs Reconcile Status" +
// "Code Change Gate". register 는 _meta/ 라 일반 authoring walk 에서 제외되므로 이 파일만 콕 집어 읽는다.
//
// ── HARD RULES (candidate 6 의 존재 이유. 절대 위반 금지) ──────────────────────────
//  1. 검사는 오직 Reconcile Status 만 본다. 자식 항목(D-/C-/U-/G-)의 open/closed 는
//     '미처리' 신호가 아니다. reconciled + 자식 decision open == 정상 상태(반드시 PASS).
//  2. Created Items 는 링크 목록일 뿐이다. "(open)" 같은 주석을 절대 파싱하지 않는다.
//     자식 open/closed 의 단일 출처는 Open Decisions/Conflicts/Unknowns 이지 register 가 아니다.
//  3. Unknown/Conflict 를 게이트로 취급하지 않는다. 세 축(입력 status / Reconcile Status /
//     자식 open|closed)은 독립이며 검사 12 를 움직이는 것은 Reconcile Status 뿐이다.
// ─────────────────────────────────────────────────────────────────────────────────
//
// 이 모듈은 순수하다 — { errors:[{file,message}], warnings:[{file,message}] } 를 반환하고
// file 은 항상 절대경로다. validate.mjs 가 add()/warn() 으로 상대화한다.
// 표 파싱은 spec.mjs 의 parseTable 을 재사용한다(register 는 본문의 첫 마크다운 표).
import { splitFrontmatter, readFileSafe, exists, yamlParse } from './util.mjs';
import { parseTable, hasHeader } from './spec.mjs';

// reconcile 행위의 라이프사이클. 자식 항목 rollup 도, 입력 frontmatter 의 status 도 아니다.
export const RECONCILE_STATUS_VALUES = ['not-started', 'in-progress', 'reconciled', 'failed'];

// 계약 스키마의 필수 8컬럼 (input-reconciliation.md "Reconciliation Register" 표).
export const REQUIRED_REGISTER_COLS = [
  'Input ID',
  'Source',
  'Classification',
  'Reconcile Status',
  'Result',
  'Touched Artifacts',
  'Created Items',
  'Supersedes',
];

// 헤더 이름을 느슨하게 매칭(대소문자/공백 무시) — spec.mjs col() 과 같은 규약.
// (col 은 spec.mjs 의 module-private 라 여기서 동일 규약의 얇은 헬퍼만 둔다 — parseTable 은 공유.)
function cell(row, name) {
  const want = name.toLowerCase().replace(/\s+/g, '');
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().replace(/\s+/g, '') === want) return row[k];
  }
  return undefined;
}

// register 파일을 파싱한다.
//   { exists, table, rows, fm, body, fmParseError, fmStructuralError }
//   - exists=false 면 검사 12 는 NO-OP (초기/선택적 도입 — input-reconciliation.md "초기에는 hard fail 이 아니라").
//   - rows: [{ inputId, source, classification, reconcileStatus, result, touched, created, supersedes }]
//     created(Touched/Created Items)는 원문 문자열 그대로 — HARD RULE 2 에 따라 주석을 파싱하지 않는다.
//   - fm/body: Reconciliation Contract 버전 판정(reconciliation_contract 필드)과 v2 의
//     `## Reconciliation Items` 표 파싱에 쓴다(reconciliation-items.mjs). v1 검사는 둘을 읽지 않는다.
//   - fmParseError: frontmatter YAML 파싱 실패 사유(예외). fmStructuralError: envelope 손상(닫는 ---
//     누락) 또는 top-level 이 mapping 이 아님(sequence/scalar/null). 어느 쪽이든 fm 이 빈/무의미한
//     값으로 떨어져 contract 판정이 v1 로 기울고 v2 검사가 통째로 꺼진다 — 판정 전에 fail-closed
//     해야 하는 구조 결함 신호다. `---` 로 시작하지 않는 파일(frontmatter 자체가 없음)만 기존
//     v1 동작을 유지한다.
export function parseReconciliationRegister(registerFile) {
  if (!registerFile || !exists(registerFile)) {
    return { exists: false, table: null, rows: [], fm: {}, body: '', fmParseError: null, fmStructuralError: null };
  }
  const raw = readFileSafe(registerFile);
  const { data, body, hasFrontmatter, parseError: fmParseError } = splitFrontmatter(raw);
  let fm = data;
  let fmStructuralError = null;
  const startsWithMarker = /^﻿?---\r?\n/.test(raw ?? '');
  if (startsWithMarker && !hasFrontmatter) {
    // 시작 구분자는 있는데 splitFrontmatter 가 envelope 을 못 닫음 — 전체 원문이 body 로 흘러
    // Summary 표만 파싱되고 frontmatter(=contract 선언)는 통째로 증발하는 경로.
    fmStructuralError = 'frontmatter 종료 구분자(---) 누락 — envelope 손상';
  } else if (hasFrontmatter && !fmParseError) {
    // splitFrontmatter 는 non-mapping(top-level sequence/scalar)과 null 을 그대로/빈객체로 돌려주므로
    // 원문 블록을 다시 파싱해 top-level 이 plain mapping 인지 명시 검증한다. sequence 안에
    // `- reconciliation_contract: 2` 처럼 v2 선언이 "숨는" 경우가 v1 downgrade 로 새는 것을 막는다.
    const block = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)?.[1] ?? '';
    let parsed = null;
    try {
      parsed = yamlParse(block);
    } catch {
      // splitFrontmatter 의 fmParseError 경로가 이미 다룸 — 여기 도달하지 않는 것이 정상.
    }
    const isMapping = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    if (!isMapping) {
      const kind = parsed === null ? 'null/빈값' : Array.isArray(parsed) ? 'sequence' : typeof parsed;
      fmStructuralError = `frontmatter top-level 이 mapping 이 아님 (${kind})`;
      fm = {};
    }
  }
  const table = parseTable(body); // register 는 본문의 첫 마크다운 표
  const rows = [];
  if (table) {
    for (const r of table.rows) {
      rows.push({
        inputId: (cell(r, 'Input ID') || '').trim(),
        source: (cell(r, 'Source') || '').trim(),
        classification: (cell(r, 'Classification') || '').trim(),
        reconcileStatus: (cell(r, 'Reconcile Status') || '').trim(),
        result: (cell(r, 'Result') || '').trim(),
        touched: (cell(r, 'Touched Artifacts') || '').trim(),
        created: (cell(r, 'Created Items') || '').trim(), // 링크만 — 절대 (open) 주석 파싱 금지
        supersedes: (cell(r, 'Supersedes') || '').trim(),
      });
    }
  }
  return {
    exists: true,
    table,
    rows,
    fm: fm || {},
    body,
    fmParseError: fmParseError || null,
    fmStructuralError,
  };
}

// register 검증(검사 12).
//   register       parseReconciliationRegister 결과
//   inputArtifacts collectInputArtifacts 결과 (검사 11 과 동일 객체 공유 — 미처리 교차검사용)
//   registerFile   register 절대경로 (register 자체에 대한 에러의 file)
// register 파일이 없으면 ({exists:false}) NO-OP — inputs/ 에 파일이 있어도 검사하지 않는다.
export function validateReconciliationRegister({ register, inputArtifacts = [], registerFile, enforce = false }) {
  const errors = [];
  const warnings = [];
  if (!register || !register.exists) {
    return { errors, warnings }; // NO-OP: register 미도입
  }
  const add = (file, message) => errors.push({ file, message });
  const warn = (file, message) => warnings.push({ file, message });
  // "미처리(reconcile 미완)" 신호의 경중 — 기본 경고(warning-first), --enforce 시 에러로 승격.
  //   대상: register 행 없음(미생성) + Reconcile Status=not-started(미시작). 둘 다 "아직 reconcile 안 함" 축이라
  //   정상 흐름(입력 추가 → reconcile-input)의 중간 상태일 뿐이므로 기본은 막지 않는다.
  //   in-progress(중단)/failed/enum/중복/컬럼누락 같은 '망가지거나 끊긴' 상태는 enforce 와 무관하게 항상 에러.
  //   (warning-first 결정 #1 — input-reconciliation.md "초기에는 hard fail 이 아니라" + Lane B backstop 정합.)
  const flagUnprocessed = enforce ? add : warn;

  // frontmatter YAML 파싱 실패는 구조 결함이라 항상 에러다(fail-closed). fm 이 빈 객체로 떨어지면
  // Reconciliation Contract 판정이 v1 로 기울어, v2 register 의 오타 하나로 items/routing/reference/
  // provenance 검사가 통째로 조용히 꺼진다. _meta/ 는 일반 frontmatter 검사(검사 1) 대상도 아니므로
  // 여기서 잡지 않으면 아무도 잡지 않는다. 본문 표 검사는 계속 진행한다(진단 병행 표면화).
  if (register.fmParseError) {
    add(
      registerFile,
      `register frontmatter YAML 파싱 실패: ${register.fmParseError} → 해소: frontmatter 를 고치세요 (파싱 실패 상태에서는 reconciliation_contract 판정이 불가해 v2 검사가 비활성화됩니다)`,
    );
  }
  // envelope 손상(닫는 --- 누락)·top-level non-mapping 도 같은 계열의 downgrade 경로다 — YAML 예외는
  // 없지만 contract 선언이 body 로 새거나(sequence 항목 안에 숨음) 통째로 증발한다. 항상 에러.
  if (register.fmStructuralError) {
    add(
      registerFile,
      `register frontmatter 구조 오류: ${register.fmStructuralError} → 해소: '---' 로 감싼 top-level mapping frontmatter 로 고치세요 (이 상태에서는 reconciliation_contract 판정이 불가해 v2 검사가 비활성화됩니다)`,
    );
  }

  // register 파일은 있는데 8컬럼 표 자체가 파싱되지 않으면 구조 결함 — 행 검사 불가, 여기서 끝낸다.
  if (!register.table) {
    add(
      registerFile,
      '파싱 가능한 Reconciliation Register 표 없음 → 해소: 8컬럼 표(| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |)를 두세요',
    );
    return { errors, warnings };
  }

  // 필수 8컬럼 존재 검사 (검사 9 Open Decisions 와 같은 방식 — spec.mjs hasHeader 재사용).
  // 컬럼이 빠지면 register 가 계약 스키마를 벗어난 것이라 조용히 통과시키지 않는다.
  const headers = register.table.headers;
  const missingCols = REQUIRED_REGISTER_COLS.filter((c) => !hasHeader(headers, c));
  if (missingCols.length) {
    add(registerFile, `Reconciliation Register 표 필수 컬럼 누락: ${missingCols.join(', ')}`);
  }
  // Input ID / Reconcile Status 컬럼이 아예 없으면 그 컬럼에 의존하는 행 검사는 의미가 없다
  // (위 컬럼-누락 에러가 구조 결함을 가리키므로 행마다 빈값 에러를 쏟지 않는다).
  const hasIdCol = hasHeader(headers, 'Input ID');
  const hasStatusCol = hasHeader(headers, 'Reconcile Status');

  // Input ID 중복 집계 (입력당 canonical 행 1개).
  const idCount = new Map();
  for (const row of register.rows) {
    if (row.inputId) idCount.set(row.inputId, (idCount.get(row.inputId) || 0) + 1);
  }
  const reportedDup = new Set();
  const registeredIds = new Set(idCount.keys());

  for (const row of register.rows) {
    const id = row.inputId;

    // Input ID 없는 행: (Input ID 컬럼이 존재할 때만) 다른 칸이 채워졌으면 malformed 경고, 완전 빈 행은 무시.
    if (!id) {
      if (hasIdCol) {
        const hasOther =
          row.source || row.classification || row.reconcileStatus || row.result ||
          row.touched || row.created || row.supersedes;
        if (hasOther) {
          warn(registerFile, 'register 행에 Input ID 없음 (malformed row)');
        }
      }
      continue;
    }

    // 중복 Input ID: 행마다가 아니라 id 당 한 번만 보고.
    const dupN = idCount.get(id) || 0;
    if (dupN > 1 && !reportedDup.has(id)) {
      add(registerFile, `register Input ID 중복: '${id}' (${dupN}행) — 입력당 canonical 행 1개`);
      reportedDup.add(id);
    }

    // Reconcile Status — 검사 12 를 움직이는 유일한 축. (Status 컬럼이 있을 때만 검사.)
    if (hasStatusCol) {
      const status = row.reconcileStatus;
      if (!RECONCILE_STATUS_VALUES.includes(status)) {
        add(
          registerFile,
          `Reconcile Status enum 위반: '${status}' (기대 ${RECONCILE_STATUS_VALUES.join('|')}) — Input ${id}`,
        );
        continue; // enum 위반이면 이 행의 status 후속 검사 생략
      }
      if (status === 'in-progress') {
        add(registerFile, `${id}: Reconcile Status=in-progress (이전 실행 중단) — 이어서 reconcile 하세요`);
      } else if (status === 'failed') {
        add(registerFile, `${id}: Reconcile Status=failed (reconcile 실패)`);
      } else if (status === 'not-started') {
        flagUnprocessed(registerFile, `${id}: Reconcile Status=not-started (아직 reconcile 시작 전)`);
      }
      // status === 'reconciled' 는 PASS — 자식 decision/Created Items 가 open 이어도 무조건 통과(HARD RULE 1·2).
    }
  }

  // 미처리 교차검사: inputs/ 에 input_id 가 있으나 register 에 행이 없는 입력.
  // 에러는 register 가 아니라 그 INPUT 파일에 단다(어디를 고칠지 가리키기 위해).
  // parseError 입력은 검사 11 이 다루므로 제외하고, id 없는 입력도 검사 11 이 잡으므로 제외.
  // Input ID 컬럼이 없으면 교차검사가 전부 오탐이 되므로 건너뛴다(위 컬럼-누락 에러가 대신 가리킨다).
  if (hasIdCol) {
    for (const a of inputArtifacts) {
      if (a.parseError) continue;
      const id = a.fm?.input_id;
      if (typeof id !== 'string' || id.trim() === '') continue;
      if (!registeredIds.has(id)) {
        flagUnprocessed(a.file, `inputs/ 에 있으나 register 에 행 없음: '${id}' (미처리) — reconcile-input 먼저 실행`);
      }
    }
  }

  return { errors, warnings };
}
