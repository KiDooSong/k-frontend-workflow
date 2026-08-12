# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-12  
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)  
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.
>
> Review amendment는 다음 네 공백을 닫는다: intent deny provenance,
> app-shell path taxonomy, target-aware API Candidate ownership, reconciled visual input evidence.

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

1. `readiness_mode = min(fact_mode, decision_cap)`과 기존 mode order를 유지한다.
2. 별도 축인 명시적 work intent를 도입하고 첫 public 값으로
   `visual-refresh`를 정의한다.
3. `visual-refresh`는 자유로운 capability override가 아니다. 호출자는
   `--input <INPUT_ID>`를 함께 주고, 도구는 reconciled Contract v2 visual evidence가
   target screen에 실제로 연결됐는지 확인한다.
4. 모든 path deny를 provenance-bearing claim으로 보존한다. `visual-refresh`가
   무시할 수 있는 deny는 claim의 `overrideable_by`에 명시된 좁은 base mode claim뿐이다.
   Tier3, generated, ownership, candidate deny는 절대 보존한다.
5. `visual-refresh`는 기존 mode 권한의 합집합이 아니라 screen/domain-component만
   여는 독립 최소 권한 envelope다.
6. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
7. app-shell `implementation_paths`는 문자열 추론이 아니라
   `path + kind(route-host|shell-host|hook|api-client)` typed declaration이다.
8. API Candidate claim owner를 `screen_id` 중심 shape에서 generic target identity로
   확장한다. app-shell candidate는 같은 shell의 typed hook/API-client path 안에서만
   positive authority를 만들 수 있다.
9. 기존 6-column Open Decision register와 `decision_refs`를 그대로 사용하되,
   shell decision은 해당 shell만 제한한다.
10. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
    ownership namespace를 사용하고 deny가 항상 우선한다.
11. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222에서 만든 공통 target/path
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

### 2.3 Current provenance loss

현재 mode YAML deny와 Tier3 `layers[].access.forbid`는 최종적으로 같은
`forbidden_paths: string[]`에 합쳐진다. 합쳐진 뒤에는 다음을 구분할 수 없다.

- canonical mode가 작업 단계 보호를 위해 만든 screen deny
- consumer Tier3 architecture가 추가한 safety deny
- literal custom policy deny
- generated/candidate/other-owner reservation

따라서 path 문자열을 지우는 방식의 intent override는 금지한다. 구현은 resolution 전
origin을 claim으로 보존해야 한다.

### 2.4 Shared surfaces

`shared-surface-spec`은 다음 의미를 가진다.

- 같은 domain의 canonical screen 최소 2개
- 명시적 `member_screens`
- member screen minimum readiness cap
- decision member fan-out
- non-route uniform behavior
- narrow `implementation_paths`

ordinary member screen은 surface path를 `forbidden_paths`로 예약받고
`delegated_shared_surfaces` provenance를 노출한다. 이 의미는 변경하지 않는다.

### 2.5 Open Decisions

현재 canonical global home은
`docs/frontend-workflow/global/open-decisions.md`이고 row schema는 다음 6개 column이다.

```text
ID | Decision Needed | Options | Blocking Mode | Owner | Status
```

`decision_refs`가 target과 row의 관계를 소유한다. global row는 zero-ref여도 valid하고,
referrer가 없으면 어떤 target도 막지 않는다. `open → resolved`는 사람 전용이다.

### 2.6 Current API Candidate owner boundary

현재 API Candidate v2의 positive authorization과 project conflict collection은
주로 ScreenSpec과 `screen_id`에 맞춰져 있다. Screen target은 domain/layout의
`{roles.hook}`/`{roles.api_client}`로 slice kind를 판정하고, `unknown:U-...`는 같은
ScreenSpec의 Unknown을 참조한다. domain과 screen identity가 없는 app shell에는 이
규칙을 그대로 적용할 수 없다.

### 2.7 Existing fixes and the remaining gap

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
8. 단순 `--intent`만 추가하면 API 배선 작업이 screen deny를 피하는 자유로운
   capability가 될 수 있다.

따라서 API 통합을 마친 화면의 visual-only refresh는 정상적인 screen 작업인데도
권한을 얻을 표현이 없고, 표현만 추가하더라도 source evidence와 deny provenance가
없으면 기존 안전 계약을 보존할 수 없다.

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
7. 기본 layout role에는 app-shell host가 없으므로 `src/components/app-shell/**` 같은
   path를 role inference로 안전하게 분류할 수 없다.
8. 현재 screen-centric API Candidate owner shape는 domainless shell candidate를
   표현하지 못한다.

Issue reporter가 제시한 34개 ScreenSpec과 3개 shared surface 같은 수치는 consumer
실측이다. 공개 kit 재현 사실과 섞지 않는다.

---

## 4. Goals

- readiness maturity와 현재 작업 종류의 권한을 분리한다.
- `api-integrated-ui` 이상 화면에서 reconciled visual evidence에 바인딩된 refresh를
  정상 경로로 허용한다.
- API 배선 작업 중 screen 불변을 tool-level invariant로 유지한다.
- intent가 무시할 수 있는 deny와 절대 보존할 deny를 provenance로 구분한다.
- app shell을 route-less/global 1급 implementation target으로 만든다.
- app-shell path kind를 author가 명시하고 validator가 deterministic하게 검사한다.
- shell API Candidate를 generic target owner 모델에 연결한다.
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
- evidence 없는 trusted override 또는 bypass flag
- path 문자열만 비교해 safety deny를 삭제
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
| intent evidence | intent capability를 허용하는 canonical reconciled input/item provenance |
| authorization profile | target와 intent에 따른 독립 path envelope |
| base readiness | intent 없는 기존 `readiness_mode`와 path 결과 |
| implementation target | screen, shared surface, app shell처럼 path owner가 될 수 있는 대상 |
| deny claim | path와 origin, class, overrideability를 함께 보존한 구조화 deny |
| waived claim | 현재 intent가 claim 자체의 명시적 허용에 따라 무시한 deny; 삭제된 claim이 아님 |
| safety deny | intent가 override할 수 없는 Tier3/generated/ownership/candidate/literal deny |
| reservation | 다른 target의 broad allowance보다 우선하는 explicit deny |
| target-scoped decision | referrer target만 cap하고 unrelated target에는 fan-out하지 않는 decision |
| shell path kind | `route-host|shell-host|hook|api-client` 중 author가 명시한 app-shell path 의미 |
| candidate owner | `{target_type, target_id}`로 표현하는 API Candidate ownership identity |
| subordinate slice | 같은 target 안에서 typed hook/API-client declaration보다 더 좁게 소유하는 candidate path |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. intent는 호출자가 명시하며 자동 추론하지 않는다.
4. `visual-refresh`는 reconciled Contract v2 visual evidence 없이는 positive permission을
   만들지 않는다.
5. intent는 base allowed path의 누적 합집합이 아니다.
6. deny는 문자열이 아니라 origin을 가진 claim으로 판정한다.
7. claim은 `overrideable_by`에 현재 intent가 명시된 경우에만 waive할 수 있다.
8. 같은 concrete file이 하나의 waived claim과 하나의 non-waivable claim에 동시에
   매치되면 deny한다.
9. Tier3 layer deny, literal custom deny, generated, other owner, deferred/conflict/
   non-owner candidate deny는 `visual-refresh`가 override하지 못한다.
