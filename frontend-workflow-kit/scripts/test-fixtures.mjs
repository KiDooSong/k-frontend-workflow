#!/usr/bin/env node
// test-fixtures.mjs — golden fixture 비교 하니스 (MVP-B Phase 0 + L2).
// 기존 예제/드라이런 출력물을 반복 가능한 회귀 검사로 굳힌다. 손으로 하던 hash+grep 대조를 코드화한다.
//
// 검사 대상 (manifest 기반):
//   [reconcile] expected-llm-after ↔ actual-llm-after 의 올리기만(raise-only) 불변식 대조
//      - input-reconciliation     golden(expected-llm-after) 자기 검사            → PASS 기대
//      - reconcile-input-001       pre-fix 증거 run (U-001 닫음 + U-002 신설)        → FAIL 기대(xfail)
//      - reconcile-input-002       post-fix canonical run                           → PASS 요구
//   [integrity] 문서 생성 예제/구현 run 의 파싱 무결성 + 선언 산출물 존재
//      - coupon-feature · multi-screen-dry-run · implement-screen-001
//   [pipeline] (L2) 예제 트리에 state/readiness/validate 를 돌린 출력 ↔ 커밋된 기계가독 기대값
//      - coupon-feature · multi-screen-dry-run (reports/expected-{state,readiness,validate}.json)
//
// 불변식:
//  - reconcile 비교 대상은 항상 expected-llm-after. human-final(expected-after)을 LLM 출력처럼
//    비교하지 않는다 (요구사항 #1·#2 — GOLDEN_IR 로 고정 + run-metadata compare_against 검증).
//  - reconcile-input-001 의 실패는 "의도된 증거"(xfail, expected_failures 로 사유 고정). 002 는 통과 필수.
//  - 경로 경계(forbidden_paths) 검사는 하지 않는다 — Lane B 소관 (요구사항 #6).
//  - 판정 단일 출처 보존: L2 는 readiness/validate 를 재구현하지 않는다 — buildState/computeReadiness 를
//    import 소비하고 validate 는 서브프로세스(--json)로 돌린 "실제 출력"을 스냅샷·대조만 한다.
//  - 정규화(요구사항 #5): generated_at(휘발성)·경로 구분자(OS) 를 정규화. 비교는 구조화(파싱) 기준이라 CRLF 무관.
//
// 사용:
//   node scripts/test-fixtures.mjs [--json]      전 fixture 실행(기본; fixture 에 read-only)
//   node scripts/test-fixtures.mjs --update       L2 스냅샷(reports/expected-*.json) 갱신(유지보수 전용)
// exit: 0 = 모든 fixture 가 기대대로 · 1 = 치명(pass 실패 / xpass / xdrift) · 2 = 설정/IO 오류.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs, KIT_ROOT, DEFAULTS, loadYaml, loadYamlOrExit, readFileSafe } from './lib/util.mjs';
import {
  runReconcileChecks,
  runIntegrityChecks,
  runPipelineChecks,
  writePipelineExpected,
  runPathBackstopCase,
} from './lib/test-fixture.mjs';
import { buildState } from './workflow-state.mjs';
import { computeReadiness } from './readiness.mjs';

const DF = 'docs/frontend-workflow';                 // expected/actual 공통 하위 경로
const REPO_ROOT = path.resolve(KIT_ROOT, '..');       // temp/runs 는 킷 밖(레포 루트)에 있다
const EXAMPLES = path.join(KIT_ROOT, 'examples');
const RUNS = path.join(REPO_ROOT, 'temp', 'runs');
const GOLDEN_IR = path.join(EXAMPLES, 'input-reconciliation', 'expected-llm-after');
const VALIDATE_SCRIPT = path.join(KIT_ROOT, 'scripts', 'validate.mjs');
const PB_ROOT = path.join(EXAMPLES, 'path-backstop');           // forbidden-paths 픽스처 루트
const FORBIDDEN_PATHS = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs'); // Lane B CLI(서브프로세스 실행 대상)

