# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; second review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-12  
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)  
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.
>
> 첫 리뷰 amendment는 deny claim provenance, typed shell path taxonomy,
> target-aware API Candidate ownership, reconciled visual input evidence를 도입했다.
> 두 번째 amendment는 no-API shell envelope, Contract v2 input-local trust,
> screen-정밀 visual-family evidence, malformed shell path의 deny-only reservation,
> deny claim schema의 `authored_path` 위치를 확정한다.

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
2. 진행 상태와 별도로 명시적 work intent를 도입한다.
3. 첫 public intent는 screen-only `visual-refresh`다.
4. `visual-refresh`는 자유로운 capability override가 아니다. 호출자는
   `--input <INPUT_ID>`를 함께 주고, 도구는 hard-trusted Reconciliation Contract v2
   visual item이 target screen에 실제로 연결됐는지 확인한다.
5. 모든 deny를 provenance-bearing claim으로 보존한다. `visual-refresh`가 waive할 수
   있는 것은 claim 자체가 `overrideable_by`로 명시한 canonical work-step deny뿐이다.
6. `visual-refresh`는 screen/domain-component만 여는 독립 최소 권한 envelope다.
7. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
8. app-shell `implementation_paths`는 `path + kind` typed declaration이다.
9. API Candidate owner를 `{target_type, target_id}`로 일반화한다.
10. `api_required:false` app shell은 API maturity에 도달해도 route/shell host 권한을
    잃지 않는 별도 no-API host envelope를 사용한다.
11. malformed이지만 안전하게 canonicalize 가능한 shell path는 positive authority를
    만들지 않되 project-wide deny-only reservation으로 남긴다.
12. 기존 6-column Open Decision register와 `decision_refs`를 재사용하고 shell decision은
    해당 shell만 제한한다.
13. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
    ownership namespace를 사용하고 deny가 항상 우선한다.
14. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222 substrate를 소비하되
    #222 의미를 다시 설계하지 않는다.

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

`api-integrated-ui`는 hook/API-client를 열고 screen을 금지한다. 이는 fixture hook의
public contract를 유지한 채 내부를 실제 API로 교체하는 동안 화면 JSX와 시각 구조를
바꾸지 않는 보호 계약이다.

### 2.3 Current deny provenance loss

현재 mode YAML deny와 Tier3 `layers[].access.forbid`는 최종적으로 같은
`forbidden_paths: string[]`에 합쳐진다. 합쳐진 뒤에는 다음을 구분할 수 없다.

- canonical mode가 작업 단계 보호를 위해 만든 screen deny
- consumer Tier3 architecture가 추가한 safety deny
- literal custom policy deny
- generated/candidate/other-owner reservation

따라서 path 문자열을 삭제하는 방식의 intent override는 금지한다. 구현은 path
resolution 전에 deny origin을 claim으로 보존해야 한다.

### 2.4 Reconciliation Contract v2 trust

현재 v2 analyzer는 deterministic hard diagnostics와 advisory warnings를 함께 계산한다.
내부적으로 canonical Summary trust와 `(Input ID, Item)` group trust를 이미 사용하지만,
public 반환은 `{ errors, warnings }`다. readiness가 `workflow:validate`의 선행 성공을
가정할 수 없으므로, intent evidence를 위해 별도 부분 Markdown parser를 만들면
Contract v2 hard rule의 일부를 놓칠 수 있다.

따라서 구현은 기존 v2 분석을 순수 trust-producing analyzer로 추출하고,
`validateReconciliationV2()`는 그 결과를 기존 public diagnostics shape로 투영한다.
readiness evidence resolver는 같은 analyzer의 trust 결과만 소비한다.

### 2.5 Visual family parsing boundary

현재 visual-consistency parser는 `Screen Families` 표의 `Family`와 `Member Screens`를
실제로 파싱할 수 있다. 반면 generic reconciliation target index의 row-key 해소만으로는
family row가 target screen을 포함하는지 증명하지 못한다.

따라서 visual contract를 intent evidence로 사용할 때 generic artifact/section/row
해소 뒤에 strict family-membership resolver를 추가한다. 이 resolver는 warning-first
visual-consistency CLI의 exit contract를 hard gate로 승격하지 않고, 오직 positive
intent permission을 fail closed한다.

### 2.6 Shared surfaces

`shared-surface-spec`은 다음 의미를 가진다.

- 같은 domain의 canonical screen 최소 2개
- 명시적 `member_screens`
- member screen minimum readiness cap
- decision member fan-out
- non-route uniform behavior
- narrow `implementation_paths`

ordinary member screen은 surface path를 `forbidden_paths`로 예약받고
`delegated_shared_surfaces` provenance를 노출한다. 이 의미는 변경하지 않는다.

### 2.7 Open Decisions

canonical global home은 `docs/frontend-workflow/global/open-decisions.md`이고 row schema는
다음 6개 column이다.

```text
ID | Decision Needed | Options | Blocking Mode | Owner | Status
```

`decision_refs`가 target과 row의 관계를 소유한다. global row는 zero-ref여도 valid하고,
referrer가 없으면 어떤 target도 막지 않는다. `open → resolved`는 사람 전용이다.

### 2.8 Current API Candidate owner boundary

현재 API Candidate v2의 positive authorization과 project conflict collection은 주로
ScreenSpec과 `screen_id`에 맞춰져 있다. Screen target은 domain/layout의
`{roles.hook}`/`{roles.api_client}`로 slice kind를 판정하고, `unknown:U-...`는 같은
ScreenSpec의 Unknown을 참조한다. domain과 screen identity가 없는 app shell에는 이
규칙을 그대로 적용할 수 없다.

### 2.9 Existing fixes and remaining gaps

- #124는 `api_required:false` 화면에서 API mode 도달 후 non-API 화면 경로가 잠기는
  특수 사례를 해결했다.
- #210은 API Candidate v2의 per-slice deferral과 ownership을 만들었다.
- #211은 fixture mode에서 owned hook slice를 열되 `api-integrated-ui`의 screen 불변을
  유지했다.
- #222는 maturity와 작업 종류를 분리하는 일반 authorization 축이 아직 없다는 문제다.
- #223은 shell target/path/decision owner가 없다는 문제다.
- app shell에도 #124와 대칭인 no-API host preservation이 필요하다.

---

## 3. Reproduced Failure Modes

### 3.1 #222 — mature screen에 visual 작업 권한이 없음

공개 kit 기준으로 다음을 확인했다.

1. `readiness_mode`는 `min(fact_mode, decision_cap)`으로 결정된다.
2. 선택된 mode 하나의 path envelope가 기본 권한이 된다.
3. `final-fixture-ui`에서는 screen/domain-component/hook이 열릴 수 있다.
4. `api-integrated-ui`에서는 hook/API-client가 열리고 screen이 forbidden이다.
5. 별도 visual intent/profile이 없다.
6. 실제 미결이 없는 Open Decision을 reopen해 mode를 낮추면 maturity와 gate provenance를
   거짓으로 만든다.
7. evidence 없는 `--intent`만 추가하면 API 배선 작업이 screen deny를 피하는 capability가
   될 수 있다.
8. flattened deny path에서 `{roles.screen}` 문자열을 지우면 Tier3/custom deny를 함께
   삭제할 수 있다.

따라서 visual 작업을 표현하는 축뿐 아니라 source evidence와 deny claim provenance가
동시에 필요하다.

Issue reporter가 제시한 consumer 수치(예: 17/35)는 private consumer 실측이며 공개 kit
재현 사실과 구분한다.

### 3.2 #223 — shell decision과 path owner가 없음

공개 kit 기준으로 다음을 확인했다.

1. `navigation-map`은 route topology 정본이지만 implementation target이 아니다.
2. `visual-consistency-contract`는 visual ownership 정본이지만 readiness hard gate가 아니다.
3. `shared-surface-spec`은 domain, 최소 2 member, member cap, decision fan-out을 전제로 한다.
4. global register의 zero-ref row는 valid하지만 target을 막지 않는다.
5. 현재 state에는 `screens`와 선택적 `surfaces`만 있고 app shell index가 없다.
6. ordinary screen에는 global shell path를 예약할 owner가 없다.
7. 기본 layout role에는 app-shell host가 없으므로 path를 role inference로 안전하게
   분류할 수 없다.
