// layout-profile.test.mjs — tier1 레이아웃 프로파일 로더 회귀 테스트 (node:test, 외부 의존성 0).
// 설계: temp/proposals/customizable-architecture/tier1-layout-profile.md (§2·§5·§7·§10), README §1.1.
// 막는 회귀:
//   - role→dir/glob 해소가 expo-feature 프리셋(=현 하드코딩)과 동치인지(HARD CONSTRAINT byte-parity).
//   - resolvePaths 의 {roles.X} 펼침 + {domain} 치환(§5 the seam) + 리터럴 passthrough.
//   - MAJOR 1 fail-CLOSED: 정의되지 않은 role 토큰은 throw(조용히 [] 로 떨궈 forbidden 누락 금지).
//   - MINOR 1: domain='' 은 null 처럼 {domain} 을 보존(falsy-domain 의미).
//   - §7-i union: materializeGuardedSurface 가 expo 에선 deriveGuardedSurface(rawLiteral) 와 BYTE-동치.
//   - MAJOR 3: 도메인-스코프 forbidden(낮은 모드 금지→높은 모드 허용)이 구체 정책 threshold 로 실제
//     guarded surface 에 나타난다(이전 버그: 구체 forbidden 을 토큰화 allowed 와 비교해 조용히 누락).
//   - M3 clearance: materializeGuardedSurface 가 노출한 구체 thresholdOf(surface) 로 clearance 를
//     계산하면 커스텀 도메인 표면이 화면 readiness 도달 시 CLEAR 된다(이전: 토큰화 정책으로 thresholdOf
//     재계산 → null → 영구 fail-closed). 미달 시엔 여전히 위반. expo 글로벌 표면 threshold 는 불변.
// 실행: npm run test:spec  (또는 node --test scripts/lib/layout-profile.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLayoutProfile, LayoutConfigError } from './layout-profile.mjs';
import { deriveGuardedSurface, isCleared, isClearedAt } from './path-backstop.mjs';

// 킷 루트: scripts/lib/ → scripts/ → kit-root. presets/·policies/ 가 그 아래.
const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// 기본 프로파일(policies/project-layout.yaml → preset: expo-feature). --layout 없는 통상 경로.
function expoLayout() {
  return loadLayoutProfile({ kitRoot: KIT_ROOT });
}

// 현 하드코딩(=expo-feature)과 동치인 *리터럴* 정책. deriveGuardedSurface 회귀 기준(§10).
// (implementation-mode-policy.yaml 의 토큰화 이전 형태 — {domain} 리터럴, role 토큰 없음.)
function rawLiteralExpoPolicy() {
  return {
    order: [
      'docs-only',
      'route-skeleton',
      'screen-skeleton',
      'rough-fixture-ui',
      'final-fixture-ui',
      'api-integrated-ui',
      'production-ready',
    ],
    modes: {
      'docs-only': { allowed_paths: ['docs/frontend-workflow/**'], forbidden_paths: ['src/**'] },
      'route-skeleton': {
        allowed_paths: ['src/app/**'],
        forbidden_paths: ['src/features/**', 'src/api/**'],
      },
      'screen-skeleton': {
        allowed_paths: ['src/features/{domain}/screens/**'],
        forbidden_paths: ['src/api/**', 'openapi.yaml'],
      },
      'rough-fixture-ui': {
        allowed_paths: [
          'src/features/{domain}/screens/**',
          'src/features/{domain}/components/**',
          'src/features/{domain}/hooks/**',
        ],
        forbidden_paths: ['src/api/**', 'openapi.yaml'],
      },
      'final-fixture-ui': {
        allowed_paths: ['src/features/{domain}/screens/**', 'src/features/{domain}/components/**'],
        forbidden_paths: ['src/api/**'],
      },
      'api-integrated-ui': {
        allowed_paths: ['src/features/{domain}/hooks/**', 'src/api/**'],
        forbidden_paths: ['src/features/{domain}/screens/**'],
      },
      'production-ready': { allowed_paths: ['src/**'], forbidden_paths: [] },
    },
  };
}

// 정책의 {roles.X} 토큰을 layout 으로 펼친 "resolved policy"(forbidden-paths.mjs resolvePolicyPaths 미러).
// {domain} 은 보존한다(materializeGuardedSurface 가 도메인 union 을 직접 펼침 — §7-i).
function resolvePolicyPaths(policy, layout) {
  const out = {};
  for (const [name, mode] of Object.entries(policy.modes || {})) {
    out[name] = {
      ...mode,
      allowed_paths: layout.resolvePaths(mode.allowed_paths || [], {}),
      forbidden_paths: layout.resolvePaths(mode.forbidden_paths || [], {}),
    };
  }
  return { ...policy, modes: out };
}

