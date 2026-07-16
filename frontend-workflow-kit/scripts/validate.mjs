#!/usr/bin/env node
// validate.mjs — 하드 게이트 검사 12종(exit code 0/1 로 CI 게이트). + 검사 13(Interaction Matrix v2 구조)은 warning-first 로 게이트가 아니다.
//   출처: 검사 1~8 = impl §8 / 검사 9~12 = open-decisions.md · input-reconciliation.md (아래 각 항목 참조).
//   1. frontmatter ↔ frontmatter.schema.json
//   2. artifact-manifest 기준 필수 frontmatter 누락
//   3. 끊어진 참조 (depends_on 대상 부재, sources 로컬 파일 부재)
//   4. 이동 대상 부재 (Interaction Matrix route target 이 inventory 에 없음)
//   5. screen_id 중복, route 중복
//   6. do_not_edit 산출물의 GENERATED 헤더/마커 훼손
//   7. confirmed 문서의 승인 메타데이터(approved_by/approved_at) 누락
//   8. API Candidates 가 confirmed 인데 manifest contract evidence 부재/불일치
//   9. Open Decisions 형식 (표 컬럼·Status enum·Blocking Mode 정책 모드·전역 ID 중복; resolved→Options 는 경고)
//      ※ forbidden_paths 경계 backstop 은 diff 기반(후속) — 트리 스캔은 공유 src/api 에 오탐. open-decisions.md "Validate 통합" 참조.
//   10. Copy Keys Status enum (confirmed|draft|tbd) — screen-spec.template.md 의 3-state 계약. stub·placeholder 행은 제외.
//   11. 입력 결과물(inputs/*.md) frontmatter — 정본 입력 스키마(input-reconciliation.md Input Result Contract).
//       required 9필드·input_id 형식/전역중복·supersedes 해소·enum; suggested_scope·summary 는 경고(deprecated alias).
//       inputs/ 디렉토리가 없으면 NO-OP.
//   12. Reconciliation Register(_meta/reconciliation-register.md) — Reconcile Status enum·in-progress/failed·중복 행·
//       8컬럼 스키마·inputs↔register 미처리 교차검사. register 파일이 없으면 NO-OP(초기/선택적 도입).
//       ※ "미처리(reconcile 미완)" = register 행 없음 + Reconcile Status=not-started 는 기본 경고(warning-first),
//         --enforce 플래그로 에러 승격. in-progress(중단)/failed/enum/중복/컬럼누락 같은 망가짐·중단 상태는 항상 에러.
//       ★ HARD RULE: 오직 Reconcile Status 만 본다 — 자식 항목(D-/C-/U-/G-) open/closed 와 Created Items 의 (open) 주석은
//       절대 게이트 신호로 쓰지 않는다(reconciled + 자식 open == 정상 PASS). 세 축은 독립.
//   13. Interaction Matrix v2(structured) 형식 — WARNING-ONLY (하드 게이트 아님, 검사 카운트 "12종"에 미포함).
//       Result Type 헤더가 있는 표만 점검 → v1 표는 무발화 = v1 출력 byte-identical. 에러 승격 없음(warning-first).
//       Result Type=route Target 은 route-tree.txt 의 raw route token 과 EXACT 비교한다. 단, 루트(`/`)만
//       기본 Expo 헤더 + 실제 index.* 노드로 검증된 유일한 single filesystem-group token 을 인정한다.
//   14. Policy `requires` 구문(mode 진입 조건 "fact OP value") — WARNING-ONLY (검사 13 과 동급, "12종"에 미포함).
//       policy.modes[*].requires 각 줄을 policy-condition.mjs 의 파서(readiness 와 단일 출처)로 검사해
//       파싱 불가한 항목(단일 `=`·`=>`·bare 토큰·값 누락 `>=`/`<=` 등)을 저작 시점에 경고로 알린다.
//       requires 가 리스트가 아니면(스칼라/매핑) 그것도 경고한다. 런타임 fail-closed(#135)와
//       대칭인 저작-시점 조기경보 — 하드 게이트 아님(warning→hard 승격은 별도 사람 결정).
//   ※ Preflight cold-start(warning-only): 저작 artifact(artifact_type frontmatter) 0건이면 validate 가 막을
//      대상이 없어 vacuously green(exit 0)으로 통과한다 — 갓 도입한 프로젝트의 fail-open. 게이트(exit code)는
//      건드리지 않고 경고로만 표면화한다(정상 최소 부트스트랩은 stub 도 artifact_type 을 가져 발화 안 함).
import path from 'node:path';
import {
  parseArgs,
  DEFAULTS,
  KIT_ROOT,
  loadYaml,
  loadYamlOrExit,
  walkFiles,
  findFiles,
  readFileSafe,
  splitFrontmatter,
  exists,
  dirHasFiles,
  runCli,
  projectRootOf,
  isCliEntry,
} from './lib/util.mjs';
import { validateSchema } from './lib/schema.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import {
  loadScreenSpec,
  parseApiCandidates,
  interactionEdgeRoutes,
  interactionMatrixV2Issues,
  buildRuntimeRouteTargetIndex,
  routeTargetExistsInScreenInventory,
  parseOpenDecisions,
  parseCopyKeys,
  COPY_KEYS_STATUS_VALUES,
  hasHeader,
  isStub,
  publicScreenKeyOf,
} from './lib/spec.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './lib/input-artifact.mjs';
import {
  parseReconciliationRegister,
  validateReconciliationRegister,
} from './lib/reconciliation-register.mjs';
import {
  buildEndpointIndex,
  collectSchemaExports,
  collectTsTypeExports,
  contractSourceHasText,
  CONTRACT_KINDS,
  isContractUnset,
  normEndpoint,
} from './lib/api-manifest.mjs';
import { parseExpoIndexRouteTokens, parseRouteTreeRouteTokens } from './lib/route-core.mjs';
// policy `requires` 파싱 술어 — readiness.mjs 와 단일 출처를 공유해 검사 14 와 런타임 게이트가 표류하지 않게 한다.
import { isWellFormedRequirement } from './lib/policy-condition.mjs';
// 글롭 미니엔진·생성물 헤더 정규식은 check-generated-files 가드와 단일 출처를 공유한다(표류 방지).
import { GENERATED_HEADER_RE, globRoot, globToRegExp } from './lib/glob.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';
import {
  loadOpenDecisionRegister,
  openDecisionRowIsMalformed,
  REQUIRED_OPEN_DECISION_COLUMNS,
} from './lib/open-decisions.mjs';
import {
  analyzeSharedSurfaces,
  loadSharedSurfaceSpecs,
  sharedSurfaceInteractionIssues,
} from './lib/shared-surfaces.mjs';
import { analyzeScreenLifecycles } from './lib/screen-lifecycle.mjs';

