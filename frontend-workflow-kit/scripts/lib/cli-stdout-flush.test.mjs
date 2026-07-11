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

// --- 소스 계약 스캐너 -----------------------------------------------------
// 허용 인자: 리터럴 1(사전 가드) · 2(usage/설정 오류, stderr 전용). 그 외 전부 위반:
//   - process.exit(0): 성공 경로는 process.exitCode 자연 종료여야 한다.
//   - 동적 인자(process.exit(summary.exit_code), process.exit(fatal === 0 ? 0 : 1) 등):
//     0 으로 평가될 수 있어 같은 truncation 클래스의 재유입 경로다.
// 유일한 예외: stderr 전용 `function fail(message, code = 2)` 헬퍼(pack/upgrade-vendored-kit
// 관례) **본문 내부의** process.exit(code) — 헬퍼 밖에서 'code' 라는 이름만 흉내 낸
// 동적 exit 는 허용하지 않는다. 본문 범위는 실제 brace-depth 추적으로 구한다.

// 주석(//, /* */)과 문자열('…', "…", `…`) 내용을 같은 길이의 공백으로 마스킹한다
// (개행은 보존 — 인덱스/라인 번호가 원문과 1:1 대응). 문자열/주석 속의
// process.exit(…)·중괄호가 스캐너와 brace-depth 를 속이지 못하게 한다.
// 한계: 템플릿 리터럴은 ${} 보간 포함 통째로 마스킹한다(보간 안의 실제 코드가 가려질 수
// 있으나, CLI 종료 경로를 템플릿 보간 안에 두는 코드는 이 저장소 관례에 없다).
function maskCommentsAndStrings(src) {
  const out = src.split('');
  let i = 0;
  let state = 'code'; // code | line | block | single | double | template
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') state = 'line';
      else if (ch === '/' && next === '*') state = 'block';
      else if (ch === "'") state = 'single';
      else if (ch === '"') state = 'double';
      else if (ch === '`') state = 'template';
      if (state !== 'code') out[i] = ' ';
      i += 1;
      continue;
    }
    // 주석/문자열 내부: 개행만 남기고 마스킹
    if (ch !== '\n') out[i] = ' ';
    if (state === 'line') {
      if (ch === '\n') state = 'code';
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        out[i + 1] = ' ';
        i += 1;
        state = 'code';
      }
    } else if (state === 'single' || state === 'double' || state === 'template') {
      const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (ch === '\\') {
        if (next !== '\n' && i + 1 < src.length) out[i + 1] = ' ';
        i += 1; // 이스케이프 다음 문자 건너뜀
      } else if (ch === quote) {
        state = 'code';
      } else if (ch === '\n' && state !== 'template') {
        state = 'code'; // 비정상 개행 종단 — fail-safe
      }
    }
    i += 1;
  }
  return out.join('');
}

// masked 소스에서 `function fail(message, code = 2)` 본문 [시작, 끝) 범위를
// brace-depth 추적으로 수집한다(중첩 중괄호·긴 본문에도 정확).
function collectFailHelperRanges(masked) {
  const ranges = [];
  const declRe = /function fail\(message, code = 2\)\s*\{/g;
  let decl;
  while ((decl = declRe.exec(masked))) {
    const open = decl.index + decl[0].length - 1; // '{' 위치
    let depth = 1;
    let j = open + 1;
    while (j < masked.length && depth > 0) {
      if (masked[j] === '{') depth += 1;
      else if (masked[j] === '}') depth -= 1;
      j += 1;
    }
    if (depth === 0) ranges.push([open, j]);
  }
  return ranges;
}

// 소스 하나를 스캔해 위반 목록(각 항목: { line, arg })을 돌려준다.
function collectExitOffenders(src) {
  const masked = maskCommentsAndStrings(src);
  const failRanges = collectFailHelperRanges(masked);
  const insideFailHelper = (idx) => failRanges.some(([s, e]) => idx >= s && idx < e);
  const offenders = [];
  const re = /process\.exit\s*\(([^)]*)\)/g; // 공백 변형(process.exit (0))도 잡는다
  let m;
  while ((m = re.exec(masked))) {
    const arg = m[1].trim();
    if (arg === '1' || arg === '2') continue;
    if (arg === 'code' && insideFailHelper(m.index)) continue;
    offenders.push({ line: masked.slice(0, m.index).split('\n').length, arg });
  }
  return offenders;
}

