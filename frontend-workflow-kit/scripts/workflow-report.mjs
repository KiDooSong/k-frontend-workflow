#!/usr/bin/env node
// workflow:report — Work Packet 실행의 evidence 를 수집해 Run Report 초안(markdown)을 생성하는 collector.
//
// 무엇이 아닌가 (PR3 범위 가드):
//  - 승인서 아님 · merge gate 아님 · 새 hard gate 아님 — evidence bundle(증거 묶음)이다.
//  - readiness 재계산/대체 아님(packet=readiness 출력에서 복사만). 판정 로직 재구현 0.
//  - Open Decision / Unknown / Conflict 를 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용).
//  - generated-file guard 를 직접 구현하지 않는다 — check-generated-files 를 서브프로세스로 호출해도 evidence(advisory) 일 뿐.
//  - 구현 실행 없음 · auto-fix 없음 · auto-retry 없음.
//  - review-artifact 가 있으면 advisory Review Evidence 로만 붙인다 (review 결과를 merge check 에 배선 금지).
//
// 수집 계약 (모두 서브프로세스 --json 출력을 복사):
//  - validate.mjs            → 구조 검사 evidence (errors/warnings/ok)
//  - forbidden-paths.mjs     → 경계 evidence (--diff 제공 시; 경계는 diff 로 판정)
//  - test-fixtures.mjs       → idempotency/회귀 evidence (--skip-tests 로 생략)
//  - check-generated-files.mjs → 생성물 표류 evidence (advisory, warning-first)
//  - git diff(name-status)   → --diff <file> 로 받아 ADDED/MODIFIED/REMOVED 표면화
//  - packet frontmatter/body → readiness_source · blocking · next_actions 그대로 인용
//
// exit: 0 = Run Report 생성 성공, 또는 lifecycle non-applicable packet의 정상 no-report 중단
//           (수집한 도구 결과가 fail 이어도 0 — fail 은 evidence 로 기록).
//       2 = 도구 오류 (packet 없음/파싱 실패, --diff/--review 파일 없음, --out 쓰기 실패 등).
//       exit 1 을 gate 의미로 쓰지 않는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs, DEFAULTS, readFileSafe, writeFile, splitFrontmatter, isCliEntry } from './lib/util.mjs';
import {
  extractSection,
  extractFencedTxt,
  extractReadinessSnapshot,
  extractNextActions,
  docsFromReadinessSource,
  parseNameStatus,
  parseFindings,
  buildReportModel,
  renderReportMarkdown,
  renderJsonEnvelope,
  toPosix,
} from './lib/workflow-report.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const VALIDATE_SCRIPT = path.join(SELF_DIR, 'validate.mjs');
const FORBIDDEN_SCRIPT = path.join(SELF_DIR, 'forbidden-paths.mjs');
const TESTFIX_SCRIPT = path.join(SELF_DIR, 'test-fixtures.mjs');
const CHECKGEN_SCRIPT = path.join(SELF_DIR, 'check-generated-files.mjs');

function fail(msg) {
  process.stderr.write(`workflow:report: ${msg}\n`);
  process.exit(2);
}

function requireStringFlag(flags, name) {
  const v = flags[name];
  if (typeof v !== 'string' || v.trim() === '') {
    fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  }
  return v.trim();
}

// 값이 필요한 선택 플래그. 부재면 undefined, 값 있으면 trim 문자열.
// bare(값 없는) 플래그는 parser 가 boolean true 로 두므로 exit 2 로 막는다 (도구 오류는 항상 exit 2).
function optStr(flags, name) {
  const v = flags[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.trim() === '') {
    fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  }
  return v.trim();
}

function isNonApplicablePacket(fm) {
  return (
    fm != null &&
    typeof fm === 'object' &&
    fm.readiness_applicable === false &&
    fm.screen_lifecycle === 'absorbed' &&
    fm.readiness_mode === null &&
    typeof fm.target_screen === 'string' &&
    fm.target_screen.trim() !== '' &&
    typeof fm.absorbed_into === 'string' &&
    fm.absorbed_into.trim() !== '' &&
    typeof fm.readiness_source === 'string' &&
    fm.readiness_source.trim() !== ''
  );
}

function renderNoReportEnvelope(fm) {
  return {
    packet_id: typeof fm.packet_id === 'string' ? fm.packet_id : null,
    target_screen: fm.target_screen,
    requested_mode: typeof fm.requested_mode === 'string' ? fm.requested_mode : null,
    readiness_mode: null,
    readiness_applicable: false,
    screen_lifecycle: 'absorbed',
    absorbed_into: fm.absorbed_into,
    report_applicable: false,
    out: null,
    next_action: `stop without Run Report; canonical screen is ${fm.absorbed_into} (do not auto-switch scope)`,
    note: 'non-executable absorbed packet — normal no-report result, not malformed input',
  };
}

