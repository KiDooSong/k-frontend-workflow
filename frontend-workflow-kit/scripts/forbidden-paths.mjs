#!/usr/bin/env node
// forbidden-paths.mjs — diff 기반 forbidden_paths backstop (2차 방어선).
// 설계: temp/proposals/diff-based-forbidden-paths-backstop.md
//
// forward(1차)  : readiness 다운그레이드 + pre-edit-mode-guard 훅 (편집 직전 live gate)
// backstop(2차) : 경계를 넘은 '변경(diff)' 을 사후에 잡는 그물 — 훅 없는 환경(CI/비-Claude/훅 off)용
//
// 핵심: validate.mjs(트리 스캔)와 분리한다. 트리 스캔은 이미 존재하는 src/api 를 오탐하므로,
//       backstop 은 변경분(diff)만 보고 이미 존재하는 파일은 무시한다.
//       모드 판정은 readiness.mjs(computeReadiness)를 import 해 소비한다 — 별도 판정 로직 0(불변식 #1).
//
// 규칙(설계 §4): diff(상태 인식)의 '쓰기'(A/M + rename 새 경로) 중
//   guarded surface 에 속하고 ∧ 프로젝트가 그 레이어를 열 자격(clearance)에 미도달 → 위반.
//
// exit code:
//   0  위반 없음 — 또는 --enforce 없이 위반을 경고로만 출력(warning-first).
//   1  --enforce 인데 위반 있음.
//   2  입력 오류(state/policy 부재, git 실행/ base ref 해석 실패).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, DEFAULTS, KIT_ROOT, loadYaml, readFileSafe, runCli } from './lib/util.mjs';
import { computeReadiness } from './readiness.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import {
  thresholdOf,
  isCleared,
  highestScreenMode,
  parseNameStatusText,
  writePathsOf,
  gitChangedRecords,
  stripRoot,
  globMatches,
  GitError,
  DiffParseError,
} from './lib/path-backstop.mjs';

// 정책의 {roles.X} 토큰을 물리 글롭으로 펼친 "resolved policy" 를 만든다(tier1 §6·§7).
//   path-backstop 의 thresholdOf/isCleared/covers/materializeGuardedSurface 는 글롭 *문자열*만
//   보므로, 토큰화된 정책을 그대로 주면 매칭이 깨진다. {domain} 은 보존한다(materializeGuardedSurface
//   가 도메인 union 을 직접 펼침 — §7-i). resolvePaths(p,{}) = {roles.X} 펼침 + {domain} 보존.
//   리터럴/blanket 글롭(src/**, src/features/**, openapi.yaml)은 resolvePaths 가 그대로 통과시키므로
//   결과는 토큰화 이전 정책과 BYTE-동치다(회귀 기준).
function resolvePolicyPaths(policy, layout) {
  const modes = policy && typeof policy.modes === 'object' && policy.modes ? policy.modes : {};
  const outModes = {};
  for (const [name, mode] of Object.entries(modes)) {
    outModes[name] = {
      ...mode,
      allowed_paths: layout.resolvePaths(mode.allowed_paths || [], {}),
      forbidden_paths: layout.resolvePaths(mode.forbidden_paths || [], {}),
    };
  }
  return { ...policy, modes: outModes };
}

// state.screens 에서 실제 도메인 리스트를 모은다(materializeGuardedSurface 의 {domain} union 입력).
// 도메인이 없으면 빈 배열 — 현 deriveGuardedSurface 가 domain-scoped 를 통째로 버리는 것과 동일 결과.
function domainsFromState(state) {
  const screens = (state && state.screens) || {};
  const set = new Set();
  for (const id of Object.keys(screens)) {
    const d = screens[id] && screens[id].domain;
    if (d != null && d !== '') set.add(d);
  }
  return [...set].sort();
}

// 위반 1건의 reason / would_clear 문구를 만든다(설계 §4 출력 규약).
function describeViolation(surface, policy, readinessOutput) {
  const isOpenApi = surface === 'openapi.yaml' || surface === 'openapi.yml';
  if (isOpenApi) {
    return {
      reason: `현재 정책에 ${surface} 를 allow 하는 모드가 없음 → 변경 시 항상 플래그`,
      would_clear: `정책 결정 필요: api-integrated-ui 가 openapi 를 허용해야 하는가? (§8 미결)`,
    };
  }
  const threshold = thresholdOf(policy, surface);
  const highest = highestScreenMode(readinessOutput, policy) || '(없음)';
  return {
    reason: `guarded(${surface}) 인데 프로젝트의 어떤 화면도 ${threshold} 에 도달하지 못함 (현재 최고 화면 모드: ${highest})`,
    would_clear: `화면 하나라도 ${threshold} 이상 도달하면 ${surface} 전체가 열린다(프로젝트 단위·§1 한계)`,
  };
}

