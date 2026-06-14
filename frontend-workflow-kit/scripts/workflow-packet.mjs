#!/usr/bin/env node
// workflow:packet — readiness 출력을 소비해 Work Packet 초안(markdown)을 생성하는 봉투(execution envelope).
//
// 무엇이 아닌가 (PR2 범위 가드):
//  - 새 source of truth 아님 · 새 gate 아님 · readiness 재계산/대체 아님(출력 복사만).
//  - Open Decision / Unknown / Conflict 를 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용).
//  - generated-file guard 판단을 직접 구현하지 않는다 (check-generated-files 를 호출해도 evidence — gate 아님).
//  - 구현 실행 없음 · auto-fix 없음 · auto-run 없음.
//
// 소비 계약:
//  - --readiness <path> 가 주어지면 그 파일(JSON 또는 YAML)을 우선 소비한다.
//  - 없으면 기존 readiness.mjs 를 **서브프로세스**(--json)로 호출해 출력을 얻는다 (로직 import/재구현 금지).
//
// exit: 0 = packet 생성 성공(천장 초과/Safe?=no 여도 0 — 경고는 markdown 에만). 2 = 입력/도구 오류(파일 없음·JSON 파싱 실패 등).
//       Safe To Proceed?=no 또는 requested>readiness 를 이유로 exit 1 을 내지 않는다.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs, DEFAULTS, KIT_ROOT, readFileSafe, writeFile, yamlParse } from './lib/util.mjs';
import { buildPacketModel, renderPacketMarkdown, renderJsonEnvelope } from './lib/workflow-packet.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const READINESS_SCRIPT = path.join(SELF_DIR, 'readiness.mjs');
const AMBIGUITY_DOC = path.join(KIT_ROOT, 'docs', 'workflows', 'ambiguity-triage.md');

function fail(msg) {
  process.stderr.write(`workflow:packet: ${msg}\n`);
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
// bare(값 없는) 플래그는 parser 가 boolean true 로 두므로 exit 2 로 막는다 — path.resolve(true) 등
// 미처리 TypeError 로 새는 exit 1 을 차단(도구 오류는 항상 exit 2).
function optStr(flags, name) {
  const v = flags[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.trim() === '') {
    fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  }
  return v.trim();
}

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function isoToday() {
  // workflow-packet 은 일반 node 스크립트 — 결정적 출력이 필요하면 --date 로 고정한다.
  return new Date().toISOString().slice(0, 10);
}

// readiness 출력(JSON keyed-by-screen 또는 단일 엔트리)에서 screen 엔트리를 꺼낸다.
function pickEntry(data, screen) {
  if (data && typeof data === 'object') {
    if (data[screen] && typeof data[screen] === 'object') return data[screen];
    if (typeof data.readiness_mode === 'string') return data; // 단일 엔트리로 저장된 파일
  }
  return null;
}

// 파싱은 되지만 형식이 깨진 readiness 엔트리(배열 자리에 비배열 등)를 fail-closed 로 거른다.
// 정규화/재계산 없음 — exit 2 로 멈춰 spread/iterate/join 의 미처리 TypeError(=exit 1)를 차단한다.
function validateEntry(entry, screen) {
  if (typeof entry.readiness_mode !== 'string' || entry.readiness_mode.trim() === '') {
    fail(`readiness entry '${screen}' 에 readiness_mode(string) 가 없음 — 손상된 readiness 출력`);
  }
  for (const k of ['allowed_paths', 'forbidden_paths', 'blocking', 'next_actions']) {
    if (entry[k] != null && !Array.isArray(entry[k])) {
      fail(`readiness entry '${screen}' 의 ${k} 가 배열이 아님 — 손상된 readiness 출력`);
    }
  }
}

function parseReadinessFile(p) {
  const raw = readFileSafe(p);
  if (raw == null) fail(`readiness 파일 없음: ${toPosix(p)}`);
  const t = raw.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* JSON 아님 → YAML 시도 */
  }
  try {
    return yamlParse(t);
  } catch (e) {
    fail(`readiness 파일 파싱 실패 (JSON·YAML 둘 다): ${toPosix(p)} — ${e.message}`);
  }
}

function runReadinessSubprocess({ screen, docs, policy, manifest }) {
  const args = [READINESS_SCRIPT, '--docs', docs, '--screen', screen, '--json'];
  if (policy) args.push('--policy', policy);
  if (manifest) args.push('--manifest', manifest);
  let out;
  try {
    out = execFileSync(process.execPath, args, { encoding: 'utf8' });
  } catch (e) {
    const code = e && e.status != null ? e.status : '?';
    const err = e && e.stderr ? String(e.stderr).trim().slice(0, 600) : '';
    fail(`readiness 서브프로세스 실패 (exit=${code})${err ? ': ' + err : ''}`);
  }
  try {
    return JSON.parse(out);
  } catch (e) {
    fail(`readiness 서브프로세스 JSON 파싱 실패: ${e.message}`);
  }
}

