#!/usr/bin/env node
// readiness.mjs — 화면별 구현 가능 모드 계산 (판정의 단일 출처)
// 입력: _meta/workflow-state.yaml + artifact-manifest.yaml + implementation-mode-policy.yaml + (선택) CI 결과
// 출력: 화면별 readiness_mode / allowed_paths / forbidden_paths / blocking / next_actions
// implement-screen 스킬과 pre-edit-mode-guard 훅은 이 출력을 소비만 한다.
// 참고: frontend-workflow-kit-implementation.md §6, §7
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
} from './lib/util.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';

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
      return 'complete State Matrix (loading/success/empty/error/refreshing)';
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

// "fact OP value" 한 줄을 파싱
function parseCondition(str) {
  const m = /^\s*([a-z0-9_]+)\s*(>=|<=|==|>|<)\s*(.+?)\s*$/i.exec(str);
  if (!m) return null;
  return { key: m[1], op: m[2], rhs: m[3] };
}

function coerceNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// 조건 평가. facts: 화면별 사실 객체.
function evalCondition(cond, facts) {
  const { key, op, rhs } = cond;
  const actual = facts[key];

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
    fake_hook_exists: d.fake_hook_exists,
    figma_mapping_status: d.figma_mapping_status,
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
    if (!cond) continue;
    if (!evalCondition(cond, facts)) failed.push(cond);
  }
  return { pass: failed.length === 0, failed };
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
  // policy.modes 가 객체가 아니면(문자열/숫자 등 손상된 정책) Object.keys 가 가짜 모드를 만들지 않게 막는다.
  const modes = policy.modes && typeof policy.modes === 'object' ? policy.modes : {};
  const order = Array.isArray(policy.order) ? policy.order : Object.keys(modes);
  const global = state.global || {};
  const ciProvided = ci && Object.keys(ci).length > 0;
  const screenSpecTemplate =
    manifest?.artifacts?.['screen-spec']?.template || 'templates/screen/screen-spec.template.md';
  const out = {};

  for (const [id, screen] of Object.entries(state.screens || {})) {
    const facts = buildFacts(screen, global, ci);
    // resolvedLayout 를 screenCtx 에 실어 actionHint 가 hook 힌트 경로를 role 바인딩에서 파생하게 한다(MINOR 4).
    const screenCtx = { domain: screen.domain, facts, screenSpecTemplate, layout: resolvedLayout };

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
    let decisionCapIdx = order.length - 1;
    for (const dec of decisions) {
      const bmIdx = order.indexOf(dec.blocking_mode);
      if (bmIdx <= 0) {
        // bmIdx<0: 정책에 없는 값(오타). bmIdx==0: docs-only(floor)는 막을 수 없음(무의미).
        // 둘 다 해석 불가 → 조용히 무시하지 않고 invalid 로 surface 한다.
        invalidDecisions.push({ id: dec.id, blocking_mode: dec.blocking_mode || '(none)' });
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
        },
      });
      nextActions.push(
        `fix Open Decision ${bad.id || '(no-id)'}: Status must be open|resolved and Blocking Mode must be a policy mode above docs-only`,
      );
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
        if (CI_FACTS.has(cond.key) && !ciProvided) continue;
        if (seen.has(cond.key)) continue;
        seen.add(cond.key);
        const friendly = FRIENDLY[cond.key] || cond.key;
        const current = facts[cond.key];
        blocking.push({ [friendly]: current === null ? 'missing' : current });
        nextActions.push(actionHint(cond.key, screenCtx));
      }
    }

    out[id] = {
      readiness_mode: chosenName,
      next_mode: chosenIdx < order.length - 1 ? order[chosenIdx + 1] : null,
      // 정책 글롭의 {roles.X} 펼침 + per-screen {domain} 치환을 한 번에(§5). 리터럴/blanket
      // 글롭(src/features/**, openapi.yaml 등)은 resolvePaths 가 그대로 통과시킨다.
      allowed_paths: resolvedLayout.resolvePaths(chosen.allowed_paths || [], { domain: screen.domain }),
      forbidden_paths: resolvedLayout.resolvePaths(chosen.forbidden_paths || [], {
        domain: screen.domain,
      }),
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

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
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
    // 값 없는 bare --screen 은 parseArgs 가 boolean true 로 둔다 — 빈 결과로 조용히 오인되지 않게 명확히 막는다.
    if (typeof flags.screen !== 'string' || flags.screen.trim() === '') {
      process.stderr.write('readiness: --screen 에는 화면 ID 값이 필요합니다 (예: --screen COUPON-001)\n');
      process.exit(2);
    }
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(main, 'readiness');