10. forbidden/deny가 allowed보다 항상 우선한다.
11. concrete forward check와 diff backstop은 같은 순수 helper 결과를 소비한다.
12. Work Packet/Run Report는 authorization/evidence provenance를 재계산하지 않는다.
13. generated/do-not-edit ownership을 어떤 target도 우회하지 못한다.
14. explicit 다른 owner와 path가 겹치면 fail closed한다.
15. app-shell path kind는 role/name/디렉터리 문자열로 추론하지 않는다.
16. app shell candidate는 같은 shell의 matching typed hook/API-client declaration
    안에서만 positive authority를 만든다.
17. app shell decision은 screen/shared-surface readiness에 fan-out하지 않는다.
18. shared-surface member/cap/fan-out 의미는 유지한다.
19. intent가 없는 기존 실행은 기존 의미와 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode `allowed_paths` union | reject | 작업 종류를 구분하지 못하고 API mode의 screen 불변을 무력화한다. |
| `api-integrated-ui`에서 screen forbidden 제거 | reject | 모든 API 배선 작업에 screen mutation을 열어 최소 권한을 깨뜨린다. |
| scalar mode `visual-refresh` 삽입 | reject | maturity와 task kind를 다시 한 사다리에 섞고 migration/order 비교를 깨뜨린다. |
| Open Decision reopen으로 final mode 강등 | reject | 실제 maturity와 gate provenance를 거짓으로 만든다. |
| evidence 없는 explicit intent | reject | 호출자 오표기만으로 screen deny를 우회하는 capability가 된다. |
| reconciled v2 visual evidence + explicit intent | adopt | 자동 추론 없이 source-backed capability를 기계 검증한다. |
| flattened deny strings에서 `{roles.screen}` 제거 | reject | 같은/중첩 Tier3 deny와 origin을 구분하지 못한다. |
| provenance-bearing deny claims | adopt | override 가능 범위를 claim 단위로 제한한다. |
| shell path kind를 layout/name에서 추론 | reject | 기본 preset에 shell role이 없고 unknown layer가 fail-open될 수 있다. |
| typed `path + kind` declaration | adopt | domainless shell의 positive taxonomy를 artifact가 명시한다. |
| screen-only API Candidate shape를 shell에 복제 | reject | tracking/surface/owner conflict 규칙이 분기한다. |
| generic target-aware candidate owner | adopt | screen compatibility를 유지하면서 shell/shared overlap을 한 index로 검사한다. |
| shared-surface `scope: global` | reject | domain/min-2-member/member-cap/fan-out 의미를 특례로 흐린다. |
| dedicated `app-shell-spec` | adopt | shell identity, decisions, readiness, ownership을 좁고 명시적으로 만든다. |
| generic `app-surface-spec` | reject for first slice | 현재 확인된 요구는 shell이며 generic scope는 owner 경계를 과도하게 넓힌다. |
| `navigation-map`을 implementation target으로 승격 | reject | route topology 정본과 mutable code ownership을 한 artifact에 결합한다. |
| global decision row에 path/target column 추가 | reject | 기존 6-column schema와 human lifecycle을 바꿀 필요가 없다. referrer가 scope를 소유한다. |

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

### 9.3 Decision level and intent prerequisite

```text
intent_prerequisite_pass =
  fact_idx >= required_idx
  AND decision_cap_idx >= required_idx
  AND target structural state is valid
  AND intent_evidence.valid == true
```

따라서 `final-fixture-ui`를 막는 decision은 visual refresh를 막는다. 반면
`api-integrated-ui` 진입만 막는 decision은 final-level visual refresh를 불필요하게
막지 않는다.

---

## 10. Decision D2 — Explicit, Evidence-bound Work Intent

### 10.1 Public contract

첫 public contract는 다음이다.

```text
CLI flag:       --intent visual-refresh
Evidence flag:  --input <INPUT_ID>
Target:         --screen only
Internal term:  work intent / authorization profile
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

호출자 또는 `implement-screen`이 현재 task가 visual/Figma/design 정렬임을 명시한다.
도구는 선택을 대신하지 않지만, 선택된 capability의 evidence는 반드시 검증한다.

### 10.3 Evidence resolver

`visual-refresh`는 다음 전체를 만족해야 한다.

```text
1. --input 값이 canonical INPUT_ID_PATTERN을 만족한다.
2. canonical input artifact가 정확히 하나 존재하고 input_id가 일치한다.
3. Reconciliation Register가 reconciliation_contract: 2다.
4. 해당 input의 canonical summary row가 정확히 하나이고 Reconcile Status=reconciled다.
5. 같은 input의 Reconciliation Items 중 적어도 하나가:
   - Basis=visual-evidence
   - failed/in-progress가 아닌 완료 effect
   - existing typed target resolver로 target ScreenSpec, 그 sibling
     figma-component-mapping, 또는 target screen을 포함하는 visual contract row에 해소된다.
6. input artifact에 affected_screens가 명시돼 있으면 target screen이 포함된다.
   affected_screens가 scope-unclear/domain-level이면 item target 해소가 필수이며
   domain만 일치한다는 이유로 screen capability를 열지 않는다.
```

`source_type=figma`나 파일 이름만으로는 충분하지 않다. machine authority는
Contract v2 item의 `Basis=visual-evidence`, reconciled status, typed target 해소에서 온다.

v1/summary-only register, unresolved item target, missing item, `not-started`,
`in-progress`, `failed`는 모두 fail closed한다. 기존 repository가 intent를 사용하지
않는 경우에는 아무 영향이 없다.

### 10.4 Usage vs authorization failure

| Invocation/state | Result |
|---|---|
| no `--intent`, no `--input` | 기존 동작 |
| `--screen X --intent visual-refresh --input IN-...` | valid invocation; evidence 평가 |
| `--input` without intent | exit 2 |
| intent without `--input` | exit 2 |
| unknown/blank intent or malformed input ID | exit 2 |
| intent without selector | exit 2 |
| intent with `--surface`/`--app-shell` | exit 2 |
| canonical input/register/item unresolved | keyed result, `applicable:false`, exit 0 |
| reconciled row but no visual-evidence item for target | keyed result, `applicable:false`, exit 0 |
| absorbed screen | keyed non-applicable result; no authorization |

문법 오류와 “유효한 요청이지만 evidence가 부족함”을 구분한다.

### 10.5 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260811-figma-003
    reconciliation_contract: 2
    reconciliation_status: reconciled
    item_ids:
      - RI-VISUAL-003
    basis:
      - visual-evidence
    affected_target:
      target_type: screen
      target_id: CREATE-ATTACH
    input_source: inputs/create/IN-20260811-figma-003.md
    register_source: _meta/reconciliation-register.md
```

`readiness_source`, `policy_source`, `ownership_source`도 기존/신규 provenance에 따라
함께 보존한다. forward CLI, skill, Work Packet, Run Report와 diff backstop은 이
context를 그대로 전달한다. 각 소비자가 intent나 evidence를 다시 추론하지 않는다.

### 10.6 Trust boundary

첫 slice에는 evidence 검사를 우회하는 `--trust-intent`, config switch, environment
variable이 없다. 사람이 잘못된 intent를 선택할 수는 있지만, reconciled visual item이
없는 API wiring task는 tool-level positive permission을 얻지 못한다.

---

## 11. Decision D3 — Deny Claim Provenance와 `visual-refresh` Authorization

### 11.1 Applicability

`visual-refresh`는 다음을 모두 만족하는 active screen에만 적용한다.