// policy.order 는 "모드 사다리 위치"용으로만 읽는다 — readiness 재계산이 아니다(천장·경로는 readiness 출력에서 옴).
function loadOrder(policyPath) {
  const raw = readFileSafe(policyPath);
  if (raw == null) return [];
  try {
    const data = yamlParse(raw);
    return Array.isArray(data && data.order) ? data.order : [];
  } catch (e) {
    fail(`policy YAML 파싱 실패: ${toPosix(policyPath)} — ${e.message}`);
  }
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(
      'workflow:packet — readiness 출력을 복사해 Work Packet 초안(markdown)을 만든다.\n' +
        '옵션: --screen <ID> --requested-mode <mode> [--readiness <path>] [--docs <dir>]\n' +
        '       [--policy <path>] [--manifest <path>] [--out <path>] [--json] [--date YYYY-MM-DD] [--owner <name>] [--seq NNN] [--domain <name>]\n',
    );
    process.exit(0);
  }

  const screen = requireStringFlag(flags, 'screen');
  const requestedMode = requireStringFlag(flags, 'requested-mode');
  const readinessFlag = optStr(flags, 'readiness');
  const docsFlag = optStr(flags, 'docs');
  const policyFlag = optStr(flags, 'policy');
  const manifestFlag = optStr(flags, 'manifest');
  const outFlag = optStr(flags, 'out');
  const domainFlag = optStr(flags, 'domain');
  const date = optStr(flags, 'date') ?? isoToday();
  const owner = optStr(flags, 'owner') ?? 'workflow:packet';
  const seq = optStr(flags, 'seq') ?? '001';

  const policyPath = policyFlag ? path.resolve(policyFlag) : DEFAULTS.policy;
  const manifestPath = manifestFlag ? path.resolve(manifestFlag) : DEFAULTS.manifest;

  // 1) readiness 소비: --readiness 파일 우선, 없으면 readiness.mjs 서브프로세스.
  let data;
  let readinessSource;
  if (readinessFlag) {
    const p = path.resolve(readinessFlag);
    data = parseReadinessFile(p);
    readinessSource = toPosix(path.relative(process.cwd(), p)) || readinessFlag;
  } else {
    const docs = docsFlag ? path.resolve(docsFlag) : path.resolve(DEFAULTS.docs);
    data = runReadinessSubprocess({ screen, docs, policy: policyPath, manifest: manifestPath });
    const docsLabel = toPosix(docsFlag || DEFAULTS.docs);
    readinessSource = `readiness.mjs --docs ${docsLabel} --screen ${screen} --json (computed ${date})`;
  }

  const entry = pickEntry(data, screen);
  if (!entry) {
    fail(`screen '${screen}' 을 readiness 출력에서 찾지 못함 (사용 가능: ${Object.keys(data || {}).join(', ') || '없음'})`);
  }
  validateEntry(entry, screen);

  // 2) 모델 빌드 + 렌더. policy.order 는 사다리 위치(표 행 + requested>readiness 비교)용으로만 사용.
  const order = loadOrder(policyPath);
  const outPath = outFlag ? path.resolve(outFlag) : null;
  const ambiguityLink = outPath
    ? toPosix(path.relative(path.dirname(outPath), AMBIGUITY_DOC))
    : toPosix(path.relative(process.cwd(), AMBIGUITY_DOC));

  const model = buildPacketModel({
    entry,
    screen,
    requestedMode,
    domain: domainFlag,
    readinessSource,
    order,
    date,
    owner,
    seq,
    ambiguityLink,
  });

  const md = renderPacketMarkdown(model);

  // 3) 출력: --out 이면 markdown 파일로, stdout 은 --json(봉투) 또는 markdown(또는 짧은 확인줄).
  if (outPath) {
    try {
      writeFile(outPath, md);
    } catch (e) {
      // --out 은 사용자 입력 — 디렉터리/권한/부모생성 실패는 미처리 예외(exit 1)가 아니라 도구 오류(exit 2)로.
      fail(`--out 쓰기 실패 "${toPosix(outPath)}": ${e.message}`);
    }
    model.out = toPosix(path.relative(process.cwd(), outPath));
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(renderJsonEnvelope(model), null, 2) + '\n');
  } else if (!outPath) {
    process.stdout.write(md);
  } else {
    const over = model.overCeiling ? ' — ⚠ requested>readiness (경고만, exit 0)' : '';
    process.stdout.write(
      `workflow:packet: wrote ${model.out} (readiness_mode=${model.readiness_mode}, requested=${model.requested_mode}${over})\n`,
    );
  }

  // packet 생성 성공 = exit 0. Safe?=no / requested>readiness 로 exit 1 을 내지 않는다.
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
