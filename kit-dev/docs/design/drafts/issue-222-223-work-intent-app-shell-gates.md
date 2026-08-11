# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; implementation not started  
Issues: #222, #223  
Date: 2026-08-11  
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)  
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.

---

## 1. Executive Summary

현재 `readiness_mode`는 사실 기반 성숙도와 Open Decision 상한을 하나의 mode
사다리로 표현하고, 선택된 mode 하나의 `allowed_paths`/`forbidden_paths`가 기본
구현 권한이 된다. 이 모델은 진행 상태에는 적합하지만 “지금 하는 작업의 종류”를
표현하지 못한다. 그래서 이미 `api-integrated-ui`에 도달한 화면에 새 시각 입력이
도착해도 screen 경로는 계속 금지되고, 반대로 그 금지를 단순 제거하면 API 배선 중
화면 불변 계약이 깨진다.

또한 global app shell은 현재 `ScreenSpec`도 `shared-surface-spec`도 아니다.
`navigation-map`과 `visual-consistency-contract`에는 shell 관련 사실이 있을 수 있지만,
그 문서들은 구현 경로 owner이자 target-scoped readiness gate가 아니다. 결과적으로
shell Open Decision은 구현 경로를 막지 못하고 ordinary screen의 broad allowance가
shell 코드를 우회할 수 있다.

이 설계는 두 문제를 다음과 같이 해결한다.

1. `readiness_mode`의 의미와 공식을 유지한다.
2. 별도 축인 명시적 work intent를 도입하고 첫 public 값으로
   `visual-refresh`를 정의한다.
3. `visual-refresh`는 기존 mode 권한의 합집합이 아니라 독립된 최소 권한
   envelope다.
4. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
5. 기존 6-column Open Decision register와 `decision_refs`를 그대로 사용하되,
   shell decision은 해당 shell만 제한한다.
6. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
   ownership namespace를 사용하고 deny가 항상 우선한다.
7. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222에서 만든 공통 target/path
   authorization substrate를 소비하되 #222 의미를 다시 설계하지 않는다.

추가 사용자 결정 없이 권장안으로 설계를 확정한다.

---

## 2. Current Model

### 2.1 Readiness maturity

현재 mode order는 다음 진행 상태를 나타낸다.

```text
docs-only
→ route-skeleton
→ screen-skeleton
→ rough-fixture-ui
→ final-fixture-ui
→ api-integrated-ui
→ production-ready
```

화면별 계산은 다음과 같다.

```text
fact_mode      = 사실이 연속으로 만족하는 최고 mode
decision_cap   = open/malformed Open Decision이 허용하는 최고 mode
readiness_mode = min(fact_mode, decision_cap)
```

`production-ready`의 CI/review 사실은 시각 입력 도착 여부와 독립적이다.
`readiness_mode`는 작업 요청의 종류가 아니라 현재 성숙도와 decision ceiling이다.

### 2.2 Current path authorization

현재 기본 권한은 선택된 mode 하나에서 파생된다.

```text
base_allowed   = resolve(chosen_mode.allowed_paths)
base_forbidden = resolve(chosen_mode.forbidden_paths)
```

그 뒤 다음과 같은 좁은 보정이 적용된다.

- `api_required:false` 화면의 non-API edit surface 복원
- API Candidates v2 active/deferred/conflict path ownership
- member shared-surface path의 screen 예약
- generated/do-not-edit와 concrete-path canonicality
- forbidden-over-allowed precedence

`api-integrated-ui`는 hook/API-client를 열고 screen을 금지한다. 이는
fixture hook의 public contract를 유지한 채 내부를 실제 API로 교체하는 동안 화면
JSX와 시각 구조를 바꾸지 않는 보호 계약이다.

### 2.3 Shared surfaces

`shared-surface-spec`은 다음 의미를 가진다.

- 같은 domain의 canonical screen 최소 2개
- 명시적 `member_screens`
- member screen minimum readiness cap
- decision member fan-out
- non-route uniform behavior
- narrow `implementation_paths`

ordinary member screen은 surface path를 `forbidden_paths`로 예약받고
`delegated_shared_surfaces` provenance를 노출한다. 이 의미는 변경하지 않는다.

### 2.4 Open Decisions

현재 canonical global home은
`docs/frontend-workflow/global/open-decisions.md`이고 row schema는 다음 6개 column이다.

```text
ID | Decision Needed | Options | Blocking Mode | Owner | Status
```

`decision_refs`가 target과 row의 관계를 소유한다. global row는 zero-ref여도 valid하고,
referrer가 없으면 어떤 target도 막지 않는다. `open → resolved`는 사람 전용이다.

### 2.5 Existing fixes and the remaining gap

- #124는 `api_required:false` 화면에서 API mode 도달 후 non-API 화면 경로가 잠기는
  특수 사례를 해결했다. 작업 종류 일반화를 제공한 것은 아니다.
- #210은 API Candidate v2의 per-slice deferral과 ownership을 만들었다.
- #211은 fixture mode에서 owned hook slice를 열되 `api-integrated-ui`의 screen 불변을
  유지했다.
- #222는 이 해결들을 되돌리는 문제가 아니다. 성숙도와 작업 종류를 분리하는 일반적인
  authorization 축이 아직 없다는 문제다.

---

## 3. Reproduced Failure Modes

### 3.1 #222 — mature screen에 시각 작업 권한이 없음

공개 kit 기준으로 다음을 확인했다.

1. `readiness_mode`는 `min(fact_mode, decision_cap)`으로 결정된다.
2. 선택된 mode 하나의 path envelope가 기본 권한이 된다.
3. `final-fixture-ui`에서는 screen/domain-component/hook이 열릴 수 있다.
4. `api-integrated-ui`에서는 hook/API-client가 열리고 screen이 forbidden이다.
5. 별도 `--intent`, profile 또는 override가 없다.
6. Figma mapping이나 최신 input timestamp가 있어도 작업 의도를 나타내지 않는다.
7. 실제 미결이 없는 Open Decision을 reopen해 mode를 낮추면 maturity 사실과 gate
   provenance를 거짓으로 만든다.

따라서 API 통합을 마친 화면의 visual-only refresh는 정상적인 screen 작업인데도
권한을 얻을 표현이 없다.

Issue reporter가 제시한 consumer 수치(예: 17/35)는 private consumer 실측이며,
공개 kit에서 재현한 사실과 구분한다. 이 문서는 수치 자체를 kit 동작의 증거로
사용하지 않는다.

### 3.2 #223 — shell decision과 path owner가 없음

공개 kit 기준으로 다음을 확인했다.

