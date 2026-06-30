// ScreenSpec 파싱 (frontmatter + 본문 표) 과 파생값 계산.
// workflow-state.mjs 와 validate.mjs 가 같은 구조를 읽도록 파서를 한 곳에 둔다.
import path from 'node:path';
import {
  splitFrontmatter,
  readFileSafe,
  exists,
  walkFiles,
  confidenceRank,
  CONFIDENCE_ORDER,
  projectRootOf,
} from './util.mjs';
import { layerHasFiles, TYPESCRIPT_FACT_EXTS } from './layer-inventory.mjs';

const REQUIRED_STATES = ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'];
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

// 마크다운 표의 한 행을 셀 배열로 분리한다.
// 셀 안의 escaped pipe(`\|`, 마크다운 리터럴 파이프)는 컬럼 구분자가 아니므로 보호한다 —
// 보호하지 않으면 Status·Blocking Mode 같은 오른쪽 컬럼이 한 칸씩 밀려 게이트 신호가 오염된다.
function splitRow(line) {
  return line
    .replace(/^\s*\|/, '') // 표의 선행 파이프 (escape 대상 아님)
    .replace(/(?<!\\)\|\s*$/, '') // 후행 파이프 (escaped pipe 는 보존)
    .split(/(?<!\\)\|/) // escape 되지 않은 파이프에서만 분리
    .map((c) => c.replace(/\\\|/g, '|').trim()); // `\|` → 리터럴 `|` 로 복원
}

// 섹션 텍스트의 모든 마크다운 표 블록을 파싱한다.
// 빈 줄/비-표 라인이 표 블록을 종료한다 — 한 섹션의 "범례/예시 표 → 빈 줄 → 진짜 표"가
// 하나로 병합돼 진짜 표의 행이 첫 표 헤더로 잘못 매핑되며 조용히 사라지던 결함(fail-open)을 막는다.
export function parseTables(sectionText) {
  if (!sectionText) return [];
  const clean = stripComments(sectionText);
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (cur.length) blocks.push(cur);
    cur = [];
  };
  for (const raw of clean.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('|')) cur.push(line);
    else flush(); // 빈 줄 포함 비-표 라인 → 현재 표 블록 종료
  }
  flush();

  const tables = [];
  for (const tableLines of blocks) {
    if (tableLines.length < 2) continue;
    // 두 번째 줄은 구분자 (---). 없으면 표가 아님.
    if (!/^\|?[\s:|-]+\|?$/.test(tableLines[1])) continue;
    const headers = splitRow(tableLines[0]);
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

// 섹션의 첫 번째 마크다운 표 (하위호환). 특정 표가 필요하면 parseTables + pickTableBySignature.
export function parseTable(sectionText) {
  const tables = parseTables(sectionText);
  return tables.length ? tables[0] : null;
}

// 섹션에서 requiredCols 를 모두 가진 표 블록을 고른다. 범례/예시 표가 앞서 있어도
// 진짜 게이트 표(예: Open Decisions)를 시그니처로 집어낸다. 못 찾으면 table=null 이되
// hadTables 로 "표는 있었음"을 알려 호출부가 fail-closed 할 수 있게 한다.
function pickTableBySignature(sectionText, requiredCols) {
  const tables = parseTables(sectionText);
  const table = tables.find((t) => requiredCols.every((c) => hasHeader(t.headers, c))) || null;
  return { table, hadTables: tables.length > 0 };
}

// 헤더 이름을 느슨하게 매칭 (대소문자/공백 무시). api-manifest.mjs(검사 8) 도 공유한다.
export function col(row, name) {
  const want = name.toLowerCase().replace(/\s+/g, '');
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().replace(/\s+/g, '') === want) return row[k];
  }
  return undefined;
}

// 헤더 존재 여부 (느슨한 매칭). validate 의 필수 컬럼 검사용.
export function hasHeader(headers, name) {
  const want = name.toLowerCase().replace(/\s+/g, '');
  return (headers || []).some((h) => h.toLowerCase().replace(/\s+/g, '') === want);
}

