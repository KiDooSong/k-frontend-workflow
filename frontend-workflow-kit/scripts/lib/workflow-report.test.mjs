// workflow-report.test.mjs — orchestrator --layout 배선 회귀 witness (node:test, 서브프로세스 smoke).
//
// 실행(CI 미배선 — 하드룰상 package script/CI 변경 금지; check-generated-files.test.mjs 와 동일 규약):
//   node --test scripts/lib/workflow-report.test.mjs
//
// 막는 회귀(split-brain 재발 방지 — temp/runs/tier1-layout-threading-001.md F2):
//   - workflow:report 가 custom --layout 을 validate/forbidden-paths/check-generated child 에 전달하지
//     않아, leaf 가 기본(expo) 레이아웃으로 해소되던 split-brain.
//   - 증상: --layout 을 넘겨도 Run Report 의 ## Commands Run invocation 에 --layout 이 안 나타남.
//   - test-fixtures 는 전체 fixture harness 라 --layout 을 넘기지 않는다(기존 동작 유지).
//   - default(--layout 미지정) 경로는 BYTE-동치 유지(새 인자 누출 없음).
//   - 값 없는 bare --layout 은 optStr 규약대로 exit 2(도구 오류).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN_SCRIPT = path.join(KIT_ROOT, 'scripts', 'workflow-run.mjs');
const REPORT_SCRIPT = path.join(KIT_ROOT, 'scripts', 'workflow-report.mjs');
const COUPON_DOCS = path.join(KIT_ROOT, 'examples', 'coupon-feature', 'docs', 'frontend-workflow');
const CUSTOM_LAYOUT = path.join(
  KIT_ROOT, 'examples', 'layout-profile', 'custom-monorepo', 'project-layout.yaml',
);

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

function run(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd: KIT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e && e.status != null ? e.status : null, stdout: e && e.stdout ? String(e.stdout) : '' };
  }
}

// 공유 입력(packet + diff)을 한 번 만든다. report 입력일 뿐 — readiness 판정/게이트 아님.
let shared;
before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-report-layout-'));
  // packet 은 default 레이아웃으로 생성한다(report 입력일 뿐 — report 의 --layout 배선과 독립).
  const pktOut = path.join(dir, 'pkt');
  const r = run(RUN_SCRIPT, [
    '--screen', 'COUPON-001', '--requested-mode', 'rough-fixture-ui', '--docs', COUPON_DOCS, '--out', pktOut,
  ]);
  assert.equal(r.code, 0, `packet 생성(workflow:run)은 exit 0 이어야 한다. stdout=${r.stdout}`);
  const packet = path.join(pktOut, 'work-packet.md');
  assert.ok(fs.existsSync(packet), 'work-packet.md 가 있어야 한다');
  // forbidden-paths 수집을 켜려면 --diff 가 필요하다(경계는 diff 로 판정).
  const diff = path.join(dir, 'diff.txt');
  fs.writeFileSync(diff, 'A\tsrc/features/coupons/screens/CouponList.tsx\n', 'utf8');
  shared = { dir, packet, diff };
});
after(() => {
  if (shared) fs.rmSync(shared.dir, { recursive: true, force: true });
});

// Run Report markdown 에서 특정 leaf invocation 줄을 찾는다(## Commands Run 의 ```bash 블록).
function invocationLine(reportMd, scriptName) {
  const raw = fs.readFileSync(reportMd, 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.includes(scriptName + ' '));
  assert.ok(line, `Run Report 에 ${scriptName} invocation 줄이 있어야 한다`);
  return line;
}

