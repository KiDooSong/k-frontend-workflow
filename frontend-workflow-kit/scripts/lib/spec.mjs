// ScreenSpec 파싱 (frontmatter + 본문 표) 과 파생값 계산.
// workflow-state.mjs 와 validate.mjs 가 같은 구조를 읽도록 파서를 한 곳에 둔다.
import path from 'node:path';
import {
  splitFrontmatter,
  readFileSafe,
  exists,
  dirHasFiles,
  confidenceRank,
  CONFIDENCE_ORDER,
} from './util.mjs';

const REQUIRED_STATES = ['loading', 'success', 'empty', 'error', 'refreshing'];

// HTML 주석 제거 (표/섹션 감지를 방해하지 않도록)
function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

// GENERATED 블록 내부를 제거한다 (생성 섹션은 본문 파싱 대상이 아님).
function stripGeneratedBlocks(text) {
  return text.replace(/<!--\s*GENERATED:START[\s\S]*?GENERATED:END[^\n]*-->/g, '');
}

// `## Heading` 기준으로 섹션을 나눈다. key 는 소문자 제목.
export function getSections(body) {
  const sections = {};
  const lines = body.split(/\r?\n/);
  let current = null;
  let buf = [];
  const flush = () => {
    if (current !== null) sections[current] = buf.join('\n');
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1].trim().toLowerCase();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

// 섹션 텍스트에서 첫 번째 마크다운 표를 파싱한다.
// { headers: [...], rows: [{Header: value}], rowCount } 또는 null.
export function parseTable(sectionText) {
  if (!sectionText) return null;
  const clean = stripComments(sectionText);
  const lines = clean.split(/\r?\n/);
  const tableLines = [];
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    const isRow = line.startsWith('|');
    if (isRow) {
      tableLines.push(line);
      started = true;
    } else if (started) {
      // 표가 시작된 뒤 비-표 라인을 만나면 표 종료
      if (line === '') continue; // 표 중간 빈 줄은 허용하지 않지만 관대하게 무시
      break;
    }
  }
  if (tableLines.length < 2) return null;

  const splitRow = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = splitRow(tableLines[0]);
  // 두 번째 줄은 구분자 (---). 검증만 하고 건너뛴다.
  const sep = tableLines[1];
  if (!/^\|?[\s:|-]+\|?$/.test(sep)) {
    // 구분자가 없으면 표가 아님
    return null;
  }
  const rows = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = splitRow(tableLines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows, rowCount: rows.length };
}

// 헤더 이름을 느슨하게 매칭 (대소문자/공백 무시)
function col(row, name) {
  const want = name.toLowerCase().replace(/\s+/g, '');
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().replace(/\s+/g, '') === want) return row[k];
  }
  return undefined;
}

export function loadScreenSpec(specPath) {
  const raw = readFileSafe(specPath);
  const { data, body, hasFrontmatter, parseError } = splitFrontmatter(raw);
  const cleanBody = stripGeneratedBlocks(body);
  const sections = getSections(cleanBody);
  return {
    path: specPath,
    dir: path.dirname(specPath),
    frontmatter: data || {},
    body,
    sections,
    hasFrontmatter,
    parseError,
  };
}

// stub 판정에서 제외하는 blocker/register 섹션.
// 결정·미확정만 남긴 화면은 본문을 쓴 게 아니므로 여전히 stub 이다.
const NON_CONTENT_SECTIONS = new Set(['open decisions', 'unknowns']);

// stub 판정: 실질 본문 섹션(Purpose·State Matrix 등)이 없으면 stub.
// frontmatter 만 있거나 blocker 섹션(Open Decisions·Unknowns)만 있는 경우를 포함한다.
export function isStub(spec) {
  return Object.keys(spec.sections).every((k) => NON_CONTENT_SECTIONS.has(k));
}

