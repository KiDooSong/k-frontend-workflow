// layout-profile.mjs — tier1 레이아웃 프로파일 로더.
// 설계: temp/proposals/customizable-architecture/tier1-layout-profile.md (§2·§5·§6·§7·§10),
//       README.md §1.1 (단일 resolvedLayout 객체).
//
// 역할: policies/project-layout.yaml 을 로드 → preset(presets/<name>.yaml) 머지 →
//       role→glob 바인딩 + 도메인 오버라이드를 보존한 단일 `resolvedLayout` 객체를 산출한다.
//       각 소비처(readiness·spec·validate·path-backstop·route-tree·workflow-packet)가 경로를
//       제각기 재유도하지 않고 이 객체 하나에서 같은 경로 fact 를 받게 하는 게 목적(README §1.1).
//
// 불변식:
//   - 판정 로직 없음. 여기엔 *경로 데이터*만 둔다(불변식 #1). 모드 판정은 readiness.mjs 단일 출처.
//   - {domain} 토큰은 PRESERVE — readiness 의 per-screen 치환(substituteDomain) 앞 단계이므로
//     로더는 {domain} 을 펼치지 않는다(materializeGuardedSurface 의 도메인 union 만 예외 — §7-i).
//   - {screen} 은 코드 role 에서 다루지 않는다(킷 문서 경로 전용 — §2 주의).
//   - import 부작용 0. deps = node 내장 + util.mjs + 'yaml'.
//
// 머지 정밀도(§4·§8): preset < project-layout.roles < domains.<d>.roles. **role 단위 교체**
//   (도메인이 명시한 role 만 base 를 덮어쓴다; 나머지는 상속). glob 단위 병합이 아니다.

import path from 'node:path';
import { loadYamlOrExit } from './util.mjs';

// classifyForbidden/covers/thresholdOf 미러를 두지 않고 path-backstop 의 순수 helper 를 재사용한다.
// (단일 출처 — guarded surface 분류 로직이 두 곳으로 갈리지 않게.)
import { classifyForbidden, thresholdOf } from './path-backstop.mjs';

// --- 경로 정규화 ----------------------------------------------------------
// glob 은 항상 forward-slash 로 비교/저장한다(Windows 대응; path-backstop.toPosix 와 동일 의미).
function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

// role 값은 string | string[] 둘 다 허용(§3). 항상 배열로 정규화하고 posix 화한다.
function asGlobArray(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((g) => toPosix(g));
}

// {roles.X} 토큰 1개를 가진 문자열인가. (resolvePaths 의 passthrough 판정용.)
const ROLE_TOKEN_RE = /\{roles\.([A-Za-z0-9_]+)\}/g;

// --- 머지 (preset < roles < domains.<d>.roles) ----------------------------
// base roles 맵 위에 override roles 맵을 role 단위로 얹는다(명시 role 만 교체).
function mergeRoles(base, override) {
  const out = { ...(base || {}) };
  for (const [role, value] of Object.entries(override || {})) {
    out[role] = value; // role 단위 교체 — glob 병합 아님
  }
  return out;
}

