// cli-stdout-flush.test.mjs — macOS pipe-buffer stdout truncation 회귀 방지.
//
// 실측 사고(PR #170): readiness-eval 이 8,326B JSON 을 process.stdout.write() 한 직후
// process.exit(0) 을 호출하면, stdout 이 pipe 이고 pipe buffer 가 8KB 인 macOS 에서
// 초과분이 flush 되기 전에 프로세스가 죽어 JSON 이 잘렸다(Linux 64KB·Windows 에선 미발현).
// 수정 계약: 성공 경로는 process.exit() 대신 자연 종료(process.exitCode)로 통일한다 —
// 자연 종료가 pending write 를 flush 한다. usage/입력 오류의 exit 2 는 그대로다.
//
// 이 파일은 그 계약을 두 층으로 고정한다.
//   1) 소스 계약: scripts/*.mjs(최상위 CLI 전수)에 process.exit(0) 이 없다.
//   2) 행동 계약: 8KB 를 훌쩍 넘는 JSON 을 pipe 로 받아 완전한 JSON.parse 가 된다
//      (macOS 에서 pre-fix 코드는 여기서 잘린 JSON 으로 실패한다 — 회귀 테스트).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

const SCRIPTS_DIR = path.join(KIT_ROOT, 'scripts');
const PIPE_LIMIT = 8 * 1024; // macOS 기본 pipe buffer
// 자연 종료 회귀(이벤트 루프 잔존 핸들로 프로세스가 안 끝나는 케이스)가 무한 hang 이 아니라
// 유한 실패로 떨어지게 spawnSync 에 timeout 을 건다.
const SPAWN_TIMEOUT_MS = 30_000;

function withTmpRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-flush-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('source contract: top-level CLI scripts only process.exit(1|2|code) — no exit(0), no dynamic exit', () => {
  // 허용 인자: 리터럴 1(사전 가드) · 2(usage/설정 오류, stderr 전용) · code(fail(message, code = 2)
  // stderr 전용 헬퍼 관례 — pack/upgrade-vendored-kit). 그 외 전부 위반:
  //   - process.exit(0): 성공 경로는 process.exitCode 자연 종료여야 한다.
  //   - 동적 인자(process.exit(summary.exit_code), process.exit(fatal === 0 ? 0 : 1) 등):
  //     0 으로 평가될 수 있어 같은 truncation 클래스의 재유입 경로다.
  const ALLOWED_ARGS = new Set(['1', '2', 'code']);
  const offenders = [];
  for (const file of fs.readdirSync(SCRIPTS_DIR)) {
    if (!file.endsWith('.mjs')) continue;
    const src = fs
      .readFileSync(path.join(SCRIPTS_DIR, file), 'utf8')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '')) // 주석 속 언급은 제외
      .join('\n');
    const re = /process\.exit\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src))) {
      if (ALLOWED_ARGS.has(m[1].trim())) continue;
      offenders.push(`${file}:${src.slice(0, m.index).split('\n').length} process.exit(${m[1].trim()})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `성공 가능 경로는 process.exitCode 로 자연 종료해야 한다(macOS 8KB pipe truncation): ${offenders.join(', ')}`,
  );
});

test('doc-drift --json > 8KB pipes complete parseable JSON (macOS truncation regression)', () => {
  withTmpRoot((root) => {
    // 깨진 상대 링크 200개 → finding 200건 → 8KB 를 확실히 넘는 JSON.
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(`[m${i}](./missing-${i}.md)`);
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'foo.md'), lines.join('\n') + '\n', 'utf8');

    const r = spawnSync(
      process.execPath,
      [path.join(SCRIPTS_DIR, 'doc-drift.mjs'), '--root', root, '--json'],
      { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
    );
    assert.equal(r.status, 0, r.stderr);
    const bytes = Buffer.byteLength(r.stdout, 'utf8');
    assert.ok(bytes > PIPE_LIMIT, `expected >${PIPE_LIMIT}B piped stdout, got ${bytes}B`);
    const obj = JSON.parse(r.stdout); // pre-fix macOS: 잘린 JSON → 여기서 실패
    assert.equal(obj.warning_count, 200);
    assert.equal(obj.findings.length, 200);
  });
});

test('validate --json > 8KB of errors pipes complete JSON and exits 1', () => {
  withTmpRoot((root) => {
    // frontmatter YAML 파싱 실패는 문서당 검사 1 에러 — 대량 생성으로 8KB 초과 오류 JSON 을 만든다.
    const docsDir = path.join(root, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    for (let i = 0; i < 120; i++) {
      fs.writeFileSync(
        path.join(docsDir, `broken-${i}.md`),
        '---\nfoo: [broken\n---\n\nbody\n',
        'utf8',
      );
    }

    const r = spawnSync(
      process.execPath,
      [
        path.join(SCRIPTS_DIR, 'validate.mjs'),
        '--docs', docsDir,
        '--src', path.join(root, 'src'),
        '--json',
      ],
      { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
    );
    assert.equal(r.status, 1, r.stderr);
    const bytes = Buffer.byteLength(r.stdout, 'utf8');
    assert.ok(bytes > PIPE_LIMIT, `expected >${PIPE_LIMIT}B piped stdout, got ${bytes}B`);
    const obj = JSON.parse(r.stdout); // pre-fix macOS: 잘린 JSON → 여기서 실패
    assert.equal(obj.ok, false);
    assert.equal(obj.count, 120);
    assert.ok(obj.errors.every((e) => e.check === 1));
  });
});
