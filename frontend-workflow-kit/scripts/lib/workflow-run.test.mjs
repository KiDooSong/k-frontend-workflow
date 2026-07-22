// workflow-run.test.mjs — orchestrator --layout 배선 회귀 witness (node:test, 서브프로세스 smoke).
//
// 실행(CI 미배선 — 하드룰상 package script/CI 변경 금지; check-generated-files.test.mjs 와 동일 규약):
//   node --test scripts/lib/workflow-run.test.mjs
//
// 막는 회귀(split-brain 재발 방지 — temp/runs/tier1-layout-threading-001.md F1):
//   - workflow:run 이 custom --layout 을 workflow:packet child 에 전달하지 않아, leaf(readiness)는
//     custom 레이아웃으로, orchestrator 는 기본(expo) 레이아웃으로 갈리던 split-brain.
//   - 증상: --layout 을 넘겨도 생성된 work-packet.md 의 readiness_source 에 --layout 이 보존되지 않음.
//   - default(--layout 미지정) 경로는 BYTE-동치 유지(새 인자 누출 없음).
//   - 값 없는 bare --layout 은 optStr 규약대로 exit 2(도구 오류).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from './util.mjs';

// 킷 루트: scripts/lib/ → scripts/ → kit-root.
const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKET_SCRIPT = path.join(KIT_ROOT, 'scripts', 'workflow-packet.mjs');
const RUN_SCRIPT = path.join(KIT_ROOT, 'scripts', 'workflow-run.mjs');
const COUPON_DOCS = path.join(KIT_ROOT, 'examples', 'coupon-feature', 'docs', 'frontend-workflow');
const CUSTOM_LAYOUT = path.join(
  KIT_ROOT, 'examples', 'layout-profile', 'custom-monorepo', 'project-layout.yaml',
);
// cwd=KIT_ROOT 기준 상대 layout 경로 — path.resolve 회귀 고정용(raw 상대값을 그대로 흘리면 잡힌다).
const REL_CUSTOM_LAYOUT = path.relative(KIT_ROOT, CUSTOM_LAYOUT);
// path-backstop AUTH-001 의 clean packet 입력(_meta 만). 커밋된 예제는 게이트 시연용이라 clean 화면이 없다.
const PATHBACKSTOP_STATE = path.join(
  KIT_ROOT, 'examples', 'path-backstop', 'docs', 'frontend-workflow', '_meta', 'workflow-state.yaml',
);
const STALE_REPORT_SENTINEL = 'STALE REPORT FROM PREVIOUS INVOCATION';

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

// "clean packet" tmp fixture: path-backstop AUTH-001 은 api_confidence 한 개만 빼면 clean 이므로,
// 그 unknown(api_confidence_min)을 confirmed 로 올려 isPacketClean 을 만족시킨다 → workflow:run 이
// DONE_PENDING_REVIEW 로 진입해 report child 를 실제로 호출하게 된다(run→report 전달 witness 용).
function buildCleanDocs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-clean-'));
  const metaDir = path.join(dir, 'docs', 'frontend-workflow', '_meta');
  fs.mkdirSync(metaDir, { recursive: true });
  const state = fs
    .readFileSync(PATHBACKSTOP_STATE, 'utf8')
    .replace(/api_confidence_min: candidate/g, 'api_confidence_min: confirmed');
  fs.writeFileSync(path.join(metaDir, 'workflow-state.yaml'), state);
  return { dir, docs: path.join(dir, 'docs', 'frontend-workflow') };
}

function buildAbsorbedDocs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-absorbed-'));
  const docs = path.join(dir, 'docs', 'frontend-workflow');
  const metaDir = path.join(docs, '_meta');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(
    path.join(metaDir, 'workflow-state.yaml'),
    `generated_at: "2026-07-17"
global:
  navigation_map_status: missing
  component_catalog_generated: false
  stub_screen_specs_count: 1
screens:
  AUTH-NEW:
    status: draft
    domain: auth
    route: /auth/new
    stub: true
    derived: {}
absorbed_screens:
  OLD-AUTH:
    status: confirmed
    domain: auth
    route: /auth/old
    screen_lifecycle: absorbed
    absorbed_into: AUTH-NEW
    absorbed_at: "2026-07-15"
    source:
      path: domains/auth/screens/old-auth/screen-spec.md
`,
    'utf8',
  );
  return { dir, docs };
}