// Open Decisions 섹션을 구조화해 반환한다 — deriveMetrics(readiness 분류)와
// validate(형식 검사)가 같은 파서를 공유한다 (파싱 단일 출처).
//   table            parseTable 결과 (없으면 null)
//   headers          표 헤더 배열 (없으면 null)
//   rows             [{ id, status, blockingMode, decisionNeeded, options, owner }] (빈 행 제외)
//   sectionHasContent 섹션에 실질 내용이 있는데 파싱 가능한 표가 없는가 (불릿/문장/깨진 표)
export function parseOpenDecisions(sectionText) {
  // 시그니처(ID·Status·Blocking Mode)로 진짜 Open Decisions 표를 고른다 —
  // 같은 섹션의 범례/예시 표에 속아 진짜 결정이 사라지지 않게 한다.
  const { table, hadTables } = pickTableBySignature(sectionText, ['ID', 'Status', 'Blocking Mode']);
  const rows = [];
  if (table) {
    for (const r of table.rows) {
      const id = (col(r, 'ID') || '').trim();
      const status = (col(r, 'Status') || '').trim();
      const blockingMode = (col(r, 'Blocking Mode') || '').trim();
      const decisionNeeded = (col(r, 'Decision Needed') || '').trim();
      const options = (col(r, 'Options') || '').trim();
      const owner = (col(r, 'Owner') || '').trim();
      if (!id && !status && !blockingMode && !decisionNeeded) continue; // 빈 행
      rows.push({ id, status, blockingMode, decisionNeeded, options, owner });
    }
  }
  let sectionHasContent = false;
  if (sectionText && !table) {
    if (hadTables) {
      // 표는 있는데 Open Decisions 시그니처와 안 맞음 → 게이트가 조용히 열리지 않게 fail-closed 신호.
      sectionHasContent = true;
    } else {
      const lines = stripComments(sectionText)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      sectionHasContent =
        !(lines.length === 0 || (lines.length === 1 && /^(없음|none|n\/a|-)$/i.test(lines[0])));
    }
  }
  return { table, headers: table?.headers || null, rows, sectionHasContent };
}

// Copy Keys Status 의 허용 3-state (screen-spec.template.md 의 Copy Keys 주석이 정본):
//   confirmed = 승인된 확정 문구(사람만 승격) · draft = 입력이 제공한 문구지만 미확정
//   (또는 그 키의 존재가 open decision 에 달림) · tbd = 문구 자체가 미정(값 "TBD").
export const COPY_KEYS_STATUS_VALUES = ['confirmed', 'draft', 'tbd'];