1. `navigation-map`은 tabs/stacks/modals, route guard, deep link, cross-domain edge를
   소유하지만 implementation target이 아니다.
2. `visual-consistency-contract`는 cross-screen visual ownership을 설명하지만
   readiness hard gate가 아니다.
3. `shared-surface-spec`은 domain, 최소 2 member, member cap, decision fan-out을
   전제로 한다.
4. global register의 zero-ref row는 valid하지만 target을 막지 않는다.
5. 현재 state에는 `screens`와 선택적 `surfaces`만 있고 app shell index가 없다.
6. ordinary screen에는 member shared-surface path만 예약된다. global shell path를
   예약할 owner가 없다.

Issue reporter가 제시한 34개 ScreenSpec과 3개 shared surface 같은 수치는 consumer
실측이다. 공개 kit 재현 사실과 섞지 않는다.

---

## 4. Goals

- readiness maturity와 현재 작업 종류의 권한을 분리한다.
- `api-integrated-ui` 이상 화면에서 source-backed visual refresh를 정상 경로로 허용한다.
- API 배선 작업 중 screen 불변을 유지한다.
- app shell을 route-less/global 1급 implementation target으로 만든다.
- shell Open Decision이 해당 shell만 cap하도록 한다.
- screen/shared/app-shell/generated/API candidate path ownership의 우회를 막는다.
- no-adoption/no-intent repository의 기존 동작을 유지한다.
- #222와 #223 구현을 독립 리뷰 가능한 PR로 분리한다.

---

## 5. Non-goals

- `readiness_mode` order 변경
- 새 scalar mode 삽입
- reached-mode path union
- Figma/input timestamp 기반 intent 자동 추론
- #224 decision-log/supersession 계약
- Open Decision table column 추가
- shared surface global scope 확장
- consumer migration 자동 실행
- Open Decision resolve 또는 `confirmed` 승격
- warning-first surface의 hard/required CI promotion
- 새 required CI check
- generic “무엇이든 담는” app-surface abstraction
- release/version/tag 변경

---

## 6. Terminology

| Term | Meaning |
|---|---|
| maturity | 사실과 decision cap이 허용하는 기계적 진행 상태 |
| work intent | 호출자가 명시하는 현재 작업 종류 |
| authorization profile | target와 intent에 따른 독립 path envelope |
| base readiness | intent 없는 기존 `readiness_mode`와 path 결과 |
| implementation target | screen, shared surface, app shell처럼 path owner가 될 수 있는 대상 |
| reservation | 다른 target의 broad allowance보다 우선하는 explicit deny |
| target-scoped decision | referrer target만 cap하고 unrelated target에는 fan-out하지 않는 decision |
| shell host path | app shell이 직접 소유하는 route host/layout/provider/interaction path |
| subordinate slice | 같은 target 안에서 API Candidate가 더 좁게 소유하는 hook/API-client path |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. intent는 호출자가 명시하며 자동 추론하지 않는다.
4. intent는 base allowed path의 누적 합집합이 아니다.
5. forbidden/deny가 allowed보다 항상 우선한다.
6. concrete forward check와 diff backstop은 같은 순수 helper 결과를 소비한다.
7. Work Packet/Run Report는 authorization provenance를 재계산하지 않는다.
8. generated/do-not-edit ownership을 어떤 target도 우회하지 못한다.
9. explicit 다른 owner와 path가 겹치면 fail closed한다.
10. app shell decision은 screen/shared-surface readiness에 fan-out하지 않는다.
11. shared-surface member/cap/fan-out 의미는 유지한다.
12. intent가 없는 기존 실행은 기존 의미와 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode `allowed_paths` union | reject | 작업 종류를 구분하지 못하고 API mode의 screen 불변을 무력화한다. |
| `api-integrated-ui`에서 screen forbidden 제거 | reject | 모든 API 배선 작업에 screen mutation을 열어 최소 권한을 깨뜨린다. |
| scalar mode `visual-refresh` 삽입 | reject | maturity와 task kind를 다시 한 사다리에 섞고 migration/order 비교를 깨뜨린다. |
| Open Decision reopen으로 final mode 강등 | reject | 실제 maturity와 gate provenance를 거짓으로 만든다. |
| explicit work intent/profile | adopt | maturity를 보존하면서 요청별 최소 권한을 표현한다. |
| shared-surface `scope: global` | reject | domain/min-2-member/member-cap/fan-out 의미를 특례로 흐린다. |
| dedicated `app-shell-spec` | adopt | shell identity, decisions, readiness, ownership을 좁고 명시적으로 만든다. |
| generic `app-surface-spec` | reject for first slice | 현재 확인된 요구는 shell이며 generic scope는 owner 경계를 과도하게 넓힌다. |
| `navigation-map`을 implementation target으로 승격 | reject | route topology 정본과 mutable code ownership을 한 artifact에 결합한다. |
| global decision row에 path/target column 추가 | reject | 기존 6-column schema와 human lifecycle을 바꿀 필요가 없다. referrer가 scope를 소유할 수 있다. |

---

## 9. Decision D1 — Readiness Maturity 유지

### 9.1 Formula

화면의 base maturity 계산은 변경하지 않는다.

```text
base_fact_idx      = highest continuously satisfied policy mode index
base_decision_idx  = lowest open decision Blocking Mode index - 1
base_readiness_idx = min(base_fact_idx, base_decision_idx)
readiness_mode     = order[base_readiness_idx]
```

malformed lifecycle/decision/policy는 기존처럼 fail closed한다.

### 9.2 Base output ownership

intent가 있더라도 top-level 다음 필드는 base maturity를 계속 뜻한다.

```text
readiness_mode
next_mode
allowed_paths
forbidden_paths
blocking
next_actions
```

`visual-refresh`가 요청됐다는 이유로 `readiness_mode`를
`final-fixture-ui`로 거짓 출력하지 않는다. intent 결과는 별도 구조에 둔다.

### 9.3 Why decision levels still matter

work intent는 decision을 우회하지 않는다. intent가 요구하는 최소 mode가 있을 때:

```text
intent_prerequisite_pass =
  fact_idx >= required_idx
  AND decision_cap_idx >= required_idx
  AND target structural state is valid
```

따라서 `final-fixture-ui`를 막는 decision은 visual refresh를 막는다. 반면
`api-integrated-ui` 진입만 막는 decision은 final-level visual refresh를 불필요하게
막지 않는다.

---

## 10. Decision D2 — Explicit Work Intent

### 10.1 Public contract

첫 public contract는 다음이다.

```text
CLI flag:       --intent
first value:    visual-refresh
internal term:  work intent / authorization profile
```

