// layout-profile.mjs — tier1 레이아웃 프로파일 로더.
// 설계: docs/design/drafts/customizable-architecture/tier1-layout-profile.md (§2·§5·§6·§7·§10),
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
import { loadYamlOrExit, exists } from './util.mjs';

// 레이아웃 설정 오류(fail-CLOSED): {roles.X} 토큰이 정의되지 않은 role 을 참조하거나, 명시적으로
// 지정된 layout/preset 파일이 부재한 경우. CLI 경계가 잡아 exit 2(도구/설정 오류)로 surface 한다 —
// 조용히 [] 로 떨어뜨려 forbidden 경로를 누락(게이트 확장)하지 않게(MAJOR 1). 일반 Error 의 하위형이라
// 호출부가 instanceof 로 구분하거나 그냥 메시지를 출력해도 된다.
export class LayoutConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LayoutConfigError';
  }
}

// classifyForbidden/covers/thresholdOf 미러를 두지 않고 path-backstop 의 순수 helper 를 재사용한다.
// (단일 출처 — guarded surface 분류 로직이 두 곳으로 갈리지 않게.)
import { classifyForbidden, thresholdOf } from './path-backstop.mjs';
import { BUILT_IN_LAYER_ROLES, SUPPORTED_LAYER_FACTS } from './layer-inventory.mjs';

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

// fail-CLOSED 룩업: roles 맵에 role 키가 *정의돼 있지 않으면* throw 한다(MAJOR 1).
//   undefined role 을 조용히 [] 로 펼치면 forbidden_paths 의 그 항목이 통째로 사라져 게이트가
//   소리없이 넓어진다(금지 경로 누락). 정의는 됐으나 빈 값([])인 role 은 의도된 설정이므로 통과시킨다.
//   ownProperty 검사로 prototype 오염(예: 'constructor')도 미정의로 본다.
function requireRole(roles, role, sourceGlob) {
  if (!Object.prototype.hasOwnProperty.call(roles, role)) {
    throw new LayoutConfigError(
      `layout-profile: 정의되지 않은 role '${role}' 을 참조함 ('${sourceGlob}'). ` +
        `policies/project-layout.yaml 또는 preset 의 roles: 에 '${role}' 을 추가하세요.`,
    );
  }
  return roles[role];
}

// --- 머지 (preset < roles < domains.<d>.roles) ----------------------------
// base roles 맵 위에 override roles 맵을 role 단위로 얹는다(명시 role 만 교체).
function mergeRoles(base, override) {
  const out = { ...(base || {}) };
  for (const [role, value] of Object.entries(override || {})) {
    out[role] = value; // role 단위 교체 — glob 병합 아님
  }
  return out;
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function asStringArray(value, label = 'value') {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v, index) => {
    if (typeof v !== 'string' || v.trim() === '') {
      throw new LayoutConfigError(`layout-profile: ${label}[${index}] must be a non-empty string`);
    }
    return v;
  });
}

function normalizeLayerGlob(value, label) {
  const globs = asStringArray(value, label).map((g) => toPosix(g));
  if (globs.length === 0) {
    throw new LayoutConfigError(`layout-profile: ${label} is required`);
  }
  return Array.isArray(value) ? globs : globs[0];
}

function normalizeLayer(layer, label) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
    throw new LayoutConfigError(`layout-profile: ${label} must be an object`);
  }
  if (typeof layer.role !== 'string' || layer.role.trim() === '') {
    throw new LayoutConfigError(`layout-profile: ${label}.role is required`);
  }
  if (typeof layer.fact !== 'string' || layer.fact.trim() === '') {
    throw new LayoutConfigError(`layout-profile: ${label}.fact is required`);
  }
  if (!SUPPORTED_LAYER_FACTS.includes(layer.fact)) {
    throw new LayoutConfigError(
      `layout-profile: ${label}.fact '${layer.fact}' is unsupported (supported: ${SUPPORTED_LAYER_FACTS.join(', ')})`,
    );
  }
  const access = layer.access == null ? {} : layer.access;
  if (access && (typeof access !== 'object' || Array.isArray(access))) {
    throw new LayoutConfigError(`layout-profile: ${label}.access must be an object when present`);
  }
  const out = {
    role: layer.role,
    glob: normalizeLayerGlob(layer.glob, `${label}.glob`),
    fact: layer.fact,
    access: {
      allow: asStringArray(access.allow, `${label}.access.allow`),
      forbid: asStringArray(access.forbid, `${label}.access.forbid`),
    },
  };
  if (layer.gates !== undefined) out.gates = asStringArray(layer.gates, `${label}.gates`);
  return out;
}

function normalizeLayerArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new LayoutConfigError(`layout-profile: ${label} must be an array`);
  }
  return value.map((layer, index) => normalizeLayer(layer, `${label}[${index}]`));
}

function cloneLayer(layer) {
  if (!layer || typeof layer !== 'object' || typeof layer.role !== 'string') return null;
  const access = layer.access && typeof layer.access === 'object' ? layer.access : {};
  const out = {
    ...layer,
    role: layer.role,
    glob: layer.glob,
    fact: layer.fact || null,
    access: {
      allow: Array.isArray(access.allow) ? access.allow.map(String) : access.allow == null ? [] : [String(access.allow)],
      forbid: Array.isArray(access.forbid) ? access.forbid.map(String) : access.forbid == null ? [] : [String(access.forbid)],
    },
  };
  if (layer.gates !== undefined) out.gates = Array.isArray(layer.gates) ? layer.gates.map(String) : [String(layer.gates)];
  return out;
}

function asLayerArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cloneLayer).filter(Boolean);
}

// preset.layers < project-layout.layers < domains.<d>.layers. role 단위 교체, 새 role 은 뒤에 추가한다.
function mergeLayers(base, override) {
  const out = asLayerArray(base);
  const indexByRole = new Map(out.map((layer, index) => [layer.role, index]));
  for (const layer of asLayerArray(override)) {
    if (indexByRole.has(layer.role)) out[indexByRole.get(layer.role)] = layer;
    else {
      indexByRole.set(layer.role, out.length);
      out.push(layer);
    }
  }
  return out;
}

const WHOLE_ROLE_TOKEN_RE = /^\{roles\.([A-Za-z0-9_]+)\}$/;
function roleToken(role) {
  return `{roles.${role}}`;
}

function addUnique(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  const arr = map.get(key);
  if (!arr.includes(value)) arr.push(value);
}

function layerPolicyPathEntries(layer, roles) {
  if (!layer || typeof layer.role !== 'string') return [];
  const roleIsBound = hasOwn(roles, layer.role);
  if (roleIsBound && BUILT_IN_LAYER_ROLES.includes(layer.role)) return [roleToken(layer.role)];
  if (layer.glob != null) return asGlobArray(layer.glob);
  if (roleIsBound) return [roleToken(layer.role)];
  return [];
}

function synthesizePathList(existing, synthesizedPaths) {
  const paths = synthesizedPaths || [];
  const remaining = new Set(paths);
  const out = [];
  const seen = new Set();
  for (const raw of existing || []) {
    const s = toPosix(raw);
    if (!seen.has(s)) {
      out.push(s);
      seen.add(s);
    }
    if (remaining.has(s)) remaining.delete(s);
  }
  for (const pathEntry of paths) {
    if (!remaining.has(pathEntry)) continue;
    if (!seen.has(pathEntry)) {
      out.push(pathEntry);
      seen.add(pathEntry);
    }
    remaining.delete(pathEntry);
  }
  return out;
}

function addLayerAccessList(map, modes, entries) {
  for (const mode of modes || []) {
    for (const entry of entries) addUnique(map, mode, entry);
  }
}

function synthesizeRequires(existing, gates) {
  const requires = Array.isArray(existing) ? existing.slice() : [];
  for (const req of gates || []) {
    if (!requires.includes(req)) requires.push(req);
  }
  return requires;
}

