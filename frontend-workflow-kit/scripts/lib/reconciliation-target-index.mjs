// Reconciliation Contract v2 의 typed target/evidence 해소용 참조 인덱스.
// 계약: input-reconciliation.md "Reconciliation Contract v2" §Target grammar / §Referential integrity.
//
// validate.mjs 가 이미 수집한 docs([{file, fm}])를 받아 artifact_id → 문서 인덱스를 만든다 —
// 재귀 walk 를 반복하지 않는다(설계 §11.2). 본문은 여기서 파일별로 1회만 다시 읽는다.
//
// 인덱스가 답하는 질문:
//   - artifact:<artifact_id>            가 실제 문서로 해소되는가
//   - artifact:<id>#<section-slug>      의 섹션이 존재하는가 (h2 제목 slug)
//   - artifact:<id>#<sec>/<row-key>     의 row-key 가 그 섹션 표에 보이는가 (warning-first)
//   - decision:D-x@<owner> 등 child row ID 가 owner 문서의 표에서 해소되는가
//   - target kind 와 row 가 사는 섹션 가족(open decisions/unknowns/conflicts)이 모순되지 않는가
//   - INV-/VER- 토큰이 owner 문서 본문에 존재하는가 (canonical register 없는 축은 note 기반)
import { readFileSafe, splitFrontmatter } from './util.mjs';
import { parseTables, hasHeader, col } from './spec.mjs';

// h2 제목 → section slug. "## UI Sections" → "ui-sections", "## Component Mapping" → "component-mapping".
export function slugifySectionTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// child row ID 가 사는 섹션의 "가족" — kind ↔ section 모순 검사용.
// 여기 없는 섹션(예: component-gap-register 의 h1 직속 표)은 가족 판정을 하지 않는다(모순 아님).
const SECTION_FAMILY = {
  'open-decisions': 'decision',
  unknowns: 'unknown',
  conflicts: 'conflict',
};

// 문서 본문 하나를 인덱싱한다.
//   sections   Map(slug → { title, text })  ("" slug = h2 이전 preamble)
//   rows       Map(rowId → [{ sectionSlug }])  (ID 헤더를 가진 모든 표의 ID 컬럼)
//   rowKeys    Map(sectionSlug → Set(첫 셀 원문))  (#section/<row-key> warning 해소용)
function indexDocBody(body) {
  const sections = new Map();
  const lines = String(body || '').split(/\r?\n/);
  let currentTitle = '';
  let buf = [];
  const flush = () => {
    const slug = currentTitle ? slugifySectionTitle(currentTitle) : '';
    // 같은 slug 섹션이 중복되면 텍스트를 이어붙인다 (해소 검사에는 존재 여부가 중요).
    const prev = sections.get(slug);
    const text = buf.join('\n');
    sections.set(slug, { title: currentTitle, text: prev ? `${prev.text}\n${text}` : text });
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      currentTitle = m[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();

  const rows = new Map();
  const rowKeys = new Map();
  for (const [slug, sec] of sections) {
    const tables = parseTables(sec.text);
    for (const table of tables) {
      const firstHeader = table.headers[0];
      for (const r of table.rows) {
        // row-key 해소: 첫 셀 원문(예: "`M-001` · Auth frame / node `1:234`", "Offline").
        const firstCell = String(r[firstHeader] ?? '').trim();
        if (firstCell) {
          if (!rowKeys.has(slug)) rowKeys.set(slug, new Set());
          rowKeys.get(slug).add(firstCell);
        }
        // child row ID: ID 헤더를 가진 표만.
        if (hasHeader(table.headers, 'ID')) {
          const id = String(col(r, 'ID') || '').trim();
          if (id && !id.startsWith('{')) {
            if (!rows.has(id)) rows.set(id, []);
            rows.get(id).push({ sectionSlug: slug });
          }
        }
      }
    }
  }
  return { sections, rows, rowKeys };
}

// docs([{file, fm}]) → { artifacts: Map(artifact_id → record) }.
// record = { file, fm, body, sections, rows, rowKeys }.
// artifact_id 중복은 검사 5/9 소관이므로 여기선 첫 문서를 유지한다(결정적: docs 는 정렬된 walk 순).
export function buildReconciliationTargetIndex({ docs = [] }) {
  const artifacts = new Map();
  for (const { file, fm } of docs) {
    const id = fm?.artifact_id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    if (artifacts.has(id)) continue;
    const { body } = splitFrontmatter(readFileSafe(file));
    const indexed = indexDocBody(body);
    artifacts.set(id, { file, fm, body, ...indexed });
  }
  return { artifacts };
}

// artifact_id 해소. 없으면 null.
export function resolveArtifact(index, artifactId) {
  return index?.artifacts?.get(artifactId) || null;
}

// artifact 문서에 해당 section slug 가 있는가.
export function artifactHasSection(record, sectionSlug) {
  return !!record?.sections?.has(sectionSlug);
}

// #section/<row-key> 해소 (warning-first): 그 섹션 표의 첫 셀 어딘가에 row-key 토큰이 보이는가.
// 대소문자 무시 substring — 셀이 "`M-001` · Auth frame" 같은 서술형일 수 있어서다.
export function sectionRowKeyExists(record, sectionSlug, rowKey) {
  const keys = record?.rowKeys?.get(sectionSlug);
  if (!keys) return false;
  const want = String(rowKey).toLowerCase();
  for (const cell of keys) {
    if (cell.toLowerCase().includes(want)) return true;
  }
  return false;
}

// child row ID(D-/C-/U-/G-)가 owner 문서에서 해소되는가.
//   { found: bool, familyMismatch: bool }
// familyMismatch: ID 가 알려진 가족 섹션(open decisions/unknowns/conflicts)에서만 발견됐고
// 그 가족이 target kind 와 다를 때 true (예: decision:U-001 이 unknowns 표에서만 발견).
export function resolveChildRow(record, rowId, targetKind) {
  const hits = record?.rows?.get(rowId) || [];
  if (hits.length === 0) return { found: false, familyMismatch: false };
  let sawKnownFamily = false;
  for (const hit of hits) {
    const family = SECTION_FAMILY[hit.sectionSlug];
    if (!family) return { found: true, familyMismatch: false }; // 가족 미상 섹션 → 모순 판정 안 함
    sawKnownFamily = true;
    if (family === targetKind) return { found: true, familyMismatch: false };
  }
  return { found: true, familyMismatch: sawKnownFamily };
}

// INV-/VER- 처럼 canonical 표가 없는 축: owner 문서 본문에 ID 토큰이 존재하는가.
export function bodyHasToken(record, token) {
  if (!record?.body || !token) return false;
  const esc = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${esc}([^A-Za-z0-9-]|$)`).test(record.body);
}