// Copy Keys 섹션을 구조화해 반환한다 — deriveMetrics(tbd 집계)와 validate(Status enum 검사)가
// 같은 파서를 공유한다 (파싱 단일 출처). status 는 소문자 정규화한다.
//   table    parseTable 결과 (없으면 null)
//   headers  표 헤더 배열 (없으면 null)
//   rows     [{ key, copy, status }] (세 칸 모두 빈 행만 제외 — Status 만 빠진 행은 남겨 validate 가 잡게 한다)
export function parseCopyKeys(sectionText) {
  const table = parseTable(sectionText);
  const rows = [];
  if (table) {
    for (const r of table.rows) {
      const key = (col(r, 'Key') || '').trim();
      const copy = (col(r, '문구') || '').trim();
      const status = (col(r, 'Status') || '').trim().toLowerCase();
      if (!key && !copy && !status) continue; // 모든 칸이 빈 행만 제외
      rows.push({ key, copy, status });
    }
  }
  return { table, headers: table?.headers || null, rows };
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
//   opts.layout : tier1 resolvedLayout. fake_hook_exists 의 hook 디렉토리를 role 바인딩에서
//     파생한다(literal 'features/<domain>/hooks' 금지 — §6·§10 CRITICAL). 미주입 시 호출부
//     책임이지만, layout 이 없으면 hook fact 를 유도할 수 없다(아래 가드).
//   opts.projectRoot : role 글롭 앵커(MINOR 2). 미주입 시 표준 <root>/src 가정으로 dirname(srcDir).
//     validate 검사 8·check-generated-files route-tree 입력과 동일 식(projectRootOf)을 써 표류 방지.
export function deriveMetrics(spec, opts = {}) {
  const { srcDir, layout } = opts;
  const projectRoot = opts.projectRoot || projectRootOf(srcDir);
  const domain = spec.frontmatter.domain;
  const sections = spec.sections;

  // State Matrix: 필수 상태 6종이 모두 있으면 complete
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

  // Copy Keys: Status 3-state(confirmed|draft|tbd) 중 'tbd'(문구 자체 미정, 값 "TBD")만 집계한다.
  //   draft = "값은 있으나 미확정"(입력이 준 문구 등)이라 tbd 신호가 아니다 → 미집계.
  //   confirmed = 승인 확정 → 미집계.
  // 즉 copy_keys_has_tbd 는 오직 tbd 행에만 켜진다. (tbd_count 는 Copy Keys 가 아니라 Unknowns 만 센다 — 아래.)
  const copyKeysHasTbd = parseCopyKeys(sections['copy keys']).rows.some(
    (r) => r.status === 'tbd',
  );

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
  const od = parseOpenDecisions(sections['open decisions']);
  const blockingDecisions = [];
  const malformedDecisions = [];
  for (const r of od.rows) {
    const status = r.status.toLowerCase();
    if (status === 'resolved') continue; // 닫힌 결정은 blocker 가 아니다
    if (status === 'open' && r.id && r.blockingMode) {
      blockingDecisions.push({
        id: r.id,
        decision_needed: r.decisionNeeded,
        blocking_mode: r.blockingMode,
        owner: r.owner,
      });
    } else {
      malformedDecisions.push({
        id: r.id || '(no-id)',
        blocking_mode: r.blockingMode || '(none)',
        status: status || '(none)',
      });
    }
  }
  // 표가 파싱되지 않았는데 섹션에 실질 내용(불릿/문장/깨진 표)이 있으면 fail-open 이므로
  // malformed 로 surface 한다 (빈 섹션이나 "없음" 명시는 예외 — parseOpenDecisions 가 판정).
  if (od.sectionHasContent) {
    malformedDecisions.push({ id: '(unparsable-decisions)', blocking_mode: '(none)', status: '(none)' });
  }
  blockingDecisions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  malformedDecisions.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  // API Candidates: 항목 중 가장 낮은 confidence.
  // api_required:false 는 upstream 화면이 받은 결과를 표시만 하는 result/transition 화면용 명시 마커다.
  // API 후보 누락(null)과 의도적 무API를 workflow-state 에서 구분할 수 있게 별도 fact 로 보존한다.
  const apiRequired = spec.frontmatter.api_required !== false;
  const apiConfidenceMin = apiRequired ? minApiConfidence(sections['api candidates']) : null;

  // layer presence facts: declared layers with fact: dir_has_files derive <role>_present.
  // fake_hook_exists remains the legacy readiness input and keeps the old .ts/.tsx-only guard behavior.
  const layerPresenceFacts = {};
  let effectiveLayers = [];
  if (srcDir && domain && layout) {
    effectiveLayers = typeof layout.layersFor === 'function' ? layout.layersFor(domain) : layout.layers;
    for (const layer of Array.isArray(effectiveLayers) ? effectiveLayers : []) {
      if (!layer || layer.fact !== 'dir_has_files' || !layer.role) continue;
      layerPresenceFacts[`${layer.role}_present`] = layerHasFiles(layer, {
        layout,
        projectRoot,
        domain,
        excludeNestedRoles: true,
      });
    }
  }
  let fakeHookExists = false;
  if (srcDir && domain && layout) {
    const hookLayer =
      (Array.isArray(effectiveLayers) ? effectiveLayers : []).find((layer) => layer && layer.role === 'hook') ||
      { role: 'hook', fact: 'dir_has_files' };
    fakeHookExists = layerHasFiles(hookLayer, {
      layout,
      projectRoot,
      domain,
      excludeNestedRoles: true,
      exts: TYPESCRIPT_FACT_EXTS,
    });
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
    ...(apiRequired === false ? { api_required: false } : {}),
    ...layerPresenceFacts,
    fake_hook_exists: fakeHookExists,
    figma_mapping_status: figmaMappingStatus,
  };
}

// "- GET /coupons (confidence: candidate)" 같은 줄에서 method/path/confidence 추출.
// raw·confidence 는 기존 계약 그대로(minApiConfidence/deriveMetrics 가 confidence 만 읽으므로 readiness 불변).
// method/path 는 검사 8(엔드포인트 매칭)용으로만 추가하며, 미인식 시 null.
const API_CANDIDATE_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b\s+(\/[^\s()]+)/i;
export function parseApiCandidates(sectionText) {
  if (!sectionText) return [];
  const clean = stripComments(sectionText);
  const out = [];
  for (const line of clean.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('-')) continue;
    const m = /confidence\s*[:=]\s*([a-zA-Z]+)/.exec(t);
    const conf = m ? m[1].toLowerCase() : 'unknown';
    const raw = t.replace(/^-\s*/, '');
    const em = API_CANDIDATE_RE.exec(raw);
    out.push({
      raw,
      confidence: conf,
      method: em ? em[1].toUpperCase() : null,
      path: em ? em[2] : null,
    });
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

// --- Interaction Matrix 라우트 추출 (단일 출처) + v2 구조화(dual-read) ----------------------
// 라우트 추출은 여기 한 곳에만 둔다 — nav-graph 와 validate(검사 4)가 모두 cellRoutes 를
// 재사용해 "글자 단위 동일"을 구조적으로 보장한다(정규식 drift 불가, 검사 P13 동작 일치).
// 넓은 "슬래시부터 공백까지" 매칭은 prose/JSX/code tail 오탐이 크므로, 시작 경계와 라우트
// 세그먼트 문법을 함께 본다. 지원 세그먼트: literal, dotted.literal, (group), [id], [...slug], [[...slug]], :id.
const ROUTE_GROUP_SEGMENT_RE = /^\([^/\s)]+\)/;
const ROUTE_OPTIONAL_SPREAD_SEGMENT_RE = /^\[\[\.\.\.[A-Za-z0-9_][A-Za-z0-9_-]*\]\]/;
const ROUTE_SPREAD_SEGMENT_RE = /^\[\.\.\.[A-Za-z0-9_][A-Za-z0-9_-]*\]/;
const ROUTE_DYNAMIC_SEGMENT_RE = /^\[[A-Za-z0-9_][A-Za-z0-9_-]*\]/;
const ROUTE_PARAM_SEGMENT_RE = /^:[A-Za-z_][A-Za-z0-9_-]*/;
const ROUTE_LITERAL_SEGMENT_RE = /^[A-Za-z0-9_+-](?:[A-Za-z0-9_+~-]|\.(?=[A-Za-z0-9_+~-]))*/;
const ROUTE_LOCAL_ABSOLUTE_PATH_RE = /^\/(?:Users|private|tmp|var|opt|Volumes)\//;
const ROUTE_HOME_ABSOLUTE_PATH_RE = /^\/home\/[^/]+\//;
const ROUTE_LOCAL_FILE_EXTENSION_RE = /\.(?:[cm]?[jt]sx?|mdx?|ya?ml|json|css|scss|sass|less|html)$/i;

function charBefore(text, index) {
  const chars = Array.from(text.slice(Math.max(0, index - 2), index));
  return chars.length ? chars[chars.length - 1] : '';
}

function charAt(text, index) {
  return Array.from(text.slice(index, index + 2))[0] || '';
}

function isRouteStart(text, index) {
  if (text[index] !== '/' || text[index + 1] === '/') return false;
  const prev = charBefore(text, index);
  if (prev === '.') return false; // relative file paths: ./src, ../src
  // Unicode letter/number aware: "형식/마스킹" and "foo/bar" are word-internal, not routes.
  return !prev || !/[\p{L}\p{N}_:/<]/u.test(prev);
}

function readRouteSegment(text, index) {
  const rest = text.slice(index);
  const match =
    ROUTE_GROUP_SEGMENT_RE.exec(rest) ||
    ROUTE_OPTIONAL_SPREAD_SEGMENT_RE.exec(rest) ||
    ROUTE_SPREAD_SEGMENT_RE.exec(rest) ||
    ROUTE_DYNAMIC_SEGMENT_RE.exec(rest) ||
    ROUTE_PARAM_SEGMENT_RE.exec(rest) ||
    ROUTE_LITERAL_SEGMENT_RE.exec(rest);
  if (!match) return null;
  return { value: match[0], end: index + match[0].length };
}

function hasSafeRouteEnd(text, index) {
  const next = charAt(text, index);
  if (!next) return true;
  if (/[\p{L}\p{N}_/]/u.test(next)) return false;
  if (next === '.') {
    const after = charAt(text, index + 1);
    return !/[\p{L}\p{N}_]/u.test(after);
  }
  return true;
}

function hasSourceFileContext(text, index) {
  const before = text.slice(0, index).trimEnd();
  if (!before) return false;
  if (before.endsWith('(')) return true;
  if (/['"`=:\[]$/.test(before)) return false;
  return /(?:^|[\s([`])(?:see|source|file|path|ref|reference|참고|소스|파일|경로)\s*$/iu.test(before);
}

function isMarkdownLinkPathContext(text, index) {
  return text.slice(0, index).trimEnd().endsWith('(');
}

function segmentCount(route) {
  return route.split('/').filter(Boolean).length;
}

function isSourceFilePathRoute(route, text, index) {
  if (!ROUTE_LOCAL_FILE_EXTENSION_RE.test(route)) return false;
  if (route.startsWith('/src/')) return hasSourceFileContext(text, index);
  if (ROUTE_HOME_ABSOLUTE_PATH_RE.test(route)) {
    if (isMarkdownLinkPathContext(text, index)) return true;
    return hasSourceFileContext(text, index) && (route.includes('/src/') || segmentCount(route) >= 5);
  }
  return ROUTE_LOCAL_ABSOLUTE_PATH_RE.test(route);
}

function readRouteToken(text, index) {
  if (!isRouteStart(text, index)) return null;
  let pos = index + 1;
  const first = readRouteSegment(text, pos);
  if (!first) return null;
  let route = `/${first.value}`;
  pos = first.end;

  while (text[pos] === '/') {
    const next = readRouteSegment(text, pos + 1);
    if (!next) break;
    route += `/${next.value}`;
    pos = next.end;
  }

  if (!hasSafeRouteEnd(text, pos)) return null;
  if (isSourceFilePathRoute(route, text, index)) return { route: null, end: pos };
  return { route, end: pos };
}

// 한 셀 텍스트에서 라우트(슬래시로 시작)들을 추출한다 — 라우트 추출 단일 출처.
export function cellRoutes(cellText) {
  if (!cellText) return [];
  const text = String(cellText);
  const routes = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '/') continue;
    const token = readRouteToken(text, i);
    if (!token) continue;
    if (token.route) routes.push(token.route);
    i = token.end - 1;
  }
  return routes;
}

// v2 Target 은 기계 판정 권위라 루트 라우트(`/`)도 명시 대상이 될 수 있다.
// v1 free-form Result 파서는 byte-identical 보존을 위해 여전히 `/` 단독 토큰을 버린다.
function targetCellRoutes(cellText) {
  const routes = cellRoutes(cellText);
  const raw = String(cellText == null ? '' : cellText).trim();
  const unquoted = /^`([^`]+)`$/.exec(raw)?.[1]?.trim() || raw;
  if (unquoted === '/' && !routes.includes('/')) return ['/', ...routes];
  return routes;
}

// 구체 라우트만 통과 — 템플릿 자리표시자({/route}·꺾쇠)와 후행 슬래시(빈 세그먼트)를 거른다.
// 정상 동적/그룹 세그먼트([id]·[...slug]·(group))는 보존된다.
export function isConcreteRoute(r) {
  if (!r || r.length < 2) return false;
  if (/[{}<>]/.test(r)) return false; // 템플릿 자리표시자 중괄호/꺾쇠
  if (r.endsWith('/')) return false; // 후행 슬래시 = 빈 세그먼트
  return true;
}

function isConcreteTargetRoute(r) {
  return r === '/' || isConcreteRoute(r);
}

// Interaction Matrix 의 Result 컬럼에서 라우트들을 추출 (v1 free-form/backcompat helper).
// validate 검사 4 는 interactionEdgeRoutes 를 써서 v2 Target 을 hard gate 입력으로 삼는다.
export function interactionResultRoutes(spec) {
  const table = parseTable(spec.sections['interaction matrix']);
  if (!table) return [];
  const routes = [];
  for (const r of table.rows) routes.push(...cellRoutes(col(r, 'Result')));
  return routes;
}

// === Interaction Matrix v2 (optional structured format) — dual-read ==========================
// v1: 자유서술 Result 한 컬럼(정본, 유지). v2: optional 추가 컬럼 Result Type / Target / Params.
//   - Result Type 헤더가 있으면 v2 모드(표 단위), 없으면 v1 free-form 으로 완전 폴백.
//   - Result Type=route 행만 Target 에서 라우트를 읽는다(나머지 타입은 이동 엣지 없음 → 자연어 오탐 제거).
//   - 라우트 추출은 cellRoutes 단일 출처를 그대로 쓴다 — "어느 셀을 읽느냐"만 모드로 분기(정규식 drift 불가).
// Result Type enum 의 단일 출처. 새 값은 이 상수와 테스트를 함께 바꾸는 명시 PR 로만 추가한다.
// 설계 초안의 권장값(route|state|mutation|external|none)을 현재 구현 enum 으로 동결한다.
export const INTERACTION_V2_RESULT_TYPES = Object.freeze(['route', 'state', 'mutation', 'external', 'none']);

function normResultType(v) {
  return (v || '').trim().toLowerCase();
}

// 표가 v2 구조화 모드인가 — Result Type 헤더 존재로 판정(느슨한 매칭). table 이 null 이면 false.
export function interactionMatrixIsV2(table) {
  return !!table && hasHeader(table.headers, 'Result Type');
}

// 한 행의 이동 라우트(들).
//   v1 모드: Result 셀.
//   v2 모드: Result Type=route → Target 셀. 빈 Result Type → v1 free-form(Result 셀)로 폴백한다
//            (설계 §4.1: 부분 마이그레이션 행은 조용히 누락하지 않고 v1 폴백 + 경고; type-empty 경고와 정합).
//            그 외 명시적 비-route 타입(state/mutation/external/none) → 이동 엣지 없음.
export function interactionRowRoutes(row, mode) {
  if (mode === 'v2') {
    const rt = normResultType(col(row, 'Result Type'));
    if (!rt) return cellRoutes(col(row, 'Result')); // 빈 Result Type → v1 free-form 폴백(누락 금지)
    if (rt !== 'route') return []; // 명시적 비-route 타입 → 라우트 없음
    return targetCellRoutes(col(row, 'Target'));
  }
  return cellRoutes(col(row, 'Result'));
}

// nav-graph 가 outbound 엣지를 도출할 때 쓰는 spec-단위 v2-aware 라우트 집합.
// v1 표에서는 interactionResultRoutes 와 동일한 집합을 낸다(byte-identical) — 어느 셀을 읽느냐만 다르다.
export function interactionEdgeRoutes(spec) {
  const table = parseTable(spec.sections['interaction matrix']);
  if (!table) return [];
  const mode = interactionMatrixIsV2(table) ? 'v2' : 'v1';
  const routes = [];
  for (const r of table.rows) routes.push(...interactionRowRoutes(r, mode));
  return routes;
}

// v2 형식 점검(warning-first, 순수 함수) — validate 검사 13 이 호출한다. v1 표는 항상 빈 배열 → v1 출력 불변.
// 절대 에러로 승격하지 않는다(하드 게이트 없음). Target 존재 검사는 route-tree.txt route token 과 EXACT 비교한다.
//   opts.routeTreeRouteSet : route-tree.txt 의 `route: <token>` 집합. 없으면 교차검증은 skip(생성 전/부재 허용).
// 반환: [{ row, kind, message }]
//   kind: type-empty|enum|route-missing-target|result-target-drift|route-tree-target-missing|route-tree-missing|nonroute-has-route
export function interactionMatrixV2Issues(spec, opts = {}) {
  const table = parseTable(spec.sections['interaction matrix']);
  if (!interactionMatrixIsV2(table)) return [];
  const routeTreeRouteSet = opts.routeTreeRouteSet instanceof Set ? opts.routeTreeRouteSet : null;
  const routeTreeMissing = opts.routeTreeMissing === true && !routeTreeRouteSet;
  let routeTreeMissingWarned = false;
  const issues = [];
  let rowNo = 0;
  for (const row of table.rows) {
    rowNo++;
    const rtRaw = (col(row, 'Result Type') || '').trim();
    const rt = rtRaw.toLowerCase();
    const action = (col(row, 'User Action') || '').trim();
    const trigger = (col(row, 'Trigger') || '').trim();
    const result = (col(row, 'Result') || '').trim();
    const target = (col(row, 'Target') || '').trim();
    if (!rtRaw && !action && !trigger && !result && !target) continue; // 완전 빈 행(스페이서)
    const label = action || trigger || result || `행 ${rowNo}`;

    if (!rtRaw) {
      issues.push({ row: rowNo, kind: 'type-empty', message: `v2 형식 표인데 Result Type 이 비어있음 (${label}) — 이 행은 v1 Result 파싱으로 폴백합니다` });
      continue; // Result Type 이 없으면 나머지 v2 점검은 의미 없음(v1 폴백)
    }
    if (!INTERACTION_V2_RESULT_TYPES.includes(rt)) {
      issues.push({ row: rowNo, kind: 'enum', message: `Result Type '${rtRaw}' 가 허용값이 아님 (${label}) — ${INTERACTION_V2_RESULT_TYPES.join('|')} 중 하나` });
    }
    const targetRoutes = targetCellRoutes(target).filter(isConcreteTargetRoute);
    const resultRoutes = cellRoutes(result).filter(isConcreteRoute);
    if (rt === 'route') {
      if (targetRoutes.length === 0) {
        issues.push({ row: rowNo, kind: 'route-missing-target', message: `Result Type=route 인데 Target 에 구체 라우트가 없음 (${label}) — Target 에 라우트를 적거나 candidate/Open Decision 으로 남기세요` });
      }
      for (const r of resultRoutes) {
        if (!targetRoutes.includes(r)) {
          issues.push({ row: rowNo, kind: 'result-target-drift', message: `Result 의 라우트 ${r} 가 Target 에 없음 (${label}) — v2 Target 이 기계 판정의 권위입니다(불일치 확인 권장)` });
        }
      }
      if (routeTreeRouteSet) {
        for (const r of targetRoutes) {
          if (!routeTreeRouteSet.has(r)) {
            issues.push({
              row: rowNo,
              kind: 'route-tree-target-missing',
              message: `route-tree EXACT cross-check: Result Type=route Target ${r} 가 route-tree.txt route token 에 없음 (${label}) — warning-first`,
            });
          }
        }
      } else if (routeTreeMissing && targetRoutes.length > 0 && !routeTreeMissingWarned) {
        issues.push({
          row: rowNo,
          kind: 'route-tree-missing',
          message: `route-tree EXACT cross-check skipped: _meta/route-tree.txt 가 없어 Result Type=route Target 존재 확인을 건너뜀 (${label}) — warning-first`,
        });
        routeTreeMissingWarned = true;
      }
    } else {
      const stray = [...new Set([...targetRoutes, ...resultRoutes])];
      if (stray.length) {
        issues.push({ row: rowNo, kind: 'nonroute-has-route', message: `Result Type=${rt} 인데 라우트처럼 보이는 토큰(${stray.join(', ')})이 있음 (${label}) — 이동이면 Result Type=route 로 분류하세요` });
      }
    }
  }
  return issues;
}

export { REQUIRED_STATES };
