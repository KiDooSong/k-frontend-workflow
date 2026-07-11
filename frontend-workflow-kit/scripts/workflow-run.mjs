#!/usr/bin/env node
// workflow:run — workflow:packet(+report)를 엮어 auto-stop 상태를 내는 orchestrator.
//
// 무엇이 아닌가 (PR4 범위 가드):
//  - 자동 구현기 아님 — 구현 실행 0 · auto-fix 0 · auto-retry 0 (v1 = 순수 auto-stop).
//  - 새 게이트 0 · readiness 재계산/대체 0 (packet/report 봉투를 서브프로세스로 소비만).
//  - Open Decision / Unknown / Conflict 를 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용).
//  - HALT 은 종료 상태이지 게이트가 아니다 — 어떤 HALT 도 머지를 차단하지 않는다(차단은 Open Decision readiness cap + 사람).
//  - Ambiguity / Safe To Proceed? 를 파싱해 exit 1 로 내지 않는다. review 결과를 merge approval/check 에 배선하지 않는다.
//
// 상태기계 (이 PR: 4상태, IMPLEMENT/auto-fix 전이 없음):
//  - HALT_AMBIGUITY      packet 봉투가 안 깨끗(over_ceiling·!mode_known·미해결 Open Decision/Unknown) → 구현 전 정지(기본 경로). exit 0.
//  - HALT_READY_FOR_WORK 게이트 깨끗 + report 없음 → 사람/지정 구현자 판단 대기(구현 허가 아님). exit 0.
//  - DONE_PENDING_REVIEW 게이트 깨끗 + --diff(외부 구현 evidence) → report 생성 → 사람 리뷰 대기. exit 0.
//  - HALT_TOOL_ERROR     packet/report 서브프로세스 실패(exit≠0 / non-JSON, fail-closed). exit 2.
//
// exit: 0 = 정상 auto-stop 상태(HALT_AMBIGUITY/READY/DONE). 2 = 도구/입력 오류(필수 플래그 누락, 서브프로세스 실패, --out 쓰기 실패 등).
//       exit 1 을 gate/HALT 의미로 쓰지 않는다.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs, writeFile, readFileSafe, yamlParse, DEFAULTS, isCliEntry } from './lib/util.mjs';
import {
  STATES,
  STATE_EXIT,
  isPacketClean,
  buildRunModel,
  renderStatusMarkdown,
  renderJsonEnvelope,
  toPosix,
} from './lib/workflow-run.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKET_SCRIPT = path.join(SELF_DIR, 'workflow-packet.mjs');
const REPORT_SCRIPT = path.join(SELF_DIR, 'workflow-report.mjs');

function fail(msg) {
  process.stderr.write(`workflow:run: ${msg}\n`);
  process.exit(2);
}

function requireStringFlag(flags, name) {
  const v = flags[name];
  if (typeof v !== 'string' || v.trim() === '') {
    fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  }
  return v.trim();
}

