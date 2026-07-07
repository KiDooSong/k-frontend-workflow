// visual-consistency.mjs (lib) — cross-screen visual contract ↔ 산출물 대조 (warning-first).
//
// visual-consistency-contract(design/visual-consistency-contract.md) 를 읽어 ScreenSpec ·
// figma-component-mapping · component-catalog · (선택) screen_entry 소스 파일과 대조하고,
// multi-screen visual drift 후보를 **경고로만** 낸다. 계약 정본: docs/reference/visual-reconciliation.md.
//
// 불변식:
//  - 게이트가 아니다. warning 은 approval/readiness/confirmed 승격이 아니다. CLI 기본 exit 0.
//  - contract 부재 = 조용히 skip (cold start 를 막지 않는다 — validate 검사 12 NO-OP 동형).
//  - 구조 자체가 깨진 경우만 error: docs 경로 부재, contract frontmatter YAML 오류,
//    contract 존재하는데 Screen Families 표 부재.
//  - 소스 검사(direct import · ad-hoc positioning · copy)는 srcDir 와 ScreenSpec screen_entry 가
//    둘 다 있을 때만 돈다. 휴리스틱이라 오탐이 가능하고, 그래서 hard gate 로 올리지 않는다.
//    단 **명시된** --src 가 디렉토리가 아니면(오타 등) 조용히 skip 하지 않고 source-not-found
//    warning 으로 표면화한다 — 핵심 검사가 빠졌는데 통과처럼 보이는 것을 막는다.
//  - 결정성: findings/families 정렬 고정, 타임스탬프 없음, 모든 경로는 상대 posix.
//  - 아무것도 쓰지/만들지 않는다 (component code·catalog·contract 생성 금지 — 읽기 전용 진단).
//
// 이 모듈은 순수 로직 + 얕은 IO(산출물 읽기)만 한다. 출력/exit 는 CLI(scripts/visual-consistency.mjs).
import path from 'node:path';
import { findFiles, readFileSafe, exists, isDir, splitFrontmatter } from './util.mjs';
import { loadScreenSpec, parseTables, parseCopyKeys, col, hasHeader } from './spec.mjs';

// 표시용 경로 — fromDir 상대 posix(\→/). 절대 머신경로를 출력에 흘리지 않는다(결정성).
function relPosix(fromDir, absPath) {
  const rel = path.relative(fromDir, absPath);
  return (rel || '.').split(path.sep).join('/');
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// screen id 목록 셀("AUTH-001, AUTH-002")을 분해한다. 빈 값/placeholder(-) 는 버린다.
// screen id 는 공백을 포함하지 않으므로 콤마/공백 어느 쪽 구분도 허용한다.
function splitScreenIds(cell) {
  return String(cell || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '-');
}

// family 이름 목록 셀을 분해한다 — family 이름은 공백을 포함할 수 있으므로("Auth Flow")
// **콤마로만** 구분한다. 공백 분해하면 exact match 필터에서 rule 이 조용히 빠진다.
function splitFamilyNames(cell) {
  return String(cell || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '-');
}

// 셀이 실질 값인가 (빈칸·-·TBD·{placeholder} 는 미기재로 본다 — exception hygiene 용).
function cellFilled(cell) {
  const v = String(cell || '').trim();
  if (!v || v === '-' || /^tbd$/i.test(v)) return false;
  if (/^\{.*\}$/.test(v)) return false; // 미편집 템플릿 placeholder
  return true;
}

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

// findings 정렬: severity → rule → screen_id → component → file → message (결정적).
function sortFindings(findings) {
  return findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      compareText(a.rule, b.rule) ||
      compareText(a.screen_id || '', b.screen_id || '') ||
      compareText(a.component || '', b.component || '') ||
      compareText(a.file || '', b.file || '') ||
      compareText(a.message, b.message),
  );
}