8. screen-centric API Candidate owner shape는 domainless shell candidate를 표현하지 못한다.
9. malformed shell declaration을 positive index에서 단순 제거하면 production-ready
   screen의 `src/**`가 해당 path를 우회할 수 있다.
10. `api_required:false` shell이 API maturity에 도달했을 때 host path를 동결하고
    candidate authority도 제거하면 effective authority가 0이 된다.

Issue reporter가 제시한 ScreenSpec/shared-surface 개수는 consumer 실측이며 공개 kit
재현 사실과 섞지 않는다.

---

## 4. Goals

- readiness maturity와 현재 작업 종류의 권한을 분리한다.
- `api-integrated-ui` 이상 화면에서 hard-trusted reconciled visual evidence에 바인딩된
  refresh를 정상 경로로 허용한다.
- API 배선 작업 중 screen 불변을 tool-level invariant로 유지한다.
- intent가 waive할 수 있는 deny와 절대 보존할 deny를 provenance로 구분한다.
- app shell을 route-less/global 1급 implementation target으로 만든다.
- app-shell path kind를 author가 명시하고 validator가 deterministic하게 검사한다.
- shell API Candidate를 generic target owner 모델에 연결한다.
- no-API shell이 API maturity에서 host path를 잃지 않게 한다.
- malformed shell owner가 다른 target의 권한을 넓히지 않게 한다.
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
- path 문자열만 비교해 safety deny 삭제
- v1/summary-only register를 visual intent authority로 사용
- visual-consistency warning 전체를 hard validate gate로 승격
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
| register trust | v2 register의 global 구조가 hard-valid인지 나타내는 분석 결과 |
| input trust | 특정 input의 summary/item/projection/ref/provenance가 hard-valid인지 나타내는 결과 |
| group trust | 특정 `(Input ID, Item)` effect group 전체가 hard-valid인지 나타내는 결과 |
| authorization profile | target와 intent에 따른 독립 path envelope |
| base readiness | intent 없는 기존 `readiness_mode`와 path 결과 |
| implementation target | screen, shared surface, app shell처럼 path owner가 될 수 있는 대상 |
| deny claim | resolved path와 authored token, origin, class, overrideability를 보존한 구조화 deny |
| waived claim | intent predicate가 claim 자체의 명시적 허용에 따라 무시한 deny; 삭제된 claim이 아님 |
| safety deny | intent가 override할 수 없는 Tier3/generated/ownership/candidate/literal deny |
| reservation | 다른 target의 broad allowance보다 우선하는 explicit deny |
| deny-only ownership | positive owner authority 없이 다른 target만 차단하는 recoverable claim |
| target-scoped decision | referrer target만 cap하고 unrelated target에는 fan-out하지 않는 decision |
| shell path kind | `route-host|shell-host|hook|api-client` 중 author가 명시한 app-shell path 의미 |
| candidate owner | `{target_type, target_id}`로 표현하는 API Candidate ownership identity |
| subordinate slice | 같은 target의 typed hook/API-client path보다 더 좁은 candidate ownership |
| no-API host envelope | no-API shell이 API maturity 이상에서도 route/shell host를 유지하는 profile |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. intent는 호출자가 명시하며 자동 추론하지 않는다.
4. `visual-refresh`는 hard-trusted Contract v2 evidence 없이는 positive permission을
   만들지 않는다.
5. readiness evidence resolver는 별도 부분 parser가 아니라 Contract v2 analyzer의 trust
   결과를 소비한다.
6. Reconciliation Item에는 별도 완료 상태가 없음을 전제로 한다. visual evidence item의
   허용 effect는 실제 enum인 `update|create`다.
7. intent는 base allowed path의 누적 합집합이 아니다.
8. deny는 문자열이 아니라 origin을 가진 claim으로 판정한다.
9. claim은 `overrideable_by`에 현재 intent가 명시되고 exact waiver predicate를 통과할
   때만 waive할 수 있다.
10. `authored_path`는 deny claim top-level canonical field다. waiver predicate도
    `claim.authored_path`를 검사한다.
11. 같은 concrete file이 waived claim과 non-waivable claim에 동시에 매치되면 deny한다.
12. Tier3 layer deny, literal custom deny, generated, other owner, candidate deny는 절대
    waive하지 않는다.
13. concrete forward check와 diff backstop은 같은 evidence resolver와 claim-aware helper를
    소비한다.
14. Work Packet/Run Report는 authorization provenance를 재계산하지 않는다.
15. generated/do-not-edit ownership을 어떤 target도 우회하지 못한다.
16. explicit 다른 owner와 path가 겹치면 fail closed한다.
17. malformed owner declaration이 다른 target의 authority를 넓히지 않는다.
18. app shell decision은 screen/shared-surface readiness에 fan-out하지 않는다.
19. shared-surface member/cap/fan-out 의미는 유지한다.
20. `api_required:false` target은 API Candidate authority를 얻지 않는다.
21. no-API app shell은 API maturity에서 host authority를 잃지 않는다.
22. intent가 없는 기존 실행은 기존 의미와 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode `allowed_paths` union | reject | 작업 종류를 구분하지 못하고 API mode의 screen 불변을 무력화한다. |
| `api-integrated-ui`에서 screen forbidden 제거 | reject | 모든 API 배선 작업에 screen mutation을 연다. |
| scalar mode `visual-refresh` 삽입 | reject | maturity와 task kind를 다시 한 사다리에 섞는다. |
| Open Decision reopen으로 final mode 강등 | reject | 실제 maturity와 gate provenance를 거짓으로 만든다. |
| evidence 없는 explicit intent | reject | caller 규율만 남아 tool-level invariant가 아니다. |
| Contract v2 부분 parser | reject | hard rule 일부 누락과 validate/readiness drift를 만든다. |
| input-local trust index 재사용 | adopt | unrelated input 오류와 global 구조 오류를 구분하면서 같은 hard 계약을 소비한다. |
| flattened deny path 문자열 삭제 | reject | 동일/중첩 Tier3/custom deny를 구분하지 못한다. |
| provenance-bearing deny claim | adopt | origin과 overrideability를 deterministic하게 판정한다. |
| shell path kind를 layout/name에서 추론 | reject | 기본 preset에 shell role이 없고 unknown layer를 fail-open할 수 있다. |
| typed shell path declaration | adopt | author가 path 의미를 명시하고 validator가 exact하게 검사한다. |
| malformed shell path를 index에서 제거 | reject | 다른 target의 broad authority가 shell path를 우회한다. |
| recoverable malformed path deny-only | adopt | positive authority 없이 fail-open을 막는다. |
| shared-surface `scope: global` | reject | domain/member/member-cap/fan-out 의미를 흐린다. |
| dedicated `app-shell-spec` | adopt | shell identity, decisions, readiness, ownership을 좁게 만든다. |
| generic `app-surface-spec` | reject for first slice | 확인된 요구보다 범위를 넓힌다. |
| navigation-map을 implementation target으로 승격 | reject | route topology와 mutable code ownership을 결합한다. |
| global decision row에 path/target column 추가 | reject | referrer가 scope를 소유하므로 기존 schema 변경이 불필요하다. |

---

## 9. Decision D1 — Readiness Maturity 유지

### 9.1 Formula

화면과 shell의 base maturity는 다음 공식을 공유한다.

```text
fact_idx       = target fact profile이 연속으로 만족하는 최고 mode index
decision_idx   = target에 적용된 open decision의 최저 Blocking Mode index - 1
readiness_idx  = min(fact_idx, decision_idx)
readiness_mode = order[readiness_idx]
```

malformed lifecycle/decision/policy/target contract는 기존과 같이 fail closed한다.

### 9.2 Base output ownership

intent가 있어도 top-level 다음 필드는 base maturity를 계속 뜻한다.

```text
readiness_mode
next_mode
allowed_paths
forbidden_paths
blocking
next_actions
```

`visual-refresh` 요청 때문에 `readiness_mode`를 `final-fixture-ui`로 거짓 출력하지 않는다.
intent 결과는 별도 `work_intent` 구조에 둔다.

### 9.3 Decision levels

```text
intent_prerequisite_pass =
  fact_idx >= required_idx
  AND decision_cap_idx >= required_idx
  AND target structural state valid
```

