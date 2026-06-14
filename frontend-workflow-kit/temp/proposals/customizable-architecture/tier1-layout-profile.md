# Tier 1 — Layout Profile (role → glob) — design

> Status: DESIGN / SPEC ONLY. 2026-06-14. 소비 프로젝트의 **코드 디렉토리 구조**를 하드코딩 대신
> 설정으로 커스텀화하는 설계. **구현이 아니다** — 코드·package script·CI·기존 정책/매니페스트 파일
> 변경을 지시하지 않는다. 상위 맥락: [README.md](README.md). 짝 문서: [tier2-router-adapter.md](tier2-router-adapter.md).

---

# 0. Scope / Non-goals

- 이 문서는 **설계만** 산출한다. 다음은 명시적 non-goal:
  - `scripts/lib/layout-profile.mjs` 등 **코드를 구현하지 않는다**.
  - `implementation-mode-policy.yaml`·`artifact-manifest.yaml`·`readiness.mjs` 를 **이 작업에서 수정하지 않는다**.
    아래 모든 변경은 **PROPOSED (future PR)** 표기다.
  - `package.json` / `package-scripts.template.json` / CI 변경 없음.
- 티어1은 **경로 바인딩만** 다룬다. router/codegen 의미(파일트리 발견 vs 코드정의)는 [티어2](tier2-router-adapter.md).
- 킷 내부 문서경로(`docs/frontend-workflow/...`)는 **건드리지 않는다** — 그건 킷의 네임스페이스이고
  `{domain}/{screen}` 로 이미 토큰화돼 있다. 티어1이 바꾸는 건 *소비 프로젝트 코드경로*뿐이다.

---

# 1. 경로는 사실 두 종류다

| 종류 | 예시 | 프로젝트마다 바뀌나 | 티어1 대상 |
|---|---|---|---|
| **킷 내부 문서경로** | `docs/frontend-workflow/domains/{domain}/screens/{screen}/...` | ❌ 킷 네임스페이스. `{domain}/{screen}` 이미 토큰화 | 아니오 (그대로) |
| **소비 프로젝트 코드경로** | `src/features/{domain}/screens`, `src/app`, `src/components/ui`, `src/api` | ✅ 디자인 패턴마다 다름 | **예** |

티어1은 두 번째 줄만 다룬다.

---

# 2. Layout Profile — role → glob

핵심 아이디어: 정책이 **물리 경로**가 아니라 **논리적 역할(role)**을 단위로 삼고, role→glob 바인딩을
별도 프로파일 하나에 모은다. (선례: shadcn/ui `components.json` 의 `aliases` 맵 — CLI 가 그 맵을 읽어
"어디에 쓸지"를 안다.)

```yaml
# policies/project-layout.yaml   (PROPOSED — 신규 파일)
version: 1
preset: expo-feature             # 동봉 프리셋 이름. 또는 custom

roles:                           # 논리적 역할 → 물리 glob. {domain} 토큰만 중첩 가능
                                 # ({screen} 은 정책 경로 해소에서 치환되지 않는다 — readiness.mjs:152
                                 #  substituteDomain 은 {domain} 만 처리. §2 주의 참고)
  route_entry:       src/app/**
  screen:            src/features/{domain}/screens/**
  domain_component:  src/features/{domain}/components/**
  hook:              src/features/{domain}/hooks/**
  ui_primitive:      src/components/ui/**
  api_client:        src/api/**
  api_schema:        src/api/schemas/**   # validate 검사 8(스키마 매칭)이 바인딩 — §8·§10
```

정책은 물리 경로 대신 role 토큰을 참조한다 (판정 로직 `requires:` 는 **불변**):

```yaml
# implementation-mode-policy.yaml  (PROPOSED 변형 — 경로만 토큰화)
rough-fixture-ui:
  requires: [ ... 변경 없음 ... ]
  allowed_paths:
    - "{roles.screen}"
    - "{roles.domain_component}"
    - "{roles.hook}"
  forbidden_paths:
    - "{roles.api_client}"
    - openapi.yaml
```

`catalog/artifact-manifest.yaml` 의 생성뷰 `source:` 도 같은 방식 (L184 `src/components/ui/**` →
`{roles.ui_primitive}`, L201 `src/app/**` → `{roles.route_entry}`).

