#!/usr/bin/env node
// readiness.mjs — 화면별 구현 가능 모드 계산 (판정의 단일 출처)
// 입력: _meta/workflow-state.yaml + artifact-manifest.yaml + implementation-mode-policy.yaml + (선택) CI 결과
// 출력: 화면별 readiness_mode / allowed_paths / forbidden_paths / blocking / next_actions
// implement-screen 스킬과 pre-edit-mode-guard 훅은 이 출력을 소비만 한다.
// 참고: frontend-workflow-kit-implementation.md §6, §7
import path from 'node:path';
import {
  parseArgs,
  DEFAULTS,
  KIT_ROOT,
  loadYaml,
  loadYamlOrExit,
  statusRank,
  confidenceRank,
  yamlStringify,
  writeFile,
  runCli,
  isCliEntry,
} from './lib/util.mjs';
import { LayoutConfigError, loadLayoutProfile, synthesizeModePolicy } from './lib/layout-profile.mjs';
import { covers } from './lib/path-backstop.mjs';
// "fact OP value" 파싱은 policy-condition.mjs 단일 출처에서 온다 — validate 검사 14 와 규칙을 공유해 표류 방지.
import { parseCondition } from './lib/policy-condition.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';

// fact 키별 스케일 분류
const STATUS_SCALED = new Set([
  'navigation_map_status',
  'screen_spec_status',
  'figma_mapping_status',
]);
const CONFIDENCE_SCALED = new Set(['api_confidence_min']);

// 사람이 읽는 blocking 키와 next_action 힌트
const FRIENDLY = {
  navigation_map_status: 'navigation_map',
  component_catalog_generated: 'component_catalog',
  stub_screen_specs_count: 'stub_screen_specs',
  screen_spec_status: 'screen_spec_status',
  screen_spec_authored: 'screen_spec_authored',
  fake_hook_exists: 'fake_hook',
  figma_mapping_status: 'figma_mapping',
  api_confidence_min: 'api_confidence',
  api_required: 'api_required',
  state_matrix_complete: 'state_matrix',
  interaction_matrix_complete: 'interaction_matrix',
  ci_lint: 'ci_lint',
  ci_schema_validation: 'ci_schema_validation',
  state_coverage_complete: 'state_coverage',
  llm_semantic_review: 'llm_semantic_review',
};

function actionHint(factKey, screen) {
  const d = screen.facts;
  switch (factKey) {
    case 'figma_mapping_status':
      return 'create figma-component-mapping (status >= draft)';
    case 'api_confidence_min': {
      const n = d.tbd_count || 0;
      return n > 0
        ? `confirm API (resolve ${n} open unknown(s))`
        : 'confirm API candidates';
    }
    case 'api_required':
      return 'skip API integration for this no-API-required screen';
    case 'screen_spec_status':
      return 'raise screen-spec status (confirmed requires human approval metadata)';
    case 'screen_spec_authored':
      return `write the ScreenSpec body using ${screen.screenSpecTemplate || 'the screen-spec template'} (stub has frontmatter only)`;
    case 'fake_hook_exists': {
      // hook 힌트 디렉토리를 {roles.hook} 단일 출처에서 파생(MINOR 4) — literal 'src/features/.../hooks' 금지.
      // spec.mjs 의 fake_hook_exists fact 와 같은 role 바인딩이라 힌트 경로가 실제 검사 경로와 일치한다.
      const hookDir = screen.layout
        ? screen.layout.roleToDir('hook', { domain: screen.domain })
        : '';
      const hint = hookDir || `src/features/${screen.domain || '{domain}'}/hooks`;
      return `add fake hook at ${hint}/`;
    }
    case 'component_catalog_generated':
      return 'create docs/frontend-workflow/design/component-catalog.md manually (catalog-gen is MVP-C)';
    case 'state_matrix_complete':
      return 'complete State Matrix (loading/empty/error/success/disabled/refreshing)';
    case 'navigation_map_status':
      return 'raise navigation-map status to draft';
    case 'stub_screen_specs_count':
      return 'create stub screen-specs (frontmatter only)';
    case 'ci_lint':
      return 'pass CI: lint';
    case 'ci_schema_validation':
      return 'pass CI: schema validation';
    case 'state_coverage_complete':
      return 'complete state coverage (stories/tests)';
    case 'llm_semantic_review':
      return 'pass LLM semantic review';
    default:
      return `resolve: ${factKey}`;
  }
}