```text
target exists
AND readiness_applicable !== false
AND lifecycle is valid and not absorbed
AND fact_idx >= index(final-fixture-ui)
AND decision_cap_idx >= index(final-fixture-ui)
AND final-fixture visual prerequisites are satisfied
AND visual intent evidence is valid for this screen
```

`intent_required_mode`는 `final-fixture-ui`다. base maturity가
`api-integrated-ui` 또는 `production-ready`여도 그대로 보존한다.

### 11.2 Claim model

모든 deny origin은 resolution 전에 다음 구조로 보존한다.

```yaml
deny_claim:
  claim_id: deny:mode-policy:api-integrated-ui:screen:0
  path: src/features/create/screens/**
  authored_path: "{roles.screen}"
  deny_class: work-step-boundary
  source:
    kind: mode-policy
    field: forbidden_paths
    mode: api-integrated-ui
    role: screen
    policy_path: policies/implementation-mode-policy.yaml
  overrideable_by:
    - visual-refresh
```

Minimum source kinds:

```text
mode-policy
tier3-layer
intent-profile
ownership-reservation
api-candidate
generated-output
contract-safety
```

Tier3 claim은 layer ID와 authored access row를 보존한다.

```yaml
deny_claim:
  claim_id: deny:tier3-layer:secure-screen:0
  path: src/features/create/screens/**
  authored_path: "{roles.screen}"
  deny_class: architecture-safety
  source:
    kind: tier3-layer
    layer_id: secure-screen
    field: access.forbid
    layout_path: project-layout.yaml
  overrideable_by: []
```

### 11.3 Claim creation and compatibility projection

- mode policy path를 resolve할 때 authored token, field, mode, role, resolved path를
  함께 생성한다.
- Tier3 policy synthesis는 문자열만 반환하지 않고 source claim을 전달한다.
- existing `allowed_paths`/`forbidden_paths`는 claim path의 deterministic unique
  projection으로 유지한다. no-intent public output compatibility를 위해 origin metadata를
  top-level 배열에 섞지 않는다.
- intent output과 concrete `path_authorization`은 structured claims를 노출한다.
- 두 claim이 같은 path string을 가져도 claim identity와 source를 dedupe하지 않는다.

### 11.4 Overrideability v1

`visual-refresh` v1이 waive할 수 있는 claim은 다음 **하나의 명시적 class rule**뿐이다.

```text
source.kind == mode-policy
AND source.field == forbidden_paths
AND source.mode == api-integrated-ui
AND source.authored_path == "{roles.screen}"
AND source.role == screen
AND deny_class == work-step-boundary
AND overrideable_by contains visual-refresh
```

이 규칙은 current canonical API wiring step의 screen immutability claim만 work-intent에
따라 전환한다. 다음은 waive하지 않는다.

- Tier3 `layers[].access.forbid`
- mode policy의 literal/compound glob deny
- 다른 mode/role deny
- intent profile의 hook/API-client deny
- shared/app-shell/other target reservation
- generated/do-not-edit deny
- deferred/conflict/non-owner/invalid candidate deny
- lifecycle/decision/contract safety deny

향후 다른 deny를 override하려면 profile version과 reviewable rule을 추가해야 한다.
resolved path 문자열이 같다는 이유만으로 overrideability를 전파하지 않는다.

### 11.5 Independent positive envelope

```text
intent_allowed_candidates = resolve([
  "{roles.screen}",
  "{roles.domain_component}"
])
```

`visual-refresh`는 hook을 열지 않는다. 다음 intent-profile deny를 별도 claim으로 만든다.

```text
{roles.hook}
{roles.api_client}
all active/deferred/conflict/non-owner API candidate paths
delegated shared-surface paths
reserved app-shell paths
generated/do_not_edit paths
another target's explicit paths
unsafe/non-canonical concrete paths
```

### 11.6 Effective formula

```text
matched_denies(file) = every deny claim whose path matches file
waived_denies(file)  = matched claim where current intent is in claim.overrideable_by
effective_denies     = matched_denies - waived_denies

concrete_allowed(file) =
  intent_applicable
  AND matches(intent_allowed_candidates)
  AND effective_denies(file).length == 0
```

배열 차집합이나 path string 삭제로 materialize하지 않는다. concrete helper가 claim을
평가한다. 같은 file이 canonical screen claim과 Tier3 claim에 동시에 매치되면 canonical
claim만 waived되고 Tier3 claim 때문에 최종 거부된다.

### 11.7 Output example — Tier3 deny survives

```json
{
  "path_authorization": {
    "allowed": false,
    "file": "src/features/create/screens/CreateAttachScreen.tsx",
    "target_type": "screen",
    "target_id": "CREATE-ATTACH",
    "work_intent": "visual-refresh",
    "matched_deny_claims": [
      {
        "source_kind": "mode-policy",
        "mode": "api-integrated-ui",
        "role": "screen",
        "path": "src/features/create/screens/**",
        "overrideable_by": ["visual-refresh"]
      },
      {
        "source_kind": "tier3-layer",
        "layer_id": "secure-screen",
        "path": "src/features/create/screens/**",
        "overrideable_by": []
      }
    ],
    "waived_deny_claims": [
      "deny:mode-policy:api-integrated-ui:screen:0"
    ],
    "effective_deny_claims": [
      "deny:tier3-layer:secure-screen:0"
    ],
    "reason": "matching non-overrideable Tier3 architecture deny"
  }
}
```

---

## 12. Decision D4 — App Shell Artifact와 Typed Path Taxonomy

### 12.1 Chosen artifact

```text
artifact_type: app-shell-spec
canonical path:
  docs/frontend-workflow/app/shells/{shell}/shell-spec.md
example:
  docs/frontend-workflow/app/shells/main-shell/shell-spec.md
```

여러 shell을 허용한다. 예를 들어 root shell과 authenticated shell이 별도 physical
path를 소유할 수 있다. identity와 path는 전역적으로 disjoint해야 한다.

### 12.2 Identity

```text
shell_id pattern: ^[A-Za-z0-9][A-Za-z0-9_-]*$
artifact_id: globally unique existing artifact namespace
shell_id: globally unique app-shell namespace
```

동일 `shell_id` 또는 `artifact_id`가 둘 이상이면 모든 관련 record를 fail closed하고
선택된 하나를 조용히 통과시키지 않는다.

### 12.3 Frontmatter and typed implementation paths

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

`implementation_paths`는 object array다. string-only entry는 first slice에서 invalid다.
경로 의미를 name/layout heuristics로 추론하지 않는다.

```yaml
---
artifact_id: MAIN-SHELL-app-shell-spec
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
status: confirmed
implementation_paths:
  - path: src/app/_layout.tsx
    kind: route-host
  - path: src/components/app-shell/host/**
    kind: shell-host
  - path: src/features/app-shell-runtime/hooks/**
    kind: hook
  - path: src/api/app-shell/**
    kind: api-client
api_required: true
depends_on:
  - navigation-map
decision_refs:
  - D-SHELL-001
sources:
  - type: planning
    ref: planning://app-shell/main
last_reviewed: "2026-08-12"
---
```

`implementation_paths`가 없거나 빈 배열이면 authoring artifact로는 valid할 수 있지만
구현 권한은 0이다.

### 12.4 Path kind enum

| Kind | Meaning | Positive authority source |
|---|---|---|
| `route-host` | root layout/provider/router host boundary | shell mode profile |
| `shell-host` | global shell UI/interaction/provider implementation | shell mode profile |
| `hook` | shell-local fixture/runtime hook seam | valid same-shell active candidate only |
| `api-client` | shell API client/repository code | valid same-shell active candidate only |

