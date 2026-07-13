// catalog-gen.mjs (lib) — component-catalog 모델 빌더 + 렌더러 (읽기 전용 스캔, 쓰기는 CLI 가).
// 정본(source of truth)은 src/components/ui/** 파일 트리다 (catalog/artifact-manifest.yaml:183-184).
//
// v1 식별 규칙 (source-contract §2 확장): 경로(components/ui/**) ∩ 파일 basename 이 PascalCase 또는
// lowercase/kebab-case ∩ 파일명에서 유도한 PascalCase 동명 named export(plain `export function`/`export const`).
// 다음은 의도적으로 제외한다:
//   - default export (라우트/스크린 관용) — §2
//   - memo/forwardRef 래퍼 (display-name 비결정성, §7.4(d)/OD-5)
//   - co-located *.styles / *.test / *.stories / *.d (basename 에 '.' 잔존) — §2
//   - 파일명에서 PascalCase 컴포넌트명을 안정적으로 유도할 수 없는 basename (index, queryKeys 등)
//   - components/ui/ 밖 파일 (features/<domain>/components·screens 등) — §1 스코프
//
// root 배럴 direct named re-export 는 파일 트리 안의 exact export 를 검증하는 보조 evidence 로만 사용한다.
// props/docgen/NativeWind/style 분석은 후속 phase (이 skeleton 의 비목표, §3).
// 결정성 계약 (§7.4): 무타임스탬프 · plain 코드유닛 정렬 · posix 상대경로 · prettier 미사용.
//
// 참고: kit-dev/temp/proposals/component-catalog-generation-source-contract.md
import path from 'node:path';
import { walkFiles, readFileSafe, projectRootOf } from './util.mjs';
import { globRoot, globToRegExp } from './glob.mjs';

const SCAN_EXTS = ['.tsx', '.ts'];
// 하위호환 fallback: layout 미주입 단위 테스트/구형 호출은 기존 정본 글롭 `src/components/ui/**` 로 판정한다.
// CLI/check-generated 경로는 resolvedLayout.roles.ui_primitive 에서 source root 를 주입한다.
const UI_MARKER = '/src/components/ui/';
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;
const KEBAB_FILENAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// 임의 경로를 posix 슬래시로 정규화한다 (Windows 백슬래시 → '/'). 출력 경로 결정성용 (§7.4(f)).
function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function globToDir(glob) {
  let g = toPosix(String(glob || '')).replace(/\/+$/, '');
  if (g.endsWith('/**')) g = g.slice(0, -3);
  else {
    const wildcard = g.search(/[*?\[\]{}]/);
    if (wildcard !== -1) g = g.slice(0, wildcard).replace(/\/+$/, '');
  }
  return g;
}

function pathFromProjectRoot(projectRoot, rel) {
  return rel ? path.resolve(projectRoot, ...rel.split('/')) : projectRoot;
}

function uniquePaths(paths) {
  return [...new Set(paths.map((p) => path.resolve(p)))].sort();
}

function splitRelPath(p) {
  const s = toPosix(p || '').replace(/\/+$/, '');
  return s && s !== '.' ? s.split('/').filter(Boolean) : [];
}