function invalidOpenDecisionAction(decision) {
  const id = decision.id || '(no-id)';
  switch (decision.code) {
    case 'missing-register':
      return `create global/open-decisions.md with Open Decision ${id}, or remove its decision_refs entry`;
    case 'invalid-register':
      return `fix the canonical Open Decision register structure at ${decision.source?.path || 'global/open-decisions.md'}`;
    case 'unresolved-ref':
      return `add canonical Open Decision ${id} to global/open-decisions.md, or remove its decision_refs entry`;
    case 'ambiguous-ref':
      return `keep exactly one canonical Open Decision row for ${id}`;
    case 'malformed-row':
      return `fix canonical Open Decision ${id}: required fields and Status=open|resolved must be valid`;
    case 'invalid-blocking-mode':
      return `fix Open Decision ${id}: ${decision.reason}`;
    case 'invalid-refs-shape':
    case 'invalid-ref':
    case 'duplicate-ref':
      return `fix decision_refs for Open Decision ${id}: ${decision.reason}`;
    default:
      return `fix Open Decision ${id}: Status must be open|resolved and Blocking Mode must be a policy mode above docs-only`;
  }
}

// "fact OP value" 파싱은 ./lib/policy-condition.mjs 의 parseCondition 로 이전됐다(validate 와 단일 출처).

function coerceNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function noApiSatisfiesConfidenceGate(cond, facts) {
  if (cond.key !== 'api_confidence_min' || facts.api_required !== false) return false;
  if (cond.op === '==') return cond.rhs === 'confirmed';
  if (cond.op === '>=') return confidenceRank('confirmed') >= confidenceRank(cond.rhs);
  return false;
}

// 조건 평가. facts: 화면별 사실 객체.
function evalCondition(cond, facts) {
  const { key, op, rhs } = cond;
  const actual = facts[key];

  if (noApiSatisfiesConfidenceGate(cond, facts)) return true;

  if (op === '==') {
    if (rhs === 'true') return actual === true;
    if (rhs === 'false') return actual === false;
    if (rhs === 'pass') return actual === 'pass';
    // 문자열 동등 (confidence/status 값 등)
    return String(actual) === rhs;
  }

  if (op === '>' || op === '<' || op === '<=') {
    if (STATUS_SCALED.has(key)) {
      const a = statusRank(actual);
      const b = statusRank(rhs);
      return compare(op, a, b);
    }
    if (CONFIDENCE_SCALED.has(key)) {
      const a = confidenceRank(actual);
      const b = confidenceRank(rhs);
      return compare(op, a, b);
    }
    const a = coerceNumber(actual);
    const b = coerceNumber(rhs);
    if (a === null || b === null) return false;
    return compare(op, a, b);
  }

  if (op === '>=') {
    if (STATUS_SCALED.has(key)) return statusRank(actual) >= statusRank(rhs);
    if (CONFIDENCE_SCALED.has(key)) return confidenceRank(actual) >= confidenceRank(rhs);
    const a = coerceNumber(actual);
    const b = coerceNumber(rhs);
    if (a === null || b === null) return false;
    return a >= b;
  }
  return false;
}

function compare(op, a, b) {
  switch (op) {
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
    default:
      return false;
  }
}

