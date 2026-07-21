// Reconciliation Contract v2 의 typed target/evidence 해소용 참조 인덱스.
// 계약: input-reconciliation.md "Reconciliation Contract v2" §Target grammar / §Referential integrity.
//
// validate.mjs 가 이미 수집한 docs([{file, fm}])를 받아 artifact_id → 문서 인덱스를 만든다 —
// 재귀 walk 를 반복하지 않는다(설계 §11.2). 본문은 여기서 파일별로 1회만 다시 읽는다.
//
// 인덱스가 답하는 질문:
//   - artifact:<artifact_id>            가 실제 문서로 해소되는가 (중복 선언이면 해소 불가로 본다)
//   - artifact:<id>#<section-slug>      의 섹션이 존재하는가 (h2 제목 slug)
//   - artifact:<id>#<sec>/<row-key>     의 row-key 가 그 섹션 표에 보이는가 (warning-first)
//   - decision:D-x@<owner> 등 child row ID 가 owner 문서의 **canonical 가족 표**에서 해소되는가
//   - target kind 와 row 가 사는 표 가족(decision/unknown/conflict/gap)이 모순되지 않는가
//   - INV-/VER- 토큰이 owner 문서 본문에 존재하는가 (canonical register 없는 축은 note 기반)
//
// child row 는 ID 헤더만 보고 수집하지 않는다 — Notes/예시/migration 표에 인용된 D-/C- ID 가
// canonical 행처럼 해소되는 fail-open 을 막기 위해, 표의 "가족"을 canonical signature 로 판정하고
// 가족이 판정된 표의 행만 후보로 등록한다.
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

// child row 가족 판정 — canonical **위치 + 표 signature 의 AND** 만 인정한다.
// 섹션 slug 하나로 섹션 내 모든 표를 신뢰하거나, signature 만으로 임의 섹션(Notes 등)의 표를
// 신뢰하면, canonical 처럼 생긴 예시/참조 표가 실제 target 으로 해소되는 fail-open 이 된다.
//   decision : `## Open Decisions` 섹션 안에서 ID+Status+Blocking Mode signature 를 만족하는 첫 표
//              (parseOpenDecisions 의 canonical 선택 규칙과 동일).
//   unknown  : `## Unknowns` 섹션 안의 ID+Question signature 첫 표.
//   conflict : `## Conflicts` 섹션, 또는 artifact_type=conflicts 문서의 h1 직속(preamble) —
//              ID+Status signature 첫 표.
//   gap      : `## Gaps`/`## Component Gap Register` 섹션, 또는 artifact_type=component-gap-register
//              문서의 h1 직속(preamble) — ID+Status signature 첫 표.
// canonical 위치가 아니거나 signature 가 어긋나는 ID 표(Notes 참조 표·예시 표)는 후보가 아니다.
const FAMILY_SIGNATURES = {
  decision: ['ID', 'Status', 'Blocking Mode'],
  unknown: ['ID', 'Question'],
  conflict: ['ID', 'Status'],
  gap: ['ID', 'Status'],
};

// (sectionSlug, artifactType) → 이 위치가 canonical 홈인 family 목록.
function canonicalFamiliesAt(sectionSlug, artifactType) {
  const families = [];
  if (sectionSlug === 'open-decisions') families.push('decision');
  if (sectionSlug === 'unknowns') families.push('unknown');
  if (sectionSlug === 'conflicts') families.push('conflict');
  if (sectionSlug === 'gaps' || sectionSlug === 'component-gap-register') families.push('gap');
  if (sectionSlug === '') {
    // h1 직속 표를 가진 global register 템플릿 — artifact_type 으로만, preamble 로만 한정한다.
    if (artifactType === 'conflicts') families.push('conflict');
    if (artifactType === 'component-gap-register') families.push('gap');
  }
  return families;
}

