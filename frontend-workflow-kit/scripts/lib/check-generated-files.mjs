// check-generated-files.mjs (lib) — generated-file guard v1 의 로직.
//
// 2.5B(discovery): manifest 의 모든 생성물(kind:generated)을 분류한다(부작용 없음).
//   - selected = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist(route-tree·nav-graph·component-catalog).
//   - 그 외(planned·수동모드·비-allowlist)는 selected:false + skip 사유(must-not-fail).
// 2.5C(reproduce): selected(route-tree·nav-graph·component-catalog)를 임시 디렉토리에 재생성해 커밋본과 비교한다.
//   - 생성기를 명시 계약(V1_REPRODUCE)으로 서브프로세스 호출 — manifest/헤더의 command 문자열에
//     의존하지 않는다(설계 §2.1, §8.1). 헤더가 manifest command 와 다르다고 실패시키지 않는다.
//   - 정규화는 normalizeGeneratedViewText(CRLF→LF, \→/)만 — timestamp/date 정규화 없음(§4.3-4.4, §A.5).
//   - 커밋된 파일은 읽기만 한다 — 임시 디렉토리에만 쓰고 finally 로 정리(자동수정/덮어쓰기 없음, §4).
//
// 설계 출처: kit-dev/temp/proposals/generated-file-guard-design.md
//   §1.7 · §2 · §4.3-4.4(regenerate) · §4.7(CG: 키) · §5(reproduce-not-diff) · §A.5(정규화 재사용).
//
// discovery(discoverArtifacts/selectArtifactIds)는 순수(IO 없음)다. reproduceArtifact 만
// 샌드박스 IO(임시 디렉토리·서브프로세스)를 하되 커밋 트리는 절대 건드리지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, exists, isDir, readFileSafe, projectRootOf } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { checkCodegenFiles, renderCodegenFiles } from './codegen-core.mjs';
import openApiClientAdapter from '../adapters/codegens/openapi-client.mjs';
// 정규화 원시함수는 골든 하니스와 동일한 것을 재사용한다(설계 §A.5 "reuse verbatim; do not invent").
import { normalizeGeneratedViewText, toPosix } from './test-fixture.mjs';
// 글롭 미니엔진·생성물 헤더 정규식은 validate(검사 6)와 단일 출처를 공유한다(표류 방지).
import { GENERATED_HEADER_RE, globRoot, globToRegExp } from './glob.mjs';
import { catalogCommandSrcForGlobs } from './catalog-gen.mjs';

// v1 가드 대상 allowlist — whole-file generated artifact: route-tree·nav-graph·component-catalog.
// 정렬된 형태로 둔다(나열 출력 안정성). route-tree/nav-graph = 설계 §1.7 "Guardable NOW";
// component-catalog = 생성기(catalog-gen) active + v1 출력 포맷 freeze 후 졸업(PR-6).
export const V1_ARTIFACT_IDS = ['component-catalog', 'nav-graph', 'route-tree'];
export const V1_CODEGEN_TARGET_IDS = ['codegen-openapi-client'];
export const V1_TARGET_IDS = [...V1_ARTIFACT_IDS, ...V1_CODEGEN_TARGET_IDS].sort(compareText);
// GENERATED_HEADER_RE 는 ./glob.mjs 단일 출처에서 import.