// 화면별 사실 객체 구성 (전역 + 화면 + derived + CI)
function buildFacts(screen, global, ci) {
  const d = screen.derived || {};
  const apiRequired = d.api_required !== false;
  const rolePresenceFacts = Object.fromEntries(
    Object.entries(d).filter(([key, value]) => /_present$/.test(key) && typeof value === 'boolean'),
  );
  return {
    // 전역
    stub_screen_specs_count: global.stub_screen_specs_count,
    navigation_map_status: global.navigation_map_status,
    component_catalog_generated: global.component_catalog_generated,
    // 화면
    screen_spec_status: screen.status,
    // 본문이 작성됐는지 (stub = frontmatter 만). full UI 모드의 전제.
    screen_spec_authored: screen.stub !== true,
    // derived
    ...rolePresenceFacts,
    fake_hook_exists: d.fake_hook_exists ?? d.hook_present,
    figma_mapping_status: d.figma_mapping_status,
    api_required: apiRequired,
    api_confidence_min: d.api_confidence_min,
    state_matrix_complete: d.state_matrix_complete,
    interaction_matrix_complete: d.interaction_matrix_complete,
    tbd_count: d.tbd_count,
    // CI (없으면 미충족)
    ci_lint: ci.ci_lint ?? null,
    ci_schema_validation: ci.ci_schema_validation ?? null,
    state_coverage_complete: ci.state_coverage_complete ?? false,
    llm_semantic_review: ci.llm_semantic_review ?? null,
  };
}

function evalMode(mode, facts) {
  const requires = mode.requires || [];
  const failed = [];
  for (const r of requires) {
    const cond = parseCondition(r);
    if (!cond) {
      // fail-closed: 파싱 불가한 요구조건(오타 `ci_lint = pass`·`api_confidence_min => confirmed`·
      // 연산자/값 없는 bare 토큰 등)은 통과가 아니라 실패로 본다. 그냥 skip 하면 게이트가 조용히
      // 사라진다. malformed Open Decision 을 docs-only 로 고정하는 것과 대칭 — live gate 인
      // readiness 가 보수적으로 막고, 어느 정책 줄이 깨졌는지 blocker/next_action 으로 surface 한다.
      failed.push({ malformed: true, raw: typeof r === 'string' ? r : String(r) });
      continue;
    }
    if (!evalCondition(cond, facts)) failed.push(cond);
  }
  return { pass: failed.length === 0, failed };
}

function uniquePaths(paths) {
  const out = [];
  const seen = new Set();
  for (const pathEntry of paths || []) {
    if (seen.has(pathEntry)) continue;
    seen.add(pathEntry);
    out.push(pathEntry);
  }
  return out;
}

function pathTouchesAnySurface(pathEntry, surfaces) {
  return surfaces.some((surface) => covers(pathEntry, surface) || covers(surface, pathEntry));
}

function removeApiSurfaces(paths, apiSurfaces) {
  return (paths || []).filter((pathEntry) => !pathTouchesAnySurface(pathEntry, apiSurfaces));
}

function removeTouchedSurfaces(paths, surfaces) {
  if (!Array.isArray(surfaces) || surfaces.length === 0) return paths || [];
  return (paths || []).filter((pathEntry) => !pathTouchesAnySurface(pathEntry, surfaces));
}

function isUndefinedApiClientRoleError(err) {
  if (!(err instanceof LayoutConfigError)) return false;
  const message = String(err.message || '');
  return /\bapi_client\b/.test(message) && (/정의되지 않은 role/.test(message) || /undefined role/i.test(message));
}

function optionalApiClientSurfaces(layout, domain) {
  try {
    return uniquePaths(layout.resolvePaths(['{roles.api_client}'], { domain }));
  } catch (err) {
    if (isUndefinedApiClientRoleError(err)) return [];
    throw err;
  }
}

function cumulativeNonApiAllowedPaths({ modes, order, chosenIdx, layout, domain, apiSurfaces }) {
  const paths = [];
  for (let i = 1; i <= chosenIdx; i++) {
    const mode = modes[order[i]];
    if (!mode) continue;
    paths.push(...layout.resolvePaths(mode.allowed_paths || [], { domain }));
  }
  return removeApiSurfaces(uniquePaths(paths), apiSurfaces);
}