// --- contract 파싱 ----------------------------------------------------------
// 본문 표 3종을 헤더 시그니처로 찾는다 (섹션 제목이 아니라 헤더가 계약 — spec.mjs 표 파서 재사용).
//   families   : Family | Member Screens (+ Layout/Shell Owner · Status …)
//   components : Component | Direct Screen Import (+ Owned By · Positioning Owner …)
//   exceptions : Screen ID | Exception (+ Reason · Decision ID …)
export function parseVisualContract(raw) {
  const { data, hasFrontmatter, parseError, body } = splitFrontmatter(raw);
  const tables = parseTables(body);
  const pick = (requiredCols) =>
    tables.find((t) => requiredCols.every((c) => hasHeader(t.headers, c))) || null;

  const familyTable = pick(['Family', 'Member Screens']);
  const componentTable = pick(['Component', 'Direct Screen Import']);
  const exceptionTable = pick(['Screen ID', 'Exception']);

  const families = [];
  if (familyTable) {
    for (const r of familyTable.rows) {
      const family = (col(r, 'Family') || '').trim();
      const members = splitScreenIds(col(r, 'Member Screens'));
      if (!family && members.length === 0) continue; // 빈 행
      if (family && /^\{.*\}$/.test(family)) continue; // 미편집 템플릿 행
      families.push({
        family,
        screens: members,
        shell_owner: (col(r, 'Layout/Shell Owner') || '').trim(),
        status: (col(r, 'Status') || '').trim().toLowerCase(),
      });
    }
  }
  families.sort((a, b) => compareText(a.family, b.family));

  const components = [];
  if (componentTable) {
    for (const r of componentTable.rows) {
      const component = (col(r, 'Component') || '').trim();
      if (!component || /^\{.*\}$/.test(component)) continue;
      components.push({
        component,
        owned_by: (col(r, 'Owned By') || '').trim(),
        applies_to_families: splitFamilyNames(col(r, 'Applies To Families')),
        direct_screen_import: (col(r, 'Direct Screen Import') || '').trim().toLowerCase(),
        positioning_owner: (col(r, 'Positioning Owner') || '').trim().toLowerCase(),
        // 권장 enum: cataloged | missing | domain | out-of-scope (검사 4 가 domain/out-of-scope
        // 를 명시 선언으로 인정한다 — 존재 정본은 여전히 component-catalog).
        catalog_status: (col(r, 'Catalog Status') || '').trim().toLowerCase(),
      });
    }
  }
  components.sort((a, b) => compareText(a.component, b.component));

  const exceptions = [];
  if (exceptionTable) {
    for (const r of exceptionTable.rows) {
      const screenId = (col(r, 'Screen ID') || '').trim();
      const exception = (col(r, 'Exception') || '').trim();
      if (!screenId && !exception) continue;
      if (screenId && /^\{.*\}$/.test(screenId)) continue; // 미편집 템플릿 행
      exceptions.push({
        screen_id: screenId,
        exception,
        reason: (col(r, 'Reason') || '').trim(),
        decision_id: (col(r, 'Decision ID') || '').trim(),
        status: (col(r, 'Status') || '').trim().toLowerCase(),
      });
    }
  }

  return {
    frontmatter: data || {},
    hasFrontmatter,
    parseError: parseError || null,
    hasFamilyTable: Boolean(familyTable),
    families,
    components,
    exceptions,
  };
}

// --- 산출물 수집 -------------------------------------------------------------
// docsDir 아래 screen-spec / figma-component-mapping 을 수집한다 (route-cross-check 수집식 미러).
function collectScreens(docsDir) {
  const byId = new Map();
  for (const p of findFiles(path.join(docsDir, 'domains'), 'screen-spec.md')) {
    const spec = loadScreenSpec(p);
    const id = spec.frontmatter && spec.frontmatter.screen_id;
    if (typeof id !== 'string' || !id) continue;
    byId.set(id, {
      screen_id: id,
      domain: typeof spec.frontmatter.domain === 'string' ? spec.frontmatter.domain : '',
      screen_entry:
        typeof spec.frontmatter.screen_entry === 'string' ? spec.frontmatter.screen_entry : null,
      copyKeys: parseCopyKeys(spec.sections['copy keys']).rows,
      file: relPosix(docsDir, p),
    });
  }
  return byId;
}

