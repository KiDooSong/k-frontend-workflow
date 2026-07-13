// forbidden-paths-cli.test.mjs — forbidden-paths.mjs CLI 인자 계약(--help / usage 오류 exit 2)과
// "인자 검증은 state/policy/git/diff 작업보다 먼저" 순서 불변식.
//
// 핵심 회귀: allowlist 가 없으면 `--enforc` 오타가 unknown flag 로 조용히 무시돼
// enforcement 가 소실되고 warning-first exit 0 실행으로 fallback 한다(fail-open).
// 이것은 warning-first→hard 승격이 아니다 — 기존 `--enforce` 의미(위반 exit 1)·
// no-enforce warning-first(exit 0)·판정 로직은 전부 무변경이고, usage 오류만 exit 2 로
// 표면화한다(validate-cli/readiness-cli/workflow-state-cli.test.mjs 와 동형).
// live git 은 절대 쓰지 않는다 — committed examples/path-backstop + temp `--diff` 픽스처만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const FIXTURES = path.join(KIT_ROOT, 'examples', 'path-backstop');
const UNCLEARED_DOCS = path.join(FIXTURES, 'docs', 'frontend-workflow');
// 커밋된 guarded src/api write 픽스처(M src/api/coupon.ts + A src/api/newClient.ts).
const API_WRITE_DIFF = path.join(FIXTURES, 'diffs', 'case1-api-write.txt');
const ALLOWED_DIFF = path.join(FIXTURES, 'diffs', 'case2-screen-allowed.txt');
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forbidden-paths-cli-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('--help prints usage to stdout and exits 0 — even in an empty dir without state/policy, without git, without writes', () => {
  withTmpDir((root) => {
    // cwd 를 빈 임시 디렉토리로: 기본 docs 경로에 state 가 없고 git repo 도 아니지만 help 는 성공해야 한다.
    const r = run(['--help'], { cwd: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.match(r.stdout, /workflow:forbidden-paths/);
    assert.match(r.stdout, /Usage:/);
    assert.match(r.stdout, /warning-first/);
    assert.match(r.stdout, /--enforce/);
    assert.match(r.stdout, /--diff/);
    assert.match(r.stdout, /Exit codes:/);
    assert.match(r.stdout, /readiness/);
    // 판정 출력이 아닌 도움말이며, cwd 에 아무것도 만들지 않는다(파일 쓰기 0).
    assert.doesNotMatch(r.stdout, /"violations"/);
    assert.deepEqual(fs.readdirSync(root), [], '--help must not write files');
  });
});

test('unknown flag --enforc is exit 2 with unknown-option on stderr — never a warning-first run', () => {
  const r = run(['--enforc', '--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF, '--json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /forbidden-paths: unknown option --enforc/);
  assert.match(r.stderr, /--help/);
  assert.equal(r.stdout, '', 'typo must not fall back to producing a violations report');
});

test('unknown flag --__proto__ is exit 2 — prototype-setter absorption must not bypass the allowlist', () => {
  // 일반 객체 저장이면 `--__proto__=x` 가 상속 setter 에 흡수돼 Object.keys 에서 사라지고
  // (예: `--help --__proto__=x` 가 help exit 0 으로 통과) 검증을 우회한다 — parseArgs 의
  // null-prototype 저장으로 unknown option 경로에 잡혀야 한다(Codex 리뷰 Minor).
  for (const args of [['--__proto__=x'], ['--help', '--__proto__=x'], ['--__proto__', 'x']]) {
    const r = run(args);
    assert.equal(r.status, 2, `${args.join(' ')} should exit 2`);
    assert.match(r.stderr, /unknown option --__proto__/);
    assert.equal(r.stdout, '', 'must not fall through to help or a normal run');
  }
});

test('unknown flag --jsno is exit 2 — no violations JSON on stdout', () => {
  const r = run(['--jsno', '--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --jsno/);
  assert.equal(r.stdout.includes('violations'), false);
  assert.equal(r.stdout, '');
});

test('enforcement typo regression: --enforc exit 2, correct --enforce exit 1, no flag warning-first exit 0 — typo never degrades to the warning-first fallback', () => {
  // 같은 guarded src/api write 픽스처에 세 형태를 돌려 한 테스트에서 비교 고정한다.
  const base = ['--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF, '--json'];

  const typo = run([...base, '--enforc']);
  assert.equal(typo.status, 2, 'typo must be a usage error, not a permissive run');
  assert.match(typo.stderr, /unknown option --enforc/);
  assert.equal(typo.stdout, '');

  const enforced = run([...base, '--enforce']);
  assert.equal(enforced.status, 1, enforced.stderr);
  const enforcedObj = JSON.parse(enforced.stdout);
  assert.equal(enforcedObj.ok, false);
  assert.equal(enforcedObj.enforced, true);
  assert.equal(enforcedObj.violations.length, 2);

  const warningFirst = run(base);
  assert.equal(warningFirst.status, 0, warningFirst.stderr);
  const warningObj = JSON.parse(warningFirst.stdout);
  assert.equal(warningObj.ok, false);
  assert.equal(warningObj.enforced, false);
  // warning-first 계약: exit 0 이어도 위반 finding 은 그대로 남는다.
  assert.deepEqual(warningObj.violations, enforcedObj.violations);
});

test('usage errors surface before state/policy/diff/git work (argument validation precedes all loads)', () => {
  withTmpDir((root) => {
    // state 도 diff 파일도 없는 빈 cwd: usage 오류가 입력 오류 메시지보다 먼저 이겨야 한다.
    const r = run(['--enforc', '--diff', 'no-such.diff'], { cwd: root });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown option --enforc/);
    assert.doesNotMatch(r.stderr, /workflow-state/, 'usage error must win over the state-load error');
    assert.doesNotMatch(r.stderr, /--diff 파일 없음/, 'usage error must win over the diff-read error');
  });
});

test('value flag without a value (bare or empty --flag=) is a usage error: exit 2', () => {
  for (const flag of ['--docs', '--src', '--root', '--policy', '--manifest', '--layout', '--diff', '--range', '--base']) {
    // 인자 검증이 모든 로드보다 앞서므로 flag 단독 실행으로 충분하다(state/diff 부재와 무관).
    for (const form of [[flag], [`${flag}=`]]) {
      const r = run(form);
      assert.equal(r.status, 2, `${form.join(' ')} should exit 2`);
      assert.match(r.stderr, new RegExp(`${flag} requires a value`));
      assert.equal(r.stdout, '');
    }
  }
});

test('boolean flag with a value is a usage error: exit 2 (=value and absorbed-token forms)', () => {
  const cases = [
    [['--enforce=false', '--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF], /--enforce does not accept a value/],
    [['--json=yes', '--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF], /--json does not accept a value/],
    [['--staged=true', '--docs', UNCLEARED_DOCS], /--staged does not accept a value/],
    // parseArgs 는 boolean flag 뒤의 non-`--` 토큰을 값으로 흡수한다 — 그 형태도 같은 exit 2 경로다.
    [['--staged', 'true', '--docs', UNCLEARED_DOCS], /--staged does not accept a value/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(args);
    assert.equal(r.status, 2, `${args.join(' ')} should exit 2`);
    assert.match(r.stderr, pattern);
    assert.equal(r.stdout, '');
  }
});

test('an invalid boolean occurrence is not hidden by a later valid duplicate and precedes state/diff/git work', () => {
  withTmpDir((root) => {
    const r = run(['--json=false', '--json', '--diff', 'no-such.diff'], { cwd: root });
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /--json does not accept a value/);
    assert.doesNotMatch(r.stderr, /workflow-state|--diff 파일 없음|git/);
  });
});

test('a split-token empty value is not hidden by a later valid duplicate and precedes state/diff/git work', () => {
  withTmpDir((root) => {
    const r = run(['--diff', '', '--diff', 'no-such.diff', '--json'], { cwd: root });
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /--diff requires a value/);
    assert.doesNotMatch(r.stderr, /workflow-state|--diff 파일 없음|git/);
  });
});

test('positional arguments are a usage error: exit 2', () => {
  const r = run(['some-positional', '--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /positional arguments are not supported: some-positional/);
  assert.equal(r.stdout, '');
});

test('existing valid invocations are unchanged: violation identity/surface/reason/would_clear pinned on the committed fixture', () => {
  // 하드닝 전 실측 출력(2026-07-12, examples/path-backstop/case1)을 deepEqual 로 고정 —
  // guarded surface 계산·clearance 판정·JSON shape 의 byte/semantic 호환 회귀 기준.
  const r = run(['--docs', UNCLEARED_DOCS, '--diff', API_WRITE_DIFF, '--json']);
  assert.equal(r.status, 0, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.deepEqual(obj, {
    ok: false,
    enforced: false,
    violations: [
      {
        file: 'src/api/coupon.ts',
        change: 'M (modified)',
        surface: 'src/api/**',
        reason: 'guarded(src/api/**) 인데 프로젝트의 어떤 API-required 화면도 api-integrated-ui 에 도달하지 못함 (현재 API-required 최고 화면 모드: final-fixture-ui; 전체 최고 화면 모드: final-fixture-ui)',
        would_clear: 'api_required:true 화면 하나라도 api-integrated-ui 이상 도달하면 src/api/** 전체가 열린다(프로젝트 단위·§1 한계)',
      },
      {
        file: 'src/api/newClient.ts',
        change: 'A (added)',
        surface: 'src/api/**',
        reason: 'guarded(src/api/**) 인데 프로젝트의 어떤 API-required 화면도 api-integrated-ui 에 도달하지 못함 (현재 API-required 최고 화면 모드: final-fixture-ui; 전체 최고 화면 모드: final-fixture-ui)',
        would_clear: 'api_required:true 화면 하나라도 api-integrated-ui 이상 도달하면 src/api/** 전체가 열린다(프로젝트 단위·§1 한계)',
      },
    ],
    guarded_surface: ['openapi.yaml', 'openapi.yml', 'src/api/**'],
    screen_modes: { 'COUPON-001': 'rough-fixture-ui', 'AUTH-001': 'final-fixture-ui' },
  });
});

test('allowed-only diff stays exit 0 with or without --enforce (no gate promotion)', () => {
  for (const extra of [[], ['--enforce']]) {
    const r = run(['--docs', UNCLEARED_DOCS, '--diff', ALLOWED_DIFF, '--json', ...extra]);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.ok, true);
    assert.deepEqual(obj.violations, []);
  }
});

test('duplicate scalar flags keep last-wins semantics (unchanged in this PR)', () => {
  // 첫 --diff(allowed-only)를 두 번째 --diff(guarded write)가 덮는다 — last-wins 유지 고정.
  const r = run(['--docs', UNCLEARED_DOCS, '--diff', ALLOWED_DIFF, '--diff', API_WRITE_DIFF, '--json']);
  assert.equal(r.status, 0, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.violations.length, 2, 'last --diff must win');
});

test('input errors keep exit 2 after hardening: missing state and malformed diff', () => {
  withTmpDir((root) => {
    // 유효한 flag 구성이지만 state 부재 → 여전히 입력 오류 exit 2 (usage 오류와 같은 fail-closed 범주).
    const missingState = run(['--diff', API_WRITE_DIFF, '--json'], { cwd: root });
    assert.equal(missingState.status, 2);
    assert.match(missingState.stderr, /workflow-state/);

    // 손상된 name-status diff → exit 2 유지(redteam-path-backstop.test.mjs 의 계약과 동일).
    const malformed = path.join(root, 'malformed.diff.txt');
    fs.writeFileSync(malformed, 'D123\tsrc/api/couponClient.ts\n', 'utf8');
    const badDiff = run(['--docs', UNCLEARED_DOCS, '--diff', malformed, '--json']);
    assert.equal(badDiff.status, 2);
    assert.match(badDiff.stderr, /name-status/);
  });
});