function commonPrefixPath(paths) {
  if (paths.length === 0) return '';
  let prefix = splitRelPath(paths[0]);
  for (const p of paths.slice(1)) {
    const parts = splitRelPath(p);
    let i = 0;
    while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix.join('/');
}

function componentNameFromFileBase(base) {
  if (PASCAL_RE.test(base)) return base;
  if (base === 'index') return null;
  if (!KEBAB_FILENAME_RE.test(base)) return null;
  return base
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function catalogCommandSrcForGlobs(globs, { fallback = '.' } = {}) {
  if (!Array.isArray(globs)) return 'src/components/ui';
  const roots = globs.map((g) => globRoot(g).replace(/\/+$/, '')).filter((g) => g !== '');
  if (roots.length === 0) return fallback;
  return commonPrefixPath(roots) || fallback;
}

export function catalogCommandSrc(model = {}, opts = {}) {
  if (Array.isArray(model.source_globs)) return catalogCommandSrcForGlobs(model.source_globs, opts);
  return Array.isArray(model.source_dirs) ? model.source_dirs[0] || 'src/components/ui' : 'src/components/ui';
}

export function catalogSourceConfig({ src, layout, projectRoot } = {}) {
  const srcAbs = path.resolve(src || '.');
  const roleGlobs =
    layout && typeof layout.roleGlobs === 'function'
      ? layout.roleGlobs('ui_primitive')
      : [];
  const hasExplicitRole = Boolean(
    layout?.roles && Object.prototype.hasOwnProperty.call(layout.roles, 'ui_primitive'),
  );
  const useLayoutRole = hasExplicitRole || roleGlobs.length > 0;
  const sourceGlobs = useLayoutRole ? roleGlobs : ['src/components/ui/**'];
  const sourceDirs = sourceGlobs.map(globToDir).filter(Boolean);
  const sourceMatchers = sourceGlobs.map((g) => globToRegExp(g));
  const barrelMatchers = sourceDirs.flatMap((d) => [
    globToRegExp(`${d}/index.ts`),
    globToRegExp(`${d}/index.tsx`),
  ]);

  let rootAbs = projectRoot ? path.resolve(projectRoot) : null;
  if (!rootAbs) {
    const srcPosix = toPosix(srcAbs);
    for (const d of [...sourceDirs].sort((a, b) => b.length - a.length)) {
      const suffix = `/${d}`;
      if (srcPosix.endsWith(suffix) || srcPosix === d) {
        rootAbs = srcAbs.slice(0, Math.max(0, srcAbs.length - d.length)).replace(/[\\/]+$/, '');
        break;
      }
    }
  }
  if (!rootAbs) rootAbs = projectRootOf(srcAbs);

  const sourceRoots = uniquePaths(sourceGlobs.map((g) => pathFromProjectRoot(rootAbs, globRoot(g))));
  const scanRoots = useLayoutRole
    ? sourceRoots
    : sourceDirs
        .map((d) => path.resolve(rootAbs, ...d.split('/')))
        .filter((root) => isWithin(srcAbs, root) || isWithin(root, srcAbs));
  return {
    projectRoot: rootAbs,
    sourceGlobs,
    sourceDirs,
    sourceRoots,
    sourceMatchers,
    barrelMatchers,
    scanRoots: useLayoutRole ? scanRoots : scanRoots.length ? scanRoots : [srcAbs],
  };
}

function sourcePathFor(absFile, opts = {}) {
  const projectRoot = opts.projectRoot ? path.resolve(opts.projectRoot) : null;
  const abs = path.resolve(absFile);
  if (projectRoot) {
    const rel = toPosix(path.relative(projectRoot, abs));
    if (rel && !rel.startsWith('../') && !path.isAbsolute(rel)) {
      const matchers = opts.sourceMatchers || [];
      if (matchers.length > 0) return matchers.some((matcher) => matcher.test(rel)) ? rel : null;
    }
  }
  const roots = (opts.sourceRoots || []).map((r) => path.resolve(r));
  for (const root of roots) {
    if (isWithin(root, abs)) return projectRoot ? toPosix(path.relative(projectRoot, abs)) : toPosix(abs);
  }
  return null;
}

function classifyUiFilePath(absFile, opts = {}) {
  const configuredSourcePath = sourcePathFor(absFile, opts);
  if (configuredSourcePath) {
    const ext = path.extname(absFile);
    if (!SCAN_EXTS.includes(ext)) return null;
    const base = path.basename(absFile, ext);
    if (base.includes('.')) return null;
    const componentName = componentNameFromFileBase(base);
    if (!componentName) return null;
    return { base: componentName, file_base: base, source_path: configuredSourcePath };
  }

  const posixAbs = toPosix(absFile);
  const idx = posixAbs.lastIndexOf(UI_MARKER); // 중첩 시 가장 안쪽(프로젝트-로컬) 정본 루트 채택
  if (idx === -1) return null; // 정본 src/components/ui/ 밖 → 제외 (§1 스코프)

  const ext = path.extname(absFile);
  if (!SCAN_EXTS.includes(ext)) return null;
  const base = path.basename(absFile, ext);

  // co-located *.styles.ts / *.test.tsx / *.stories.tsx / *.d.ts → basename 에 '.' 잔존 → 제외 (§2).
  if (base.includes('.')) return null;
  const componentName = componentNameFromFileBase(base);
  if (!componentName) return null;

  return {
    base: componentName,
    file_base: base,
    source_path: posixAbs.slice(idx + 1), // 'src/components/ui/Button.tsx' | '.../forms/Field.tsx'
  };
}

// `export const <base>` 의 초기화식(RHS)이 memo/forwardRef 호출인지 판정한다 — 그러면 래퍼라 v1 에서 제외.
// 타입 주석에 `=`(제네릭 기본값 `<T = U>`)·`;`(타입 리터럴 `{a; b}`)·`<…>`/`{…}`/`(…)` 가 들어와도
// 괄호류 깊이를 세어 "최상위(depth 0) 할당 `=`" 만 잡는다. arrow `=>`·비교 `== >= <= !=` 는 할당이 아니다.
// 다중 줄 선언 헤드/RHS 와 `= /* @__PURE__ */ memo(…)` 의 선두 PURE 주석도 흡수한다.
// 잔여 한계(드묾, OD-5): 문자열 리터럴 안의 비균형 괄호, `= (React.memo)(…)` 처럼 괄호로 감싼 표기.
function wrappedConstReason(src, base) {
  const m = new RegExp(`(?:^|\\n)\\s*export\\s+const\\s+${base}\\b`).exec(src);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length; i < src.length; i++) {
    const ch = src[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) depth--;
    } else if (depth === 0) {
      if (ch === ';') return null; // 초기화식 없이 선언/타입이 끝남
      // 최상위 할당 `=` (arrow `=>`·비교 `==`/`>=`/`<=`/`!=` 는 제외)
      if (
        ch === '=' &&
        src[i + 1] !== '>' &&
        src[i + 1] !== '=' &&
        src[i - 1] !== '<' &&
        src[i - 1] !== '>' &&
        src[i - 1] !== '!' &&
        src[i - 1] !== '='
      ) {
        const rhs = src.slice(i + 1).replace(/^\s*(?:\/\*[^]*?\*\/\s*)?/, '');
        const wrapper = /^(?:React\.)?(memo|forwardRef)\b/.exec(rhs);
        if (!wrapper) return null;
        return wrapper[1] === 'memo' ? 'wrapped_memo' : 'wrapped_forward_ref';
      }
    }
  }
  return null;
}

