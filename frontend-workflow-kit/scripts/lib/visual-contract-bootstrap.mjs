// visual-contract-bootstrap.mjs (lib) — visual consistency contract 도입(bootstrap) 후보 추출 (review-only).
//
// consumer repo 의 ScreenSpec frontmatter · figma-component-mapping · component-catalog ·
// (선택 --src) screen_entry 소스를 **읽기만** 하고, screen family 후보 · shared
// shell/logo/header/CTA ownership 후보(이름 정규식 미매칭 반복 local import 는 kind:unknown) ·
// figma mapping coverage · component gap 후보 · suggested contract rows 를 draft/review-only 로 낸다.
// 계약 정본: docs/reference/visual-reconciliation.md §Bootstrap / adoption.
// 설계 기록: kit-dev/temp/proposals/visual-contract-bootstrap-adoption.md.
//
// 불변식:
//  - review-only. 후보는 approval/confirmed/readiness/gate 가 아니다. CLI 기본 exit 0.
//  - 기존 canonical contract 를 절대 수정/overwrite 하지 않는다 — 존재하면 읽어서
//    existing rows / suggested additions 를 분리해 제안만 한다.
//  - 완벽한 자동 추론이 목표가 아니다 — "안전한 후보 제안"이 목표다. 반복 import 는
//    design intent 의 proof 가 아니라 증거 후보일 뿐이며, suggested component rule 의
//    rule 컬럼(Direct Screen Import / Positioning Owner)은 항상 needs-review 로 낸다.
//  - catalog 에 없는 shared 후보는 Component Gap **후보**로만 표시한다 (G-xxx 제안/accept 는
//    기존 component-gap-register 경로 — 여기서 register/catalog 를 만들거나 고치지 않는다).
//  - behavior 는 ScreenSpec / Navigation Map / Open Decision 경로만 탄다 — bootstrap 은
//    behavior 를 확정하지 않는다.
//  - 구조 오류(docs 부재 · 기존 contract malformed)만 error. 그 외는 warning/info.
//  - 결정성: 모든 배열 정렬 고정, 타임스탬프 없음, 경로는 상대 posix. 같은 입력 → 같은 출력.
//  - 아무것도 쓰지 않는다 — 파일 출력(--out)은 CLI(scripts/visual-contract-bootstrap.mjs) 소관.
//
// 이 모듈은 순수 로직 + 얕은 IO(산출물 읽기)만 한다. PR144 visual-consistency 의 파서/휴리스틱을 재사용한다.
import path from 'node:path';
import { findFiles, readFileSafe, exists, isDir, splitFrontmatter } from './util.mjs';
import { loadScreenSpec, parseCopyKeys, parseTables, col, hasHeader } from './spec.mjs';
import {
  parseVisualContract,
  findsAdhocPositioning,
  findHardcodedCopyCandidates,
} from './visual-consistency.mjs';

// 표시용 경로 — fromDir 상대 posix(\→/). 절대 머신경로를 출력에 흘리지 않는다(결정성).
function relPosix(fromDir, absPath) {
  const rel = path.relative(fromDir, absPath);
  return (rel || '.').split(path.sep).join('/');
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

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

// --- 이름 휴리스틱 -----------------------------------------------------------
// shell/header/logo/CTA-like 이름 감지. 우선순위: shell > logo > header > cta
// ("HeaderLayout" 같은 복합 이름이 shell 로 분류되게). 오탐 가능 — 그래서 후보일 뿐이다.
const SHELL_NAME_RE = /(Shell|Layout)$/;
const LOGO_NAME_RE = /Logo/;
const HEADER_NAME_RE = /Header/;
const CTA_NAME_RE = /(CTA|Cta)$/;

export function classifyComponentKind(name) {
  if (SHELL_NAME_RE.test(name)) return 'shell';
  if (LOGO_NAME_RE.test(name)) return 'logo';
  if (HEADER_NAME_RE.test(name)) return 'header';
  if (CTA_NAME_RE.test(name) || name === 'Button') return 'cta';
  return null;
}

// local import 판정 (보수적): 상대(./ ../) + 프로젝트 alias(@/ src/) 만 local 로 본다.
// bare package("react", "react-native", "@scope/pkg")는 제외 — node_modules 컴포넌트가
// shared 후보로 올라오면 안 된다.
export function isLocalImportSpecifier(from) {
  return (
    from.startsWith('./') ||
    from.startsWith('../') ||
    from.startsWith('@/') ||
    from.startsWith('src/')
  );
}

// kind:unknown 후보로 볼 "컴포넌트처럼 보이는 이름" — PascalCase(소문자 포함).
// useLoginQuery(hook)·API_BASE(상수)·icons(namespace) 같은 비-컴포넌트 바인딩을 거른다.
function looksLikeComponentName(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);
}