function limitNoApiEditSurfaces({ allowedPaths, forbiddenPaths, modes, order, chosenIdx, layout, domain }) {
  const apiSurfaces = optionalApiClientSurfaces(layout, domain);
  if (apiSurfaces.length === 0) return { allowedPaths, forbiddenPaths };

  const allowedTouchedApiSurface = allowedPaths.some((pathEntry) => pathTouchesAnySurface(pathEntry, apiSurfaces));
  const limitedAllowed = removeApiSurfaces(allowedPaths, apiSurfaces);
  const fallbackAllowed = allowedTouchedApiSurface
    ? cumulativeNonApiAllowedPaths({ modes, order, chosenIdx, layout, domain, apiSurfaces })
    : [];
  const limitedForbidden = removeTouchedSurfaces(forbiddenPaths, fallbackAllowed);

  return {
    allowedPaths: uniquePaths([...limitedAllowed, ...fallbackAllowed]),
    forbiddenPaths: uniquePaths([...limitedForbidden, ...apiSurfaces]),
  };
}

// CI 결과가 입력되지 않으면 로컬에서 알 수 없는 게이트라 blocking 에서 제외한다.
const CI_FACTS = new Set([
  'ci_lint',
  'ci_schema_validation',
  'llm_semantic_review',
  'state_coverage_complete',
]);