// fenced code block(``` / ~~~) 내부를 제거한다 — parseTables 는 fence 를 모르므로 코드 블록 안의
// canonical-looking 예시 표가 child 후보/표 개수 판정에 끼는 것을 여기서 차단한다.
// fence 상태는 {char, length} 로 추적한다: closing fence 는 같은 문자이면서 opening 길이 **이상**의
// run 만으로 이뤄진 줄만 인정한다(CommonMark) — 4-backtick fence 안에서 3-backtick 예시를 보여주는
// 일반적인 문서 패턴에서 내부 fence 가 outer fence 를 닫아버리는 오판을 막는다.
export function stripFencedCodeBlocks(text) {
  const out = [];
  let fence = null; // { char, length }
  for (const line of String(text || '').split(/\r?\n/)) {
    if (fence === null) {
      const open = /^\s*(`{3,}|~{3,})/.exec(line);
      if (open) {
        fence = { char: open[1][0], length: open[1].length };
        continue;
      }
      out.push(line);
    } else {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        fence = null;
      }
      // fence 내부(닫는 줄 포함)는 전부 버린다.
    }
  }
  return out.join('\n');
}

// section/child-row 판정 전에 non-content(fence 내부 + HTML 주석)를 제거한 본문.
// getSections 류의 heading 분리는 fence/주석을 모르므로, fence 안의 `## Open Decisions` 같은
// 예시 heading 이 실제 canonical 섹션을 만들어 그 안의 표가 해소되는 fail-open 을 여기서 차단한다.
// 순서는 fence → 주석: fence 안의 주석 마커는 리터럴이라 fence 제거가 먼저다.
export function stripNonContent(text) {
  return stripFencedCodeBlocks(text).replace(/<!--[\s\S]*?-->/g, '');
}

// heading 발생 순서를 보존하는 섹션 분리 — getSections(spec.mjs)는 같은 heading 을 만나면 이전
// 섹션을 덮어써 "중복 canonical 섹션의 첫 표"가 검증에서 사라진다. 여기서는 occurrence 배열을
// 돌려줘 호출부가 중복 자체를 계약 위반으로 볼 수 있게 한다. 입력은 stripNonContent 를 거친
// 본문이어야 한다(fence/주석 안의 heading 은 섹션이 아니다).
//   [{ title, slug, text }]  (첫 h2 이전 preamble 은 slug '' 로 포함)
export function splitSectionOccurrences(cleanText) {
  const occurrences = [];
  let currentTitle = '';
  let buf = [];
  const flush = () => {
    occurrences.push({
      title: currentTitle,
      slug: currentTitle ? slugifySectionTitle(currentTitle) : '',
      text: buf.join('\n'),
    });
  };
  for (const line of String(cleanText || '').split(/\r?\n/)) {
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
  return occurrences;
}

// 문서 본문 하나를 인덱싱한다.
//   contentBody non-content(fence/주석) 제거 후 본문 — INV-/VER- 토큰 존재 검사도 이것을 쓴다
//   sections   Map(slug → { title, text })  ("" slug = h2 이전 preamble)
//   rows       Map(rowId → [{ sectionSlug, family }])  (가족이 판정된 canonical 표의 ID 컬럼만)
//   rowKeys    Map(sectionSlug → Set(첫 셀 원문))  (#section/<row-key> warning 해소용)
// section 분리는 반드시 stripNonContent **이후**에 한다 — fence 안의 `## Open Decisions` heading 이
// 실제 섹션을 만들면 closing fence 가 고아가 되어 fence 내부 표가 canonical 행으로 해소된다.
function indexDocBody(body, artifactType) {
  const contentBody = stripNonContent(body);
  const sections = new Map();
  for (const occ of splitSectionOccurrences(contentBody)) {
    // 같은 slug 섹션이 중복되면 텍스트를 이어붙인다 (해소 검사에는 존재 여부가 중요).
    const prev = sections.get(occ.slug);
    sections.set(occ.slug, {
      title: occ.title,
      text: prev ? `${prev.text}\n${occ.text}` : occ.text,
    });
  }

  const rows = new Map();
  const rowKeys = new Map();
  for (const [slug, sec] of sections) {
    // fence/주석은 위에서 이미 제거됐다.
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
      }
    }
    // child row 후보: 이 위치를 canonical 홈으로 갖는 family 별로, signature 를 만족하는 **첫 표만**
    // 선택한다(parseOpenDecisions 의 canonical 선택과 동형). 같은 섹션의 나머지 표는 예시/범례다.
    for (const family of canonicalFamiliesAt(slug, artifactType)) {
      const canonical = tables.find((t) => FAMILY_SIGNATURES[family].every((c) => hasHeader(t.headers, c)));
      if (!canonical) continue;
      for (const r of canonical.rows) {
        const id = String(col(r, 'ID') || '').trim();
        if (id && !id.startsWith('{')) {
          if (!rows.has(id)) rows.set(id, []);
          rows.get(id).push({ sectionSlug: slug, family });
        }
      }
    }
  }
  return { contentBody, sections, rows, rowKeys };
}

// docs([{file, fm}]) → { artifacts: Map(artifact_id → record), duplicates: Set(artifact_id) }.
// record = { file, fm, body, contentBody, sections, rows, rowKeys }.
// 같은 artifact_id 가 2개 이상 선언되면 어느 문서가 owner 인지 결정할 수 없다 — 첫 문서를 보존하되
// duplicates 에 모아 v2 validator 가 해소 불가(hard error)로 보고한다(경로 정렬 의존 방지).
export function buildReconciliationTargetIndex({ docs = [] }) {
  const artifacts = new Map();
  const duplicates = new Set();
  for (const { file, fm } of docs) {
    const id = fm?.artifact_id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    if (artifacts.has(id)) {
      duplicates.add(id);
      continue;
    }
    const { body } = splitFrontmatter(readFileSafe(file));
    const indexed = indexDocBody(body, fm?.artifact_type);
    artifacts.set(id, { file, fm, body, ...indexed });
  }
  return { artifacts, duplicates };
}

// artifact_id 해소. 없으면 null. (중복 여부는 isDuplicateArtifactId 로 별도 판정 — 호출부가 먼저 본다.)
export function resolveArtifact(index, artifactId) {
  return index?.artifacts?.get(artifactId) || null;
}

// artifact_id 가 중복 선언돼 owner 를 결정할 수 없는가.
export function isDuplicateArtifactId(index, artifactId) {
  return !!index?.duplicates?.has(artifactId);
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

// child row ID(D-/C-/U-/G-)가 owner 문서의 canonical 가족 표에서 해소되는가.
//   { found: bool, familyMismatch: bool }
// - target kind 와 같은 가족 표에 있으면 found.
// - 다른 가족 표에서만 발견되면 familyMismatch (예: decision 표에만 있는 C-xxx 를 conflict 로 참조).
// - 가족 미판정 표(Notes 참조 표 등)의 ID 는 후보가 아니므로 not found 다.
export function resolveChildRow(record, rowId, targetKind) {
  const hits = record?.rows?.get(rowId) || [];
  if (hits.length === 0) return { found: false, familyMismatch: false };
  if (hits.some((hit) => hit.family === targetKind)) return { found: true, familyMismatch: false };
  return { found: true, familyMismatch: true };
}

// INV-/VER- 처럼 canonical 표가 없는 축: owner 문서 본문에 ID 토큰이 존재하는가.
// fence/주석 안의 언급은 근거가 아니다 — non-content 제거 후 본문(contentBody)만 본다.
export function bodyHasToken(record, token) {
  const haystack = record?.contentBody ?? record?.body;
  if (!haystack || !token) return false;
  const esc = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${esc}([^A-Za-z0-9-]|$)`).test(haystack);
}
