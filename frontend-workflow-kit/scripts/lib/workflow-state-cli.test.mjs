// workflow-state-cli.test.mjs — workflow-state.mjs CLI 인자 계약(--help / usage 오류 exit 2)과
// "usage 오류에서 파일 쓰기 0" 불변식.
//
// parseArgs 는 모든 --foo 를 그대로 flags 에 넣을 뿐 거부하지 않으므로, allowlist 가 없으면
// --jsno 오타가 "JSON 출력" 대신 실제 _meta 파일 쓰기로, --outt 오타가 기본 경로 쓰기로
// 조용히 진행된다 — fail-closed 원칙(usage 오류 exit 2, validate-cli.test.mjs 와 동형) 위반.
// 인자 검증은 todayISO()/layout 로드/파일 탐색/파일 쓰기보다 먼저 수행돼야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'workflow-state.mjs');
const EXAMPLE = path.join(KIT_ROOT, 'examples', 'coupon-feature');
// 자연 종료 회귀(잔존 핸들 hang)가 유한 실패로 떨어지게 timeout 을 건다.
const SPAWN_TIMEOUT_MS = 30_000;

function run(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    ...opts,
  });
}

// usage 오류가 파일을 만들지 않았음을 관찰할 수 있는 최소 fixture: 빈 docs 트리.
// (정상 실행은 화면 0건이어도 _meta/workflow-state.yaml 을 항상 쓴다 — _meta 부재가 write-0 의 증거.)
function withTmpDocs(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wfstate-cli-'));
  try {
    const docsDir = path.join(root, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    return fn({ root, docsDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('--help prints usage to stdout, exits 0, and writes nothing', () => {
  withTmpDocs(({ docsDir }) => {
    const r = run(['--help', '--docs', docsDir]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.match(r.stdout, /workflow:state/);
    assert.match(r.stdout, /Usage:/);
    assert.match(r.stdout, /--date/);
    assert.doesNotMatch(r.stdout, /wrote /);
    assert.equal(fs.existsSync(path.join(docsDir, '_meta')), false, '--help must not write _meta');
  });
});

test('unknown flag --jsno (typo of --json) is exit 2 and writes zero files', () => {
  withTmpDocs(({ docsDir }) => {
    const r = run(['--jsno', '--docs', docsDir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown option --jsno/);
    assert.match(r.stderr, /--help/);
    assert.equal(r.stdout, '');
    assert.equal(fs.existsSync(path.join(docsDir, '_meta')), false, '--jsno must not write _meta');
  });
});

test('unknown flag --outt (typo of --out) is exit 2 — no default-out write, no typo-dir write', () => {
  withTmpDocs(({ root, docsDir }) => {
    const typoOut = path.join(root, 'typo-out');
    const r = run(['--outt', typoOut, '--docs', docsDir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown option --outt/);
    assert.equal(fs.existsSync(path.join(docsDir, '_meta')), false, '--outt must not fall back to the default out dir');
    assert.equal(fs.existsSync(typoOut), false, '--outt must not create the typo dir either');
  });
});

test('value flag without a value (bare or empty --flag=) is a usage error: exit 2', () => {
  for (const flag of ['--docs', '--src', '--date', '--out', '--layout', '--root']) {
    for (const form of [[flag], [`${flag}=`]]) {
      const r = run(form);
      assert.equal(r.status, 2, `${form.join(' ')} should exit 2`);
      assert.match(r.stderr, new RegExp(`${flag} requires a value`));
    }
  }
});

test('empty --out= must not silently fall back to the default _meta dir', () => {
  withTmpDocs(({ docsDir }) => {
    const r = run(['--out=', '--docs', docsDir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--out requires a value/);
    assert.equal(fs.existsSync(path.join(docsDir, '_meta')), false, '--out= must not write the default out dir');
  });
});

test('boolean flag with a value is a usage error: exit 2', () => {
  const r = run(['--json=yes']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--json does not accept a value/);
});

test('positional arguments are a usage error: exit 2 and write zero files', () => {
  withTmpDocs(({ docsDir }) => {
    const r = run(['unexpected-positional', '--docs', docsDir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /positional arguments are not supported/);
    assert.equal(fs.existsSync(path.join(docsDir, '_meta')), false);
  });
});

test('every allowlisted flag still runs: --json mode is exit 0 and file-free', () => {
  withTmpDocs(({ root, docsDir }) => {
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const r = run([
      '--docs', docsDir,
      '--src', srcDir,
      '--root', root,
      '--date', '2026-01-01',
      '--out', path.join(root, 'out'),
      '--layout', path.join(KIT_ROOT, 'policies', 'project-layout.yaml'),
      '--json',
    ]);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.state.generated_at, '2026-01-01');
    assert.deepEqual(obj.state.screens, {});
    assert.equal(fs.existsSync(path.join(root, 'out')), false, '--json mode must not write files');
  });
});

test('duplicate scalar flags keep last-wins semantics (unchanged in this PR)', () => {
  withTmpDocs(({ root, docsDir }) => {
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const r = run(['--docs', docsDir, '--src', srcDir, '--date', '2026-01-01', '--date', '2026-02-02', '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).state.generated_at, '2026-02-02', 'last --date must win');
  });
});

test('a value starting with a single hyphen is consumed as a value (parser semantics unchanged)', () => {
  withTmpDocs(({ root, docsDir }) => {
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const r = run(['--docs', docsDir, '--src', srcDir, '--date', '-1', '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).state.generated_at, '-1');
  });
});

test('write mode against the golden example stays byte-identical to the committed _meta files', () => {
  // .gitattributes 가 저장소 전체를 eol=lf 로 고정하므로 checkout 바이트와 생성 바이트를 직접 비교할 수 있다.
  withTmpDocs(({ root }) => {
    const outDir = path.join(root, 'out');
    const r = run([
      '--docs', path.join(EXAMPLE, 'docs', 'frontend-workflow'),
      '--src', path.join(EXAMPLE, 'src'),
      '--date', '2026-06-13',
      '--out', outDir,
    ]);
    assert.equal(r.status, 0, r.stderr);
    for (const name of ['workflow-state.yaml', 'screen-inventory.yaml']) {
      const committed = fs.readFileSync(
        path.join(EXAMPLE, 'docs', 'frontend-workflow', '_meta', name),
        'utf8',
      );
      const generated = fs.readFileSync(path.join(outDir, name), 'utf8');
      assert.equal(generated, committed, `${name} must stay byte-identical to the committed golden`);
    }
    // 성공 stdout 도 byte 단위로 고정한다 (`wrote <cwd-상대 경로>` 형식 — spawn cwd 는 테스트 프로세스와 동일).
    assert.equal(
      r.stdout,
      'workflow:state — 2 screen(s)\n' +
        `  wrote ${path.relative(process.cwd(), path.join(outDir, 'workflow-state.yaml'))}\n` +
        `  wrote ${path.relative(process.cwd(), path.join(outDir, 'screen-inventory.yaml'))}\n`,
      'success stdout shape must stay byte-identical',
    );
  });
});