`final-fixture-ui`를 막는 decision은 visual refresh를 막는다. `api-integrated-ui` 진입만
막는 decision은 final-level visual 작업을 불필요하게 막지 않는다.

### 9.4 Path profile is not maturity

동일 readiness mode라도 target facts에 따라 effective path profile이 달라질 수 있다.
대표 사례는 `api_required:false` app shell의 `no-api-host` profile이다. 이 profile은
readiness mode를 낮추지 않고 non-API host authority만 보존한다.

---

## 10. Decision D2 — Explicit Work Intent와 Evidence Trust

### 10.1 Public contract

첫 public contract는 다음이다.

```text
CLI flags:       --intent visual-refresh --input <INPUT_ID>
target:          --screen only
internal term:   work intent / authorization profile
```

첫 slice에서 intent는 `--surface`나 `--app-shell`과 함께 사용할 수 없다.

### 10.2 No inference and no bypass

다음은 intent를 자동 활성화하지 않는다.

- Figma mapping 존재
- mapping/status timestamp
- 최근 input `captured_at`
- source type 또는 파일명에 figma/design 포함
- current mode가 api-integrated 이상

첫 slice에는 evidence 검사를 우회하는 flag, config, environment variable이 없다.

### 10.3 Contract v2 analyzer extraction

구현은 현재 v2 validator의 parsing/routing/projection 로직을 다음 순수 analyzer로
추출한다. 정확한 함수명은 구현 관례에 맞출 수 있으나 의미와 반환 trust는 고정한다.

```text
analyzeReconciliationContractV2({
  register,
  registerFile,
  inputArtifacts,
  targetIndex
}) -> {
  errors,
  warnings,
  trust: {
    register_trusted,
    summaries_by_input,
    groups_by_key,
    inputs_by_id
  }
}
```

`validateReconciliationV2()`는 analyzer를 호출하고 기존 `{errors,warnings}` shape만
반환한다. 기존 validate message prefix/order/exit contract는 유지한다.

Analyzer 내부 diagnostic은 public message 외에 최소 다음 metadata를 가진다.

```yaml
severity: hard | advisory
code: RR-SCHEMA-019
input_id: IN-20260811-figma-003   # 해당 시
item_id: RI-VISUAL-003            # 해당 시
group_key: IN-...\u0000RI-...     # 해당 시
scope: register | input | group | row | projection
```

metadata는 readiness trust 계산용이며 기존 public JSON shape를 깨지 않아도 된다.

### 10.4 Register trust

`register_trusted=true`는 다음 global hard contract 전체가 통과할 때만 가능하다.

- `reconciliation_contract: 2`
- required review profile과 structured timestamp
- canonical Summary 표 정확히 1개, exact 8-column header
- `## Reconciliation Items` heading 정확히 1개
- canonical item 표 정확히 1개, exact 10-column header
- v1 parser와 canonical Summary source table 불일치 없음
- register-wide `RR-SCHEMA-0xx` hard error 없음

register trust가 false면 모든 intent evidence는 `applicable:false`다.

### 10.5 Input and group trust

Analyzer는 다음 구조를 제공한다.

```yaml
inputs_by_id:
  IN-20260811-figma-003:
    summary_trusted: true
    projection_trusted: true
    hard_error_codes: []
    group_keys:
      - "IN-20260811-figma-003\u0000RI-VISUAL-003"

groups_by_key:
  "IN-20260811-figma-003\u0000RI-VISUAL-003":
    input_id: IN-20260811-figma-003
    item_id: RI-VISUAL-003
    basis: visual-evidence
    classification: simple-update
    effects:
      - update
    group_trusted: true
    rows: []
```

`summary_trusted`는 해당 input summary가 unique하고 grammar/status/ref가 hard-valid일 때만
true다. `projection_trusted`는 classification multiset, Touched Artifacts,
Created Items projection을 포함한 input-local hard projection이 모두 valid할 때만 true다.

`group_trusted`는 그룹의 모든 row와 group-level routing이 hard-valid할 때만 true다.
최소 포함 범위:

- 모든 10-column 값/enum/문법
- duplicate effect row 방지
- Basis/Classification group 일관성
- Basis→Classification→Effect→Target routing
- target/evidence exact resolution
- Source Ref/Source Unit/Captured At provenance
- visual precision floor
- group-level required target
- 해당 group의 `RR-ITEM/RR-REF/RR-ROUTE/RP-0xx` hard error 없음

### 10.6 Input-local hard validity

```text
input_trusted(input) =
  register_trusted
  AND canonical input artifact unique
  AND summary_trusted
  AND summary Reconcile Status == reconciled
  AND projection_trusted
  AND selected group_trusted
  AND no selected-input hard diagnostic with prefix
      RR-SCHEMA / RR-ITEM / RR-REF / RR-ROUTE / RP
```

register-global hard error는 모든 input을 막는다. 다른 input에만 귀속된 hard error는
선택한 input의 trust를 자동으로 낮추지 않는다. advisory `*-1xx` warning은 일반적으로
intent를 막지 않지만, 아래 strict visual-family resolver가 발견한 target ambiguity는
positive intent permission을 막는다.

### 10.7 Selected visual item semantics

Reconciliation Item에는 별도 완료/진행 상태 필드가 없다. 따라서 이전 문구인
“completed item/effect”는 사용하지 않는다.

선택 가능한 visual group은 다음과 같다.

```text
group_trusted == true
Basis == visual-evidence
Classification == simple-update
모든 effect row의 Effect ∈ { update, create }
최소 1개의 effect row 존재
```

Summary의 `Reconcile Status=reconciled`가 input reconciliation 완료 상태를 소유하고,
item `Effect=update|create`는 역사적 적용 행위를 소유한다.

### 10.8 Evidence resolver

```text
loadIntentEvidence({ inputId, screenId, analyzerTrust, targetIndex, visualFamilyIndex })
```

positive evidence는 다음 전체를 만족한다.

1. canonical input artifact가 정확히 하나다.
2. register와 selected input이 §10.4–10.7 trust를 만족한다.
3. unique reconciled Summary row가 있다.
4. 최소 1개의 trusted `visual-evidence` group이 있다.
5. 그 group의 trusted `update|create` row 중 최소 1개가 §10.9 target relation을 만족한다.
6. authored `affected_screens`가 있으면 selected screen을 exact 포함한다.

v1/summary-only register, missing item, wrong target, malformed references,
`not-started|in-progress|failed` summary는 keyed `applicable:false`와 permission 0이다.

### 10.9 Screen-precise target relations

#### A. ScreenSpec visual section

- target artifact는 selected active ScreenSpec이다.
- whole artifact target은 불충분하다.
- existing visual-allowed section slug를 명시해야 한다.
- behavior section target은 기존 RR-ROUTE hard rule대로 거부한다.

#### B. Sibling Figma mapping

- target artifact type은 `figma-component-mapping`이다.
- artifact identity가 unique하다.
- frontmatter `screen_id`가 selected canonical Screen ID와 exact 일치한다.

#### C. Visual consistency family row

Target은 반드시 다음 정밀도를 가진다.

```text
artifact:<visual-contract-artifact-id>#screen-families/<family-key>
```

다음은 불충분하다.

```text
artifact:<id>
artifact:<id>#screen-families
부분 문자열 row key
```

strict resolver 계약:

```text
visual contract artifact unique
AND artifact_type == visual-consistency-contract
AND canonical Screen Families table exactly one
AND target.section == screen-families
AND target.rowKey present
AND Family cell exact trimmed value == target.rowKey
AND matching family row exactly one
AND Member Screens cell is structurally valid
AND canonical Screen IDs are unique
AND selected screen is an exact member
```

Family duplicate, duplicate family table, missing/placeholder family, malformed/duplicate
Member Screens, unresolved screen ID는 intent evidence에 대해 fail closed한다. 이는
`workflow:visual-consistency`의 warning-first exit contract를 hard로 승격하지 않는다.
오직 해당 visual item이 positive capability evidence로 사용되지 못하게 한다.

#### D. Explicit exclusions

다음 visual-evidence target은 general reconciliation routing에는 valid할 수 있어도
`visual-refresh` 권한 evidence로는 불충분하다.

- component-gap-register row만 target
- visual contract whole artifact/section only
- unrelated family row
- domain-level prose without selected screen relation