function isoToday() {
  // 일반 node 스크립트 — 결정적 출력이 필요하면 --date 로 고정한다.
  return new Date().toISOString().slice(0, 10);
}

function relToCwd(p) {
  return toPosix(path.relative(process.cwd(), p)) || toPosix(p);
}

// 서브프로세스를 throw 없이 실행해 { code, stdout, stderr } 로 정규화한다.
// (validate/test 는 위반/실패 시 exit 1 로 throw 하지만 stdout 에 JSON 은 그대로 있다 → 복구한다.)
function runCapture(scriptPath, args) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: e && e.status != null ? e.status : null,
      stdout: e && e.stdout ? String(e.stdout) : '',
      stderr: e && e.stderr ? String(e.stderr) : '',
      spawnError: e && e.status == null ? e.message || String(e) : null,
    };
  }
}

function invocationLabel(scriptPath, args) {
  // 실제 상대 경로를 그대로 표기 — 소비 프로젝트에선 tools/frontend-workflow/scripts/... 로 정확히 나온다.
  // 공백 포함 토큰(예: 공백 있는 docs 경로)은 따옴표로 감싸 그대로 복사-실행 가능하게 한다.
  // 이미 "..." 로 감싼 토큰은 다시 감싸지 않는다(이중 따옴표 방지 — 멱등).
  const quote = (a) => (/\s/.test(a) && !/^".*"$/.test(a) ? `"${a}"` : a);
  return `node ${quote(relToCwd(scriptPath))} ${args.map(quote).join(' ')}`;
}

// --- 도구별 수집기 (결과를 정규화 — 판정 아님, evidence) -------------------
function collectValidate(docs, src, layout) {
  const args = ['--json', '--docs', docs, '--src', src];
  if (layout) args.push('--layout', layout);
  const invocation = invocationLabel(VALIDATE_SCRIPT, args);
  const r = runCapture(VALIDATE_SCRIPT, args);
  if (r.stdout.trim()) {
    try {
      const j = JSON.parse(r.stdout);
      return {
        tool: 'validate',
        invocation,
        exitCode: r.code,
        status: j.ok ? 'pass' : 'fail',
        ok: !!j.ok,
        errors: Array.isArray(j.errors) ? j.errors : [],
        warnings: Array.isArray(j.warnings) ? j.warnings : [],
      };
    } catch {
      /* JSON 아님 → error 로 */
    }
  }
  return {
    tool: 'validate',
    invocation,
    exitCode: r.code,
    status: 'error',
    ok: null,
    errorText: (r.stderr || r.spawnError || 'no JSON output').toString().trim().slice(0, 600),
  };
}

function collectForbidden(diffFile, docs, root, layout) {
  if (!diffFile) {
    return { tool: 'forbidden-paths', invocation: null, exitCode: null, status: 'not-collected', ok: null, reason: 'no --diff (경계는 diff 로 판정; diff 미제공)' };
  }
  const args = ['--json', '--diff', diffFile];
  if (docs) args.push('--docs', docs);
  if (root) args.push('--root', root);
  if (layout) args.push('--layout', layout);
  const invocation = invocationLabel(FORBIDDEN_SCRIPT, args);
  const r = runCapture(FORBIDDEN_SCRIPT, args);
  if (r.stdout.trim()) {
    try {
      const j = JSON.parse(r.stdout);
      return {
        tool: 'forbidden-paths',
        invocation,
        exitCode: r.code,
        status: j.ok ? 'pass' : 'fail',
        ok: !!j.ok,
        violations: Array.isArray(j.violations) ? j.violations : [],
        guarded: Array.isArray(j.guarded_surface) ? j.guarded_surface : [],
      };
    } catch {
      /* fallthrough */
    }
  }
  return {
    tool: 'forbidden-paths',
    invocation,
    exitCode: r.code,
    status: 'error',
    ok: null,
    errorText: (r.stderr || r.spawnError || 'no JSON output').toString().trim().slice(0, 600),
  };
}

function collectTests(skip) {
  if (skip) {
    return { tool: 'test-fixtures', invocation: null, exitCode: null, status: 'skipped', ok: null, reason: '--skip-tests' };
  }
  const args = ['--json'];
  const invocation = invocationLabel(TESTFIX_SCRIPT, args);
  const r = runCapture(TESTFIX_SCRIPT, args);
  if (r.stdout.trim()) {
    try {
      const j = JSON.parse(r.stdout);
      return {
        tool: 'test-fixtures',
        invocation,
        exitCode: r.code,
        status: j.ok ? 'pass' : 'fail',
        ok: !!j.ok,
        summary: j.summary || '',
        fixtures: Array.isArray(j.fixtures) ? j.fixtures.length : 0,
      };
    } catch {
      /* fallthrough */
    }
  }
  return {
    tool: 'test-fixtures',
    invocation,
    exitCode: r.code,
    status: 'error',
    ok: null,
    errorText: (r.stderr || r.spawnError || 'no JSON output').toString().trim().slice(0, 600),
  };
}