Missing/unknown kind, duplicate path, or any overlap between two authored shell path entries is
hard invalid and grants no authority. Candidate Slice Path는 implementation entry가 아니므로
matching typed entry 안의 subordinate overlap은 아래 candidate 계약으로 별도 허용한다.

기본/custom layout role은 shell path kind의 positive source가 아니다. typed declaration이
canonical taxonomy다. 다만 layout/Tier3 deny claim은 계속 적용되므로 author가 `shell-host`로
표기했다고 architecture safety boundary를 우회하지 못한다.

### 12.5 Path grammar

각 `path`는 다음을 만족한다.

- exact project-relative POSIX path 또는 하나의 좁은 terminal `/**`
- absolute/drive/UNC/backslash/traversal/hidden segment 금지
- arbitrary/middle glob 금지
- broad project/src/docs ownership 금지
- workflow authoring/generated output 금지

### 12.6 Forbidden identity fields

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

### 12.7 Body and canonical ownership

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

| Concern | Canonical owner |
|---|---|
| tabs/stacks/modals topology, route guard, deep link, cross-domain edge | navigation-map |
| screen family, logo/header/CTA visual policy and exceptions | visual-consistency-contract |
| shell host behavior/state/interaction, typed physical paths, target readiness/decisions | app-shell-spec |
| screen identity/local behavior/local route transition | ScreenSpec |
| same-domain member-uniform behavior | shared-surface-spec |

shell interaction이 route 이동을 유발할 때 app-shell-spec은 route string/edge를 복제하지
않는다. `Navigation References`는 canonical navigation-map artifact/section을 가리키고
shell은 trigger/host output만 소유한다.

### 12.8 Shell-specific fact profile

shell은 기존 mode 이름과 Blocking Mode를 재사용하지만 screen-specific fact를 neutral
`true`로 채우지 않는다. additive target profile `app-shell-v1`을 사용한다.

| Mode | Target-specific minimum fact |
|---|---|
| docs-only | artifact 발견/파싱 결과만; code 권한 0 |
| route-skeleton | valid identity + spec status ≥ draft + navigation-map status ≥ draft |
| screen-skeleton | Purpose/Host Contract/Implementation Boundary complete + non-empty typed paths |
| rough-fixture-ui | shell State Matrix와 non-route Interaction Matrix complete |
| final-fixture-ui | shell status ≥ confirmed + Visual Ownership structurally complete |
| api-integrated-ui | `api_required:false` special case 또는 valid confirmed actionable same-shell candidate contract |
| production-ready | 기존 CI/schema/state/review facts |

`figma_mapping_status`와 `fake_hook_exists`를 무조건 만족으로 넣지 않는다. malformed
contract/ref/path/candidate는 target-specific gate를 fail closed한다.

```text
shell_readiness_mode = min(shell_fact_mode, shell_decision_cap)
```

member cap은 없다.

### 12.9 Positive envelope by maturity and kind

| Mode | Positive shell paths |
|---|---|
| docs-only | none |
| route-skeleton | declared `route-host` |
| screen-skeleton | declared `route-host` + `shell-host` |
| rough-fixture-ui | route/shell host + valid same-shell active `hook` candidate slices |
| final-fixture-ui | route/shell host + valid same-shell active `hook` candidate slices |
| api-integrated-ui | valid same-shell active `hook`/`api-client` candidate slices only; host paths frozen |
| production-ready | declared route/shell host + valid active candidate slices; unowned hook/api-client remain denied |

Typed `hook`/`api-client` declaration alone은 positive permission이 아니다. candidate ownership이
없으면 모든 mode에서 deny다.

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
- duplicate shell artifact는 identity error이며 silently dedupe하지 않는다.
- first slice에서 app-shell-spec 외 artifact가 shell-scoped decision referrer가 되지 않는다.

---

## 14. Decision D6 — Target-aware API Candidate Ownership

### 14.1 Generic owner identity

내부/public additive candidate provenance의 canonical owner는 다음이다.

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

기존 screen row의 `screen_id`는 compatibility alias로 유지할 수 있지만 generic
authorization/conflict code는 `owner`를 사용한다. shell row에 가짜 `screen_id`나
`domain`을 만들지 않는다.

### 14.2 Generic claim shape

```yaml
candidate_claim:
  kind: active | deferred | conflict
  owner:
    target_type: app-shell
    target_id: MAIN-SHELL
  endpoint: GET /app-shell/menu
  path: src/features/app-shell-runtime/hooks/useShellMenu.ts
  tracking: null
  surface_kind: hook
  source:
    artifact_type: app-shell-spec
    path: app/shells/main-shell/shell-spec.md
```

### 14.3 Target-specific surface resolver

| Target | `surface_kind` source |
|---|---|
| screen | existing domain/layout resolved `{roles.hook}` / `{roles.api_client}` |
| app-shell | exactly one containing typed implementation entry with matching `kind=hook|api-client` |
| shared-surface | existing surface candidate parser/implementation boundary; positive behavior unchanged, generic owner participates in conflict index |

app-shell candidate path가 typed entry 밖이거나, 두 entry에 걸치거나, authored kind와
candidate surface kind가 다르면 contract invalid다. exact declaration만으로 unknown path를
hook/API-client로 분류하지 않는다.

### 14.4 Tracking generalization

`unknown:U-...`는 “같은 ScreenSpec”이 아니라 **같은 owner artifact의 canonical Unknown**을
참조한다.

```text
screen candidate       → same ScreenSpec Unknown
shared-surface candidate → same surface-spec Unknown
app-shell candidate    → same shell-spec Unknown
```

`issue:#N`은 기존처럼 syntax-only다. 다른 target의 Unknown을 참조하지 않는다.

### 14.5 Same-shell subordinate authority

positive shell candidate authority는 다음 전체를 만족한다.

```text
owner.target_type == app-shell
AND owner.target_id == selected shell_id
AND candidate contract valid
AND candidate confidence == confirmed
AND candidate gate == active
AND candidate path is fully contained by exactly one typed shell path
AND typed path kind == candidate.surface_kind
AND no cross-target overlap/conflict
AND api_required != false
```

- rough/final에서는 active hook slice만 fixture seam으로 허용한다.
- api-integrated 이상에서는 active hook/api-client slice를 허용한다.
- host kind path는 candidate가 소유하지 않는다.
- integrated/production에서도 typed hook/api-client path는 explicit active claim이 없으면
  거부한다.

### 14.6 Deny-only preservation

다음은 positive authority를 만들지 않지만 recoverable safe path provenance를 project-wide
deny로 보존한다.

- deferred shell candidate
- invalid/malformed shell candidate
- unresolved/closed Unknown tracking
- candidate outside typed declaration
- kind mismatch/ambiguous containment
- cross-target ownership conflict
- concrete candidate under `api_required:false`

`api_required:false` shell은 candidate authority를 얻지 않는다. concrete rows는
contradiction warning/error와 deny-only provenance를 남긴다.

### 14.7 Cross-target conflicts

하나의 generic index에서 다음 overlap을 검사한다.

```text
screen ↔ screen
screen ↔ shared-surface
screen ↔ app-shell
shared-surface ↔ app-shell
app-shell ↔ app-shell
```

같은 app-shell owner의 candidate가 matching typed hook/api-client declaration 안에 있는
경우만 subordinate ownership으로 허용한다. 다른 owner와 overlap하면 양쪽을 fail closed한다.

### 14.8 Shell API readiness facts

`api-integrated-ui` shell fact는 다음을 사용한다.