export function computeReadiness({ state, policy, ci, manifest, layout }) {
  // 레이아웃 프로파일(tier1): 정책의 {roles.X} 토큰을 물리 글롭으로 펼치는 단일 출처.
  //   호출부가 주입하지 않으면 기본 프로파일(expo-feature 프리셋)을 로드 — 토큰화 이전과
  //   BYTE-동치를 보장한다(README §1.1: 경로 fact 의 단일 resolvedLayout). substituteDomain 의
  //   per-screen {domain} 치환은 resolvePaths(p,{domain}) 안에 흡수된다(§5 the seam).
  const resolvedLayout = layout || loadLayoutProfile({ kitRoot: KIT_ROOT });
  const policyCache = new Map();
  function effectivePolicyFor(domain) {
    if (!resolvedLayout.layerTelemetryDeclared) return policy;
    const key = domain == null ? '\0' : String(domain);
    if (!policyCache.has(key)) {
      policyCache.set(key, synthesizeModePolicy(policy, resolvedLayout, { includeGates: false, domain }));
    }
    return policyCache.get(key);
  }
  const global = state.global || {};
  const ciProvided = ci && Object.keys(ci).length > 0;
  const screenSpecTemplate =
    manifest?.artifacts?.['screen-spec']?.template || 'templates/screen/screen-spec.template.md';
  const out = {};

  for (const [id, screen] of Object.entries(state.screens || {})) {
    const facts = buildFacts(screen, global, ci);
    // resolvedLayout 를 screenCtx 에 실어 actionHint 가 hook 힌트 경로를 role 바인딩에서 파생하게 한다(MINOR 4).
    const screenCtx = { domain: screen.domain, facts, screenSpecTemplate, layout: resolvedLayout };
    const effectivePolicy = effectivePolicyFor(screen.domain);
    // policy.modes 가 객체가 아니면(문자열/숫자 등 손상된 정책) Object.keys 가 가짜 모드를 만들지 않게 막는다.
    const modes = effectivePolicy.modes && typeof effectivePolicy.modes === 'object' ? effectivePolicy.modes : {};
    const order = Array.isArray(effectivePolicy.order) ? effectivePolicy.order : Object.keys(modes);

    // 모드 사다리는 누적이다: 한 모드를 충족하려면 아래 모든 모드도 충족해야 한다.
    // 따라서 바닥(docs-only)부터 올라가며 연속으로 충족되는 가장 높은 모드를 고른다.
    // (높은 모드가 낮은 모드의 전제를 건너뛰지 못하게 — Core §7 사다리)
    // 이것이 fact_mode: open decision 을 무시하고 사실만으로 도달 가능한 최고 모드.
    let factIdx = 0; // docs-only 가 floor
    for (let i = 0; i < order.length; i++) {
      const mode = modes[order[i]];
      if (!mode) break;
      if (evalMode(mode, facts).pass) factIdx = i;
      else break;
    }

    // decision_cap: 열린 open decision 의 가장 낮은 Blocking Mode 바로 아래 모드.
    // readiness_mode = min(fact_mode, decision_cap) 로 다운그레이드한다 (open-decisions.md).
    const decisions = (screen.derived && screen.derived.blocking_decisions) || [];
    const invalidDecisions = [...((screen.derived && screen.derived.malformed_decisions) || [])];
    const decisionRefs = (screen.derived && screen.derived.decision_refs) || [];
    for (const ref of decisionRefs) {
      if (ref.status !== 'resolved' || order.includes(ref.blocking_mode)) continue;
      invalidDecisions.push({
        id: ref.id,
        status: ref.status,
        blocking_mode: ref.blocking_mode || '(none)',
        ...(ref.source ? { source: ref.source } : {}),
        code: 'invalid-blocking-mode',
        reason: `Blocking Mode '${ref.blocking_mode}' is not present in the effective policy`,
      });
    }
    let decisionCapIdx = order.length - 1;
    for (const dec of decisions) {
      const bmIdx = order.indexOf(dec.blocking_mode);
      if (bmIdx <= 0) {
        // bmIdx<0: 정책에 없는 값(오타). bmIdx==0: docs-only(floor)는 막을 수 없음(무의미).
        // 둘 다 해석 불가 → 조용히 무시하지 않고 invalid 로 surface 한다.
        invalidDecisions.push({
          id: dec.id,
          blocking_mode: dec.blocking_mode || '(none)',
          ...(dec.source ? { source: dec.source } : {}),
        });
        continue;
      }
      decisionCapIdx = Math.min(decisionCapIdx, bmIdx - 1);
    }
    // fail-closed: 해석 불가한 Open Decision 이 하나라도 있으면 docs-only 로 고정한다.
    // (validate 형식검사가 후속이라 live gate 인 readiness 가 보수적으로 막는다)
    if (invalidDecisions.length > 0) decisionCapIdx = 0;

    const chosenIdx = Math.max(0, Math.min(factIdx, decisionCapIdx));
    const chosenName = order[chosenIdx];
    const chosen = modes[chosenName] || { allowed_paths: [], forbidden_paths: [] };

    // blocking: 상위 모드들의 미충족 조건을 모아 진행 경로 전체의 막힘을 보여준다.
    // (CI 결과 미입력 시 production-ready 의 CI 게이트는 로컬에서 알 수 없으므로 제외)
    const blocking = [];
    const nextActions = [];
    const seen = new Set();

    // (0) invalid open decision: 해석 불가한 행. 고치기 전엔 docs-only 로 막힌다.
    for (const bad of invalidDecisions) {
      blocking.push({
        invalid_open_decision: {
          id: bad.id || '(no-id)',
          blocking_mode: bad.blocking_mode || '(none)',
          ...(bad.code && bad.status && bad.status !== '(none)' ? { status: bad.status } : {}),
          ...(bad.code ? { code: bad.code } : {}),
          ...(bad.reason ? { reason: bad.reason } : {}),
          ...(bad.source ? { source: bad.source } : {}),
        },
      });
      nextActions.push(invalidOpenDecisionAction(bad));
    }

    // (1) open decision blocker: chosen 위를 막는 결정. 사람이 resolve 해야 풀린다.
    for (const dec of decisions) {
      const bmIdx = order.indexOf(dec.blocking_mode);
      if (bmIdx < 0 || bmIdx <= chosenIdx) continue; // 잘못된 모드/이하 차단은 제외
      blocking.push({
        open_decision: {
          id: dec.id,
          blocking_mode: dec.blocking_mode,
          owner: dec.owner || null,
          ...(dec.source ? { source: dec.source } : {}),
        },
      });
      const q = dec.decision_needed ? `: ${dec.decision_needed}` : '';
      nextActions.push(`resolve decision ${dec.id}${q}`);
    }

    // (2) fact blocker: fact_mode 위 모드들의 미충족 조건.
    // (chosen..fact_mode 사이 모드는 사실은 통과하므로 decision 만 막는다)
    for (let i = factIdx + 1; i < order.length; i++) {
      const mode = modes[order[i]];
      if (!mode) continue;
      const { failed } = evalMode(mode, facts);
      for (const cond of failed) {
        // malformed 요구조건: fact 키가 없어 FRIENDLY/actionHint 를 태울 수 없다. 어느 모드의
        // 어떤 정책 줄이 깨졌는지 그대로 surface 해 저작자가 고치게 한다(fail-closed 의 이유 표시).
        if (cond.malformed) {
          const dedupKey = `malformed:${cond.raw}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          blocking.push({ invalid_policy_requirement: { requirement: cond.raw, mode: order[i] } });
          nextActions.push(
            `fix malformed policy requirement in mode ${order[i]}: "${cond.raw}" ` +
              `(expected "fact OP value", OP one of >= <= == > <)`,
          );
          continue;
        }
        if (CI_FACTS.has(cond.key) && !ciProvided) continue;
        if (cond.key === 'api_confidence_min' && facts.api_required === false) continue;
        if (seen.has(cond.key)) continue;
        seen.add(cond.key);
        const friendly = FRIENDLY[cond.key] || cond.key;
        const current = facts[cond.key];
        blocking.push({ [friendly]: current === null ? 'missing' : current });
        nextActions.push(actionHint(cond.key, screenCtx));
      }
    }

    let allowedPaths = uniquePaths(resolvedLayout.resolvePaths(chosen.allowed_paths || [], { domain: screen.domain }));
    let forbiddenPaths = uniquePaths(resolvedLayout.resolvePaths(chosen.forbidden_paths || [], {
      domain: screen.domain,
    }));
    if (facts.api_required === false) {
      ({ allowedPaths, forbiddenPaths } = limitNoApiEditSurfaces({
        allowedPaths,
        forbiddenPaths,
        modes,
        order,
        chosenIdx,
        layout: resolvedLayout,
        domain: screen.domain,
      }));
    }

    out[id] = {
      readiness_mode: chosenName,
      next_mode: chosenIdx < order.length - 1 ? order[chosenIdx + 1] : null,
      // 정책 글롭의 {roles.X} 펼침 + per-screen {domain} 치환을 한 번에(§5). 리터럴/blanket
      // 글롭(src/features/**, openapi.yaml 등)은 resolvePaths 가 그대로 통과시킨다.
      allowed_paths: allowedPaths,
      forbidden_paths: forbiddenPaths,
      ...(facts.api_required === false ? { api_required: false } : {}),
      blocking,
      next_actions: nextActions,
    };
  }
  return out;
}

function loadCi(flags) {
  if (!flags.ci) return {};
  const data = loadYamlOrExit(path.resolve(flags.ci), 'CI', 'readiness');
  return data || {};
}

function helpText() {
  return `workflow:readiness - 화면별 구현 가능 모드 계산 (판정의 단일 출처)

Usage:
  node scripts/readiness.mjs [--docs <dir>] [--screen <SCREEN_ID>] [--policy <file>]
                             [--manifest <file>] [--ci <file>] [--out <file>]
                             [--layout <file>] [--json] [--help]

Options:
  --docs <dir>      authoring 문서 루트(<docs>/_meta/workflow-state.yaml 을 읽음). 기본: ${DEFAULTS.docs}
  --screen <id>     특정 화면 하나만 출력 (예: --screen COUPON-001)
  --policy <file>   정책 경로. 기본: 킷 policies/implementation-mode-policy.yaml
  --manifest <file> artifact manifest 경로. 기본: 킷 catalog/artifact-manifest.yaml
  --ci <file>       CI 결과 YAML (없으면 CI 게이트는 blocking 에서 제외)
  --out <file>      결과 YAML 을 파일로도 기록
  --layout <file>   project-layout.yaml 경로 오버라이드
  --json            YAML 대신 결정적 JSON 을 stdout 으로 출력
  --help            이 도움말 출력

Behavior:
  usage 오류(unknown option·값 없는 value flag·값 붙은 boolean flag·positional)는
  state/policy/manifest 를 읽기 전에 exit 2 — 오타(--screeen·--polciy)가 전체 화면 출력이나
  기본 policy 판정으로 조용히 fallback 하는 fail-open 을 금지한다.
`;
}

// parseArgs 는 모든 --foo 를 그대로 flags 에 넣으므로(거부 없음) CLI 별 allowlist 로 오타를 잡는다.
// 예: --screeen 오타가 "전체 화면 출력", --polciy 오타가 "기본 policy 판정"으로 조용히
// 진행되는 것을 막는다(exit 2). validate.mjs(PR #175)와 같은 계약.
const VALUE_FLAGS = new Set(['docs', 'policy', 'manifest', 'ci', 'screen', 'out', 'layout']);
const BOOLEAN_FLAGS = new Set(['json', 'help']);

function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);
  // 인자 검증은 state/policy/manifest/layout 로드보다 먼저 — usage 오류에서 판정·파일 쓰기 0.
  const usageError = enforceCliFlagContract({
    argv,
    flags,
    positionals,
    valueFlags: VALUE_FLAGS,
    booleanFlags: BOOLEAN_FLAGS,
    tool: 'readiness',
    helpCommand: 'node scripts/readiness.mjs',
  });
  if (flags.help) {
    process.stdout.write(helpText());
    return; // help 는 자연 종료 exit 0 (cli-stdout-flush 계약 — process.exit(0) 금지)
  }
  // 공백뿐인 --screen 값(--screen " ")은 allowlist(비어있지 않은 문자열)는 통과하지만 화면 ID 가
  // 될 수 없다. 예전의 bare --screen 방어와 같은 단일 usage 경로(exit 2)로 여기서 막는다 —
  // 아래 필터가 빈 결과 {} 로 조용히 오인되지 않게. (bare/빈 --screen= 은 helper 가 이미 거부.)
  if (typeof flags.screen === 'string' && flags.screen.trim() === '') {
    usageError('--screen requires a screen id value (e.g. --screen COUPON-001)');
  }
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const policyPath = path.resolve(flags.policy || DEFAULTS.policy);
  const statePath = path.join(docsDir, '_meta', 'workflow-state.yaml');

  const state = loadYamlOrExit(statePath, 'workflow-state', 'readiness');
  if (!state) {
    process.stderr.write(
      `readiness: ${path.relative(process.cwd(), statePath)} 없음. 먼저 \`npm run workflow:state\` 실행.\n`,
    );
    process.exit(2);
  }
  const policy = loadYamlOrExit(policyPath, 'policy', 'readiness');
  if (!policy) {
    process.stderr.write(`readiness: 정책 파일 없음: ${policyPath}\n`);
    process.exit(2);
  }
  // 매니페스트는 §6 입력 계약상의 입력. 게이트 판정은 정책이 단일 출처이고(불변식 #1),
  // 매니페스트는 next_actions 의 템플릿 경로 등 부가 정보로만 쓴다 (판정 중복 금지).
  const manifest = loadYamlOrExit(path.resolve(flags.manifest || DEFAULTS.manifest), 'manifest', 'readiness') || {};
  const ci = loadCi(flags);
  // 레이아웃 프로파일(tier1): role→glob 단일 출처. --layout 으로 project-layout.yaml 경로 오버라이드.
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });

  let result = computeReadiness({ state, policy, ci, manifest, layout });

  if (flags.screen !== undefined) {
    // bare/빈 --screen 은 main 진입부의 인자 계약 검증에서 이미 exit 2 — 여기는 유효한 문자열만 온다.
    result = result[flags.screen] ? { [flags.screen]: result[flags.screen] } : {};
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(yamlStringify(result, { lineWidth: 0 }));
  }

  if (flags.out) {
    writeFile(path.resolve(flags.out), yamlStringify(result, { lineWidth: 0 }));
  }
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — computeReadiness 를 테스트/훅에서 재사용 가능)
// runCli: 레이아웃 설정 오류(미정의 role·부재 --layout)를 exit 2 로 surface(stack trace+exit 1 차단).
if (isCliEntry(import.meta.url)) runCli(main, 'readiness');
