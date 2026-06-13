#!/usr/bin/env node
// test-fixtures.mjs — golden fixture 비교 하니스 (MVP-B Phase 0).
// 기존 예제/드라이런 출력물을 반복 가능한 회귀 검사로 굳힌다. 손으로 하던 hash+grep 대조를 코드화한다.
//
// 검사 대상 (manifest 기반):
//   [reconcile] expected-llm-after ↔ actual-llm-after 의 올리기만(raise-only) 불변식 대조
//      - input-reconciliation     golden(expected-llm-after) 자기 검사            → PASS 기대
//      - reconcile-input-001       pre-fix 증거 run (U-001 닫음 + U-002 신설)        → FAIL 기대(xfail)
//      - reconcile-input-002       post-fix canonical run                           → PASS 요구
//   [integrity] 문서 생성 예제/구현 run 의 파싱 무결성 + 선언 산출물 존재
//      - coupon-feature · multi-screen-dry-run · implement-screen-001
//
// 불변식:
//  - reconcile 비교 대상은 항상 expected-llm-after. human-final(expected-after)을 LLM 출력처럼
//    비교하지 않는다 (요구사항 #1·#2 — GOLDEN_IR 로 고정 + run-metadata compare_against 검증).
//  - reconcile-input-001 의 실패는 "의도된 증거"다 (요구사항 #3). 기대 판정은 run-metadata.json 의
//    expect 필드로 데이터화(expect=xfail → 실패=비치명). strict witness:
//      · 통과(xpass) → 치명. · 선언된 expected_failures 와 정확히 일치하게 실패 → xfail(비치명).
//      · 다른 이유로 실패(추가/누락=xdrift) → 치명. 즉 "올바른 이유로 실패"할 때만 증거로 인정한다.
//  - reconcile-input-002 는 통과 필수 (요구사항 #4 — expect=pass, 실패 시 치명).
//  - 경로 경계(forbidden_paths) 검사는 하지 않는다 — Lane B 소관 (요구사항 #6).
//  - readiness/validate 판정을 재구현하지 않는다(게이트 단일 출처 보존).
//
// 사용: node scripts/test-fixtures.mjs [--json]
// exit: 0 = 모든 fixture 가 기대대로(pass 통과 + xfail 가 선언된 이유로 실패)
//       · 1 = 치명(pass 실패 / xfail 이 통과=xpass / xfail 이 다른 이유로 실패=xdrift)
//       · 2 = 설정/IO 오류(깨진 run-metadata.json 등).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, KIT_ROOT, readFileSafe } from './lib/util.mjs';
import { runReconcileChecks, runIntegrityChecks } from './lib/test-fixture.mjs';

const DF = 'docs/frontend-workflow';                 // expected/actual 공통 하위 경로
const REPO_ROOT = path.resolve(KIT_ROOT, '..');       // temp/runs 는 킷 밖(레포 루트)에 있다
const EXAMPLES = path.join(KIT_ROOT, 'examples');
const RUNS = path.join(REPO_ROOT, 'temp', 'runs');
const GOLDEN_IR = path.join(EXAMPLES, 'input-reconciliation', 'expected-llm-after');

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

// fixture 목록 구성 — kind: reconcile | integrity.
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

  // integrity fixtures (문서 생성 예제 + 구현 run)
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

  return fixtures;
}

function runFixture(fx) {
  const res = fx.kind === 'reconcile'
    ? runReconcileChecks(fx.expectedDir, fx.actualDir, fx.manifest)
    : runIntegrityChecks(fx);
  const checks = res.checks.slice();
  const failedChecks = checks.filter((c) => !c.ok);
  const checksFailed = failedChecks.length > 0;

  // verdict 판정.
  //  expect=pass : 통과 필수 — 실패=fail(치명).
  //  expect=xfail: strict 증거 witness —
  //    · 통과(xpass)                          → 치명(회귀를 더는 증명 못 함).
  //    · expected_failures 와 정확히 일치 실패 → xfail(비치명; 의도된 증거).
  //    · 그 외 실패(추가/누락=xdrift)          → 치명(witness 가 다른 회귀를 가릴 수 있음).
  //    · expected_failures 미선언 시 어떤 실패든 xfail(하위호환).
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

  let fixtures;
  try {
    fixtures = buildFixtures();
  } catch (e) {
    process.stderr.write(`test-fixtures: 설정 오류 — ${e.message}\n`);
    process.exit(2);
  }

  const results = fixtures.map(runFixture);
  const { summary, body, fatal } = render(results);

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: fatal === 0,
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
    process.stdout.write(summary + '\n' + body + '\n');
  }

  process.exit(fatal === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