> **주의 (Codex 정정):** (1) `{screen}` 은 *코드 경로* role 에서 치환되지 않는다 — `readiness.mjs:152`
> `substituteDomain` 은 `{domain}` 만 처리하고 allowed/forbidden 경로는 그 helper 로 매핑되므로
> (`readiness.mjs:305`) `{screen}` 은 리터럴로 남는다. 코드 role 은 `screens/**` 처럼 글롭으로 충분하니
> v1 은 `{screen}` 을 코드 role 범위에서 제외한다. (`{screen}` 은 킷 *문서* 경로 전용.)
> (2) `api_schema` 는 `api_client` 와 별도다 — `validate.mjs:269` 검사 8 이 `<srcDir>/api/schemas` 를
> *직접* 보므로, `api_client` 만 바꾸면 스키마 검사가 따라오지 않는다. 그래서 별도 role 로 분리했다.

---

# 3. 다중 경로 role (`string | string[]`)

한 role 이 글롭 하나에 묶일 필요는 없다. 값에 리스트를 허용하고 로더가 펼친다. 하위의 `allowed_paths`
는 **이미 리스트**라(readiness.mjs:305 `.map(...)`) 다운스트림 변경이 없다.

```yaml
roles:
  ui_primitive:
    - src/components/ui/**
    - src/shared/ui/**            # 일부 도메인은 shared 도 씀
  domain_component:
    - src/features/{domain}/components/**
    - src/features/{domain}/widgets/**
```

role 이 N개 글롭으로 펼쳐지면 정책의 `allowed_paths` 리스트에 N개 항목으로 spread 된다.

---

# 4. 도메인별 role 오버라이드

"도메인마다 디자인 패턴이 다른" 케이스. 기본 role 위에 도메인 레이어를 얹는다.

```yaml
roles:                            # 기본 패턴 (대부분 도메인)
  domain_component: src/features/{domain}/components/**

domains:
  legacy-admin:                   # 이 도메인만 atomic 패턴
    roles:
      domain_component:
        - src/features/{domain}/atoms/**
        - src/features/{domain}/molecules/**
        - src/features/{domain}/organisms/**
```

머지 규칙: **role 단위 교체** (도메인이 명시한 role 만 base 를 덮어쓴다; 나머지 role 은 base 상속).

---

# 5. 해소 순서 (the seam)

토큰 치환은 **3단계**이고, 핵심은 role 펼침을 readiness 의 *기존* per-screen 치환 **앞에** 끼우는 것이다.

```
정책 로드
  → ① role 토큰 펼치기  (프로젝트 1회; domains 오버라이드 적용 안 한 base 부분)
       → "resolved policy" (아직 {domain} 남아 있음 — 코드 경로엔 {screen} 없음; §2 주의)
  → ② readiness 가 화면을 순회 (readiness.mjs:212 for...of state.screens)
       → 화면의 domain 으로 domains.<d>.roles 오버라이드 선택 (있으면)
       → {domain} 치환 (기존 substituteDomain, readiness.mjs:152 · 305-308)
```

- **①**은 `loadYamlOrExit(policyPath)` 직후, `computeReadiness` 입력으로 넘기기 전에 한 번.
  신규 helper `scripts/lib/layout-profile.mjs`(PROPOSED)가 담당: 프로파일 로드 → preset 머지 →
  role 토큰을 정책/매니페스트 글롭에 펼침.
- **②**는 이미 존재한다. `substituteDomain`(readiness.mjs:152)을 `resolvePaths(p, screen, profile)`
  로 일반화해 도메인 오버라이드 룩업만 추가하면 된다.

이 순서 덕에 `{domain}` 은 *화면별* 다른 값으로 펼쳐진다. **단(Codex 정정), 도메인 오버라이드가 있는
role 은 ①에서 접지(collapse)되지 않는다** — role 식별자가 ②까지 살아남아야 화면의 도메인에 맞는
바인딩을 고를 수 있다. 즉 "프로젝트 1회 펼침"은 *도메인-무관 base role* 에만 적용되고, 도메인별 분기는
②(per-screen)에서 일어난다. 로더가 산출하는 건 단일 글롭 문자열이 아니라 **role 식별자를 보존한
`resolvedLayout` 객체**다 (README §1.1).

---

# 6. 무엇이 무변경이고 무엇이 바뀌어야 하나 (Codex 정정)

초안은 "하위 소비자 전부 무변경"이라 했으나 부정확했다. **글롭 *매칭* helper 는 profile-neutral
이지만, 경로를 *fact 로 파생*하거나 *사람-대상 카피에 박아 넣는* 소비처는 resolved-layout 을 받아야 한다.**

**무변경 (글롭 매칭 — 펼쳐진 글롭만 봄):**
- `path-backstop.mjs` 의 `globToRegex`/`covers`/`thresholdOf`(L35–104)는 글롭 문자열만 보므로 무관.
- `classifyForbidden`(L66)은 펼친 뒤에도 `{domain}` 을 domain-scoped 로 분류 — 단 이게 §7 의 긴장점을 만든다.