### 10.10 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260811-figma-003
    reconciliation_status: reconciled
    register_trusted: true
    input_trusted: true
    item_groups:
      - item_id: RI-VISUAL-003
        group_trusted: true
        effects: [update]
        target_relation:
          kind: visual-family
          family: Create Flow
          screen_id: CREATE-ATTACH
```

forward CLI, Work Packet, Run Report와 diff backstop은 이 context를 복사하고 다시
추론하지 않는다.

---

## 11. Decision D3 — `visual-refresh` Authorization과 Deny Claims

### 11.1 Applicability

`visual-refresh`는 다음을 모두 만족하는 active screen에만 적용한다.

```text
target exists
AND readiness_applicable !== false
AND lifecycle valid and not absorbed
AND fact_idx >= index(final-fixture-ui)
AND decision_cap_idx >= index(final-fixture-ui)
AND final visual prerequisites satisfied
AND evidence.input_trusted == true
AND selected visual target relation valid
```

`intent_required_mode`는 `final-fixture-ui`다. base maturity가
`api-integrated-ui` 또는 `production-ready`여도 그대로 보존한다.

### 11.2 Deny claim canonical schema

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
  overrideable_by:
    - visual-refresh
```

`authored_path`는 claim top-level 필드다. 모든 문서, JSON, helper predicate가
`claim.authored_path`를 사용한다. `source.authored_path`는 사용하지 않는다.

`path`는 resolved physical glob이며 `authored_path`는 resolution 이전 token/literal이다.
같은 resolved glob이어도 source와 authored form이 다른 claim은 별개다.

### 11.3 Claim sources

최소 source kind:

```text
mode-policy
tier3-layer
custom-policy
intent-profile
shared-surface-reservation
app-shell-reservation
screen-entry-reservation
generated-output
api-candidate
lifecycle
open-decision
target-contract
```

### 11.4 Exact waiver predicate

```text
waivableByVisualRefresh(claim) =
  claim.source.kind == mode-policy
  AND claim.source.field == forbidden_paths
  AND claim.source.mode == api-integrated-ui
  AND claim.authored_path == "{roles.screen}"
  AND claim.source.role == screen
  AND claim.deny_class == work-step-boundary
  AND claim.overrideable_by contains visual-refresh
```

predicate는 actual claim object에 대해 테스트한다. projected `forbidden_paths` 문자열을
입력으로 사용하지 않는다.

다음은 절대 waive되지 않는다.

- Tier3 `layers[].access.forbid`
- literal/compound custom policy deny
- hook/API-client intent-profile deny
- shared/app-shell/screen-entry/other-owner reservation
- generated/do-not-edit ownership
- active/deferred/conflict/non-owner/invalid API candidate deny
- lifecycle/decision/contract safety deny

### 11.5 Independent positive envelope

```text
intent_allowed_candidates = resolve([
  "{roles.screen}",
  "{roles.domain_component}"
])
```

hook/API-client, delegated shared path, reserved app-shell path, generated path,
other target path, 모든 candidate path는 intent deny claim이다.

### 11.6 Effective formula

```text
matching_claims(file) = all deny claims whose path matches file
waived_claims(file)   = matching claims satisfying exact waiver predicate
active_denies(file)   = matching_claims(file) - waived_claims(file)

concrete_allowed(file) =
  intent_applicable
  AND matches(intent_allowed_candidates)
  AND active_denies(file).length == 0
```

waived claim은 결과 provenance에 남는다. 하나의 Tier3 claim이라도 같은 path에 남으면
최종 deny다.

### 11.7 Output

```yaml
work_intent:
  name: visual-refresh
  input_id: IN-20260811-figma-003
  applicable: true
  required_mode: final-fixture-ui
  allowed_paths:
    - src/features/create/screens/**
    - src/features/create/components/**
  deny_claims:
    - claim_id: deny:intent-profile:hook:0
      path: src/features/create/hooks/**
      authored_path: "{roles.hook}"
      deny_class: intent-boundary
      source: { kind: intent-profile, intent: visual-refresh, role: hook }
      overrideable_by: []
  waived_claims:
    - claim_id: deny:mode-policy:api-integrated-ui:screen:0
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
```

여러 shell을 허용한다. identity와 physical path는 전역적으로 disjoint해야 한다.

### 12.2 Identity

```text
shell_id pattern: ^[A-Za-z0-9][A-Za-z0-9_-]*$
artifact_id: globally unique existing artifact namespace
shell_id: globally unique app-shell namespace
```

동일 `shell_id` 또는 `artifact_id`가 둘 이상이면 어느 record도 positive owner로
선택하지 않는다. 모든 recoverable path는 §15의 deny-only ownership으로 보존한다.

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

`implementation_paths`가 없거나 빈 배열이면 authoring artifact로 valid할 수 있지만
code permission은 0이다.

### 12.4 Typed implementation paths

```yaml
---
artifact_id: MAIN-SHELL-app-shell-spec
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
status: confirmed
api_required: false
implementation_paths:
  - path: src/app/_layout.tsx
    kind: route-host
  - path: src/components/app-shell/host/**
    kind: shell-host
  - path: src/features/app-shell-runtime/hooks/**
    kind: hook
  - path: src/api/app-shell/**
    kind: api-client
decision_refs:
  - D-SHELL-001
---
```

허용 kind:

```text
route-host
shell-host
hook
api-client
```

kind는 layout role, 디렉터리 이름 또는 “hook/API-client가 아닌 나머지”로 추론하지
않는다. typed declaration이 canonical positive taxonomy다.

### 12.5 Invalid typed entries

다음은 shell target contract hard error다.

- string-only entry
- missing/non-string path
- missing/unknown kind
- duplicate path
- typed entry 간 overlap
- unsafe/noncanonical/unsupported/broad path

하나라도 있으면 해당 shell의 positive code permission은 0이다. 그러나 recoverable path
reservation은 §15에 따라 project-wide로 유지한다.

### 12.6 Forbidden identity fields

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

route group 또는 screen 집합과의 관계는 navigation reference로 표현하며 readiness
fan-out membership으로 사용하지 않는다.

### 12.7 Body ownership

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

### 12.8 Canonical ownership split

| Concern | Canonical owner |
|---|---|
| tabs/stacks/modals topology, route guard, deep link, cross-domain edge | navigation-map |
| screen family, logo/header/CTA visual policy and exceptions | visual-consistency-contract |
| shell host behavior/state/interaction, narrow physical paths, target readiness/decisions | app-shell-spec |
| screen identity/local behavior/local route transition | ScreenSpec |
| same-domain member-uniform behavior | shared-surface-spec |

shell interaction이 route 이동을 유발할 때 app-shell-spec은 route string/edge를 복제하지
않는다. `Navigation References`는 canonical navigation-map artifact/section을 가리키고
shell은 trigger/host output만 소유한다.

### 12.9 Shell fact profile

additive target profile `app-shell-v1`:

| Mode | Target-specific minimum fact |
|---|---|
| docs-only | artifact 발견/파싱 결과만; code 권한 0 |
| route-skeleton | valid identity + status ≥ draft + navigation-map status ≥ draft |
| screen-skeleton | Purpose/Host Contract/Implementation Boundary complete + non-empty valid typed paths |
| rough-fixture-ui | shell State Matrix와 non-route Interaction Matrix complete |
| final-fixture-ui | shell status ≥ confirmed + Visual Ownership complete |
| api-integrated-ui | `api_required:false` 또는 valid confirmed actionable same-shell API Candidate contract |
| production-ready | 기존 CI/schema/state/review facts |

`figma_mapping_status`와 `fake_hook_exists`를 neutral true로 넣지 않는다.

### 12.10 Normal shell path envelope

`api_required !== false`인 shell:

| Mode | Positive path kinds |
|---|---|
| docs-only | none |
| route-skeleton | route-host |
| screen-skeleton | route-host, shell-host |
| rough-fixture-ui | route-host, shell-host, valid owned active hook candidate slice |
| final-fixture-ui | route-host, shell-host, valid owned active hook candidate slice |
| api-integrated-ui | valid owned active hook/API-client candidate slices only; host frozen |
| production-ready | declared host paths + valid owned active candidate slices; unowned hook/API-client denied |

모든 positive path는 typed declaration 안에 있어야 하고 deny claim precedence를 받는다.