// Tier3 readiness-access helper: layers[].access 를 mode-major policy path 셀로 전치한다.
// Built-in layer roles keep role-token semantics to preserve preset/rebinding parity. Custom layers
// with explicit glob materialize the glob directly, so they do not require a matching roles.<role>.
export function synthesizeModePolicy(policy = {}, layout = {}, options = {}) {
  const domain = options.domain;
  const layers = asLayerArray(
    typeof layout.layersFor === 'function' ? layout.layersFor(domain) : layout.layers || [],
  );
  const roles =
    typeof layout.rolesFor === 'function'
      ? layout.rolesFor(domain)
      : layout?.roles && typeof layout.roles === 'object'
        ? layout.roles
        : {};
  const modes = policy.modes && typeof policy.modes === 'object' ? policy.modes : {};
  const order = Array.isArray(policy.order) ? policy.order.slice() : Object.keys(modes);
  const allowByMode = new Map();
  const forbidByMode = new Map();
  const gatesByMode = new Map();
  const includeGates = options.includeGates === true;

  for (const layer of layers) {
    const entries = layerPolicyPathEntries(layer, roles);
    addLayerAccessList(allowByMode, layer.access.allow, entries);
    addLayerAccessList(forbidByMode, layer.access.forbid, entries);
    if (includeGates) {
      for (const mode of layer.gates || []) addUnique(gatesByMode, mode, `${layer.role}_present == true`);
    }
  }

  const modeNames = [...new Set([...order, ...Object.keys(modes), ...allowByMode.keys(), ...forbidByMode.keys(), ...gatesByMode.keys()])];
  const outModes = {};
  for (const name of modeNames) {
    const mode = modes[name] || {};
    outModes[name] = {
      ...mode,
      requires: synthesizeRequires(mode.requires, gatesByMode.get(name)),
      allowed_paths: synthesizePathList(mode.allowed_paths || [], allowByMode.get(name) || []),
      forbidden_paths: synthesizePathList(mode.forbidden_paths || [], forbidByMode.get(name) || []),
    };
  }
  return { ...policy, order, modes: outModes };
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
  const explicitLayout = typeof flags.layout === 'string';
  const layoutPath = explicitLayout
    ? flags.layout
    : path.join(kitRoot, 'policies', 'project-layout.yaml');

  // 명시적 --layout 경로가 부재하면 fail-CLOSED(MAJOR 1): 조용히 빈 roles 로 떨어지지 않게 throw.
  //   (DEFAULT 경로 policies/project-layout.yaml 은 부재 허용 — preset 기본값으로 동작. 동봉돼 항상 존재.)
  if (explicitLayout && !exists(layoutPath)) {
    throw new LayoutConfigError(
      `layout-profile: --layout 경로가 존재하지 않음: ${layoutPath}`,
    );
  }

  // project-layout.yaml — (DEFAULT 한정) 부재 허용(프리셋 기본값으로 동작). 손상은 exit 2(loadYamlOrExit).
  const layout = loadYamlOrExit(layoutPath, 'project-layout', 'layout-profile') || {};

  // preset 머지(가장 낮은 우선순위). preset 이름이 있으면 presets/<name>.yaml 로드.
  let presetRoles = {};
  let presetLayers = [];
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
    presetLayers = normalizeLayerArray(preset.layers || [], `preset '${presetName}'.layers`);
  }

  // base roles/layers: preset < project-layout.
  const projectLayersDeclared = hasOwn(layout, 'layers');
  const projectLayers = normalizeLayerArray(layout.layers || [], 'project-layout.layers');
  const baseRoles = mergeRoles(presetRoles, layout.roles || {});
  const baseLayers = mergeLayers(presetLayers, projectLayers);

  // 도메인 오버라이드 맵(raw 보존 — per-screen 해소 시 룩업). 머지는 resolve 시점에 적용.
  const domainOverrides = {};
  const domainLayerOverrides = {};
  let domainLayersDeclared = false;
  for (const [d, cfg] of Object.entries(layout.domains || {})) {
    if (cfg && cfg.roles) domainOverrides[d] = cfg.roles;
    if (cfg && hasOwn(cfg, 'layers')) {
      domainLayersDeclared = true;
      domainLayerOverrides[d] = normalizeLayerArray(cfg.layers || [], `project-layout.domains.${d}.layers`);
    }
  }

  // 특정 도메인에 유효한 roles/layers 맵(base + 그 도메인 오버라이드).
  function rolesFor(domain) {
    const ov = domain != null ? domainOverrides[domain] : null;
    return ov ? mergeRoles(baseRoles, ov) : baseRoles;
  }

  function layersFor(domain) {
    const ov = domain != null ? domainLayerOverrides[domain] : null;
    return ov ? mergeLayers(baseLayers, ov) : baseLayers;
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
  // domain==='' 은 null 과 같게 본다 — readiness 의 옛 substituteDomain falsy-domain 의미 복원
  // (MINOR 1): 빈 도메인으로 '{domain}' 을 '' 로 접지하면 'src/features//hooks' 같은 깨진 경로가 나온다.
  function substituteDomain(str, domain) {
    if (domain == null || domain === '') return str;
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
        const expanded = asGlobArray(requireRole(roles, whole[1], s));
        for (const g of expanded) out.push(substituteDomain(g, domain));
        continue;
      }
      // 토큰이 더 큰 문자열 안에 박힌(접두/접미 있는) 경우 — 단일 글롭으로 치환(role 이 다중이면 첫 글롭).
      // (현 킷 정책엔 이 형태가 없지만 일반성 위해 처리.)
      const substituted = s.replace(ROLE_TOKEN_RE, (_m, role) => {
        const g = asGlobArray(requireRole(roles, role, s));
        return g.length ? g[0] : _m;
      });
      out.push(substituteDomain(substituted, domain));
    }
    return out;
  }

  // materializeGuardedSurface(policy, domains) -> string[] (§7-i, MAJOR 3 수정):
  //   guarded surface 를 *구체(concrete) 글롭의 합집합*으로 사전 구체화한다. path-backstop 의
  //   deriveGuardedSurface 는 domain-scoped({domain}) forbidden 을 통째로 버리므로(L119), 도메인별
  //   forbidden 이 게이트되지 않는다(§7-i union 결손). 여기서 {domain} 을 실제 도메인들로 펼쳐 메운다.
  //
  //   ★ MAJOR 3 의 핵심: threshold 는 **도메인별 구체 정책**(allowed_paths·forbidden_paths 를 둘 다
  //   {domain} 으로 치환)에 대해 계산한다. 이전 버그는 정책을 도메인 없이 1회만 해소한 뒤
  //   thresholdOf(policy, concreteForbidden) 로 *구체* forbidden 을 *토큰화된* allowed 와 비교해,
  //   covers() 가 항상 빗나가 도메인/커스텀 role forbidden 표면이 조용히 누락됐다(expo 는 우연히 통과).
  //   이제 같은 도메인의 allowed 도 구체화하므로 covers 가 올바로 동작한다.
  //
  //   채택 규칙(deriveGuardedSurface 의 "낮은 모드 금지 → 높은 모드 허용" 레이어 경계 의미 보존):
  //   표면 S 를 채택하려면 (a) tIdx=threshold(S) 가 존재(어떤 비-blanket 모드가 S 전체를 allow)하고,
  //   (b) S 를 *금지*한 모드가 그 threshold 보다 **엄격히 아래**여야 한다(forbiddingIdx < tIdx).
  //   ─ src/api/** : route/screen/rough/final(1~4)에서 금지, api-integrated-ui(5)에서 허용 → 채택.
  //   ─ src/features/{domain}/screens/** : screen-skeleton(2)에서 허용, api-integrated-ui(5)에서 금지
  //     (fake-hook 재-잠금 계약). forbiddingIdx(5) ≥ tIdx(2) → 채택 안 함. ← 이 조건이 expo BYTE-동치를
  //     지킨다(case2-screen-allowed=위반0). 재-잠금은 forward 게이트·readiness 가 담당하지, diff backstop 의
  //     프로젝트-단위 clearance 모델 대상이 아니다.
  //
  //   회귀(HARD CONSTRAINT): 도메인 오버라이드가 없는 expo 에선 결과가
  //   deriveGuardedSurface(rawLiteralPolicy) = ['openapi.yaml','openapi.yml','src/api/**'] 와 BYTE-동치.
  //
  //   반환(M3 clearance 대칭): sorted string[] 을 그대로 돌려주되(back-compat — 기존 호출부의
  //   .filter/.join/.includes/deepEqual 가 BYTE-동치로 유지), 그 위에 **non-enumerable**
  //   thresholdOf(surface) -> modeName|null 메서드를 얹는다. 이 thresholdOf 는 표면을 *채택할 때 쓴
  //   도메인별 구체(concrete) 정책*으로 계산한 threshold 를 돌려준다 — clearance 가 토큰화된
  //   resolvedPolicy(아직 {domain} 보존)로 thresholdOf 를 재계산해 covers 가 빗나가던 M3 버그를
  //   제거한다. enumerable=false 라 assert.deepEqual(arr, [...]) 의 expo-parity 단언에 보이지 않는다.
  function materializeGuardedSurface(policy, domains = []) {
    const modes = (policy && policy.modes) || {};
    const order =
      Array.isArray(policy && policy.order) && policy.order.length
        ? policy.order
        : Object.keys(modes);
    const domainList = Array.isArray(domains) ? domains.filter((d) => d != null && d !== '') : [];

    // 도메인 d 로 allowed/forbidden 을 모두 치환한 구체 정책(threshold 계산 입력). d=null 이면 무치환.
    // ({roles.X} 는 호출부가 이미 펼쳤다고 가정 — resolvePolicyPaths. 여기선 {domain} 만 구체화.)
    const concreteCache = new Map();
    function concretePolicyFor(d) {
      const key = d == null ? '\0null' : d;
      if (concreteCache.has(key)) return concreteCache.get(key);
      const outModes = {};
      for (const [name, mode] of Object.entries(modes)) {
        outModes[name] = {
          allowed_paths: (mode.allowed_paths || []).map((x) => substituteDomain(toPosix(x), d)),
          forbidden_paths: (mode.forbidden_paths || []).map((x) => substituteDomain(toPosix(x), d)),
        };
      }
      const cp = { ...policy, order, modes: outModes };
      concreteCache.set(key, cp);
      return cp;
    }

    const set = new Set();
    // surface → 채택 시 쓴 도메인별 구체 정책의 threshold(모드 이름). clearance 가 이 값을 재사용한다
    // (토큰화 resolvedPolicy 로 thresholdOf 재계산 금지 — M3). openapi.yaml/yml 은 의도적으로 미기록
    // (threshold 부재 → clearance 항상 false, deriveGuardedSurface/thresholdOf(null) 의미 보존).
    const thresholds = new Map();
    for (let idx = 0; idx < order.length; idx++) {
      const mode = modes[order[idx]];
      if (!mode) continue;
      for (const f of mode.forbidden_paths || []) {
        const g = toPosix(f);
        const cls = classifyForbidden(g);
        if (cls === 'blanket') continue; // src/** 제외(공유코드 오탐)
        // domain-scoped 는 실제 도메인들로 펼치고(각각 그 도메인 구체 정책으로 threshold),
        // global+specific 은 도메인 무관(d=null) 한 후보 하나로 둔다.
        const candidates =
          cls === 'domain-scoped'
            ? domainList.map((d) => ({ surface: substituteDomain(g, d), domain: d }))
            : [{ surface: g, domain: null }];
        for (const { surface, domain } of candidates) {
          // 펼친 뒤에도 {domain}/{screen} 이 남으면(도메인 리스트 비었거나 {screen} 포함) 구체화 불가 → 제외.
          if (classifyForbidden(surface) !== 'global+specific') continue;
          const cp = concretePolicyFor(domain);
          const threshold = thresholdOf(cp, surface);
          if (threshold == null) continue; // 어떤 모드도 S 전체를 allow 안 함 → 레이어 경계 아님
          // (b) 금지 모드가 threshold 보다 엄격히 아래일 때만 채택(낮은 금지 → 높은 허용 경계).
          if (idx < order.indexOf(threshold)) {
            set.add(surface);
            // 같은 표면이 여러 도메인/모드에서 채택될 수 있다 — deriveGuardedSurface 의 "가장 낮은(먼저
            // 만나는) 모드" 의미를 유지하려 더 낮은 order index 의 threshold 만 기록한다.
            const prev = thresholds.get(surface);
            if (prev == null || order.indexOf(threshold) < order.indexOf(prev)) {
              thresholds.set(surface, threshold);
            }
          }
        }
      }
    }
    // openapi parity (deriveGuardedSurface 와 동일 — yaml/yml 둘 다, threshold 무관 항상 플래그).
    set.add('openapi.yaml');
    set.add('openapi.yml');
    const surfaces = [...set].sort();
    // back-compat: string[] 를 그대로 돌려주되 concrete threshold 접근자를 non-enumerable 로 얹는다.
    //   thresholdOf(surface) -> modeName|null : 채택 시 쓴 구체 정책의 threshold(미채택/openapi 는 null).
    Object.defineProperty(surfaces, 'thresholdOf', {
      value: (surface) => {
        const t = thresholds.get(surface);
        return t == null ? null : t;
      },
      enumerable: false,
    });
    return surfaces;
  }

  // --- resolvedLayout 객체 --------------------------------------------------
  return {
    roleGlobs,
    roleToDir,
    resolvePaths,
    materializeGuardedSurface,
    rolesFor,
    layersFor,
    // raw 노출(README §1.1 — 소비처가 필요 시 직접 조회).
    roles: baseRoles,
    layers: baseLayers,
    layerTelemetryDeclared: projectLayersDeclared || domainLayersDeclared,
    domains: domainOverrides,
    preset: presetName || null,
  };
}

export default loadLayoutProfile;