```text
api_actionable_confidence_min == confirmed
api_actionable_candidates_count > 0
api_candidate_contract_valid == true
api_candidate_ownership_conflicts == 0
```

`api_required:false`는 maturity compatibility를 위해 no-API special case를 사용할 수 있지만,
모든 API candidate path authority는 제거한다.

---

## 15. Decision D7 — Global Path Ownership and Reservation

### 15.1 One physical namespace

다음 owner를 하나의 project-relative POSIX namespace에 index한다.

```text
ScreenSpec route_entry/screen_entry
shared-surface implementation_paths
app-shell typed implementation_paths
generic API Candidate Slice Paths
generated/do_not_edit outputs
```

identity domain이나 target kind가 다르다는 이유로 overlap을 허용하지 않는다.

### 15.2 Hard conflicts

- shell ↔ screen route_entry/screen_entry
- shell ↔ shared surface
- shell ↔ another shell
- shell ↔ generated output
- shell ↔ API Candidate owned by another target
- candidate ↔ candidate across different owners
- existing screen/shared ownership conflicts

같은 app shell target의 valid matching candidate Slice Path만 typed hook/api-client
entry 안의 subordinate ownership이다.

### 15.3 Reservation projection

모든 ordinary screen 결과에 shell reservation을 투영한다.

```yaml
reserved_app_shell_paths:
  - path: src/app/_layout.tsx
    kind: route-host
  - path: src/components/app-shell/host/**
    kind: shell-host
delegated_app_shells:
  - shell_id: MAIN-SHELL
    source:
      artifact_type: app-shell-spec
      path: app/shells/main-shell/shell-spec.md
```

모든 shared-surface authorization에도 같은 deny를 적용한다. app-shell target에는
screen/shared/other-shell/generated ownership을 반대로 예약한다.

### 15.4 Effective authorization order

```text
1. concrete path canonicality
2. target/lifecycle/contract validity
3. intent evidence and prerequisite, when intent is present
4. positive target/profile candidate
5. collect all deny claims with provenance
6. apply claim-level waiver only when overrideable_by contains current intent
7. deny if any non-waived claim remains
8. return structured owner/reason/claim/evidence provenance
```

broad `src/**`나 role glob이 explicit reservation을 덮지 못한다.

---

## 16. Public CLI Contract

### 16.1 Selectors

`workflow:readiness`는 다음 selector 중 정확히 하나 또는 기존 전체-screen 출력을
허용한다.

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

두 개 이상 selector는 exit 2다. generic `--target app-shell:...`은 first slice에서
public API로 노출하지 않는다.

### 16.2 #222 examples

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260811-figma-003 \
  --json
```

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260811-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

### 16.3 #223 examples

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

### 16.4 Usage errors

다음은 state/policy를 읽기 전에 exit 2다.

- blank/unknown intent
- intent without `--input`
- `--input` without intent
- malformed/blank input ID
- blank/noncanonical shell ID
- selector mutual exclusion
- `--intent` without `--screen`
- `--path` without supported selector
- glob/absolute/noncanonical concrete path

canonical input/register/evidence resolution 실패는 usage error가 아니라 keyed
`applicable:false` authorization result다.

### 16.5 Backstop context

```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260811-figma-003 \
  --diff changed.txt \
  --enforce
```

```bash
npm run workflow:forbidden-paths -- \
  --app-shell MAIN-SHELL \
  --diff changed.txt \
  --enforce
```

forward와 backstop은 같은 authorization context/evidence resolver/claim helper를 사용한다.

---

## 17. workflow-state Contract

### 17.1 App shell index

app-shell-spec이 하나 이상 발견될 때만 additive top-level을 출력한다.

```yaml
app_shells:
  MAIN-SHELL:
    status: confirmed
    stub: false
    implementation_paths:
      - path: src/app/_layout.tsx
        kind: route-host
      - path: src/components/app-shell/host/**
        kind: shell-host
      - path: src/features/app-shell-runtime/hooks/**
        kind: hook
      - path: src/api/app-shell/**
        kind: api-client
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
      decision_refs: []
      blocking_decisions: []
      malformed_decisions: []
      api_candidate_contract_version: 2
      api_actionable_candidates: []
      api_deferred_candidates: []
      api_candidate_contract_issues: []
      contract_errors: []
      identity_errors: []
      path_errors: []
```

### 17.2 Determinism and provenance

- shell ID와 source path 순으로 정렬한다.
- typed path는 path, kind 순으로 결정적으로 정렬한다.
- duplicate IDs는 selected record 하나를 성공으로 만들지 않는다.
- raw authored path/kind는 diagnostics/state provenance에 보존한다.
- normalized ownership key는 내부 비교에만 사용한다.
- resolved decision도 `decision_refs`에 남긴다.
- screens/surfaces shape를 generic target shape로 깨지 않는다.

### 17.3 Intent evidence loading

`visual-refresh` evidence는 generated workflow-state에 복제하지 않는다.
readiness와 forbidden-paths가 shared pure `loadIntentEvidence()`를 통해 canonical input,
Contract v2 Register, typed Reconciliation Items를 직접 읽는다. Work Packet/Run Report는
그 결과를 복사한다. 이로써 stale generated state가 capability evidence가 되지 않는다.

### 17.4 Generated source metadata

`workflow-state` manifest source에 다음이 additive하게 들어간다.

```text
docs/frontend-workflow/app/shells/**/shell-spec.md
```

새 generated file 형식은 만들지 않는다.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Base api-integrated screen

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "allowed_paths": ["src/features/create/hooks/**", "src/api/**"],
    "forbidden_paths": ["src/features/create/screens/**"],
    "blocking": [],
    "next_actions": []
  }
}
```

### 18.2 Same screen with evidence-bound visual refresh

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "allowed_paths": ["src/features/create/hooks/**", "src/api/**"],
    "forbidden_paths": ["src/features/create/screens/**"],
    "work_intent": {
      "name": "visual-refresh",
      "applicable": true,
      "required_mode": "final-fixture-ui",
      "evidence": {
        "input_id": "IN-20260811-figma-003",
        "reconciliation_contract": 2,
        "reconciliation_status": "reconciled",
        "item_ids": ["RI-VISUAL-003"],
        "basis": ["visual-evidence"],
        "affected_target": {
          "target_type": "screen",
          "target_id": "CREATE-ATTACH"
        }
      },
      "allowed_paths": [
        "src/features/create/components/**",
        "src/features/create/screens/**"
      ],
      "deny_claims": [
        {
          "claim_id": "deny:mode-policy:api-integrated-ui:screen:0",
          "path": "src/features/create/screens/**",
          "source_kind": "mode-policy",
          "overrideable_by": ["visual-refresh"]
        },
        {
          "claim_id": "deny:intent-profile:visual-refresh:hook:0",
          "path": "src/features/create/hooks/**",
          "source_kind": "intent-profile",
          "overrideable_by": []
        }
      ],
      "blocking": [],
      "next_actions": []
    }
  }
}
```

### 18.3 Evidence missing

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "required_mode": "final-fixture-ui",
      "evidence": {
        "input_id": "IN-20260811-api-004",
        "valid": false,
        "issues": ["no reconciled visual-evidence item targets screen CREATE-ATTACH"]
      },
      "allowed_paths": [],
      "deny_claims": [],
      "blocking": [
        {
          "intent_evidence": "missing-or-inapplicable"
        }
      ],
      "next_actions": [
        "reconcile a Contract v2 visual-evidence item for CREATE-ATTACH"
      ]
    }
  }
}
```