// --- 로더 -----------------------------------------------------------------
// loadLayoutProfile({ kitRoot, flags }) -> resolvedLayout
//   kitRoot : 킷 루트 절대경로(presets/·policies/ 가 그 아래). 미지정 시 util.KIT_ROOT 사용은
//             호출부 책임 — 여기선 명시 인자를 신뢰한다(테스트 주입 가능성 위함).
//   flags   : parseArgs 의 flags. --layout <path> 로 project-layout.yaml 경로 오버라이드 가능
//             (없으면 <kitRoot>/policies/project-layout.yaml). 부재 시 expo-feature 프리셋만 적용.
export function loadLayoutProfile({ kitRoot, flags = {} } = {}) {
  if (!kitRoot) throw new Error('loadLayoutProfile: kitRoot 필요');
  const presetsDir = path.join(kitRoot, 'presets');
  const layoutPath =
    typeof flags.layout === 'string'
      ? flags.layout
      : path.join(kitRoot, 'policies', 'project-layout.yaml');

  // project-layout.yaml — 부재 허용(프리셋 기본값으로 동작). 손상은 exit 2(loadYamlOrExit).
  const layout = loadYamlOrExit(layoutPath, 'project-layout', 'layout-profile') || {};

  // preset 머지(가장 낮은 우선순위). preset 이름이 있으면 presets/<name>.yaml 로드.
  let presetRoles = {};
  const presetName = layout.preset;
  if (presetName) {
    const presetPath = path.join(presetsDir, `${presetName}.yaml`);
    const preset = loadYamlOrExit(presetPath, `preset '${presetName}'`, 'layout-profile');
    if (preset == null) {
      process.stderr.write(
        `layout-profile: preset '${presetName}' 파일이 없습니다 — ${presetPath}\n`,
      );
      process.exit(2);
    }
    presetRoles = preset.roles || {};
  }

  // base roles: preset < project-layout.roles.
  const baseRoles = mergeRoles(presetRoles, layout.roles || {});

  // 도메인 오버라이드 맵(raw 보존 — per-screen 해소 시 룩업). 머지는 resolve 시점에 적용.
  const domainOverrides = {};
  for (const [d, cfg] of Object.entries(layout.domains || {})) {
    if (cfg && cfg.roles) domainOverrides[d] = cfg.roles;
  }

  // 특정 도메인에 유효한 roles 맵(base + 그 도메인 오버라이드).
  function rolesFor(domain) {
    const ov = domain != null ? domainOverrides[domain] : null;
    return ov ? mergeRoles(baseRoles, ov) : baseRoles;
  }

  // --- resolvedLayout API ---------------------------------------------------

  // roleGlobs(role) -> string[] : 해소된 글롭들. {domain} 토큰은 PRESERVE(per-screen 치환용).
  //   도메인 무관 base 바인딩을 돌려준다(도메인별 분기는 roleToDir/resolvePaths 의 {domain} 인자에서).
  function roleGlobs(role) {
    return asGlobArray(baseRoles[role]);
  }

  // roleToDir(role, { domain }) -> string : 존재검사용 상대 디렉토리.
  //   role 의 primary(첫) glob 을 취해 후행 '/**' 를 떼고 {domain} 치환. (spec.mjs fake_hook_exists,
  //   validate 검사 8 등 fact 파생이 글롭이 아니라 디렉토리 경로를 필요로 함 — README §1.1.)
  function roleToDir(role, { domain } = {}) {
    const globs = asGlobArray(rolesFor(domain)[role]);
    if (globs.length === 0) return '';
    let dir = globs[0];
    if (dir.endsWith('/**')) dir = dir.slice(0, -3);
    else if (dir.endsWith('**')) dir = dir.slice(0, -2).replace(/\/$/, '');
    return substituteDomain(dir, domain);
  }

  // {domain} 치환(domain 미지정 시 토큰 보존). {screen} 은 의도적으로 건드리지 않는다(§2 주의).
  function substituteDomain(str, domain) {
    if (domain == null) return str;
    return String(str).split('{domain}').join(domain);
  }

  // resolvePaths(globArray, { domain }) -> string[] :
  //   1) {roles.X} 토큰을 해당 role 의 글롭(들)로 펼침(N개면 N개로 spread — §3).
  //   2) 펼친 결과에 {domain} 치환(domain 주어졌을 때).
  //   {roles.X} 토큰이 '없는' 문자열은 그대로 통과 — blanket/리터럴 글롭
  //   (예: 'src/**','src/features/**','openapi.yaml','docs/frontend-workflow/**')은 손대지 않는다.
  function resolvePaths(globArray, { domain } = {}) {
    const input = Array.isArray(globArray) ? globArray : [globArray];
    const roles = rolesFor(domain);
    const out = [];
    for (const raw of input) {
      const s = toPosix(raw);
      ROLE_TOKEN_RE.lastIndex = 0;
      if (!ROLE_TOKEN_RE.test(s)) {
        // {roles.X} 없음 → passthrough(리터럴/blanket). {domain} 치환만 적용.
        out.push(substituteDomain(s, domain));
        continue;
      }
      // {roles.X} 토큰을 포함. 한 문자열에 토큰이 정확히 1개라고 가정하지 않고,
      // 토큰이 글롭 '전체'면(= "{roles.X}") 그 role 의 모든 글롭으로 spread.
      const whole = /^\{roles\.([A-Za-z0-9_]+)\}$/.exec(s);
      if (whole) {
        const expanded = asGlobArray(roles[whole[1]]);
        for (const g of expanded) out.push(substituteDomain(g, domain));
        continue;
      }
      // 토큰이 더 큰 문자열 안에 박힌(접두/접미 있는) 경우 — 단일 글롭으로 치환(role 이 다중이면 첫 글롭).
      // (현 킷 정책엔 이 형태가 없지만 일반성 위해 처리.)
      const substituted = s.replace(ROLE_TOKEN_RE, (_m, role) => {
        const g = asGlobArray(roles[role]);
        return g.length ? g[0] : _m;
      });
      out.push(substituteDomain(substituted, domain));
    }
    return out;
  }

  // materializeGuardedSurface(policy, domains) -> string[] (§7-i):
  //   forbidden 글롭의 {domain} 을 *실제 도메인 리스트*로 펼쳐, 더는 domain-scoped 가 아닌
  //   구체(global+specific) 글롭의 합집합을 만들어 deriveGuardedSurface 와 같은 필터를 적용한다.
  //   목적: path-backstop 의 deriveGuardedSurface 가 domain-scoped 를 guard 에서 제외(L119)하므로,
  //   도메인별 forbidden 을 사전 구체화해 fail-closed union 으로 넘긴다.
  //
  //   회귀(HARD CONSTRAINT): 도메인 오버라이드가 *없는* expo 에선 deriveGuardedSurface(policy) 와
  //   BYTE-동치여야 한다. 아래 로직은 deriveGuardedSurface 를 그대로 미러하되, domain-scoped 글롭만
  //   도메인 union 으로 확장한 뒤 동일 분류/threshold 필터를 통과시킨다. expo 의 유일한 domain-scoped
  //   forbidden(api-integrated-ui 의 src/features/{domain}/screens/**)은 확장돼도 threshold 가
  //   null 이라 채택되지 않으므로, 결과 집합이 변하지 않는다.
  function materializeGuardedSurface(policy, domains = []) {
    const modes = (policy && policy.modes) || {};
    const domainList = Array.isArray(domains) ? domains.filter((d) => d != null) : [];
    const set = new Set();

    for (const name of Object.keys(modes)) {
      const forbidden = modes[name].forbidden_paths || [];
      for (const f of forbidden) {
        const g = toPosix(f);
        const cls = classifyForbidden(g);
        if (cls === 'blanket') continue; // src/** 제외(공유코드 오탐)
        if (cls === 'global+specific') {
          // {domain} 없는 일반 글롭 — deriveGuardedSurface 와 동일 조건(threshold 존재)으로 채택.
          if (thresholdOf(policy, g) == null) continue;
          set.add(g);
          continue;
        }
        // domain-scoped: {domain} 을 실제 도메인들로 펼쳐 구체 글롭 union 으로 만든다.
        // (도메인 리스트가 비면 — 도메인 미발견 — 펼칠 게 없으므로 아무것도 추가하지 않는다.
        //  이는 현 deriveGuardedSurface 가 domain-scoped 를 통째로 버리는 것과 동일한 결과.)
        for (const d of domainList) {
          const concrete = g.split('{domain}').join(d);
          // 펼친 글롭이 {domain}/{screen} 을 더는 포함하지 않으면 global+specific 로 재분류.
          if (classifyForbidden(concrete) !== 'global+specific') continue;
          if (thresholdOf(policy, concrete) == null) continue; // threshold 없으면 레이어 경계 아님
          set.add(concrete);
        }
      }
    }
    // openapi parity (deriveGuardedSurface 와 동일 — yaml/yml 둘 다).
    set.add('openapi.yaml');
    set.add('openapi.yml');
    return [...set].sort();
  }

  // --- resolvedLayout 객체 --------------------------------------------------
  return {
    roleGlobs,
    roleToDir,
    resolvePaths,
    materializeGuardedSurface,
    // raw 노출(README §1.1 — 소비처가 필요 시 직접 조회).
    roles: baseRoles,
    domains: domainOverrides,
    preset: presetName || null,
  };
}

export default loadLayoutProfile;