function isWrappedConst(src, base) {
  return wrappedConstReason(src, base) !== null;
}

// 한 후보 파일이 v1 카탈로그 컴포넌트인지 판정한다.
//   반환: { name, source_path, export_kind, status } | null (비-컴포넌트)
// content 는 파일 본문(없으면 빈 문자열로 취급). IO 는 호출부가 한다(이 함수는 순수).
export function classifyComponentFile(absFile, content, opts = {}) {
  const file = classifyUiFilePath(absFile, opts);
  if (!file) return null;

  // base 는 PascalCase 컴포넌트명이라 정규식 메타문자가 없다 → 그대로 보간 안전.
  const base = file.base;
  const src = content || '';
  // memo/forwardRef 래퍼 → 제외 (v1 plain 선언만, §7.4(d)/OD-5). 타입 주석 안의 `=`/`;` 에 속지 않도록
  // 괄호류 깊이를 세어 최상위 할당 `=` 의 RHS 가 래퍼 호출인지 검사한다(isWrappedConst 위 정의 참조).
  if (isWrappedConst(src, base)) return null;

  // 동명 named export(plain 함수 또는 const). `export default function <base>` 는 'export' 와
  // 'function' 사이의 'default' 때문에 매칭되지 않아 자연히 제외된다 (§2).
  // NOTE(v1 heuristic): 정규식 기반(AST 미사용, §3)이라 column-0 블록주석 `/* … export function <base> … */`
  // 안의 주석처리된 export 는 false-include 될 수 있다. 현재 실트리엔 0건이며, line/JSDoc 주석(`//`·` *`)은
  // `^\s*export` 앵커로 자연 배제된다. 견고한 파싱(주석 strip/AST)은 후속 phase 로 미룬다.
  const fnRe = new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${base}\\b`, 'm');
  const constRe = new RegExp(`^\\s*export\\s+const\\s+${base}\\b`, 'm');
  if (!fnRe.test(src) && !constRe.test(src)) return null;

  // v1 4필드만. export_kind 는 현재 항상 'named'(default 미수집), status 는 추출상태 'ok' (OD-2).
  return { name: base, source_path: file.source_path, export_kind: 'named', status: 'ok' };
}

// 배럴 direct named re-export가 가리킨 실제 파일에서 export 이름을 기준으로 선언을 검증한다.
// basename 은 evidence 로 쓰지 않으며, configured ui_primitive scope 안의 .ts/.tsx 만 인정한다.
// 반환 status 가 ok 면 primary 승격 가능, candidate 면 reason 이 wrapper 종류를 고정한다.
export function classifyNamedExport(absFile, content, name, opts = {}) {
  if (!PASCAL_RE.test(name)) return null;
  const ext = path.extname(absFile);
  if (!SCAN_EXTS.includes(ext)) return null;

  let sourcePath = sourcePathFor(absFile, opts);
  if (!sourcePath) {
    const posixAbs = toPosix(absFile);
    const idx = posixAbs.lastIndexOf(UI_MARKER);
    if (idx === -1) return null;
    sourcePath = posixAbs.slice(idx + 1);
  }

  const src = stripBlockComments(content || '');
  const fnRe = new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${name}\\b`, 'm');
  const constRe = new RegExp(`^\\s*export\\s+const\\s+${name}\\b`, 'm');
  if (!fnRe.test(src) && !constRe.test(src)) return null;

  const reason = wrappedConstReason(src, name);
  if (reason) {
    return {
      name,
      source_path: sourcePath,
      export_kind: 'named',
      status: 'candidate',
      reason,
    };
  }
  return { name, source_path: sourcePath, export_kind: 'named', status: 'ok' };
}