// input-reconciliation golden(expected-llm-after) 의 stage=llm-after manifest.
// 검사 대상 ID·기대 상태(올리기만 불변식). golden 의 실제 파일에서 확인한 값:
//   register 5행 reconciled · D-001/D-003/D-204 + C-001 open · G-001 open(accept 아님)
//   · COUPON-001 status:draft · U-001 open · U-002 미존재.
const RECON_MANIFEST = {
  registerFile: '_meta/reconciliation-register.md',
  registerStatusCol: 'Reconcile Status',
  registerStatusValue: 'reconciled',
  registerInputs: [
    'IN-20260613-planning-001',
    'IN-20260613-figma-001',
    'IN-20260613-api-001',
    'IN-20260613-meeting-001',
    'IN-20260613-qa-001',
  ],
  decisionsFile: '_meta/decision-log.md',
  decisionsMustStayOpen: ['D-001', 'D-003', 'D-204'], // open 아니면 FAIL (LLM 은 닫지 않음)
  conflictsFile: '_meta/conflicts.md',
  conflictsMustStayOpen: ['C-001'],                    // open 아니면 FAIL
  gapsFile: 'global/component-gap-register.md',
  gapsMustNotBeAccepted: ['G-001'],                    // accepted 면 FAIL (승인은 사람)
  couponSpec: 'domains/coupons/screens/coupon-list/screen-spec.md',
  unknownsMustStayOpen: ['U-001'],                     // open 아니면 FAIL (Unknown 닫기는 사람)
  unknownsMustNotExist: ['U-002'],                     // 신설되면 FAIL (-001 회귀)
};

// L2 pipeline 코퍼스: 예제별 src 하위 경로. src='__no_src__' = 의도적으로 없는 경로(md-only fixture)
// → fake_hook_exists=false (golden 규약, multi-screen README). date 는 generated_at 고정용(정규화로 무관).
const L2_CORPUS = [
  { id: 'coupon-feature', src: 'src' },
  { id: 'multi-screen-dry-run', src: '__no_src__' },
];

// run-metadata.json 읽기 (expect: pass|xfail, reason, expected_failures). 파일이 없으면 기본 {}(=pass).
// 깨진 JSON / 잘못된 expect / 비정상 compare_against·actual / 잘못된 expected_failures 형식은
// 조용히 넘기지 않고 설정 오류로 던진다 (main 이 exit 2 로 처리). 메타데이터 드리프트를 일찍 드러낸다.
function readRunMeta(runId, runDir) {
  const raw = readFileSafe(path.join(runDir, 'run-metadata.json'));
  if (raw == null) return {};
  let meta;
  try {
    meta = JSON.parse(raw) || {};
  } catch (e) {
    throw new Error(`${runId}/run-metadata.json JSON 파싱 실패: ${e.message}`);
  }
  if (meta.expect !== undefined && meta.expect !== 'pass' && meta.expect !== 'xfail') {
    throw new Error(`${runId}/run-metadata.json expect 값이 잘못됨: ${JSON.stringify(meta.expect)} (pass|xfail 만 허용)`);
  }
  if (meta.actual !== undefined && meta.actual !== 'actual-llm-after') {
    throw new Error(`${runId}/run-metadata.json actual 값이 잘못됨: ${JSON.stringify(meta.actual)} (actual-llm-after 만 허용)`);
  }
  // compare_against 는 항상 LLM 정답지여야 한다 (human-final 비교 금지 — 요구사항 #1·#2).
  if (meta.compare_against !== undefined &&
      !String(meta.compare_against).replace(/\\/g, '/').endsWith('expected-llm-after')) {
    throw new Error(`${runId}/run-metadata.json compare_against 가 expected-llm-after 가 아님: ${JSON.stringify(meta.compare_against)}`);
  }
  // expected_failures: xfail witness 가 "어떤 이유로" 실패해야 하는지 고정 (선택). [{check, match}...].
  if (meta.expected_failures !== undefined) {
    if (!Array.isArray(meta.expected_failures)) {
      throw new Error(`${runId}/run-metadata.json expected_failures 는 배열이어야 함`);
    }
    for (const e of meta.expected_failures) {
      if (!e || typeof e.check !== 'string' || typeof e.match !== 'string') {
        throw new Error(`${runId}/run-metadata.json expected_failures 항목은 {check, match} 문자열이어야 함: ${JSON.stringify(e)}`);
      }
    }
  }
  return meta;
}