**변경 필요 (경로를 fact/카피로 직접 사용 — README §1.1 의 resolved-layout 소비처):**
- `scripts/lib/spec.mjs:301-305` — `fake_hook_exists` 를 `<srcDir>/features/<domain>/hooks` 에서 파생.
  `{roles.hook}` 과 **반드시 같은** 경로를 써야 `rough-fixture-ui` 게이트가 안 깨진다 (§10 **CRITICAL**).
- `scripts/validate.mjs:269` — 검사 8 이 `<srcDir>/api/schemas` 를 검사. `{roles.api_schema}` 바인딩 필요.
- `scripts/lib/workflow-packet.mjs:16-44` — `MODE_HINTS` 의 사람-대상 경로 카피. resolved role 에서 생성.
- `scripts/lib/check-generated-files.mjs:111` — route-tree 재현 가드의 `resolveInput: ({srcDir}) =>
  path.join(srcDir,'app')` 이 `<srcDir>/app`(= `route_entry`)을 하드코딩. `{roles.route_entry}` 바인딩
  필요 — 안 하면 커스텀 라우트 경로(예: Next `app/**`)를 쓰는 프로젝트에서 생성물 가드가 입력 디렉토리를
  못 짚는다. ※ 이 경로는 tier2 router 어댑터의 `route_entry` 와 **같은 출처**라, tier1 에서 role 로
  묶으면 tier2 도 자동 정합된다.

즉 role 펼침은 글롭 소비처엔 로드타임 단일 지점으로 충분하지만, **fact/카피 소비처엔 `resolvedLayout`
을 주입**해야 한다. 이 둘을 한 객체로 묶는 게 README §1.1 의 요점.

---

# 7. 한 가지 진짜 긴장점 — guarded surface (Codex 정정)

`path-backstop.mjs:112` `deriveGuardedSurface(policy)` 는 프로젝트 전역에서 guarded surface 를 1회
계산한다. **중요:** 이 함수는 `classifyForbidden`(L66, 사용처 L119)으로 `{domain}`/`{screen}` 포함
글롭을 domain-scoped 로 보고 **guarded 에서 제외**한다. 따라서 도메인별 `forbidden_paths`(보통 `{domain}`
포함)는 현 로직으론 *애초에 guard 되지 않는다* — "union 을 path-backstop 무변경으로 얻는다"는 초안
주장(이전 §6·§7)은 틀렸다.

두 선택 (둘 다 path-backstop 의 *입력*을 바꿔야 함):

| 선택 | 내용 | 비용 | MVP |
|---|---|---|---|
| **(i) 사전 구체화 union (권장)** | 로더가 `{domain}` 을 *실제 도메인들*로 펼쳐 **구체(global+specific) 글롭의 합집합**을 만들어 넘김. 더는 domain-scoped 가 아니므로 `deriveGuardedSurface` 가 정상 guard | 낮음~중간 (로더에 도메인 펼침 1단계) | ✅ |
| (ii) explicit surfaces 주입 | `deriveGuardedSurface` 시그니처를 바꿔 정책 대신 **resolved guarded surface 배열**을 받게 | 중간 (path-backstop 변경) | 대안 |

**권장:** MVP 는 (i) — 로더가 도메인별 forbidden 을 *구체 글롭 합집합*으로 사전 구체화해 path-backstop 에
넘긴다. 도메인별 패턴 다양성은 `allowed_paths` 에서 먼저 쓰고, `forbidden` 천장은 이 union 으로
보수적·fail-closed. **오버블로킹(무관 도메인까지 막힘) 가능성은 의도적으로 가시화**해야 한다(doctor/리포트에
union surface 출력). `path-backstop.mjs:130` 의 기존 "프로젝트 단위 clearance" trade-off 와 일관.

---

# 8. 프리셋 + 머지

킷에 프리셋을 동봉하고(PROPOSED `presets/*.yaml`), 소비자는 `preset:` 선택 또는 `roles:` 부분 오버라이드.

- `presets/expo-feature.yaml` — **현 하드코딩과 byte-동치** (§10 회귀 기준)
- `presets/next-app.yaml` — `route_entry: app/**`, `ui_primitive: components/ui/**`,
  `api_client: lib/api/**`, `api_schema: lib/api/schemas/**` (검사 8 바인딩 — §6·§2 주의)