첫 slice에서 intent는 `--screen` target에만 허용한다. `--surface`나
`--app-shell`과 함께 주면 usage error(exit 2)다. app shell visual intent가 실제로
필요해지면 별도 후속에서 target-specific evidence와 profile을 설계한다.

### 10.2 No inference

다음은 intent를 자동 활성화하지 않는다.

- Figma mapping 존재
- mapping/status timestamp
- 최근 input `captured_at`
- file name에 visual/design 포함
- current mode가 api-integrated 이상

호출자 또는 `implement-screen`이 현재 task가 reconciled visual/Figma/design 정렬임을
확인한 뒤 명시한다.

### 10.3 CLI validity

| Invocation | Result |
|---|---|
| no `--intent` | 기존 동작 |
| `--screen X --intent visual-refresh` | valid |
| `--screen X --intent visual-refresh --path FILE` | valid concrete check |
| unknown/blank intent | exit 2 |
| intent without selector | exit 2 |
| intent with `--surface` | exit 2 |
| intent with `--app-shell` | exit 2 in first slice |
| absorbed screen | keyed non-applicable result; no authorization |

### 10.4 Internal model

```text
AuthorizationContext = {
  target_type: "screen" | "shared-surface" | "app-shell",
  target_id: string,
  work_intent: null | "visual-refresh",
  readiness_source: string,
  policy_source: string,
  ownership_source: string
}
```

forward CLI, skill, Work Packet, Run Report와 diff backstop은 이 context를 그대로
전달한다. 각 소비자가 intent를 다시 추론하지 않는다.

---

## 11. Decision D3 — `visual-refresh` Authorization

### 11.1 Applicability

`visual-refresh`는 다음을 모두 만족하는 active screen에만 적용한다.

```text
target exists
AND readiness_applicable !== false
AND lifecycle is valid and not absorbed
AND fact_idx >= index(final-fixture-ui)
AND decision_cap_idx >= index(final-fixture-ui)
AND final-fixture visual prerequisites are satisfied
```

`intent_required_mode`는 `final-fixture-ui`다. base maturity가
`api-integrated-ui` 또는 `production-ready`여도 그대로 보존한다.

### 11.2 Independent envelope

profile은 base `api-integrated-ui` allowed path에 screen path를 더하는 union이 아니다.
다음 candidate envelope를 독립적으로 계산한다.

```text
intent_allowed_candidates = resolve([
  "{roles.screen}",
  "{roles.domain_component}"
])
```

다음은 기본 deny다.

```text
{roles.hook}
{roles.api_client}
delegated shared-surface implementation paths
reserved app-shell implementation paths
generated/do_not_edit paths
another target's route_entry/screen_entry/implementation_paths
all deferred/conflict/non-owner API candidate paths
all active API candidate paths, including this screen's hook/API slices
unsafe or non-canonical concrete paths
```

visual refresh에서 hook을 열지 않는다. 시각 작업이 hook 변경을 필요로 한다면 현재
profile이 아니라 별도 source-backed task와 기존 candidate/mode authorization으로
분리한다.

### 11.3 Effective formula

```text
intent_allowed =
  candidate_visual_paths
  - every globally reserved/forbidden owner path

intent_forbidden =
  explicit deny paths
  ∪ base safety denies
  ∪ ownership reservations

concrete_allowed(file) =
  intent_applicable
  AND matches(intent_allowed)
  AND NOT matches(intent_forbidden)
```

배열 차집합을 문자열 조작으로 materialize하지 않는다. concrete helper가
forbidden precedence를 적용한다.

### 11.4 Base vs intent output

```yaml
readiness_mode: api-integrated-ui
allowed_paths:
  - src/features/create/hooks/**
  - src/api/**
forbidden_paths:
  - src/features/create/screens/**
work_intent:
  name: visual-refresh
  applicable: true
  required_mode: final-fixture-ui
  allowed_paths:
    - src/features/create/screens/**
    - src/features/create/components/**
  forbidden_paths:
    - src/features/create/hooks/**
    - src/api/**
  blocking: []
  next_actions: []
```

Top-level base path를 intent path로 교체하거나 합치지 않는다.

---

## 12. Decision D4 — App Shell Artifact Model

### 12.1 Chosen artifact

```text
artifact_type: app-shell-spec
canonical path:
  docs/frontend-workflow/app/shells/{shell}/shell-spec.md
example:
  docs/frontend-workflow/app/shells/main-shell/shell-spec.md
```

여러 shell을 허용한다. 예를 들어 root shell과 authenticated shell이 별도 physical
path를 소유할 수 있다. 단 identity와 path가 전역적으로 disjoint해야 한다.

### 12.2 Identity

```text
shell_id pattern: ^[A-Za-z0-9][A-Za-z0-9_-]*$
artifact_id: globally unique existing artifact namespace
shell_id: globally unique app-shell namespace
```

동일 `shell_id` 또는 `artifact_id`가 둘 이상이면 모든 관련 record를 fail closed하고
선택된 하나를 조용히 통과시키지 않는다.

### 12.3 Frontmatter

Required:

```text
artifact_id
artifact_type
shell_id
status
```

Optional:

```text
implementation_paths
decision_refs
api_required
sources
depends_on
last_reviewed
approval metadata
```

`implementation_paths`가 없거나 빈 배열이면 authoring artifact로는 valid할 수 있지만
구현 권한은 0이다.

Example:

```yaml
---
artifact_id: MAIN-SHELL-app-shell-spec
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
status: draft
implementation_paths:
  - src/app/_layout.tsx
  - src/components/app-shell/**
depends_on:
  - navigation-map
decision_refs:
  - D-SHELL-001
sources:
  - type: planning
    ref: planning://app-shell/main
last_reviewed: "2026-08-11"
---
```

### 12.4 Forbidden identity fields

app shell은 다음 field를 선언하지 않는다.

```text
domain
member_screens
screen_id
route
route_entry
screen_entry
surface_refs
member_surfaces
```

route group 또는 screen 집합과의 관계는 navigation reference/prose로 표현하며
readiness fan-out membership으로 사용하지 않는다.

### 12.5 Body ownership

권장 canonical sections:

```text
Purpose
Host Contract
State Matrix
Interaction Matrix
Navigation References
Visual Ownership
Implementation Boundary
API Candidates
Acceptance Criteria
Unknowns
```

local `## Open Decisions` section/table은 금지한다.

### 12.6 Canonical ownership split

| Concern | Canonical owner |
|---|---|
| tabs/stacks/modals topology, route guard, deep link, cross-domain edge | navigation-map |
| screen family, logo/header/CTA visual policy and exceptions | visual-consistency-contract |
| shell host behavior/state/interaction, narrow physical paths, target readiness/decisions | app-shell-spec |
| screen identity/local behavior/local route transition | ScreenSpec |
| same-domain member-uniform behavior | shared-surface-spec |