function collectFigmaMappings(docsDir) {
  const byId = new Map();
  for (const p of findFiles(path.join(docsDir, 'domains'), 'figma-component-mapping.md')) {
    const { data } = splitFrontmatter(readFileSafe(p));
    const id = data && data.screen_id;
    if (typeof id !== 'string' || !id) continue;
    byId.set(id, {
      status: typeof data.status === 'string' ? data.status.toLowerCase() : null,
      file: relPosix(docsDir, p),
    });
  }
  return byId;
}

// component-catalog(생성물) 의 Name 컬럼 집합. 카탈로그 파서를 새로 만들지 않고
// 같은 Markdown 표 파서로 "Name + Source Path 헤더를 가진 표"만 집는다.
// Components 표와 Default Export Candidates 표 모두 "카탈로그가 아는 이름"으로 센다.
function collectCatalogNames(catalogRaw) {
  const names = new Set();
  for (const t of parseTables(catalogRaw)) {
    if (!hasHeader(t.headers, 'Name') || !hasHeader(t.headers, 'Source Path')) continue;
    for (const r of t.rows) {
      const name = (col(r, 'Name') || '').trim();
      if (name) names.add(name);
    }
  }
  return names;
}

// component-gap-register 의 제안 행 인덱스: 제안 컴포넌트 이름 → G-xxx (있으면 finding 에 병기).
function collectGapProposals(gapRaw) {
  const byName = new Map();
  if (gapRaw == null) return byName;
  const { body } = splitFrontmatter(gapRaw);
  for (const t of parseTables(body)) {
    if (!hasHeader(t.headers, 'ID') || !hasHeader(t.headers, '제안 컴포넌트')) continue;
    for (const r of t.rows) {
      const name = (col(r, '제안 컴포넌트') || '').trim();
      const id = (col(r, 'ID') || '').trim();
      if (name && id && !byName.has(name)) byName.set(name, id);
    }
  }
  return byName;
}

// --- 소스 휴리스틱 -----------------------------------------------------------
// contract 셀 값이 regex 로 들어가므로 특수문자를 이스케이프한다 (깨진 셀 값으로 크래시 금지).
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// import 라인에서 컴포넌트 이름이 바인딩으로 들어오는지 (default/named 둘 다).
// 휴리스틱: "import ... <Name> ... from '...'" 라인 존재. 오탐 최소화를 위해 단어 경계만 본다.
export function findsDirectImport(source, componentName) {
  const re = new RegExp(`^\\s*import\\b[^;]*\\b${escapeRe(componentName)}\\b[^;]*from\\s+['"]`, 'm');
  return re.test(source);
}

// shell-owned 컴포넌트 사용부(<Name ...>) 근처의 ad-hoc positioning 후보 (휴리스틱).
// Tailwind(mt-/mb-/top-/translate-/absolute) · inline style(marginTop/top/position:'absolute'/transform)
// 를 같은 JSX 엘리먼트 안(여는 태그 ~ '>' 또는 최대 5줄)에서만 본다.
const ADHOC_CLASS_RE = /\b(?:-?m[tblrxy]?-\d+|top-\d+|bottom-\d+|translate-[xy]-|absolute|fixed)\b/;
const ADHOC_STYLE_RE = /\b(?:margin(?:Top|Bottom|Left|Right)?|top|bottom|transform)\s*:|position\s*:\s*['"]absolute['"]/;
export function findsAdhocPositioning(source, componentName) {
  const lines = source.split(/\r?\n/);
  const open = new RegExp(`<${escapeRe(componentName)}\\b`);
  for (let i = 0; i < lines.length; i++) {
    if (!open.test(lines[i])) continue;
    let chunk = '';
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      chunk += lines[j] + '\n';
      if (/>/.test(lines[j]) && j > i) break;
      if (j === i && lines[j].replace(open, '').includes('>')) break;
    }
    if (ADHOC_CLASS_RE.test(chunk) || ADHOC_STYLE_RE.test(chunk)) return true;
  }
  return false;
}