// path-backstop fixture 선언 읽기 (examples/path-backstop/cases.json). 부재면 [](하위호환 — 이 종류 생략).
// 깨진 JSON / 필수 필드(diff·state·expect.exit) 누락은 조용히 넘기지 않고 설정 오류로 던진다(main 이 exit 2).
// 경로(diff·state)는 PB_ROOT 기준 상대 → 절대경로로 해석(서브프로세스 cwd 무관).
function readPathBackstopCases() {
  const raw = readFileSafe(path.join(PB_ROOT, 'cases.json'));
  if (raw == null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`path-backstop/cases.json JSON 파싱 실패: ${e.message}`);
  }
  const cases = Array.isArray(parsed) ? parsed : parsed && parsed.cases;
  if (!Array.isArray(cases)) {
    throw new Error('path-backstop/cases.json 에 cases 배열이 없음');
  }
  return cases.map((c, i) => {
    if (!c || typeof c.diff !== 'string' || typeof c.state !== 'string' ||
        !c.expect || typeof c.expect.exit !== 'number') {
      throw new Error(`path-backstop/cases.json[${i}] 형식 오류 (diff·state·expect.exit 필수): ${JSON.stringify(c)}`);
    }
    return {
      id: c.id || `path-backstop-${i}`,
      kind: 'path-backstop',
      expectVerdict: 'pass',
      reason: c.note || '',
      scriptPath: FORBIDDEN_PATHS,
      diff: path.join(PB_ROOT, c.diff),
      docs: path.join(PB_ROOT, c.state),
      enforce: c.enforce === true,
      expect: { exit: c.expect.exit, violations: c.expect.violations },
    };
  });
}

// fixture 목록 구성 — kind: reconcile | integrity | pipeline | path-backstop.
function buildFixtures() {
  const fixtures = [];

  // golden 자기 검사: actual == expected (golden 이 불변식을 스스로 만족하는지 — golden 회귀 가드)
  fixtures.push({
    id: 'input-reconciliation',
    kind: 'reconcile',
    expectVerdict: 'pass',
    reason: 'golden(expected-llm-after) self-check',
    expectedDir: path.join(GOLDEN_IR, DF),
    actualDir: path.join(GOLDEN_IR, DF),
    manifest: RECON_MANIFEST,
  });

  // reconcile-input runs: actual-llm-after vs golden. 기대 판정은 run-metadata.json 에서.
  for (const runId of ['reconcile-input-001', 'reconcile-input-002']) {
    const runDir = path.join(RUNS, runId);
    const meta = readRunMeta(runId, runDir);
    fixtures.push({
      id: runId,
      kind: 'reconcile',
      expectVerdict: meta.expect === 'xfail' ? 'xfail' : 'pass',
      reason: meta.reason || '',
      expectedFailures: meta.expected_failures || [],
      expectedDir: path.join(GOLDEN_IR, DF),
      actualDir: path.join(runDir, 'actual-llm-after', DF),
      manifest: RECON_MANIFEST,
    });
  }

  // integrity fixtures (문서 생성 예제 + 구현 run) — 파싱 무결성 + 선언 리포트 존재.
  fixtures.push({
    id: 'coupon-feature',
    kind: 'integrity',
    expectVerdict: 'pass',
    docsDir: path.join(EXAMPLES, 'coupon-feature', DF),
  });
  fixtures.push({
    id: 'multi-screen-dry-run',
    kind: 'integrity',
    expectVerdict: 'pass',
    docsDir: path.join(EXAMPLES, 'multi-screen-dry-run', DF),
  });
  fixtures.push({
    id: 'implement-screen-001',
    kind: 'integrity',
    expectVerdict: 'pass',
    docsDir: path.join(RUNS, 'implement-screen-001', DF),
    requireReports: [
      path.join(RUNS, 'implement-screen-001', 'reports', 'expected-readiness.md'),
      path.join(RUNS, 'implement-screen-001', 'reports', 'expected-validation.md'),
    ],
  });

  // pipeline fixtures (L2) — state/readiness/validate 출력 재현 회귀.
  for (const ex of L2_CORPUS) {
    const dir = path.join(EXAMPLES, ex.id);
    fixtures.push({
      id: `${ex.id}:pipeline`,
      kind: 'pipeline',
      expectVerdict: 'pass',
      reason: 'L2 state/readiness/validate 출력 재현',
      docsDir: path.join(dir, DF),
      srcDir: path.join(dir, ex.src),
      date: '2026-06-13',
      expectedDir: path.join(dir, 'reports'),
    });
  }

  // path-backstop fixtures (forbidden-paths CLI 회귀 — cases.json 선언, 부재면 생략)
  for (const pb of readPathBackstopCases()) fixtures.push(pb);

  return fixtures;
}