shell interaction이 route 이동을 유발할 때 app-shell-spec은 route string/edge를 복제하지
않는다. `Navigation References`는 `depends_on: [navigation-map]`와 함께 canonical
navigation-map artifact/section을 가리키고 shell은 trigger/host output만 소유한다.
현재 navigation-map에 stable row ID가 없으므로 exact route edge의 이중 저작을 만들지
않는다. semantic binding 누락은 first slice에서 warning-first이며, route truth
중복/충돌은 기존 route/nav 검사가 계속 소유한다.

### 12.7 Shell-specific fact profile

shell은 기존 mode 이름과 Blocking Mode를 재사용하지만 screen-specific fact를 neutral
`true`로 채우지 않는다. additive target profile `app-shell-v1`을 사용한다.

| Mode | Target-specific minimum fact |
|---|---|
| docs-only | artifact 발견/파싱 결과만; code 권한 0 |
| route-skeleton | valid identity + spec status ≥ draft + navigation-map status ≥ draft |
| screen-skeleton | Purpose/Host Contract/Implementation Boundary complete + non-empty implementation paths |
| rough-fixture-ui | shell State Matrix와 non-route Interaction Matrix complete |
| final-fixture-ui | shell status ≥ confirmed + Visual Ownership section structurally complete |
| api-integrated-ui | `api_required:false` compatibility 또는 valid confirmed actionable API Candidate contract |
| production-ready | 기존 CI/schema/state/review facts |

`figma_mapping_status`와 `fake_hook_exists`를 무조건 만족으로 넣지 않는다. shell final
fact는 명시적인 shell status와 Visual Ownership 계약에서 나온다. malformed contract나
참조는 docs-only로 fail closed한다.

```text
shell_readiness_mode = min(shell_fact_mode, shell_decision_cap)
```

member cap은 없다. app shell은 screen 집합 membership target이 아니기 때문이다.

### 12.8 Shell path envelope by maturity

shell의 positive 권한은 선언된 `implementation_paths` 안에서만 나온다.

- docs-only: code path 0
- route-skeleton: 선언 path 중 resolved route-entry surface에 속하는 concrete path만
- screen-skeleton/rough/final: 선언 path 중 hook/API-client가 아닌 shell host path
- api-integrated-ui: shell host path는 불변이며 owned active hook/API-client candidate
  slice만 기존 candidate 규칙으로 허용
- production-ready: 선언 path 안에서만 broad completion을 허용하되 candidate,
  generated, 다른 owner deny를 계속 적용

custom layout에서 role 분류가 없거나 ambiguous하면 positive permission을 만들지 않는다.
exact declaration만으로 unknown layer를 자동 개방하지 않는다.

---

## 13. Decision D5 — Target-scoped Open Decisions

### 13.1 Existing schema reuse

새 decision home이나 column을 만들지 않는다.

- canonical row: `global/open-decisions.md`
- app-shell-spec: `decision_refs`
- lifecycle: `open|resolved`
- `open → resolved`: 사람 전용
- `Blocking Mode`: 기존 mode order 이름

### 13.2 Scope

```text
shell decision application =
  canonical row
  + app-shell-spec decision_refs provenance
```

open row는 해당 shell의 `shell_decision_cap`, allowed paths와 next action만 제한한다.
다음에는 영향을 주지 않는다.

- unrelated screen `readiness_mode`
- shared-surface member cap
- 다른 shell, 그 shell이 같은 row를 명시적으로 참조하지 않는 경우

서로 다른 shell이 같은 canonical row를 각각 참조하면 각 target이 독립적으로 cap된다.
zero-ref global row는 계속 무영향이다.

### 13.3 Resolution and malformed cases

- resolved ref는 state provenance에 남지만 block하지 않는다.
- missing/ambiguous/malformed row/ref/register는 해당 shell만 docs-only로 fail closed한다.
- duplicate ref in one shell은 malformed다.
- duplicate shell artifact는 identity error이므로 “같은 shell에 여러 referrer”를
  silently dedupe하지 않는다.
- first slice에서 app-shell-spec 외 artifact가 shell-scoped decision referrer가 되지
  않는다.

Example:

```yaml
app_shells:
  MAIN-SHELL:
    derived:
      decision_refs:
        - id: D-SHELL-001
          status: open
          blocking_mode: final-fixture-ui
          source:
            artifact_id: open-decision-register
            artifact_type: open-decision-register
            path: global/open-decisions.md
          via:
            artifact_id: MAIN-SHELL-app-shell-spec
            artifact_type: app-shell-spec
            path: app/shells/main-shell/shell-spec.md
```

---

## 14. Decision D6 — Global Path Ownership and Reservation

### 14.1 One physical namespace

다음 owner를 하나의 project-relative POSIX namespace에 index한다.

```text
ScreenSpec route_entry/screen_entry
shared-surface implementation_paths
app-shell implementation_paths
API Candidate explicit Slice Paths
generated/do_not_edit outputs
```

identity domain이나 target kind가 다르다는 이유로 overlap을 허용하지 않는다.

### 14.2 Path grammar

app-shell `implementation_paths`는 shared surface와 같은 안전 문법을 사용한다.

- exact project-relative POSIX path 또는 하나의 좁은 terminal `/**`
- absolute/drive/UNC/backslash/traversal/hidden segment 금지
- arbitrary/middle glob 금지
- broad project/src/docs ownership 금지
- workflow authoring/generated output 금지

### 14.3 Overlap rules

Hard conflict:

- shell ↔ screen route_entry/screen_entry
- shell ↔ shared surface
- shell ↔ another shell
- shell ↔ generated output
- shell ↔ API Candidate owned by another target
- screen/shared owner끼리의 기존 conflicts

같은 app shell target의 valid API Candidate Slice Path는 shell declaration 안의
**subordinate ownership**이다. conflict가 아니며 다음을 만족해야 한다.

```text
candidate slice is fully contained by one shell implementation path
AND candidate owner target is the same shell
AND candidate contract is valid
```

다른 target의 candidate와 overlap하거나 shell declaration 밖이면 fail closed한다.

### 14.4 Reservation projection

모든 ordinary screen 결과에 shell reservation을 투영한다. shell은 특정 member만의
공유물이 아니기 때문이다.

```yaml
reserved_app_shell_paths:
  - src/app/_layout.tsx
  - src/components/app-shell/**
delegated_app_shells:
  - shell_id: MAIN-SHELL
    implementation_paths:
      - src/app/_layout.tsx
      - src/components/app-shell/**
    source:
      artifact_type: app-shell-spec
      path: app/shells/main-shell/shell-spec.md
```

