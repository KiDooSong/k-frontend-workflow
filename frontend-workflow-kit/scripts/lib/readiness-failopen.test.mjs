// readiness-failopen.test.mjs — 회귀: malformed policy `requires` 는 fail-open 이 아니라 fail-closed 여야 한다.
//   버그(issue #133): parseCondition 이 파싱 불가한 요구조건에 null 을 주고 evalMode 가 그걸 skip 하면
//   그 모드의 게이트가 조용히 사라져(fail-open) 화면이 사다리를 올라갔다.
//   기대: malformed 요구조건이 있는 모드는 통과하지 못하고(capped), 어느 정책 줄이 깨졌는지
//         blocking `invalid_policy_requirement` + next_action 으로 surface 된다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReadiness } from '../readiness.mjs';

// {roles.X} 펼침 없이 경로를 그대로 통과시키는 최소 레이아웃 스텁.
const stubLayout = {
  layerTelemetryDeclared: false,
  resolvePaths: (paths) => (Array.isArray(paths) ? [...paths] : []),
};

function policyWithFinalRequires(finalRequires) {
  return {
    order: ['docs-only', 'rough-fixture-ui', 'final-fixture-ui'],
    modes: {
      'docs-only': { requires: [], allowed_paths: ['docs/**'], forbidden_paths: [] },
      'rough-fixture-ui': {
        requires: ['screen_spec_authored == true'],
        allowed_paths: ['src/rough/**'],
        forbidden_paths: [],
      },
      'final-fixture-ui': {
        requires: finalRequires,
        allowed_paths: ['src/final/**'],
        forbidden_paths: [],
      },
    },
  };
}

// rough-fixture-ui 는 사실로 충족되고(screen_spec_authored=true), final 진입만 남은 상태.
function stateAuthored(derived = {}) {
  return {
    global: {},
    screens: {
      S1: { domain: 'auth', status: 'authored', stub: false, derived },
    },
  };
}

function run(policy, { ci = {}, derived = {} } = {}) {
  const out = computeReadiness({
    state: stateAuthored(derived),
    policy,
    ci,
    manifest: {},
    layout: stubLayout,
  });
  return out.S1;
}

test('malformed requires (bare token) 는 final 모드를 통과시키지 않는다 — fail-closed', () => {
  const r = run(policyWithFinalRequires(['state_matrix_complete'])); // 연산자/값 없는 bare 토큰
  assert.equal(r.readiness_mode, 'rough-fixture-ui', 'malformed 요구조건 모드로 올라가면 안 됨');
  const invalid = r.blocking.find((b) => b.invalid_policy_requirement);
  assert.ok(invalid, 'invalid_policy_requirement blocker 가 surface 돼야 함');
  assert.equal(invalid.invalid_policy_requirement.requirement, 'state_matrix_complete');
  assert.equal(invalid.invalid_policy_requirement.mode, 'final-fixture-ui');
  assert.ok(
    r.next_actions.some((a) => a.includes('malformed policy requirement') && a.includes('state_matrix_complete')),
    'next_action 이 깨진 정책 줄을 안내해야 함',
  );
});

test('malformed requires (single `=`) 도 fail-closed', () => {
  const r = run(policyWithFinalRequires(['screen_spec_status = authored'])); // == 여야 하는데 =
  assert.equal(r.readiness_mode, 'rough-fixture-ui');
  assert.ok(r.blocking.some((b) => b.invalid_policy_requirement?.requirement === 'screen_spec_status = authored'));
});

test('malformed requires (값 누락 `>=`) 도 fail-closed — 백트래킹으로 > "=" 되어 조용히 통과하면 안 됨', () => {
  // 회귀: 예전 파서는 `screen_spec_status >=` 를 {op:">", rhs:"="} 로 파싱해 status > rank("=")=0 →
  //   authored 화면마다 항상 통과시켜 게이트를 조용히 없앴다. 이제 malformed 로 fail-closed 여야 한다.
  const r = run(policyWithFinalRequires(['screen_spec_status >=']));
  assert.equal(r.readiness_mode, 'rough-fixture-ui', '값 누락 요구조건 모드로 올라가면 안 됨');
  assert.ok(r.blocking.some((b) => b.invalid_policy_requirement?.requirement === 'screen_spec_status >='));
});

test('malformed CI requires 는 ciProvided=false 여도 CI-skip 뒤에 숨지 않는다', () => {
  // ci_lint 는 CI_FACTS 라 well-formed 였다면 ci 미입력 시 blocking 에서 제외되지만,
  // malformed 는 그보다 먼저 surface 돼야 하고 게이트도 살아 있어야 한다.
  const r = run(policyWithFinalRequires(['ci_lint = pass']), { ci: {} });
  assert.equal(r.readiness_mode, 'rough-fixture-ui', 'malformed CI 요구조건도 게이트를 무너뜨리면 안 됨');
  assert.ok(r.blocking.some((b) => b.invalid_policy_requirement?.requirement === 'ci_lint = pass'));
});

test('한 모드의 여러 malformed 요구조건이 각각 surface 되고 중복 raw 는 dedupe', () => {
  const r = run(policyWithFinalRequires(['state_matrix_complete', 'foo bar baz', 'state_matrix_complete']));
  const raws = r.blocking
    .filter((b) => b.invalid_policy_requirement)
    .map((b) => b.invalid_policy_requirement.requirement);
  assert.deepEqual([...raws].sort(), ['foo bar baz', 'state_matrix_complete']);
});

test('control: well-formed requires 는 정상적으로 모드를 열어준다 (over-block 회귀 방지)', () => {
  const r = run(policyWithFinalRequires(['state_matrix_complete == true']), {
    derived: { state_matrix_complete: true },
  });
  assert.equal(r.readiness_mode, 'final-fixture-ui', 'well-formed 요구조건 충족 시 final 도달해야 함');
  assert.equal(
    r.blocking.some((b) => b.invalid_policy_requirement),
    false,
    'well-formed 요구조건에는 invalid_policy_requirement 가 없어야 함',
  );
});

test('well-formed requires 미충족은 기존 fact blocker 경로 그대로 (invalid 아님)', () => {
  const r = run(policyWithFinalRequires(['state_matrix_complete == true']), {
    derived: { state_matrix_complete: false },
  });
  assert.equal(r.readiness_mode, 'rough-fixture-ui');
  assert.equal(r.blocking.some((b) => b.invalid_policy_requirement), false);
  // 친화 키(state_matrix_complete 등)로 표시되는 일반 fact blocker 는 존재
  assert.ok(r.blocking.length > 0, '미충족 fact blocker 는 남아 있어야 함');
});