// 토큰화된 expo 정책(role 토큰 형태 — implementation-mode-policy.yaml 과 동형). resolvePolicyPaths 입력.
function tokenizedExpoPolicy() {
  return {
    order: rawLiteralExpoPolicy().order,
    modes: {
      'docs-only': { allowed_paths: ['docs/frontend-workflow/**'], forbidden_paths: ['src/**'] },
      'route-skeleton': {
        allowed_paths: ['{roles.route_entry}'],
        forbidden_paths: ['src/features/**', '{roles.api_client}'],
      },
      'screen-skeleton': {
        allowed_paths: ['{roles.screen}'],
        forbidden_paths: ['{roles.api_client}', 'openapi.yaml'],
      },
      'rough-fixture-ui': {
        allowed_paths: ['{roles.screen}', '{roles.domain_component}', '{roles.hook}'],
        forbidden_paths: ['{roles.api_client}', 'openapi.yaml'],
      },
      'final-fixture-ui': {
        allowed_paths: ['{roles.screen}', '{roles.domain_component}'],
        forbidden_paths: ['{roles.api_client}'],
      },
      'api-integrated-ui': {
        allowed_paths: ['{roles.hook}', '{roles.api_client}'],
        forbidden_paths: ['{roles.screen}'],
      },
      'production-ready': { allowed_paths: ['src/**'], forbidden_paths: [] },
    },
  };
}

// --- role → dir / glob (expo-feature 동치) ---------------------------------

test('roleToDir: hook/api_schema/route_entry 가 expo-feature 와 동치', () => {
  const L = expoLayout();
  assert.equal(L.roleToDir('hook', { domain: 'coupons' }), 'src/features/coupons/hooks');
  assert.equal(L.roleToDir('api_schema'), 'src/api/schemas');
  assert.equal(L.roleToDir('route_entry'), 'src/app');
});

test('resolvePaths: {roles.X} 펼침 + {domain} 치환 + 리터럴 passthrough', () => {
  const L = expoLayout();
  assert.deepEqual(
    L.resolvePaths(['{roles.screen}', 'src/features/**', 'openapi.yaml'], { domain: 'coupons' }),
    ['src/features/coupons/screens/**', 'src/features/**', 'openapi.yaml'],
  );
});

// --- MAJOR 1: fail-CLOSED -------------------------------------------------

test('MAJOR 1: 정의되지 않은 role 토큰(whole)은 THROW (fail-closed)', () => {
  const L = expoLayout();
  assert.throws(() => L.resolvePaths(['{roles.does_not_exist}'], {}), LayoutConfigError);
});

test('MAJOR 1: 정의되지 않은 role 토큰(embedded)도 THROW', () => {
  const L = expoLayout();
  assert.throws(() => L.resolvePaths(['prefix/{roles.nope}/x'], { domain: 'coupons' }), LayoutConfigError);
});

test('MAJOR 1: 명시적 --layout 경로 부재는 THROW (조용한 빈 roles 금지)', () => {
  assert.throws(
    () => loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: path.join(KIT_ROOT, 'policies', '__no_such__.yaml') } }),
    LayoutConfigError,
  );
});

// --- MINOR 1: domain='' falsy 의미 ----------------------------------------

test("MINOR 1: domain='' 는 {domain} 을 보존(null 과 동일 falsy 의미)", () => {
  const L = expoLayout();
  // role 토큰은 펼치되, 펼친 글롭의 {domain} 과 리터럴 {domain} 은 그대로 둔다.
  assert.deepEqual(L.resolvePaths(['{roles.screen}', '{domain}-x'], { domain: '' }), [
    'src/features/{domain}/screens/**',
    '{domain}-x',
  ]);
  assert.equal(L.roleToDir('hook', { domain: '' }), 'src/features/{domain}/hooks');
});

// --- §7-i union: expo BYTE-동치 -------------------------------------------

test('§7-i: materializeGuardedSurface(expo) == deriveGuardedSurface(rawLiteral)', () => {
  const L = expoLayout();
  const resolved = resolvePolicyPaths(tokenizedExpoPolicy(), L);
  // 실제 도메인이 있어도(coupon/order) 결과 집합은 변하지 않아야 한다(HARD CONSTRAINT).
  const got = L.materializeGuardedSurface(resolved, ['coupon', 'order']);
  const expected = deriveGuardedSurface(rawLiteralExpoPolicy());
  assert.deepEqual(got, expected);
  assert.deepEqual(got, ['openapi.yaml', 'openapi.yml', 'src/api/**']);
});

test('§7-i: 도메인 리스트가 비어도 expo 결과 불변(domain-scoped screens 미채택)', () => {
  const L = expoLayout();
  const resolved = resolvePolicyPaths(tokenizedExpoPolicy(), L);
  assert.deepEqual(L.materializeGuardedSurface(resolved, []), [
    'openapi.yaml',
    'openapi.yml',
    'src/api/**',
  ]);
});