// validate.mjs 는 CLI 전용(export 없음) → 서브프로세스로 --json 출력을 받는다.
// 위반이 있으면 exit 1 이라 execFileSync 가 throw 하지만 stdout 에 JSON 은 그대로 있다.
function runValidateJson(docsDir, srcDir) {
  let stdout = '';
  let err = null;
  try {
    stdout = execFileSync(
      process.execPath,
      [VALIDATE_SCRIPT, '--docs', docsDir, '--src', srcDir, '--json'],
      { encoding: 'utf8' },
    );
  } catch (e) {
    // validate 는 위반 시 exit 1 → throw 하지만 stdout 에 JSON 은 그대로 있다(정상 경로).
    stdout = (e && e.stdout) || '';
    err = e;
  }
  // 크래시/kill 등으로 JSON 이 아예 없으면 generic parse 오류 대신 exit/stderr 를 붙여 진단을 돕는다(N2).
  if (!stdout.trim()) {
    const status = err && err.status != null ? err.status : '?';
    const stderr = err && err.stderr ? String(err.stderr).trim().slice(0, 500) : '';
    throw new Error(`validate 서브프로세스가 JSON 을 출력하지 않음 (exit=${status})${stderr ? ': ' + stderr : ''}`);
  }
  return JSON.parse(stdout);
}

// 예제 파이프라인 실제 출력 — buildState(소스에서 재계산) → computeReadiness → validate(서브프로세스).
// 판정 로직 재구현 0: 생산 함수의 실제 출력을 그대로 모은다.
function computePipelineActual(fx) {
  const { state, inventory } = buildState({ docsDir: fx.docsDir, srcDir: fx.srcDir, date: fx.date });
  const policy = loadYamlOrExit(DEFAULTS.policy, 'policy', 'test-fixtures') || {};
  const manifest = loadYamlOrExit(DEFAULTS.manifest, 'manifest', 'test-fixtures') || {};
  const readiness = computeReadiness({ state, policy, ci: {}, manifest });
  const validate = runValidateJson(fx.docsDir, fx.srcDir);
  return { state: { state, inventory }, readiness, validate };
}

