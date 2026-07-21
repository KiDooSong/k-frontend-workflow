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
import { hasHeader, col, splitRow } from './spec.mjs';

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

// section/child-row/표 판정 전에 non-content(fenced code block·HTML 주석 block·raw HTML block 내부)를
// 제거한 본문. getSections 류의 heading 분리와 표 파서는 이들을 모르므로, fence/주석/<pre> 안의
// `## Open Decisions` 같은 예시 heading·표가 실제 canonical 구조를 만드는 fail-open 을 여기서 차단한다.
//
// 순차 2-pass 가 아니라 **단일 state machine** 이며, block 진입/종료는 CommonMark 블록 규칙을 따른다:
//   normal  : `<!--` 로 **시작하는 줄**(선행 공백 ≤3칸)만 HTML 주석 block 을 연다 — 같은 줄에 `-->` 가
//             있으면 그 줄 전체를 소비하고 끝난다. 줄 중간의 `<!-- ... -->` 는 inline span 만 제거하고,
//             줄 중간의 닫히지 않은 `<!--` 는 리터럴이다(comment 상태로 가지 않음). 따라서 inline code
//             `` `<!--` `` 나 escape `\<!--` 가 주석 시작으로 오인되지 않는다.
//             `<pre|script|style|textarea` 로 시작하는 줄은 raw HTML block 을 연다.
//             유효 fence opener(선행 공백 ≤3칸 — 4칸+/tab·list marker 뒤는 리터럴)는 fence 를 연다.
//   comment : fence marker 무시. 종료 조건을 만족한 줄에서 닫히며 **그 줄 전체를 소비한다** —
//             종료 뒤 tail 로 새 block marker(fence/heading/표)를 합성하지 않는다(CommonMark
//             html block 은 종료 조건을 만족한 줄까지 통째로 block 에 속한다).
//   fence   : 주석/HTML marker 무시. 같은 문자·opening 길이 이상의 run 만으로 된 줄만 fence 를 닫는다
//             ({char,length} 추적 — 4-backtick fence 안의 3-backtick 예시가 outer 를 닫지 못한다).
//
// raw HTML block 은 CommonMark type 별 **종료 조건을 분리**해 추적한다 — 하나(blank line)로 합치면
// 양방향 fail-open 이 된다(`<![CDATA[` 안의 blank line 뒤 표가 노출되거나, 같은 줄에 닫히는
// `<!DOCTYPE html>` 이 뒤의 보이는 heading/표까지 삼킴):
//   type 2  <!--        …  -->  포함 줄까지
//   type 5  <![CDATA[   …  ]]>  포함 줄까지
//   type 4  <!LETTER    …  >    포함 줄까지 (declaration)
//   type 3  <?          …  ?>   포함 줄까지 (processing instruction)
//   type 1  <pre|script|style|textarea … 닫는 태그 포함 줄까지
//   type 6/7  그 외 <tag / </tag …  blank line 까지 (blank line 자체는 block 밖)
export function stripNonContent(text) {
  const out = [];
  let fence = null; // { char, length } | null
  let block = null; // { endsAt: (line)=>bool, consumeEndLine: bool } | null

  for (const line of String(text || '').split(/\r?\n/)) {
    if (fence !== null) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue; // fence 내부(닫는 줄 포함)는 전부 버린다
    }
    if (block !== null) {
      if (block.endsAt(line)) {
        const consume = block.consumeEndLine;
        block = null;
        if (!consume) out.push(line); // type 6/7 의 blank line 은 block 의 일부가 아니다
      }
      continue;
    }
    // --- normal: html block opener 판정 (구체적 문법 → 일반 순) ---
    const opener = matchHtmlBlockOpener(line);
    if (opener) {
      if (!opener.endsOnOpeningLine) block = opener;
      continue; // opening 줄은 (같은 줄에 닫혀도) 통째로 block — 출력하지 않는다
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      continue; // opening fence 줄(info string 포함)은 출력하지 않는다
    }
    // 줄 중간의 같은-줄 닫힌 주석은 inline span 만 제거. 닫히지 않은 중간 `<!--` 는 리터럴 유지.
    out.push(line.replace(/<!--[\s\S]*?-->/g, ''));
  }
  return out.join('\n');
}

