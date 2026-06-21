# Tier 3 구현 OD 패킷 — OD-12-impl 결정 + 구현 PR 슬라이스 (설계/준비)

> Status: **IMPLEMENTATION-PREP / PROPOSAL ONLY**. 2026-06-21. 이 문서는 **구현 착수 전 사람이 닫아야 할
> 결정(OD-12-impl)** 과 **구현 PR 순서·범위**를 준비한다. **구현이 아니다** — 코드·`policies/`·`presets/`·
> `templates/`·CI 를 **수정하지 않는다**. 모든 변경은 **PROPOSED (future PR)** 표기.
>
> 전제: PR #76 으로 Tier3 canonical schema 가 **mode×layer access 행렬**로 정리됐다고 가정한다(짝 설계
> [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md) §3 반영 완료).
> 이 패킷은 그 설계의 **§10.3 OD-12-impl 목록을 사람-결정 가능한 체크리스트로 외화**하고, **§11 영향-파일 표를
> 의존성 정렬된 PR 슬라이스로 분해**한다.
>
> 불변식(이 문서가 절대 건드리지 않음): confirmed 승격·OD resolve·hard gate 신설/상향·**구현 착수는 사람만**.
> warning-first 가 기본; hard gate 는 telemetry 후 **별도 사람 OD**. E2E 는 evidence(게이트 아님). Figma
> 수집기/design-token 생성기는 kit core 책임 아님(소비 레포가 준비, kit 는 **받아 적는 계약**만).
>
> 근거(이 세션에서 실독):
> [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md) ·
> [axis2-pivot-decision-prep-001.md](../runs/axis2-pivot-decision-prep-001.md)(OD-12) ·
> [SPIKE-REPORT.md](../runs/axis2-a-blocker1-spike/SPIKE-REPORT.md) ·
> [synth-policy.mjs](../runs/axis2-a-blocker1-spike/synth-policy.mjs)(파리티 하니스) ·
> [EXPERIMENT-REPORT.md](../runs/multilayer-adoption-dryrun/EXPERIMENT-REPORT.md)(다층 dry-run F1~F5) ·
> [implementation-mode-policy.yaml](../../policies/implementation-mode-policy.yaml) ·
> [expo-feature.yaml](../../presets/expo-feature.yaml) ·
> [layout-profile.mjs](../../scripts/lib/layout-profile.mjs) ·
> [spec.mjs](../../scripts/lib/spec.mjs) ·
> [path-backstop.mjs](../../scripts/lib/path-backstop.mjs) ·
> [lint-policy.template.yaml](../../templates/meta/lint-policy.template.yaml) ·
> 정정 제안서(PR #74) [tier3-access-matrix-revision.md](./tier3-access-matrix-revision.md).

---

## 0. 이 패킷이 더하는 것 (기존 문서와의 경계)

기존 두 문서는 OD-12-impl 항목을 **이미** 담고 있다 — tier3 §10.3(#4~#12), axis2-prep §8.2(I1~I7). 중복하지
않는다. 이 패킷의 신규 산출물은 셋:

1. **사람-결정 체크리스트(§2·§7)** — 설계 서사에 묻힌 impl-OD 를 "확인만 하면 되는 것 / 사람이 골라야 하는 것"
   으로 가르고, 각 항목이 *resolve 안 되면 어느 PR 이 못 열리는지* 를 명시.
2. **의존성 정렬 PR 슬라이스(§3)** — §11 영향-파일 표(무순서)를 **선결 트랙 + 코어 트랙**으로 분해하고, PR 별
   allowed/forbidden scope 를 박는다.
3. **파리티 테스트 명세(§5)** — §7 의 "2면 byte-동치"를 *어떤 truth·어떤 생성기·어떤 단언·어떤 골든*으로 거는지
   구체화(현 `synth-policy.mjs` 스파이크를 영속 테스트로 승격하는 경로 포함).

ID 규약: impl-OD 는 **tier3 §10.3 의 #4~#12 를 정본 번호로 채택**한다(axis2-prep 의 I1~I7 은 매핑만 표기).

---

## 1. OD-12(방향) vs OD-12-impl(구현) — 분리 원칙

이미 두 prep 문서가 분리를 선언했다(tier3 §10.2/§10.3, axis2-prep §8.2). 이 패킷은 그 **게이트 논리**를 한 줄로
박는다:

```txt
OD-12 (방향)        →  roadmap/거버넌스만 바꾼다 (문서 편집으로 가역). 코드 0줄.
                       resolve 안 돼도 손해 없음. 이게 닫혀야 OD-12-impl 이 "열린다".
        │  D1=A 일 때만
        ▼
OD-12-impl (구현)   →  code·policy·CI 를 바꾼다 (byte-동치 안전망 필수, 비가역적 위험).
                       각 항목의 답 = 특정 PR 의 scope 제약으로 박힌다.
```

| 축 | OD-12 (방향) | OD-12-impl (구현) |
|---|---|---|
| 무엇을 바꾸나 | roadmap 텍스트·거버넌스 각주 | `layout-profile`/`spec`/`policy`/`lint`/CI |
| 가역성 | 문서 revert | golden 회귀·실프로젝트 영향 |
| 사람 결정 단위 | 단일 resolve(A/B/C + 거버넌스 2건) | **PR 별** 또는 배치 resolve |
| 지금 닫나 | **지금**(prep 완료, §1.2) | **A 일 때만**, PR 열기 직전 |
| 선례 | OD-11 (gate-promotion prep) | tier1 OD-10 (layers 물리위치와 동봉) |

### 1.1 OD-12(방향) — 지금 사람 resolve (이 패킷의 전제, 재확인용)

> 이 패킷은 **D1=A 가 resolve 됐다고 가정**하고 구현을 준비한다. 아래는 prep 의 재게시일 뿐, 이 문서가 닫지 않는다.

- **(D1)** 선회 방향 택1 — **A**(Axis 2 일반화, 추천)/B/C. (axis2-prep §5, tier3 §10.2-1)
- **(D2)** 거버넌스 — "새 산출물 축 아님 = readiness/mode access 표현력 일반화" 명문화 → roadmap 닫힌 목록
  불변, "새 축 금지"에 예외 각주. (tier3 §10.2-2, §9)
- **(D3)** §3 행렬 스키마 재설계 인가 + **신규 계층 게이트 warning-first 기본**(telemetry 전 hard 승격 없음).

### 1.2 OD-12-impl — 이 패킷이 외화한다 (A 일 때만, §2/§7 으로)

방향이 A 면 §2 의 must-close 를 닫고 §3 PR 순서대로 착수. **B/C 면 이 패킷 전체가 보류** — 코어 트랙은 열지
않는다(선결 트랙 §4 는 Axis 2 무관 버그라 별개로 유효).

---

## 2. 구현 착수 전 사람이 닫아야 할 항목 (최소화)

핵심 통찰 — **9개 impl-OD(#4~#12) 중 첫 mergeable 슬라이스를 막는 건 7개뿐**이고, 그중 **3개는 §5(설계)에서 이미
"확정/정리"라 사람은 *확인*만** 하면 된다. #11·#12 는 코어 byte-동치 착지 *후*로 미룰 수 있다(비-블로킹).

### 2.1 "확인만" — 이미 방향 확정, 사람은 서명만 (재오픈 아님)

| # | 항목 | 확정된 내용 (재litigate 금지) | 근거 |
|---|---|---|---|
| **SoT 경계** | source of truth 경계 | role-token allowed/forbidden 셀 = **`layers[].access` authoritative**; 리터럴·`requires`·`order` = 정책 손수. **"정책 손수 유지" 같은 authoritative 역전은 선택지 아님.** | tier3 §5 표·§10.1② |
| **merge 규칙** | `layers` 머지 | tier1 `mergeRoles` 우선순위 계승 — `preset < project-layout < domains.<d>`, **layer 단위 교체**(glob 병합 아님). | [layout-profile.mjs:70-76](../../scripts/lib/layout-profile.mjs) |
| **byte-동치 정의** | access matrix byte-동치 = #7 | **2면**: forward-gate parity(SPIKE v2 0/14) **AND** backstop guarded-surface parity. 한 면만으론 불충분. | tier3 §7·§11, SPIKE |

### 2.2 "사람이 골라야 함" — 진짜 열린 결정 (must-close, 7개)

| impl-OD | 항목(질문 2 매핑) | 선택지 | 보수적 기본 | 막는 PR |
|---|---|---|---|---|
| **#4** (I1) | **정책 파일 전환 방식** (source of truth *운영*) | (a) 즉시 생성물화(role-token 셀 제거 + 멱등성 CI) / (b) 점진 전환(셀 잔존하되 `layers/access` single-source, CI 가 재생성·검증) | **(a)** | **PR-D** |
| **#5** (I2) | **`edits_at` 삭제/alias 잔류** | (a) 손실 alias 로 잔류(§3.1, "v1 draft" 표기) / (b) 완전 삭제 | (b) 삭제(혼선 제거) 또는 (a) 명시-격하 — **둘 다 canonical 부활 금지** | **PR-A** |
| **#8** (I5) | **`layers` 물리 위치** | tier1 **OD-10**(킷 내부 vs 소비 루트)과 **같은 파일에서 함께** 닫는다 | OD-10 결정 상속 | **PR-A** |
| **#9** (I6) | **fact 종류 v1 범위** | v1 = **`dir_has_files` 만**; props/export/test 존재 fact 는 후속 | v1=dir_has_files only | **PR-A/PR-C** |
| **#7** (I4) | **access matrix byte-동치 범위** | forward-gate **AND** backstop 둘 다(§2.1 확인 + 테스트로 강제) | 2면 모두 | **PR-B → PR-D** |
| **lint-DAG** | **lint DAG subset 규칙** | access `layers` 순서에서 **import-경계 계층만** 추린 subset(`route_entry` 제외), `forbid_upward`, warning-first | import-경계 subset + warning | **PR-E** |
| **#10** (I7) | **CI 멱등성 새 target** | role-token 셀이 생성물이면 resolved 정책 재생성·diff 를 **새 check target** 으로 추가(현행은 coupon `_meta` 만 diff) | (a) 선택 시 필수 추가 | **PR-D** |
| **#6** (I3) | **게이트 강도 기본값** | 신규 계층은 `access`(경로 허용)만; `gates`(requires 합성)는 **엄격 opt-in + 사람 승격** | access-only | **PR-C/PR-D** |

> #6 은 #2.2 에 있지만 "기본값 = access-only" 가 사실상 강제(불변식: LLM 은 게이트를 *올리기만*, 내리기 금지 —
> tier3 §5·§9). 사람은 "expo 의 hook 계층에 `gates` 를 붙일지" 만 결정하면 됨(붙이면 현 `fake_hook_exists`
> requires 와 동형이라 byte-동치 유지).

### 2.3 코어 착지 후로 미룸 (비-블로킹, 첫 PR 들에 불필요)

| # | 항목 | 왜 미룰 수 있나 |
|---|---|---|
| **#11** | maturity×depth 표면화 (readiness `next_actions` 가 "어느 계층이 어느 모드를 막는지" 표시) | 출력 UX 개선 — byte-동치 코어와 무관. 코어 착지 후 별 PR. |
| **#12** | tier2 결합 경계 (codegen 출력 계층 hook/api_client 을 layers 가 어디까지 소유) | tier2 어댑터는 read-only/warning-first 보류 중(axis2-prep §6). 결합은 양쪽 착지 후. |

**최소 배치:** PR-A 를 열려면 `{#5, #8, #9, merge-규칙}` 만 닫으면 됨. 위험한 load-bearing PR-D 를 열 때 추가로
`{#4, #7, #10}`. → 사람은 **한 번에 다 결정할 필요 없이** PR 단위로 점증 resolve 가능(§7 체크리스트가 PR 별로
묶여 있음).

---

## 3. 구현 PR 슬라이스 (의존성 정렬)

사용자 예시(PR-A~F)를 실제 레포(`scripts/lib/*` co-located test, CI 가 coupon `_meta` 만 diff, catalog-gen
하드코딩이 *도입 자체*를 막음)에 맞춰 조정했다. 핵심 조정 2가지:

- 예시의 **PR-F(catalog-gen ui_primitive)는 "마지막"이 아니라 "선결"** 이다 — dry-run **F4** 가 비표준 ui 경로
  → catalog 0건 → rough-fixture-ui 진입 차단을 실측(= Axis 1 도입조차 막힘). → **선결 트랙(Track 0)** 으로 이동.
- 예시에 없던 선결 2건(manifest 토큰화 P2, doctor P3)을 추가. tier3 §8 가 "tier3 전에/함께 랜딩"이라 명시.

### 3.1 의존성 그래프

```txt
Track 0 — 선결(Axis 1 wiring). Tier3 코어와 무관, 먼저/병렬 착지. (B/C 방향이어도 유효)
  PR-0a  catalog-gen ui_primitive 소비 (+ check-generated-files role 바인딩)   [dry-run F4]
  PR-0b  artifact-manifest source: 글롭 토큰화                                 [tier3 §8 P2]
  PR-0c  doctor/preflight — 선언 글롭 존재 검사 (warning-only)                 [tier3 §8 P3]
         └ 셋 서로 독립, Tier3 의존 없음.

Track 1 — Tier3 코어. D1=A resolve + 해당 impl-OD 닫힘 필요.
  PR-A  layout-profile: layers: 파서 → resolvedLayout.layers (데이터만, 소비처 0)
   ├──→ PR-B  policy 합성 함수 + 파리티 테스트/골든 (함수 존재·검증, 아직 미배선)
   │      └──→ PR-D  합성 배선: 정책 role-token 셀 = 생성물 + CI 새 target  ★load-bearing
   ├──→ PR-C  spec.mjs <role>_present 일반 fact + fake_hook_exists alias
   └──→ PR-E  lint DAG 일반화 (import-경계 subset, warning-first)
```

PR-B 가 **PR-D 의 안전망**이다 — 파리티(0/14 + backstop) 테스트가 green 이어야 PR-D 가 정책 셀을 생성물로 뒤집는다.
PR-C·PR-E 는 PR-A 뒤 **병렬 가능**(D 와 무관).

### 3.2 PR 순서표

| 순서 | PR | 한 줄 | 주 파일 | 의존 | 막는 impl-OD | 회귀 기준 |
|---|---|---|---|---|---|---|
| 1 | **PR-0a** | catalog-gen `ui_primitive` 소비(UI_MARKER 제거) + check-gen ui/schema 바인딩 | [catalog-gen.mjs:23](../../scripts/lib/catalog-gen.mjs), `check-generated-files.mjs` | — | — | catalog-gen.test, check-gen.test 불변; 표준 ui 경로 동작 동일 |
| 2 | **PR-0b** | `artifact-manifest.yaml` 생성뷰 `source:` 토큰화 | `catalog/artifact-manifest.yaml` | — | — | 생성뷰 manifest 검사 불변 |
| 3 | **PR-0c** | `doctor.mjs`(신규) 선언 글롭 존재 검사 | `scripts/doctor.mjs`(new) | — | — | **warning-only**, exit 0 불변 |
| 4 | **PR-A** | `layers:` 파서 → `resolvedLayout.layers`(데이터만) | [layout-profile.mjs](../../scripts/lib/layout-profile.mjs), [expo-feature.yaml](../../presets/expo-feature.yaml) | 0a* | #5,#8,#9 | golden 불변(소비처 0); layout-profile.test 신규 케이스 |
| 5 | **PR-B** | `synthesizeModePolicy()` + 파리티 테스트/골든 (미배선) | [layout-profile.mjs](../../scripts/lib/layout-profile.mjs)+`.test` | A | #7 | forward-gate 0/14 **AND** backstop parity (§5) |
| 6 | **PR-C** | `<role>_present` 일반 fact + `fake_hook_exists` alias | [spec.mjs:308-319](../../scripts/lib/spec.mjs) | A | #9,#6 | `test:spec` green; coupon readiness 골든 불변 |
| 7 | **PR-D** | 정책 role-token 셀 = `layers.access` 생성물 + CI 새 target ★ | [implementation-mode-policy.yaml](../../policies/implementation-mode-policy.yaml), [layout-profile.mjs](../../scripts/lib/layout-profile.mjs), CI | **B**,C | #4,#7,#10 | 2면 parity + golden + 신규 멱등성 diff |
| 8 | **PR-E** | lint `layer_rules` DAG(import-경계 subset) | [lint-gen-core.mjs:54,454-456](../../scripts/lib/lint-gen-core.mjs), [lint-policy.template.yaml:15-26](../../templates/meta/lint-policy.template.yaml) | A | lint-DAG | **warning-first**; expo 3종 subset 이 현 출력 재현 |

\* PR-A 의 0a 의존은 약함(병렬 가능). 단 catalog-gen 이 안 닫히면 비표준 레이아웃이 PR-A 의 `layers:` 를 선언해도
rough-fixture-ui 진입이 F4 로 막혀 *검증*이 안 되므로, 0a 를 먼저 권장.

### 3.3 PR 별 allowed / forbidden scope

> 원칙: 각 PR 은 **동작 무변경(값의 출처만 이동)** — golden 회귀가 안전망. forbidden scope 는 anti-scope-creep
> 울타리(§6 전역 금지와 중복되면 그쪽 우선).

**PR-0a — catalog-gen `ui_primitive`**
- allowed: `catalog-gen.mjs`(UI_MARKER → resolvedLayout `ui_primitive` role 소비), `check-generated-files.mjs`
  (ui/schema resolveInput role 바인딩), 두 `.test.mjs`.
- forbidden: `layers:`/access 도입 일절, 모드 정책 변경, catalog **출력 포맷** 변경(결정성 계약 §7.4 불변).

**PR-0b — manifest `source:` 토큰화**
- allowed: `catalog/artifact-manifest.yaml` 의 생성뷰 `source:` 리터럴 → role 토큰.
- forbidden: 새 생성뷰/manifest 축 추가, 토큰 의미 변경.

**PR-0c — doctor/preflight**
- allowed: `scripts/doctor.mjs`(new), 그 단위 테스트, package.json 스크립트 1줄.
- forbidden: **exit code 게이트화**(반드시 warning-only/exit 0), 기존 스크립트 동작 변경, CI required 승격.

**PR-A — `layers:` 파서 (데이터만)**
- allowed: `layout-profile.mjs`(`layers:` 파싱→`resolvedLayout.layers`: role+fact+access+gates; `mergeRoles`
  계승), `expo-feature.yaml`(현 3계층 = byte-동치 `layers:` 선언 동봉), `project-layout.yaml` 스키마 주석,
  `layout-profile.test.mjs`.
- forbidden: 어떤 소비처도 `resolvedLayout.layers` 를 **읽지 않는다**(합성 0, fact 0, lint 0). 정책/spec/CI 무수정.
  **`edits_at` 을 canonical 로 부활 금지**(#5 가 alias-잔류여도 "손실 alias" 표기 필수).

**PR-B — 합성 함수 + 파리티 (미배선)**
- allowed: `layout-profile.mjs` 에 순수 `synthesizeModePolicy(resolvedLayout, order)` 추가(`resolvePaths`
  L161-195 의 토큰 펼침 계열), `layout-profile.test.mjs` 파리티 단언 + 골든 fixture.
- forbidden: `readiness.mjs`/`path-backstop`/정책 파일이 이 함수를 **호출하지 않는다**(존재·증명만). 동작 변경 0.

**PR-C — spec fact 일반화**
- allowed: `spec.mjs:308-319` 의 `fake_hook_exists` 단일 파생 → `resolvedLayout.layers` 순회 `<role>_present`
  일반 파생(가드 L313-318 보존) + `fake_hook_exists := hook_present` 별칭, `spec.test.mjs`.
- forbidden: **readiness 판정 로직 변경 금지**(불변식 #1 — spec 은 fact 를 *공급*만). `requires` 에 신규 fact
  를 **자동 연결 금지**(#6 — `gates` opt-in + 사람 승격). 새 fact 종류(props/export/test) 추가 금지(#9 v1).

**PR-D — 정책 합성 배선 (★ load-bearing)**
- allowed: `implementation-mode-policy.yaml` role-token allowed/forbidden 셀을 `layers.access` 생성물로 전환
  (#4 (a)/(b) 결정대로), `layout-profile.mjs` 합성 배선, CI `frontend-workflow-kit.yml` 에 resolved 정책
  재생성·diff **새 step**.
- forbidden: **리터럴·blanket·`requires`·`order` 손수 셀 변경 금지**(`src/**`·`src/features/**`·`openapi.yaml`·
  `docs/**` 그대로). 재-잠금 비채택 규칙([layout-profile.mjs:211-215](../../scripts/lib/layout-profile.mjs))
  **무수정**. 모드 추가/삭제 금지. 2면 parity 깨지면 머지 불가.

**PR-E — lint DAG 일반화**
- allowed: `lint-gen-core.mjs`(`PATH_KEYS` 3종 → 선언 DAG, `layer-boundaries` 규칙 생성 일반화),
  `lint-policy.template.yaml` `layer_rules`(import-경계 subset, `route_entry` 제외).
- forbidden: **hard 승격 금지**(severity/rollout 그대로, CI `continue-on-error` 제거 금지 — telemetry 후 별
  OD). access `order`(전체)와 lint `order`(import-경계 subset)를 **한 표로 합치기 금지**(tier3 §6 — 미지원 계층
  오류). `no-fetch-in-screens` 등 타 정책 변경 금지.

---

## 4. Tier3 전 선결 (Axis 1 wiring) — 왜 먼저인가

질문 4 답: **catalog-gen `ui_primitive`(P1), doctor/preflight(P3), artifact-manifest source 토큰화(P2)** 가
선결. 근거는 dry-run 실측(추론 아님):

| 선결 | 왜 Tier3 *전* 인가 | 실측 근거 |
|---|---|---|
| **catalog-gen `ui_primitive`** (PR-0a) | catalog-gen 이 `project-layout` 을 **안 읽고** `/src/components/ui/` 리터럴만 봄([catalog-gen.mjs:23](../../scripts/lib/catalog-gen.mjs)). 비표준 ui 경로 → catalog 0건 → `component_catalog_generated:false` → **rough-fixture-ui 진입 차단** → 도입 자체가 막힘. Tier3 의 `layers:` 가 의미를 가지려면 이게 먼저 열려야. | dry-run **F4** |
| **artifact-manifest source 토큰화** (PR-0b) | 생성뷰 manifest 가 `src/components/ui/**`·`src/app/**`·`src/api/schemas/**` 리터럴 잔존 → role 재바인딩이 manifest 에 안 반영. | tier3 §8 P2 |
| **doctor/preflight** (PR-0c) | 선언된 layer/role 글롭이 실제 레포에 **존재하는지** 검사가 없음 → 오설정 silent. cold-start 경고와 같은 계열의 "fail-open/silent-wrong 닫기". | tier3 §8 P3 |

> **P1·P3 은 cold-start 경고와 동형의 "도입 fail-open 닫기"** 라 Tier3 의 자연 선결(tier3 §8 주석). 셋 다 **Axis 2
> 무관** — B/C 방향이어도 버그라 별개 유효. → Track 0 은 OD-12 방향 resolve 를 *기다리지 않고* 열 수 있다.

`check-generated-files` role 바인딩(tier3 §8 P4)은 PR-0a 에 흡수(같은 resolveInput 계열).

---

## 5. 파리티 테스트 명세 (forward-gate + forbidden backstop)

질문 5 답. 두 면을 **각각** 거는 구체 메커니즘. 둘 다 green 이어야 PR-D 가 정책을 뒤집는다.

### 5.1 forward-gate parity (PR-B) — "합성 셀 == 현 정책 role-token 셀"

현 `synth-policy.mjs` 스파이크를 **영속 테스트로 승격**한다(현재는 `temp/runs/` 일회성).

```txt
TRUTH    : 실제 implementation-mode-policy.yaml 파싱 → 모드별 role-token allowed/forbidden 추출
           (정확히 /^\{roles\.([a-z_]+)\}$/ 필터 — synth-policy.mjs L19-26 식. 리터럴/blanket 제외)
생성기    : synthesizeModePolicy(resolvedLayout, order)
           = expo-feature layers[].access.{allow,forbid} → mode-major 전치 (synth-policy.mjs genV2 L54-62)
단언      : ∀ mode ∈ policy.order, ∀ k ∈ {allow,forbid}:
              synth[mode][k] (sorted) === TRUTH[mode][k] (sorted)
기대      : 0 mismatch (role-token 14셀). v1(단일 edits_at)=10/14 회귀 가드로 함께 둠.
골든      : TRUTH 14셀을 커밋 스냅샷(JSON)으로 동결 → 정책 손수 편집이 layers 와 어긋나면 적발
           (#4 (b) 점진 전환 시 drift 가드). 그리고 런타임에 실제 정책에서 재추출해 self-check.
범위 밖   : 리터럴/blanket 셀(src/**·src/features/**·openapi.yaml·docs/**) — 손수 유지 확인만(미변경 단언).
```

위치: `layout-profile.test.mjs` 확장(또는 `policy-synth-core.test.mjs` 신설), `test:spec` 하드 게이트에 편입
([package.json:33](../../package.json)).

### 5.2 forbidden backstop parity (PR-B/PR-D) — "합성 정책의 guarded surface == 현 expo 표면"

forward-gate 만 통과하고 backstop 이 깨지는 회귀를 막는 **두 번째 면**. backstop 은 diff 기반 guarded surface.

```txt
입력      : 합성 정책 = synthesizeModePolicy 결과(role-token 셀) ∪ 손수 리터럴 셀
실행      : layout-profile.materializeGuardedSurface(합성정책, [domains])    (L197-303)
기대      : deepEqual(surface, ['openapi.yaml','openapi.yml','src/api/**'])
           = deriveGuardedSurface(rawLiteralPolicy) 와 BYTE-동치 (path-backstop.mjs:112-128)
불변 단언 : src/features/{domain}/screens/** 가 surface 에 **없다** (재-잠금 비채택)
           — layout-profile.mjs:211-215 의 forbiddingIdx(5) ≥ tIdx(2) 규칙이 무수정 유지되는지.
           screen 재-잠금은 forward 게이트·readiness 의 몫이지 backstop clearance 대상 아님.
threshold : surface.thresholdOf('src/api/**') === 'api-integrated-ui' (non-enumerable 접근자 — L295-301)
```

핵심 함정: PR-D 가 `screen.forbid:[api-integrated-ui]` 를 합성하면서 그게 **backstop surface 로 새면** 이 단언이
깨진다. 즉 **layers 는 forward gate 만 구동, backstop 은 기존 함수가 무수정 파생** — 이 분리가 byte-동치의 조건
(tier3 §7-(b)).

### 5.3 두 면 + alias + 골든 (PR-D 머지 수용 기준 전체)

| # | 면 | 단언 | 깨지면 |
|---|---|---|---|
| ① | forward-gate | 합성 allowed/forbidden == 현 정책 role-token 셀 (0/14) | 설계 결함 — 머지 불가 |
| ② | backstop | `materializeGuardedSurface` == 현 expo 표면(재-잠금 비채택 L211-215 유지) | 설계 결함 — 머지 불가 |
| ③ | alias | `fake_hook_exists == hook_present` | rough-fixture-ui 게이트 회귀 |
| ④ | golden | `examples/coupon-feature` readiness 불변 + 멱등성 diff | 동작 변경 — 머지 불가 |

production-ready 의 `src/**` 리터럴 재허용은 **layers 밖**(§5 SoT 경계, 범위 외).

---

## 6. 구현하지 말아야 할 것 (전역 forbidden scope)

질문 6 답. Tier3 구현 PR 어디에도 섞지 않는다 — 섞이면 리뷰 거부 사유.

| 금지 | 왜 | 어디로 가야 하나 |
|---|---|---|
| **hard gate 승격** | warning-first 가 기본·목적지(axis2-prep §3). 신규 계층 fact·layer 린트·doctor 는 **telemetry 전까지 warning**. `requires` 자동 연결·CI `continue-on-error` 제거·required check 금지. | telemetry 축적 후 **별도 사람 OD**(OD-12 §3, tier3 §9) |
| **새 artifact 축 추가** | roadmap 닫힌 목록 불변. 새 authored-doc 종류·register·manifest 축 없음. 이 작업은 **기존 readiness/mode access 표현력 일반화**일 뿐. | (해당 없음 — 축 추가 자체가 별 거버넌스 OD) |
| **E2E role/계층 삽입** | E2E 는 **evidence 지 gate 아님**. access 행렬에 `e2e`/`test` role·layer·fact 를 넣지 않는다. | testID 계약·E2E 운영 규율(PR #77) — **별 트랙** |
| **visual-spec validate 와 섞기** | Tier3 는 readiness/mode/lint 만 건드린다. `layers:`/access 를 visual-spec(VS-1~VS-4, PR #73/#75)·figma-mapping·testID 와 결합 금지. | visual-spec 트랙(PR #73/#75) — 독립 |
| **`edits_at` canonical 부활** | 비단조 표현 불가(SPIKE v1 10/14). canonical = 행렬. alias 잔류 시에도 "손실/v1 draft" 표기 필수(#5). | §3.1 손실 alias(택1) 또는 완전 삭제 |
| **Figma 수집기/design-token 생성기 kit core 편입** | kit 는 **받아 적는 계약**만. MCP/REST 수집·토큰 생성은 소비 레포 책임. | 소비 레포 |
| **민감/로컬 런 산출물 추적** | `temp/runs/figma-fidelity-001/`·`temp/runs/maestro-dogfood-001/` 산출물은 public repo 비추적. | (추적 제외 유지) |
| **모드 사다리 7단계 증감** | Tier3 은 모드를 안 늘린다 — 모드 *안*의 계층 집합만 데이터화(tier3 §2·§3). | (해당 없음) |

---

## 7. 사람-결정 OD 체크리스트 (서명용)

> D1=A 가정. **PR 단위 점증 resolve** 가능 — 각 그룹을 닫으면 그 PR 을 열 수 있다. 모두 사람 owner.
> resolve 표기: `OD-12-impl #N → 선택 / 날짜 / owner`. 이 패킷은 *준비*다 — 사람이 내린 결정만 아래 **결정 기록(§7.0)** 에 명시하고 해당 체크박스를 표기한다. 미결 항목은 비워 둔다.

### 7.0 결정 기록 (Resolution log) — 사람 결정만

| 일자 | impl-OD | 결정 | owner | 비고 |
|---|---|---|---|---|
| 2026-06-21 | **#4 정책 파일 전환** | **(a) 즉시 생성물화** | maintainer (사람) | role-token 셀 즉시 생성물화 — PR-D 전환 전략 = A. 안전망(PR-B 파리티 2면 green) 선착지가 머지 전제(§5). |
| 2026-06-21 | **#5 `edits_at`** | **완전 삭제** | maintainer (사람) | A 와 묶임(viz Option A = #4=(a) + #5 삭제). canonical 부활 금지 불변. |
| 2026-06-21 | **선결 트랙 (PR-0a/0b/0c)** | **착수 인가** | maintainer (사람) | Axis1 wiring 3건 — 방향 무관, 먼저 진행. 실제 구현은 별 세션/명시 지시로(이 세션=준비, 코드 미수정). |
| 2026-06-21 | **#8 layers 물리 위치** | **A: 킷 프리셋 기본 + 프로젝트 루트 확장** | maintainer (사람) | tier1 머지(preset < project < domains) 계승, **layer 단위 교체**. B = 프리셋 기본을 비운 동일 메커니즘. OD-10 과 같은 자리. |
| 2026-06-21 | **#6 게이트 강도** | **기본값 (access-only)** | maintainer (사람) | 신규 계층은 편집 허용만(진입 강제 X); expo `hook` 의 `fake_hook_exists` gate 는 유지(byte-동치). hard 승격은 telemetry 후 별 OD. |
| 2026-06-21 | **#9 fact v1 + 머지 + SoT** | **v1=`dir_has_files`만 · tier1 머지 계승 · role-token=`layers/access` authoritative (확인)** | maintainer (사람) | PR-A 최소 묶음 잔여 확인 완료 → **PR-A 착수 준비 완료**. props/export/test fact 는 후속(#9 로드맵). |

> 이 기록은 **제안 문서 수준의 사람 결정**이다 — roadmap/gate cross-link 등 정본 반영은 OD 절차대로 사람이 별도로 한다. 나머지(#6·#7·#8·#9·#10·lint·머지·SoT)는 **미결**. 구현 착수(각 PR)는 여전히 사람이 PR 단위로 인가한다.

**선결 트랙(Track 0) — OD-12 방향과 무관, 지금 착수 가능** — ✅ 2026-06-21 착수 인가 (§7.0; 구현은 별 세션)
- [x] PR-0a 착수 인가 — catalog-gen `ui_primitive`(F4 도입 차단 해소). 출력 포맷 불변.
- [x] PR-0b 착수 인가 — manifest `source:` 토큰화.
- [x] PR-0c 착수 인가 — doctor/preflight **warning-only**(exit 0 불변) 확인.

**PR-A 를 열기 위한 최소 묶음** — ✅ 2026-06-21 전부 닫힘 → PR-A 착수 준비 완료
- [x] **#8** `layers` 물리 위치 = ☑ **A: 킷 프리셋 기본 + 프로젝트 루트 확장** (2026-06-21 결정 · §7.0). tier1 OD-10 과 같은 자리.
- [x] **#9** fact v1 범위 = ☑ **`dir_has_files` 만** 동결 (2026-06-21 결정 · §7.0). props/export/test 는 후속.
- [x] **#5** `edits_at` = ☑ **완전 삭제** (2026-06-21 결정 · §7.0) / ☐ 손실 alias 잔류 — canonical 부활 금지 불변.
- [x] merge 규칙 = tier1 `mergeRoles`(layer 단위 교체) 계승 **확인 완료** (2026-06-21 · §7.0).
- [x] SoT 경계 = role-token 셀 `layers/access` authoritative **확인 완료** (2026-06-21 · §7.0).

**PR-C / PR-E 추가 묶음** (PR-A 뒤 병렬)
- [x] **#6** 게이트 강도 = ☑ **기본값** — 신규 계층 `access`-only; expo `hook` gate 유지(byte-동치) (2026-06-21 결정 · §7.0).
- [ ] **lint-DAG** = import-경계 subset(`route_entry` 제외) + `forbid_upward` + **warning-first** 확인.

**PR-D(★load-bearing)를 열기 위한 추가 묶음**
- [x] **#4** 정책 파일 전환 = ☑ **(a) 즉시 생성물화** (2026-06-21 결정 · §7.0) / ☐ (b) 점진 전환.
- [ ] **#7** byte-동치 = forward-gate(0/14) **AND** backstop parity 둘 다 green 확인(§5).
- [ ] **#10** CI 멱등성 새 target = resolved 정책 재생성·diff step 추가((a) 선택 시 필수).
- [ ] PR-B 파리티 테스트 green = PR-D 머지 **전제**(안전망 선착지).

**미룸(비-블로킹) — 코어 착지 후 별 PR**
- [ ] #11 maturity×depth 표면화(next_actions). [ ] #12 tier2 결합 경계.

**전역 금지 재확인(§6)**
- [ ] hard gate 승격 없음 · 새 artifact 축 없음 · E2E role 삽입 없음 · visual-spec/testID 와 분리 · 모드 7단계 불변.

---

## 8. impl-OD ↔ PR ↔ 근거 매핑 (요약)

| impl-OD (tier3 §10.3) | axis2-prep | 질문 2 항목 | 소비 PR | 상태 |
|---|---|---|---|---|
| #4 정책 전환 방식 & 머지 | I1 | source of truth 경계(*운영*) | PR-D | **결정: A 즉시 생성물화** (2026-06-21 · §7.0) |
| #5 `edits_at` 잔류/삭제 | I2 | edits_at 삭제/alias 잔류 | PR-A | **결정: 완전 삭제** (2026-06-21 · §7.0) |
| #6 게이트 강도 | I3 | (게이트 의미) | PR-C/PR-D | **결정: 기본값 access-only** (2026-06-21 · §7.0) |
| #7 byte-동치 범위 | I4 | access matrix byte-동치 | PR-B→PR-D | 2면 확정, 테스트로 강제 |
| #8 `layers` 물리 위치 | I5 | layers 위치 | PR-A | **결정: A (킷기본+프로젝트확장)** (2026-06-21 · §7.0) |
| #9 fact 종류 | I6 | fact v1 범위 | PR-A/PR-C | **결정: v1=dir_has_files only** (2026-06-21 · §7.0) |
| #10 멱등성 CI target | I7 | CI 멱등성 target | PR-D | (a) 시 필수 |
| #11 maturity×depth 표면화 | — | — | (후속) | 미룸 |
| #12 tier2 결합 경계 | — | — | (후속) | 미룸 |
| (lint DAG subset) | — | lint DAG subset | PR-E | import-경계 subset+warning |
| SoT 경계(*정의*) | — | source of truth 경계 | (확인) | **확인 완료** (2026-06-21 · §7.0) |
| merge 규칙 | — | merge 규칙 | (확인) | **확인 완료** (2026-06-21 · §7.0) |

---

## 9. 다음 단계

1. 사람: OD-12(방향) D1/D2/D3 resolve. **A 아니면 코어 트랙 보류**(선결 트랙은 별개 유효).
2. A 면: §7 선결 트랙 인가 → PR-0a/0b/0c.
3. §7 "PR-A 최소 묶음" 닫기 → PR-A → PR-B(파리티 green) → PR-C/PR-E 병렬 → (PR-D 묶음 닫고) PR-D.
4. 재오픈 트리거: 파리티 2면 중 하나라도 깨지거나, 실제 도입에서 N계층 모델 결함이 드러나면 → tier3 §10 재검토.

> 이 패킷은 결정을 **준비**한다. 게이트를 풀거나 코드/정책/CI 를 바꾸지 않는다. resolve·구현 착수는 **사람만**.