### 12.11 No-API host envelope

`api_required:false` shell은 API Candidate 없이 `api-integrated-ui` fact를 만족할 수 있다.
이때 normal API envelope를 적용하면 host와 candidate 모두 닫혀 authority가 0이 되므로,
readiness mode는 유지하되 다음 effective profile을 사용한다.

```text
if shell.api_required == false
AND readiness_idx >= index(api-integrated-ui):
  effective_path_profile = no-api-host
```

```text
no_api_allowed =
  every valid declared route-host path
  ∪ every valid declared shell-host path

no_api_denied =
  every typed hook path
  ∪ every typed api-client path
  ∪ every active/deferred/invalid/conflict candidate path
  ∪ generated/Tier3/custom/other-owner/contract deny claims
```

이 profile은 `production-ready`에서도 유지한다. `api_required:false`가 선언된 shell은
production maturity가 broad hook/API authority를 만들지 않는다.

```yaml
MAIN-SHELL:
  target_type: app-shell
  api_required: false
  readiness_mode: api-integrated-ui
  effective_path_profile: no-api-host
  allowed_paths:
    - src/app/_layout.tsx
    - src/components/app-shell/host/**
  forbidden_paths:
    - src/features/app-shell-runtime/hooks/**
    - src/api/app-shell/**
```

route/shell host는 계속 editable하고 hook/API-client/candidate는 계속 denied다.

---

## 13. Decision D5 — Target-aware API Candidate Ownership

### 13.1 Canonical owner

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

기존 screen output의 `screen_id`는 compatibility alias로 유지할 수 있으나 internal
ownership/conflict key는 generic owner다.

### 13.2 Surface kind resolver

- screen: 기존 domain/layout `{roles.hook}`/`{roles.api_client}` resolver
- app-shell: exactly one containing typed `hook|api-client` declaration
- shared-surface: 기존 surface candidate parsing을 유지하고 generic conflict index 참여

app shell은 domain role을 요구하지 않는다. typed declaration이 surface kind source다.

### 13.3 Tracking

`unknown:U-...`는 같은 ScreenSpec이 아니라 같은 owner artifact의 canonical Unknown을
참조한다.

```text
screen         → same ScreenSpec
shared-surface → same surface-spec
app-shell      → same shell-spec
```

### 13.4 Positive authority

same-shell candidate가 positive authority를 가지려면:

```text
owner == selected app-shell
contract valid
confidence == confirmed
gate == active
slice fully contained by exactly one typed hook/api-client path
surface_kind matches typed kind
cross-target conflict 없음
api_required != false
```

### 13.5 Deny-only candidate provenance

다음은 positive authority를 만들지 않고 recoverable canonical path를 project-wide deny로
보존한다.

- deferred/invalid tracking
- invalid candidate table/row
- typed declaration 밖 path
- kind mismatch/ambiguous containment
- cross-target overlap
- `api_required:false` concrete candidate

### 13.6 Cross-target conflicts

conflict index는 모든 조합을 검사한다.

```text
screen ↔ screen
screen ↔ shared-surface
screen ↔ app-shell
shared-surface ↔ shared-surface
shared-surface ↔ app-shell
app-shell ↔ app-shell
```

same-owner subordinate candidate만 parent typed path와 conflict가 아니다.

---

## 14. Decision D6 — Target-scoped Open Decisions

### 14.1 Existing schema reuse

새 decision home이나 column을 만들지 않는다.

- canonical row: `global/open-decisions.md`
- app-shell-spec: `decision_refs`
- lifecycle: `open|resolved`
- `open → resolved`: 사람 전용
- `Blocking Mode`: 기존 mode order 이름

### 14.2 Scope

```text
shell decision application =
  canonical row
  + app-shell-spec decision_refs provenance
```

open row는 해당 shell의 decision cap과 path/next action만 제한한다. unrelated screen,
shared-surface member cap, 다른 shell에는 영향을 주지 않는다.

### 14.3 Malformed cases

- resolved ref는 provenance에 남지만 block하지 않는다.
- missing/ambiguous/malformed row/ref/register는 해당 shell만 docs-only로 fail closed한다.
- duplicate ref in one shell은 malformed다.
- duplicate shell identity는 어느 shell record도 selected-success로 만들지 않는다.
- first slice에서 app-shell-spec 외 artifact는 shell-scoped decision referrer가 아니다.

---

## 15. Decision D7 — Global Path Ownership, Recovery, Reservation

### 15.1 One physical namespace

다음 owner를 하나의 project-relative POSIX namespace에 index한다.

```text
ScreenSpec route_entry/screen_entry
shared-surface implementation_paths
app-shell typed implementation_paths
API Candidate explicit Slice Paths
generated/do_not_edit outputs
```

### 15.2 Normal path grammar

shell path는 exact project-relative POSIX path 또는 좁은 terminal `/**`다.
absolute/drive/UNC/root escape, arbitrary/middle wildcard, blanket project/src/docs ownership은
positive declaration으로 거부한다.

### 15.3 Recovery classification

모든 authored shell path row는 positive parsing과 별개로 ownership recovery를 시도한다.

```text
A. valid typed entry
   → normal app-shell ownership reservation
   → shell positive authority 후보

B. contract-invalid but safely recoverable path
   → deny-only ambiguous-app-shell ownership
   → shell positive authority 0
   → screen/shared/other-shell context 모두 deny

C. trustworthy project-relative target를 만들 수 없음
   → no physical claim
   → hard contract error
```

### 15.4 Safely recoverable

다음 전체를 만족하면 recoverable하다.

```text
raw path is a string
canonical project-relative path can be derived deterministically
canonical result does not escape project root
canonical result is exact or one terminal /** pattern
canonical result is narrower than forbidden blanket roots
physical matcher can represent it unambiguously
```

예:

- missing/unknown kind이지만 path는 canonical narrow
- duplicate typed path
- same-shell typed entry overlap
- duplicate shell identity 아래의 canonical path
- backslash, redundant `./`, empty segment, in-tree `..`가 canonical narrow path로
  안전하게 수렴하는 alias

다음은 recoverable하지 않다.

- POSIX absolute
- Windows drive absolute/relative
- UNC
- root escape
- arbitrary/middle wildcard
- project/src/docs blanket ownership
- missing/non-string path

### 15.5 Deny-only claim shape

```yaml
deny_claim:
  claim_id: deny:ambiguous-app-shell:MAIN-SHELL:0
  path: src/components/app-shell/**
  authored_path: src/components/app-shell/**
  deny_class: ambiguous-owner
  source:
    kind: app-shell-reservation
    shell_id: MAIN-SHELL
    contract_valid: false
    reason: missing-path-kind
  overrideable_by: []
  owner:
    target_type: app-shell
    target_id: MAIN-SHELL
```

### 15.6 Duplicate identities and aliases

- duplicate `shell_id`/`artifact_id`: 모든 record의 recoverable path를 deny-only로 보존
- canonicalized aliases가 같은 path로 수렴: 해당 path를 deny-only로 보존
- typed entries가 overlap: overlap에 참여한 모든 recoverable path를 deny-only로 보존
- one record를 first-wins/last-wins로 positive 선택하지 않음

### 15.7 Cross-owner overlap

Hard conflict:

- shell ↔ screen route_entry/screen_entry
- shell ↔ shared surface
- shell ↔ another shell
- shell ↔ generated output
- shell ↔ API Candidate owned by another target

same-shell valid candidate slice만 typed hook/API-client path의 subordinate ownership이다.

### 15.8 Reservation projection

ordinary screen과 shared-surface authorization에 valid/deny-only shell reservation을 모두
투영한다.

```yaml
reserved_app_shell_paths:
  - path: src/components/app-shell/**
    owner_state: deny-only
    shell_id: MAIN-SHELL
    reason: missing-path-kind
```

app-shell target에는 screen/shared/other-shell/generated ownership을 반대로 예약한다.

### 15.9 Deny precedence

```text
authorized(file) =
  positive target/profile match
  AND no active deny claim
  AND no generated deny
  AND no lifecycle/decision/contract deny
```

broad `src/**`나 role glob이 explicit 또는 deny-only reservation을 덮지 못한다.

---

## 16. Public CLI Contract

### 16.1 Selectors

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