// --artifact 입력을 v1 정책으로 해소한다(작업/표시 집합).
//   requested 없음        → v1 전체(route-tree·nav-graph·component-catalog).
//   requested 가 v1 대상  → 그 하나로 좁힘.
//   requested 가 비-v1    → 빈 배열(가드 대상 아님 — 호출부가 사유를 안내).
export function selectArtifactIds(requested) {
  if (requested == null) return [...V1_ARTIFACT_IDS];
  return V1_TARGET_IDS.includes(requested) ? [requested] : [];
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── 2.5B discovery (순수) ─────────────────────────────────────────────────────

// 생성물 1건을 v1 관점으로 분류한다(intrinsic — --artifact 와 무관).
//   selected = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist.
//   skip 이면 사유를 우선순위 순으로 모은다(skip_reasons[0] 이 가장 근본적인 1차 사유):
//     1) generated 플래그 없음, 2) status != active(planned, 생성기 미구현),
//     3) do_not_edit != true(수동 모드), 4) v1 allowlist 밖.
// 어떤 검사도 하지 않는다 — manifest 값을 읽어 분류만 한다(헤더/본문/파일 IO 없음).
function classifyArtifact(id, entry, allowlist) {
  const status = typeof entry.status === 'string' ? entry.status : null;
  const generated = entry.generated === true;
  const doNotEdit = entry.do_not_edit === true;

  const reasons = [];
  if (!generated) reasons.push("manifest 'generated' 플래그 없음");
  if (status !== 'active') {
    reasons.push(`status: ${status ?? '(없음)'} — 생성기 미구현(planned) → 재생성 안 함(must-not-fail)`);
  }
  if (!doNotEdit) {
    reasons.push(`do_not_edit: ${entry.do_not_edit ?? '(없음)'} — 수동 작성 모드 → 본문 강제 안 함`);
  }
  if (!allowlist.includes(id)) {
    reasons.push(`v1 가드 대상 아님 (v1: ${V1_ARTIFACT_IDS.join(', ')})`);
  }

  return {
    id,
    kind: entry.kind,
    generated,
    status,
    do_not_edit: doNotEdit,
    path: typeof entry.path === 'string' ? entry.path : null,
    outputs: normalizeManifestOutputs(entry),
    command: typeof entry.command === 'string' ? entry.command : null,
    source: Array.isArray(entry.source) ? entry.source.slice() : [],
    selected: reasons.length === 0,
    skip_reasons: reasons,
  };
}

// manifest.artifacts 중 kind:generated 인 엔트리를 전부 분류해 id 정렬로 반환한다.
//   authoring 엔트리는 후보가 아니므로 제외한다.
//   allowlist 는 selected 판정에만 쓴다(기본 V1_ARTIFACT_IDS). 테스트가 주입할 수 있게 인자로 둔다.
export function discoverArtifacts(manifest, { allowlist = V1_ARTIFACT_IDS } = {}) {
  const artifacts =
    manifest && typeof manifest === 'object' && manifest.artifacts && typeof manifest.artifacts === 'object'
      ? manifest.artifacts
      : {};
  const out = [];
  for (const id of Object.keys(artifacts)) {
    const entry = artifacts[id] || {};
    if (entry.kind !== 'generated') continue; // 생성물만 후보(authoring 제외)
    out.push(classifyArtifact(id, entry, allowlist));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// Codegen 은 전역 manifest 에 하나의 artifact + outputs[] 로 등록하되, 기본 v1 전체 대상에는
// 넣지 않는다. 실제 fixture 산출물은 focused advisory target 으로만 노출한다.
export function discoverCodegenTargets({ ids = V1_CODEGEN_TARGET_IDS, manifest } = {}) {
  const wanted = new Set(ids);
  return V1_CODEGEN_TARGET_IDS
    .filter((id) => wanted.has(id))
    .map((id) => {
      const entry = manifest?.artifacts?.[id] || {};
      const outputs = normalizeManifestOutputs(entry);
      return {
        id,
        kind: 'generated',
        generated: true,
        status: 'active',
        do_not_edit: true,
        path: outputs.length
          ? outputs.map((output) => output.path).join(' + ')
          : 'codegen-core expected output list',
        outputs,
        command:
          entry.command ||
          'node scripts/check-generated-files.mjs --artifact codegen-openapi-client --src examples/codegen-adapter/openapi-client/src',
        source: Array.isArray(entry.source) ? entry.source.slice() : ['src/api/schemas/**'],
        selected: true,
        skip_reasons: [],
      };
    })
    .sort((a, b) => compareText(a.id, b.id));
}

// ── 2.5C reproduce-to-scratch (IO; 커밋 트리 불변) ─────────────────────────────

function normalizeManifestOutputs(entry) {
  if (!entry || !Array.isArray(entry.outputs)) return [];
  return entry.outputs
    .map((output) => {
      if (typeof output === 'string') return { path: output };
      if (output && typeof output === 'object' && typeof output.path === 'string') {
        return { ...output, path: output.path };
      }
      return null;
    })
    .filter(Boolean);
}

function codegenOutputPatternsFromManifest(manifest, id) {
  const entry = manifest?.artifacts?.[id];
  return normalizeManifestOutputs(entry).map((output) => output.path);
}

function hasGeneratedHeader(absPath) {
  const head = (readFileSafe(absPath) || '').slice(0, 400);
  return GENERATED_HEADER_RE.test(head);
}

// 표시/메시지용 경로 — cwd 상대 posix(머신 종속 절대경로를 출력에 흘리지 않음).
function relPosix(abs) {
  const rel = path.relative(process.cwd(), abs);
  return toPosix(rel || '.');
}

function roleRootAbs(baseDir, rel) {
  return rel && rel !== '.' ? path.resolve(baseDir, ...rel.split('/')) : baseDir;
}

function roleGlobInputDir(srcDir, layout, role) {
  const baseDir = projectRootOf(srcDir);
  const globs = layout.roleGlobs(role);
  const preferred = catalogCommandSrcForGlobs(globs, { fallback: '' });
  const roots = globs.map((glob) => globRoot(glob).replace(/\/+$/, '')).filter((root) => root !== '');
  const candidates = [...(preferred ? [preferred] : []), ...roots, ''];
  const seen = new Set();
  for (const rel of candidates) {
    const key = rel || '.';
    if (seen.has(key)) continue;
    seen.add(key);
    const abs = roleRootAbs(baseDir, rel);
    if (isDir(abs)) return abs;
  }
  return roleRootAbs(baseDir, preferred || roots[0] || '');
}

// v1 reproduce 계약 — 생성기 호출 방식을 코드로 고정한다(헤더/manifest command 문자열 비파싱).
//   resolveInput : --docs/--src/layout 에서 생성기 입력 디렉토리.
//   inputFlag    : 생성기 입력 플래그.
//   outName      : _meta 산출 파일명(scratch 출력 파일명으로도 사용).
// route-tree: {roles.route_entry} 파일트리 → _meta/route-tree.txt.  nav-graph: docs → _meta/nav-graph.yaml.
// route-tree 입력 디렉토리는 {roles.route_entry} 바인딩에서 파생한다(literal <srcDir>/app 금지 — §6·§10:
// tier2 router 경로와 같은 출처). role 글롭은 프로젝트-루트 상대(src/app)이므로 projectRootOf 로 앵커한다
// (validate 검사 8·spec.mjs fake_hook 와 동일 식 — MINOR 2; 표준 <root>/src 가정 시 dirname(srcDir)).
// (커스텀 라우트 경로[예: Next app/**]를 쓰는 프로젝트에서 생성물 가드가 입력을 짚게.)
export const V1_REPRODUCE = {
  'route-tree': {
    script: 'route-tree.mjs',
    inputFlag: '--app',
    resolveInput: ({ srcDir, layout }) => path.resolve(projectRootOf(srcDir), layout.roleToDir('route_entry')),
    outName: 'route-tree.txt',
  },
  'nav-graph': {
    script: 'nav-graph.mjs',
    inputFlag: '--docs',
    resolveInput: ({ docsDir }) => docsDir,
    outName: 'nav-graph.yaml',
  },
  // component-catalog: {roles.ui_primitive} → design/component-catalog.md.
  // 입력은 role glob 목록의 공통 고정 접두를 우선 넘기고, 없으면 존재하는 개별 고정 접두를 쓴다.
  // 실제 포함 여부는 catalog-gen 의 resolved ui_primitive glob matcher 가 판정한다.
  // 커밋본은 _meta 가 아니라 design/ 아래(committedSubdir) — 매니페스트 path 와 일치.
  'component-catalog': {
    script: 'catalog-gen.mjs',
    inputFlag: '--src',
    resolveInput: ({ srcDir, layout }) => roleGlobInputDir(srcDir, layout, 'ui_primitive'),
    outName: 'component-catalog.md',
    committedSubdir: 'design',
  },
};

export function resolveCodegenSource(contract, layout) {
  return typeof contract.resolveSource === 'function'
    ? contract.resolveSource({ layout })
    : contract.source;
}

const V1_CODEGEN_REPRODUCE = {
  'codegen-openapi-client': {
    adapter: openApiClientAdapter,
    resolveInput: ({ srcDir, layout }) => path.resolve(projectRootOf(srcDir), layout.roleToDir('api_schema')),
    resolveSource: ({ layout }) => layout.roleGlobs('api_schema')[0] || '{roles.api_schema}',
  },
};

// 커밋된 산출물 경로 — outName 을 docsDir 아래 contract.committedSubdir(기본 _meta)에 매핑한다.
//  route-tree/nav-graph = _meta/<outName>(생성기 기본 --out 해석과 동일);
//  component-catalog    = design/<outName>(매니페스트 path 와 일치).
function committedPathFor(contract, docsDir) {
  return path.join(docsDir, contract.committedSubdir || '_meta', contract.outName);
}

// 첫 번째 다른 줄을 사람이 읽게 — 회귀 디버깅용(정규화 후 비교).
function firstLineDiff(committed, regenerated) {
  const a = normalizeGeneratedViewText(committed).split('\n');
  const b = normalizeGeneratedViewText(regenerated).split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}: 커밋=${JSON.stringify(a[i] ?? '<없음>')} 재생성=${JSON.stringify(b[i] ?? '<없음>')}`;
    }
  }
  return '내용 상이';
}

function firstRenderedFileDiff(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return `file ${i + 1}: ${left?.path ?? '<없음>'} vs ${right?.path ?? '<없음>'}`;
    if (left.path !== right.path) return `file ${i + 1}: ${left.path} vs ${right.path}`;
    if (left.content !== right.content) return `${left.path} — ${firstLineDiff(left.content, right.content)}`;
  }
  return null;
}

function summarizeCodegenChanges(changes) {
  return changes.map((c) => `${c.status}: ${c.path}`).join(', ');
}

function collectFilesUnder(rootAbs, relPrefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  entries.sort((a, b) => compareText(a.name, b.name));
  for (const entry of entries) {
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const childAbs = path.join(rootAbs, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesUnder(childAbs, childRel));
    } else if (entry.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

function collectActualCodegenOutputs(baseDir, outputPatterns) {
  const out = [];
  for (const pattern of outputPatterns || []) {
    const rootRel = globRoot(pattern).replace(/\/+$/, '');
    const matcher = globToRegExp(pattern);
    const rootAbs = rootRel ? path.join(baseDir, ...rootRel.split('/')) : baseDir;
    for (const rel of collectFilesUnder(rootAbs)) {
      const candidate = rootRel ? `${rootRel}/${rel}` : rel;
      const abs = path.join(baseDir, ...candidate.split('/'));
      if (matcher.test(candidate) && hasGeneratedHeader(abs)) out.push(candidate);
    }
  }
  return [...new Set(out)].sort(compareText);
}

function staleCodegenOutputs(expectedFiles, actualFiles) {
  const expected = new Set(expectedFiles);
  return actualFiles.filter((file) => !expected.has(file));
}

function reproduceCodegenTarget(id, { srcDir, manifest, layout }) {
  const checks = [];
  let files = [];
  const ok = (check, message) => checks.push({ check, ok: true, message });
  const fail = (check, message) => checks.push({ check, ok: false, message });
  const contract = V1_CODEGEN_REPRODUCE[id];
  if (!contract) {
    fail('CG:config', `codegen reproduce 계약 없음(v1 대상 아님): ${id}`);
    return { id, status: 'skip', committed: null, input: null, files, checks };
  }

  const baseDir = projectRootOf(srcDir);
  const resolvedLayout = layout || loadLayoutProfile({ kitRoot: KIT_ROOT });
  const schemaDir = contract.resolveInput({ srcDir, baseDir, layout: resolvedLayout });
  const apiSchemaGlobs =
    typeof resolvedLayout.roleGlobs === 'function' ? resolvedLayout.roleGlobs('api_schema') : [];
  const result = (status) => ({
    id,
    status,
    committed: relPosix(baseDir),
    input: relPosix(schemaDir),
    files,
    checks,
  });

  if (apiSchemaGlobs.length > 1) {
    fail(
      'CG:config',
      `api_schema multi-glob is unsupported for ${contract.adapter.name || id}: ${apiSchemaGlobs.join(', ')}`,
    );
    return result('generator-error');
  }

  if (!isDir(schemaDir)) {
    fail('CG:input', `api_schema 입력 디렉터리 없음(재생성 불가): ${relPosix(schemaDir)}`);
    return result('missing-input');
  }

  let model;
  try {
    model = contract.adapter.discover({
      apiSchemaDir: schemaDir,
      baseDir,
      source: resolveCodegenSource(contract, resolvedLayout),
    });
    ok('CG:discover', `${contract.adapter.name || id} adapter discovery 완료`);
  } catch (err) {
    fail('CG:discover', err?.message || String(err));
    return result('generator-error');
  }

  let once;
  let twice;
  try {
    once = renderCodegenFiles(model);
    twice = renderCodegenFiles(model);
    files = once.map((file) => file.path);
  } catch (err) {
    fail('CG:render', err?.message || String(err));
    return result('generator-error');
  }

  let status = 'ok';
  const diff = firstRenderedFileDiff(once, twice);
  if (diff == null) {
    ok('CG:deterministic', `동일 입력 2회 render 일치(${files.length} files)`);
  } else {
    fail('CG:deterministic', `동일 입력 2회 render 불일치 — ${diff}`);
    status = 'nondeterministic';
  }

  let check;
  try {
    check = checkCodegenFiles(model, { baseDir });
    files = check.files;
  } catch (err) {
    fail('CG:content', err?.message || String(err));
    return result('generator-error');
  }

  if (check.ok) {
    ok('CG:content', `${files.length} codegen client/hook outputs 커밋본과 일치`);
  } else {
    fail('CG:content', summarizeCodegenChanges(check.changes));
    if (status === 'ok') {
      status = check.changes.some((c) => c.status === 'missing') ? 'missing-committed' : 'mismatch';
    }
  }
  const manifestOutputPatterns = codegenOutputPatternsFromManifest(manifest, id);
  const outputPatterns = manifestOutputPatterns.length ? manifestOutputPatterns : files;
  const stale = staleCodegenOutputs(files, collectActualCodegenOutputs(baseDir, outputPatterns));
  if (stale.length) {
    fail('CG:stale', stale.map((file) => `stale: ${file}`).join(', '));
    if (status === 'ok') status = 'mismatch';
  } else {
    ok('CG:stale', 'manifest-listed generated-owned codegen outputs 에 stale 파일 없음');
  }
  return result(status);
}

// route-tree·nav-graph·component-catalog 하나를 임시 디렉토리에 2회 재생성하고 커밋본과 비교한다.
//   반환: { id, status, committed, input, checks:[{check,ok,message}] }
//   status: ok | mismatch | nondeterministic | generator-error | missing-committed | missing-input | skip
//     - skip 은 v1 reproduce 계약이 없는 id(=비-v1, 방어적)에서만 난다. active v1 산출물의
//       입력/커밋본 부재는 skip 이 아니라 missing-input/missing-committed 로 surface 한다(설계 §5).
//   설계 §4.7 CG: 키 — CG:run:N · CG:output:N · CG:deterministic · CG:content.
//   - 생성기를 import 하지 않고 서브프로세스(process.execPath)로 호출(계약 고정).
//   - 정규화 normalizeGeneratedViewText 만(CRLF/path-sep). timestamp 정규화 없음.
//   - 커밋본은 읽기만 — 임시 디렉토리에만 쓰고 finally 로 삭제(자동수정/덮어쓰기 없음).
export function reproduceArtifact(id, { docsDir, srcDir, layout, layoutPath, manifest }) {
  if (V1_CODEGEN_REPRODUCE[id]) return reproduceCodegenTarget(id, { srcDir, manifest, layout });

  const checks = [];
  const ok = (check, message) => checks.push({ check, ok: true, message });
  const fail = (check, message) => checks.push({ check, ok: false, message });

  const contract = V1_REPRODUCE[id];
  if (!contract) {
    fail('CG:config', `reproduce 계약 없음(v1 대상 아님): ${id}`);
    return { id, status: 'skip', committed: null, input: null, checks };
  }

  // 레이아웃 프로파일(tier1): route-tree 입력 디렉토리를 {roles.route_entry} 에서 파생한다.
  // 호출부가 주지 않으면 기본 프로파일(expo-feature) 로드 — 토큰화 이전과 BYTE-동치(README §1.1).
  const resolvedLayout = layout || loadLayoutProfile({ kitRoot: KIT_ROOT });
  const scriptPath = path.join(KIT_ROOT, 'scripts', contract.script);
  const inputDir = contract.resolveInput({ docsDir, srcDir, layout: resolvedLayout });
  const committed = committedPathFor(contract, docsDir);
  const result = (status) => ({ id, status, committed: relPosix(committed), input: relPosix(inputDir), checks });

  const committedRaw = readFileSafe(committed);
  const committedOk = committedRaw != null;
  const inputOk = isDir(inputDir);

  if (!exists(scriptPath)) {
    fail('CG:config', `생성기 없음: ${relPosix(scriptPath)}`);
    return result('generator-error');
  }
  // active v1 산출물의 커밋본 부재는 finding 이다(설계 §5: active + 출력 부재 → 위반).
  // 입력 디렉터리까지 없어도 조용히 통과(skip)시키지 않는다 — 입력 부재는 부가 사유로만 덧붙이고,
  // 커밋 산출물의 부재 자체를 missing-committed 로 surface 한다(가드가 놓치면 안 되는 신호).
  if (!committedOk) {
    fail('CG:committed', `커밋된 산출물 없음: ${relPosix(committed)}`);
    if (!inputOk) fail('CG:input', `입력 디렉터리도 없음(재생성도 불가): ${relPosix(inputDir)}`);
    return result('missing-committed');
  }
  if (!inputOk) {
    fail('CG:input', `입력 디렉터리 없음(재생성 불가): ${relPosix(inputDir)}`);
    return result('missing-input');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `cgf-${id}-`));
  const outs = [
    path.join(tmpDir, `run1-${contract.outName}`),
    path.join(tmpDir, `run2-${contract.outName}`),
  ];
  const runOnce = (outFile) => {
    const args = [scriptPath, contract.inputFlag, inputDir, '--out', outFile];
    if (layoutPath) args.push('--layout', layoutPath);
    return spawnSync(process.execPath, args, { encoding: 'utf8' });
  };

  let status = 'ok';
  try {
    let runOk = true;
    outs.forEach((outFile, i) => {
      const r = runOnce(outFile);
      const label = `CG:run:${i + 1}`;
      if (r.error) {
        fail(label, `실행 실패: ${r.error.message}`);
        runOk = false;
      } else if (r.status !== 0) {
        const snip = (r.stderr || '').trim().split('\n')[0] || '';
        fail(label, `exit ${r.status} (기대 0)${snip ? ' — ' + snip : ''}`);
        runOk = false;
      } else {
        ok(label, 'exit 0');
      }
    });

    const got = outs.map((o) => readFileSafe(o));
    got.forEach((g, i) => {
      if (g == null) {
        fail(`CG:output:${i + 1}`, `출력 파일 없음: ${relPosix(outs[i])}`);
        runOk = false;
      } else {
        ok(`CG:output:${i + 1}`, '출력 파일 생성');
      }
    });

    if (!runOk) {
      status = 'generator-error';
    } else {
      // 결정성(2회 출력 일치)
      if (normalizeGeneratedViewText(got[0]) === normalizeGeneratedViewText(got[1])) {
        ok('CG:deterministic', '동일 입력 2회 출력 일치');
      } else {
        fail('CG:deterministic', `동일 입력 2회 출력 불일치 — ${firstLineDiff(got[0], got[1])}`);
        status = 'nondeterministic';
      }
      // 커밋본과 본문 동등(reproduce-not-diff)
      if (normalizeGeneratedViewText(committedRaw) === normalizeGeneratedViewText(got[0])) {
        ok('CG:content', `${contract.outName} 커밋본과 일치`);
      } else {
        fail('CG:content', `${contract.outName} 커밋본과 불일치 — ${firstLineDiff(committedRaw, got[0])}`);
        if (status === 'ok') status = 'mismatch';
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // scratch 정리 — 커밋 트리 불변
  }
  return result(status);
}