// 줄이 raw HTML block 을 여는지 판정하고, 해당 type 의 종료 조건을 돌려준다.
// 반환: { endsAt, consumeEndLine, endsOnOpeningLine } | null
function matchHtmlBlockOpener(line) {
  const mk = (endsAt, endsOnOpeningLine, consumeEndLine = true) => ({
    endsAt,
    consumeEndLine,
    endsOnOpeningLine,
  });
  if (/^ {0,3}<!--/.test(line)) {
    return mk((l) => l.includes('-->'), line.includes('-->', line.indexOf('<!--') + 4));
  }
  if (/^ {0,3}<!\[CDATA\[/i.test(line)) {
    return mk((l) => l.includes(']]>'), line.includes(']]>'));
  }
  if (/^ {0,3}<![a-zA-Z]/.test(line)) {
    // declaration (<!DOCTYPE …>) — 같은 줄의 `>` 로 닫히는 경우가 일반적이다.
    return mk((l) => l.includes('>'), line.includes('>', line.indexOf('<!') + 2));
  }
  if (/^ {0,3}<\?/.test(line)) {
    return mk((l) => l.includes('?>'), line.includes('?>'));
  }
  if (/^ {0,3}<(?:pre|script|style|textarea)(?=[\s/>]|$)/i.test(line)) {
    const closeRe = /<\/(?:pre|script|style|textarea)>/i;
    return mk((l) => closeRe.test(l), closeRe.test(line));
  }
  if (/^ {0,3}<[a-zA-Z/]/.test(line)) {
    // type 6/7 — blank line 까지. blank line 자체는 block 밖이므로 소비하지 않는다.
    return mk((l) => /^\s*$/.test(l), false, false);
  }
  return null;
}

// (하위호환 별칭 — 테스트/유닛 사용처. 주석 미포함 입력이면 stripNonContent 와 동일하게 동작한다.)
export function stripFencedCodeBlocks(text) {
  return stripNonContent(text);
}

// inline code span 제거 — stateful scanner. 줄 단위 정규식은 여러 줄에 걸친 span(`a\nINV-001`)과
// 긴 delimiter 안의 짧은 run(``INV-001 `x` ``)을 놓친다. CommonMark 대로 opening run 과 **정확히
// 같은 길이**의 closing run 까지를 span 으로 소비하고(내부의 더 짧거나 긴 run 은 리터럴),
// closing 이 없으면 backtick run 자체를 리터럴로 남긴다. span 내용은 공백 하나로 치환한다.
export function stripInlineCodeSpans(text) {
  const s = String(text || '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '`') {
      out += s[i];
      i += 1;
      continue;
    }
    let j = i;
    while (j < s.length && s[j] === '`') j += 1;
    const runLen = j - i;
    // 같은 길이의 closing run 탐색.
    let k = j;
    let closeEnd = -1;
    while (k < s.length) {
      if (s[k] !== '`') {
        k += 1;
        continue;
      }
      let m = k;
      while (m < s.length && s[m] === '`') m += 1;
      if (m - k === runLen) {
        closeEnd = m;
        break;
      }
      k = m; // 길이가 다른 run 은 span 내부 리터럴
    }
    if (closeEnd === -1) {
      out += s.slice(i, j); // 닫히지 않은 run 은 리터럴
      i = j;
    } else {
      out += ' ';
      i = closeEnd;
    }
  }
  return out;
}

// INV-/VER- 토큰 존재 검사용 "visible prose" 추출 — contentBody(fence/주석/HTML block 제거 후)에서
// 렌더링되지 않거나 code 인 source 영역을 추가로 제외한다:
//   - indented code 줄(4칸+/tab)
//   - reference definition 줄(`[label]: url`) — 렌더링되지 않는다
//   - inline code span (여러 줄·긴 delimiter 포함 stateful)
//   - inline link/image 의 destination(`](url)`) — link text 는 유지한다
//   - inline HTML tag/attribute(`<span data-ref="…">`)와 autolink(`<scheme:…>`) — 태그 안 attribute
//     값의 ID 는 visible prose 가 아니다 (내부 텍스트는 유지)
// code example·URL·attribute 안의 언급만으로 canonical target 이 해소되면 안 된다(fail-closed).
export function toProseBody(contentBody) {
  const withoutBlocks = String(contentBody || '')
    .split('\n')
    .filter((l) => !/^(?: {4,}|\t)/.test(l))
    .filter((l) => !/^ {0,3}\[[^\]]*\]:\s*\S/.test(l))
    .join('\n');
  return stripInlineCodeSpans(withoutBlocks)
    .replace(/\]\([^)\n]*\)/g, ']') // link/image destination 제거 (text 는 유지)
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g, ' '); // inline HTML tag/attribute · autolink 제거
}

// 헤더 정규화(대소문자/공백 무시 — hasHeader/col 과 같은 규약)와 canonical 헤더 배열 exact 비교.
// strict 표의 행은 header 문자열을 object key 로 저장하므로, 같은 header 가 중복되면 뒤 셀이 앞
// 셀을 **덮어쓴다** — canonical 표는 중복/추가/누락/순서 위반 없이 정확히 일치해야 한다.
export function normalizedTableHeaders(table) {
  return (table?.headers || []).map((h) => String(h).toLowerCase().replace(/\s+/g, ''));
}

export function tableHeadersAreUnique(table) {
  const norm = normalizedTableHeaders(table);
  return new Set(norm).size === norm.length;
}