// --- MAJOR 3: 커스텀 도메인-스코프 forbidden 이 실제로 guarded 됨 --------------

test('MAJOR 3: 커스텀 layout 의 도메인-스코프 forbidden role 이 guarded surface 에 나타난다', () => {
  // 임시 project-layout: expo 프리셋 위에 도메인-스코프 role 'legacy' 를 추가한다.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-profile-m3-'));
  const layoutPath = path.join(tmpDir, 'project-layout.yaml');
  try {
    fs.writeFileSync(
      layoutPath,
      [
        'version: 1',
        'preset: expo-feature',
        'roles:',
        '  legacy: src/features/{domain}/legacy/**',
        '',
      ].join('\n'),
    );
    const L = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });

    // 정책: legacy 를 *낮은* 모드(route-skeleton)에서 금지하고 *높은* 모드(final-fixture-ui)에서 허용.
    //   → 낮은 금지 → 높은 허용 = 정상 레이어 경계 → 구체화 시 guarded.
    //   (expo 의 screens 는 반대로 낮은 허용→높은 금지라 채택 안 됨 — 위 §7-i 테스트가 보증.)
    const policy = {
      order: rawLiteralExpoPolicy().order,
      modes: {
        ...tokenizedExpoPolicy().modes,
        'route-skeleton': {
          allowed_paths: ['{roles.route_entry}'],
          forbidden_paths: ['src/features/**', '{roles.api_client}', '{roles.legacy}'],
        },
        'final-fixture-ui': {
          allowed_paths: ['{roles.screen}', '{roles.domain_component}', '{roles.legacy}'],
          forbidden_paths: ['{roles.api_client}'],
        },
      },
    };
    const resolved = resolvePolicyPaths(policy, L);
    const surface = L.materializeGuardedSurface(resolved, ['legacymod']);

    // ★ 핵심: 구체화된 도메인-스코프 forbidden 이 guarded surface 에 실제로 등장한다(이전 버그면 누락).
    //   이전 코드는 thresholdOf(토큰화 allowed) 로 비교해 covers 가 빗나가 이 표면을 조용히 버렸다.
    assert.ok(
      surface.includes('src/features/legacymod/legacy/**'),
      `도메인-스코프 forbidden 이 guarded 돼야 한다(M3). 실제: ${JSON.stringify(surface)}`,
    );
    // expo 의 src/api/** 과 openapi parity 는 그대로 유지.
    assert.ok(surface.includes('src/api/**'));
    assert.ok(surface.includes('openapi.yaml') && surface.includes('openapi.yml'));
    // screens 는 여전히 채택 안 됨(낮은 허용→높은 금지 — 재-잠금 계약).
    assert.ok(!surface.includes('src/features/legacymod/screens/**'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- M3 clearance: 커스텀 도메인-스코프 표면이 영구 fail-closed 가 아니라 화면 readiness 도달 시 CLEAR ----

test('M3 clearance: 커스텀 도메인-스코프 표면이 구체 threshold 도달 시 CLEAR (미달 시 위반)', () => {
  // MAJOR 3 와 동일한 임시 layout/policy — legacy 를 route-skeleton(낮음)에서 금지, final-fixture-ui(높음)에서 허용.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-profile-m3-clear-'));
  const layoutPath = path.join(tmpDir, 'project-layout.yaml');
  try {
    fs.writeFileSync(
      layoutPath,
      ['version: 1', 'preset: expo-feature', 'roles:', '  legacy: src/features/{domain}/legacy/**', ''].join('\n'),
    );
    const L = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });
    const policy = {
      order: rawLiteralExpoPolicy().order,
      modes: {
        ...tokenizedExpoPolicy().modes,
        'route-skeleton': {
          allowed_paths: ['{roles.route_entry}'],
          forbidden_paths: ['src/features/**', '{roles.api_client}', '{roles.legacy}'],
        },
        'final-fixture-ui': {
          allowed_paths: ['{roles.screen}', '{roles.domain_component}', '{roles.legacy}'],
          forbidden_paths: ['{roles.api_client}'],
        },
      },
    };
    const resolved = resolvePolicyPaths(policy, L);
    const guarded = L.materializeGuardedSurface(resolved, ['legacymod']);
    const order = resolved.order;

    const surface = 'src/features/legacymod/legacy/**';
    // (a) 표면이 guarded 이고, 노출된 구체 threshold 가 final-fixture-ui(허용 모드)다.
    assert.ok(guarded.includes(surface), `표면이 guarded 여야 한다. 실제: ${JSON.stringify(guarded)}`);
    const threshold = guarded.thresholdOf(surface);
    assert.equal(threshold, 'final-fixture-ui');

    // ★ M3 핵심: 이전 버그라면 forbidden-paths 가 thresholdOf(resolved=토큰화, surface) 로 재계산해
    //   null 을 얻어 isCleared 가 항상 false → 영구 fail-closed. 그것을 재현해 NOT-CLEAR 임을 보인다.
    const readinessAbove = { S1: { readiness_mode: 'api-integrated-ui' } }; // threshold 초과
    assert.equal(
      isCleared(surface, readinessAbove, resolved),
      false,
      '이전 경로(토큰화 정책으로 thresholdOf 재계산)는 covers 가 빗나가 영구 fail-closed 였다(버그 재현).',
    );

    // (b) 수정된 경로: 구체 threshold 를 직접 써서 clearance 판정.
    //   화면이 threshold 이상(>=)에 도달 → CLEAR.
    assert.equal(
      isClearedAt(threshold, { S1: { readiness_mode: 'final-fixture-ui' } }, order),
      true,
      'threshold 와 동일 모드 화면이면 CLEAR 여야 한다(>= 경계).',
    );
    assert.equal(
      isClearedAt(threshold, { S1: { readiness_mode: 'api-integrated-ui' } }, order),
      true,
      'threshold 초과 모드 화면이면 CLEAR 여야 한다(누적 사다리).',
    );
    //   화면이 threshold 미만 → NOT CLEAR (여전히 위반 — fail-closed 가 의도대로 동작).
    assert.equal(
      isClearedAt(threshold, { S1: { readiness_mode: 'screen-skeleton' } }, order),
      false,
      'threshold 미만 모드 화면이면 NOT CLEAR(위반) 여야 한다.',
    );
    assert.equal(
      isClearedAt(threshold, {}, order),
      false,
      '화면이 없으면 NOT CLEAR(위반) 여야 한다.',
    );

    // expo parity: 글로벌 표면 src/api/** 의 구체 threshold 는 api-integrated-ui 로 불변 → clearance 불변.
    assert.equal(guarded.thresholdOf('src/api/**'), 'api-integrated-ui');
    // openapi 표면은 threshold 미기록(null) → clearance 항상 false(변경 시 항상 플래그).
    assert.equal(guarded.thresholdOf('openapi.yaml'), null);
    assert.equal(isClearedAt(guarded.thresholdOf('openapi.yaml'), { S1: { readiness_mode: 'production-ready' } }, order), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- custom fixture: 머지 3계층(preset < roles < domains.<d>.roles) 온-디스크 회귀 --------------
// examples/layout-profile/custom-monorepo/project-layout.yaml 를 --layout 으로 로드한다.
// (위 MAJOR3/M3 케이스는 tmp 파일 — 여기선 *커밋된* fixture 로 도메인 오버라이드 해소를 고정한다.)
// 배경: temp/runs/tier1-integration-dogfood-001.md §7-1·§8.
const CUSTOM_LAYOUT = path.join(
  KIT_ROOT, 'examples', 'layout-profile', 'custom-monorepo', 'project-layout.yaml',
);
function customLayout() {
  return loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: CUSTOM_LAYOUT } });
}

test('custom fixture: preset < roles — route_entry 재바인딩(app/**), 비오버라이드 role 은 프리셋 상속', () => {
  const L = customLayout();
  assert.deepEqual(L.roleGlobs('route_entry'), ['app/**']); // roles 가 프리셋 src/app/** 을 role 단위 교체
  assert.equal(L.roleToDir('route_entry'), 'app');
  assert.deepEqual(L.roleGlobs('ui_primitive'), ['src/components/ui/**']); // 비오버라이드 → 프리셋 상속
  assert.equal(L.preset, 'expo-feature');
});

test('custom fixture: roles < domains.<d>.roles — legacy 도메인만 screen 오버라이드(도메인-스코프 격리)', () => {
  const L = customLayout();
  assert.ok(Object.keys(L.domains).includes('legacy'));
  // legacy 도메인: 오버라이드된 screen 경로로 해소(+{domain} 치환).
  assert.deepEqual(L.resolvePaths(['{roles.screen}'], { domain: 'legacy' }), [
    'src/legacy/legacy/screens/**',
  ]);
  // 다른 도메인(coupons): base(프리셋) screen 을 그대로 — 도메인 오버라이드가 새지 않는다.
  assert.deepEqual(L.resolvePaths(['{roles.screen}'], { domain: 'coupons' }), [
    'src/features/coupons/screens/**',
  ]);
  // roleToDir 도 도메인별로 갈린다(존재검사용 디렉토리 파생).
  assert.equal(L.roleToDir('screen', { domain: 'legacy' }), 'src/legacy/legacy/screens');
  assert.equal(L.roleToDir('screen', { domain: 'coupons' }), 'src/features/coupons/screens');
});