function isLocalRef(ref) {
  if (typeof ref !== 'string') return false;
  if (/^https?:\/\//i.test(ref)) return false;
  return (
    ref.startsWith('docs/') ||
    ref.startsWith('src/') ||
    ref.startsWith('./') ||
    ref.startsWith('../')
  );
}

// 경로를 항상 forward-slash 로 정규화 (Windows 대응)
function toPosix(p) {
  return p.split(path.sep).join('/');
}

// manifest 의 path 패턴(docs/frontend-workflow/... + {domain}/{screen})을 정규식으로.
// docs/frontend-workflow/ 접두는 제거 — docsDir 기준 상대경로와 비교한다.
function manifestPathRegex(pattern) {
  const stripped = pattern.replace(/^docs\/frontend-workflow\//, '');
  const esc = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withVars = esc
    .replace(/\\\{domain\\\}/g, '[^/]+')
    .replace(/\\\{screen\\\}/g, '[^/]+')
    .replace(/\\\{surface\\\}/g, '[^/]+');
  return new RegExp('^' + withVars + '$');
}

// GENERATED_HEADER_RE·globRoot·globToRegExp 는 ./lib/glob.mjs 단일 출처에서 import.
const GENERATED_HEADER_HINT_RE = /GENERATED FILE/i;

function resolveManifestPath(pattern, { docsDir, projectRoot }) {
  const normalized = String(pattern).replace(/\\/g, '/');
  if (normalized.startsWith('docs/frontend-workflow/')) {
    return path.join(docsDir, normalized.replace(/^docs\/frontend-workflow\//, ''));
  }
  return path.join(projectRoot, normalized);
}

function manifestOutputs(entry) {
  if (!Array.isArray(entry.outputs)) return [];
  return entry.outputs
    .map((output) => {
      if (typeof output === 'string') return output;
      if (output && typeof output === 'object' && typeof output.path === 'string') return output.path;
      return null;
    })
    .filter(Boolean);
}

function generatedOutputFiles(pattern, { projectRoot }) {
  const normalized = String(pattern).replace(/\\/g, '/');
  const rootRel = globRoot(normalized);
  const matcher = globToRegExp(normalized);
  const rootAbs = rootRel ? path.join(projectRoot, ...rootRel.split('/')) : projectRoot;
  return walkFiles(rootAbs)
    .filter((file) => {
      const rel = toPosix(path.relative(projectRoot, file));
      return matcher.test(rel);
    });
}

// depends_on 대상이 실제로 존재하는지. manifest 키면 concrete 경로(placeholder 없음)일 때 파일 존재 요구.
function dependencyResolves(dep, { knownArtifactIds, manifest, docsDir }) {
  if (knownArtifactIds.has(dep)) return true; // 로드된 문서의 artifact_id → 파일 존재함
  const entry = (manifest.artifacts || {})[dep];
  if (!entry) return false; // 알 수 없는 대상
  const p = entry.path || '';
  const hasPlaceholder = /[{*]/.test(p);
  if (hasPlaceholder) return true; // 어느 인스턴스인지 특정 불가 — 관대하게 통과
  const rel = p.replace(/^docs\/frontend-workflow\//, '');
  return exists(path.join(docsDir, rel));
}

function helpText() {
  return `workflow:validate - authoring artifact 구조 검사 12종 (hard gate: 통과 exit 0 / 위반 exit 1)

Usage:
  node scripts/validate.mjs [--docs <dir>] [--src <dir>] [--root <dir>]
                            [--manifest <file>] [--schema <file>] [--policy <file>]
                            [--layout <file>] [--enforce] [--json] [--help]

Options:
  --docs <dir>      authoring 문서 루트. 기본: ${DEFAULTS.docs}
  --src <dir>       소스 루트(검사 8 의 contract evidence 탐색 기준). 기본: ${DEFAULTS.src}
  --root <dir>      프로젝트 루트 오버라이드. 기본: --src 의 상위 디렉토리
  --manifest <file> artifact manifest 경로. 기본: 킷 catalog/artifact-manifest.yaml
  --schema <file>   frontmatter 스키마 경로. 기본: 킷 schemas/frontmatter.schema.json
  --policy <file>   정책 경로. 기본: 킷 policies/implementation-mode-policy.yaml
  --layout <file>   project-layout.yaml 경로 오버라이드
  --enforce         검사 12 의 미처리(reconcile 미완) 경고를 에러로 승격
  --json            결정적 JSON({ ok, count, errors, warnings })을 stdout 으로 출력
  --help            이 도움말 출력

Behavior:
  검사 통과 exit 0 / 위반 exit 1 (CI 하드 게이트). usage 오류·설정 파일(manifest/schema/policy)
  부재·손상은 exit 2 — unknown flag 를 조용히 무시하는 fail-open 을 금지한다.
`;
}

// parseArgs 는 모든 --foo 를 그대로 flags 에 넣으므로(거부 없음) CLI 별 allowlist 로 오타를 잡는다.
// 예: --enforc 오타가 "--enforce 없는 실행"으로 조용히 진행되는 것을 막는다(exit 2).
const VALUE_FLAGS = new Set(['docs', 'src', 'root', 'manifest', 'schema', 'policy', 'layout']);
const BOOLEAN_FLAGS = new Set(['enforce', 'json', 'help']);

function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);
  enforceCliFlagContract({
    argv,
    flags,
    positionals,
    valueFlags: VALUE_FLAGS,
    booleanFlags: BOOLEAN_FLAGS,
    tool: 'validate',
    helpCommand: 'node scripts/validate.mjs',
  });
  if (flags.help) {
    process.stdout.write(helpText());
    return; // help 는 자연 종료 exit 0
  }
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const srcDir = path.resolve(flags.src || DEFAULTS.src);
  // projectRoot = role 글롭 앵커 단일 출처(MINOR 2 — spec.mjs·check-generated-files 와 동일 식).
  const projectRoot = projectRootOf(srcDir, flags);
  // 설정 파일(manifest/schema/policy)은 부재·손상 시 exit 2 — 누락된 설정이 검사를 조용히 비활성화하지
  // 않게 한다(forbidden-paths·readiness 와 대칭). 실제 설치는 킷 위치에서 자동 해석돼 항상 존재한다.
  const manifestPath = path.resolve(flags.manifest || DEFAULTS.manifest);
  const manifest = loadYamlOrExit(manifestPath, 'manifest', 'validate');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    process.stderr.write(`validate: manifest 파일 없음/형식 오류(매핑 아님): ${manifestPath}\n`);
    process.exit(2);
  }
  const schemaPath = path.resolve(flags.schema || DEFAULTS.schema);
  const schemaRaw = readFileSafe(schemaPath);
  if (schemaRaw == null) {
    process.stderr.write(`validate: schema 파일 없음: ${schemaPath}\n`);
    process.exit(2);
  }
  let schema;
  try {
    schema = JSON.parse(schemaRaw);
  } catch (err) {
    process.stderr.write(`validate: schema JSON 파싱 실패 — ${schemaPath}\n  ${err.message}\n`);
    process.exit(2);
  }
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    process.stderr.write(`validate: schema 가 매핑(객체)이 아님: ${schemaPath}\n`);
    process.exit(2);
  }
  // 정책: 검사 9 의 Blocking Mode 유효성(정책 모드명인지)에 쓴다. 게이트 판정은 readiness 단일 출처.
  const policyPath = path.resolve(flags.policy || DEFAULTS.policy);
  const policy = loadYamlOrExit(policyPath, 'policy', 'validate');
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    process.stderr.write(`validate: 정책 파일 없음/형식 오류(매핑 아님): ${policyPath}\n`);
    process.exit(2);
  }
  // 레이아웃 프로파일(tier1): 검사 8 의 스키마 디렉토리를 {roles.api_schema} 단일 출처에서 파생한다
  // (literal <srcDir>/api/schemas 금지 — §6·§10). --layout 으로 project-layout.yaml 경로 오버라이드.
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });

  const errors = [];
  const add = (check, file, message) =>
    errors.push({ check, file: toPosix(path.relative(projectRoot, file)), message });
  // 경고: exit code 에 영향 없는 약한 권장(현재 resolved→Options 선택값). open-decisions.md 의 "약하게 시작".
  const warnings = [];
  const warn = (check, file, message) =>
    warnings.push({ check, file: toPosix(path.relative(projectRoot, file)), message });

  // --- authoring 문서 수집 (docs/ 하위, _meta 제외) ---
  const mdFiles = walkFiles(docsDir, ['.md']).filter(
    (f) => !f.split(path.sep).includes('_meta'),
  );
  const docs = [];
  for (const f of mdFiles) {
    const { data, hasFrontmatter, parseError } = splitFrontmatter(readFileSafe(f));
    if (parseError) add(1, f, `frontmatter YAML 파싱 실패: ${parseError}`);
    if (!hasFrontmatter || !data.artifact_type) continue; // 규칙 문서가 아님
    docs.push({ file: f, fm: data });
  }

  // 콜드스타트 fail-open 가드 (warning-first): 저작된 artifact 문서가 0건이면 막을 대상이 없어
  // vacuously green(exit 0)으로 통과한다 — 갓 도입한 프로젝트가 "통과=됐다"로 오인하는 fail-open.
  // 게이트(exit code)는 건드리지 않고 경고만 띄워 LLM/사람이 부트스트랩 미완을 인지하게 한다.
  // 정상 최소 부트스트랩(navigation-map + screen-spec stub)은 artifact_type frontmatter 를 가지므로
  // docs.length>=1 이라 발화하지 않는다(open-decisions.md "약하게 시작" 계열의 추가 신호).
  // 알려진 한계: artifact_type 은 있으나 placeholder({SCREEN_ID} 등)만 든 미편집 stub 은 docs.length>=1 이라
  // 이 경고로는 안 잡힌다 — "본문 미작성"은 isStub/screen-skeleton 모드 파생이 별도로 신호한다.
  if (docs.length === 0) {
    // check 라벨은 숫자 검사(1~13)와 달리 문자열 'cold-start' — 번호 매겨진 구조 검사가 아닌 preflight
    // 신호라 의도적이다(check-generated-files 의 문자열 라벨 선례와 동형). --json 의 check 계약은
    // number | 'cold-start' 이며, 현재 warnings 를 숫자 check 로 거르는 소비자는 없다.
    warn(
      'cold-start',
      docsDir,
      '저작된 artifact 문서(artifact_type frontmatter)가 0건 — validate 가 막을 대상이 없어 ' +
        'vacuously 통과합니다(exit 0). --docs 경로가 틀렸거나 아직 부트스트랩 전일 수 있습니다. ' +
        'navigation-map + screen-spec stub 을 먼저 저작하세요.',
    );
  }

  const knownArtifactIds = new Set(docs.map((d) => d.fm.artifact_id).filter(Boolean));

  // --- 검사 1, 2, 3(depends_on/sources), 7 ---
  for (const { file, fm } of docs) {
    // 1. 스키마
    for (const e of validateSchema(fm, schema)) add(1, file, e);

    // 2. manifest 필수 frontmatter + 잘못된 경로 (impl §4: 누락 frontmatter / 잘못된 경로)
    const mEntry = (manifest.artifacts || {})[fm.artifact_type];
    if (mEntry?.required_frontmatter) {
      for (const key of mEntry.required_frontmatter) {
        if (fm[key] === undefined || fm[key] === null || fm[key] === '') {
          add(2, file, `필수 frontmatter 누락: ${key} (artifact_type=${fm.artifact_type})`);
        }
      }
    }
    if (mEntry?.path) {
      const rel = toPosix(path.relative(docsDir, file));
      if (!manifestPathRegex(mEntry.path).test(rel)) {
        add(2, file, `잘못된 경로: ${fm.artifact_type} 는 ${mEntry.path} 패턴이어야 함 (실제 docs 상대경로: ${rel})`);
      }
    }
    if (
      fm.artifact_type !== 'screen-spec' &&
      ['screen_lifecycle', 'absorbed_into', 'absorbed_at'].some((field) =>
        Object.prototype.hasOwnProperty.call(fm, field),
      )
    ) {
      add(2, file, 'screen_lifecycle/absorbed_into/absorbed_at 은 ScreenSpec 전용 frontmatter');
    }

    // 3a. depends_on 대상 존재 (manifest 키면 concrete 경로의 파일 존재까지 확인)
    if (Array.isArray(fm.depends_on)) {
      for (const dep of fm.depends_on) {
        if (!dependencyResolves(dep, { knownArtifactIds, manifest, docsDir })) {
          // 다음 행동 힌트: manifest 에 등록된 산출물이면 어디서 만들지 알려준다.
          const entry = (manifest.artifacts || {})[dep];
          const hint = entry?.template
            ? ` → 해소: ${entry.template} 를 복사해 ${entry.path} 에 생성하세요`
            : ` → 해소: depends_on 에서 '${dep}' 를 제거하거나 해당 문서를 생성하세요`;
          add(3, file, `depends_on 대상 부재: ${dep}${hint}`);
        }
      }
    }
    // 3b. sources 로컬 파일 존재
    if (Array.isArray(fm.sources)) {
      for (const s of fm.sources) {
        const ref = s?.ref;
        if (isLocalRef(ref) && !exists(path.resolve(projectRoot, ref))) {
          add(3, file, `sources 링크 파일 부재: ${ref} → 해소: 파일을 생성하거나 ref 를 올바른 경로로 고치세요 (외부 링크면 http(s):// 로)`);
        }
      }
    }

    // 7. confirmed 승인 메타데이터 (IMPLEMENTING §4 #6: approved_by/at/decision_id)
    if (fm.status === 'confirmed') {
      if (!fm.approved_by) add(7, file, 'status=confirmed 인데 approved_by 누락');
      if (!fm.approved_at) add(7, file, 'status=confirmed 인데 approved_at 누락');
      if (!fm.decision_id) add(7, file, 'status=confirmed 인데 decision_id 누락');
    }
  }

  // --- screen-spec 전용 검사 (4, 5, 8) ---
  const specPaths = findFiles(path.join(docsDir, 'domains'), 'screen-spec.md');
  const routeSet = new Set();
  const idCount = new Map();
  const routeCount = new Map();
  const specs = specPaths.map((p) => loadScreenSpec(p));
  const screenLifecycle = analyzeScreenLifecycles({ specs, docsDir });
  const liveSpecs = screenLifecycle.liveSpecs;
  const absorbedSpecPaths = new Set(
    screenLifecycle.absorbedRecords.map((record) => record.spec.path),
  );
  for (const spec of specs) {
    const screenKey = publicScreenKeyOf(spec);
    idCount.set(screenKey, (idCount.get(screenKey) || 0) + 1);
  }
  for (const spec of liveSpecs) {
    const route = spec.frontmatter.route;
    if (route) routeSet.add(route);
    if (route) routeCount.set(route, (routeCount.get(route) || 0) + 1);
  }
  for (const record of screenLifecycle.invalidRecords) {
    for (const issue of record.errors) {
      if (issue.check === 2 || issue.check === 3) {
        add(issue.check, record.spec.path, issue.message);
      }
    }
  }
  const surfaceSpecs = loadSharedSurfaceSpecs({ docsDir });
  const surfaceRecords = analyzeSharedSurfaces({
    docsDir,
    surfaceSpecs,
    screenSpecs: specs,
    screenLifecycle,
  });

  for (const record of surfaceRecords) {
    for (const issue of record.contract_errors) {
      if (
        issue.code === 'local-open-decisions' ||
        issue.code === 'interaction-v2-required' ||
        issue.code === 'surface-route-result' ||
        issue.code === 'invalid-surface-result-type'
      ) {
        continue; // checks 4/9 own these boundaries.
      }
      add(2, record.spec.path, issue.message);
    }
    for (const issue of record.membership_errors) add(3, record.spec.path, issue.message);
    for (const issue of record.path_errors) add(3, record.spec.path, issue.message);
    for (const issue of record.identity_errors) add(5, record.spec.path, issue.message);
    for (const issue of sharedSurfaceInteractionIssues(record.spec)) {
      add(4, record.spec.path, issue.message);
    }
  }

  // 검사 13 의 정밀 route 존재 확인 입력. route-tree 는 생성물이라 없거나 아직 stale 일 수 있으므로
  // 부재는 hard fail 이 아니라 advisory warning 이다. 존재하는 경우 `route: <token>` raw 문자열을 비교하되,
  // 루트 Target(`/`)만 기본 Expo 헤더 + 실제 index.* 노드로 검증된 유일한 group token 을 인정한다.
  const routeTreeFile = path.join(docsDir, '_meta', 'route-tree.txt');
  const routeTreeExists = exists(routeTreeFile);
  const routeTreeText = routeTreeExists ? readFileSafe(routeTreeFile) : null;
  const routeTreeRouteSet = routeTreeExists ? parseRouteTreeRouteTokens(routeTreeText) : null;
  // 루트(`/`) alias 에만 쓰는 provenance. 기본 expo-router 헤더 + 실제 index.* 파일 노드가 모두
  // 확인돼야 채워지며, custom router 또는 `(app).tsx` literal file 은 빈 집합으로 fail-closed 한다.
  const routeTreeExpoIndexRouteSet = parseExpoIndexRouteTokens(routeTreeText);

  // 5. 중복
  for (const [id, n] of idCount) if (n > 1) add(5, path.join(docsDir, 'domains'), `screen_id 중복: ${id} (${n}건)`);
  for (const [r, n] of routeCount)
    if (n > 1) add(5, path.join(docsDir, 'domains'), `route 중복: ${r} (${n}건)`);

  // 4. Interaction Matrix route target 이 inventory(route 집합)에 있는지
  //    v1 표는 free-form Result 를 읽고, v2 표는 Result Type=route 행의 Target 을 읽는다.
  //    명시적 비-route v2 행(state/mutation/external/none)의 Result prose 는 하드 게이트 입력이 아니다.
  //    Expo Router 의 일반 filesystem group `(auth)` 는 런타임 URL 에 나타나지 않으므로, raw route
  //    `/(auth)/login` 이 group-less Target `/login` 과 단일하게 대응할 때만 통과시킨다.
  //    루트(`/`)는 raw single-group ScreenSpec 후보의 존재만 확인한다. generated/stale 가능 route-tree 의
  //    provenance·모호성은 검사 13 warning, destination 선택은 nav-graph 가 별도로 fail-closed 한다.
  const runtimeRouteTargetIndex = buildRuntimeRouteTargetIndex(routeSet);
  for (const spec of liveSpecs) {
    const targets = interactionEdgeRoutes(spec);
    for (const t of targets) {
      if (!routeTargetExistsInScreenInventory(t, routeSet, runtimeRouteTargetIndex)) {
        add(4, spec.path, `Interaction Matrix 이동 대상 route 가 화면에 없음: ${t}`);
      }
    }
  }

  // 6b. generated_sections 마커 무결성 (authored screen-spec 의 Entry Points GENERATED:START/END)
  //     stub(frontmatter만)에는 본문이 없으므로 검사 대상이 아니다.
  const screenSpecGenSections =
    (manifest.artifacts || {})['screen-spec']?.generated_sections || [];
  for (const spec of liveSpecs) {
    if (isStub(spec)) continue;
    for (const sec of screenSpecGenSections) {
      const gen = sec.generator;
      // START/END 모두 generator 이름까지 일치해야 하고, START 가 END 보다 앞서야 한다.
      const startM = new RegExp(`GENERATED:START\\s+${gen}\\b`).exec(spec.body);
      const endM = new RegExp(`GENERATED:END\\s+${gen}\\b`).exec(spec.body);
      if (!startM || !endM || startM.index >= endM.index) {
        add(
          6,
          spec.path,
          `generated section 마커 부재/훼손/순서오류: ${sec.name} (GENERATED:START ${gen} … GENERATED:END ${gen})`,
        );
      }
    }
  }

  // 8. API Candidates(confirmed) ↔ contract evidence 매칭 (제안서 옵션 C: api-manifest ## Endpoints 가 canonical).
  //    각 confirmed ScreenSpec 후보의 (Method, Path) → api-manifest endpoint → Linked Contract 해소.
  //    - Linked Schema 레거시 컬럼은 zod 런타임 export 로 계속 해소한다.
  //    - Contract Kind=ts-type 은 Source 경로의 export type/interface 정적 evidence 로만 인정한다.
  //      TS type evidence 는 런타임 validation evidence 가 아니다.
  //    - manifest 부재 시: 현행 전역 존재검사(hasZod||hasOpenApi)로 폴백(엄격 모드로 깨지 않음).
  //    - confirmed 0건 화면은 무발화(candidate 전용 화면의 옛 동작·readiness 불변).
  //    - api_required:false 화면은 자체 API 후보를 요구하지 않는다. 단 실제 Method/Path 후보가
  //      같이 있으면 no-API 선언과 충돌하므로 에러로 잡는다.
  const schemasDir = path.resolve(projectRoot, layout.roleToDir('api_schema'));
  const hasZod = dirHasFiles(schemasDir, ['.ts']);
  const hasOpenApi =
    exists(path.join(projectRoot, 'openapi.yaml')) ||
    exists(path.join(projectRoot, 'openapi.yml'));
  const manifestFiles = docs
    .filter((d) => d.fm.artifact_type === 'api-manifest')
    .map((d) => d.file);
  const endpoints = manifestFiles.length ? buildEndpointIndex(manifestFiles) : null;
  const endpointIndex = endpoints ? endpoints.index : null;
  // canonical 출처(api-manifest)에 같은 (Method,Path) 가 서로 다른 contract/source/confidence 로 중복 선언되면
  // 매칭이 행 순서에 의존(모순)하므로 에러로 surface 한다(동일 중복 행은 무시).
  for (const c of endpoints ? endpoints.conflicts : []) {
    add(
      8,
      c.file,
      `api-manifest ## Endpoints 의 ${c.key} 가 충돌 중복 선언됨 (Linked Contract '${c.prev.linkedContract || '(빈값)'}'/${c.prev.contractKind || '(kind 없음)'} vs '${c.next.linkedContract || '(빈값)'}'/${c.next.contractKind || '(kind 없음)'}, Source '${c.prev.source || '(빈값)'}' vs '${c.next.source || '(빈값)'}', confidence '${c.prev.confidence || '(빈값)'}' vs '${c.next.confidence || '(빈값)'}') → 해소: (Method,Path) 당 canonical 행 1개만 남기세요.`,
    );
  }
  const schemaExports = collectSchemaExports(schemasDir);
  const tsTypeExportCache = new Map();
  const tsTypeExportsFor = (source) => {
    const key = String(source || '');
    if (!tsTypeExportCache.has(key)) tsTypeExportCache.set(key, collectTsTypeExports(source, projectRoot));
    return tsTypeExportCache.get(key);
  };

  const behaviorSpecs = [...liveSpecs, ...surfaceSpecs];
  for (const spec of behaviorSpecs) {
    const isSurface = spec.frontmatter.artifact_type === 'shared-surface-spec';
    const contractLabel = isSurface ? 'shared-surface-spec' : 'ScreenSpec';
    const candidates = parseApiCandidates(spec.sections['api candidates']);
    if (spec.frontmatter.api_required === false) {
      const concrete = candidates.filter((it) => it.method && it.path);
      for (const e of concrete) {
        add(
          8,
          spec.path,
          isSurface
            ? `api_required:false shared-surface-spec은 자체 API 후보를 선언할 수 없음: ${e.method} ${e.path} → 해소: upstream API 결과 설명은 Data Requirements/Notes 에 남기고 API Candidates 에서 제거하거나 api_required 를 true 로 바꾸세요.`
            : `api_required:false 화면은 자체 API 후보를 선언할 수 없음: ${e.method} ${e.path} → 해소: upstream API 결과 설명은 Data Requirements/Notes 에 남기고 API Candidates 에서 제거하거나 api_required 를 true 로 바꾸세요.`,
        );
      }
      continue;
    }
    const confirmed = candidates.filter(
      (it) => it.confidence === 'confirmed',
    );
    if (confirmed.length === 0) continue; // candidate/unknown 전용 → 무발화(옛 동작 유지)
    if (!endpointIndex) {
      // 폴백: api-manifest 부재 → 현행 전역 존재검사
      if (!hasZod && !hasOpenApi) {
        add(
          8,
          spec.path,
          `confirmed API ${confirmed.length}건인데 zod 스키마(src/api/schemas/*.ts)/OpenAPI 부재 (api-manifest 부재 → 전역 존재검사 폴백)`,
        );
      }
      continue;
    }
    for (const e of confirmed) {
      const label = `${e.method || '?'} ${e.path || e.raw}`;
      if (!e.method || !e.path) {
        add(
          8,
          spec.path,
          `confirmed API 후보의 Method/Path 를 파싱할 수 없음: "${e.raw}" → 해소: "- GET /path (confidence: confirmed)" 형식으로 작성하세요.`,
        );
        continue;
      }
      const m = endpointIndex.get(normEndpoint(e.method, e.path));
      if (!m) {
        add(
          8,
          spec.path,
          `confirmed API ${label} 가 api-manifest ## Endpoints 에 매칭되는 엔드포인트가 없음 → 해소: api/api-manifest.md ## Endpoints 에 ${e.method} ${e.path} 행을 추가하거나 ${contractLabel} confidence 를 candidate 로 낮추세요.`,
        );
        continue;
      }
      if (m.confidence !== 'confirmed') {
        add(
          8,
          spec.path,
          `confirmed API ${label} 의 api-manifest 엔드포인트 confidence=${m.confidence || '(빈값)'} 이라 confirmed 아님 → 해소: manifest 행의 confidence 를 confirmed 로 올리거나 ${contractLabel} 을 candidate 로 낮추세요.`,
        );
        continue;
      }
      if (isContractUnset(m.linkedContract)) {
        // 컬럼 자체 부재(레거시 형식)와 셀 빈칸/TBD 를 구분 — 전자는 표에서 없는 칸을 찾게 만드는 혼란을 막는다.
        const detail =
          m.hasLinkedSchemaCol === false && m.hasLinkedContractCol === false
            ? `## Endpoints 표에 Linked Schema 컬럼이 없음(레거시 형식) → 해소: api-manifest 를 Method|Path|Confidence|Linked Contract|Contract Kind|Source 형식으로 맞추고(templates/api/api-manifest.template.md 참조) Linked Contract 에 실제 contract 이름을 기입하세요.`
            : `${m.hasLinkedContractCol ? 'Linked Contract' : 'Linked Schema'} 가 비어있음(빈칸/TBD) → 해소: ## Endpoints 행의 contract 이름을 기입하세요.`;
        add(8, m.file, `confirmed endpoint ${e.method} ${e.path}: ${detail}`);
        continue;
      }
      if (m.contractKindOmitted) {
        add(
          8,
          m.file,
          `confirmed endpoint ${e.method} ${e.path} 의 Contract Kind 가 비어있음 → 해소: ${CONTRACT_KINDS.join('|')} 중 하나를 기입하세요. 기존 Linked Schema 5컬럼 레거시 표는 zod 로 자동 추론됩니다.`,
        );
        continue;
      }
      if (!CONTRACT_KINDS.includes(m.contractKind)) {
        add(
          8,
          m.file,
          `confirmed endpoint ${e.method} ${e.path} 의 Contract Kind='${m.contractKind || '(빈값)'}' 는 지원되지 않음 → 해소: ${CONTRACT_KINDS.join('|')} 중 하나를 사용하세요.`,
        );
        continue;
      }
      if (m.contractKind === 'zod') {
        if (!schemaExports.has(m.linkedContract)) {
          add(
            8,
            m.file,
            `confirmed endpoint ${e.method} ${e.path} 의 zod contract=${m.linkedContract} 가 src/api/schemas/*.ts 런타임 export 에서 발견되지 않음 → 해소: zod 스키마 export 를 추가하거나 Linked Contract/Linked Schema 를 올바른 export 이름으로 수정하세요.`,
          );
          continue;
        }
      } else if (m.contractKind === 'ts-type') {
        const typeExports = tsTypeExportsFor(m.source);
        if (!typeExports.has(m.linkedContract)) {
          add(
            8,
            m.file,
            `confirmed endpoint ${e.method} ${e.path} 의 ts-type contract=${m.linkedContract} 가 Source=${m.source || '(빈값)'} 의 export type/interface 에서 발견되지 않음 → 해소: Source 경로에 export type 또는 export interface 를 추가하거나 Linked Contract 를 수정하세요. TS type evidence 는 런타임 validation evidence 가 아닙니다.`,
          );
          continue;
        }
      } else if (m.contractKind === 'openapi') {
        if (!contractSourceHasText(m.source, projectRoot, m.linkedContract, ['.yaml', '.yml', '.json'])) {
          add(
            8,
            m.file,
            `confirmed endpoint ${e.method} ${e.path} 의 openapi contract=${m.linkedContract} 가 Source=${m.source || '(빈값)'} 의 project-local OpenAPI 파일(.yaml/.yml/.json)에서 발견되지 않음 → 해소: Source 를 프로젝트 내부 OpenAPI 파일로 지정하고 Linked Contract 이름을 포함시키세요.`,
          );
          continue;
        }
      } else if (m.contractKind === 'manual') {
        if (!contractSourceHasText(m.source, projectRoot, m.linkedContract, ['.md', '.txt', '.yaml', '.yml', '.json'])) {
          add(
            8,
            m.file,
            `confirmed endpoint ${e.method} ${e.path} 의 manual contract=${m.linkedContract} 가 Source=${m.source || '(빈값)'} 의 project-local manual evidence 파일에서 발견되지 않음 → 해소: Source 를 프로젝트 내부 문서/스펙 파일로 지정하고 Linked Contract 이름을 포함시키세요.`,
          );
          continue;
        }
      } else if (m.contractKind === 'unknown') {
        add(
          8,
          m.file,
          `confirmed endpoint ${e.method} ${e.path} 의 Contract Kind=unknown 은 confirmed API evidence 를 만족할 수 없음 → 해소: zod|ts-type|openapi|manual 중 확인 가능한 evidence kind 로 바꾸거나 ${contractLabel} confidence 를 candidate 로 낮추세요.`,
        );
        continue;
      }
    }
  }

  // 9. Open Decisions 형식 + canonical register/reference 검사.
  //    기존 ScreenSpec-local 표와 optional global register 가 같은 6컬럼 parser/행 규칙을 공유한다.
  //    decision_refs 는 global register 로만 exact/case-sensitive 해소한다.
  const policyModes =
    (policy.order && policy.order.length ? policy.order : Object.keys(policy.modes || {})) || [];
  const openDecisionOccurrences = new Map();
  const localDecisionIds = new Set();
  const decisionRegister = loadOpenDecisionRegister({ docsDir });
  // 정책을 못 읽으면(policyModes 비어있음) Blocking Mode 정책-모드 검사를 건너뛴다 — 전부 무효로 오탐 방지.
  // 단 Open Decisions 가 실제로 있으면 조용히 넘기지 않고 경고로 surface 한다(설정 오류 신호).
  if (policyModes.length === 0 && (decisionRegister.exists || liveSpecs.some((s) => s.sections['open decisions'] !== undefined))) {
    warn(9, path.join(docsDir, 'domains'), '정책을 로드하지 못해 Open Decisions 의 Blocking Mode 정책-모드 검사를 건너뜀 — policy 경로를 확인하세요');
  }

  function validateOpenDecisionSection({ file, section, required = false, local = false }) {
    if (section === undefined) {
      if (required) {
        add(9, file, 'canonical open-decision-register 에 ## Open Decisions 섹션이 없음');
      }
      return;
    }
    const od = parseOpenDecisions(section);
    if (!od.table) {
      if (required || od.sectionHasContent) {
        add(
          9,
          file,
          'Open Decisions 섹션에 내용이 있으나 파싱 가능한 표가 없음 → 해소: 템플릿의 6컬럼 표(| ID | Decision Needed | Options | Blocking Mode | Owner | Status |) 형식을 사용하세요',
        );
      }
      return;
    }
    const missingCols = REQUIRED_OPEN_DECISION_COLUMNS.filter((c) => !hasHeader(od.headers, c));
    if (missingCols.length) {
      add(9, file, `Open Decisions 표 필수 컬럼 누락: ${missingCols.join(', ')}`);
    }
    for (const r of od.rows) {
      const label = r.id || '(no-id)';
      const status = r.status.toLowerCase();
      if (!r.id) {
        add(9, file, `Open Decision 행에 ID 누락 (Decision: ${r.decisionNeeded || '?'}) → 해소: 전역 유일한 D-xxx ID 부여`);
      }
      if (!r.decisionNeeded) {
        add(9, file, `Open Decision ${label}: Decision Needed 누락 (필수) → 해소: 결정해야 하는 질문 작성`);
      }
      if (status !== 'open' && status !== 'resolved') {
        add(9, file, `Open Decision ${label}: Status 는 open|resolved 여야 함 (현재: ${r.status || '(빈값)'})`);
      }
      if (r.blockingMode) {
        if (policyModes.length && !policyModes.includes(r.blockingMode)) {
          add(9, file, `Open Decision ${label}: Blocking Mode '${r.blockingMode}' 가 정책 모드가 아님 → 해소: ${policyModes.join(' / ')} 중 하나`);
        } else if (status === 'open' && policyModes.length && policyModes.indexOf(r.blockingMode) === 0) {
          add(9, file, `Open Decision ${label}: Blocking Mode '${r.blockingMode}' 는 floor(docs-only)라 막을 수 없음 → 해소: 그 위 모드 지정`);
        }
      } else {
        // Blocking Mode 는 전 행 필수 (open-decisions.md 필드표). resolved 도 canonical 행에 유지하며,
        // 재오픈 시 게이트가 즉시 동작하도록 한다.
        add(9, file, `Open Decision ${label}: Blocking Mode 누락 (필수) → 해소: 막을 최소 모드 지정`);
      }
      if (status === 'resolved' && !r.options) {
        warn(9, file, `Open Decision ${label}: resolved 인데 Options 에 선택값 표시 없음 (권장: '→ 선택값')`);
      }
      if (r.id) {
        const occurrences = openDecisionOccurrences.get(r.id) || [];
        occurrences.push({ file });
        openDecisionOccurrences.set(r.id, occurrences);
      }
      if (local && r.id) localDecisionIds.add(r.id);
    }
  }

  for (const spec of liveSpecs) {
    validateOpenDecisionSection({
      file: spec.path,
      section: spec.sections['open decisions'],
      local: true,
    });
  }
  for (const surface of surfaceSpecs) {
    const section = surface.sections['open decisions'];
    if (section === undefined) continue;
    const parsed = parseOpenDecisions(section);
    if (parsed.rows.length === 0 && !parsed.sectionHasContent) continue;
    add(
      9,
      surface.path,
      'shared-surface-spec 은 local ## Open Decisions 표를 소유할 수 없음 → global/open-decisions.md 로 행을 옮기고 frontmatter decision_refs 로 참조하세요',
    );
  }
  if (decisionRegister.exists) {
    if (decisionRegister.structuralErrors.includes('invalid-frontmatter')) {
      add(9, decisionRegister.file, 'canonical open-decision-register frontmatter 가 잘못됨 → artifact_id/artifact_type=open-decision-register 및 status 를 선언하세요');
    }
    if (decisionRegister.structuralErrors.includes('duplicate-section')) {
      add(9, decisionRegister.file, 'canonical open-decision-register 에 ## Open Decisions 섹션이 2개 이상 있음 → canonical 표는 정확히 1개여야 함');
    }
    if (decisionRegister.structuralErrors.includes('multiple-decision-tables')) {
      add(9, decisionRegister.file, 'canonical open-decision-register 의 ## Open Decisions 섹션에 canonical 표가 2개 이상 있음 → 6컬럼 표 하나로 합치세요');
    }
    validateOpenDecisionSection({ file: decisionRegister.file, section: decisionRegister.section, required: true });
  }
  for (const [id, occurrences] of openDecisionOccurrences) {
    if (occurrences.length > 1) {
      const files = [...new Set(occurrences.map((entry) => entry.file))].sort();
      const includesRegister = files.includes(decisionRegister.file);
      const diagnosticFile = includesRegister ? decisionRegister.file : path.join(docsDir, 'domains');
      const locations = includesRegister
        ? ` [locations: ${files.map((file) => toPosix(path.relative(docsDir, file))).join(', ')}]`
        : '';
      add(
        9,
        diagnosticFile,
        `Open Decision ID 전역 중복: ${id} (${occurrences.length}건) → 결정당 canonical 행 1개${locations}`,
      );
    }
  }

  // decision_refs 는 schema 검사 1에 더해 semantic resolution 을 방어적으로 다시 확인한다.
  // ScreenSpec path는 artifact_type 자체가 손상돼 docs 수집에서 빠져도 fail-open 하지 않게 포함한다.
  const decisionRefDocs = new Map(
    docs
      .filter(({ file }) => !absorbedSpecPaths.has(file))
      .map(({ file, fm }) => [file, { file, fm }]),
  );
  for (const spec of liveSpecs) {
    if (Object.prototype.hasOwnProperty.call(spec.frontmatter, 'decision_refs')) {
      decisionRefDocs.set(spec.path, { file: spec.path, fm: spec.frontmatter });
    }
  }
  for (const { file, fm } of decisionRefDocs.values()) {
    if (!Object.prototype.hasOwnProperty.call(fm, 'decision_refs')) continue;
    if (!Array.isArray(fm.decision_refs)) {
      add(9, file, 'decision_refs 는 unique non-empty string 배열이어야 함');
      continue;
    }
    const seenRefs = new Set();
    const validRefs = [];
    fm.decision_refs.forEach((ref, index) => {
      if (typeof ref !== 'string' || ref.trim().length === 0) {
        add(9, file, `decision_refs[${index}] 는 비어 있지 않은 문자열이어야 함`);
        return;
      }
      if (seenRefs.has(ref)) {
        add(9, file, `decision_refs 중복: ${ref} → 같은 ID는 한 번만 선언`);
        return;
      }
      seenRefs.add(ref);
      validRefs.push(ref);
    });
    if (validRefs.length === 0) continue;
    if (!decisionRegister.exists) {
      add(9, file, 'decision_refs 가 있으나 global/open-decisions.md canonical register 가 없음 → register 를 생성하거나 참조를 제거하세요');
      continue;
    }
    if (decisionRegister.structuralErrors.length > 0) {
      add(9, file, `decision_refs 를 해소할 canonical register 구조가 잘못됨: ${decisionRegister.structuralErrors.join(', ')}`);
      continue;
    }
    for (const ref of validRefs) {
      const rows = decisionRegister.index.get(ref) || [];
      if (rows.length === 0) {
        if (localDecisionIds.has(ref)) {
          add(9, file, `decision_refs '${ref}' 는 ScreenSpec-local 결정만 가리킴 → global/open-decisions.md 의 canonical 행만 참조할 수 있음`);
        } else {
          add(9, file, `decision_refs '${ref}' 대상이 global/open-decisions.md 에 없음`);
        }
      } else if (rows.length > 1 || localDecisionIds.has(ref)) {
        add(9, file, `decision_refs '${ref}' canonical 대상이 중복/모호함 → 프로젝트 전역 canonical 행 1개만 유지`);
      } else if (openDecisionRowIsMalformed(rows[0])) {
        add(9, file, `decision_refs '${ref}' 대상 행이 malformed라 해소할 수 없음`);
      }
    }
  }

  const decisionApplications = new Map();
  const addDecisionApplication = (screenId, decisionId, file, kind) => {
    if (
      screenId === undefined ||
      screenId === null ||
      screenId === '' ||
      typeof decisionId !== 'string' ||
      !decisionId
    ) return;
    const key = `${String(screenId)}\0${decisionId}`;
    const rows = decisionApplications.get(key) || [];
    const referrer = `${kind}:${file}`;
    if (!rows.some((row) => row.referrer === referrer)) rows.push({ file, referrer });
    decisionApplications.set(key, rows);
  };
  for (const spec of liveSpecs) {
    if (!Array.isArray(spec.frontmatter.decision_refs)) continue;
    for (const ref of spec.frontmatter.decision_refs) {
      addDecisionApplication(spec.frontmatter.screen_id, ref, spec.path, 'screen');
    }
  }
  for (const record of surfaceRecords) {
    if (!Array.isArray(record.spec.frontmatter.decision_refs)) continue;
    for (const member of record.existing_member_screens) {
      for (const ref of record.spec.frontmatter.decision_refs) {
        addDecisionApplication(member, ref, record.spec.path, 'surface');
      }
    }
  }
  for (const [key, referrers] of [...decisionApplications.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (referrers.length < 2) continue;
    const [screenId, decisionId] = key.split('\0');
    const files = referrers.map((row) => row.file).sort();
    add(
      9,
      files[0],
      `Open Decision ${decisionId} 가 screen ${screenId} 에 여러 referrer 경로로 중복 적용됨 → 첫 slice에서는 screen/surface 중 canonical referrer 하나만 유지 [locations: ${files.map((file) => toPosix(path.relative(docsDir, file))).join(', ')}]`,
    );
  }

  // 10. Copy Keys Status enum (screen-spec.template.md 의 3-state 계약).
  //     confirmed=승인 확정(사람만 승격) · draft=입력제공·미확정(또는 존재가 open decision 에 달림) · tbd=문구 자체 미정.
  //     draft·confirmed 는 copy_keys_has_tbd 를 켜지 않는다 — 오직 tbd 만(spec.mjs deriveMetrics).
  //     (tbd_count 는 Copy Keys 와 무관하게 Unknowns 의 open 행에서 나온다.)
  //     stub(본문 없음)·템플릿 placeholder({…} 키) 행은 검사하지 않는다.
  for (const spec of behaviorSpecs) {
    if (isStub(spec)) continue;
    for (const r of parseCopyKeys(spec.sections['copy keys']).rows) {
      if (r.key.startsWith('{')) continue; // 템플릿 placeholder 행
      if (!COPY_KEYS_STATUS_VALUES.includes(r.status)) {
        add(
          10,
          spec.path,
          `Copy Keys '${r.key || '(no-key)'}': Status 는 ${COPY_KEYS_STATUS_VALUES.join('|')} 여야 함 (현재: ${r.status || '(빈값)'})`,
        );
      }
    }
  }

  // 13. Interaction Matrix v2(structured) 형식 — warning-first (검사 13 자체는 하드 게이트 없음).
  //     Result Type 헤더가 있는 표(v2 모드)만 점검한다 → v1 표는 무발화 = v1 validate 출력 byte-identical.
  //     enum/route 행 Target 부재/비-route 행 라우트 토큰/Result↔Target drift 를 경고로 surface.
  //     route-tree.txt 가 있으면 Result Type=route Target 과 raw route token 을 교차검증한다. 일반 route 는
  //     EXACT 를 유지하고 루트(`/`)만 verified Expo group-directory index token 을 인정한다. 유일 owner를
  //     raw/trailing-slash ScreenSpec이 함께 표현하는 경우도 warning으로 후보를 표면화한다.
  //     route-tree.txt 가 없으면 v2 route Target 존재 시 warning 으로만 알린다(warning-first).
  for (const spec of liveSpecs) {
    for (const issue of interactionMatrixV2Issues(spec, {
      routeTreeRouteSet,
      routeTreeExpoIndexRouteSet,
      screenRouteSet: routeSet,
      routeTreeMissing: !routeTreeExists,
    })) {
      warn(13, spec.path, issue.message);
    }
  }

  // --- 6. do_not_edit 생성물 헤더/마커 무결성 ---
  for (const [name, entry] of Object.entries(manifest.artifacts || {})) {
    if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;
    const generatedPaths = [];
    if (typeof entry.path === 'string' && entry.path) {
      generatedPaths.push({ file: resolveManifestPath(entry.path, { docsDir, projectRoot }), requireHeader: true });
    }
    for (const pattern of manifestOutputs(entry)) {
      for (const file of generatedOutputFiles(pattern, { projectRoot })) {
        generatedPaths.push({ file, requireHeader: false });
      }
    }
    for (const { file, requireHeader } of generatedPaths) {
      if (!exists(file)) continue; // 아직 생성 전이면 건너뜀
      const head = (readFileSafe(file) || '').slice(0, 400);
      if (!requireHeader && !GENERATED_HEADER_HINT_RE.test(head)) continue;
      if (!GENERATED_HEADER_RE.test(head)) {
        add(6, file, `생성물(${name})의 GENERATED 헤더 훼손/부재`);
      }
    }
  }

  // --- 11·12. 입력 결과물 + Reconciliation Register (input-reconciliation.md) ---
  //   입력 결과물은 artifact_type 이 없어 일반 authoring walk 를 안 타므로(검사 1~10 이 통째로 스킵)
  //   inputs/ 를 명시 경로로 한 번만 수집해 검사 11(입력 frontmatter)과 검사 12(register 교차검사)에 공유한다.
  //   inputs/ 가 없으면 collectInputArtifacts 가 빈 배열을 줘 두 검사 모두 NO-OP.
  const inputArtifacts = collectInputArtifacts(path.join(docsDir, 'inputs'));

  // 11. 입력 결과물 frontmatter (정본 입력 스키마). lib 는 절대경로를 주므로 add/warn 으로 상대화한다.
  const inputResult = validateInputArtifacts(inputArtifacts);
  for (const e of inputResult.errors) add(11, e.file, e.message);
  for (const w of inputResult.warnings) warn(11, w.file, w.message);

  // 12. Reconciliation Register. _meta/ 는 일반 walk 에서 제외되므로 이 파일만 콕 집어 읽는다.
  //   register 파일이 없으면 NO-OP(초기/선택적 도입). 검사 11 과 같은 inputArtifacts 로 미처리 교차검사.
  const registerFile = path.join(docsDir, '_meta', 'reconciliation-register.md');
  const register = parseReconciliationRegister(registerFile);
  const registerResult = validateReconciliationRegister({ register, inputArtifacts, registerFile, enforce: !!flags.enforce });
  for (const e of registerResult.errors) add(12, e.file, e.message);
  for (const w of registerResult.warnings) warn(12, w.file, w.message);

  // --- 14. Policy `requires` 구문 검사 (warning-first, 하드 게이트 아님) ---
  //   이미 로드된 policy(라인 위)/policyPath 를 재사용한다 — 재로딩 없음. 손상/부재 정책은 이미 exit 2 로
  //   fail-closed 됐으므로 이 경로는 well-formed 매핑을 전제한다. 각 mode 의 requires 문자열을 파서
  //   단일 출처(policy-condition.mjs, readiness 와 공유)로 검사해 malformed 를 저작 시점에 경고로 surface.
  //   런타임(readiness.mjs)은 malformed 를 fail-closed 로 막지만(#135), 여기서는 저작자가 정책 파일을
  //   저장할 때 바로 알아채게 하는 조기경보다. exit code 불변(경고만) — 하드 승격은 별도 사람 결정.
  for (const [modeName, mode] of Object.entries(policy.modes || {})) {
    // requires 는 리스트여야 한다. 스칼라/매핑으로 잘못 쓰면(`requires: "ci_lint == pass"`) 런타임
    //   readiness 는 문자열을 문자 단위로 순회해 모드를 영구 fail-closed 시키지만, 그 신호가 저작 시점엔
    //   보이지 않는다 — 여기서 명시 경고로 대칭을 맞춘다(리스트 부재/빈 배열은 정상, 무발화).
    if (mode?.requires != null && !Array.isArray(mode.requires)) {
      warn(
        14,
        policyPath,
        `mode '${modeName}' 의 requires 가 리스트(YAML 시퀀스)가 아님: ${JSON.stringify(mode.requires)} ` +
          `→ 해소: '- "fact OP value"' 형태의 리스트로 작성하세요. ` +
          `(런타임 readiness 는 리스트가 아닌 requires 를 fail-closed 로 막습니다)`,
      );
    }
    const requires = Array.isArray(mode?.requires) ? mode.requires : [];
    for (const req of requires) {
      if (isWellFormedRequirement(req)) continue;
      const raw = typeof req === 'string' ? req : JSON.stringify(req);
      warn(
        14,
        policyPath,
        `mode '${modeName}' 의 requires 항목이 'fact OP value'(OP ∈ >= <= == > <) 형식이 아님: ${JSON.stringify(raw)} ` +
          `→ 해소: 단일 '='(→ '=='), '=>'(→ '>='), 연산자/값 없는 bare 토큰을 고치세요. ` +
          `(런타임 readiness 는 이 항목을 fail-closed 로 막습니다)`,
      );
    }
  }

  // --- 결과 출력 ---
  if (flags.json) {
    process.stdout.write(
      JSON.stringify({ ok: errors.length === 0, count: errors.length, errors, warnings }, null, 2) +
        '\n',
    );
  } else {
    if (errors.length === 0) {
      process.stdout.write('workflow:validate — OK (검사 12종 통과)\n');
    } else {
      process.stdout.write(`workflow:validate — ${errors.length} 건 위반\n`);
      for (const e of errors) {
        process.stdout.write(`  [검사 ${e.check}] ${e.file}: ${e.message}\n`);
      }
    }
    for (const w of warnings) {
      process.stdout.write(`  [경고 ${w.check}] ${w.file}: ${w.message}\n`);
    }
  }
  // process.exit() 금지: stdout 이 pipe 면 8KB(macOS pipe buffer) 초과분이 flush 되기 전에
  // 프로세스가 죽어 JSON 이 잘린다 — readiness-eval.mjs 와 같은 flush-safe 자연 종료 계약.
  process.exitCode = errors.length === 0 ? 0 : 1;
}

// 직접 실행될 때만 main()
// runCli: 레이아웃 설정 오류(미정의 role·부재 --layout)를 exit 2 로 surface(stack trace+exit 1 차단).
if (isCliEntry(import.meta.url)) runCli(main, 'validate');