selector는 mutually exclusive다.

### 16.2 Visual refresh

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

### 16.3 App shell

```bash
npm run workflow:readiness -- --app-shell MAIN-SHELL --json
npm run workflow:readiness -- \
  --app-shell MAIN-SHELL \
  --path src/components/app-shell/host/Header.tsx \
  --json
```

### 16.4 Usage errors

state/policy를 읽기 전에 exit 2:

- blank/unknown intent
- `--intent` without `--input`
- `--input` without intent
- malformed input ID
- intent without `--screen`
- intent with `--surface`/`--app-shell`
- selector mutual exclusion
- blank/noncanonical shell ID
- `--path` without supported selector
- glob/absolute/noncanonical concrete path

canonical evidence가 없거나 hard-untrusted인 것은 usage error가 아니다. keyed
`applicable:false`, exit 0, permission 0이다.

---

## 17. workflow-state Contract

### 17.1 Additive app-shell index

app-shell-spec이 하나 이상 발견될 때만 `app_shells`를 출력한다.

```yaml
app_shells:
  MAIN-SHELL:
    status: confirmed
    api_required: false
    stub: false
    implementation_paths:
      - path: src/app/_layout.tsx
        kind: route-host
      - path: src/components/app-shell/host/**
        kind: shell-host
    ownership_claims:
      - path: src/app/_layout.tsx
        owner_state: valid
    source:
      artifact_id: MAIN-SHELL-app-shell-spec
      artifact_type: app-shell-spec
      path: app/shells/main-shell/shell-spec.md
    derived:
      host_contract_complete: true
      state_matrix_complete: true
      interaction_matrix_complete: true
      visual_ownership_complete: true
      decision_refs: []
      blocking_decisions: []
      malformed_decisions: []
      contract_errors: []
      identity_errors: []
      path_errors: []
```

### 17.2 Invalid shell record

invalid record도 recoverable ownership claims를 state에 보존한다.

```yaml
app_shells:
  MAIN-SHELL:
    readiness_applicable: false
    implementation_paths: []
    deny_only_ownership:
      - path: src/components/app-shell/**
        authored_path: src/components/app-shell/**
        reason: missing-path-kind
```

positive path array에서 행을 지우는 것으로 끝내지 않는다.

### 17.3 Determinism

- shell ID와 source path 순으로 정렬
- duplicate IDs는 selected-success 없음
- raw authored path는 diagnostics/provenance에 보존
- normalized key는 internal comparison에만 사용
- resolved decision도 `decision_refs`에 남김
- existing `screens`/`surfaces` shape 유지

### 17.4 Generated source metadata

workflow-state manifest source에 다음을 additive하게 추가한다.

```text
docs/frontend-workflow/app/shells/**/shell-spec.md
```

새 generated file format은 만들지 않는다.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Evidence-bound visual refresh

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "allowed_paths": ["src/features/create/hooks/**", "src/api/**"],
    "forbidden_paths": ["src/features/create/screens/**"],
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260811-figma-003",
      "applicable": true,
      "required_mode": "final-fixture-ui",
      "evidence": {
        "register_trusted": true,
        "input_trusted": true,
        "item_ids": ["RI-VISUAL-003"]
      },
      "allowed_paths": [
        "src/features/create/components/**",
        "src/features/create/screens/**"
      ],
      "waived_claims": [
        "deny:mode-policy:api-integrated-ui:screen:0"
      ],
      "blocking": [],
      "next_actions": []
    }
  }
}
```

### 18.2 Untrusted input

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260811-figma-003",
      "applicable": false,
      "allowed_paths": [],
      "evidence": {
        "register_trusted": true,
        "input_trusted": false,
        "hard_error_codes": ["RR-ITEM-007"]
      },
      "blocking": [
        { "intent_evidence": "hard-untrusted" }
      ],
      "next_actions": [
        "fix Contract v2 hard errors for IN-20260811-figma-003"
      ]
    }
  }
}
```

### 18.3 Non-waivable Tier3 claim

```json
{
  "path_authorization": {
    "allowed": false,
    "file": "src/features/create/screens/CreateAttachScreen.tsx",
    "work_intent": "visual-refresh",
    "waived_claims": [
      "deny:mode-policy:api-integrated-ui:screen:0"
    ],
    "active_deny_claims": [
      {
        "claim_id": "deny:tier3:secure-screen:0",
        "source": { "kind": "tier3-layer" },
        "authored_path": "src/features/create/screens/**"
      }
    ],
    "reason": "matching non-waivable Tier3 deny claim"
  }
}
```

### 18.4 No-API shell at API maturity

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "api_required": false,
    "readiness_mode": "api-integrated-ui",
    "effective_path_profile": "no-api-host",
    "allowed_paths": [
      "src/app/_layout.tsx",
      "src/components/app-shell/host/**"
    ],
    "forbidden_paths": [
      "src/features/app-shell-runtime/hooks/**",
      "src/api/app-shell/**"
    ],
    "blocking": [],
    "next_actions": []
  }
}
```

### 18.5 Malformed shell reservation

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "production-ready",
    "path_authorization": {
      "allowed": false,
      "file": "src/components/app-shell/Header.tsx",
      "reason": "path has deny-only ambiguous app-shell ownership",
      "owner": {
        "target_type": "app-shell",
        "target_id": "MAIN-SHELL",
        "owner_state": "deny-only"
      }
    }
  }
}
```

### 18.6 Field stability

- no-intent screen output에는 `work_intent` key를 넣지 않는다.
- no-app-shell repo에는 `app_shells`/shell reservation key를 넣지 않는다.
- existing `allowed_paths`를 intent-specific 의미로 재사용하지 않는다.
- ordering은 existing deterministic serialization convention을 따른다.

---

## 19. validate/backstop Contract

### 19.1 Hard structural checks

app shell에 대해 다음은 hard error 후보다.

- artifact type/path/frontmatter mismatch
- invalid/duplicate shell/artifact identity
- forbidden screen/shared identity field
- local Open Decisions section/table
- invalid/missing/ambiguous decision ref
- invalid typed implementation path shape/kind
- unsafe/duplicate/overlapping implementation path
- screen/shared/other-shell/generated overlap
- cross-target API Candidate overlap
- route truth duplicate declaration

Hard-invalid shell의 recoverable paths는 deny-only ownership으로 유지한다.

### 19.2 Contract v2 trust boundary

readiness가 `workflow:validate` 성공을 전제하지 않는다. therefore:

- v2 analyzer는 diagnostics와 trust index를 함께 계산
- validate adapter와 readiness evidence resolver가 같은 result 소비
- global structure trust와 input-local trust 분리
- unrelated input hard error는 selected input을 자동 차단하지 않음
- selected input의 RR-SCHEMA/RR-ITEM/RR-REF/RR-ROUTE/RP hard error는 intent 차단
- “completed effect” 같은 비존재 field를 만들지 않음

### 19.3 Visual-family capability resolver

strict family resolver 실패는 `visual-consistency` command의 global hard exit를 만들지
않는다. readiness intent evidence에서만 `applicable:false`다.

### 19.4 Shared pure authorization helper

```text
authorizeImplementationPath({
  file,
  authorization_context,
  readiness_entry,
  mode_order,
  ownership_index,
  deny_claims,
  candidate_claims
})
```

판정 순서:

1. concrete path canonicality
2. target/lifecycle/contract validity
3. intent evidence trust 또는 base target readiness
4. no-API profile selection
5. positive target/profile match
6. global owner/reservation
7. generated ownership
8. candidate subordinate/deny ownership
9. claim-level waiver
10. remaining deny precedence
11. structured reason/owner/provenance 반환

### 19.5 Diff backstop

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

forward와 backstop은 같은 analyzer trust, no-API profile, ownership recovery,
deny claims와 waiver predicate를 소비한다.

### 19.6 Work Packet and Run Report

다음을 readiness 결과에서 그대로 복사한다.

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260811-figma-003
    register_trusted: true
    input_trusted: true
waived_claims:
  - deny:mode-policy:api-integrated-ui:screen:0