function runFixture(fx, update) {
  let res;
  if (fx.kind === 'reconcile') {
    res = runReconcileChecks(fx.expectedDir, fx.actualDir, fx.manifest);
  } else if (fx.kind === 'integrity') {
    res = runIntegrityChecks(fx);
  } else if (fx.kind === 'pipeline') {
    const actual = computePipelineActual(fx);
    if (update) {
      const written = writePipelineExpected({ expectedDir: fx.expectedDir, actual });
      res = { checks: written.map((f) => ({ check: 'L2:update', ok: true, message: `wrote ${f}` })), failed: 0 };
    } else {
      res = runPipelineChecks({ expectedDir: fx.expectedDir, actual });
    }
  } else if (fx.kind === 'path-backstop') {
    res = runPathBackstopCase(fx);
  } else {
    res = { checks: [{ check: 'kind', ok: false, message: `unknown fixture kind: ${fx.kind}` }], failed: 1 };
  }
  const checks = res.checks.slice();
  const failedChecks = checks.filter((c) => !c.ok);
  const checksFailed = failedChecks.length > 0;

  // verdict: expect=pass 는 통과 필수(실패=fatal). expect=xfail 은 strict witness —
  //  통과=xpass(치명), expected_failures 와 정확히 일치 실패=xfail(비치명), 그 외=xdrift(치명).
  let verdict;
  let fatal;
  if (fx.expectVerdict !== 'xfail') {
    verdict = checksFailed ? 'fail' : 'pass';
    fatal = checksFailed;
  } else if (!checksFailed) {
    verdict = 'xpass';
    fatal = true;
  } else {
    const ef = fx.expectedFailures || [];
    const hit = (c, e) => c.check === e.check && c.message.includes(e.match);
    const unexpected = failedChecks.filter((c) => !ef.some((e) => hit(c, e)));
    const missing = ef.filter((e) => !failedChecks.some((c) => hit(c, e)));
    if (ef.length && (unexpected.length || missing.length)) {
      verdict = 'xdrift';
      fatal = true;
      for (const c of unexpected) checks.push({ check: 'X:drift', ok: false, message: `예상 밖 실패: [${c.check}] ${c.message}` });
      for (const e of missing) checks.push({ check: 'X:drift', ok: false, message: `예상한 실패 사라짐: [${e.check}] ~"${e.match}"` });
    } else {
      verdict = 'xfail';
      fatal = false;
    }
  }
  return { ...fx, checks, failed: checks.filter((c) => !c.ok).length, verdict, fatal };
}

function render(results) {
  const lines = [];
  const tally = { pass: 0, xfail: 0, xpass: 0, xdrift: 0, fail: 0 };
  for (const r of results) {
    tally[r.verdict] = (tally[r.verdict] || 0) + 1;
    lines.push(`[${r.verdict.toUpperCase()}] ${r.id} (${r.kind})${r.reason ? ' — ' + r.reason : ''}`);
    for (const c of r.checks) lines.push(`    ${c.ok ? 'ok  ' : 'FAIL'} [${c.check}] ${c.message}`);
  }
  // 치명 = fail + xpass + xdrift (strict xfail). 모두 exit 1 을 부른다.
  const fatal = results.filter((r) => r.fatal).length;
  const summary =
    `test-fixtures — ${fatal ? fatal + ' FATAL' : 'PASS'} ` +
    `(${results.length} fixtures: ${tally.pass} pass, ${tally.xfail} xfail, ${tally.xpass} xpass, ${tally.xdrift} xdrift, ${tally.fail} fail)`;
  return { summary, body: lines.join('\n'), fatal };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const update = !!flags.update;

  let fixtures;
  try {
    fixtures = buildFixtures();
  } catch (e) {
    process.stderr.write(`test-fixtures: 설정 오류 — ${e.message}\n`);
    process.exit(2);
  }

  let results;
  try {
    results = fixtures.map((fx) => runFixture(fx, update));
  } catch (e) {
    process.stderr.write(`test-fixtures: 실행 오류 — ${e.message}\n`);
    process.exit(2);
  }

  const { summary, body, fatal } = render(results);

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: fatal === 0,
          update,
          summary,
          fixtures: results.map((r) => ({
            id: r.id,
            kind: r.kind,
            expect: r.expectVerdict,
            verdict: r.verdict,
            failed: r.failed,
            fatal: r.fatal,
            checks: r.checks,
          })),
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write((update ? '(--update: L2 스냅샷 갱신)\n' : '') + summary + '\n' + body + '\n');
  }

  process.exit(fatal === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