test('custom --layout: validate/forbidden/check-generated invocation 에 --layout 전달(split-brain 차단)', () => {
  const reportMd = path.join(shared.dir, 'report-custom.md');
  const r = run(REPORT_SCRIPT, [
    '--packet', shared.packet, '--docs', COUPON_DOCS, '--diff', shared.diff,
    '--layout', CUSTOM_LAYOUT, '--skip-tests', '--out', reportMd,
  ]);
  assert.equal(r.code, 0, `report 생성은 exit 0 이어야 한다. stdout=${r.stdout}`);
  for (const s of ['validate.mjs', 'forbidden-paths.mjs', 'check-generated-files.mjs']) {
    assert.match(invocationLine(reportMd, s), /--layout\s+\S/, `${s} invocation 에 --layout 이 있어야 한다`);
  }
});

test('default(--layout 미지정): leaf invocation 에 --layout 누출 없음(BYTE-동치 seam)', () => {
  const reportMd = path.join(shared.dir, 'report-default.md');
  const r = run(REPORT_SCRIPT, [
    '--packet', shared.packet, '--docs', COUPON_DOCS, '--diff', shared.diff, '--skip-tests', '--out', reportMd,
  ]);
  assert.equal(r.code, 0, `report 생성은 exit 0 이어야 한다. stdout=${r.stdout}`);
  for (const s of ['validate.mjs', 'forbidden-paths.mjs', 'check-generated-files.mjs']) {
    assert.ok(!/--layout/.test(invocationLine(reportMd, s)), `default 경로는 ${s} 에 --layout 을 누출하지 않아야 한다`);
  }
});

test('상대 --layout: leaf invocation 에 path.resolve 된 절대경로 기록(raw 상대값 흘림 방지)', () => {
  const reportMd = path.join(shared.dir, 'report-rel.md');
  const relLayout = path.relative(KIT_ROOT, CUSTOM_LAYOUT); // cwd=KIT_ROOT 기준 상대
  const r = run(REPORT_SCRIPT, [
    '--packet', shared.packet, '--docs', COUPON_DOCS, '--diff', shared.diff,
    '--layout', relLayout, '--skip-tests', '--out', reportMd,
  ]);
  assert.equal(r.code, 0, `report 생성은 exit 0 이어야 한다. stdout=${r.stdout}`);
  const expectedAbs = toPosix(path.resolve(KIT_ROOT, relLayout));
  // report 가 path.resolve 를 건너뛰고 raw 상대값을 흘리면 절대경로가 라벨에 안 보여 실패한다.
  for (const s of ['validate.mjs', 'forbidden-paths.mjs', 'check-generated-files.mjs']) {
    assert.ok(
      toPosix(invocationLine(reportMd, s)).includes(expectedAbs),
      `${s} invocation 에 path.resolve 된 --layout 절대경로가 있어야 한다`,
    );
  }
});

test('test-fixtures 는 --layout 을 받지 않는다(전체 fixture harness — 기존 동작 유지)', () => {
  // --skip-tests 없이 실행 → test-fixtures invocation 이 실제로 나타난다. 그 줄에 --layout 이 없어야 한다.
  const reportMd = path.join(shared.dir, 'report-with-tests.md');
  const r = run(REPORT_SCRIPT, [
    '--packet', shared.packet, '--docs', COUPON_DOCS, '--diff', shared.diff, '--layout', CUSTOM_LAYOUT, '--out', reportMd,
  ]);
  assert.equal(r.code, 0, `report 생성은 exit 0 이어야 한다. stdout=${r.stdout}`);
  const line = invocationLine(reportMd, 'test-fixtures.mjs');
  assert.ok(!/--layout/.test(line), `test-fixtures invocation 에는 --layout 이 없어야 한다: ${line}`);
});

test('bare --layout(값 없음)은 optStr 규약대로 exit 2(도구 오류)', () => {
  const r = run(REPORT_SCRIPT, ['--packet', shared.packet, '--layout']);
  assert.equal(r.code, 2, '값 없는 --layout 은 exit 2 여야 한다');
});

test('--help 에 --layout <path> 가 노출된다', () => {
  const r = run(REPORT_SCRIPT, ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--layout <path>/, 'help text 에 --layout <path> 가 있어야 한다');
});