모든 shared-surface authorization에도 같은 deny를 적용한다. app-shell target에는
screen/shared/other-shell/generated ownership을 반대로 예약한다.

### 14.5 Deny precedence

```text
authorized(file) =
  positive target/profile match
  AND no global ownership deny
  AND no generated deny
  AND no lifecycle/decision/contract deny
```

broad `src/**`나 role glob이 explicit reservation을 덮지 못한다.

---

## 15. Public CLI Contract

### 15.1 Selector

`workflow:readiness`는 다음 selector 중 정확히 하나 또는 기존 전체-screen 출력을
허용한다.

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

두 개 이상 selector는 exit 2다. generic `--target app-shell:...`은 first slice에서
public API로 노출하지 않는다.

### 15.2 #222 examples

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --json
```

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

### 15.3 #223 examples

```bash
npm run workflow:readiness -- \
  --app-shell MAIN-SHELL \
  --json
```

```bash
npm run workflow:readiness -- \
  --app-shell MAIN-SHELL \
  --path src/app/_layout.tsx \
  --json
```

`--path`는 screen과 app-shell concrete path에 지원한다. 동일 pure helper를 사용한다.
`--surface --path`는 현재 surface output의 declared-path authorization을 유지하고 first
slice에서 새 public combination을 만들지 않는다.

### 15.4 Usage errors

다음은 state/policy를 읽기 전에 exit 2다.

- blank/unknown intent
- blank/noncanonical shell ID
- selector mutual exclusion
- `--intent` without `--screen`
- `--path` without `--screen` or `--app-shell`
- glob/absolute/noncanonical concrete path
- `--app-shell` ID not matching lexical contract

존재하지 않는 canonical target ID는 기존 selector 관례에 맞게 keyed empty result 또는
명시적 not-found usage를 하나로 고정하고 CLI/test에서 일관되게 유지한다. 권장안은
screen/surface 현재 호환성을 위해 `{}` + exit 0을 유지하되 invalid lexical ID만 exit 2다.

---

## 16. Readiness JSON/YAML Contract

### 16.1 Base api-integrated screen

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "next_mode": "production-ready",
    "allowed_paths": [
      "src/features/create/hooks/**",
      "src/api/**"
    ],
    "forbidden_paths": [
      "src/features/create/screens/**"
    ],
    "blocking": [],
    "next_actions": []
  }
}
```

### 16.2 Same screen with visual refresh

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "next_mode": "production-ready",
    "allowed_paths": [
      "src/features/create/hooks/**",
      "src/api/**"
    ],
    "forbidden_paths": [
      "src/features/create/screens/**"
    ],
    "blocking": [],
    "next_actions": [],
    "work_intent": {
      "name": "visual-refresh",
      "applicable": true,
      "required_mode": "final-fixture-ui",
      "allowed_paths": [
        "src/features/create/components/**",
        "src/features/create/screens/**"
      ],
      "forbidden_paths": [
        "src/api/**",
        "src/features/create/hooks/**"
      ],
      "blocking": [],
      "next_actions": []
    }
  }
}
```

### 16.3 Visual refresh blocked by final-level decision

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "rough-fixture-ui",
    "next_mode": "final-fixture-ui",
    "allowed_paths": [
      "src/features/create/components/**",
      "src/features/create/hooks/**",
      "src/features/create/screens/**"
    ],
    "forbidden_paths": [
      "src/api/**"
    ],
    "blocking": [
      {
        "open_decision": {
          "id": "D-VISUAL-001",
          "blocking_mode": "final-fixture-ui",
          "owner": "Design"
        }
      }
    ],
    "next_actions": [
      "resolve decision D-VISUAL-001"
    ],
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "required_mode": "final-fixture-ui",
      "allowed_paths": [],
      "forbidden_paths": [],
      "blocking": [
        {
          "open_decision": {
            "id": "D-VISUAL-001",
            "blocking_mode": "final-fixture-ui",
            "owner": "Design"
          }
        }
      ],
      "next_actions": [
        "resolve decision D-VISUAL-001 before visual-refresh"
      ]
    }
  }
}
```

### 16.4 Valid app shell

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "shell_id": "MAIN-SHELL",
    "readiness_mode": "final-fixture-ui",
    "shell_fact_mode": "final-fixture-ui",
    "shell_decision_cap": "production-ready",
    "next_mode": "api-integrated-ui",
    "implementation_paths": [
      "src/app/_layout.tsx",
      "src/components/app-shell/**"
    ],
    "allowed_paths": [
      "src/app/_layout.tsx",
      "src/components/app-shell/**"
    ],
    "forbidden_paths": [],
    "path_authorization": [
      {
        "path": "src/app/_layout.tsx",
        "allowed": true,
        "causes": []
      },
      {
        "path": "src/components/app-shell/**",
        "allowed": true,
        "causes": []
      }
    ],
    "blocking": [],
    "next_actions": []
  }
}
```

### 16.5 Shell open decision blocks only the shell

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "shell_id": "MAIN-SHELL",
    "readiness_mode": "rough-fixture-ui",
    "shell_fact_mode": "final-fixture-ui",
    "shell_decision_cap": "rough-fixture-ui",
    "next_mode": "final-fixture-ui",
    "implementation_paths": [
      "src/components/app-shell/**"
    ],
    "allowed_paths": [
      "src/components/app-shell/**"
    ],
    "forbidden_paths": [],
    "path_authorization": [
      {
        "path": "src/components/app-shell/**",
        "allowed": true,
        "causes": []
      }
    ],
    "blocking": [
      {
        "open_decision": {
          "id": "D-SHELL-001",
          "blocking_mode": "final-fixture-ui",
          "owner": "Product"
        }
      }
    ],
    "next_actions": [
      "resolve decision D-SHELL-001"
    ]
  }
}
```

Unrelated screen output is unchanged and does not contain `D-SHELL-001`.