- `presets/fsd.yaml` — Feature-Sliced Design (`src/pages`, `src/features`, `src/shared/ui` …). **추상화
  일반성 스트레스 테스트**: FSD 레이어가 깔끔히 매핑되면 합격.
- `presets/atomic.yaml` — atomic design

머지: `preset < 소비자 roles 오버라이드 < domains.<d>.roles` (좁은 스코프가 이긴다).

---

# 9. doctor 검사

프로파일이 경로 단일 출처가 됐으니, 신규 `scripts/doctor.mjs`(PROPOSED)가 **설정된 글롭이 실제
레포에 존재하는지** 검사할 수 있다. `README.md:87` 에서 수작업(`create-expo-app` dry-run)으로 확인하던
"경로 정합"을 코드로 대체 — 오설정 조기 발견.

```
$ npm run workflow:doctor
  ✓ route_entry      src/app/**            (12 files)
  ✗ ui_primitive     src/components/ui/**  (0 files) — 경로 오타? 프리셋 불일치?
```

---

# 10. 영향 파일 / 마이그레이션 (PROPOSED, future PR)

| 종류 | 파일 | 변경 |
|---|---|---|
| new | `policies/project-layout.yaml` | role→glob 프로파일 (+`adapters`, 티어2 선택도 같은 파일) |
| new | `presets/{expo-feature,next-app,fsd,atomic}.yaml` | 프리셋 |
| new | `scripts/lib/layout-profile.mjs` | 로더 + preset 머지 + role 펼침 + **도메인 펼침(§7-i)** → `resolvedLayout` 산출 |
| edit | `policies/implementation-mode-policy.yaml` | 글롭 → role 토큰 |
| edit | `catalog/artifact-manifest.yaml` | 생성뷰 `source:` 글롭 → role 토큰 (L184, L201) |
| edit | `scripts/readiness.mjs` | `substituteDomain` → `resolvePaths`; L62 힌트 토큰화 |
| **edit** | **`scripts/lib/spec.mjs`** (L301-305) | **`fake_hook_exists` 파생을 `{roles.hook}` 에 바인딩 — CRITICAL: 누락 시 라이브 게이트 오작동** |
| edit | `scripts/validate.mjs` (L269) | 검사 8 의 `<srcDir>/api/schemas` 를 `{roles.api_schema}` 에 바인딩 |
| edit | `scripts/lib/workflow-packet.mjs` (L16-44) | `MODE_HINTS` 경로 카피를 resolved role 에서 생성 |
| edit | `scripts/lib/check-generated-files.mjs` (L111) | route-tree 재현 `resolveInput`(`<srcDir>/app`) → `{roles.route_entry}` 바인딩 (tier2 router 경로와 공유 — 문서·Codex 리뷰가 놓친 4번째 사이트) |
| new | `scripts/doctor.mjs` | (선택) 경로 존재 검사 |

> **CRITICAL (Codex):** `spec.mjs` 의 `fake_hook_exists` 는 `<srcDir>/features/<domain>/hooks` 를 보는
> **라이브 게이트 fact** 다 — `readiness.mjs:62` 힌트 *문자열*과는 별개. 이걸 `{roles.hook}` 에 묶지
> 않으면 커스텀 hook 경로를 쓰는 프로젝트가 `rough-fixture-ui` 에서 영구히 막힌다. fact 파생 일원화
> (README §1.1)의 1순위 대상.

**회귀 기준:** `presets/expo-feature.yaml` 가 현 하드코딩과 동치이므로, `examples/coupon-feature`
골든 픽스처(`expected-readiness.json` 등)와 `fake_hook_exists` 게이트가 **그대로 통과**해야 한다.
프로파일 도입은 동작 변경이 아니라 *값의 출처 이동*이다.

---

# 11. Open decisions

- **프로파일 위치:** 킷 내부 `policies/project-layout.yaml` vs 소비 프로젝트 루트 `.frontend-workflow/layout.yaml`?
  (킷은 `tools/frontend-workflow/` 로 vendoring 되므로 — README §설치 — 소비 프로젝트가 자기 루트에서
  오버라이드하게 하는 편이 이식성에 맞을 수 있음.)
- **preset 머지 깊이:** role 단위 교체(§4 채택) vs glob 단위 병합?
- **도메인 오버라이드를 `forbidden` 에도 허용?** §7 의 (i) 합집합과 어떻게 공존시킬지.
- **티어2 와의 결합점:** 어댑터 `discover()` 의 입력으로 이 프로파일의 어떤 role 을 넘길지
  (예: router 어댑터는 `route_entry` 글롭을 스캔 대상으로 받음). → [tier2 §5](tier2-router-adapter.md).