// phase2 PR-3: default function export 는 정식 components 로 승격하지 않고 candidate 로만 surface 한다.
// 이름은 default function 명보다 PascalCase 파일 basename 을 우선한다(Modal.tsx → Modal).
export function classifyDefaultExportCandidate(absFile, content, opts = {}) {
  const file = classifyUiFilePath(absFile, opts);
  if (!file) return null;

  const src = stripBlockComments(content || '');
  // named export 판정처럼 `function` 선언 자체를 신호로 본다. `export default function Select<T>(...)`
  // 처럼 함수명 뒤에 TS type parameter 가 오면 `(` 가 바로 뒤따르지 않으므로, `function\b`까지만 고정한다.
  const defaultFunctionRe = /^\s*export\s+default\s+(?:async\s+)?function\b/m;
  if (!defaultFunctionRe.test(src)) return null;

  return {
    name: file.base,
    source_path: file.source_path,
    export_kind: 'default',
    status: 'candidate',
  };
}

// 정렬: (source_path, name) 튜플 비교 — plain 코드유닛 순서(route-tree 의 plain .sort() 관례, §7.4(b)).
// 매직 구분자 없이 필드별로 비교해 결정적 total order 를 만든다. source_path 는 파일당 유일하므로
// 실제 동률은 없지만, 안정 정렬(Array.prototype.sort)로 어떤 입력 순서에도 출력이 결정적이다.
function compareComponents(a, b) {
  if (a.source_path !== b.source_path) return a.source_path < b.source_path ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

function scanCatalogSourceFiles(sourceConfig) {
  const fileSet = new Set();
  for (const root of sourceConfig.scanRoots) {
    for (const f of walkFiles(root, SCAN_EXTS)) fileSet.add(path.resolve(f));
  }
  const files = [];
  for (const abs of [...fileSet].sort()) {
    const sourcePath = sourcePathFor(abs, sourceConfig);
    if (!sourcePath) continue;
    files.push({ abs, source_path: sourcePath, content: readFileSafe(abs) || '' });
  }
  return files;
}

function findRootBarrels(sourceFiles, sourceConfig) {
  return sourceFiles
    .filter((f) => {
      const base = path.basename(f.abs);
      return (
        (base === 'index.ts' || base === 'index.tsx') &&
        sourceConfig.barrelMatchers.some((matcher) => matcher.test(f.source_path))
      );
    })
    .map((f) => ({ ...f, rel: f.source_path }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

function collectBarrelEvidence(barrels) {
  const names = new Set();
  const entries = [];
  let unsupported = 0;
  for (const barrel of barrels) {
    const parsed = parseBarrelReexports(barrel.content);
    for (const name of parsed.names) names.add(name);
    for (const entry of parsed.entries) {
      entries.push({ ...entry, barrel_path: barrel.rel, barrel_abs: barrel.abs });
    }
    unsupported += parsed.unsupported;
  }
  return { names: [...names].sort(), entries, unsupported };
}

function resolveBarrelEntry(entry, filesByAbs) {
  const base = path.resolve(path.dirname(entry.barrel_abs), entry.module_specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ];
  const matches = [...new Set(candidates.map((p) => path.resolve(p)))]
    .map((p) => filesByAbs.get(p))
    .filter(Boolean);
  if (matches.length === 0) return { reason: 'unresolved_module' };
  if (matches.length > 1) return { reason: 'ambiguous_module' };
  return { file: matches[0] };
}

function compareBarrelIssues(a, b) {
  for (const field of ['barrel_path', 'module_specifier', 'name', 'reason']) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
  }
  return 0;
}

function deriveBarrelReexports({ evidence, sourceFiles, sourceConfig, components }) {
  const filesByAbs = new Map(sourceFiles.map((f) => [path.resolve(f.abs), f]));
  const resolvedByKey = new Map();
  const resolutionIssues = [];
  const addIssue = (entry, reason) => {
    resolutionIssues.push({
      name: entry.name,
      module_specifier: entry.module_specifier,
      barrel_path: entry.barrel_path,
      reason,
    });
  };

  for (const entry of evidence.entries) {
    const resolution = resolveBarrelEntry(entry, filesByAbs);
    if (!resolution.file) {
      addIssue(entry, resolution.reason);
      continue;
    }
    const classified = classifyNamedExport(
      resolution.file.abs,
      resolution.file.content,
      entry.name,
      sourceConfig,
    );
    if (!classified) {
      addIssue(entry, 'unverified_named_export');
      continue;
    }
    const key = `${classified.name}\u0000${classified.source_path}`;
    if (!resolvedByKey.has(key)) resolvedByKey.set(key, { entry, classified });
  }

  const resolved = [...resolvedByKey.values()];
  const namesToSources = new Map();
  const sourcesToNames = new Map();
  const addToSet = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  for (const { classified } of resolved) {
    addToSet(namesToSources, classified.name, classified.source_path);
    addToSet(sourcesToNames, classified.source_path, classified.name);
  }
  for (const component of components) {
    addToSet(namesToSources, component.name, component.source_path);
    addToSet(sourcesToNames, component.source_path, component.name);
  }

  const existing = new Set(components.map((c) => `${c.name}\u0000${c.source_path}`));
  const componentAdditions = [];
  const candidates = [];
  for (const { entry, classified } of resolved) {
    const key = `${classified.name}\u0000${classified.source_path}`;
    if (existing.has(key)) continue;
    if ((namesToSources.get(classified.name)?.size || 0) > 1) {
      addIssue(entry, 'ambiguous_name');
      continue;
    }
    if (classified.status === 'candidate') {
      candidates.push(classified);
      continue;
    }
    if ((sourcesToNames.get(classified.source_path)?.size || 0) > 1) {
      addIssue(entry, 'ambiguous_source');
      continue;
    }
    componentAdditions.push(classified);
    existing.add(key);
  }

  const uniqueCandidates = new Map();
  for (const candidate of candidates) {
    uniqueCandidates.set(`${candidate.name}\u0000${candidate.source_path}`, candidate);
  }
  const uniqueIssues = new Map();
  for (const issue of resolutionIssues) {
    uniqueIssues.set(
      `${issue.barrel_path}\u0000${issue.module_specifier}\u0000${issue.name}\u0000${issue.reason}`,
      issue,
    );
  }
  return {
    componentAdditions,
    candidates: [...uniqueCandidates.values()].sort(compareComponents),
    resolutionIssues: [...uniqueIssues.values()].sort(compareBarrelIssues),
  };
}

function reconcileBarrelEvidence({ barrels, evidence, components, candidates = [], resolutionIssues = [] }) {
  if (barrels.length === 0) {
    return {
      barrelFound: false,
      barrelPaths: [],
      reexported: [],
      missingFromCatalog: [],
      missingFromBarrel: [],
      surfacedCandidates: [],
      resolutionIssues: [],
      unsupported: 0,
    };
  }
  const catalog = new Set((components || []).map((c) => c.name));
  const reexported = new Set(evidence.names);
  const candidateNames = new Set(candidates.map((c) => c.name));
  const missingFromCatalog = [...reexported].filter((name) => !catalog.has(name)).sort();
  return {
    barrelFound: true,
    barrelPaths: barrels.map((barrel) => barrel.rel).sort(),
    reexported: [...reexported].sort(),
    missingFromCatalog,
    missingFromBarrel: [...catalog].filter((name) => !reexported.has(name)).sort(),
    surfacedCandidates: missingFromCatalog.filter((name) => candidateNames.has(name)),
    resolutionIssues: [...resolutionIssues].sort(compareBarrelIssues),
    unsupported: evidence.unsupported,
  };
}

// 순수 빌더: src 디렉토리를 스캔해 { components } 모델을 만든다. 직렬화/쓰기는 CLI 가 한다.
//   components: [{ name, source_path, export_kind, status }] — (source_path, name) 안정 정렬.
export function buildCatalog({ src, layout, projectRoot } = {}) {
  const sourceConfig = catalogSourceConfig({ src, layout, projectRoot });
  const files = scanCatalogSourceFiles(sourceConfig);
  const components = [];
  const default_export_candidates = [];
  for (const file of files) {
    const c = classifyComponentFile(file.abs, file.content, sourceConfig);
    if (c) components.push(c);
    const d = classifyDefaultExportCandidate(file.abs, file.content, sourceConfig);
    if (d) default_export_candidates.push(d);
  }
  const barrels = findRootBarrels(files, sourceConfig);
  const evidence = collectBarrelEvidence(barrels);
  const derived = deriveBarrelReexports({
    evidence,
    sourceFiles: files,
    sourceConfig,
    components,
  });
  components.push(...derived.componentAdditions);
  components.sort(compareComponents);
  default_export_candidates.sort(compareComponents);
  const barrel_reexport_candidates = derived.candidates;
  const barrel_reconcile = reconcileBarrelEvidence({
    barrels,
    evidence,
    components,
    candidates: barrel_reexport_candidates,
    resolutionIssues: derived.resolutionIssues,
  });
  return {
    components,
    default_export_candidates,
    barrel_reexport_candidates,
    barrel_reconcile,
    source_globs: sourceConfig.sourceGlobs,
    source_dirs: sourceConfig.sourceDirs,
  };
}

// 생성물 헤더(H1 em-dash 마커) + ## Components 테이블을 결정적 Markdown 문자열로 렌더링한다.
// validate 검사 6 이 /GENERATED FILE\s+—\s+DO NOT EDIT/(em-dash) 를 grep 하므로 마커 글자 고정.
// Command 는 동작하는 직접 node 호출(존재하지 않는 npm alias 아님, §A.3). 무타임스탬프(§7.4(a)).
// 본문은 명시적 '\n' join + 단일 trailing newline (prettier 미사용, §7.4(e)).
// NOTE(header): H1 마커는 사용자 PR-4 동결 포맷을 따른다. contract §4 는 HTML-comment 블록 헤더(on-disk
//       `#` 미사용)를 권고하므로, 이 헤더 형태(H1 vs HTML-comment)는 PR-4 포맷 동결 시 최종 확정 대상이다.
export function renderCatalog(model, opts = {}) {
  const modelHasSourceGlobs = Array.isArray(model.source_globs);
  const sourceGlob = opts.sourceGlob || (modelHasSourceGlobs ? model.source_globs.join(', ') : 'src/components/ui/**');
  const commandSrc = opts.commandSrc ?? catalogCommandSrc(model);
  const commandLayout = opts.commandLayout ? ` --layout ${opts.commandLayout}` : '';
  const out = [];
  out.push('# GENERATED FILE — DO NOT EDIT');
  out.push(`<!-- Source: ${sourceGlob} -->`);
  out.push(
    `<!-- Command: node scripts/catalog-gen.mjs --src ${commandSrc} --out docs/frontend-workflow/design/component-catalog.md${commandLayout} -->`,
  );
  out.push('');
  out.push('## Components');
  out.push('');
  out.push('| Name | Source Path | Export Kind | Status |');
  out.push('| --- | --- | --- | --- |');
  for (const c of model.components) {
    out.push(`| ${c.name} | ${c.source_path} | ${c.export_kind} | ${c.status} |`);
  }
  const defaultExportCandidates = model.default_export_candidates || [];
  if (defaultExportCandidates.length > 0) {
    out.push('');
    out.push('## Default Export Candidates');
    out.push('');
    out.push('| Name | Source Path | Export Kind | Status |');
    out.push('| --- | --- | --- | --- |');
    for (const c of defaultExportCandidates) {
      out.push(`| ${c.name} | ${c.source_path} | ${c.export_kind} | ${c.status} |`);
    }
  }
  const barrelReexportCandidates = model.barrel_reexport_candidates || [];
  if (barrelReexportCandidates.length > 0) {
    out.push('');
    out.push('## Barrel Re-export Candidates');
    out.push('');
    out.push('| Name | Source Path | Export Kind | Status | Reason |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const c of barrelReexportCandidates) {
      out.push(`| ${c.name} | ${c.source_path} | ${c.export_kind} | ${c.status} | ${c.reason} |`);
    }
  }
  return out.join('\n') + '\n';
}

// ===========================================================================
// 배럴(barrel) ↔ 카탈로그 정합성 진단 + path-aware export evidence (warning-first)
// ---------------------------------------------------------------------------
// 정본 src/components/ui/ 루트의 배럴(index.ts|index.tsx)이 `export { X } from './X'` 로
// re-export 하는 컴포넌트 이름과 파일워크 결과를 대조한다. plain exact export 는 primary 보조 evidence,
// wrapper 는 candidate evidence 로 쓰고, 불일치는 stderr warning 으로도 surface 한다. 파일 트리는 계속
// canonical source scope 이며 exit code 는 바꾸지 않는다. 무의존·정적 regex 만 사용한다.
//
// 범위 밖(이번 phase 에서 결정적 해소 안 함 — 조용히 무시하거나 unsupported 로만 카운트, false
// hard-fail 없음): re-export 별칭 `export { A as B }`, star `export *`/`export * as N`,
// type-only re-export `export type { … }`. 외부 패키지 re-export(상대경로 아님)도 컴포넌트
// reconcile 대상이 아니므로 무시한다.

// 배럴 한 개의 본문에서 상대 모듈 `export { … } from './…'` 의 단순 PascalCase 이름만 추출한다.
//   반환: { names: string[], entries: { name, module_specifier }[], unsupported: number }
//   - line/JSDoc 주석 줄은 `^[ \t]*export` 앵커로 자연 배제(v1 classifyComponentFile 와 동일 관례).
//   - `export type { … }` (type-only) → 전체 스킵(컴포넌트 아님, unsupported 아님).
//   - `export * …` (상대 star, non-type) → unsupported++ (열거 불가).
//   - 절(clause) 안 `… as …` 별칭 → unsupported++ (이름 비교 제외).
//   - 절 안 `type X` 인라인 specifier → 스킵(타입).
//   - PascalCase 가 아닌 이름(util/hook 등) → 컴포넌트 아님 → 조용히 무시.
//   - `export function/const <X>` 같은 선언은 `{` 가 바로 오지 않아 named-re-export 정규식에 안 걸린다.
//   - 블록 주석(`/* … */`)은 스캔 전에 제거한다(주석 처리된 export 오인식·절 안 인라인 주석 방지, Codex MINOR).

// 블록 주석(`/* … */`)을 같은 줄 수의 공백으로 치환한다(줄 구조·`^` 앵커 보존). 주석 처리된
// `export { … }` 오인식(false-positive)과 절 안 인라인 주석(`Button /* x */`, false-negative)을
// 무의존으로 막는다. 라인 주석(`//`)은 `^[ \t]*export` 앵커가 이미 배제하므로 건드리지 않는다
// (모듈 경로의 '//' 훼손 방지). 문자열 리터럴 안의 `/* */` 는 드물고 진단(warning-first)이라 무해.
function stripBlockComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

export function parseBarrelReexports(content) {
  const text = stripBlockComments(content || '');
  const names = [];
  const entries = [];
  let unsupported = 0;

  // export [type] { a, b as c } from '<module>'  — export 뒤 공백은 선택(`\s*`, 공백없는 `export{` 허용),
  // `[^}]*` 는 첫 `}` 에서 멈춰 함수 본문을 넘지 않는다.
  const NAMED_RE = /^[ \t]*export\s*(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = NAMED_RE.exec(text)) !== null) {
    const isType = Boolean(m[1]);
    const clauses = m[2];
    const mod = m[3];
    if (isType) continue; // type-only re-export → 컴포넌트 아님
    if (!mod.startsWith('.')) continue; // 외부 패키지 → 무시
    for (const raw of clauses.split(',')) {
      const c = raw.trim();
      if (!c) continue;
      if (/\bas\b/.test(c)) {
        unsupported++; // 별칭 → 이번 phase 범위 밖
        continue;
      }
      if (/^type\s+/.test(c)) continue; // 인라인 type specifier → 타입
      if (PASCAL_RE.test(c)) {
        names.push(c); // PascalCase 컴포넌트 이름만
        entries.push({ name: c, module_specifier: mod });
      }
      // 그 외(camelCase util 등)는 컴포넌트가 아니므로 조용히 무시
    }
  }

  // export [type] * [as Ns] from '<module>'  — export 뒤 공백은 선택(`\s*`).
  const STAR_RE = /^[ \t]*export\s*(type\s+)?\*(?:\s+as\s+\w+)?\s*from\s*['"]([^'"]+)['"]/gm;
  while ((m = STAR_RE.exec(text)) !== null) {
    const isType = Boolean(m[1]);
    const mod = m[2];
    if (isType) continue; // type-only star → 무시
    if (mod.startsWith('.')) unsupported++; // 상대 star → 열거 불가(범위 밖)
  }

  return { names, entries, unsupported };
}

// resolved ui_primitive role root 직속 배럴(index.ts|index.tsx)을 찾아 re-export 집합을
// 카탈로그 컴포넌트 집합과 대조한다. IO 수행(walkFiles/readFileSafe). 순수 파싱은 parseBarrelReexports 가 담당.
//   반환: { barrelFound, barrelPaths, reexported, missingFromCatalog, missingFromBarrel, unsupported }
export function analyzeBarrelReconcile({
  src,
  components,
  barrel_reexport_candidates = [],
  barrel_resolution_issues = [],
  layout,
  projectRoot,
}) {
  const sourceConfig = catalogSourceConfig({ src, layout, projectRoot });
  const files = scanCatalogSourceFiles(sourceConfig);
  const barrels = findRootBarrels(files, sourceConfig);
  const evidence = collectBarrelEvidence(barrels);
  return reconcileBarrelEvidence({
    barrels,
    evidence,
    components,
    candidates: barrel_reexport_candidates,
    resolutionIssues: barrel_resolution_issues,
  });
}

// diff → stderr 경고 라인 배열. 불일치가 없으면(또는 배럴 부재) 빈 배열(=무경고, 정상 케이스).
export function formatBarrelWarnings(diff) {
  if (!diff || !diff.barrelFound) return [];
  const surfacedCandidates = diff.surfacedCandidates || [];
  const surfacedSet = new Set(surfacedCandidates);
  const missingFromCatalog = (diff.missingFromCatalog || []).filter((name) => !surfacedSet.has(name));
  const resolutionIssues = diff.resolutionIssues || [];
  if (
    missingFromCatalog.length === 0 &&
    surfacedCandidates.length === 0 &&
    diff.missingFromBarrel.length === 0 &&
    resolutionIssues.length === 0
  ) {
    return [];
  }
  const lines = [
    'workflow:catalog — WARNING: barrel ↔ catalog mismatch (phase2-1 diagnostic, non-blocking)',
    `  barrel: ${diff.barrelPaths.join(', ')}`,
  ];
  if (surfacedCandidates.length) {
    lines.push(`  not classified as a primary component: ${surfacedCandidates.join(', ')}`);
    lines.push(`  surfaced as a barrel re-export candidate: ${surfacedCandidates.join(', ')}`);
  }
  if (missingFromCatalog.length) {
    lines.push(`  re-exported by barrel but not in catalog: ${missingFromCatalog.join(', ')}`);
  }
  if (diff.missingFromBarrel.length) {
    lines.push(`  in catalog but not re-exported by barrel: ${diff.missingFromBarrel.join(', ')}`);
  }
  if (diff.unsupported > 0) {
    lines.push(
      `  note: ${diff.unsupported} unsupported re-export form(s) (alias/star) ignored — reconcile may be incomplete`,
    );
  }
  for (const issue of resolutionIssues) {
    lines.push(
      `  barrel re-export not promoted (${issue.reason}): ${issue.name} from ${issue.module_specifier} [${issue.barrel_path}]`,
    );
  }
  return lines;
}

// CLI 편의: 진단을 돌려 경고를 stderr 로 쓴다(있을 때만). 반환은 diff(테스트/재사용용).
// exit code 는 절대 바꾸지 않는다 — warning-first(§7). 입력 검증(--src 비디렉토리)은 CLI 가 이미 했다.
export function runBarrelReconcileDiagnostic(
  {
    src,
    components,
    barrel_reexport_candidates,
    barrel_resolution_issues,
    barrel_reconcile,
    layout,
    projectRoot,
  },
  stderr,
) {
  const diff =
    barrel_reconcile ||
    analyzeBarrelReconcile({
      src,
      components,
      barrel_reexport_candidates,
      barrel_resolution_issues,
      layout,
      projectRoot,
    });
  const lines = formatBarrelWarnings(diff);
  if (lines.length) stderr.write(lines.join('\n') + '\n');
  return diff;
}