// status 토큰 → 사람이 읽는 change 표기.
function changeLabel(record) {
  const map = {
    A: 'A (added)', M: 'M (modified)', T: 'T (typechange)',
    R: 'R (renamed)', C: 'C (copied)', D: 'D (deleted)',
  };
  return map[record.status] || record.raw || record.status;
}

// loadYaml 래퍼: 파일은 있으나 YAML 이 손상된 경우(yamlParse throw)를 입력 오류(exit 2)로 surface 한다.
// 손상된 state/policy 는 부재(미설정)와 같은 '입력 오류' 범주다 — 절대 stack trace+exit 1 로 새지 않게.
// (util.loadYaml 은 다른 스크립트와 공유하는 헬퍼라 동작을 바꾸지 않고 여기서만 감싼다. 누락은 null 그대로.)
function loadYamlOrExit(p, label) {
  try {
    return loadYaml(p);
  } catch (err) {
    process.stderr.write(`forbidden-paths: ${label} YAML 파싱 실패 — ${p}\n  ${err.message}\n`);
    process.exit(2);
  }
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  // --- 입력 경로 해석 (readiness 와 동일 기본값) ---
  // --src 는 인터페이스 계약상 받아두지만(§2 옵션), 이 게이트는 diff 경로를 정책 글롭과 직접 매칭하므로
  // src 트리를 스캔하지 않는다(트리 스캔 금지). 따라서 여기선 소비하지 않는다.
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const policyPath = path.resolve(flags.policy || DEFAULTS.policy);
  const statePath = path.join(docsDir, '_meta', 'workflow-state.yaml');

  // --- state / policy 로드 (부재 시 exit 2; YAML 손상 시에도 exit 2 — 둘 다 입력 오류) ---
  const state = loadYamlOrExit(statePath, 'workflow-state');
  if (!state) {
    process.stderr.write(
      `forbidden-paths: ${statePath} 없음. 먼저 \`npm run workflow:state\` 실행하거나 --docs 를 확인하세요.\n`,
    );
    process.exit(2);
  }
  const policy = loadYamlOrExit(policyPath, 'policy');
  if (!policy) {
    process.stderr.write(`forbidden-paths: 정책 파일 없음: ${policyPath}\n`);
    process.exit(2);
  }
  // 매니페스트는 computeReadiness 의 부가 입력(next_actions 템플릿 경로 등). 게이트 판정은 정책 단일 출처.
  const manifest = loadYamlOrExit(path.resolve(flags.manifest || DEFAULTS.manifest), 'manifest') || {};

  // --- 레이아웃 프로파일 + resolved policy (tier1 §6·§7) ---
  // 정책이 {roles.X} 로 토큰화돼 있으므로, path-backstop 의 글롭-문자열 helper 에 넘기기 전에
  // 토큰을 물리 글롭으로 펼친다(BYTE-동치 회귀 기준 — §10). --layout 으로 프로파일 경로 오버라이드.
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });
  const resolvedPolicy = resolvePolicyPaths(policy, layout);

  // --- readiness 소비 (모드 판정 단일 출처) ---
  // ci={} : 경로 게이트는 CI fact 불필요(threshold 인 api-integrated-ui 는 fact-only).
  const readinessOutput = computeReadiness({ state, policy, ci: {}, manifest, layout });

  // --- guarded surface 파생 (정책에서; 도메인 union 사전 구체화 — §7-i) ---
  // materializeGuardedSurface 는 {domain} forbidden 을 실제 도메인들로 펼친 구체 글롭 합집합을
  // 만든 뒤 deriveGuardedSurface 와 동일 분류/threshold 필터를 적용한다. 도메인 오버라이드가 없는
  // expo 에선 결과가 deriveGuardedSurface(policy) 와 BYTE-동치.
  const guardedSurface = layout.materializeGuardedSurface(resolvedPolicy, domainsFromState(state));

  // --- diff source 결정 → 상태 인식 record (우선순위: §3) ---
  let records;
  try {
    if (flags.diff) {
      // --diff <file>: name-status 텍스트 파일 (테스트/픽스처). 최우선.
      const diffPath = path.resolve(flags.diff);
      const raw = readFileSafe(diffPath);
      if (raw == null) {
        process.stderr.write(`forbidden-paths: --diff 파일 없음: ${diffPath}\n`);
        process.exit(2);
      }
      records = parseNameStatusText(raw);
    } else {
      // 라이브 git: --range > --staged > --base > local 기본. fail-closed.
      records = gitChangedRecords({
        cwd: flags.root ? path.resolve(flags.root) : process.cwd(),
        range: typeof flags.range === 'string' ? flags.range : undefined,
        staged: flags.staged === true,
        base: typeof flags.base === 'string' ? flags.base : undefined,
      });
    }
  } catch (err) {
    // git 실패/base 미해석(GitError) 또는 손상된 diff 입력(DiffParseError) → 입력 오류로 exit 2(fail-closed).
    if (err instanceof GitError || err instanceof DiffParseError) {
      process.stderr.write(`forbidden-paths: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }

  // --root: diff 경로에서 project-root 접두를 떼고 정책 경로(src/**)와 맞춘다(§6 monorepo).
  // diff 경로는 repo-root 상대(posix)이고 정책은 project-root 상대(src/**)다. 사용자가 주는 --root 는
  // repo-root 상대 접두(예: frontend-workflow-kit/examples/coupon-feature)다 — stripRoot 가 그 접두를 떼낸다.
  const rootRel = typeof flags.root === 'string' ? flags.root : null;

  // --- 위반 루프 (writes-only) ---
  const violations = [];
  const seenFiles = new Set();
  for (const record of records) {
    for (const wp of writePathsOf(record)) {
      // --root strip → posix 정규화 (root 없으면 정규화만)
      const F = stripRoot(wp, rootRel);
      if (seenFiles.has(F)) continue; // 같은 파일 중복 방지(여러 record가 같은 새 경로를 줄 일은 드묾)
      // F 가 매칭되는 guarded surface 를 모두 모아 '가장 좁은(구체적인)' 것으로 판정한다.
      // (설계 §4/§8: 겹치는 surface 는 파일별 최협 매칭. 현재 MVP 정책엔 겹침이 없어 보통 1개지만,
      //  surface 가 늘어도 배열 순서 의존[find]을 없애 broader-cleared 가 narrower-uncleared 를 가리지 못하게.)
      const matched = guardedSurface.filter((g) => globMatches(g, F));
      if (matched.length === 0) continue; // (c) 공유/무관 경로 — 감시 대상 아님
      const surface = matched.sort(
        (a, b) => b.replace(/\*+/g, '').length - a.replace(/\*+/g, '').length || a.localeCompare(b),
      )[0];
      if (isCleared(surface, readinessOutput, resolvedPolicy)) continue; // (b) 프로젝트가 레이어 열 자격 도달 — 침묵
      seenFiles.add(F);
      const { reason, would_clear } = describeViolation(surface, resolvedPolicy, readinessOutput);
      violations.push({ file: F, change: changeLabel(record), surface, reason, would_clear });
    }
  }

  const enforced = flags.enforce === true;
  const ok = violations.length === 0;

  // --- 출력 ---
  if (flags.json) {
    const screenModes = {};
    for (const id of Object.keys(readinessOutput)) {
      screenModes[id] = readinessOutput[id].readiness_mode;
    }
    process.stdout.write(
      JSON.stringify(
        {
          ok,
          enforced,
          violations,
          guarded_surface: guardedSurface,
          screen_modes: screenModes,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    if (ok) {
      process.stdout.write('forbidden-paths — OK (guarded surface 위반 없음)\n');
      process.stdout.write(`  guarded surface: ${guardedSurface.join(', ')}\n`);
    } else {
      const header = enforced ? '위반' : '위반(경고)';
      process.stdout.write(`forbidden-paths — ${violations.length} 건 ${header}\n`);
      for (const v of violations) {
        process.stdout.write(`  file        ${v.file}\n`);
        process.stdout.write(`  change      ${v.change}\n`);
        process.stdout.write(`  surface     ${v.surface}\n`);
        process.stdout.write(`  reason      ${v.reason}\n`);
        process.stdout.write(`  would-clear ${v.would_clear}\n`);
        process.stdout.write('\n');
      }
      if (!enforced) {
        process.stdout.write('  (warning-first: --enforce 없이는 exit 0. CI 차단은 --enforce)\n');
      }
    }
  }

  // --- exit code ---
  if (ok) process.exit(0);
  process.exit(enforced ? 1 : 0);
}

// 직접 실행될 때만 main() (import 시 부작용 없음)
// runCli: 레이아웃 설정 오류(미정의 role·부재 --layout)를 exit 2 로 surface(stack trace+exit 1 차단).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(main, 'forbidden-paths');