// JSX 텍스트 노드의 hardcoded user-visible copy 후보 (advisory skeleton — 오탐 가능성이 높아
// info 로만 낸다). ">텍스트<" 리터럴 중 표현식({...}) 이 아니고 글자를 포함하는 것만.
// TODO(visual-reconciliation follow-up): 문자열 prop(title="...") · i18n 호출 화이트리스트 등
// 정밀화는 dogfood telemetry 이후 별도 슬라이스로.
export function findHardcodedCopyCandidates(source) {
  const out = new Set();
  const re = />\s*([^<>{}\n][^<>{}\n]*?)\s*</g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const text = m[1].trim();
    if (!text) continue;
    if (!/[A-Za-z가-힣]/.test(text)) continue; // 글자 없는 노드(숫자/기호)는 제외
    out.add(text);
  }
  return [...out].sort(compareText);
}

// --- 분석 본체 ---------------------------------------------------------------
// 반환값은 그대로 JSON 직렬화 가능(CLI --json 페이로드). 모든 finding 경로는 상대 posix.
//   docsDir      : 문서 루트 (absolute)
//   srcDir       : 선택. 없으면 소스 검사(직접 import/positioning/copy) 전체 skip.
//   contractPath : 선택 override (absolute). 기본 <docs>/design/visual-consistency-contract.md.
//   domain/screen: 선택 필터. family/finding 을 해당 범위로 좁힌다.
//                  screen 은 단일 ID 또는 콤마 목록("A-001,A-002") — bootstrap --screen 과 동형.
export function analyzeVisualConsistency({ docsDir, srcDir, contractPath, domain, screen }) {
  const findings = [];
  const skippedChecks = [];
  const contractFile =
    contractPath || path.join(docsDir, 'design', 'visual-consistency-contract.md');

  const base = {
    tool: 'visual-consistency',
    mode: 'warning-first',
    docs: relPosix(process.cwd(), docsDir),
    contract_path: contractPath
      ? relPosix(process.cwd(), contractFile)
      : relPosix(docsDir, contractFile),
    contract_found: exists(contractFile),
  };

  // 구조 오류 1: docs 루트 부재 — 진단 대상 자체가 없다 (설정 오류, error).
  if (!isDir(docsDir)) {
    findings.push({
      severity: 'error',
      rule: 'docs-not-found',
      message: `docs 경로가 없음: ${base.docs} — --docs 로 문서 루트를 지정하세요.`,
    });
    return finalize(base, findings, [], skippedChecks);
  }

  // contract 부재 = 조용히 skip (cold start 허용 — 검사 12 NO-OP 동형). 경고 아님.
  if (!base.contract_found) {
    return {
      ...base,
      skipped: true,
      skip_reason: `visual-consistency-contract 없음: ${base.contract_path} (도입 전이면 정상 — warning-first skip)`,
      summary: { families: 0, screens: 0, errors: 0, warnings: 0, infos: 0 },
      families: [],
      findings: [],
      skipped_checks: [],
      ok: true,
    };
  }

  const contract = parseVisualContract(readFileSafe(contractFile));

  // 구조 오류 2: frontmatter YAML 파싱 실패 / Screen Families 표 부재 — 계약이 깨졌다.
  if (contract.parseError) {
    findings.push({
      severity: 'error',
      rule: 'contract-malformed',
      file: base.contract_path,
      message: `contract frontmatter YAML 파싱 실패: ${contract.parseError}`,
    });
  }
  if (!contract.hasFamilyTable) {
    findings.push({
      severity: 'error',
      rule: 'contract-malformed',
      file: base.contract_path,
      message:
        'contract 에 Screen Families 표(Family|Member Screens 헤더)가 없음 — 템플릿(templates/design/visual-consistency-contract.template.md) 헤더를 유지하세요.',
    });
  }
  if (findings.some((f) => f.severity === 'error')) {
    return finalize(base, findings, [], skippedChecks);
  }

  const screens = collectScreens(docsDir);
  const mappings = collectFigmaMappings(docsDir);

  // --- 선택 필터: --screen(콤마 목록 허용) / --domain 은 family 멤버십 기준으로 범위를 좁힌다.
  //     콤마 목록은 bootstrap --screen 과 scope 를 맞추기 위한 확장이다 — 단일 ID 동작은 불변.
  const screenFilterIds = splitScreenIds(screen);
  const screenFilter = screenFilterIds.length ? new Set(screenFilterIds) : null;
  let families = contract.families;
  if (screenFilter) {
    families = families.filter((f) => f.screens.some((id) => screenFilter.has(id)));
  } else if (domain) {
    families = families.filter((f) =>
      f.screens.some((id) => (screens.get(id) || {}).domain === domain),
    );
  }
  const selectedScreenIds = new Set(families.flatMap((f) => f.screens));
  const screenInScope = (id) =>
    screenFilter ? screenFilter.has(id) : domain ? selectedScreenIds.has(id) : true;
  const selectedFamilyNames = new Set(families.map((f) => f.family));

  // --- 검사 2: contract member ↔ ScreenSpec screen_id (screen-not-found = warning;
  //     --enforce 는 CLI 에서 warning 전체를 exit 1 로 승격한다 — 개별 rule 하드코딩 없음).
  const familyReports = [];
  for (const f of families) {
    const missingSpecs = f.screens.filter((id) => !screens.has(id)).sort(compareText);
    for (const id of missingSpecs) {
      if (!screenInScope(id)) continue;
      findings.push({
        severity: 'warning',
        rule: 'screen-not-found',
        family: f.family,
        screen_id: id,
        message: `contract family '${f.family}' 의 member screen ${id} 에 해당하는 ScreenSpec 이 없음 — screen id 오타이거나 Stage 02(screen identity) 미해결.`,
      });
    }

    // --- 검사 3: figma mapping coverage (ScreenSpec 이 존재하는 멤버만 대상 — 이중 카운트 방지).
    //     mapping status lifecycle 을 같이 보고하되 pixel fidelity 를 주장하지 않는다.
    const mappingStatus = {};
    const missingMappings = [];
    for (const id of [...f.screens].sort(compareText)) {
      if (!screens.has(id)) continue;
      const m = mappings.get(id);
      mappingStatus[id] = m ? m.status : null;
      if (!m) {
        missingMappings.push(id);
        if (!screenInScope(id)) continue;
        findings.push({
          severity: 'warning',
          rule: 'figma-mapping-missing',
          family: f.family,
          screen_id: id,
          message: `family '${f.family}' 의 ${id} 에 figma-component-mapping.md 가 없음 — 같은 family 의 다른 화면만 시각 매핑을 가지면 batch update 시 drift 후보.`,
        });
      }
    }

    familyReports.push({
      family: f.family,
      screens: [...f.screens].sort(compareText),
      shell_owner: f.shell_owner,
      status: f.status,
      missing_screen_specs: missingSpecs,
      missing_figma_mappings: missingMappings,
      figma_mapping_status: mappingStatus,
    });
  }
  familyReports.sort((a, b) => compareText(a.family, b.family));

  // --- 검사 4: Shared Component Rules ↔ component catalog (component-gap 후보 보고만).
  const catalogFile = path.join(docsDir, 'design', 'component-catalog.md');
  const componentsInScope = contract.components.filter(
    (c) =>
      c.applies_to_families.length === 0 ||
      !screenFilter && !domain ||
      c.applies_to_families.some((fam) => selectedFamilyNames.has(fam)),
  );
  if (!exists(catalogFile)) {
    skippedChecks.push({
      rule: 'component-gap-candidate',
      reason: `component-catalog 없음: ${relPosix(docsDir, catalogFile)} — 카탈로그 대조 skip (workflow:catalog 로 생성 가능).`,
    });
  } else {
    const catalogNames = collectCatalogNames(readFileSafe(catalogFile));
    const gapProposals = collectGapProposals(
      readFileSafe(path.join(docsDir, 'global', 'component-gap-register.md')),
    );
    for (const c of componentsInScope) {
      if (catalogNames.has(c.component)) continue;
      // Catalog Status 가 domain/out-of-scope 로 명시 선언된 행은 ui_primitive catalog 대상이
      // 아니다 (#153 ③) — warning 대신 info 로 남긴다 (silent pass 아님, 선언 확인은 사람).
      if (c.catalog_status === 'domain' || c.catalog_status === 'out-of-scope') {
        findings.push({
          severity: 'info',
          rule: 'component-catalog-out-of-scope',
          component: c.component,
          message:
            `contract 의 shared component '${c.component}' 는 Catalog Status '${c.catalog_status}' 로 명시 선언됨 — ` +
            'ui_primitive catalog 대상이 아니어서 component-gap-candidate 경고를 내지 않음 (선언이 맞는지는 사람 리뷰).',
        });
        continue;
      }
      const proposed = gapProposals.get(c.component);
      findings.push({
        severity: 'warning',
        rule: 'component-gap-candidate',
        component: c.component,
        message:
          `contract 의 shared component '${c.component}' 가 component catalog 에 없음 — ` +
          (proposed
            ? `이미 component-gap-register 에 ${proposed} 로 제안됨 (accept 는 사람).`
            : `component-gap-register 에 G-xxx 로 제안만 하세요 (직접 생성/카탈로그 수정 금지).`),
      });
    }
  }

  // --- 검사 7: visual exception hygiene (Reason/Decision ID 없는 예외는 silent pass 후보).
  const exceptionsInScope = contract.exceptions.filter((e) => screenInScope(e.screen_id));
  for (const e of exceptionsInScope) {
    const missing = [];
    if (!cellFilled(e.reason)) missing.push('Reason');
    if (!cellFilled(e.decision_id)) missing.push('Decision ID');
    if (missing.length === 0) continue;
    findings.push({
      severity: 'warning',
      rule: 'exception-hygiene',
      screen_id: e.screen_id,
      message: `Visual Exceptions 행(${e.screen_id}: ${e.exception || '(내용 없음)'})에 ${missing.join(' · ')} 누락 — 예외는 silent pass 가 아니라 근거+decision 참조가 있는 명시적 기록이어야 함.`,
    });
  }

  // 기록된 예외 인덱스: screen_id → 유효 예외 행들 (direct-import/positioning finding 강등용).
  const recordedExceptions = contract.exceptions.filter(
    (e) => cellFilled(e.reason) && cellFilled(e.decision_id),
  );
  const exceptionFor = (screenId, componentName) =>
    recordedExceptions.find(
      (e) =>
        e.screen_id === screenId &&
        (e.exception.toLowerCase().includes(componentName.toLowerCase()) ||
          e.reason.toLowerCase().includes(componentName.toLowerCase())),
    ) || null;

  // --- 검사 5·6·8: 소스 휴리스틱 (srcDir + screen_entry 둘 다 있을 때만).
  if (!srcDir) {
    skippedChecks.push({
      rule: 'direct-screen-import',
      reason: '--src 미지정 — 소스 검사(직접 import · ad-hoc positioning · copy) skip.',
    });
  } else if (!isDir(srcDir)) {
    // --src 미지정(optional 생략)과 달리 **명시 입력이 틀린** 경우다 — 조용히 통과처럼 보이면
    // 핵심 검사가 빠졌는지 알 수 없으므로 warning 으로 표면화한다 (warning-first — exit 은 그대로 0).
    findings.push({
      severity: 'warning',
      rule: 'source-not-found',
      message: `--src 경로가 디렉토리가 아님: ${relPosix(process.cwd(), srcDir)} — 소스 검사(직접 import · ad-hoc positioning · copy)를 실행하지 못함. --src 값을 확인하세요.`,
    });
    skippedChecks.push({
      rule: 'direct-screen-import',
      reason: '--src 경로가 디렉토리가 아님 — 소스 검사 skip (source-not-found warning 참조).',
    });
  } else {
    const projectRoot = path.dirname(srcDir); // screen_entry 는 프로젝트 루트 상대 (util.projectRootOf 동형)
    const forbiddenComponents = componentsInScope.filter(
      (c) => c.direct_screen_import === 'forbidden',
    );
    for (const f of families) {
      for (const id of [...f.screens].sort(compareText)) {
        if (!screenInScope(id)) continue;
        const s = screens.get(id);
        if (!s || !s.screen_entry) continue; // screen_entry 힌트 없으면 skip (오탐 방지)
        const entryAbs = path.resolve(projectRoot, s.screen_entry);
        const source = readFileSafe(entryAbs);
        if (source == null) continue; // 파일 부재 — 구현 전 화면일 수 있음. 조용히 skip.
        const entryRel = relPosix(projectRoot, entryAbs);

        for (const c of forbiddenComponents) {
          if (
            c.applies_to_families.length > 0 &&
            !c.applies_to_families.includes(f.family)
          )
            continue;
          const imported = findsDirectImport(source, c.component);
          if (imported) {
            const exception = exceptionFor(id, c.component);
            findings.push({
              severity: exception ? 'info' : 'warning',
              rule: 'direct-screen-import',
              family: f.family,
              screen_id: id,
              component: c.component,
              file: entryRel,
              message:
                `${c.component} 는 ${c.owned_by || 'shell'} 소유(Direct Screen Import: forbidden)인데 screen file 이 직접 import 함 — shell/layout 로 올리세요.` +
                (exception ? ` (recorded exception: ${exception.decision_id})` : ''),
            });
          }
          // ad-hoc positioning 은 사용부가 있어야 의미가 있다 — 사용부 존재 여부와 무관하게
          // 휴리스틱이 <Component 태그를 찾을 때만 발화한다.
          if (findsAdhocPositioning(source, c.component)) {
            const exception = exceptionFor(id, c.component);
            findings.push({
              severity: exception ? 'info' : 'warning',
              rule: 'adhoc-positioning',
              family: f.family,
              screen_id: id,
              component: c.component,
              file: entryRel,
              message:
                `${c.component} 사용부 주변에 ad-hoc margin/top/translate/absolute 후보 — positioning owner 는 ${c.positioning_owner || 'shell'} (휴리스틱 advisory).` +
                (exception ? ` (recorded exception: ${exception.decision_id})` : ''),
            });
          }
        }

        // 검사 8: Copy Keys 가 있는 화면의 hardcoded user-visible copy 후보 (info — 오탐 가능).
        if (s.copyKeys.length > 0) {
          for (const text of findHardcodedCopyCandidates(source)) {
            findings.push({
              severity: 'info',
              rule: 'hardcoded-copy-candidate',
              family: f.family,
              screen_id: id,
              file: entryRel,
              message: `hardcoded user-visible copy 후보: "${text}" — ScreenSpec Copy Keys(i18n) 경유 여부를 확인하세요 (advisory, 오탐 가능).`,
            });
          }
        }
      }
    }
  }

  return finalize(base, findings, familyReports, skippedChecks);
}

