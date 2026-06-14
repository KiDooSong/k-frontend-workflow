#!/usr/bin/env node
// validate.mjs — 검사 12종. exit code 0/1 로 CI 게이트가 된다.
//   출처: 검사 1~8 = impl §8 / 검사 9~12 = open-decisions.md · input-reconciliation.md (아래 각 항목 참조).
//   1. frontmatter ↔ frontmatter.schema.json
//   2. artifact-manifest 기준 필수 frontmatter 누락
//   3. 끊어진 참조 (depends_on 대상 부재, sources 로컬 파일 부재)
//   4. 이동 대상 부재 (Interaction Matrix Result route 가 inventory 에 없음)
//   5. screen_id 중복, route 중복
//   6. do_not_edit 산출물의 GENERATED 헤더/마커 훼손
//   7. confirmed 문서의 승인 메타데이터(approved_by/approved_at) 누락
//   8. API Candidates 가 confirmed 인데 zod 스키마/OpenAPI 부재
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
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
} from './lib/util.mjs';
import { validateSchema } from './lib/schema.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import {
  loadScreenSpec,
  parseApiCandidates,
  interactionResultRoutes,
  parseOpenDecisions,
  parseCopyKeys,
  COPY_KEYS_STATUS_VALUES,
  hasHeader,
  isStub,
} from './lib/spec.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './lib/input-artifact.mjs';
import {
  parseReconciliationRegister,
  validateReconciliationRegister,
} from './lib/reconciliation-register.mjs';
import {
  buildEndpointIndex,
  collectSchemaExports,
  isSchemaUnset,
  normEndpoint,
} from './lib/api-manifest.mjs';

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
    .replace(/\\\{screen\\\}/g, '[^/]+');
  return new RegExp('^' + withVars + '$');
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

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const srcDir = path.resolve(flags.src || DEFAULTS.src);
  const projectRoot = flags.root ? path.resolve(flags.root) : path.dirname(srcDir);
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
    errors.push({ check, file: path.relative(projectRoot, file), message });
  // 경고: exit code 에 영향 없는 약한 권장(현재 resolved→Options 선택값). open-decisions.md 의 "약하게 시작".
  const warnings = [];
  const warn = (check, file, message) =>
    warnings.push({ check, file: path.relative(projectRoot, file), message });

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
  const specs = [];
  for (const p of specPaths) {
    const spec = loadScreenSpec(p);
    specs.push(spec);
    const id = spec.frontmatter.screen_id;
    const route = spec.frontmatter.route;
    if (route) routeSet.add(route);
    if (id) idCount.set(id, (idCount.get(id) || 0) + 1);
    if (route) routeCount.set(route, (routeCount.get(route) || 0) + 1);
  }

  // 5. 중복
  for (const [id, n] of idCount) if (n > 1) add(5, path.join(docsDir, 'domains'), `screen_id 중복: ${id} (${n}건)`);
  for (const [r, n] of routeCount)
    if (n > 1) add(5, path.join(docsDir, 'domains'), `route 중복: ${r} (${n}건)`);

  // 4. Interaction Matrix Result route 가 inventory(route 집합)에 있는지
  for (const spec of specs) {
    const targets = interactionResultRoutes(spec);
    for (const t of targets) {
      if (!routeSet.has(t)) {
        add(4, spec.path, `Interaction Matrix 이동 대상 route 가 화면에 없음: ${t}`);
      }
    }
  }

  // 6b. generated_sections 마커 무결성 (authored screen-spec 의 Entry Points GENERATED:START/END)
  //     stub(frontmatter만)에는 본문이 없으므로 검사 대상이 아니다.
  const screenSpecGenSections =
    (manifest.artifacts || {})['screen-spec']?.generated_sections || [];
  for (const spec of specs) {
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

  // 8. API Candidates(confirmed) ↔ 스키마 매칭 (제안서 옵션 C: api-manifest ## Endpoints 가 canonical).
  //    각 confirmed ScreenSpec 후보의 (Method, Path) → api-manifest endpoint → Linked Schema(zod export) 해소.
  //    - manifest 부재 시: 현행 전역 존재검사(hasZod||hasOpenApi)로 폴백(엄격 모드로 깨지 않음).
  //    - confirmed 0건 화면은 무발화(candidate 전용 화면의 옛 동작·readiness 불변).
  //    - 사실 출처는 zod export 심볼. Source 컬럼 / OpenAPI components.schemas 해소는 범위 밖(known limitation).
  // 검사 8 의 스키마 디렉토리: {roles.api_schema} 바인딩(예: src/api/schemas). role 글롭은
  // 프로젝트-루트 상대이므로 projectRoot 에 resolve 한다(api_client 와 별도 role — §2 주의).
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
  // canonical 출처(api-manifest)에 같은 (Method,Path) 가 서로 다른 Linked Schema/confidence 로 중복 선언되면
  // 매칭이 행 순서에 의존(모순)하므로 에러로 surface 한다(동일 중복 행은 무시).
  for (const c of endpoints ? endpoints.conflicts : []) {
    add(
      8,
      c.file,
      `api-manifest ## Endpoints 의 ${c.key} 가 충돌 중복 선언됨 (Linked Schema '${c.prev.linkedSchema || '(빈값)'}' vs '${c.next.linkedSchema || '(빈값)'}', confidence '${c.prev.confidence || '(빈값)'}' vs '${c.next.confidence || '(빈값)'}') → 해소: (Method,Path) 당 canonical 행 1개만 남기세요.`,
    );
  }
  const schemaExports = collectSchemaExports(schemasDir);
  for (const spec of specs) {
    const confirmed = parseApiCandidates(spec.sections['api candidates']).filter(
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
          `confirmed API ${label} 가 api-manifest ## Endpoints 에 매칭되는 엔드포인트가 없음 → 해소: api/api-manifest.md ## Endpoints 에 ${e.method} ${e.path} 행을 추가하거나 ScreenSpec confidence 를 candidate 로 낮추세요.`,
        );
        continue;
      }
      if (m.confidence !== 'confirmed') {
        add(
          8,
          spec.path,
          `confirmed API ${label} 의 api-manifest 엔드포인트 confidence=${m.confidence || '(빈값)'} 이라 confirmed 아님 → 해소: manifest 행의 confidence 를 confirmed 로 올리거나 ScreenSpec 을 candidate 로 낮추세요.`,
        );
        continue;
      }
      if (isSchemaUnset(m.linkedSchema)) {
        // 컬럼 자체 부재(레거시 형식)와 셀 빈칸/TBD 를 구분 — 전자는 표에서 없는 칸을 찾게 만드는 혼란을 막는다.
        const detail =
          m.hasLinkedSchemaCol === false
            ? `## Endpoints 표에 Linked Schema 컬럼이 없음(레거시 형식) → 해소: api-manifest 를 Method|Path|Confidence|Linked Schema|Source 5컬럼으로 맞추고(templates/api/api-manifest.template.md 참조) Linked Schema 에 실제 zod export 명을 기입하세요.`
            : `Linked Schema 가 비어있음(빈칸/TBD) → 해소: ## Endpoints 행의 Linked Schema 에 실제 export 스키마명을 기입하세요.`;
        add(8, m.file, `confirmed endpoint ${e.method} ${e.path}: ${detail}`);
        continue;
      }
      if (!schemaExports.has(m.linkedSchema)) {
        add(
          8,
          m.file,
          `confirmed endpoint ${e.method} ${e.path} 의 Linked Schema=${m.linkedSchema} 가 src/api/schemas/*.ts export 에서 발견되지 않음 → 해소: 스키마 export 를 추가하거나 Linked Schema 를 올바른 export 이름으로 수정하세요.`,
        );
        continue;
      }
    }
  }

  // 9. Open Decisions 형식 검사 (open-decisions.md "Validate 통합")
  //    표 필수 컬럼 · Status enum(open|resolved) · Blocking Mode 정책 모드 · 전역 ID 중복.
  //    resolved→Options 선택값은 약한 권장이라 경고. (forbidden_paths backstop 은 diff 기반 후속)
  const policyModes =
    (policy.order && policy.order.length ? policy.order : Object.keys(policy.modes || {})) || [];
  const REQUIRED_OD_COLS = ['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'];
  const odIdGlobal = new Map(); // 전역 ID 집계 (화면 간 중복 검사)
  // 정책을 못 읽으면(policyModes 비어있음) Blocking Mode 정책-모드 검사를 건너뛴다 — 전부 무효로 오탐 방지.
  // 단 Open Decisions 가 실제로 있으면 조용히 넘기지 않고 경고로 surface 한다(설정 오류 신호).
  if (policyModes.length === 0 && specs.some((s) => s.sections['open decisions'] !== undefined)) {
    warn(9, path.join(docsDir, 'domains'), '정책을 로드하지 못해 Open Decisions 의 Blocking Mode 정책-모드 검사를 건너뜀 — policy 경로를 확인하세요');
  }
  for (const spec of specs) {
    const section = spec.sections['open decisions'];
    if (section === undefined) continue;
    const od = parseOpenDecisions(section);
    if (!od.table) {
      if (od.sectionHasContent) {
        add(
          9,
          spec.path,
          'Open Decisions 섹션에 내용이 있으나 파싱 가능한 표가 없음 → 해소: 템플릿의 6컬럼 표(| ID | Decision Needed | Options | Blocking Mode | Owner | Status |) 형식을 사용하세요',
        );
      }
      continue;
    }
    const missingCols = REQUIRED_OD_COLS.filter((c) => !hasHeader(od.headers, c));
    if (missingCols.length) {
      add(9, spec.path, `Open Decisions 표 필수 컬럼 누락: ${missingCols.join(', ')}`);
    }
    for (const r of od.rows) {
      const label = r.id || '(no-id)';
      const status = r.status.toLowerCase();
      if (!r.id) {
        add(9, spec.path, `Open Decision 행에 ID 누락 (Decision: ${r.decisionNeeded || '?'}) → 해소: 전역 유일한 D-xxx ID 부여`);
      }
      if (!r.decisionNeeded) {
        add(9, spec.path, `Open Decision ${label}: Decision Needed 누락 (필수) → 해소: 결정해야 하는 질문 작성`);
      }
      if (status !== 'open' && status !== 'resolved') {
        add(9, spec.path, `Open Decision ${label}: Status 는 open|resolved 여야 함 (현재: ${r.status || '(빈값)'})`);
      }
      if (r.blockingMode) {
        if (policyModes.length && !policyModes.includes(r.blockingMode)) {
          add(9, spec.path, `Open Decision ${label}: Blocking Mode '${r.blockingMode}' 가 정책 모드가 아님 → 해소: ${policyModes.join(' / ')} 중 하나`);
        } else if (status === 'open' && policyModes.length && policyModes.indexOf(r.blockingMode) === 0) {
          add(9, spec.path, `Open Decision ${label}: Blocking Mode '${r.blockingMode}' 는 floor(docs-only)라 막을 수 없음 → 해소: 그 위 모드 지정`);
        }
      } else {
        // Blocking Mode 는 전 행 필수 (open-decisions.md 필드표). resolved 도 canonical 행에 유지하며,
        // 재오픈 시 게이트가 즉시 동작하도록 한다.
        add(9, spec.path, `Open Decision ${label}: Blocking Mode 누락 (필수) → 해소: 막을 최소 모드 지정`);
      }
      if (status === 'resolved' && !r.options) {
        warn(9, spec.path, `Open Decision ${label}: resolved 인데 Options 에 선택값 표시 없음 (권장: '→ 선택값')`);
      }
      if (r.id) odIdGlobal.set(r.id, (odIdGlobal.get(r.id) || 0) + 1);
    }
  }
  for (const [id, n] of odIdGlobal) {
    if (n > 1) {
      add(9, path.join(docsDir, 'domains'), `Open Decision ID 전역 중복: ${id} (${n}건) → 결정당 canonical 행 1개`);
    }
  }

  // 10. Copy Keys Status enum (screen-spec.template.md 의 3-state 계약).
  //     confirmed=승인 확정(사람만 승격) · draft=입력제공·미확정(또는 존재가 open decision 에 달림) · tbd=문구 자체 미정.
  //     draft·confirmed 는 copy_keys_has_tbd 를 켜지 않는다 — 오직 tbd 만(spec.mjs deriveMetrics).
  //     (tbd_count 는 Copy Keys 와 무관하게 Unknowns 의 open 행에서 나온다.)
  //     stub(본문 없음)·템플릿 placeholder({…} 키) 행은 검사하지 않는다.
  for (const spec of specs) {
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

  // --- 6. do_not_edit 생성물 헤더/마커 무결성 ---
  for (const [name, entry] of Object.entries(manifest.artifacts || {})) {
    if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;
    // manifest path 는 docs/frontend-workflow/... 기준. docsDir 로 매핑.
    const rel = entry.path.replace(/^docs\/frontend-workflow\//, '');
    const full = path.join(docsDir, rel);
    if (!exists(full)) continue; // 아직 생성 전이면 건너뜀
    const head = (readFileSafe(full) || '').slice(0, 400);
    if (!/GENERATED FILE\s+—\s+DO NOT EDIT/.test(head)) {
      add(6, full, `생성물(${name})의 GENERATED 헤더 훼손/부재`);
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
  process.exit(errors.length === 0 ? 0 : 1);
}

// 직접 실행될 때만 main()
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