// canonical 헤더 배열과의 exact 일치 여부. 불일치면 사람이 읽을 사유 문자열, 일치면 null.
export function describeHeaderMismatch(table, canonicalCols) {
  const actual = normalizedTableHeaders(table);
  const expected = canonicalCols.map((h) => String(h).toLowerCase().replace(/\s+/g, ''));
  if (actual.length === expected.length && actual.every((h, i) => h === expected[i])) return null;
  const problems = [];
  if (actual.length !== expected.length) problems.push(`컬럼 수 ${actual.length} ≠ ${expected.length}`);
  if (new Set(actual).size !== actual.length) problems.push('중복 header 존재');
  const missing = expected.filter((h) => !actual.includes(h));
  const extra = actual.filter((h) => !expected.includes(h));
  if (missing.length) problems.push(`누락: ${missing.join(', ')}`);
  if (extra.length) problems.push(`추가: ${extra.join(', ')}`);
  if (!problems.length) problems.push('canonical 순서 불일치');
  return problems.join(' / ');
}

// hard-contract 전용 strict 마크다운 표 파서 — parseTables(spec.mjs)는 모든 줄을 trim 한 뒤 `|`
// 시작 여부만 보므로 indented code block(4칸+/tab)의 예시 표를 실제 표로 승격시키고, 구분자 줄도
// hyphen 없는 `| | |` 를 허용한다. v2 hard 계약이 소비하는 표는 여기서 다음을 요구한다:
//   - 표 줄은 **column 0 의 top-level 표만** 인정 — 들여쓴 줄(list 내부 fence 의 continuation,
//     indented code 예시 등)은 표가 아니다(fail-closed: canonical 표는 column 0 에 저작한다는 계약)
//   - 두 번째 줄은 구분자: 셀마다 `:?-+:?` (hyphen 최소 1개), 셀 수 = header 셀 수
// 데이터 행의 셀 부족은 기존 규약대로 '' 패딩된다(빈 필수 셀은 각 검사기가 fail-closed 로 잡는다).
// 입력은 stripNonContent 를 거친 본문이어야 한다.
export function parseStrictTables(text) {
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (cur.length) blocks.push(cur);
    cur = [];
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (raw.startsWith('|')) {
      cur.push(raw.trim());
    } else {
      flush(); // 들여쓴 표 줄 포함 비-표 라인 → 현재 표 블록 종료
    }
  }
  flush();

  const tables = [];
  for (const tableLines of blocks) {
    if (tableLines.length < 2) continue;
    const headers = splitRow(tableLines[0]);
    const delimiterCells = splitRow(tableLines[1]);
    const delimiterValid =
      delimiterCells.length === headers.length && delimiterCells.every((c) => /^:?-+:?$/.test(c));
    if (!delimiterValid) continue;
    const rows = [];
    for (let i = 2; i < tableLines.length; i++) {
      const cells = splitRow(tableLines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] ?? '').trim();
      });
      rows.push(row);
    }
    tables.push({ headers, rows, rowCount: rows.length });
  }
  return tables;
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
    // ATX heading 은 선행 공백 0~3칸까지 실제 H2 로 렌더링된다(CommonMark) — column 0 만 보면
    // `  ## Reconciliation Items` 처럼 들여쓴 실제 heading 이 개수 검사(중복 hard)에서 빠진다.
    const m = /^ {0,3}##\s+(.+?)\s*$/.exec(line);
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
  const proseBody = toProseBody(contentBody);
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
    // fence/주석은 위에서 이미 제거됐고, indented code/느슨한 구분자는 strict parser 가 거른다.
    const tables = parseStrictTables(sec.text);
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
    // 중복 header 를 가진 표는 셀이 덮어써져 신뢰할 수 없으므로 canonical 후보에서 제외한다(fail-closed).
    for (const family of canonicalFamiliesAt(slug, artifactType)) {
      const canonical = tables.find(
        (t) => tableHeadersAreUnique(t) && FAMILY_SIGNATURES[family].every((c) => hasHeader(t.headers, c)),
      );
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
  return { contentBody, proseBody, sections, rows, rowKeys };
}

// docs([{file, fm}]) → { artifacts: Map(artifact_id → record), duplicates: Set(artifact_id) }.
// record = { file, fm, body, contentBody, proseBody, sections, rows, rowKeys }.
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
// code(fence/indented/inline span)·HTML·주석 안의 언급은 근거가 아니다 — visible prose 만 본다
// (proseBody). backtick 으로 감싼 ID 는 해소되지 않으므로 근거 언급은 plain text 로 적는다.
export function bodyHasToken(record, token) {
  const haystack = record?.proseBody ?? record?.contentBody ?? record?.body;
  if (!haystack || !token) return false;
  const esc = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${esc}([^A-Za-z0-9-]|$)`).test(haystack);
}