// workflow:run 을 서브프로세스로 실행한다(throw 없이 { code, stdout } 정규화). cwd=KIT_ROOT 로 고정해
// 상대 라벨/해소를 결정적으로 만든다(스크립트 자체 경로 해소는 cwd 와 독립 — SELF_DIR 기반).
function runRun(args) {
  try {
    const stdout = execFileSync(process.execPath, [RUN_SCRIPT, ...args], {
      cwd: KIT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: e && e.status != null ? e.status : null,
      stdout: e && e.stdout ? String(e.stdout) : '',
      stderr: e && e.stderr ? String(e.stderr) : '',
    };
  }
}

function runPacket(args) {
  try {
    const stdout = execFileSync(process.execPath, [PACKET_SCRIPT, ...args], {
      cwd: KIT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: e && e.status != null ? e.status : null,
      stdout: e && e.stdout ? String(e.stdout) : '',
      stderr: e && e.stderr ? String(e.stderr) : '',
    };
  }
}

// 생성된 work-packet.md frontmatter 에서 readiness_source 한 줄을 그대로 뽑는다(재유도 0 — 문자열만).
function readReadinessSource(packetPath) {
  const raw = fs.readFileSync(packetPath, 'utf8');
  const m = /^readiness_source:\s*"(.*)"\s*$/m.exec(raw);
  assert.ok(m, `work-packet.md 에 readiness_source 가 있어야 한다: ${packetPath}`);
  return m[1];
}

function readPacket(packetPath) {
  return fs.readFileSync(packetPath, 'utf8');
}

function mkOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-layout-'));
}

test('stale report + absorbed readiness: HALT_NOT_APPLICABLE removes previous report', () => {
  const { dir, docs } = buildAbsorbedDocs();
  const out = path.join(dir, 'run-artifacts');
  try {
    const packetResult = runPacket([
      '--screen', 'OLD-AUTH', '--requested-mode', 'docs-only',
      '--docs', docs, '--date', '2026-07-17', '--json',
    ]);
    assert.equal(packetResult.code, 0, packetResult.stderr || packetResult.stdout);
    const packet = JSON.parse(packetResult.stdout);
    assert.equal(packet.readiness_applicable, false);
    assert.equal(packet.screen_lifecycle, 'absorbed');
    assert.equal(packet.readiness_mode, null);
    assert.equal(packet.absorbed_into, 'AUTH-NEW');
    assert.equal(packet.non_executable, true);

    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'run-report.md'), STALE_REPORT_SENTINEL, 'utf8');

    const runResult = runRun([
      '--screen', 'OLD-AUTH', '--requested-mode', 'docs-only',
      '--docs', docs, '--date', '2026-07-17', '--out', out, '--json',
    ]);
    assert.equal(runResult.code, 0, runResult.stdout);
    const run = JSON.parse(runResult.stdout);
    assert.equal(run.state, 'HALT_NOT_APPLICABLE');
    assert.notEqual(run.state, 'HALT_TOOL_ERROR');
    assert.equal(run.readiness_applicable, false);
    assert.equal(run.screen_lifecycle, 'absorbed');
    assert.equal(run.readiness_mode, null);
    assert.equal(run.absorbed_into, 'AUTH-NEW');
    assert.match(run.next_action, /AUTH-NEW/);
    assert.equal(run.report, null);
    assert.equal(fs.existsSync(path.join(out, 'run-report.md')), false, 'stale Run Report가 제거돼야 한다');
    const packetMarkdown = fs.readFileSync(path.join(out, 'work-packet.md'), 'utf8');
    const packetFrontmatter = splitFrontmatter(packetMarkdown);
    assert.equal(packetFrontmatter.parseError, undefined);
    assert.equal(packetFrontmatter.data.readiness_mode, null);
    assert.equal(packetFrontmatter.data.readiness_applicable, false);
    assert.match(packetMarkdown, /Non-executable Work Packet: OLD-AUTH → AUTH-NEW/);
    assert.match(packetMarkdown, /자동 전환해 실행하지 말고/);
    const statusMarkdown = fs.readFileSync(out + '.md', 'utf8');
    const statusFrontmatter = splitFrontmatter(statusMarkdown);
    assert.equal(statusFrontmatter.parseError, undefined);
    assert.equal(statusFrontmatter.data.readiness_mode, null);
    assert.equal(statusFrontmatter.data.readiness_applicable, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stale report + ambiguous packet: HALT_AMBIGUITY removes previous report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-stale-ambiguity-'));
  const out = path.join(dir, 'run-artifacts');
  const report = path.join(out, 'run-report.md');
  try {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(report, STALE_REPORT_SENTINEL, 'utf8');
    const r = runRun([
      '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui',
      '--docs', COUPON_DOCS, '--out', out, '--json',
    ]);
    assert.equal(r.code, 0, r.stderr || r.stdout);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.state, 'HALT_AMBIGUITY');
    assert.equal(envelope.report, null);
    assert.equal(fs.existsSync(report), false, 'stale Run Report가 제거돼야 한다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stale report + clean packet without --diff: HALT_READY_FOR_WORK removes previous report', () => {
  const { dir, docs } = buildCleanDocs();
  const out = path.join(dir, 'run-artifacts');
  const report = path.join(out, 'run-report.md');
  try {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(report, STALE_REPORT_SENTINEL, 'utf8');
    const r = runRun([
      '--screen', 'AUTH-001', '--requested-mode', 'final-fixture-ui',
      '--docs', docs, '--out', out, '--json',
    ]);
    assert.equal(r.code, 0, r.stderr || r.stdout);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.state, 'HALT_READY_FOR_WORK');
    assert.equal(envelope.report, null);
    assert.equal(fs.existsSync(report), false, 'stale Run Report가 제거돼야 한다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stale report + child tool failure: HALT_TOOL_ERROR removes previous report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-stale-tool-error-'));
  const out = path.join(dir, 'run-artifacts');
  const report = path.join(out, 'run-report.md');
  const missingLayout = path.join(dir, 'missing-layout.yaml');
  try {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(report, STALE_REPORT_SENTINEL, 'utf8');
    const r = runRun([
      '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui',
      '--docs', COUPON_DOCS, '--layout', missingLayout, '--out', out, '--json',
    ]);
    assert.equal(r.code, 2, r.stderr || r.stdout);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.state, 'HALT_TOOL_ERROR');
    assert.equal(envelope.report, null);
    assert.equal(fs.existsSync(report), false, 'tool error에서도 stale Run Report가 제거돼야 한다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no-report cleanup failure: exit 2 before success output and does not recursively delete directory', () => {
  const { dir, docs } = buildCleanDocs();
  const out = path.join(dir, 'run-artifacts');
  const reportDir = path.join(out, 'run-report.md');
  try {
    fs.mkdirSync(reportDir, { recursive: true });
    const r = runRun([
      '--screen', 'AUTH-001', '--requested-mode', 'final-fixture-ui',
      '--docs', docs, '--out', out, '--json',
    ]);
    assert.equal(r.code, 2, r.stderr || r.stdout);
    assert.equal(r.stdout, '', 'cleanup 실패 전에 no-report 성공 JSON을 출력하면 안 된다');
    assert.equal(fs.statSync(reportDir).isDirectory(), true, 'destination 디렉터리를 재귀 삭제하면 안 된다');
    assert.equal(fs.existsSync(out + '.md'), false, 'cleanup 실패 전에 status markdown을 쓰면 안 된다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('custom --layout: work-packet.md readiness_source 에 --layout <absPath> 보존(split-brain 차단)', () => {
  const out = mkOut();
  try {
    const r = runRun([
      '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui',
      '--docs', COUPON_DOCS, '--layout', CUSTOM_LAYOUT, '--out', out,
    ]);
    // HALT_AMBIGUITY(미해결 Open Decision) 라도 packet 파일은 생성된다 → exit 0.
    assert.equal(r.code, 0, `auto-stop 는 exit 0 이어야 한다. stdout=${r.stdout}`);
    const src = readReadinessSource(path.join(out, 'work-packet.md'));
    assert.match(src, /--layout\s+\S/, `readiness_source 에 --layout 이 보존돼야 한다: ${src}`);
    // 실제 전달된 절대경로(posix 정규화)가 보존되는지 — fixture 경로 꼬리로 확인(provenance 일치).
    assert.ok(
      src.includes('custom-monorepo/project-layout.yaml'),
      `readiness_source 의 --layout 값이 custom fixture 절대경로여야 한다: ${src}`,
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('default(--layout 미지정): readiness_source 에 --layout 누출 없음(BYTE-동치 seam)', () => {
  const out = mkOut();
  try {
    const r = runRun([
      '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui',
      '--docs', COUPON_DOCS, '--out', out,
    ]);
    assert.equal(r.code, 0, `auto-stop 는 exit 0 이어야 한다. stdout=${r.stdout}`);
    const packet = path.join(out, 'work-packet.md');
    const src = readReadinessSource(packet);
    assert.ok(!/--layout/.test(src), `default 경로는 --layout 을 누출하지 않아야 한다: ${src}`);
    const packetRaw = readPacket(packet);
    assert.match(
      packetRaw,
      /## Out of Scope[\s\S]*allowed_paths 밖 작업[\s\S]*shared helper \/ refactor \/ shared-contract \/ architecture role 확장[\s\S]*## Commands/,
      '생성 Work Packet Out of Scope 에 후속 격리와 role 확장 가드가 있어야 한다',
    );
    assert.match(packetRaw, /docs\/reference\/ambiguity-triage\.md/, '생성 Work Packet 은 packed reference 링크를 써야 한다');
    assert.match(packetRaw, /Compact triage rules/, '생성 Work Packet 은 compact reference scope 를 설명해야 한다');
    assert.doesNotMatch(packetRaw, /docs\/workflows\/ambiguity-triage\.md/, '생성 Work Packet 은 excluded workflows 링크를 쓰지 않는다');
    assert.doesNotMatch(packetRaw, /전체 triage 결정트리|상세 4블록 스키마|예시\(§6\)/, '생성 Work Packet 은 stale full-triage 문구를 내지 않는다');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('상대 --layout: readiness_source 에 path.resolve 된 절대경로로 기록(raw 상대값 흘림 방지)', () => {
  const out = mkOut();
  try {
    const r = runRun([
      '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui',
      '--docs', COUPON_DOCS, '--layout', REL_CUSTOM_LAYOUT, '--out', out,
    ]);
    assert.equal(r.code, 0, `auto-stop 는 exit 0 이어야 한다. stdout=${r.stdout}`);
    const src = readReadinessSource(path.join(out, 'work-packet.md'));
    const expectedAbs = toPosix(path.resolve(KIT_ROOT, REL_CUSTOM_LAYOUT));
    assert.ok(
      toPosix(src).includes(expectedAbs),
      `상대 --layout 입력이 path.resolve 된 절대경로로 기록돼야 한다: ${src}`,
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('clean packet + --diff + custom --layout: DONE_PENDING_REVIEW · run-report leaf invocation 에 --layout 전달(run→report child witness)', () => {
  const { dir, docs } = buildCleanDocs();
  const out = mkOut();
  try {
    const diff = path.join(dir, 'diff.txt');
    fs.writeFileSync(diff, 'A\tsrc/features/auth/screens/Login.tsx\n', 'utf8');
    fs.writeFileSync(path.join(out, 'run-report.md'), STALE_REPORT_SENTINEL, 'utf8');
    // 상대 --layout 으로 넘겨 run 의 path.resolve(보고-child 방향)까지 동시에 고정한다.
    const r = runRun([
      '--screen', 'AUTH-001', '--requested-mode', 'final-fixture-ui',
      '--docs', docs, '--layout', REL_CUSTOM_LAYOUT, '--diff', diff, '--skip-tests', '--out', out,
    ]);
    assert.equal(r.code, 0, `DONE 경로도 exit 0 이어야 한다. stdout=${r.stdout}`);
    assert.match(r.stdout, /DONE_PENDING_REVIEW/, `clean packet + --diff 는 DONE_PENDING_REVIEW 여야 한다: ${r.stdout}`);
    const reportMd = path.join(out, 'run-report.md');
    assert.ok(fs.existsSync(reportMd), 'run-report.md 가 생성돼야 한다');
    const raw = fs.readFileSync(reportMd, 'utf8');
    assert.doesNotMatch(raw, new RegExp(STALE_REPORT_SENTINEL), '이전 report sentinel이 현재 report에 남으면 안 된다');
    const expectedAbs = toPosix(path.resolve(KIT_ROOT, REL_CUSTOM_LAYOUT));
    // report child 가 leaf 로 --layout 을 전달했는지 + run 이 절대경로로 넘겼는지 동시 witness.
    // (reportArgs.push('--layout', layoutResolved) 가 사라지면 이 줄에서 --layout 이 빠져 실패한다.)
    for (const s of ['validate.mjs', 'forbidden-paths.mjs', 'check-generated-files.mjs']) {
      const line = raw.split(/\r?\n/).find((l) => l.includes(s + ' '));
      assert.ok(line, `run-report 에 ${s} invocation 줄이 있어야 한다`);
      assert.ok(
        toPosix(line).includes(expectedAbs),
        `${s} invocation 에 path.resolve 된 --layout 절대경로가 있어야 한다: ${line}`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('bare --layout(값 없음)은 optStr 규약대로 exit 2(도구 오류)', () => {
  const r = runRun([
    '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui',
    '--docs', COUPON_DOCS, '--layout',
  ]);
  assert.equal(r.code, 2, '값 없는 --layout 은 exit 2 여야 한다');
});

test('--help 에 --layout <path> 가 노출된다', () => {
  const r = runRun(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--layout <path>/, 'help text 에 --layout <path> 가 있어야 한다');
});
