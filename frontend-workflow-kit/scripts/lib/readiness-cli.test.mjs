// readiness-cli.test.mjs — readiness.mjs CLI 인자 계약(--help / usage 오류 exit 2)과
// "인자 검증은 state/policy/manifest 로드보다 먼저" 순서 불변식.
//
// allowlist 가 없으면 --screeen 오타가 특정 화면 대신 전체 화면 출력으로, --polciy 오타가
// 기본 policy 판정으로 조용히 fallback 한다 — 판정의 단일 출처가 잘못된 입력을 흡수하는
// fail-open 이라 exit 2 로 표면화해야 한다(validate-cli.test.mjs 와 동형).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, DEFAULTS, loadYaml } from './util.mjs';
import { computeReadiness } from '../readiness.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');
const EXAMPLE_DOCS = path.join(KIT_ROOT, 'examples', 'coupon-feature', 'docs', 'frontend-workflow');
// 자연 종료 회귀(잔존 핸들 hang)가 유한 실패로 떨어지게 timeout 을 건다.
const SPAWN_TIMEOUT_MS = 30_000;

function run(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    ...opts,
  });
}

function withTmpDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-cli-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('--help prints usage to stdout and exits 0 — even without workflow-state.yaml (validation precedes state load)', () => {
  withTmpDir((root) => {
    // cwd 를 빈 디렉토리로: 기본 docs 경로에 state 파일이 없어도 help 는 성공해야 한다.
    const r = run(['--help'], { cwd: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.match(r.stdout, /workflow:readiness/);
    assert.match(r.stdout, /Usage:/);
    assert.match(r.stdout, /--screen/);
    assert.doesNotMatch(r.stdout, /readiness_mode:/);
  });
});

test('unknown flag --screeen (typo of --screen) is exit 2 — no silent full-screen fallback output', () => {
  const r = run(['--screeen', 'COUPON-001', '--docs', EXAMPLE_DOCS]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --screeen/);
  assert.match(r.stderr, /--help/);
  assert.equal(r.stdout, '', 'typo must not fall back to printing every screen');
});

test('unknown flag --polciy (typo of --policy) is exit 2 — no silent default-policy evaluation', () => {
  const r = run(['--polciy', 'custom.yaml', '--docs', EXAMPLE_DOCS]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --polciy/);
  assert.equal(r.stdout, '');
});

test('usage errors surface before the missing-state input error (argument validation precedes loads)', () => {
  withTmpDir((root) => {
    const r = run(['--screeen', 'COUPON-001'], { cwd: root });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown option --screeen/);
    assert.doesNotMatch(r.stderr, /workflow-state\.yaml/, 'usage error must win over the state-load error');
  });
});

test('value flag without a value is a usage error: exit 2', () => {
  for (const flag of ['--screen', '--policy', '--ci', '--layout', '--docs', '--manifest', '--out']) {
    // 인자 검증이 모든 로드보다 앞서므로 flag 단독 실행으로 충분하다(state 부재와 무관).
    const r = run([flag]);
    assert.equal(r.status, 2, `${flag} bare should exit 2`);
    assert.match(r.stderr, new RegExp(`${flag} requires a value`));
  }
});

test('--screen with an empty value is a usage error: exit 2 (single usage path)', () => {
  const r = run(['--screen=', '--docs', EXAMPLE_DOCS]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--screen requires a screen id value/);
  assert.equal(r.stdout, '');
});

test('boolean flag with a value is a usage error: exit 2', () => {
  const r = run(['--json=yes', '--docs', EXAMPLE_DOCS]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--json does not accept a value/);
});

test('positional arguments are a usage error: exit 2', () => {
  const r = run(['unexpected-positional', '--docs', EXAMPLE_DOCS]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /positional arguments are not supported/);
});

test('every allowlisted flag still runs and --json output matches computeReadiness (no judgment change)', () => {
  withTmpDir((root) => {
    const ciFile = path.join(root, 'ci.yaml');
    fs.writeFileSync(ciFile, 'ci_lint: pass\n', 'utf8');
    const outFile = path.join(root, 'readiness-out.yaml');
    const r = run([
      '--docs', EXAMPLE_DOCS,
      '--screen', 'COUPON-001',
      '--policy', DEFAULTS.policy,
      '--manifest', DEFAULTS.manifest,
      '--ci', ciFile,
      '--out', outFile,
      '--layout', path.join(KIT_ROOT, 'policies', 'project-layout.yaml'),
      '--json',
    ]);
    assert.equal(r.status, 0, r.stderr);
    const actual = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(actual), ['COUPON-001']);
    assert.equal(fs.existsSync(outFile), true, '--out should still write the result file');

    // CLI 출력 == 라이브러리 출력 (판정 로직/출력 shape 무변경의 직접 증거 — 재구현 없음).
    const state = loadYaml(path.join(EXAMPLE_DOCS, '_meta', 'workflow-state.yaml'));
    const policy = loadYaml(DEFAULTS.policy);
    const manifest = loadYaml(DEFAULTS.manifest);
    const expected = computeReadiness({ state, policy, ci: { ci_lint: 'pass' }, manifest });
    assert.deepEqual(actual['COUPON-001'], expected['COUPON-001']);
  });
});

test('normal full-output invocation is unchanged: deterministic and covers every example screen', () => {
  const r1 = run(['--docs', EXAMPLE_DOCS, '--json']);
  const r2 = run(['--docs', EXAMPLE_DOCS, '--json']);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r1.stdout, r2.stdout, 'readiness output must stay deterministic byte-for-byte');
  const state = loadYaml(path.join(EXAMPLE_DOCS, '_meta', 'workflow-state.yaml'));
  const policy = loadYaml(DEFAULTS.policy);
  const manifest = loadYaml(DEFAULTS.manifest);
  const expected = computeReadiness({ state, policy, ci: {}, manifest });
  assert.deepEqual(JSON.parse(r1.stdout), expected);
});