test('source contract: top-level CLI scripts only process.exit(1|2) or fail-helper exit(code) — no exit(0), no dynamic exit', () => {
  const offenders = [];
  for (const file of fs.readdirSync(SCRIPTS_DIR)) {
    if (!file.endsWith('.mjs')) continue;
    const src = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
    for (const o of collectExitOffenders(src)) {
      offenders.push(`${file}:${o.line} process.exit(${o.arg})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `성공 가능 경로는 process.exitCode 로 자연 종료해야 한다(macOS 8KB pipe truncation): ${offenders.join(', ')}`,
  );
});

test('source contract scanner: catches exit(0) incl. whitespace variant and dynamic args', () => {
  assert.deepEqual(collectExitOffenders('process.exit(0);'), [{ line: 1, arg: '0' }]);
  assert.deepEqual(collectExitOffenders('process.exit (0);'), [{ line: 1, arg: '0' }]);
  assert.deepEqual(collectExitOffenders('process.exit(summary.exit_code);'), [
    { line: 1, arg: 'summary.exit_code' },
  ]);
  assert.deepEqual(collectExitOffenders('process.exit(fatal === 0 ? 0 : 1);'), [
    { line: 1, arg: 'fatal === 0 ? 0 : 1' },
  ]);
  // 허용 리터럴은 무발화
  assert.deepEqual(collectExitOffenders('process.exit(1);\nprocess.exit(2);'), []);
});

test('source contract scanner: exit(code) is allowed only inside the fail(message, code = 2) helper body', () => {
  const helper = [
    'function fail(message, code = 2) {',
    '  process.stderr.write(`tool: ${message}\\n`);',
    '  if (message) { /* nested braces */ }',
    '  process.exit(code);',
    '}',
  ].join('\n');
  assert.deepEqual(collectExitOffenders(helper), []); // 헬퍼 본문 내부 → 허용(중첩 중괄호 포함)

  const outside = 'const code = 0;\nprocess.exit(code);'; // 헬퍼 밖에서 code 이름만 흉내
  assert.deepEqual(collectExitOffenders(outside), [{ line: 2, arg: 'code' }]);

  // 헬퍼 본문이 닫힌 **뒤의** exit(code) 는 위반 — brace-depth 로 본문 경계를 정확히 끊는다.
  const after = `${helper}\nprocess.exit(code);`;
  assert.deepEqual(collectExitOffenders(after), [{ line: 6, arg: 'code' }]);
});

test('source contract scanner: comments and strings cannot fool the scan', () => {
  // 주석/문자열 속 process.exit(0) 언급은 무발화
  assert.deepEqual(collectExitOffenders('// process.exit(0) 금지\nconst x = 1;'), []);
  assert.deepEqual(collectExitOffenders('/* process.exit(0) */ const x = 1;'), []);
  assert.deepEqual(collectExitOffenders("const s = 'process.exit(0)';"), []);
  // 문자열 속 중괄호가 fail 헬퍼 본문 경계(brace-depth)를 깨지 못한다
  const helperWithBraceString = [
    'function fail(message, code = 2) {',
    "  process.stderr.write('unbalanced { { brace');",
    '  process.exit(code);',
    '}',
    'process.exit(code);', // 본문 밖 → 위반
  ].join('\n');
  assert.deepEqual(collectExitOffenders(helperWithBraceString), [{ line: 5, arg: 'code' }]);
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