### 18.4 Valid app shell

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "shell_id": "MAIN-SHELL",
    "readiness_mode": "final-fixture-ui",
    "shell_fact_mode": "final-fixture-ui",
    "shell_decision_cap": "production-ready",
    "implementation_paths": [
      {"path": "src/app/_layout.tsx", "kind": "route-host"},
      {"path": "src/components/app-shell/host/**", "kind": "shell-host"},
      {"path": "src/features/app-shell-runtime/hooks/**", "kind": "hook"},
      {"path": "src/api/app-shell/**", "kind": "api-client"}
    ],
    "allowed_paths": [
      "src/app/_layout.tsx",
      "src/components/app-shell/host/**",
      "src/features/app-shell-runtime/hooks/useShellMenu.ts"
    ],
    "forbidden_paths": ["src/api/app-shell/**"],
    "api_candidate_authorization": {
      "owner": {"target_type": "app-shell", "target_id": "MAIN-SHELL"},
      "valid": true,
      "actionable": [
        {
          "path": "src/features/app-shell-runtime/hooks/useShellMenu.ts",
          "surface_kind": "hook"
        },
        {
          "path": "src/api/app-shell/menu/**",
          "surface_kind": "api-client"
        }
      ]
    },
    "blocking": [],
    "next_actions": []
  }
}
```

At final mode active hook slice is allowed, active API-client slice remains denied until
api-integrated. Host paths are frozen at api-integrated and reopen only at production-ready.

### 18.5 Screen attempts to edit shell path

```json
{
  "path_authorization": {
    "allowed": false,
    "file": "src/components/app-shell/host/Header.tsx",
    "target_type": "screen",
    "target_id": "CREATE-ATTACH",
    "work_intent": "visual-refresh",
    "reason": "path is reserved by app shell MAIN-SHELL",
    "effective_deny_claims": [
      {
        "source_kind": "ownership-reservation",
        "owner": {"target_type": "app-shell", "target_id": "MAIN-SHELL"},
        "path": "src/components/app-shell/host/**"
      }
    ]
  }
}
```

### 18.6 Field stability

- no-intent screen output은 신규 `work_intent` key를 넣지 않는다.
- no-app-shell repo state/readiness에는 `app_shells`/shell reservation을 넣지 않는다.
- existing `allowed_paths`를 intent-specific 의미로 재사용하지 않는다.
- screen candidate output의 existing `screen_id` compatibility field는 유지한다.

---

## 19. validate/backstop Contract

### 19.1 Hard structural checks

app shell에 대해 다음은 hard error 후보다.

- artifact type/path/frontmatter mismatch
- invalid/duplicate `shell_id` 또는 `artifact_id`
- forbidden screen/shared identity field
- local Open Decisions section/table
- invalid/missing/ambiguous decision ref
- string-only/missing-kind/unknown-kind implementation entry
- unsafe/duplicate/overlapping typed implementation path
- screen route_entry/screen_entry overlap
- shared surface overlap
- another app shell overlap
- generated output overlap
- cross-target API Candidate overlap
- candidate outside matching typed path or kind mismatch
- cross-target Unknown tracking
- navigation route truth를 app-shell-spec에 중복 canonical 선언

명시적 구조·참조·소유권만 hard로 한다.

### 19.2 Warning-first checks

다음은 heuristic이므로 warning-first이며 `--enforce`로 승격하지 않는다.

- navigation-map 등 unsupported artifact 안의 `## Open Decisions`
- prose가 shell처럼 보이지만 app-shell-spec이 없는 경우
- Navigation References semantic binding 누락
- Visual Ownership 문구와 실제 component import drift

### 19.3 Shared pure authorization helper

```text
authorizeImplementationPath({
  file,
  authorization_context,
  readiness_entry,
  mode_order,
  positive_claims,
  deny_claims,
  ownership_index,
  candidate_claims,
  intent_evidence
})
```

helper는 path strings를 삭제하지 않고 claim-level waive/effective deny 결과를 반환한다.
readiness, implement skill, Work Packet/Run Report, forbidden-paths가 결과를 재해석하지 않는다.

### 19.4 Intent evidence helper

```text
loadIntentEvidence({
  docs_dir,
  input_id,
  target: { type: "screen", id },
  intent: "visual-refresh"
})
```

canonical input/parser, reconciliation register v2 parser, item target resolver를 재사용한다.
validator와 다른 ad-hoc 정규식을 만들지 않는다.

### 19.5 Diff backstop

- explicit target/evidence context가 있으면 forward와 동일 판정을 한다.
- app-shell 채택 repo에서 context 없이 shell-owned path가 변경되면 owner-context 부재
  violation을 표면화한다.
- contextless no-shell/no-intent invocation은 기존 동작을 유지한다.
- warning-first 기본/`--enforce` exit contract는 기존 정책을 유지한다.

### 19.6 Work Packet and Run Report

다음을 readiness 결과에서 그대로 복사한다.

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260811-figma-003
    reconciliation_status: reconciled
    item_ids: [RI-VISUAL-003]
work_intent:
  applicable: true
  required_mode: final-fixture-ui
path_authorization:
  allowed: true
  waived_deny_claims:
    - deny:mode-policy:api-integrated-ui:screen:0
  effective_deny_claims: []