active_deny_claims: []
```

packet/report는 trust, family membership, path profile 또는 claim waiver를 다시 계산하지
않는다.

### 19.7 Warning-first boundary

다음은 계속 warning-first이며 `--enforce`로 승격하지 않는다.

- unsupported artifact 안의 Open Decisions prose/table 후보
- prose가 shell처럼 보이지만 app-shell-spec 부재
- Navigation References semantic binding 누락
- Visual Ownership과 source drift

---

## 20. Doc/Skill Ownership

| Surface | Required follow-up |
|---|---|
| input-reconciliation/reference | v2 analyzer trust export와 intent evidence reuse |
| open-decisions reference | app-shell referrer scope/no-fan-out |
| new app-shell reference | artifact, typed paths, no-API profile, malformed recovery |
| shared-surfaces reference | shell reservation 상호 금지 |
| visual-reconciliation reference | evidence-bound visual-refresh와 strict family relation |
| doc-ownership | app-shell behavior/path gate canonical home |
| task-artifact-matrix | visual refresh와 app-shell rows |
| Stage 05 | app-shell authoring |
| Stage 06 | target/intent-aware implementation |
| Stage 08 | evidence/claim provenance report/backstop |
| COMMANDS | `--intent`, `--input`, `--app-shell` |
| implement-screen | reconciled trusted visual task에서만 intent 선택 |
| implement-shared-surface | valid/deny-only shell reservation 준수 |
| new implement-app-shell | shell readiness와 typed path만 소비 |

신규 shell skill은 shell ID 추측, route truth 중복 저작, Open Decision resolve,
confirmed promotion, readiness 재구현을 하지 않는다.

---

## 21. Compatibility Matrix

| Repository/case | Required behavior |
|---|---|
| existing screen repo, no intent | current state/readiness/path behavior 유지 |
| intent requested, no trusted v2 evidence | base output 유지; intent permission 0 |
| v1/summary-only register | visual intent authority 없음 |
| unrelated input has hard error | selected trusted input은 영향 없음 |
| selected input hard error | intent permission 0 |
| legacy API Candidate screen | legacy compatibility 유지; visual intent는 API path를 열지 않음 |
| API Candidate v2 screen | ownership 유지; visual intent에서 모든 candidate path deny |
| `api_required:false` screen | #124 compatibility 유지 |
| no shared surface | 변화 없음 |
| existing shared surface | membership/member cap/fan-out/reservation 유지 |
| no app-shell-spec | 새 required file/key/check 없음 |
| valid app-shell-spec | additive state/readiness/ownership 적용 |
| invalid recoverable shell path | all other targets에 deny-only reservation |
| `api_required:false` shell | API maturity에서도 route/shell host 유지; hook/API denied |
| custom layout/Tier3 | typed shell kind 사용; Tier3 deny preserved |
| old vendored state reader | existing screens/surfaces shape 유지; unknown app_shells 무시 가능 |
| no global decision register/refs | 기존 local-only behavior 유지 |
| warning-first checks | hard/required CI로 자동 승격하지 않음 |

새 required CI check, dependency, release/version/tag 변경은 없다.

---

## 22. Migration

### 22.1 #222

기존 repo에는 migration이 없다. intent를 쓰지 않으면 기존 결과가 유지된다.

새 visual task 절차:

1. canonical input과 Contract v2 reconciliation을 완료한다.
2. selected input의 hard trust를 확인한다.
3. target ScreenSpec/Figma mapping/visual family relation을 확인한다.
4. `--screen ID --intent visual-refresh --input INPUT_ID`를 실행한다.
5. concrete path마다 `--path` 결과를 확인한다.
6. screen/domain-component만 수정한다.
7. state/readiness/validate/visual-consistency/backstop을 실행한다.
8. evidence와 claim provenance를 report에 복사한다.

v1 register를 자동 v2로 승격하지 않는다.

### 22.2 #223

1. 기존 shell decision ID/status/options를 보존한다.
2. app-shell-spec을 draft로 작성한다.
3. typed narrow implementation paths를 선언한다.
4. decision_refs로 canonical row를 연결한다.
5. navigation-map/visual contract의 책임을 pointer로 분리한다.
6. 어떤 decision도 자동 resolve하지 않는다.
7. state를 재생성한다.
8. shell/screen/shared readiness와 representative paths를 확인한다.
9. validate와 target-aware backstop을 실행한다.

기존 string-only shell prose/path를 자동 typed entry로 추론하지 않는다. malformed adopted
path는 고칠 때까지 deny-only로 남는다.

---

## 23. Implementation Slices

### 23.1 Slice A — Issue #222

Scope:

- generic target/intent authorization context
- Contract v2 analyzer trust export
- input-local/group/projection trust index
- strict visual-family membership resolver
- policy/Tier3 deny claim provenance
- claim-level waiver with canonical `claim.authored_path`
- screen-only evidence-bound `visual-refresh`
- CLI `--intent` + `--input`
- intent-aware concrete path authorization
- Work Packet/Run Report evidence/claim copy
- forward/backstop parity
- focused regressions

Explicit exclusion:

- app-shell artifact/parser/schema/template
- shared-surface 의미 변경
- #224 decision-log

Acceptance:

- no-intent behavior 유지
- base api-integrated mode 유지
- trusted visual screen/domain-component only
- hook/API/client/candidate/delegated/generated/Tier3 deny
- input-local Contract v2 hard validity 필수
- exact visual family membership 필수
- forward/backstop same result

### 23.2 Slice B — Issue #223

Depends on Slice A substrate.

Scope:

- app-shell template/schema/manifest
- typed path parser/analyzer
- no-API host envelope
- generic candidate owner and target-specific surface resolver
- shell candidate tracking/deny-only provenance/cross-target conflict
- valid and recoverable-invalid shell ownership index
- workflow-state app_shells
- shell decision refs/cap
- screen/shared shell path reservation
- validate/forbidden-paths
- implement-app-shell/docs
- distribution/upgrade/migration regressions

Acceptance:

- shell absence no-op
- shell decision blocks shell only
- no-API API maturity preserves host
- malformed recoverable path remains globally reserved
- shell path cannot be edited through screen/shared/other shell
- shell target edits only valid declared paths
- distribution contains all active artifacts

### 23.3 No Slice 0

공통 helper는 Slice A behavior와 함께 리뷰한다. behavior 없는 abstraction-only PR은 만들지
않는다.

---

## 24. File Impact Map

### Slice A expected files

| Area | Expected files |
|---|---|
| reconciliation | `scripts/lib/reconciliation-items.mjs`, analyzer adapter/tests |
| visual family | `scripts/lib/visual-consistency.mjs` 또는 strict shared family helper |
| core | `scripts/readiness.mjs`, `scripts/lib/path-backstop.mjs`, target authorization helper |
| backstop | `scripts/forbidden-paths.mjs` |
| execution artifacts | packet/report model, callers/templates as required |
| skill/docs | implement-screen, Stage 06/08, visual reconciliation, matrix, commands |
| tests | reconciliation items, visual contract, readiness CLI, path/backstop, packet/report |

### Slice B expected files

| Area | Expected files |
|---|---|
| artifact | app-shell template/reference/skill, manifest, frontmatter schema |
| analyzer/state | app-shell analyzer, workflow-state |
| readiness | readiness, shared target authorization helper |
| ownership | shell recovery/index, shared-surfaces integration, path backstop |
| candidate | generic owner/surface/tracking/conflict helpers |
| validate | validate structural checks |
| docs | Open Decisions, shared surfaces, visual reconciliation, stages, matrix, commands |
| distribution | pack/distribution/upgrade planner manifests/tests |
| tests | app-shell focused suite plus CLI/backstop/distribution regressions |

---

## 25. Verification Matrix

### 25.1 #222

| # | Regression |
|---|---|
| 1 | api-integrated screen, no intent: screen remains forbidden |
| 2 | valid v2 trusted visual input + intent: base mode unchanged, screen/domain-component only |
| 3 | `--intent` without `--input`, `--input` without intent, malformed ID exit 2 |
| 4 | v1/summary-only register: applicable false |
| 5 | duplicate/malformed Summary or Items table: register trust false |
| 6 | selected input unique summary not reconciled: applicable false |
| 7 | selected group Effect=link-evidence/record/create-open: not visual-refresh evidence |
| 8 | selected visual group has RR-ITEM hard error: denied |
| 9 | selected visual group has RR-REF/RR-ROUTE/RP hard error: denied |
| 10 | selected input summary↔item projection mismatch: denied |
| 11 | unrelated input hard error does not deny selected trusted input |
| 12 | ScreenSpec whole-artifact/behavior target denied |
| 13 | sibling Figma mapping screen_id mismatch denied |
| 14 | visual contract whole-artifact/section-only target denied |
| 15 | exact unique family row includes selected screen: accepted |
| 16 | duplicate family row/table denied |
| 17 | malformed/duplicate Member Screens denied |
| 18 | family row does not contain selected screen denied |
| 19 | final-fixture blocker denies visual-refresh |
| 20 | api-integrated-only blocker does not deny final-level visual work |
| 21 | missing final visual prerequisite fails closed |
| 22 | absorbed/malformed lifecycle denied |
| 23 | delegated shared path denied |
| 24 | reserved valid/deny-only app-shell path denied |
| 25 | deferred/conflict/non-owner candidate denied |
| 26 | canonical screen deny claim waiver predicate true on actual claim object |
| 27 | claim uses top-level `authored_path`; `source.authored_path` absent |
| 28 | same-path canonical claim + Tier3 deny: Tier3 remains active, final deny |
| 29 | broader/narrower Tier3/custom deny overlap preserved |
| 30 | custom layout resolves visual roles but does not change deny origin |
| 31 | forward concrete result equals forbidden-paths including trust/claims |
| 32 | Packet/Report copy evidence/claim provenance without recomputation |
| 33 | legacy/no-intent fixture compatibility |

### 25.2 #223

| # | Regression |
|---|---|
| 1 | no app-shell artifact keeps existing behavior |
| 2 | valid typed shell identity/path/state deterministic |
| 3 | open shell decision caps shell only; unrelated screens unchanged |
| 4 | resolved ref remains provenance but does not block |
| 5 | missing/ambiguous/malformed ref fails shell only |
| 6 | zero-ref global row no effect |
| 7 | local Open Decisions rejected |
| 8 | forbidden identity fields rejected |
| 9 | string-only/missing/unknown kind rejected, shell permission 0 |
| 10 | valid route-host/shell-host mode envelope |
| 11 | valid active same-shell candidate reaches API mode |
| 12 | candidate inside matching typed hook/API path subordinate-allowed |
| 13 | candidate outside declaration or wrong kind denied |
| 14 | shell candidate overlaps screen/shared candidate → conflict deny |
| 15 | deferred/invalid shell candidate preserves deny-only provenance |
| 16 | `api_required:false` shell candidate authority 0 |
| 17 | `api_required:false` + api-integrated maturity keeps route/shell host editable |
| 18 | same no-API case denies hook/API-client/all candidate paths |
| 19 | no-API production-ready still denies hook/API-client |
| 20 | shell ↔ screen entry overlap rejected |
| 21 | shell ↔ shared surface overlap rejected |
| 22 | shell ↔ shell overlap rejected |
| 23 | valid shell path reserved from screen/shared/other shell |
| 24 | missing-kind canonical shell path: shell permission 0, screen/shared/other shell denied |
| 25 | safely canonicalizable alias preserves canonical deny-only reservation |
| 26 | absolute/drive/UNC/root escape has no physical claim and hard error |
| 27 | duplicate shell identity preserves every recoverable path deny-only |
| 28 | overlapping typed entries preserve related paths deny-only |
| 29 | ordinary production-ready `src/**` cannot bypass deny-only shell path |
| 30 | empty implementation paths valid authoring, permission 0 |
| 31 | custom layout/Tier3 deny remains effective over typed shell path |
| 32 | selector mutual exclusion/invalid ID exit 2 |
| 33 | state/readiness ordering deterministic |
| 34 | forward/backstop parity for no-API and malformed recovery |
| 35 | distribution/pack/upgrade includes template/skill/reference |

Implementation PR은 focused matrix뿐 아니라 기존 fixture-hook, API deferral,
shared-surfaces, Open Decisions, readiness fail-open/redteam, path-backstop,
distribution, upgrade planner 회귀를 실행한다.

---

## 26. Risks / Known Limits

1. **Diff target provenance.** contextless CI diff만으로 intended target을 알 수 없다.
   explicit owner path는 context 없이 허용하지 않는 보수적 fallback이 필요하다.
2. **Trust metadata compatibility.** analyzer는 structured internal metadata를 추가하되
   validate public diagnostics shape/order를 보존해야 한다.
3. **Visual family strictness.** general visual-consistency는 warning-first지만 capability
   evidence는 unique family/member relation을 요구한다. 두 소비 목적을 혼동하면 안 된다.
4. **Malformed reservation blast radius.** deny-only recovery는 fail-open을 막지만 author가
   계약을 고칠 때까지 관련 path를 보수적으로 잠근다. recovery는 trustworthy narrow
   canonical path에만 제한한다.
5. **Shell visual refresh.** #222 first intent는 screen-only다. shell visual refresh는 별도
   evidence/profile 설계가 필요하다.
6. **Generic app-level targets.** app shell 외 generic abstraction 근거는 아직 부족하다.
7. **Legacy broad authority.** no-adoption compatibility는 유지하지만 explicit reservation은
   항상 우선한다.
8. **Consumer metrics.** reporter 수치는 private observation이며 kit fixture 증거가 아니다.
9. **Design-only validation.** 이 문서는 구현을 증명하지 않는다.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity/order/formula를 유지한다. |
| D2 | screen-only `visual-refresh`는 `--input`과 hard-trusted v2 evidence가 필수다. |
| D3 | v2 analyzer가 register/input/group/projection trust를 반환하고 readiness가 재사용한다. |
| D4 | visual contract evidence는 exact unique family row와 Member Screens relation이 필수다. |
| D5 | deny claim `authored_path`는 top-level이고 actual claim predicate로만 waive한다. |
| D6 | visual-refresh는 screen/domain-component-only independent envelope다. |
| D7 | dedicated optional app-shell-spec과 typed path taxonomy를 사용한다. |
| D8 | API Candidate owner를 `{target_type,target_id}`로 일반화한다. |
| D9 | no-API shell은 API maturity 이상에서 no-api-host envelope를 쓴다. |
| D10 | recoverable malformed shell path는 project-wide deny-only ownership으로 남긴다. |
| D11 | 기존 6-column global decision + decision_refs로 shell-scoped cap을 만든다. |
| D12 | 모든 implementation target이 global physical path namespace를 공유한다. |
| D13 | #222를 먼저 구현하고 #223이 substrate를 소비한다. |
| D14 | no-intent/no-shell compatibility와 warning-first 정책을 보존한다. |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다.

구현 PR에서 public 의미를 바꾸지 않는 이름 선택만 남는다.

- internal analyzer/helper/module name
- exact diagnostic metadata field name
- new app-shell reference/skill slug

다음은 별도 설계 변경 없이는 허용된 implementation variation이 아니다.

- app-shell을 generic app-surface로 확대
- Open Decision schema 변경
- evidence bypass 도입
- no-API shell에 hook/API authority 부여
- malformed shell path reservation 제거
- visual-family whole-artifact target 허용

Baseline에서 다음 계약을 읽어 전제를 재검증했다.

- implementation mode policy와 readiness calculation
- workflow-state screen/shared aggregation
- Open Decision register/ref resolver
- shared-surface membership/readiness/path ownership
- concrete path/backstop/candidate authorization
- Reconciliation Contract v2 Summary/Items/routing/provenance/trust internals
- visual-consistency Screen Families/Member Screens parser
- navigation-map/visual/doc ownership boundaries
- implement-screen/implement-shared-surface Stage 06 contracts
- manifest/frontmatter/distribution impact
- #124/#210/#211의 해결 경계

설계 정적 검증 항목:

- 28 numbered H2 sections
- Markdown fence balance
- duplicate H2 없음
- JSON/YAML examples parseable
- repository-relative terminology와 current enum 일치
- #222/#223 acceptance 독립 존재
- implementation slices 분리
- #221/#224 비침범
- Open Decision 6-column schema/human-only transition 유지
- no-adoption/no-intent compatibility 명시
- no-API shell host preservation 명시
- input-local v2 hard trust와 actual `update|create` effect 명시
- exact visual family membership 명시
- malformed shell path deny-only recovery 명시
- `claim.authored_path` schema/predicate 일치

이 설계 PR은 design-only다. branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