### 16.6 Malformed shell decision ref

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "shell_id": "MAIN-SHELL",
    "readiness_mode": "docs-only",
    "shell_fact_mode": "final-fixture-ui",
    "shell_decision_cap": "docs-only",
    "next_mode": "route-skeleton",
    "implementation_paths": [
      "src/components/app-shell/**"
    ],
    "allowed_paths": [],
    "forbidden_paths": [
      "src/components/app-shell/**"
    ],
    "path_authorization": [
      {
        "path": "src/components/app-shell/**",
        "allowed": false,
        "causes": [
          {
            "kind": "invalid-open-decision",
            "id": "D-MISSING"
          }
        ]
      }
    ],
    "blocking": [
      {
        "invalid_open_decision": {
          "id": "D-MISSING",
          "code": "unresolved-ref"
        }
      }
    ],
    "next_actions": [
      "fix decision reference D-MISSING"
    ]
  }
}
```

### 16.7 Screen attempts to edit shell path

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "production-ready",
    "work_intent": {
      "name": "visual-refresh",
      "applicable": true,
      "required_mode": "final-fixture-ui",
      "allowed_paths": [
        "src/features/create/components/**",
        "src/features/create/screens/**"
      ],
      "forbidden_paths": [
        "src/api/**",
        "src/app/_layout.tsx",
        "src/components/app-shell/**",
        "src/features/create/hooks/**"
      ],
      "blocking": [],
      "next_actions": []
    },
    "path_authorization": {
      "allowed": false,
      "file": "src/components/app-shell/Header.tsx",
      "target_type": "screen",
      "target_id": "CREATE-ATTACH",
      "work_intent": "visual-refresh",
      "reason": "path is reserved by app shell MAIN-SHELL",
      "allowed_by": [],
      "forbidden_by": [
        "src/components/app-shell/**"
      ],
      "owner": {
        "target_type": "app-shell",
        "target_id": "MAIN-SHELL"
      }
    }
  }
}
```

### 16.8 Field stability

- key ordering은 existing deterministic serialization convention을 따른다.
- no-intent screen output은 신규 `work_intent` key를 넣지 않는다.
- no-app-shell repo state/readiness에는 `app_shells`/shell reservation을 넣지 않는다.
- existing `allowed_paths`를 intent-specific 의미로 재사용하지 않는다.

---

## 17. workflow-state Contract

### 17.1 Additive top-level index

app-shell-spec이 하나 이상 발견될 때만 다음을 출력한다.

```yaml
app_shells:
  MAIN-SHELL:
    status: confirmed
    stub: false
    implementation_paths:
      - src/app/_layout.tsx
      - src/components/app-shell/**
    source:
      artifact_id: MAIN-SHELL-app-shell-spec
      artifact_type: app-shell-spec
      path: app/shells/main-shell/shell-spec.md
    derived:
      host_contract_complete: true
      state_matrix_complete: true
      interaction_matrix_complete: true
      visual_ownership_complete: true
      open_decisions_count: 1
      decision_refs:
        - id: D-SHELL-001
          status: open
          blocking_mode: final-fixture-ui
      blocking_decisions:
        - id: D-SHELL-001
          blocking_mode: final-fixture-ui
      malformed_decisions: []
      contract_errors: []
      identity_errors: []
      path_errors: []
```

### 17.2 Determinism and provenance

- shell ID와 source path 순으로 정렬한다.
- duplicate IDs는 selected record 하나를 성공으로 만들지 않는다.
- raw authored path는 diagnostics/state provenance에 보존한다.
- normalized ownership key는 내부 비교에만 사용한다.
- resolved decision도 `decision_refs`에 남긴다.
- old readers가 unknown top-level `app_shells`를 무시할 수 있도록 screens/surfaces shape를
  대규모 generic target shape로 바꾸지 않는다.

### 17.3 Generated source metadata

`workflow-state` manifest source에 다음이 additive하게 들어간다.

```text
docs/frontend-workflow/app/shells/**/shell-spec.md
```

기존 generated header/marker와 manifest ownership 계약을 그대로 사용한다. 새 생성
파일 형식을 만들지 않는다.

---

## 18. validate/backstop Contract

### 18.1 Hard structural checks

app shell에 대해 다음은 hard error 후보다.

- artifact type/path/frontmatter mismatch
- invalid/duplicate `shell_id` 또는 `artifact_id`
- forbidden screen/shared identity field
- local Open Decisions section/table
- invalid/missing/ambiguous decision ref
- unsafe/duplicate/overlapping implementation path
- screen route_entry/screen_entry overlap
- shared surface overlap
- another app shell overlap
- generated output overlap
- cross-target API Candidate overlap
- navigation route truth를 app-shell-spec에 중복 canonical 선언

명시적 구조·참조·소유권만 hard로 한다.

### 18.2 Warning-first checks

다음은 heuristic이므로 warning-first이며 `--enforce`로 승격하지 않는다.

- navigation-map 등 unsupported artifact 안의 `## Open Decisions`
- prose가 shell처럼 보이지만 app-shell-spec이 없는 경우
- Navigation References semantic binding 누락
- Visual Ownership 문구와 실제 component import drift

이 warning만으로 #223이 해결됐다고 판단하지 않는다.

### 18.3 Shared pure authorization helper

구현은 target별 소비자가 path 규칙을 재해석하지 않게 다음 개념의 순수 helper를 둔다.
정확한 함수명은 구현 관례에 맞출 수 있다.

```text
authorizeImplementationPath({
  file,
  authorization_context,
  readiness_entry,
  mode_order,
  ownership_index,
  candidate_claims
})
```

판정 순서:

1. concrete path canonicality
2. target/lifecycle/contract validity
3. intent applicability 또는 base target readiness
4. explicit global owner/reservation
5. generated ownership
6. candidate subordinate/deny ownership
7. positive allowed match
8. forbidden precedence
9. structured reason/owner/provenance 반환

### 18.4 Diff backstop context

`workflow:forbidden-paths`는 direct target context를 additive하게 받을 수 있어야 한다.

```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --diff changed.txt \
  --enforce
```

```bash
npm run workflow:forbidden-paths -- \
  --app-shell MAIN-SHELL \
  --diff changed.txt \
  --enforce
```

screen/surface/app-shell selector는 mutually exclusive다. app-shell을 채택한 repo에서
context 없이 shell-owned path가 변경되면 owner context 부재로 fail closed하거나
warning-first mode에서는 violation을 표면화한다. contextless 기존 invocation은 shell이
없는 repo에서 동일하게 동작한다.

### 18.5 Work Packet and Run Report

다음을 readiness 결과에서 복사한다.

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
work_intent:
  name: visual-refresh
  applicable: true
  required_mode: final-fixture-ui
path_authorization:
  allowed: true
  file: src/features/create/screens/CreateAttachScreen.tsx