```

packet/report는 intent evidence, claim overrideability, shell owner 또는 candidate cap을
다시 계산하지 않는다.

---

## 20. Doc/Skill Ownership

| Surface | Required implementation follow-up |
|---|---|
| input/reconciliation reference | visual-refresh evidence contract와 v2-only boundary |
| `docs/reference/open-decisions.md` | app shell referrer scope와 no-fan-out 설명 |
| new app-shell reference doc | typed path/body/candidate/readiness/migration canonical contract |
| `docs/reference/shared-surfaces.md` | shell과 shared surface의 분리 및 reservation 상호 금지 |
| `docs/reference/visual-reconciliation.md` | evidence-bound visual-refresh 선택 조건 |
| `docs/reference/doc-ownership.md` | app shell behavior/path gate의 canonical home 추가 |
| `docs/reference/task-artifact-matrix.md` | screen visual refresh와 app shell author/implement row 추가 |
| Stage 05 | app-shell-spec authoring route |
| Stage 06 | target/intent/evidence-aware implementation route |
| Stage 08 | target/evidence/claim provenance를 report/backstop에 보존 |
| `COMMANDS.md` | `--intent`, `--input`, `--app-shell`, concrete examples |
| `implement-screen` | reconciled v2 visual evidence가 있을 때만 intent 명시; shell path 위임 |
| `implement-shared-surface` | global shell reservation 준수 |
| new `implement-app-shell` | shell ID를 추측하지 않고 shell readiness만 소비 |

`implement-app-shell`은 다음을 하지 않는다.

- prose 이름에서 shell ID 추측
- path kind 추론 또는 누락 kind 자동 보정
- route topology 중복 저작
- ordinary screen/shared path 수정
- Open Decision resolve
- `confirmed` 승격
- readiness 자체 재구현

---

## 21. Compatibility Matrix

| Repository/case | Required behavior |
|---|---|
| existing screen repo, no intent | current state/readiness/path behavior 유지 |
| intent requested without v2 evidence | base output 유지; intent not applicable, permission 0 |
| legacy/v1 Reconciliation Register | no-intent unchanged; visual-refresh unavailable until explicit v2 reconciliation |
| legacy API Candidate screen | legacy compatibility 유지; visual intent는 API path를 열지 않음 |
| API Candidate v2 screen | active/deferred/conflict ownership 유지; visual intent에서 모두 deny |
| `api_required:false` screen | #124 compatibility 유지; intent가 API authority를 만들지 않음 |
| no shared surface | 변화 없음 |
| existing shared surface | membership/member cap/fan-out/reservation 유지 |
| no app-shell-spec | 새 required file/key/check 없음 |
| app-shell-spec adopted | additive typed state/readiness/ownership 적용 |
| custom layout/Tier3 | shell kind는 typed source; Tier3 deny claims는 intent에도 보존 |
| mode screen deny와 same-path Tier3 deny | mode claim만 waive; Tier3 claim 때문에 final deny |
| old vendored state reader | existing `screens`/`surfaces` shape 유지; unknown `app_shells` 무시 가능 |
| no global decision register/refs | 기존 local-only behavior 유지 |
| warning-first checks | hard/required CI로 자동 승격하지 않음 |

새 required CI check, dependency, release/version/tag 변경은 없다.

---

## 22. Migration

### 22.1 #222 visual task

기존 repository에는 자동 migration이 없다. intent를 쓰지 않으면 기존 결과가 유지된다.
새 visual task는 다음 절차를 사용한다.

1. visual/design input을 canonical input artifact로 만든다.
2. Contract v2 Reconciliation Item에 `Basis=visual-evidence`와 typed target을 기록하고
   summary row를 `reconciled`로 완료한다.
3. target ScreenSpec, Figma mapping, visual consistency contract를 읽는다.
4. `--screen ID --intent visual-refresh --input INPUT_ID` readiness를 실행한다.
5. concrete path마다 같은 evidence를 넣은 `--path` 결과를 확인한다.
6. screen/domain-component만 수정한다.
7. state/readiness/validate/visual-consistency와 target-aware backstop을 실행한다.
8. evidence/claim provenance를 Work Packet/Run Report에 복사한다.

v1 register를 자동으로 v2 승격하거나 synthetic visual item을 만들지 않는다.

### 22.2 #223 consumer adoption

1. global register의 기존 shell decision ID/status/options를 보존한다.
2. `app/shells/{shell}/shell-spec.md`를 draft로 작성한다.
3. known physical path마다 `path`와 `kind`를 명시하고 서로 겹치지 않게 한다.
4. shell API가 있으면 hook/api-client typed path와 same-shell API Candidate v2 owner를
   작성한다. Unknown tracking은 같은 shell artifact에 둔다.
5. canonical decision row를 `decision_refs`로 연결한다.
6. navigation-map topology와 visual contract policy는 pointer/reference로 연결하고
   duplicate truth를 제거한다.
7. 어떤 decision도 자동 resolve하지 않는다.
8. `workflow:state`를 재생성한다.
9. shell readiness, representative screen/shared readiness와 concrete paths를 확인한다.
10. validate와 target-aware forbidden-paths를 실행한다.

자동 migration이나 consumer 파일 대량 재작성은 하지 않는다.

---

## 23. Implementation Slices

### 23.1 Slice A — Issue #222

Scope:

- generic target/intent authorization context와 pure concrete helper substrate
- policy/Tier3 deny claim provenance와 claim-level waiver
- screen-only evidence-bound `visual-refresh`
- CLI `--intent` + `--input`
- shared visual evidence resolver using existing input/Register v2 parsers
- intent-aware `--path`
- implement-screen/Stage 06 contract
- Work Packet/Run Report evidence/claim provenance copy
- forward/backstop parity
- focused regressions

Explicit exclusion:

- app-shell artifact/parser/state/template/schema
- shell typed path/candidate implementation
- shared-surface 의미 변경
- #224 decision-log

Acceptance:

- no-intent behavior 유지
- api-integrated base mode 그대로
- valid reconciled v2 visual item required
- visual screen/domain-component only
- canonical mode screen deny만 explicit waive
- Tier3/literal/hook/API/client/candidate/delegated/generated deny 보존
- final-level decision cap 준수
- forward/backstop same result

### 23.2 Slice B — Issue #223

Depends on Slice A target/claim substrate.

Scope:

- app-shell-spec template/schema/manifest
- typed implementation path parser/analyzer
- generic candidate owner/target-specific surface resolver
- shell candidate tracking and deny-only provenance
- global ownership/conflict index
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
- typed kind is the only positive path taxonomy
- shell decision blocks shell only
- shell path cannot be edited through screen/shared
- valid same-shell candidate reaches intended API stages
- invalid/deferred/no-api candidates stay deny-only
- cross-target candidate/path overlap fails closed
- distribution payload contains all new active artifacts

### 23.3 No Slice 0

공통 helper는 Slice A의 실제 behavior와 함께 리뷰할 수 있다. behavior 없는 abstraction-only
선행 PR은 만들지 않는다.

---

## 24. File Impact Map

### Slice A expected files

| Area | Expected files |
|---|---|
| core | `scripts/readiness.mjs`, `scripts/lib/path-backstop.mjs`, target authorization helper if extracted |
| policy/layout provenance | `scripts/lib/layout-profile.mjs` and focused policy synthesis helpers/tests |
| reconciliation evidence | existing input/register/item parsers plus narrow shared resolver |
| backstop | `scripts/forbidden-paths.mjs` |
| execution artifacts | workflow packet/report model, callers/templates as required |
| skill/docs | implement-screen, Stage 06/08, visual/input reconciliation, task matrix, commands/doc ownership |
| tests | fixture-hook/API deferral/path-backstop/readiness CLI/report/packet/reconciliation focused files |

### Slice B expected files

| Area | Expected files |
|---|---|
| artifact | new app-shell template/reference/skill; manifest and frontmatter schema |
| analyzer/state | new app-shell analyzer; `workflow-state.mjs` |
| readiness | `readiness.mjs`, shared target authorization helper |
| candidate ownership | generic owner claim/index, target-specific surface resolver |
| ownership | shared-surfaces analyzer/index integration, path backstop |
| validate | `validate.mjs` and explicit structural checks |
| docs | Open Decisions, shared surfaces, visual reconciliation, Stage 05/06/08, matrix, doc ownership, commands |
| distribution | pack/distribution/upgrade planner manifests and tests |
| tests | new app-shell focused suite plus readiness/CLI/backstop/distribution regressions |

정확한 helper 파일명은 구현 관례에 맞출 수 있지만 public contract와 ownership 계산
순서는 변경하지 않는다.

---

## 25. Verification Matrix

### 25.1 #222

| # | Regression |
|---|---|
| 1 | api-integrated screen, no intent: screen remains forbidden |
| 2 | intent without `--input`, `--input` without intent, malformed input ID: exit 2 |
| 3 | v1/summary-only Register cannot authorize visual-refresh; base result unchanged |
| 4 | reconciled v2 row but no `Basis=visual-evidence` item: intent not applicable |
| 5 | visual item targets another screen/domain only: intent not applicable |
| 6 | valid reconciled visual item + visual-refresh: base mode stays api-integrated; screen/domain-component only |
| 7 | final-fixture-ui blocker denies visual-refresh |
| 8 | api-integrated-only blocker does not unnecessarily deny final-level visual work |
| 9 | missing final visual prerequisite fails closed |
| 10 | absorbed screen denied/non-applicable |
| 11 | malformed lifecycle/decision denied |
| 12 | delegated shared-surface path denied |
| 13 | reserved app-shell path denied when Slice B exists |
| 14 | active/deferred/conflict/non-owner candidate path denied |
| 15 | canonical api-integrated `{roles.screen}` deny claim is waived by valid intent |
| 16 | same resolved path has canonical mode claim + Tier3 `access.forbid`; Tier3 claim survives and denies |
| 17 | overlapping broader/narrower Tier3 deny survives even when screen mode claim is waived |
| 18 | literal custom policy deny is non-overrideable |
| 19 | custom layout/domain override resolves positive visual roles without losing claim origin |
| 20 | unknown/blank/invalid intent and selector combinations exit 2 |
| 21 | forward concrete result equals forbidden-paths result with same evidence/claims |
| 22 | contextless backstop cannot treat visual intent as authorized |
| 23 | Work Packet/Run Report copy evidence and claim provenance without recomputation |
| 24 | legacy/no-intent fixture output remains compatible |

### 25.2 #223

| # | Regression |
|---|---|
| 1 | no app-shell artifact keeps existing state/readiness/validate behavior |
| 2 | valid shell identity/typed path/state output deterministic |
| 3 | string-only/missing/unknown path kind rejected and permission 0 |
| 4 | overlapping typed shell entries rejected |
| 5 | `route-host` only opens at declared route-host modes |
| 6 | `shell-host` example path is classifiable without layout shell role and allowed at final |
| 7 | typed hook/api-client declaration without candidate remains denied |
| 8 | valid active same-shell hook candidate is allowed at rough/final seam |
| 9 | valid confirmed same-shell hook/api-client candidates permit api-integrated-ui entry |
| 10 | same-shell candidate inside matching typed path is subordinate, not conflict |
| 11 | candidate outside shell declaration or under wrong kind is invalid and deny-only |
| 12 | deferred/invalid shell candidate retains recoverable project-wide deny provenance |
| 13 | `api_required:false` shell gets no candidate authority |
| 14 | shell candidate ↔ screen candidate overlap fails both closed |
| 15 | shell candidate ↔ shared-surface candidate overlap fails closed |
| 16 | open shell decision caps shell target only |
| 17 | unrelated screen readiness unchanged |
| 18 | resolved ref remains provenance but does not block |
| 19 | missing/ambiguous/malformed ref fails shell closed only |
| 20 | zero-ref global row has no effect |
| 21 | local Open Decisions table rejected |
| 22 | domain/member/screen/route fields rejected |
| 23 | shell ↔ screen route_entry/screen_entry overlap rejected |
| 24 | shell ↔ shared surface overlap rejected |
| 25 | shell ↔ shell overlap rejected |
| 26 | shell ↔ generated output overlap rejected |
| 27 | ordinary implement-screen cannot edit shell path |
| 28 | shared-surface task cannot edit shell path |
| 29 | shell owner can edit only authorized declared/claimed shell path |
| 30 | empty implementation paths valid for authoring but permission 0 |
| 31 | custom Tier3 deny remains effective over typed shell-host path |
| 32 | state/readiness JSON ordering deterministic |
| 33 | selector mutual exclusion/invalid ID exit 2 |
| 34 | forward concrete result equals target-aware backstop result |
| 35 | distribution/pack/upgrade planner includes template/skill/reference |

Implementation PR은 focused matrix뿐 아니라 기존
`fixture-hook-mode-ladder`, `api-candidate-deferral`, `shared-surfaces`,
`open-decisions`, `readiness-cli`, `readiness-failopen`, `path-backstop`,
`distribution`, `upgrade-planner` 회귀를 실행한다.

---

## 26. Risks / Known Limits

1. **v2 evidence adoption cost.** legacy/v1 consumer는 visual-refresh capability를 얻기 전에
   명시적으로 Contract v2 visual item을 reconcile해야 한다. base behavior는 변하지 않는다.
2. **Typed shell authoring burden.** shell path kind를 author가 작성해야 하지만, 기본 layout에
   없는 shell host를 추론해 fail-open하는 것보다 안전하다.
3. **Diff target provenance.** contextless CI diff만으로 작업자의 intended target을 알 수
   없다. explicit owner path는 context 없이 허용하지 않는 보수적 fallback이 필요하다.
4. **Navigation reference precision.** 현재 navigation-map row에 stable edge ID가 없다.
   first slice는 route truth를 복제하지 않고 artifact/section pointer를 사용한다.
5. **Shell visual refresh.** #222 first slice intent는 screen-only다. shell visual refresh가
   필요하면 shell-specific evidence/profile을 별도 설계한다.
6. **Generic app-level targets.** 현재 공개 kit에서 app shell 외 여러 route-less target을
   즉시 generic화해야 할 강한 증거는 확인되지 않았다.
7. **Legacy broad authority.** no-adoption compatibility 때문에 legacy screens의 기존 broad
   behavior는 유지되지만 explicit shell/shared/generated/candidate/Tier3 reservation은
   항상 우선한다.
8. **Consumer metrics.** issue reporter의 수치는 private consumer observation이며 kit
   fixture 재현 결과가 아니다.
9. **Design-only validation.** 이 문서는 구현을 증명하지 않는다. implementation PR에서
   모든 focused/full regression과 distribution test가 필요하다.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity/order/formula를 유지한다. |
| D2 | explicit `--intent visual-refresh`는 `--input` reconciled v2 visual evidence에 바인딩한다. |
| D3 | deny는 origin/overrideability claim으로 보존하고 canonical api-integrated screen claim만 v1에서 waive한다. |
| D4 | visual-refresh는 screen/domain-component-only 독립 envelope를 쓴다. |
| D5 | dedicated optional `app-shell-spec`을 사용한다. |
| D6 | app-shell implementation path는 typed `path + kind` object array다. |
| D7 | 기존 6-column global decision + `decision_refs`로 shell-scoped cap을 만든다. |
| D8 | API Candidate owner를 `{target_type,target_id}`로 일반화하고 shell path kind와 연결한다. |
| D9 | 모든 implementation target이 global physical path ownership namespace를 공유한다. |
| D10 | #222를 먼저 구현하고 #223이 substrate를 소비한다. |
| D11 | no-intent/no-shell compatibility와 warning-first 정책을 보존한다. |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다. 다음은 public 의미를 바꾸지 않는 naming만
남는다.

- internal helper/module name
- exact diagnostic code prefix
- new app-shell reference/skill file의 최종 slug
- compatibility alias를 serializer 어느 위치에 둘지

다음은 허용된 implementation variation이 아니다.

- evidence 없는 intent bypass 추가
- Tier3/literal deny를 visual-refresh override 대상으로 확대
- shell path kind 자동 추론
- shell candidate를 가짜 screen/domain으로 표현
- app-shell을 generic app-surface로 확대
- Open Decision 6-column schema 변경

Baseline `49a3a31029293eae3fd6765f75e2b5520f939a93`에서 다음 계약을 읽어 설계 전제를
재검증했다.

- implementation mode policy와 readiness calculation
- workflow-state screen/shared aggregation
- Open Decision register/ref resolver
- shared-surface membership/readiness/path ownership
- concrete path/backstop/candidate authorization
- input artifact/Reconciliation Contract v2 typed item and target boundary
- navigation-map/visual-consistency/doc ownership boundaries
- implement-screen/implement-shared-surface Stage 06 contracts
- manifest/frontmatter/distribution impact
- #124/#210/#211의 해결 경계

설계 문서 정적 검증 항목:

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
- deny claim origin/overrideability와 Tier3 preservation 명시
- typed shell path taxonomy 명시
- generic candidate owner/tracking/surface rules 명시
- visual intent evidence binding과 no-bypass boundary 명시

이 설계 PR은 design-only다. branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