// --- 파생값 ---------------------------------------------------------------
// 본문 표/파일시스템에서 readiness 가 필요로 하는 값을 계산한다 (impl §5).
export function deriveMetrics(spec, opts = {}) {
  const { srcDir } = opts;
  const domain = spec.frontmatter.domain;
  const sections = spec.sections;

  // State Matrix: 필수 상태 5종이 모두 있으면 complete
  const stateTable = parseTable(sections['state matrix']);
  const presentStates = new Set();
  if (stateTable) {
    for (const row of stateTable.rows) {
      const v = col(row, 'State');
      if (v) presentStates.add(v.toLowerCase());
    }
  }
  const stateMatrixComplete = REQUIRED_STATES.every((s) => presentStates.has(s));

  // Interaction Matrix: 표 존재 + 모든 행의 Result 비어있지 않음
  const interactionTable = parseTable(sections['interaction matrix']);
  let interactionMatrixComplete = false;
  if (interactionTable && interactionTable.rowCount > 0) {
    interactionMatrixComplete = interactionTable.rows.every((r) => {
      const v = col(r, 'Result');
      return v !== undefined && v !== '';
    });
  }

  // Copy Keys: Status 컬럼에 tbd 존재 여부
  const copyTable = parseTable(sections['copy keys']);
  let copyKeysHasTbd = false;
  if (copyTable) {
    copyKeysHasTbd = copyTable.rows.some((r) => {
      const v = col(r, 'Status');
      return v && v.toLowerCase() === 'tbd';
    });
  }

  // Unknowns: open 상태 행 수
  const unknownsTable = parseTable(sections['unknowns']);
  let openUnknowns = 0;
  if (unknownsTable) {
    openUnknowns = unknownsTable.rows.filter((r) => {
      const v = col(r, 'Status');
      return v && v.toLowerCase() === 'open';
    }).length;
  }

  // Open Decisions: open 행을 blocker 로, 깨진 행을 malformed 로 분류한다.
  // validate 형식검사가 후속이라, 구조적 결함(누락 ID/Status, open|resolved 아닌 Status,
  // open 인데 Blocking Mode 누락)을 조용히 버리지 않고 surface 한다 —
  // readiness 가 fail-closed 로 막을 수 있게 (오타 하나로 게이트가 풀리는 fail-open 방지).
  const odSection = sections['open decisions'];
  const odTable = parseTable(odSection);
  const blockingDecisions = [];
  const malformedDecisions = [];
  if (odTable) {
    for (const r of odTable.rows) {
      const id = (col(r, 'ID') || '').trim();
      const status = (col(r, 'Status') || '').trim().toLowerCase();
      const bm = (col(r, 'Blocking Mode') || '').trim();
      const dn = (col(r, 'Decision Needed') || '').trim();
      if (!id && !status && !bm && !dn) continue; // 빈 행
      if (status === 'resolved') continue; // 닫힌 결정은 blocker 가 아니다
      if (status === 'open' && id && bm) {
        blockingDecisions.push({
          id,
          decision_needed: dn,
          blocking_mode: bm,
          owner: (col(r, 'Owner') || '').trim(),
        });
      } else {
        malformedDecisions.push({
          id: id || '(no-id)',
          blocking_mode: bm || '(none)',
          status: status || '(none)',
        });
      }
    }
    blockingDecisions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    malformedDecisions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  } else if (odSection) {
    // 표를 쓰려 한 흔적(| 라인)이 있는데 parseTable 이 실패 → 표 구문 깨짐(separator 불량 등).
    // 조용히 무시하면 게이트가 통째로 풀리므로(fail-open) malformed 로 surface 한다.
    const hasTableRow = stripComments(odSection)
      .split(/\r?\n/)
      .some((l) => l.trim().startsWith('|'));
    if (hasTableRow) {
      malformedDecisions.push({ id: '(unparsable-table)', blocking_mode: '(none)', status: '(none)' });
    }
  }

  // API Candidates: 항목 중 가장 낮은 confidence
  const apiConfidenceMin = minApiConfidence(sections['api candidates']);

  // fake hook 존재: src/features/{domain}/hooks/ 에 파일이 있는지
  let fakeHookExists = false;
  if (srcDir && domain) {
    const hookDir = path.join(srcDir, 'features', domain, 'hooks');
    fakeHookExists = dirHasFiles(hookDir, ['.ts', '.tsx']);
  }

  // figma mapping: 같은 디렉토리의 figma-component-mapping.md 존재 + status
  let figmaMappingStatus = 'missing';
  const figmaPath = path.join(spec.dir, 'figma-component-mapping.md');
  if (exists(figmaPath)) {
    const fm = splitFrontmatter(readFileSafe(figmaPath));
    figmaMappingStatus = fm.data?.status || 'draft';
  }

  return {
    state_matrix_complete: stateMatrixComplete,
    interaction_matrix_complete: interactionMatrixComplete,
    copy_keys_has_tbd: copyKeysHasTbd,
    tbd_count: openUnknowns,
    unknown_count: openUnknowns,
    open_decisions_count: blockingDecisions.length,
    blocking_decisions: blockingDecisions,
    malformed_decisions: malformedDecisions,
    api_confidence_min: apiConfidenceMin,
    fake_hook_exists: fakeHookExists,
    figma_mapping_status: figmaMappingStatus,
  };
}

// "- GET /coupons (confidence: candidate)" 같은 줄에서 confidence 추출
export function parseApiCandidates(sectionText) {
  if (!sectionText) return [];
  const clean = stripComments(sectionText);
  const out = [];
  for (const line of clean.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('-')) continue;
    const m = /confidence\s*[:=]\s*([a-zA-Z]+)/.exec(t);
    const conf = m ? m[1].toLowerCase() : 'unknown';
    out.push({ raw: t.replace(/^-\s*/, ''), confidence: conf });
  }
  return out;
}

function minApiConfidence(sectionText) {
  const items = parseApiCandidates(sectionText);
  if (items.length === 0) return null;
  let min = null;
  for (const it of items) {
    if (!CONFIDENCE_ORDER.includes(it.confidence)) continue;
    if (min === null || confidenceRank(it.confidence) < confidenceRank(min)) {
      min = it.confidence;
    }
  }
  return min;
}

// Interaction Matrix 의 Result 컬럼에서 라우트(슬래시로 시작)들을 추출 (validate 용)
export function interactionResultRoutes(spec) {
  const table = parseTable(spec.sections['interaction matrix']);
  if (!table) return [];
  const routes = [];
  for (const r of table.rows) {
    const v = col(r, 'Result');
    if (!v) continue;
    // "/coupons/[id] 이동" 처럼 텍스트가 섞일 수 있으므로 라우트 토큰만 뽑는다
    const m = /(\/[^\s]+)/.exec(v);
    if (m) routes.push(m[1]);
  }
  return routes;
}

export { REQUIRED_STATES };
