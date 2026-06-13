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
import { splitFrontmatter, readFileSafe, exists } from './util.mjs';
import { parseTable } from './spec.mjs';

// reconcile 행위의 라이프사이클. 자식 항목 rollup 도, 입력 frontmatter 의 status 도 아니다.
export const RECONCILE_STATUS_VALUES = ['not-started', 'in-progress', 'reconciled', 'failed'];

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
//   { exists, table, rows }
//   - exists=false 면 검사 12 는 NO-OP (초기/선택적 도입 — input-reconciliation.md "초기에는 hard fail 이 아니라").
//   - rows: [{ inputId, source, classification, reconcileStatus, result, touched, created, supersedes }]
//     created(Touched/Created Items)는 원문 문자열 그대로 — HARD RULE 2 에 따라 주석을 파싱하지 않는다.
export function parseReconciliationRegister(registerFile) {
  if (!registerFile || !exists(registerFile)) {
    return { exists: false, table: null, rows: [] };
  }
  const { body } = splitFrontmatter(readFileSafe(registerFile));
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
  return { exists: true, table, rows };
}

// register 검증(검사 12).
//   register       parseReconciliationRegister 결과
//   inputArtifacts collectInputArtifacts 결과 (검사 11 과 동일 객체 공유 — 미처리 교차검사용)
//   registerFile   register 절대경로 (register 자체에 대한 에러의 file)
// register 파일이 없으면 ({exists:false}) NO-OP — inputs/ 에 파일이 있어도 검사하지 않는다.
export function validateReconciliationRegister({ register, inputArtifacts = [], registerFile }) {
  const errors = [];
  const warnings = [];
  if (!register || !register.exists) {
    return { errors, warnings }; // NO-OP: register 미도입
  }
  const add = (file, message) => errors.push({ file, message });
  const warn = (file, message) => warnings.push({ file, message });

  // Input ID 중복 집계 (입력당 canonical 행 1개).
  const idCount = new Map();
  for (const row of register.rows) {
    if (row.inputId) idCount.set(row.inputId, (idCount.get(row.inputId) || 0) + 1);
  }
  const reportedDup = new Set();
  const registeredIds = new Set(idCount.keys());

  for (const row of register.rows) {
    const id = row.inputId;

    // Input ID 없는 행: 다른 칸이 채워졌으면 malformed 경고, 완전 빈 행은 무시.
    if (!id) {
      const hasOther =
        row.source || row.classification || row.reconcileStatus || row.result ||
        row.touched || row.created || row.supersedes;
      if (hasOther) {
        warn(registerFile, 'register 행에 Input ID 없음 (malformed row)');
      }
      continue;
    }

    // 중복 Input ID: 행마다가 아니라 id 당 한 번만 보고.
    const dupN = idCount.get(id) || 0;
    if (dupN > 1 && !reportedDup.has(id)) {
      add(registerFile, `register Input ID 중복: '${id}' (${dupN}행) — 입력당 canonical 행 1개`);
      reportedDup.add(id);
    }

    // Reconcile Status — 검사 12 를 움직이는 유일한 축.
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
      warn(registerFile, `${id}: Reconcile Status=not-started (아직 reconcile 시작 전)`);
    }
    // status === 'reconciled' 는 PASS — 자식 decision/Created Items 가 open 이어도 무조건 통과(HARD RULE 1·2).
  }

  // 미처리 교차검사: inputs/ 에 input_id 가 있으나 register 에 행이 없는 입력.
  // 에러는 register 가 아니라 그 INPUT 파일에 단다(어디를 고칠지 가리키기 위해).
  // parseError 입력은 검사 11 이 다루므로 제외하고, id 없는 입력도 검사 11 이 잡으므로 제외.
  for (const a of inputArtifacts) {
    if (a.parseError) continue;
    const id = a.fm?.input_id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    if (!registeredIds.has(id)) {
      add(a.file, `inputs/ 에 있으나 register 에 행 없음: '${id}' (미처리) — reconcile-input 먼저 실행`);
    }
  }

  return { errors, warnings };
}
