# Fixture Hook Mode Ladder And Mode-Aware Candidate Path Authorization

Status: implemented draft
Issue: #211 (Refs #210 / PR #213)
Date: 2026-07-27

## Problem

implementation-mode 사다리에 두 개의 순환 전제가 있었다.

1. **Greenfield bootstrap 순환.** `rough-fixture-ui` 는 `{roles.hook}` 편집을 허용하면서
   진입 requires 에 `fake_hook_exists == true` 를 갖고 있었다 — "hook 을 만들려면 hook 이
   이미 있어야 한다". 훅 파일이 하나도 없는 새 도메인은 사다리 어느 단계에서도 첫 fixture
   fake hook 을 만들 수 없었다.
2. **v2 active hook claim 순환.** PR #213 의 `readinessPathAuthorization()` 은 explicit
   active candidate claim 을 종류와 무관하게 "owning screen 이 api-integrated-ui 이상"일
   때만 통과시켰다. 따라서 API Candidates v2 로 hook Slice Path 를 미리 선언한 화면은,
   정책 YAML 이 rough/final 에서 hook 경로를 허용하더라도 자기 fixture hook 을
   생성·수정하지 못했다(claim 이 자기 자신을 잠근다).

부수 결함으로 `final-fixture-ui` 에 `{roles.hook}` 권한이 없어, fixture hook 을 계약
위치에 유지·정렬하는 작업이 screen-local hook 우회(문서화된 편차)로 밀려났다 —
api-integrated 단계의 "화면 불변" 계약(`{roles.screen}` forbidden)이 슬라이스 추출을
강제로 화면 편집으로 만들었다(consumer LRN-0022).

## Decisions

### D1. 생성 단계와 존재-확인 단계의 분리

- `rough-fixture-ui` = screen UI 와 fixture fake hook 을 **처음 생성**하는 단계.
  `fake_hook_exists == true` 를 requires 에서 제거한다.
- `final-fixture-ui` = 화면과 fixture hook 의 **최종 상태·계약을 정렬**하는 단계.
  `fake_hook_exists == true` 를 이 모드의 promotion requires 로 옮기고
  `{roles.hook}` 을 allowed_paths 에 추가한다. 사다리는 누적이므로 api-integrated 이상도
  이 전제를 계승한다 — "fixture hook 이 계약 위치에 존재한다" 는 승격 전제로 유지된다.
- `api-integrated-ui` = hook 의 public contract/signature 는 유지하고 **내부 구현만**
  실제 API 로 교체하는 단계. `{roles.hook}` + `{roles.api_client}` 허용,
  `{roles.screen}` 금지(불변).
- `production-ready` = 기존 broad envelope(`src/**`) 유지. PR #213 의 concrete `--path`
  authorization 을 우회하지 못한다(아래 D2).

Before/after:

| mode | requires (변경분) | allowed (변경분) |
|---|---|---|
| rough-fixture-ui | ~~fake_hook_exists == true~~ 제거 | (불변: screen·domain_component·hook) |
| final-fixture-ui | + fake_hook_exists == true | + {roles.hook} |
| api-integrated-ui | 불변 | 불변 (screen forbidden 유지) |
| production-ready | 불변 | 불변 |

### D2. Candidate claim 의 surface_kind 와 mode-aware 권한

각 v2 Slice Path 를 도메인/레이아웃 오버라이드 해소 **이후의** resolved `{roles.hook}` /
`{roles.api_client}` 표면에 대해 분류하고, readiness 의
`api_candidate_authorization` provenance 행에 `surface_kind: hook | api-client | null`
로 보존한다(공유 순수 helper `candidateSurfaceKind()` — path-backstop.mjs).

- 두 표면에 동시에 속하거나(ambiguous) 어느 쪽에도 속하지 않으면 `null` → fail-closed
  (integration 게이트 유지).
- 판정은 `readinessPathAuthorization()` 한 곳에서 수행한다. active claim 규칙:

```txt
allowed = base.allowed
        ∧ api_required !== false
        ∧ contract_version == 2
        ∧ api_candidate_authorization.valid == true
        ∧ owned(이 화면의 claim)
        ∧ ( owner 가 api-integrated-ui 이상
          ∨ owned claim 전부 surface_kind === 'hook'  # fixture seam (#211)
          )
```

malformed v2 계약은 actionable provenance 를 진단용으로 보존하더라도 positive
권한을 만들지 않는다. base envelope(forbidden wins over allowed)도 계속 적용된다. 따라서:

| claim | rough/final | api-integrated 이상 |
|---|---|---|
| owned active **hook** claim | base allow(fixture 모드의 {roles.hook}) 범위에서 허용 | #213 규칙(owner integrated) 유지 |
| owned active **API-client** claim | 거부 (base forbidden + integration 게이트) | #213 규칙 유지 |
| active claim (다른 화면 소유) | 거부 | 거부 (owner 만) |
| invalid v2 contract 의 active claim | **거부** | **거부** |
| deferred / conflict claim | **모든 모드에서 거부** | **모든 모드에서 거부** |
| explicit claim 없는 hook 경로 | base policy 범위에서 greenfield bootstrap 허용 | integrated v2 표면은 explicit claim 요구(#213) |
| API-client 경로 (claim 없음) | base forbidden 으로 거부 | legacy broad 호환만(#213) |

유지되는 PR #213 불변식: deferred/conflict 는 항상 deny · legacy broad authority 가
explicit v2 claim 을 덮지 못함 · production-ready 의 `src/**` 도 explicit ownership 을
우회하지 못함 · `api_required:false` 는 어떤 claim 도 열지 못함 · candidate
deferral/table/검사 15 계약 무변경.

### D3. 단일 판정 경로

forward pre-edit(`workflow:readiness --screen … --path …`)와 diff backstop
(`workflow:forbidden-paths`)은 동일한 `readinessPathAuthorization()` 을 소비한다.
surface_kind 는 readiness 가 provenance 에 한 번 계산해 싣고, 두 소비자는 재판정하지
않는다. 거부 진단도 같은 판정 결과를 따라 non-owner(owning screen 컨텍스트), invalid
contract(계약 issue 수정), owned hook(rough-fixture-ui), API-client/null(api-integrated-ui)로
분리한다. Work Packet / Run Report 는 effective allowed/forbidden paths 와
`api_candidate_authorization` 블록(surface_kind 포함)을 인용만 한다.

### D4. 레이아웃 판정

리터럴 `src/features/.../hooks` 를 정책 판정에 박지 않는다. surface 분류는 항상
resolved layout role 기준이다:

- default Expo preset: `hook → src/features/{domain}/hooks/**`,
  `api_client → src/api/**`.
- custom layout(예: `app/{domain}/viewmodels/**` / `app/{domain}/repositories/**`):
  같은 규칙으로 분류된다.
- domain override(`domains.<d>.roles.hook`): override 해소 후 표면으로 분류된다.
- hook 과 api_client 표면이 겹치게 바인딩된 레이아웃에서는 surface_kind 가 `null` 로
  떨어져 fixture seam 이 열리지 않는다(fail-closed).

### D5. `fake_hook_exists` 의 coarse scope

`fake_hook_exists` 는 **화면 단위 fact 가 아니다**. spec.mjs `deriveMetrics` 가 해당
도메인의 resolved `{roles.hook}` 디렉토리에 TypeScript 파일이 하나라도 있는지를 보는
**domain role 디렉터리 단위** legacy compatibility fact 다. 같은 도메인의 다른 화면이
만든 훅으로도 참이 된다. 이 PR 은 screen-specific fact 를 도입하지 않는다 — 도입하려면
hook 파일 ↔ screen 귀속 규약(파일명 강제 또는 명시 매핑)이 필요한데, 파일명을 전역
고정하지 않는다는 계약(아래 Fixture Hook Contract)과 충돌한다. 대신:

- greenfield bootstrap 순환은 requires 이동으로 제거되고(모든 화면),
- v2 active hook claim 순환은 surface_kind seam 으로 제거된다(화면-정밀 ownership 은
  claim 이 담당).

화면-정밀 존재 fact 가 필요해지면 API Candidates v2 hook Slice Path 존재를 소스로 쓰는
additive fact 를 후속으로 검토한다.

## Fixture Hook Contract

fixture fake hook 은 api-integrated 단계의 "화면 불변" 계약을 성립시키는 seam 이다.

- 네트워크 호출을 하지 않는다. API client 를 import 하지 않는다(정책상 fixture 모드에서
  `{roles.api_client}` 가 forbidden 이라 구조적으로도 차단된다).
- screen 이 소비하는 반환 shape 와 `loading / empty / error / success / refreshing`
  상태 계약을 State Matrix 와 정렬해 유지한다.
- api-integrated 단계에서는 hook **내부 구현만** 실제 API 로 교체한다 — screen JSX,
  시각 구조, testID 수정이 필요 없어야 한다(diff 0 이 목표 상태).
- hook 파일명은 전역 고정하지 않는다. 위치는 resolved `{roles.hook}` 이 유일한 계약이고,
  이름은 해당 screen/domain 의 authoring 컨벤션(ScreenSpec·v2 Slice Path 선언)을 따른다.
- v2 화면은 hook Slice Path 를 active claim 으로 미리 선언해 ownership 을 명시할 수
  있고, 그 경우 rough/final 에서 그 경로는 owner 만 편집한다.

## Verification

- 회귀 A/B 재현 + 사다리 매트릭스: `scripts/lib/fixture-hook-mode-ladder.test.mjs`
  (greenfield bootstrap·CLI `--path`, owned hook vs API-client slice, 모든 모드의
  deferred/conflict deny, invalid v2 contract fail-closed, ownership/surface-aware
  reason·would_clear, final/api-integrated 도달 계약, custom layout·domain override·
  ambiguous surface_kind, no-API 회귀, Work Packet provenance, forward `--path` ↔ diff
  backstop 동일 판정, mode order·warning-first 불변).
- 기존 PR #213 회귀 스위트(`api-candidate-deferral.test.mjs`, `path-backstop.test.mjs`,
  `redteam-path-backstop.test.mjs`)는 무수정 통과 — deferral/ownership 불변식 유지 증거.
- expo preset layers ↔ live policy byte-parity(`layout-profile.test.mjs`)와 L2 골든
  (`examples/multi-screen-dry-run`)은 새 사다리로 갱신.