// import 문에서 바인딩 이름을 뽑는다 (default / named / namespace, type-only 제외).
// 휴리스틱 파서다 — 문자열 내 유사 구문 등 오탐이 가능하고, 그래서 후보 증거로만 쓴다.
export function extractImportBindings(source) {
  const bindings = [];
  // [^;] 로 statement 경계를 지켜 여러 줄 named import 를 허용하되 다음 문장으로 넘치지 않게 한다.
  const re = /(?:^|\n)[ \t]*import\s+([^;'"]+?)\s+from\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) {
    let clause = m[1].trim();
    const from = m[2];
    if (/^type\s/.test(clause)) continue; // type-only import
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(',')) {
        let name = part.trim();
        if (!name || /^type\s/.test(name)) continue;
        const as = name.split(/\s+as\s+/);
        name = (as[1] || as[0]).trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) bindings.push({ name, from });
      }
      clause = clause.replace(/\{[^}]*\}/, ' ').replace(/,/g, ' ').trim();
    }
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) bindings.push({ name: ns[1], from });
    const def = clause.match(/^([A-Za-z_$][\w$]*)/);
    if (def) bindings.push({ name: def[1], from });
  }
  // 결정성: 같은 (name, from) 중복 제거 + 정렬은 호출부가 필요 시 수행 (여기선 등장 순서 유지)
  const seen = new Set();
  return bindings.filter((b) => {
    const key = `${b.name}\u0000${b.from}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 상대 import specifier 를 실제 파일로 해소한다 (best-effort — 못 찾으면 null).
// TODO(visual-contract-bootstrap follow-up): 상대 import 만 따라간다 — alias import
// (`@/...`, tsconfig paths) 기반 repo 에서는 shell 내부 logo/header 증거를 놓칠 수 있다.
// dogfood telemetry 이후 별도 슬라이스 (설계 노트 hardening 후보 참조).
const RESOLVE_SUFFIXES = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
function resolveRelativeImport(entryAbs, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const base = path.resolve(path.dirname(entryAbs), specifier);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (exists(candidate) && !isDir(candidate)) return candidate;
  }
  return null;
}

// --- 산출물 수집 -------------------------------------------------------------
function collectScreens(docsDir) {
  const byId = new Map();
  for (const p of findFiles(path.join(docsDir, 'domains'), 'screen-spec.md')) {
    const spec = loadScreenSpec(p);
    const id = spec.frontmatter && spec.frontmatter.screen_id;
    if (typeof id !== 'string' || !id) continue;
    byId.set(id, {
      screen_id: id,
      domain: typeof spec.frontmatter.domain === 'string' ? spec.frontmatter.domain : '',
      route: typeof spec.frontmatter.route === 'string' ? spec.frontmatter.route : '',
      status: typeof spec.frontmatter.status === 'string' ? spec.frontmatter.status : '',
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
    });
  }
  return byId;
}

// component-catalog 의 Name 집합 — visual-consistency 와 같은 표 시그니처(Name + Source Path)를 쓴다.
// candidate 표의 이름도 gap 오탐 방지 evidence 로 세되 승인/confirmed 신호로 해석하지 않는다.
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

// --- family 후보 추론 --------------------------------------------------------
// screen_id prefix: 첫 '-' 앞 토큰 (AUTH-001 → AUTH). 없으면 null.
function screenIdPrefix(id) {
  const i = id.indexOf('-');
  return i > 0 ? id.slice(0, i) : null;
}

// route 첫 세그먼트 (/auth/login → auth). 루트('/')나 빈 값은 null.
function routePrefix(route) {
  const m = /^\/([^/]+)\//.exec(String(route || ''));
  return m ? m[1] : null;
}

function confidenceOf(evidenceCount) {
  if (evidenceCount >= 4) return 'high';
  if (evidenceCount >= 2) return 'medium';
  return 'low';
}

// --- 분석 본체 ---------------------------------------------------------------
//   docsDir      : 문서 루트 (absolute)
//   srcDir       : 선택. 없으면 소스 휴리스틱(shared import / logo / CTA / copy) 전체 skip.
//   contractPath : 선택 override (absolute). 기본 <docs>/design/visual-consistency-contract.md.
//   domain       : 선택 필터 — 해당 domain 의 화면만 본다.
//   screens      : 선택 필터 — canonical screen id 배열.
export function analyzeVisualContractBootstrap({ docsDir, srcDir, contractPath, domain, screens }) {
  const findings = [];
  const skippedChecks = [];
  const contractFile =
    contractPath || path.join(docsDir, 'design', 'visual-consistency-contract.md');

  const base = {
    tool: 'visual-contract-bootstrap',
    mode: 'review-only',
    docs: relPosix(process.cwd(), docsDir),
    src: srcDir ? relPosix(process.cwd(), srcDir) : null,
    existing_contract: {
      path: contractPath
        ? relPosix(process.cwd(), contractFile)
        : relPosix(docsDir, contractFile),
      found: exists(contractFile),
    },
  };

  // 구조 오류 1: docs 루트 부재 (visual-consistency docs-not-found 동형).
  if (!isDir(docsDir)) {
    findings.push({
      severity: 'error',
      rule: 'docs-not-found',
      message: `docs 경로가 없음: ${base.docs} — --docs 로 문서 루트를 지정하세요.`,
    });
    return finalize(base, findings, [], [], [], { families: [], components: [] }, skippedChecks);
  }

  // 기존 contract: 있으면 읽어서 existing rows 를 분리한다 (절대 수정하지 않는다).
  let contract = null;
  if (base.existing_contract.found) {
    contract = parseVisualContract(readFileSafe(contractFile));
    // 구조 오류 2: 기존 contract 가 깨져 있으면 suggested additions 를 안전하게 분리할 수 없다.
    if (contract.parseError || !contract.hasFamilyTable) {
      findings.push({
        severity: 'error',
        rule: 'contract-malformed',
        file: base.existing_contract.path,
        message: contract.parseError
          ? `기존 contract frontmatter YAML 파싱 실패: ${contract.parseError}`
          : '기존 contract 에 Screen Families 표(Family|Member Screens 헤더)가 없음 — 먼저 contract 를 템플릿 헤더로 복구하세요.',
      });
      return finalize(base, findings, [], [], [], { families: [], components: [] }, skippedChecks);
    }
    findings.push({
      severity: 'warning',
      rule: 'existing-contract-not-overwritten',
      file: base.existing_contract.path,
      message:
        '기존 visual-consistency-contract 발견 — bootstrap 은 overwrite 하지 않고 suggested additions 만 낸다 (반영은 사람 리뷰 후 수동).',
    });
  }
  const existingFamilyNames = new Set(
    (contract ? contract.families : []).map((f) => f.family.toLowerCase()),
  );
  const existingMemberIds = new Set(
    (contract ? contract.families : []).flatMap((f) => f.screens),
  );
  const existingComponentNames = new Set(
    (contract ? contract.components : []).map((c) => c.component),
  );

  // --- 화면 수집 + 필터 ------------------------------------------------------
  const allScreens = collectScreens(docsDir);
  const mappings = collectFigmaMappings(docsDir);
  const screenFilter = Array.isArray(screens) && screens.length ? new Set(screens) : null;
  const selected = [...allScreens.values()]
    .filter((s) => (domain ? s.domain === domain : true))
    .filter((s) => (screenFilter ? screenFilter.has(s.screen_id) : true))
    .sort((a, b) => compareText(a.screen_id, b.screen_id));

  if (selected.length === 0) {
    findings.push({
      severity: 'info',
      rule: 'no-screens-discovered',
      message:
        'ScreenSpec 미발견 (no screens discovered) — docs 경로/필터(--domain/--screen)를 확인하세요. 도입 전(cold start)이면 정상.',
    });
    return finalize(base, findings, [], [], [], { families: [], components: [] }, skippedChecks);
  }

  // --- 소스 준비 (있을 때만) --------------------------------------------------
  let srcUsable = false;
  if (!srcDir) {
    skippedChecks.push({
      rule: 'source-scan',
      reason: '--src 미지정 — 소스 휴리스틱(shared shell/logo/header/CTA import · ad-hoc positioning · copy) skip. family 후보는 docs 만으로 산출.',
    });
  } else if (!isDir(srcDir)) {
    // 명시된 --src 가 틀린 경우 — 조용히 통과처럼 보이지 않게 warning 으로 표면화 (visual-consistency 동형).
    findings.push({
      severity: 'warning',
      rule: 'source-not-found',
      message: `--src 경로가 디렉토리가 아님: ${base.src} — 소스 휴리스틱을 실행하지 못함. --src 값을 확인하세요.`,
    });
    skippedChecks.push({
      rule: 'source-scan',
      reason: '--src 경로가 디렉토리가 아님 — 소스 휴리스틱 skip (source-not-found warning 참조).',
    });
  } else {
    srcUsable = true;
    // --src 는 지정됐는데 selected 화면 전부에 screen_entry 가 없으면 소스 휴리스틱이
    // 통째로 no-op 이 된다 — silent pass 처럼 보이지 않게 skip 사유를 남긴다 (#153 ①).
    // 일부만 있는 경우는 기존처럼 가능한 화면만 분석한다 (전체 skip 아님).
    const entriesCount = selected.filter((s) => s.screen_entry).length;
    if (entriesCount === 0) {
      skippedChecks.push({
        rule: 'source-scan',
        reason:
          `--src 는 지정되었지만 selected ScreenSpec ${selected.length}건 중 screen_entry 가 0건 — ` +
          '소스 휴리스틱(shared shell/logo/header/CTA import · ad-hoc positioning · copy)을 실행하지 못함. ' +
          'ScreenSpec frontmatter 에 screen_entry 를 백필하세요 (sources[type=code] ref 는 자동 fallback 하지 않는다).',
      });
    }
  }
  const projectRoot = srcUsable ? path.dirname(srcDir) : null; // screen_entry 는 프로젝트 루트 상대

  // --- component catalog ------------------------------------------------------
  const catalogFile = path.join(docsDir, 'design', 'component-catalog.md');
  let catalogNames = null;
  if (exists(catalogFile)) {
    catalogNames = collectCatalogNames(readFileSafe(catalogFile));
  } else {
    skippedChecks.push({
      rule: 'component-gap-candidate',
      reason: `component-catalog 없음: ${relPosix(docsDir, catalogFile)} — 카탈로그 대조 skip (workflow:catalog 로 생성 가능).`,
    });
  }

  // --- domain 별 family 후보 ---------------------------------------------------
  const byDomain = new Map();
  for (const s of selected) {
    const key = s.domain || '(no-domain)';
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key).push(s);
  }

  const familyReports = [];
  const sharedByName = new Map(); // component → aggregate across families
  const suggestedFamilies = [];

  for (const [domainName, members] of [...byDomain.entries()].sort((a, b) => compareText(a[0], b[0]))) {
    const memberIds = members.map((s) => s.screen_id); // 이미 정렬됨 (selected 정렬 유지)
    const evidence = [`same domain ${domainName}`];
    const familyFindings = [];

    // screen_id prefix
    const prefixes = new Set(memberIds.map(screenIdPrefix));
    if (members.length >= 2 && prefixes.size === 1 && !prefixes.has(null)) {
      evidence.push(`same screen_id prefix ${[...prefixes][0]}`);
    }
    // route prefix
    const routePrefixes = new Set(members.map((s) => routePrefix(s.route)));
    if (members.length >= 2 && routePrefixes.size === 1 && !routePrefixes.has(null)) {
      evidence.push(`same route prefix /${[...routePrefixes][0]}`);
    }
    // screen_entry feature directory
    const entryDirs = new Set(
      members
        .filter((s) => s.screen_entry)
        .map((s) => s.screen_entry.split('\\').join('/').replace(/\/[^/]*$/, '')),
    );
    const entriesCount = members.filter((s) => s.screen_entry).length;
    if (entriesCount >= 2 && entryDirs.size === 1) {
      evidence.push(`shared feature directory ${[...entryDirs][0]} (${entriesCount}/${members.length} screens)`);
    }

    // --- 소스 import 집계 -----------------------------------------------------
    // importCounts: 후보 이름 → { kind, screens: Set<id>, entries: Map<id, entryRel> }
    const importCounts = new Map();
    const sources = new Map(); // screen_id → { source, entryAbs, entryRel }
    if (srcUsable) {
      for (const s of members) {
        if (!s.screen_entry) continue;
        const entryAbs = path.resolve(projectRoot, s.screen_entry);
        const source = readFileSafe(entryAbs);
        if (source == null) continue; // 구현 전 화면 — 조용히 skip
        const entryRel = relPosix(projectRoot, entryAbs);
        sources.set(s.screen_id, { source, entryAbs, entryRel });
        for (const b of extractImportBindings(source)) {
          let kind = classifyComponentKind(b.name);
          if (!kind) {
            // 이름 정규식에 안 잡혀도 반복 import 되는 local 컴포넌트는 kind:unknown
            // 후보로 표면화한다 (#153 ②). bare package import 는 후보가 아니다.
            if (!isLocalImportSpecifier(b.from) || !looksLikeComponentName(b.name)) continue;
            kind = 'unknown';
          }
          if (!importCounts.has(b.name)) {
            importCounts.set(b.name, { kind, screens: new Set(), from: new Map() });
          }
          const entry = importCounts.get(b.name);
          entry.screens.add(s.screen_id);
          if (!entry.from.has(s.screen_id)) entry.from.set(s.screen_id, b.from);
        }
      }
    }

    // 반복 import evidence (이름 정렬 — 결정성)
    for (const name of [...importCounts.keys()].sort(compareText)) {
      const entry = importCounts.get(name);
      if (entry.screens.size >= 2) {
        evidence.push(`repeated ${name} import (${entry.screens.size}/${members.length} screens)`);
      }
    }

    // --- shell owner 후보: shell-kind 중 최다 반복 import (동률 → 이름 정렬 첫 번째) ---
    let shellOwner = null;
    let shellSource = null;
    const shellCandidates = [...importCounts.entries()]
      .filter(([, e]) => e.kind === 'shell' && e.screens.size >= 2)
      .sort((a, b) => b[1].screens.size - a[1].screens.size || compareText(a[0], b[0]));
    if (shellCandidates.length) {
      shellOwner = shellCandidates[0][0];
      // shell 소스 해소: 멤버(정렬순) 중 첫 상대 import 를 따라가 본다 (best-effort).
      for (const id of memberIds) {
        const src = sources.get(id);
        if (!src) continue;
        const from = shellCandidates[0][1].from.get(id);
        if (!from) continue;
        const resolved = resolveRelativeImport(src.entryAbs, from);
        if (resolved) {
          shellSource = readFileSafe(resolved);
          break;
        }
      }
    }

    // --- logo / header / CTA policy 후보 --------------------------------------
    const shellBindings = shellSource ? extractImportBindings(shellSource) : [];
    const shellImportsLogo = shellBindings.some((b) => classifyComponentKind(b.name) === 'logo');
    const shellImportsHeader = shellBindings.some((b) => classifyComponentKind(b.name) === 'header');
    const shellHasHeaderTag = shellSource ? /<header[\s>]/.test(shellSource) : false;

    const logoDirectImports = [...importCounts.entries()].filter(([, e]) => e.kind === 'logo');
    const logoImportedByScreens = logoDirectImports.some(([, e]) => e.screens.size > 0);

    let logoPolicy = 'needs-human-review';
    if (shellOwner && shellImportsLogo) logoPolicy = 'shell-owned candidate';
    else if (logoImportedByScreens) logoPolicy = 'screen-imported observed — needs-human-review';

    let headerPolicy = 'needs-human-review';
    if (shellOwner && (shellImportsHeader || shellHasHeaderTag)) headerPolicy = 'shell-owned candidate';

    const ctaShared = [...importCounts.entries()].some(
      ([, e]) => e.kind === 'cta' && e.screens.size >= 2,
    );
    const ctaPolicy = ctaShared ? 'shared-bottom-cta candidate' : 'needs-human-review';

    const copySource = members.some((s) => s.copyKeys.length > 0)
      ? 'Copy Keys/i18n candidate'
      : 'needs-human-review';

    // --- logo 직접 import / ad-hoc positioning / copy 관찰 (family findings, info) ---
    for (const [name, entry] of [...logoDirectImports].sort((a, b) => compareText(a[0], b[0]))) {
      for (const id of [...entry.screens].sort(compareText)) {
        const src = sources.get(id);
        if (!src) continue;
        familyFindings.push({
          severity: 'info',
          rule: 'direct-screen-import-observed',
          screen_id: id,
          component: name,
          file: src.entryRel,
          message: `${name} 를 screen file 이 직접 import 함 — shell-owned 후보와 충돌할 수 있는 관찰(needs review). 계약 확정은 사람 리뷰 후 canonical contract 에서.`,
        });
        if (findsAdhocPositioning(src.source, name)) {
          familyFindings.push({
            severity: 'info',
            rule: 'adhoc-positioning-observed',
            screen_id: id,
            component: name,
            file: src.entryRel,
            message: `${name} 사용부 주변에 ad-hoc margin/top/translate/absolute 후보 — positioning owner 후보 결정이 필요함 (휴리스틱, 오탐 가능).`,
          });
        }
      }
    }
    // copy drift 후보 — 최소 구현: 화면당 요약 1건(info). false positive 가 많을 수 있어 review 대상.
    // TODO(visual-contract-bootstrap follow-up): string prop / i18n 화이트리스트 정밀화는
    // PR144 findHardcodedCopyCandidates TODO 와 함께 dogfood telemetry 이후 별도 슬라이스로.
    for (const s of members) {
      if (s.copyKeys.length === 0) continue;
      const src = sources.get(s.screen_id);
      if (!src) continue;
      const candidates = findHardcodedCopyCandidates(src.source);
      if (candidates.length === 0) continue;
      familyFindings.push({
        severity: 'info',
        rule: 'hardcoded-copy-candidate',
        screen_id: s.screen_id,
        file: src.entryRel,
        message: `hardcoded user-visible copy 후보 ${candidates.length}건 (예: "${candidates[0]}") — ScreenSpec Copy Keys(i18n) 경유 여부를 확인하세요 (info, 오탐 가능).`,
      });
    }

    // --- figma mapping coverage (pixel fidelity 아님 — 존재/status 집계만) -------
    const present = [];
    const missing = [];
    const mappingStatus = {};
    for (const id of memberIds) {
      const m = mappings.get(id);
      mappingStatus[id] = m ? m.status : null;
      (m ? present : missing).push(id);
    }

    // --- 기존 contract 와의 관계 -----------------------------------------------
    const matchesExisting =
      existingFamilyNames.has(domainName.toLowerCase()) ||
      memberIds.some((id) => existingMemberIds.has(id));
    const membersInContract = memberIds.filter((id) => existingMemberIds.has(id));
    const membersNotInContract = memberIds.filter((id) => !existingMemberIds.has(id));

    const suggestedContract = {
      layout_shell_owner: shellOwner || 'needs-human-review',
      logo_policy: logoPolicy,
      header_policy: headerPolicy,
      cta_policy: ctaPolicy,
      copy_source: copySource,
      status: 'draft',
    };

    if (membersNotInContract.length > 0) {
      suggestedFamilies.push({
        family: domainName,
        member_screens: membersNotInContract,
        addition_to_existing_family: matchesExisting,
        ...suggestedContract,
      });
    }

    sortFindings(familyFindings);
    familyReports.push({
      family: domainName,
      confidence: confidenceOf(evidence.length),
      member_screens: memberIds,
      members_in_existing_contract: membersInContract,
      members_not_in_contract: membersNotInContract,
      evidence,
      suggested_contract: suggestedContract,
      figma_mapping_coverage: { present, missing, status: mappingStatus },
      findings: familyFindings,
    });

    // --- shared component 후보 집계 (family 경계를 넘어 merge) --------------------
    for (const [name, entry] of importCounts.entries()) {
      const importedByShell =
        entry.kind !== 'shell' && shellBindings.some((b) => b.name === name);
      // 포함 기준: 반복(≥2) import, 또는 shell 이 렌더하는 logo/header (shared by construction).
      // kind:unknown 은 오탐 가능성이 커 반복(≥2) import 만 인정한다 (shell 경유 shortcut 없음).
      if (entry.kind === 'unknown' && entry.screens.size < 2) continue;
      if (entry.screens.size < 2 && !importedByShell) continue;
      if (!sharedByName.has(name)) {
        sharedByName.set(name, {
          component: name,
          kind: entry.kind,
          imported_by: new Set(),
          imported_by_shell: false,
          families: new Set(),
        });
      }
      const agg = sharedByName.get(name);
      for (const id of entry.screens) agg.imported_by.add(id);
      if (importedByShell) agg.imported_by_shell = true;
      agg.families.add(domainName);
    }
    // shell 이 직접 렌더하는 logo/header 는 screen import 0 이어도 shared 후보다.
    for (const b of shellBindings) {
      const kind = classifyComponentKind(b.name);
      if (kind !== 'logo' && kind !== 'header') continue;
      if (!sharedByName.has(b.name)) {
        sharedByName.set(b.name, {
          component: b.name,
          kind,
          imported_by: new Set(),
          imported_by_shell: true,
          families: new Set(),
        });
      }
      const agg = sharedByName.get(b.name);
      agg.imported_by_shell = true;
      agg.families.add(domainName);
    }
  }

  // --- shared components 정리 + component gap 후보 -------------------------------
  const sharedComponents = [...sharedByName.values()]
    .map((c) => ({
      component: c.component,
      kind: c.kind,
      imported_by: [...c.imported_by].sort(compareText),
      imported_by_shell: c.imported_by_shell,
      catalog_status: catalogNames ? (catalogNames.has(c.component) ? 'cataloged' : 'missing') : 'unknown',
      families: [...c.families].sort(compareText),
      in_existing_contract: existingComponentNames.has(c.component),
    }))
    .sort((a, b) => compareText(a.component, b.component));

  const componentGapCandidates = sharedComponents
    .filter((c) => c.catalog_status === 'missing')
    .map((c) => ({
      component: c.component,
      // unknown 은 이름 휴리스틱조차 못 잡은 후보 — reason 에 오탐 가능성을 드러낸다.
      reason:
        c.kind === 'unknown'
          ? 'Repeated local import but kind unknown — absent from component catalog (needs-human-review)'
          : `Repeated ${c.kind}-like import but absent from component catalog`,
      affected_families: c.families,
    }));

  // suggested component rows: 기존 contract 에 없는 shared 후보만. shell 자체는 family 행의
  // Layout/Shell Owner 로 제안되므로 component rule 행에서는 제외한다.
  const suggestedComponents = sharedComponents
    .filter((c) => !c.in_existing_contract && c.kind !== 'shell')
    .map((c) => ({
      component: c.component,
      // kind:unknown 은 ownership 을 추론하지 않는다 — 항상 needs-review 로 남긴다 (#153 ②).
      owned_by:
        c.kind !== 'unknown' && c.imported_by_shell
          ? familyShellOwnerFor(familyReports, c.families)
          : 'needs-review',
      applies_to_families: c.families,
      direct_screen_import: 'needs-review',
      positioning_owner: 'needs-review',
      catalog_status: c.catalog_status,
      notes:
        `imported by ${c.imported_by.length} screen(s)` +
        (c.imported_by_shell ? ' + shell candidate' : ''),
    }));

  return finalize(
    base,
    findings,
    familyReports,
    sharedComponents,
    componentGapCandidates,
    { families: suggestedFamilies, components: suggestedComponents },
    skippedChecks,
  );
}

// 가장 관련있는 family 의 shell owner 후보 (families 정렬 첫 번째의 suggested owner).
function familyShellOwnerFor(familyReports, familyNames) {
  for (const name of familyNames) {
    const f = familyReports.find((r) => r.family === name);
    if (f && f.suggested_contract.layout_shell_owner !== 'needs-human-review') {
      return f.suggested_contract.layout_shell_owner;
    }
  }
  return 'needs-review';
}

function finalize(base, findings, familyReports, sharedComponents, gapCandidates, suggested, skippedChecks) {
  sortFindings(findings);
  skippedChecks.sort((a, b) => compareText(a.rule, b.rule));
  const allFindings = [...findings, ...familyReports.flatMap((f) => f.findings)];
  const errors = allFindings.filter((f) => f.severity === 'error').length;
  const warnings = allFindings.filter((f) => f.severity === 'warning').length;
  const infos = allFindings.filter((f) => f.severity === 'info').length;
  const screenCount = new Set(familyReports.flatMap((f) => f.member_screens)).size;
  return {
    ...base,
    summary: {
      screens: screenCount,
      candidate_families: familyReports.length,
      suggested_contract_rows: suggested.families.length + suggested.components.length,
      component_gap_candidates: gapCandidates.length,
      errors,
      warnings,
      infos,
    },
    families: familyReports,
    shared_components: sharedComponents,
    component_gap_candidates: gapCandidates,
    suggested_rows: suggested,
    findings,
    skipped_checks: skippedChecks,
    ok: errors === 0,
  };
}

// --- Markdown draft 렌더 -------------------------------------------------------
// review-only draft 문서를 렌더한다 (결정적 — report 필드만 사용, 타임스탬프 없음).
// canonical 경로에 scaffold 될 수 있으므로 (파일 부재 시에만, CLI 가드) frontmatter 는
// status: draft 를 강제하고 review-only 주석을 앞에 둔다. "Suggested Contract Rows" 의
// 표만 canonical 계약 헤더(Family|Member Screens ... / Component|Direct Screen Import ...)를
// 쓴다 — 나머지 report 표는 그 헤더 시그니처를 피해서 visual-consistency 파서와 충돌하지 않는다.
export function renderBootstrapMarkdown(report) {
  const L = [];
  L.push('---');
  L.push('artifact_id: "visual-consistency-contract"');
  L.push('artifact_type: visual-consistency-contract');
  L.push('status: draft');
  L.push('---');
  L.push('');
  L.push('<!--');
  L.push('  REVIEW-ONLY DRAFT — workflow:visual-contract-bootstrap 이 생성한 후보 제안이다.');
  L.push('  이 문서는 confirmed canonical contract 가 아니다. 사람이 후보를 리뷰해 accepted rows 만');
  L.push('  canonical design/visual-consistency-contract.md 에 반영한다 (confirmed 승격은 사람만).');
  L.push('  behavior 는 ScreenSpec / Navigation Map / Open Decision 경로만 탄다.');
  L.push('  계약 정본: docs/reference/visual-reconciliation.md §Bootstrap / adoption.');
  L.push('-->');
  L.push('');
  L.push('# Visual Consistency Contract — Bootstrap Draft (review-only)');
  L.push('');

  L.push('## Summary');
  L.push('');
  L.push(`- docs: ${report.docs}`);
  L.push(`- src: ${report.src || '(미지정 — 소스 휴리스틱 skip)'}`);
  L.push(
    `- existing contract: ${report.existing_contract.found ? report.existing_contract.path + ' (overwrite 금지 — suggested additions 만)' : '없음 (cold start)'}`,
  );
  L.push(`- screens: ${report.summary.screens}`);
  L.push(`- candidate families: ${report.summary.candidate_families}`);
  L.push(`- suggested contract rows: ${report.summary.suggested_contract_rows}`);
  L.push(`- component gap candidates: ${report.summary.component_gap_candidates}`);
  L.push(
    `- findings: ${report.summary.errors} error(s) · ${report.summary.warnings} warning(s) · ${report.summary.infos} info(s)`,
  );
  L.push('');

  L.push('## Candidate Screen Families');
  L.push('');
  if (report.families.length === 0) {
    L.push('(후보 없음 — ScreenSpec 미발견이거나 필터 결과 0건)');
  } else {
    L.push('| Family | Confidence | Members | In Existing Contract | Evidence |');
    L.push('|---|---|---|---|---|');
    for (const f of report.families) {
      L.push(
        `| ${f.family} | ${f.confidence} | ${f.member_screens.join(', ')} | ${
          f.members_in_existing_contract.length
            ? f.members_in_existing_contract.join(', ')
            : '-'
        } | ${f.evidence.join(' · ')} |`,
      );
    }
  }
  L.push('');

  L.push('## Suggested Shared Component Rules (candidates)');
  L.push('');
  if (report.shared_components.length === 0) {
    L.push('(후보 없음 — 소스 휴리스틱 미실행이거나 반복 import 미발견)');
  } else {
    L.push('| Component | Kind | Imported By | Shell Renders | Catalog | In Existing Contract |');
    L.push('|---|---|---|---|---|---|');
    for (const c of report.shared_components) {
      L.push(
        `| ${c.component} | ${c.kind} | ${c.imported_by.length ? c.imported_by.join(', ') : '-'} | ${
          c.imported_by_shell ? 'yes' : '-'
        } | ${c.catalog_status} | ${c.in_existing_contract ? 'yes' : '-'} |`,
      );
    }
  }
  L.push('');

  L.push('## Figma Mapping Coverage');
  L.push('');
  if (report.families.length === 0) {
    L.push('(대상 없음)');
  } else {
    L.push('| Family | Mapping Present | Mapping Missing |');
    L.push('|---|---|---|');
    for (const f of report.families) {
      L.push(
        `| ${f.family} | ${f.figma_mapping_coverage.present.join(', ') || '-'} | ${
          f.figma_mapping_coverage.missing.join(', ') || '-'
        } |`,
      );
    }
    L.push('');
    L.push('coverage 는 figma-component-mapping 존재/status 집계일 뿐 pixel fidelity 가 아니다.');
  }
  L.push('');

  L.push('## Component Gap Candidates');
  L.push('');
  if (report.component_gap_candidates.length === 0) {
    L.push('(없음)');
  } else {
    L.push('| Candidate | Reason | Affected Families |');
    L.push('|---|---|---|');
    for (const g of report.component_gap_candidates) {
      L.push(`| ${g.component} | ${g.reason} | ${g.affected_families.join(', ')} |`);
    }
    L.push('');
    L.push('gap 후보는 component-gap-register 에 G-xxx 로 **제안만** 한다 — accept/구현은 사람.');
  }
  L.push('');

  L.push('## Visual Consistency Findings (observations)');
  L.push('');
  const allFindings = [...report.findings, ...report.families.flatMap((f) => f.findings)];
  if (allFindings.length === 0) {
    L.push('(없음)');
  } else {
    for (const f of allFindings) {
      const where = [f.screen_id, f.component, f.file].filter(Boolean).join(' · ');
      L.push(`- [${f.severity}] ${f.rule}${where ? ` (${where})` : ''}: ${f.message}`);
    }
  }
  L.push('');

  L.push('## Suggested Contract Rows');
  L.push('');
  L.push('아래 표만 canonical contract 표 헤더를 쓴다. **accepted rows 만** 사람이 canonical');
  L.push('`design/visual-consistency-contract.md` 로 옮긴다 (needs-review 값은 사람이 확정).');
  L.push('');
  L.push('### Screen Families');
  L.push('');
  // suggested rows 가 없으면 데이터 row 를 아예 쓰지 않는다 — placeholder row('-')를 넣으면
  // parseVisualContract 가 그것을 실제 family/component row 로 읽는다 (checker 오염 방지).
  // 헤더만 남겨도 hasFamilyTable=true 라 canonical 경로 scaffold 의 checker 호환은 유지된다.
  L.push('| Family | Member Screens | Layout/Shell Owner | Logo Policy | Header Policy | CTA Policy | Copy Source | Status | Evidence |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const f of report.suggested_rows.families) {
    L.push(
      `| ${f.family} | ${f.member_screens.join(', ')} | ${f.layout_shell_owner} | ${f.logo_policy} | ${f.header_policy} | ${f.cta_policy} | ${f.copy_source} | draft | bootstrap-draft${
        f.addition_to_existing_family ? ' (additions to existing family)' : ''
      } |`,
    );
  }
  L.push('');
  if (report.suggested_rows.families.length === 0) {
    L.push('(suggested family additions 없음)');
    L.push('');
  }
  L.push('### Shared Component Rules');
  L.push('');
  L.push('| Component | Owned By | Applies To Families | Direct Screen Import | Positioning Owner | Catalog Status | Notes |');
  L.push('|---|---|---|---|---|---|---|');
  for (const c of report.suggested_rows.components) {
    L.push(
      `| ${c.component} | ${c.owned_by} | ${c.applies_to_families.join(', ')} | ${c.direct_screen_import} | ${c.positioning_owner} | ${c.catalog_status} | ${c.notes} |`,
    );
  }
  L.push('');
  if (report.suggested_rows.components.length === 0) {
    L.push('(suggested component additions 없음)');
    L.push('');
  }

  L.push('## How to Apply Manually');
  L.push('');
  L.push('1. 위 후보(family/owner/policy/gap)를 사람이 리뷰한다 — needs-review/needs-human-review 값을 확정한다.');
  L.push('2. 필요하면 Open Decision(behavior/ownership 결정) · Component Gap(G-xxx 제안)을 먼저 만든다.');
  L.push('3. accepted rows 만 canonical `design/visual-consistency-contract.md` 에 수동 반영한다');
  L.push('   (없으면 템플릿 `templates/design/visual-consistency-contract.template.md` 에서 시작).');
  L.push('4. `npm run workflow:visual-consistency -- --docs <docs> --src <src> --json` 으로 대조한다 (warning-first).');
  L.push('5. 구현/정리는 `visual-reconcile` / `implement-screen` 스킬 경로로 넘긴다.');
  L.push('');

  L.push('## Boundaries');
  L.push('');
  L.push('- 이 draft 는 confirmed canonical contract 가 아니다 — 반영/승격은 사람만.');
  L.push('- 반복 import 는 design intent 의 proof 가 아니라 후보 증거다.');
  L.push('- Open Decision resolve · Unknown close · Component Gap accept 금지 (사람 전용).');
  L.push('- behavior 는 ScreenSpec / Navigation Map / Open Decision 경로만 탄다.');
  L.push('- gate/approval/readiness/confirmed promotion 아님 · CI required check 배선 금지.');
  L.push('');
  return L.join('\n');
}

// --- 사람-읽기 출력 ------------------------------------------------------------
export function formatBootstrapHuman(report) {
  const lines = [];
  const s = report.summary;
  lines.push(
    `visual-contract-bootstrap — review-only: ${s.screens} screen(s), ${s.candidate_families} candidate family(ies), ` +
      `${s.suggested_contract_rows} suggested row(s), ${s.component_gap_candidates} component gap candidate(s)` +
      (s.errors ? `, ${s.errors} error(s)` : '') +
      (s.warnings ? `, ${s.warnings} warning(s)` : ''),
  );
  const allFindings = [...report.findings, ...report.families.flatMap((f) => f.findings)];
  for (const f of allFindings) {
    const where = [f.screen_id, f.component, f.file].filter(Boolean).join(' · ');
    lines.push(`  [${f.severity}] ${f.rule}${where ? ` (${where})` : ''}: ${f.message}`);
  }
  for (const f of report.families) {
    lines.push(
      `  family ${f.family} (${f.confidence}): ${f.member_screens.join(', ')} — shell owner 후보 ${f.suggested_contract.layout_shell_owner}`,
    );
  }
  for (const sk of report.skipped_checks) {
    lines.push(`  [skip] ${sk.rule}: ${sk.reason}`);
  }
  return lines;
}
