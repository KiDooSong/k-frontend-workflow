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
import { parseArgs, DEFAULTS, KIT_ROOT, loadYaml, readFileSafe, runCli, isCliEntry } from './lib/util.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';
import { computeReadiness } from './readiness.mjs';
import { LayoutConfigError, loadLayoutProfile } from './lib/layout-profile.mjs';
import {
  covers,
  isClearedAt,
  highestScreenMode,
  parseNameStatusText,
  writePathsOf,
  gitChangedRecords,
  stripRoot,
  globMatches,
  collectApiCandidateClaims,
  readinessPathAuthorization,
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

function isUndefinedApiClientRoleError(err) {
  if (!(err instanceof LayoutConfigError)) return false;
  const message = String(err.message || '');
  return /\bapi_client\b/.test(message) && (/정의되지 않은 role/.test(message) || /undefined role/i.test(message));
}

function optionalApiClientSurfaces(layout, domains = []) {
  const out = [];
  const seen = new Set();
  const contexts = [{}, ...domains.map((domain) => ({ domain }))];
  for (const ctx of contexts) {
    let resolved;
    try {
      resolved = layout.resolvePaths(['{roles.api_client}'], ctx);
    } catch (err) {
      if (isUndefinedApiClientRoleError(err)) continue;
      throw err;
    }
    for (const surface of resolved || []) {
      if (seen.has(surface)) continue;
      seen.add(surface);
      out.push(surface);
    }
  }
  return out;
}

function optionalRoleSurfaces(layout, role, domains = []) {
  const out = [];
  const seen = new Set();
  const contexts = [{}, ...domains.map((domain) => ({ domain }))];
  for (const ctx of contexts) {
    let resolved;
    try {
      resolved = layout.resolvePaths([`{roles.${role}}`], ctx);
    } catch (err) {
      if (err instanceof LayoutConfigError && /정의되지 않은 role|undefined role/i.test(String(err.message || ''))) {
        continue;
      }
      throw err;
    }
    for (const surface of resolved || []) {
      if (seen.has(surface)) continue;
      seen.add(surface);
      out.push(surface);
    }
  }
  return out;
}

function surfaceTouchesAny(surface, surfaces) {
  return (surfaces || []).some((candidate) => covers(surface, candidate) || covers(candidate, surface));
}

function matchingClaims(claims, file) {
  return (claims || []).filter((claim) => globMatches(claim.path, file));
}

function screenReachesApiIntegrated(entry, order) {
  const threshold = order.indexOf('api-integrated-ui');
  const actual = order.indexOf(entry.readiness_mode);
  return threshold >= 0 && actual >= threshold;
}

function screenAuthorizesApiFile(file, screenId, entry, order, claims) {
  return readinessPathAuthorization({
    file,
    screenId,
    entry,
    modeOrder: order,
    claims,
  }).allowed;
}

function anyScreenAuthorizesApiFile(file, readinessOutput, order, claims) {
  return Object.entries(readinessOutput || {}).some(([screenId, entry]) =>
    screenAuthorizesApiFile(file, screenId, entry, order, claims),
  );
}

function describeCandidateViolation(claim, file) {
  const tracking = claim.tracking ? `, tracking=${claim.tracking}` : '';
  const conflict = claim.conflicting_path ? `, conflicts-with=${claim.conflicting_path}` : '';
  return {
    reason:
      `API candidate ${claim.kind} slice '${claim.path}' denies ${file} ` +
      `(screen=${claim.screen_id}, endpoint=${claim.endpoint}${tracking}${conflict})`,
    would_clear:
      claim.kind === 'deferred'
        ? `resolve tracking and change the candidate to an explicit confirmed active slice before editing`
        : `resolve cross-screen candidate path ownership before editing`,
  };
}

function describeUnownedCandidateViolation(file, matches) {
  const owners = matches
    .map(
      (claim) =>
        `${claim.screen_id}:${claim.endpoint}` +
        (claim.tracking ? ` tracking=${claim.tracking}` : ''),
    )
    .join(', ');
  return {
    reason: matches.length
      ? `API candidate active slice '${file}' has no owning screen at api-integrated-ui with effective allowed_paths (${owners})`
      : `API-related path '${file}' is not authorized by any screen's effective allowed_paths/forbidden_paths candidate model`,
    would_clear: `declare one valid confirmed active Slice Path and reach api-integrated-ui, or use a legacy screen contract`,
  };
}

// 위반 1건의 reason / would_clear 문구를 만든다(설계 §4 출력 규약).
//   threshold 는 호출부가 넘기는 표면의 *구체* threshold(materializeGuardedSurface 가 계산) — M3.
//   토큰화된 정책으로 재계산하면 커스텀 도메인 표면에서 null 이 나와 reason 이 깨진다.
function describeViolation(surface, threshold, policy, readinessOutput, options = {}) {
  const isOpenApi = surface === 'openapi.yaml' || surface === 'openapi.yml';
  if (isOpenApi) {
    return {
      reason: `현재 정책에 ${surface} 를 allow 하는 모드가 없음 → 변경 시 항상 플래그`,
      would_clear: `정책 결정 필요: api-integrated-ui 가 openapi 를 허용해야 하는가? (§8 미결)`,
    };
  }
  const highest = highestScreenMode(readinessOutput, policy, options) || '(없음)';
  if (options.requireApiRequired === true) {
    const overallHighest = highestScreenMode(readinessOutput, policy) || '(없음)';
    return {
      reason: `guarded(${surface}) 인데 프로젝트의 어떤 API-required 화면도 ${threshold} 에 도달하지 못함 (현재 API-required 최고 화면 모드: ${highest}; 전체 최고 화면 모드: ${overallHighest})`,
      would_clear: `api_required:true 화면 하나라도 ${threshold} 이상 도달하면 ${surface} 전체가 열린다(프로젝트 단위·§1 한계)`,
    };
  }
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

function helpText() {
  return `workflow:forbidden-paths - diff 기반 forbidden_paths backstop (2차 방어선, warning-first)

Usage:
  node scripts/forbidden-paths.mjs [--docs <dir>] [--src <dir>] [--root <dir>]
                                   [--policy <file>] [--manifest <file>] [--layout <file>]
                                   [--diff <file> | --range <a..b> | --staged | --base <ref>]
                                   [--enforce] [--json] [--help]

Options:
  --docs <dir>      authoring 문서 루트(<docs>/_meta/workflow-state.yaml 을 읽음). 기본: ${DEFAULTS.docs}
  --src <dir>       인터페이스 계약상 수용(§2) — 이 게이트는 diff 만 보므로 소비하지 않음
  --root <dir>      monorepo project-root 접두 — diff 경로에서 떼어 정책 글롭(src/**)과 정렬;
                    live git 모드에서는 git 실행 cwd 로도 사용
  --policy <file>   정책 경로. 기본: 킷 policies/implementation-mode-policy.yaml
  --manifest <file> artifact manifest 경로. 기본: 킷 catalog/artifact-manifest.yaml
  --layout <file>   project-layout.yaml 경로 오버라이드
  --diff <file>     name-status 텍스트 파일(테스트/픽스처) — 최우선 diff source
  --range <a..b>    live git diff range (source 우선순위: --diff > --range > --staged > --base > local)
  --staged          live git staged 변경분
  --base <ref>      live git base ref 대비 변경분
  --enforce         위반 시 exit 1 로 승격 (없으면 warning-first: 위반도 exit 0 경고)
  --json            결정적 JSON({ ok, enforced, violations, guarded_surface, screen_modes }) 출력
  --help            이 도움말 출력

Exit codes:
  0  위반 없음 — 또는 --enforce 없는 warning-first 위반(경고로만 출력)
  1  --enforce 인데 위반 있음
  2  usage/입력 오류(unknown option·state/policy 부재·손상·git/base 해석 실패·손상된 diff)

Behavior:
  usage 오류(unknown option·값 없는 value flag·값 붙은 boolean flag·positional)는
  state/policy/manifest/layout/diff/git 을 읽기 전에 exit 2 — --enforc 오타가
  "--enforce 없는 warning-first 실행"으로 조용히 fallback 하는 fail-open 을 금지한다.
  모드 판정은 readiness(computeReadiness) 출력을 소비만 하며 판정을 재구현하지 않는다.
`;
}

// parseArgs 는 모든 --foo 를 그대로 flags 에 넣으므로(거부 없음) CLI 별 allowlist 로 오타를 잡는다.
// 예: --enforc 오타가 "--enforce 없는 warning-first 실행"으로 조용히 진행되며 enforcement 가
// 소실되는 것을 막는다(exit 2). validate(PR #175)·workflow-state/readiness(PR #176)와 같은 계약.
const VALUE_FLAGS = new Set(['docs', 'src', 'root', 'policy', 'manifest', 'layout', 'diff', 'range', 'base']);
const BOOLEAN_FLAGS = new Set(['staged', 'enforce', 'json', 'help']);

function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);
  // 인자 검증은 state/policy/manifest/layout 로드·diff 읽기·git 실행·computeReadiness 보다
  // 먼저 — usage 오류에서 파일·git·readiness 작업 0 (fail-closed).
  enforceCliFlagContract({
    argv,
    flags,
    positionals,
    valueFlags: VALUE_FLAGS,
    booleanFlags: BOOLEAN_FLAGS,
    tool: 'forbidden-paths',
    helpCommand: 'node scripts/forbidden-paths.mjs',
  });
  if (flags.help) {
    process.stdout.write(helpText());
    return; // help 는 자연 종료 exit 0 (cli-stdout-flush 계약 — process.exit(0) 금지)
  }

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
  // 모드 사다리 순서(clearance index 비교용). thresholdOf 를 토큰화 정책으로 재계산하지 않고
  // materializeGuardedSurface 가 준 구체 threshold 의 index 만 본다(§7-i / M3).
  const order = resolvedPolicy.order || Object.keys(resolvedPolicy.modes || {});

  // --- readiness 소비 (모드 판정 단일 출처) ---
  // ci={} : 경로 게이트는 CI fact 불필요(threshold 인 api-integrated-ui 는 fact-only).
  const readinessOutput = computeReadiness({ state, policy, ci: {}, manifest, layout });

  // --- guarded surface 파생 (정책에서; 도메인 union 사전 구체화 — §7-i) ---
  // materializeGuardedSurface 는 {domain} forbidden 을 실제 도메인들로 펼친 구체 글롭 합집합을
  // 만든 뒤 deriveGuardedSurface 와 동일 분류/threshold 필터를 적용한다. 도메인 오버라이드가 없는
  // expo 에선 결과가 deriveGuardedSurface(policy) 와 BYTE-동치.
  const domains = domainsFromState(state);
  const guardedSurface = layout.materializeGuardedSurface(resolvedPolicy, domains);
  const apiClientSurfaces = optionalApiClientSurfaces(layout, domains);
  const claims = collectApiCandidateClaims(readinessOutput);
  const hasV2CandidateContract = Object.values(readinessOutput).some(
    (entry) => entry?.api_candidate_authorization?.contract_version === 2,
  );
  const integratedV2Domains = [
    ...new Set(
      Object.entries(readinessOutput)
        .filter(
          ([, entry]) =>
            entry?.api_candidate_authorization?.contract_version === 2 &&
            screenReachesApiIntegrated(entry, order),
        )
        .map(([screenId]) => state.screens?.[screenId]?.domain)
        .filter((domain) => domain != null && domain !== ''),
    ),
  ].sort();
  const integratedV2ApiSurfaces =
    integratedV2Domains.length === 0
      ? []
      : [
          ...optionalRoleSurfaces(layout, 'hook', integratedV2Domains),
          ...optionalApiClientSurfaces(layout, integratedV2Domains),
        ];

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
      const deniedClaims = matchingClaims(claims.denied, F);
      if (deniedClaims.length > 0) {
        seenFiles.add(F);
        const claim = deniedClaims[0];
        const { reason, would_clear } = describeCandidateViolation(claim, F);
        violations.push({
          file: F,
          change: changeLabel(record),
          surface: claim.path,
          reason,
          would_clear,
          candidate: claim,
        });
        continue;
      }
      const activeClaims = matchingClaims(claims.active, F);
      // F 가 매칭되는 guarded surface 를 모두 모아 '가장 좁은(구체적인)' 것으로 판정한다.
      // (설계 §4/§8: 겹치는 surface 는 파일별 최협 매칭. 현재 MVP 정책엔 겹침이 없어 보통 1개지만,
      //  surface 가 늘어도 배열 순서 의존[find]을 없애 broader-cleared 가 narrower-uncleared 를 가리지 못하게.)
      const matched = guardedSurface.filter((g) => globMatches(g, F));
      const touchesIntegratedV2ApiSurface = integratedV2ApiSurfaces.some((surface) =>
        globMatches(surface, F),
      );
      if (
        matched.length === 0 &&
        activeClaims.length === 0 &&
        !touchesIntegratedV2ApiSurface
      ) continue; // (c) 공유/무관 경로 — 감시 대상 아님
      if (activeClaims.length > 0) {
        if (anyScreenAuthorizesApiFile(F, readinessOutput, order, claims)) continue;
        seenFiles.add(F);
        const { reason, would_clear } = describeUnownedCandidateViolation(F, activeClaims);
        violations.push({
          file: F,
          change: changeLabel(record),
          surface: activeClaims[0].path,
          reason,
          would_clear,
          candidate: activeClaims[0],
        });
        continue;
      }
      if (matched.length === 0 && touchesIntegratedV2ApiSurface) {
        if (anyScreenAuthorizesApiFile(F, readinessOutput, order, claims)) continue;
        seenFiles.add(F);
        const { reason, would_clear } = describeUnownedCandidateViolation(F, []);
        violations.push({
          file: F,
          change: changeLabel(record),
          surface: integratedV2ApiSurfaces.find((entry) => globMatches(entry, F)),
          reason,
          would_clear,
        });
        continue;
      }
      const surface = matched.sort(
        (a, b) => b.replace(/\*+/g, '').length - a.replace(/\*+/g, '').length || a.localeCompare(b),
      )[0];
      // M3 대칭: clearance 는 materialization 이 쓴 *구체* threshold 로 판정한다(토큰화 resolvedPolicy 로
      // thresholdOf 재계산 금지 — 커스텀 도메인 표면은 {domain} 잔존 allowed 가 covers() 를 빗나가 영구
      // 위반이 됐다). expo 의 global 표면(src/api/**)은 threshold 가 동일해 byte-동치.
      const threshold = guardedSurface.thresholdOf(surface);
      const clearanceOptions = { requireApiRequired: surfaceTouchesAny(surface, apiClientSurfaces) };
      if (
        clearanceOptions.requireApiRequired === true &&
        hasV2CandidateContract &&
        anyScreenAuthorizesApiFile(F, readinessOutput, order, claims)
      ) continue;
      if (
        (clearanceOptions.requireApiRequired !== true || !hasV2CandidateContract) &&
        isClearedAt(threshold, readinessOutput, order, clearanceOptions)
      ) continue; // (b) non-API guarded surface의 기존 project-level 동작 유지
      seenFiles.add(F);
      const { reason, would_clear } =
        clearanceOptions.requireApiRequired === true && hasV2CandidateContract
          ? describeUnownedCandidateViolation(F, [])
          : describeViolation(surface, threshold, resolvedPolicy, readinessOutput, clearanceOptions);
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
          ...(claims.active.length || claims.denied.length
            ? { api_candidate_claims: claims }
            : {}),
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
  // process.exit() 금지(stdout pipe 8KB flush) — readiness-eval.mjs 의 flush-safe 자연 종료 계약.
  process.exitCode = ok ? 0 : enforced ? 1 : 0;
}

// 직접 실행될 때만 main() (import 시 부작용 없음)
// runCli: 레이아웃 설정 오류(미정의 role·부재 --layout)를 exit 2 로 surface(stack trace+exit 1 차단).
if (isCliEntry(import.meta.url)) runCli(main, 'forbidden-paths');