// 값이 필요한 선택 플래그. 부재면 undefined, 값 있으면 trim. bare 플래그(boolean true)는 exit 2 로 막는다(도구 오류는 항상 exit 2).
function optStr(flags, name) {
  const v = flags[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.trim() === '') {
    fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  }
  return v.trim();
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function relToCwd(p) {
  return toPosix(path.relative(process.cwd(), p)) || toPosix(p);
}

// mode 사다리(policy.order)를 읽어 --requested-mode 가 알려진 모드인지 대조한다.
// readiness 재계산이 아니다 — 봉투의 mode_known 은 readiness 모드 기준이라 미지/오타 requested 모드를 못 잡으므로,
// orchestrator 가 자기 인자를 사다리와 대조해 fail-closed 한다(미지 requested → HALT_AMBIGUITY).
// packet 과 동일한 policy(기본 또는 --policy)를 읽어 일관성을 유지한다.
function loadModeOrder(policyFlag) {
  const p = policyFlag ? path.resolve(policyFlag) : DEFAULTS.policy;
  const raw = readFileSafe(p);
  if (raw == null) return [];
  try {
    const data = yamlParse(raw);
    return Array.isArray(data && data.order) ? data.order : [];
  } catch {
    return [];
  }
}

// 서브프로세스를 throw 없이 실행해 { code, stdout, stderr, json } 으로 정규화한다.
// (sibling 들은 --json 시 stdout 에 봉투만, stderr 에 진단만 — 'exit≠0 또는 non-JSON = 도구 오류' 가 건전한 탐지법.)
function runJson(scriptPath, args) {
  let code = 0;
  let stdout = '';
  let stderr = '';
  try {
    // stdio 를 명시적으로 pipe 해 자식의 stderr 가 콘솔로 새지 않게 한다(기본은 상속).
    // 실패 시 e.stderr 로 캡처되어 HALT_TOOL_ERROR 사유에 그대로 보존된다.
    stdout = execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e && e.status != null ? e.status : null;
    stdout = e && e.stdout ? String(e.stdout) : '';
    stderr = e && e.stderr ? String(e.stderr) : e && e.message ? String(e.message) : '';
  }
  let json = null;
  if (stdout.trim()) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  return { code, stdout, stderr, json };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(
      'workflow:run — workflow:packet(+report)를 엮어 auto-stop 상태를 낸다 (구현/auto-fix/auto-retry 0, 게이트 아님).\n' +
        '필수: --screen <ID> --requested-mode <mode>\n' +
        '선택: --out <dir> --docs <dir> --src <dir> --readiness <path> --policy <path> --manifest <path> --layout <path> --domain <name>\n' +
        '       --diff <name-status.txt> --review <path> --skip-tests --json --date YYYY-MM-DD --seq NNN --owner <name>\n' +
        '상태: HALT_AMBIGUITY | HALT_READY_FOR_WORK | DONE_PENDING_REVIEW (exit 0) · HALT_TOOL_ERROR (exit 2)\n',
    );
    return; // help 도 자연 종료(exit 0) — process.exit(0) 금지 계약(cli-stdout-flush.test.mjs)
  }

  const screen = requireStringFlag(flags, 'screen');
  const requestedMode = requireStringFlag(flags, 'requested-mode');
  const outDir = optStr(flags, 'out');
  const docs = optStr(flags, 'docs');
  const src = optStr(flags, 'src');
  const policy = optStr(flags, 'policy');
  const manifest = optStr(flags, 'manifest');
  const layout = optStr(flags, 'layout');
  const readiness = optStr(flags, 'readiness');
  const domain = optStr(flags, 'domain');
  const diff = optStr(flags, 'diff');
  const review = optStr(flags, 'review');
  const skipTests = !!flags['skip-tests'];
  const date = optStr(flags, 'date') ?? isoToday();
  const seq = optStr(flags, 'seq') ?? '001';
  const owner = optStr(flags, 'owner');

  // 출력 경로: --out <dir> 이면 packet/report 는 그 디렉터리 안, 상태 요약은 <dir>.md (헤드라인 산출물).
  // --out 없으면 packet/report 는 임시 디렉터리(소비용), 상태는 stdout.
  const outDirResolved = outDir ? path.resolve(outDir) : null;
  // --layout 은 서브프로세스 cwd 모호성을 피하려 절대경로로 children(packet·report)에 전달한다
  //   (packet/report → leaf 의 --layout 규약과 동일). 누락 시 children 은 기본(expo) 레이아웃으로 해소돼
  //   custom layout 에서 orchestrator/leaf 가 서로 다른 프로파일을 보는 split-brain 이 된다.
  const layoutResolved = layout ? path.resolve(layout) : null;
  const packetPath = outDirResolved
    ? path.join(outDirResolved, 'work-packet.md')
    : path.join(os.tmpdir(), `workflow-run-${seq}-work-packet.md`);
  const reportPath = outDirResolved
    ? path.join(outDirResolved, 'run-report.md')
    : path.join(os.tmpdir(), `workflow-run-${seq}-run-report.md`);
  // 상태 요약은 <dir>.md (헤드라인 산출물 — 검증 명령의 --out <dir> 이 <dir>.md 를 만든다).
  // basename/dirname 으로 만들어 drive-root('C:\\') 같은 병리적 --out 도 안전 처리(C:.md 로 깨지지 않게).
  let statusPath = null;
  if (outDirResolved) {
    const base = path.basename(outDirResolved);
    statusPath = base ? path.join(path.dirname(outDirResolved), base + '.md') : path.join(outDirResolved, 'run-status.md');
  }

  // 상태 확정 → 모델 빌드 → 상태 파일 쓰기/출력 → exit.
  const finalize = (state, { packet = null, report = null, reason = null, requestedKnown = true } = {}) => {
    const model = buildRunModel({
      screen,
      requestedMode,
      state,
      packet,
      report,
      paths: {
        packet: packet && outDirResolved ? relToCwd(packetPath) : null,
        report: report && outDirResolved ? relToCwd(reportPath) : null,
        status: statusPath ? relToCwd(statusPath) : null,
        docs,
      },
      reason,
      date,
      seq,
      requestedKnown,
    });
    const md = renderStatusMarkdown(model);
    if (statusPath) {
      try {
        writeFile(statusPath, md);
      } catch (e) {
        // --out 은 사용자 입력 — 쓰기 실패는 미처리 예외(exit 1)가 아니라 도구 오류(exit 2)로.
        fail(`--out 상태 파일 쓰기 실패 "${relToCwd(statusPath)}": ${e.message}`);
      }
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify(renderJsonEnvelope(model), null, 2) + '\n');
    } else if (!statusPath) {
      process.stdout.write(md);
    } else {
      process.stdout.write(
        `workflow:run: ${state} (exit ${STATE_EXIT[state]}) — ${relToCwd(statusPath)}` +
          ` · packet=${model.paths.packet || '—'} · report=${model.paths.report || '—'}\n`,
      );
    }
    // process.exit() 금지(stdout pipe 8KB flush) — readiness-eval.mjs 의 flush-safe 자연 종료 계약.
    // 모든 호출부는 finalize 직후 return 하므로 자연 종료가 exit code 를 그대로 반영한다.
    process.exitCode = STATE_EXIT[state];
  };

  // 1) workflow:packet 생성 (봉투 + markdown 파일). --out 으로 packet 파일을 남겨 report 입력으로도 쓴다.
  const packetArgs = ['--screen', screen, '--requested-mode', requestedMode, '--out', packetPath, '--json'];
  if (readiness) packetArgs.push('--readiness', readiness);
  if (docs) packetArgs.push('--docs', docs);
  if (policy) packetArgs.push('--policy', policy);
  if (manifest) packetArgs.push('--manifest', manifest);
  if (layoutResolved) packetArgs.push('--layout', layoutResolved);
  if (domain) packetArgs.push('--domain', domain);
  if (owner) packetArgs.push('--owner', owner);
  packetArgs.push('--date', date, '--seq', seq);

  const pk = runJson(PACKET_SCRIPT, packetArgs);
  if (pk.code !== 0 || !pk.json) {
    const why = (pk.stderr || '').trim() || `exit=${pk.code == null ? '?' : pk.code}, JSON 출력 없음`;
    finalize(STATES.HALT_TOOL_ERROR, { reason: `workflow:packet 실패: ${why}` });
    return;
  }
  const packet = pk.json;

  // 2) --requested-mode 가 알려진 모드인지 대조 (봉투 mode_known 은 readiness 모드 기준이라 미지/오타 requested 모드를 못 잡음).
  const modeOrder = loadModeOrder(policy);
  const requestedKnown = modeOrder.length === 0 ? true : modeOrder.includes(requestedMode);

  // 3) packet 봉투 분기. 안 깨끗하거나 requested 모드가 미지값이면 → HALT_AMBIGUITY (기본 경로 · report 생성 안 함 · fail-closed).
  if (!isPacketClean(packet) || !requestedKnown) {
    finalize(STATES.HALT_AMBIGUITY, { packet, requestedKnown });
    return;
  }

  // 게이트 깨끗: --diff(외부 구현 evidence) 없으면 HALT_READY_FOR_WORK, 있으면 report 생성 → DONE_PENDING_REVIEW.
  if (!diff) {
    finalize(STATES.HALT_READY_FOR_WORK, { packet });
    return;
  }

  const reportArgs = ['--packet', packetPath, '--out', reportPath, '--diff', diff, '--json'];
  if (docs) reportArgs.push('--docs', docs);
  if (src) reportArgs.push('--src', src);
  if (layoutResolved) reportArgs.push('--layout', layoutResolved);
  if (review) reportArgs.push('--review', review);
  if (skipTests) reportArgs.push('--skip-tests');
  reportArgs.push('--date', date, '--seq', seq);

  const rp = runJson(REPORT_SCRIPT, reportArgs);
  if (rp.code !== 0 || !rp.json) {
    const why = (rp.stderr || '').trim() || `exit=${rp.code == null ? '?' : rp.code}, JSON 출력 없음`;
    finalize(STATES.HALT_TOOL_ERROR, { packet, reason: `workflow:report 실패: ${why}` });
    return;
  }
  finalize(STATES.DONE_PENDING_REVIEW, { packet, report: rp.json });
}

if (isCliEntry(import.meta.url)) main();