```

packet/report는 intent profile, shell owner 또는 decision cap을 다시 계산하지 않는다.

---

## 19. Doc/Skill Ownership

| Surface | Required implementation follow-up |
|---|---|
| `docs/reference/open-decisions.md` | app shell referrer scope와 no-fan-out 설명 |
| new app-shell reference doc | artifact/body/path/readiness/migration canonical contract |
| `docs/reference/shared-surfaces.md` | shell과 shared surface의 분리 및 reservation 상호 금지 |
| `docs/reference/visual-reconciliation.md` | visual-refresh intent 선택 조건과 visual policy/app shell split |
| `docs/reference/doc-ownership.md` | app shell behavior/path gate의 canonical home 추가 |
| `docs/reference/task-artifact-matrix.md` | screen visual refresh와 app shell author/implement row 추가 |
| Stage 05 | app-shell-spec authoring route |
| Stage 06 | target/intent-aware implementation route |
| Stage 08 | target context를 report/backstop에 보존 |
| `COMMANDS.md` | `--intent`, `--app-shell`, concrete examples |
| `implement-screen` | visual task일 때만 intent 명시; shell path 위임 |
| `implement-shared-surface` | global shell reservation 준수 |
| new `implement-app-shell` | shell ID를 추측하지 않고 shell readiness만 소비 |

`implement-app-shell`은 다음을 하지 않는다.

- prose 이름에서 shell ID 추측
- route topology 중복 저작
- ordinary screen/shared path 수정
- Open Decision resolve
- `confirmed` 승격
- readiness 자체 재구현

---

## 20. Compatibility Matrix

| Repository/case | Required behavior |
|---|---|
| existing screen repo, no intent | current state/readiness/path behavior 유지 |
| legacy API Candidate screen | legacy compatibility 유지; visual intent는 API path를 열지 않음 |
| API Candidate v2 screen | active/deferred/conflict ownership 유지; visual intent에서 모두 deny |
| `api_required:false` screen | #124 compatibility 유지; intent가 API authority를 만들지 않음 |
| no shared surface | 변화 없음 |
| existing shared surface | membership/member cap/fan-out/reservation 유지 |
| no app-shell-spec | 새 required file/key/check 없음 |
| app-shell-spec adopted | additive state/readiness/ownership 적용 |
| custom layout/Tier3 | resolved role 분류 사용; unknown/ambiguous role fail closed |
| old vendored state reader | existing `screens`/`surfaces` shape 유지; unknown `app_shells` 무시 가능 |
| no global decision register/refs | 기존 local-only behavior 유지 |
| warning-first checks | hard/required CI로 자동 승격하지 않음 |

새 required CI check, dependency, release/version/tag 변경은 없다.

---

## 21. Migration

### 21.1 #222

기존 repository에는 migration이 없다. intent를 쓰지 않으면 기존 결과가 유지된다.
새 visual task만 다음 절차를 사용한다.

1. visual/design input이 canonical input으로 reconciled됐는지 확인한다.
2. target ScreenSpec, Figma mapping, visual consistency contract를 읽는다.
3. `--screen ID --intent visual-refresh` readiness를 실행한다.
4. concrete path마다 `--path` 결과를 확인한다.
5. screen/domain-component만 수정한다.
6. state/readiness/validate/visual-consistency와 target-aware backstop을 실행한다.
7. intent provenance를 Work Packet/Run Report에 복사한다.

### 21.2 #223 consumer adoption

1. global register의 기존 shell decision ID/status/options를 보존한다.
2. `app/shells/{shell}/shell-spec.md`를 draft로 작성한다.
3. narrow known `implementation_paths`만 선언한다.
4. canonical row를 `decision_refs`로 연결한다.
5. navigation-map의 topology와 visual contract의 policy prose는 유지하되 shell-spec에서
   pointer/reference로 연결하고 duplicate truth를 제거한다.
6. 어떤 decision도 자동 resolve하지 않는다.
7. `workflow:state`를 재생성한다.
8. shell readiness, representative screen/shared readiness와 concrete paths를 확인한다.
9. `workflow:validate`와 target-aware forbidden-paths를 실행한다.

자동 migration이나 consumer 파일 대량 재작성은 하지 않는다.

---

## 22. Implementation Slices

### 22.1 Slice A — Issue #222

Scope:

- target/intent authorization context와 pure concrete helper substrate
- screen-only `visual-refresh`
- CLI `--intent`
- intent-aware `--path`
- implement-screen/Stage 06 contract
- Work Packet/Run Report provenance copy
- forward/backstop parity
- focused regressions

Explicit exclusion:

- app-shell artifact/parser/state/template/schema
- shared-surface 의미 변경
- #224 decision-log

Acceptance:

- no-intent behavior 유지
- api-integrated base mode 그대로
- visual screen/domain-component only
- hook/API/client/candidate/delegated/generated deny
- final-level decision cap 준수
- forward/backstop same result

### 22.2 Slice B — Issue #223

Depends on Slice A substrate.

Scope:

- app-shell-spec template/schema/manifest
- shell parser/analyzer and global ownership index
- `workflow-state.app_shells`
- `--app-shell` readiness and shell fact profile
- shell decision refs/cap
- screen/shared shell path reservation
- validate/forbidden-paths
- `implement-app-shell` and docs
- distribution/upgrade coverage
- migration fixture and focused regressions

Acceptance:

- shell absence is no-op
- shell decision blocks shell only
- shell path cannot be edited through screen/shared
- shell target edits only authorized declared paths
- overlap/malformed references fail closed
- distribution payload contains all new active artifacts

### 22.3 No Slice 0

공통 helper는 Slice A의 실제 behavior와 함께 리뷰할 수 있다. behavior 없는 abstraction-only
선행 PR은 만들지 않는다.

---

## 23. File Impact Map

### Slice A expected files

| Area | Expected files |
|---|---|
| core | `scripts/readiness.mjs`, `scripts/lib/path-backstop.mjs`, target authorization helper if extracted |
| backstop | `scripts/forbidden-paths.mjs` |
| execution artifacts | `scripts/lib/workflow-packet.mjs`, `scripts/lib/workflow-report.mjs` and callers/templates as required |
| skill/docs | implement-screen, Stage 06, visual reconciliation, task matrix, commands/doc ownership |
| tests | fixture-hook/API deferral/path-backstop/readiness CLI/report/packet focused files |

### Slice B expected files

| Area | Expected files |
|---|---|
| artifact | new app-shell template/reference/skill; manifest and frontmatter schema |
| analyzer/state | new app-shell analyzer; `workflow-state.mjs` |
| readiness | `readiness.mjs`, shared target authorization helper |
| ownership | shared-surfaces analyzer/index integration, path backstop |
| validate | `validate.mjs` and explicit structural checks |
| docs | Open Decisions, shared surfaces, visual reconciliation, Stage 05/06/08, matrix, doc ownership, commands |
| distribution | pack/distribution/upgrade planner manifests and tests |
| tests | new app-shell focused suite plus readiness/CLI/backstop/distribution regressions |

정확한 helper 파일명은 구현 관례에 맞출 수 있지만 public contract와 ownership 계산
순서는 변경하지 않는다.

---

## 24. Verification Matrix

### 24.1 #222

| # | Regression |
|---|---|
| 1 | api-integrated screen, no intent: screen remains forbidden |
| 2 | same screen + visual-refresh: base mode stays api-integrated; screen/domain-component only |
| 3 | final-fixture-ui blocker denies visual-refresh |
| 4 | api-integrated-only blocker does not unnecessarily deny final-level visual work |
| 5 | missing final visual prerequisite fails closed |
| 6 | absorbed screen denied/non-applicable |
| 7 | malformed lifecycle/decision denied |
| 8 | delegated shared-surface path denied |
| 9 | reserved app-shell path denied when Slice B exists |
| 10 | deferred/conflict/non-owner candidate denied |
| 11 | custom layout/domain override resolves correct visual roles |
| 12 | unknown/blank/invalid intent and CLI combinations exit 2 |
| 13 | forward concrete result equals forbidden-paths result |
| 14 | Work Packet/Run Report copy intent provenance without recomputation |
| 15 | legacy/no-intent fixture output remains compatible |

### 24.2 #223

| # | Regression |
|---|---|
| 1 | no app-shell artifact keeps existing state/readiness/validate behavior |
| 2 | valid shell identity/path/state output deterministic |
| 3 | open shell decision caps shell target only |
| 4 | unrelated screen readiness unchanged |
| 5 | resolved ref remains provenance but does not block |
| 6 | missing/ambiguous/malformed ref fails shell closed only |
| 7 | zero-ref global row has no effect |
| 8 | local Open Decisions table rejected |
| 9 | domain/member/screen/route fields rejected |
| 10 | shell ↔ screen route_entry/screen_entry overlap rejected |
| 11 | shell ↔ shared surface overlap rejected |
| 12 | shell ↔ shell overlap rejected |
| 13 | ordinary implement-screen cannot edit shell path |
| 14 | shared-surface task cannot edit shell path |
| 15 | shell owner can edit only authorized declared shell path |
| 16 | empty implementation paths valid for authoring but permission 0 |
| 17 | custom project layout works; ambiguous role fails closed |
| 18 | state/readiness JSON ordering deterministic |
| 19 | selector mutual exclusion/invalid ID exit 2 |
| 20 | distribution/pack/upgrade planner includes template/skill/reference |

Implementation PR은 focused matrix뿐 아니라 기존
`fixture-hook-mode-ladder`, `api-candidate-deferral`, `shared-surfaces`,
`open-decisions`, `readiness-cli`, `readiness-failopen`, `path-backstop`,
`distribution`, `upgrade-planner` 회귀를 실행한다.

---

## 25. Risks / Known Limits

1. **Diff target provenance.** contextless CI diff만으로 작업자의 intended target을 알 수
   없다. shell 채택 repo에서는 explicit owner path를 context 없이 허용하지 않는 보수적
   fallback이 필요하다.
2. **Navigation reference precision.** 현재 navigation-map row에 stable edge ID가 없다.
   first slice는 route truth를 복제하지 않고 artifact/section pointer를 사용한다.
3. **Shell visual refresh.** #222 first slice intent는 screen-only다. shell visual refresh가
   필요하면 shell-specific evidence/profile을 별도 설계한다.
4. **Generic app-level targets.** 현재 공개 kit에서 app shell 외 여러 route-less target을
   즉시 generic화해야 할 강한 증거는 확인되지 않았다.
5. **Legacy broad authority.** no-adoption compatibility 때문에 legacy screens의 기존 broad
   behavior는 유지되지만 explicit shell/shared/generated/candidate reservation은 항상 우선한다.
6. **Consumer metrics.** issue reporter의 수치는 private consumer observation이며 kit
   fixture 재현 결과가 아니다.
7. **Design-only validation.** 이 문서는 구현을 증명하지 않는다. implementation PR에서
   모든 focused/full regression과 distribution test가 필요하다.

---

## 26. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity/order/formula를 유지한다. |
| D2 | explicit `--intent`; 첫 값은 screen-only `visual-refresh`다. |
| D3 | visual-refresh는 final-level prerequisite와 screen/domain-component-only 독립 envelope를 쓴다. |
| D4 | dedicated optional `app-shell-spec`을 사용한다. |
| D5 | 기존 6-column global decision + `decision_refs`로 shell-scoped cap을 만든다. |
| D6 | 모든 implementation target이 global physical path ownership namespace를 공유한다. |
| D7 | #222를 먼저 구현하고 #223이 substrate를 소비한다. |
| D8 | no-intent/no-shell compatibility와 warning-first 정책을 보존한다. |

---

## 27. Remaining Human Decisions

구현 시작을 막는 큰 human decision은 없다.

다음은 구현 PR에서 public 의미를 바꾸지 않는 범위의 이름 선택만 남는다.

- internal helper/module name
- exact diagnostic code prefix
- new app-shell reference/skill file의 최종 slug

그 선택은 저장소 관례에 맞추고 PR에서 문서화한다. app-shell을 generic
app-surface로 확대하거나 Open Decision schema를 바꾸는 선택은 이 설계의 허용된
implementation variation이 아니라 별도 설계 변경이다.

---

## 28. Design Verification

Baseline `49a3a31029293eae3fd6765f75e2b5520f939a93`에서 다음 계약을 읽어 설계 전제를
재검증했다.

- implementation mode policy와 readiness calculation
- workflow-state screen/shared aggregation
- Open Decision register/ref resolver
- shared-surface membership/readiness/path ownership
- concrete path/backstop/candidate authorization
- navigation-map/visual-consistency/doc ownership boundaries
- implement-screen/implement-shared-surface Stage 06 contracts
- manifest/frontmatter/distribution impact
- #124/#210/#211의 해결 경계

설계 문서 정적 검증:

- required sections present
- Markdown fence balance
- duplicate heading 없음
- JSON/YAML examples parseable
- repository-relative links resolve against baseline paths
- trailing whitespace/tab 없음
- #222/#223 acceptance criteria 독립 존재
- implementation slices 분리
- #221/#224 변경 또는 재설계 없음
- Open Decision 6-column schema/human-only transition 유지
- no-adoption/no-intent compatibility 명시

권장 baseline Node test 목록은 확인했지만, 이 설계 세션에서는 repository checkout과
runnable local dependency environment가 제공되지 않아 실행하지 못했다. baseline SHA에
연결된 GitHub status/workflow run도 조회되지 않았다. 따라서 test pass를 주장하지
않으며 implementation PR의 focused/full test와 CI가 실행 증거를 제공해야 한다.