function collectCheckGenerated(docs, src, layout) {
  const args = ['--json', '--docs', docs, '--src', src];
  if (layout) args.push('--layout', layout);
  const invocation = invocationLabel(CHECKGEN_SCRIPT, args);
  const r = runCapture(CHECKGEN_SCRIPT, args);
  if (r.stdout.trim()) {
    try {
      const j = JSON.parse(r.stdout);
      return {
        tool: 'check-generated',
        invocation,
        exitCode: r.code,
        status: j.ok ? 'pass' : 'mismatch',
        ok: !!j.ok,
        results: Array.isArray(j.results) ? j.results : [],
        summary: j.summary || {},
      };
    } catch {
      /* fallthrough */
    }
  }
  return {
    tool: 'check-generated',
    invocation,
    exitCode: r.code,
    status: 'error',
    ok: null,
    errorText: (r.stderr || r.spawnError || 'no JSON output').toString().trim().slice(0, 600),
  };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(
      'workflow:report — Work Packet 실행 evidence 를 수집해 Run Report 초안을 만든다 (evidence bundle, 게이트 아님).\n' +
        '필수: --packet <path>\n' +
        '선택: --out <path> --docs <dir> --src <dir> --layout <path> --diff <name-status.txt> --review <path> --skip-tests --json --date YYYY-MM-DD --seq NNN\n' +
        'lifecycle: readiness_applicable=false absorbed packet은 report를 만들지 않고 정상 no-report(exit 0)로 종료.\n',
    );
    return; // help 도 자연 종료(exit 0) — process.exit(0) 금지 계약(cli-stdout-flush.test.mjs)
  }

  const packetFlag = requireStringFlag(flags, 'packet');
  const outFlag = optStr(flags, 'out');
  const docsFlag = optStr(flags, 'docs');
  const srcFlag = optStr(flags, 'src');
  const layoutFlag = optStr(flags, 'layout');
  const diffFlag = optStr(flags, 'diff');
  const reviewFlag = optStr(flags, 'review');
  const skipTests = !!flags['skip-tests'];
  const date = optStr(flags, 'date') ?? isoToday();
  const seq = optStr(flags, 'seq') ?? '001';

  // 1) packet 읽기 + 파싱 (입력 오류는 exit 2).
  const packetPath = path.resolve(packetFlag);
  const packetRaw = readFileSafe(packetPath);
  if (packetRaw == null) fail(`packet 파일 없음: ${relToCwd(packetPath)}`);
  const { data: fm, body, hasFrontmatter, parseError } = splitFrontmatter(packetRaw);
  if (!hasFrontmatter) fail(`packet 에 frontmatter(---) 없음 — Work Packet 형식 아님: ${relToCwd(packetPath)}`);
  if (parseError) fail(`packet frontmatter YAML 파싱 실패: ${relToCwd(packetPath)} — ${parseError}`);
  if (fm.readiness_applicable === false) {
    if (!isNonApplicablePacket(fm)) {
      fail(
        `packet lifecycle sentinel 손상 — readiness_applicable=false 는 screen_lifecycle=absorbed, readiness_mode=null, target_screen/absorbed_into/readiness_source 문자열이 필요: ${relToCwd(packetPath)}`,
      );
    }
    const envelope = renderNoReportEnvelope(fm);
    if (flags.json) {
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    } else {
      process.stdout.write(
        `workflow:report: no report for absorbed source ${fm.target_screen}; canonical screen is ${fm.absorbed_into} (normal stop, scope not auto-switched)\n`,
      );
    }
    process.exitCode = 0;
    return;
  }
  for (const k of ['target_screen', 'readiness_mode', 'readiness_source']) {
    if (typeof fm[k] !== 'string' || fm[k].trim() === '') {
      fail(`packet frontmatter 에 ${k}(string) 없음 — Work Packet 형식 아님: ${relToCwd(packetPath)}`);
    }
  }
  const allowedPaths = extractFencedTxt(extractSection(body, 'Allowed Paths'));
  const forbiddenPaths = extractFencedTxt(extractSection(body, 'Forbidden Paths'));
  const blockingRaw = extractSection(body, 'Blocking Items') || '';
  const nextActions = extractNextActions(body);
  const snapshot = extractReadinessSnapshot(body);

  // 2) docs/src/root 유도: 플래그 우선 → packet readiness_source 의 --docs → DEFAULTS.
  //    docs 를 posix 로 정규화해 Windows 역슬래시 경로에서도 root/src 유도가 동작하게 한다.
  const docs = toPosix(docsFlag || docsFromReadinessSource(fm.readiness_source) || DEFAULTS.docs);
  const docsRootMatch = /^(.*)\/docs\/frontend-workflow\/?$/.exec(docs);
  const projectRoot = docsRootMatch ? docsRootMatch[1] : null; // 예: examples/coupon-feature (monorepo 프로젝트 루트)
  let src;
  if (srcFlag) src = toPosix(srcFlag);
  else if (projectRoot) src = `${projectRoot}/src`;
  else src = DEFAULTS.src;

  // 3) diff 읽기 (제공 시). 명시된 파일이 없으면 도구 오류(exit 2).
  let diff = null;
  let diffProvided = false;
  let diffResolved = null;
  if (diffFlag) {
    diffResolved = path.resolve(diffFlag);
    const diffText = readFileSafe(diffResolved);
    if (diffText == null) fail(`--diff 파일 없음: ${relToCwd(diffResolved)}`);
    diff = parseNameStatus(diffText);
    diffProvided = true;
  }

  // 4) review 읽기 (제공 시 advisory). 명시된 파일이 없으면 도구 오류(exit 2).
  let review = null;
  let reviewResolved = null;
  if (reviewFlag) {
    reviewResolved = path.resolve(reviewFlag);
    const reviewRaw = readFileSafe(reviewResolved);
    if (reviewRaw == null) fail(`--review 파일 없음: ${relToCwd(reviewResolved)}`);
    const { data: rfm, body: rbody } = splitFrontmatter(reviewRaw);
    review = { frontmatter: rfm || {}, findings: parseFindings(rbody) };
  }

  // 5) 도구 evidence 수집 (서브프로세스 — 실패해도 report 는 성공).
  //    --layout 은 서브프로세스 cwd 모호성을 피하려 절대경로로 leaf(validate·forbidden·check-generated)에
  //    전달한다(packet 의 --layout 규약과 동일). 누락 시 leaf 는 기본(expo) 레이아웃으로 해소돼 custom
  //    layout 에서 packet/report 와 leaf 가 서로 다른 프로파일을 보는 split-brain 이 된다.
  //    test-fixtures 는 전체 fixture harness 이므로 --layout 을 넘기지 않는다(기존 동작 유지).
  const layoutResolved = layoutFlag ? path.resolve(layoutFlag) : null;
  const validate = collectValidate(docs, src, layoutResolved);
  const forbidden = collectForbidden(diffResolved, docs, projectRoot || undefined, layoutResolved);
  const idempotency = collectTests(skipTests);
  const checkgen = collectCheckGenerated(docs, src, layoutResolved);

  // 6) 모델 빌드 + 렌더.
  const outPath = outFlag ? path.resolve(outFlag) : null;
  const model = buildReportModel({
    packet: { frontmatter: fm, body, allowedPaths, forbiddenPaths, blockingRaw, nextActions, snapshot },
    paths: {
      packetRel: relToCwd(packetPath),
      outRel: outPath ? relToCwd(outPath) : null,
      docs: toPosix(docs),
      src: toPosix(src),
      diffRel: diffResolved ? relToCwd(diffResolved) : null,
      reviewRel: reviewResolved ? relToCwd(reviewResolved) : null,
    },
    diff,
    diffProvided,
    validate,
    forbidden,
    idempotency,
    checkgen,
    review,
    date,
    seq,
  });

  const md = renderReportMarkdown(model);

  // 7) 출력: --out 이면 파일로, stdout 은 --json(봉투) 또는 markdown(또는 짧은 확인줄).
  if (outPath) {
    try {
      writeFile(outPath, md);
    } catch (e) {
      // --out 은 사용자 입력 — 디렉터리/권한 실패는 미처리 예외(exit 1)가 아니라 도구 오류(exit 2)로.
      fail(`--out 쓰기 실패 "${relToCwd(outPath)}": ${e.message}`);
    }
    model.out_rel = relToCwd(outPath);
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(renderJsonEnvelope(model), null, 2) + '\n');
  } else if (!outPath) {
    process.stdout.write(md);
  } else {
    process.stdout.write(
      `workflow:report: wrote ${model.out_rel} (validate=${validate.status}, forbidden=${forbidden.status}, idempotency=${idempotency.status}, check-generated=${checkgen.status}, blockers=${model.blocking_summary.total}) — evidence bundle, 게이트 아님\n`,
    );
  }

  // Run Report 생성 성공 = exit 0. 수집 도구 fail 로 exit 1 을 내지 않는다.
  // process.exit() 금지(stdout pipe 8KB flush) — readiness-eval.mjs 의 flush-safe 자연 종료 계약.
  process.exitCode = 0;
}

if (isCliEntry(import.meta.url)) main();
