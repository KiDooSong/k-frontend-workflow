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

// 킷 루트: scripts/lib/ → scripts/ → kit-root.
const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN_SCRIPT = path.join(KIT_ROOT, 'scripts', 'workflow-run.mjs');
const COUPON_DOCS = path.join(KIT_ROOT, 'examples', 'coupon-feature', 'docs', 'frontend-workflow');
const CUSTOM_LAYOUT = path.join(
  KIT_ROOT, 'examples', 'layout-profile', 'custom-monorepo', 'project-layout.yaml',
);

// workflow:run 을 서브프로세스로 실행한다(throw 없이 { code, stdout } 정규화). cwd=KIT_ROOT 로 고정해
// 상대 라벨/해소를 결정적으로 만든다(스크립트 자체 경로 해소는 cwd 와 독립 — SELF_DIR 기반).
function runRun(args) {
  try {
    const stdout = execFileSync(process.execPath, [RUN_SCRIPT, ...args], {
      cwd: KIT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e && e.status != null ? e.status : null, stdout: e && e.stdout ? String(e.stdout) : '' };
  }
}

// 생성된 work-packet.md frontmatter 에서 readiness_source 한 줄을 그대로 뽑는다(재유도 0 — 문자열만).
function readReadinessSource(packetPath) {
  const raw = fs.readFileSync(packetPath, 'utf8');
  const m = /^readiness_source:\s*"(.*)"\s*$/m.exec(raw);
  assert.ok(m, `work-packet.md 에 readiness_source 가 있어야 한다: ${packetPath}`);
  return m[1];
}

function mkOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wf-run-layout-'));
}

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
    const src = readReadinessSource(path.join(out, 'work-packet.md'));
    assert.ok(!/--layout/.test(src), `default 경로는 --layout 을 누출하지 않아야 한다: ${src}`);
  } finally {
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