function finalize(base, findings, familyReports, skippedChecks) {
  sortFindings(findings);
  skippedChecks.sort((a, b) => compareText(a.rule, b.rule));
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  const screenCount = new Set(familyReports.flatMap((f) => f.screens)).size;
  return {
    ...base,
    skipped: false,
    skip_reason: null,
    summary: {
      families: familyReports.length,
      screens: screenCount,
      errors,
      warnings,
      infos,
    },
    families: familyReports,
    findings,
    skipped_checks: skippedChecks,
    ok: errors === 0,
  };
}

// --- 사람-읽기 출력 ----------------------------------------------------------
// stderr 용 라인 배열 (route-cross-check formatHuman 미러). skip/ok 도 항상 한 줄 이상.
export function formatVisualConsistencyHuman(report) {
  if (report.skipped) {
    return [`visual-consistency — skip (warning-first): ${report.skip_reason}`];
  }
  const lines = [];
  const { errors, warnings, infos, families, screens } = report.summary;
  if (errors === 0 && warnings === 0) {
    lines.push(
      `visual-consistency — ok (warning-first): ${families} family(ies), ${screens} screen(s)` +
        (infos ? `, ${infos} advisory info(s)` : ''),
    );
  } else {
    lines.push(
      `visual-consistency — ${errors} error(s), ${warnings} warning(s), ${infos} info(s) (warning-first, not a gate)`,
    );
  }
  for (const f of report.findings) {
    const where = [f.screen_id, f.component, f.file].filter(Boolean).join(' · ');
    lines.push(`  [${f.severity}] ${f.rule}${where ? ` (${where})` : ''}: ${f.message}`);
  }
  for (const s of report.skipped_checks) {
    lines.push(`  [skip] ${s.rule}: ${s.reason}`);
  }
  return lines;
}
