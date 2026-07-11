// validate-cli.test.mjs — validate.mjs CLI 인자 계약(--help / unknown·valueless flag → exit 2).
//
// parseArgs 는 모든 --foo 를 그대로 flags 에 넣을 뿐 거부하지 않으므로, validate 가 자체
// allowlist 로 잡지 않으면 오타(--enforc)가 "--enforce 없는 실행"으로 조용히 진행된다 —
// 프로젝트 원칙 "사용법·입력 오류는 exit 2, 조용한 fail-open 금지"와 충돌(release
// 0.3.0-mvp.1 final-check 관찰 항목). readiness-eval.mjs 의 ALLOWED_FLAGS 선례를 따른다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'validate.mjs');
// 자연 종료 회귀(잔존 핸들 hang)가 유한 실패로 떨어지게 timeout 을 건다.
const SPAWN_TIMEOUT_MS = 30_000;

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
}

test('--help prints usage to stdout and exits 0 without running checks', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /workflow:validate/);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /--enforce/);
  // 검사를 실제로 돌지 않았다 — 결과 라인/위반 카운트가 없어야 한다.
  assert.doesNotMatch(r.stdout, /검사 12종 통과|건 위반/);
});

test('unknown flag (e.g. --enforc typo) is a usage error: exit 2, not a silent run', () => {
  const r = run(['--enforc']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --enforc/);
  assert.match(r.stderr, /--help/);
  assert.equal(r.stdout, '');
});

test('value flag without a value is a usage error: exit 2', () => {
  const r = run(['--docs']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--docs requires a value/);
});

test('boolean flag with a value is a usage error: exit 2', () => {
  const r = run(['--json=yes']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--json does not accept a value/);
});

test('positional arguments are a usage error: exit 2', () => {
  const r = run(['unexpected-positional']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /positional arguments are not supported/);
});

test('every allowlisted flag still runs validate (empty docs → vacuous pass exit 0 with cold-start warning)', () => {
  // allowlist 전수(value 7종 + boolean 2종 — --help 제외)를 한 번에 태워, allowlist 에서
  // 기존 플래그가 빠지는 회귀(정상 호출이 exit 2 usage error 로 변함)를 잡는다.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-cli-'));
  try {
    const docsDir = path.join(root, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const r = run([
      '--root', root,
      '--docs', docsDir,
      '--src', path.join(root, 'src'),
      '--manifest', path.join(KIT_ROOT, 'catalog', 'artifact-manifest.yaml'),
      '--schema', path.join(KIT_ROOT, 'schemas', 'frontmatter.schema.json'),
      '--policy', path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml'),
      '--layout', path.join(KIT_ROOT, 'policies', 'project-layout.yaml'),
      '--enforce',
      '--json',
    ]);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.ok, true);
    assert.equal(obj.count, 0);
    assert.ok(obj.warnings.some((w) => w.check === 'cold-start'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
