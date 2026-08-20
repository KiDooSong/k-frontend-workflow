# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; eleventh review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-20  
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)  
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.
>
> 이전 amendment들은 deny claim provenance, Input Result/Reconciliation hard trust,
> exact visual target/current provenance, target-key별 projection completeness,
> active/retirement operation, unkeyed visual effect, family-member capability identity,
> source lineage/transition, relation-local Screen Source Map authorization,
> typed app-shell roots, no-API envelope, target-aware API Candidate와 malformed ownership
> recovery를 확정했다.
>
> 이번 amendment는 authority root와 pending input 후보 집합의 마지막 세 경계를 닫는다.
>
> 1. `--base-ref`는 arbitrary Git ref selector가 아니다. CI의 authenticated PR base 또는
>    base-anchored adoption이 선언한 canonical upstream tip만 trust anchor가 될 수 있다.
> 2. pending visual uncertainty는 selected input보다 오래된 unresolved input도 포함한다.
>    Adoption 시점의 legacy pending input은 exact human-reviewed disposition 없이는
>    grandfathering되지 않는다.
> 3. Input Result-invalid visual file도 안전하게 복구 가능한 facts를 deny-only candidate로
>    보존한다. Non-visual category가 시각 근거를 운반하려면 additive
>    `impact_axes: [visual]`을 선언해야 하며, capability routing과 pending classifier가
>    같은 predicate를 사용한다.

---

## 1. Executive Summary

현재 `readiness_mode`는 사실 기반 성숙도와 Open Decision 상한을 하나의 mode
사다리로 표현한다. 선택된 mode 하나의 `allowed_paths`/`forbidden_paths`가 기본
구현 권한이 된다. 이 모델은 진행 상태에는 적합하지만 “지금 수행하는 작업 종류”를
표현하지 못한다.

이미 `api-integrated-ui`에 도달한 화면에 새 시각 입력이 도착해도 screen 경로는
금지된다. 반대로 API mode에서 screen forbid를 단순 제거하면 API wiring 중 화면
불변 계약이 깨진다.

또한 global app shell은 현재 `ScreenSpec`도 `shared-surface-spec`도 아니다.
`navigation-map`과 `visual-consistency-contract`에는 shell 사실이 있을 수 있지만,
그 문서들은 mutable implementation path owner이자 target-scoped readiness gate가
아니다. 결과적으로 shell Open Decision은 shell 구현 경로를 막지 못하고 ordinary
screen의 broad allowance가 shell 코드를 우회할 수 있다.

최종 설계는 다음을 확정한다.

1. `readiness_mode = min(fact_mode, decision_cap)`과 기존 mode order를 유지한다.
2. 진행 maturity와 별도로 explicit work intent를 둔다.
3. 첫 public intent는 screen-only `visual-refresh`다.
4. `visual-refresh`는 `--input <INPUT_ID>`와 hard-trusted evidence가 필수다.
5. Input Result Contract와 Reconciliation Contract v2를 shared pure analyzers로 검증한다.
6. raw/source alias는 capability 전용 Screen Source Map relation을 거친다.
7. 모든 trusted effect row는 canonical Evidence ref와 canonical parsed Target tuple을 가진다.
8. effect ref는 실제 duplicate contract인 `(Input ID, Item, Effect, Target)`과 일치한다.
9. 기존 multi-target item 의미를 유지하고 breaking triple uniqueness를 도입하지 않는다.
10. mapping과 ScreenSpec identity는 exact row/section key다.
11. visual-family identity는 family × canonical screen member relation이다.
12. 모든 exact key는 active provenance 또는 retirement tombstone과 projection-complete해야 한다.
13. current active update와 current retirement는 모두 `visual-refresh` operation이 될 수 있다.
14. operation eligibility는 screen-global timestamp가 아니라 exact key의 최신 trusted refs가 소유한다.
15. 서로 다른 key의 current operations는 input 도착 순서와 무관하게 각각 실행할 수 있다.
16. 같은 key의 newer trusted effect만 이전 exact operation을 폐기한다.
17. input-level `supersedes`는 lineage graph 사실이지 implicit whole-screen revocation이 아니다.
18. exact key를 만들 수 없는 screen visual effect는 unresolved unkeyed blocker다.
19. legacy unkeyed 예외는 immutable adoption baseline의 exact effect refs로만 고정한다.
20. adoption artifact가 생기기 전 존재하던 register-missing/not-started/malformed visual input도
    adoption audit 대상이며, exact legacy pending disposition 없이는 blocker다.
21. adoption proposal은 current tree에서 structurally valid할 수 있지만 code authority는 0이다.
22. adoption authority는 canonical trusted merge-base에 confirmed artifact가 이미 존재할 때만 생긴다.
23. `--base-ref`는 base 선택자가 아니라 canonical anchor assertion이다.
24. CI에서는 authenticated PR base SHA가 authoritative하며 explicit override를 금지한다.
25. Local에서는 base-anchored adoption이 선언한 canonical remote/branch tip이 authoritative다.
26. `HEAD`, local feature branch, arbitrary tag 또는 unmerged adoption commit은 trust anchor가 아니다.
27. base/current adoption authority payload가 같지 않으면 visual intent는 fail closed한다.
28. adoption approval decision은 canonical global row에 unique하게 해소되고 base/current에서 resolved여야 한다.
29. `approved_by` 문자열은 독립 trust source가 아니며 canonical decision Owner와 일치해야 한다.
30. trusted history를 구할 수 없으면 readiness와 backstop 모두 visual intent를 거부한다.
31. pending visual uncertainty는 graph edge와 timestamp 순서에 관계없이 모든 unresolved visual candidate를 본다.
32. selected input보다 오래된 register-missing/not-started/failed input도 disposition 전까지 blocker다.
33. Input Result-invalid이지만 visual hint, identity와 scope를 안전하게 복구할 수 있는 file은 deny-only candidate다.
34. candidate의 identity/scope를 복구할 수 없으면 visual candidate index 전체를 fail closed한다.
35. non-visual enum input이 visual evidence를 운반하려면 `impact_axes: [visual]`이 필요하다.
36. adopted capability contract에서 `Basis=visual-evidence`와 pending classifier는 같은
    `visual_impact_declared` predicate를 사용한다.
37. ordinary non-visual meeting/user-note input은 screen visual blocker가 아니다.
38. fully trusted keyed/non-screen/screen-excluded disposition 또는 explicit pending resolution만 blocker를 해제한다.
39. retirement tombstone의 `inherit`은 Evidence가 정확히 1개일 때만 허용한다.
40. 다중 Evidence tombstone은 explicit RFC3339 timestamp가 필요하다.
41. Screen Source Map은 global structure trust와 alias-local authorization state를 분리한다.
42. 모든 deny는 provenance-bearing claim이며 non-waivable deny가 우선한다.
43. `visual-refresh` physical envelope는 screen/domain-component만 연다.
44. `app-shell-spec`을 optional first-class implementation target으로 도입한다.
45. typed shell declaration은 semantic ownership일 뿐 physical authority를 스스로 만들지 않는다.
46. shell authority는 policy target root, layout binding, maturity profile의 교집합이다.
47. `route-host`는 exact-file `app_shell_route_host`만 사용한다.
48. optional shell roots와 required-on-use `api_client`는 실제 kind 사용 시에만 lazy resolve한다.
49. no-API shell은 API maturity에서도 root-bound host authority를 유지한다.
50. malformed이지만 recoverable한 shell path는 project-wide deny-only reservation으로 남는다.
51. 기존 6-column Open Decision register와 human-only transition을 재사용한다.
52. screen/shared/app-shell/generated/API Candidate가 하나의 physical namespace를 사용한다.
53. #222와 #223은 별도 구현 PR로 나누고 #223은 #222 substrate를 소비한다.

추가 사용자 결정 없이 권장안으로 설계를 확정한다.

---

## 2. Current Model

### 2.1 Readiness maturity

현재 mode order:

```text
docs-only
→ route-skeleton
→ screen-skeleton
→ rough-fixture-ui
→ final-fixture-ui
→ api-integrated-ui
→ production-ready
```

화면별 계산:

```text
fact_mode      = 사실이 연속으로 만족하는 최고 mode
decision_cap   = open/malformed Open Decision이 허용하는 상한
readiness_mode = min(fact_mode, decision_cap)
```

`readiness_mode`는 작업 요청 종류가 아니라 현재 성숙도와 decision ceiling이다.

### 2.2 Current path authorization

```text
base_allowed   = resolve(chosen_mode.allowed_paths)
base_forbidden = resolve(chosen_mode.forbidden_paths)
```

그 뒤 다음 좁은 보정이 적용된다.

- `api_required:false` screen의 non-API path 복원
- API Candidate v2 active/deferred/conflict ownership
- shared-surface member path reservation
- generated/do-not-edit ownership
- concrete path canonicality
- forbidden-over-allowed precedence

`api-integrated-ui`에서 screen을 금지하는 것은 API wiring 중 JSX/visual 구조를
동결하는 work-step boundary다.

### 2.3 Current deny provenance loss

Mode YAML과 Tier3 `layers[].access.forbid`는 최종 `forbidden_paths: string[]`로
합쳐져 origin을 잃는다. 따라서 string 제거 방식의 intent override는 금지한다.

### 2.4 Input Result Contract boundary

검사 11 hard 범위:

- canonical frontmatter
- required 9 fields
- `input_id` lexical format와 uniqueness
- `captured_at` RFC3339 with timezone
- `input_type`/`source_type` enum
- effective affected domains/screens
- `supersedes` resolution/self-reference
- optional confidence enum

Reconciliation RR/RP trust와 별도다. Visual candidate discovery는 hard-valid input만
보면 안 된다. Missing `captured_by` 또는 `status`처럼 권한 evidence로는 invalid하지만,
visual source/type, input ID와 scope를 안전하게 복구할 수 있는 file은 stale-fallback
방지를 위한 deny-only candidate로 남아야 한다.

### 2.5 Reconciliation Contract v2 boundary

Contract v2는 canonical Summary/Items structure, target/evidence resolution,
routing matrix, provenance, summary projection을 hard 검사한다. Readiness는
`workflow:validate` 선행 성공을 가정하지 않으므로 pure analyzer trust index를 직접
소비한다.

현재 duplicate effect hard key는 다음 4-tuple이다.

```text
(Input ID, Item, Effect, Target)
```

같은 input/item/effect가 다른 Target에 쓰이는 multi-target item은 hard-valid할 수 있다.

### 2.6 Historical effect versus current authored state

Reconciliation `Effect`는 Stage 04의 역사적 행위다. 과거 row가 hard-valid하다는
사실만으로 Stage 06 코드 구현이 완료됐거나 target artifact가 그 input을 현재 visual
source로 사용한다는 결론은 나오지 않는다.

Current authored provenance owners:

- Figma mapping: `## Mapping Provenance`
- Visual Consistency: `Screen Families` row `Evidence`
- ScreenSpec: optional exact `## Visual Evidence`
- retired target/member relation: optional exact `## Visual Target Retirements`

### 2.7 Exact key and unkeyed boundary

General Contract v2는 visual artifact 전체/section target을 허용할 수 있다. 그러나
`visual-refresh` capability에는 exact implementation relation이 필요하다.

Trusted visual effect는 다음 중 하나다.

```text
keyed-screen-visual
unkeyed-screen-visual
non-screen-visual
```

Unkeyed screen visual effect는 authority를 만들지 않으며 freshness 분석에서도 사라지지 않는다.

### 2.8 Operation lifecycle boundary

서로 다른 visual inputs가 Stage 04에서 연속으로 reconcile된 뒤 Stage 06 구현이 나중에
수행될 수 있다. Screen-global timestamp 또는 input graph leaf를 exclusive selector로
사용하면 이전 disjoint key operation이 실행 불가능해진다.

```text
key-local operation currentness  → authorization gate
input graph trust                → lineage integrity
pending visual index             → unresolved visual evidence gate
screen aggregate timestamps      → reporting/ordering only
```

### 2.9 Adoption authority boundary

`visual-intent-adoption`은 legacy baseline을 grandfathering하고 code capability를 켜는
control-plane authority root다. Current-tree shape/digest만으로는 인간 승인 또는 이미
merge된 신뢰 상태를 증명할 수 없다.

```text
adoption proposal trust   → current tree의 구조·digest 검증
adoption authority trust  → proposal + canonical base anchor + resolved approval decision
```

Newly added artifact는 proposal일 뿐 같은 diff에서 screen authority를 만들지 못한다.

### 2.10 Canonical history-anchor boundary

`git merge-base(current, userRef)`만으로는 trusted base를 만들 수 없다. Caller가 `HEAD`,
feature branch 또는 unmerged adoption tag를 넘기면 self-authorization이 재개된다.

따라서 base는 다음 control-plane source만 소유한다.

```text
CI pull-request event   → authenticated PR base SHA
local execution         → base-anchored adoption의 canonical remote + branch tip
```

`--base-ref`는 selector가 아니라 canonical tip assertion이다.

### 2.11 Pending visual uncertainty boundary

`supersedes`는 optional이고 unresolved input은 selected input보다 오래될 수 있다.
Timestamp가 더 오래됐다는 사실은 visual meaning이 반영·거부·대체됐다는 provenance가
아니다.

따라서 pending index는 candidate age와 graph component를 기준으로 제외하지 않는다.
모든 unresolved, non-baselined, potentially-overlapping visual candidate를 본다.

### 2.12 Visual impact declaration boundary

현재 Contract v2의 `Basis=visual-evidence`는 input frontmatter category가 meeting/user-note여도
Figma Source Ref와 target이 맞으면 hard-valid할 수 있다. Pending classifier가 visual enum만
보면 pre-reconciliation candidate를 놓친다.

First slice는 additive input metadata를 도입한다.

```yaml
impact_axes:
  - visual
```

```text
visual_impact_declared(input) =
  input_type ∈ {figma, visual-spec}
  OR source_type ∈ {figma, visual-spec}
  OR impact_axes contains visual
```

Adopted capability contract에서 `Basis=visual-evidence`와 pending classifier는 이 predicate를
공유한다. Legacy no-adoption validation 의미는 유지한다.

### 2.13 Malformed candidate recovery boundary

Input Result hard-invalid file도 다음 structured facts를 안전하게 복구할 수 있으면
candidate-level deny-only uncertainty를 만든다.

- parseable frontmatter
- unique recoverable `input_id`
- visual hint 또는 `impact_axes: [visual]`
- canonical/raw/domain scope 중 하나

Timestamp나 scope가 복구되지 않아 screen 귀속을 결정할 수 없으면 visual candidate index
자체를 untrusted로 두고 visual intent를 fail closed한다. No-intent 동작은 유지한다.

### 2.14 Family member boundary

Visual family row는 여러 screen을 참조한다. Family row 하나를 capability key로 쓰면
member 일부가 제거될 때 active family row와 member retirement를 동시에 표현할 수 없다.

Capability identity는 family × screen relation으로 분해한다.

### 2.15 Retirement timestamp boundary

기존 provenance의 `inherit`은 한 Evidence가 가리키는 canonical input timestamp를
상속한다. 다중 Evidence set에 first/last/max를 암묵적으로 적용하지 않는다.

### 2.16 Screen Source Map boundary

General doctor는 warning-first다. Capability analyzer만 exact frontmatter/table/row와
relation state를 hard trust로 사용한다. `split|ambiguous`는 정상 구조일 수 있으므로
relation-local non-authorizing이다.

### 2.17 Layout resolver boundary

Ordinary `{roles.X}` undefined는 계속 `LayoutConfigError`다. Optional app-shell target root만
별도 lazy resolver를 사용한다.

### 2.18 Shared surface and shell boundary

Shared surface는 domain, explicit members, member cap과 fan-out을 전제로 한다. Global
shell을 shared-surface 특례로 만들지 않는다.

### 2.19 Existing fixes and remaining problem

- #124: no-API screen path 잠금 해소
- #210: API Candidate v2 slice ownership/deferral
- #211: fixture hook authority와 API-mode screen freeze 양립
- #222: maturity와 work type authorization 축 부재
- #223: shell target/path/decision owner 부재

---

## 3. Reproduced Failure Modes

### 3.1 Mature screen visual work

- API-integrated screen은 intent 없이 screen forbidden이다.
- 과거 mode union은 API wiring invariant를 깨뜨린다.
- evidence 없는 intent는 bearer capability가 된다.
- RR/RP만 검사하면 Input Result-invalid artifact가 authority가 될 수 있다.
- raw alias exact-only 규칙은 정상 identity reconciliation을 막는다.
- graph leaf만 보면 missing supersedes/new lineage input을 놓친다.
- screen scalar timestamp만 보면 다른 key projection 누락을 가린다.
- input ID만 비교하면 다른 Evidence bullet을 current 근거로 오인한다.
- tombstone authority가 없으면 pure removal이 Stage 06에 진입하지 못한다.
- exact key 없는 coarse row를 버리면 old exact input이 재사용된다.
- family row-level key는 member 일부 retirement를 표현하지 못한다.
- same change가 adoption artifact를 만들고 자기 screen diff를 열 수 있다.
- current-tree digest만 검사하면 base baseline mutation을 forward readiness가 허용할 수 있다.
- arbitrary `--base-ref HEAD`가 unmerged adoption을 trusted base처럼 보이게 할 수 있다.
- selected input보다 오래된 register-missing visual input이 timestamp filter에서 사라질 수 있다.
- Input Result-invalid Figma file이 candidate 집합에서 제외될 수 있다.
- meeting/user-note input이 나중에 visual-evidence로 route되지만 pre-reconciliation classifier에는
  나타나지 않을 수 있다.

### 3.2 App shell gate and ownership

- navigation-map은 route truth owner이지만 implementation target이 아니다.
- visual contract는 visual policy owner이지만 shell readiness gate가 아니다.
- shared-surface global 특례는 member/cap/fan-out 의미를 훼손한다.
- typed declaration alone은 API/package/다른 domain path를 shell path로 탈취할 수 있다.
- broad `route_entry`를 route-host root로 쓰면 ordinary route를 탈취할 수 있다.
- invalid owner를 index에서 버리면 broad `src/**`가 우회한다.
- no-API shell은 API mode에서 host와 API surface가 모두 닫힐 수 있다.
- eager root resolution은 no-shell/no-API custom layout을 깨뜨린다.

---

## 4. Goals

- maturity와 work intent를 분리한다.
- current, projection-complete exact operation만 screen edit authority를 만든다.
- adoption proposal과 merge된 authority root를 기계적으로 분리한다.
- approval decision의 human-resolved provenance를 기존 Open Decision 계약으로 검증한다.
- canonical CI/upstream lineage만 history trust anchor로 사용한다.
- forward와 backstop 모두 동일한 base anchor/history 결과를 소비한다.
- candidate age, graph edge 또는 full Input Result trust와 무관하게 unresolved visual evidence를 보존한다.
- adoption 전에 기존 pending visual inputs까지 audit/disposition한다.
- non-visual category의 visual impact를 explicit metadata로 선언한다.
- disjoint current operations는 도착 순서와 graph edge에 관계없이 각각 실행 가능하게 한다.
- same-key stale operation은 실행하지 못하게 한다.
- active update와 current retirement removal을 모두 지원한다.
- unkeyed visual row를 explicit resolution 전까지 fail closed한다.
- family member 일부 제거/rename을 명시적으로 표현한다.
- API wiring 중 screen freeze를 유지한다.
- app shell을 first-class target으로 만든다.
- shell declaration과 physical authority를 분리한다.
- no-API host authority를 유지한다.
- malformed owner가 다른 target authority를 넓히지 않게 한다.
- no-intent/no-shell compatibility를 보존한다.
- #222/#223 구현을 별도 PR로 나눈다.

---

## 5. Non-goals

- mode order 변경
- scalar `visual-refresh` mode 삽입
- reached-mode allowed union
- evidence/adoption-history/base-lineage bypass
- arbitrary ref를 trusted base로 사용
- timestamp/file name/natural-language body만으로 positive intent 추론
- current-tree `confirmed` 문자열을 인간 승인 증거로 사용
- historical input mutation/backfill
- implicit target retirement
- coarse target에서 exact key 자동 추론
- family member removal silent inference
- input-level supersedes를 implicit whole-screen replacement로 해석
- unresolved older visual input 무시
- malformed visual input을 index에서 삭제
- ordinary non-visual meeting을 자동 visual blocker로 추론
- doctor/visual warnings 전체를 required CI로 승격
- broad default shell roots
- app-shell declaration-only authority
- Open Decision six-column schema 변경
- #224 decision-log 계약
- automatic consumer migration
- Open Decision resolve/confirmed promotion
- dependency/release/version/tag 변경

---

## 6. Terminology

| Term | Meaning |
|---|---|
| maturity | fact와 decision cap이 허용하는 진행 상태 |
| work intent | 호출자가 명시하는 작업 종류 |
| visual effect | trusted Contract v2 `visual-evidence` update/create row |
| effect ref | input/item/effect/canonical Target fingerprint 기반 row identity |
| canonical Evidence ref | `input:<id>#<section>[/<1-based-bullet>]` tuple |
| capability target key | exact visual implementation relation identity |
| mapping key | `mapping:<artifact>/<M-key>` |
| family member key | `visual-family:<artifact>/<family>/<screen>` |
| screen visual key | `screen-visual:<screen-artifact>/<section>` |
| active record | current mapping/family-member/ScreenSpec provenance record |
| retirement tombstone | exact key/member relation의 explicit retired provenance |
| projection completeness | latest refs가 active record 또는 tombstone에 반영된 상태 |
| active operation | selected effect가 latest active record에 exact-bound된 작업 |
| retirement operation | selected effect가 latest tombstone에 exact-bound된 제거/대체 작업 |
| key-local currentness | 같은 exact key의 최신 trusted refs 기준 eligibility |
| unkeyed effect | screen visual surface에 닿지만 exact key가 없는 trusted effect |
| visual impact declaration | visual enum 또는 `impact_axes: [visual]` |
| visual hint | malformed candidate recovery용 enum/impact axis/canonical Figma ref |
| deny-only visual candidate | positive authority 없이 pending blocker만 만드는 recoverable input |
| pending input resolution | effect ref가 없는 unresolved input의 explicit disposition |
| legacy pending baseline | adoption 시점 unresolved input의 immutable reviewed disposition |
| adoption proposal trust | current-tree artifact 구조·digest 검증 결과 |
| adoption authority trust | proposal + canonical base anchor + resolved approval decision |
| canonical history anchor | CI PR base 또는 base artifact가 선언한 canonical upstream tip |
| base-ref assertion | canonical tip과 일치하는지 검사하는 optional local argument |
| authority payload | adoption identity, history config, approval, baseline normalized semantics |
| pending visual uncertainty | unresolved potentially-overlapping visual candidate 상태 |
| source lineage | source capture replacement stream |
| alias relation state | authorizing / acknowledged-non-authorizing / conflicting |
| deny claim | path, source, class, overrideability를 가진 deny |
| typed shell path | semantic kind와 ownership reservation, physical authority 자체는 아님 |
| kind root | policy/layout-owned shell physical ceiling |
| required-on-use | 해당 kind declaration/candidate가 있을 때만 필수인 root |
| deny-only ownership | positive authority 없이 다른 target을 차단하는 recoverable claim |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. Intent는 explicit이며 bypass가 없다.
4. Input Result Contract와 Reconciliation v2 hard trust를 selected authority에 모두 요구한다.
5. Screen scope는 canonical ID 또는 authorizing source-map relation이어야 한다.
6. Effect identity는 실제 v2 duplicate 4-tuple과 일치해야 한다.
7. Same input/item/effect + different Target은 다른 effect refs다.
8. Exact same 4-tuple은 기존 duplicate hard error다.
9. Capability effect는 canonical Evidence ref를 가져야 한다.
10. Keyed effect는 exact active record 또는 exact tombstone에 결합한다.
11. Input ID만 같고 section/bullet이 다르면 deny한다.
12. Relevant exact key 전체의 projection completeness를 먼저 검사한다.
13. Historical key는 active record나 tombstone 없이 ledger에서 사라지지 않는다.
14. Current active record 삭제는 tombstone 없이는 stale다.
15. Current retirement operation은 실제 removal을 authorize할 수 있다.
16. Retirement operation은 exact operation scope만 정당화한다.
17. Unkeyed screen visual effect는 authority를 만들지 않는다.
18. Adoption baseline 또는 explicit resolution 없는 unkeyed effect는 blocker다.
19. Adoption proposal은 같은 branch에서 code authority를 만들지 않는다.
20. Adoption authority는 unchanged confirmed artifact가 canonical merge-base에 있을 때만 가능하다.
21. CI PR base는 explicit argument로 override할 수 없다.
22. Local `--base-ref`는 selector가 아니라 canonical tip assertion이다.
23. `HEAD`, local branch, arbitrary tag, unmerged commit은 canonical trust anchor가 아니다.
24. Approval decision은 base/current 모두에서 unique global resolved row여야 한다.
25. `approved_by` free-form 문자열은 독립 trust source가 아니다.
26. History unavailable이면 visual intent는 fail closed한다.
27. Readiness와 backstop은 동일 canonical anchor/digest를 소비한다.
28. Pending index는 candidate age와 graph linkage로 unresolved input을 제외하지 않는다.
29. Adoption 시점의 모든 unresolved visual candidate는 trusted disposition 또는 immutable legacy disposition이 필요하다.
30. Input Result-invalid visual file도 recoverable facts가 있으면 deny-only candidate다.
31. Candidate identity/scope를 복구할 수 없으면 visual candidate index 전체를 fail closed한다.
32. `visual_impact_declared`는 pending classifier와 capability visual routing의 shared predicate다.
33. Non-visual enum input은 `impact_axes: [visual]` 없이는 capability visual-evidence가 될 수 없다.
34. Ordinary non-visual input은 screen visual blocker가 아니다.
35. Fully trusted exact/non-screen/exclusion 또는 explicit resolution만 pending blocker를 해제한다.
36. Screen-global event와 graph leaf는 exclusive operation selector가 아니다.
37. Same-key newer evidence만 predecessor exact operation을 폐기한다.
38. Disjoint successor keys는 predecessor disjoint operation을 폐기하지 않는다.
39. Family capability identity는 member screen별이다.
40. Member 제거는 explicit member-key retirement가 필수다.
41. Deny는 claim 단위로 판정하고 non-waivable claim이 우선한다.
42. Packet/Report는 trust/currentness를 재계산하지 않는다.
43. Shell declaration은 physical authority를 스스로 만들지 않는다.
44. Route-host는 exact shell root 안에서만 가능하다.
45. Optional/required-on-use roots는 lazy resolve한다.
46. Ordinary undefined role은 계속 `LayoutConfigError`다.
47. No-API shell은 host만 유지하며 hook/API/candidate authority를 얻지 않는다.
48. Malformed owner declaration은 다른 target authority를 넓히지 않는다.
49. No-intent/no-shell behavior는 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode union | reject | task kind와 API freeze 구분 불가 |
| API screen forbid 제거 | reject | 모든 API wiring에 screen mutation 개방 |
| scalar visual-refresh mode | reject | maturity/task kind 재혼합 |
| evidence 없는 intent | reject | bearer capability |
| historical item only | reject | current authored provenance 불명 |
| input ID equality | reject | 다른 Evidence bullet 오인 |
| effect ref without Target | reject | valid multi-target rows collision |
| v2 duplicate triple hardening | reject | existing multi-target item breaking change |
| full Target fingerprint effect ref | adopt | existing 4-tuple cardinality 보존 |
| screen-global event as selector | reject | disjoint operation 소실 |
| graph leaf as selector | reject | input edge가 disjoint operation deadlock 생성 |
| key-local operation eligibility | adopt | same-key stale만 거부 |
| input graph as global revocation | reject | operation identity와 input lineage 혼합 |
| arbitrary `--base-ref` selector | reject | unmerged adoption self-anchor 가능 |
| CI authenticated base | adopt | PR control-plane source |
| base-anchored canonical upstream tip | adopt | local trust lineage 고정 |
| exact local base assertion | adopt | ref mismatch를 CLI error로 표면화 |
| current-tree confirmed adoption | reject | self-issued authority |
| base-anchored two-stage adoption | adopt | approval/authority 분리 |
| approved_by string only | reject | 작성 가능한 문자열 |
| unique resolved global decision | adopt | 기존 human-only transition 재사용 |
| timestamp unkeyed cutover | reject | threshold 이동으로 blocker 우회 |
| immutable exact legacy baseline | adopt | grandfathered 예외 고정 |
| timestamp-filtered pending inputs | reject | older unresolved evidence 소실 |
| all unresolved visual candidates | adopt | provenance 없는 age-out 금지 |
| trusted-input-only candidate index | reject | malformed Figma file 소실 |
| recoverable deny-only candidates | adopt | invalid input도 stale fallback 차단 |
| enum-only visual classifier | reject | meeting/user-note visual evidence gap |
| natural-language body inference | reject | nondeterministic/fail-open |
| additive `impact_axes: [visual]` | adopt | capture-time explicit impact contract |
| general v2 routing breaking restriction | reject | no-adoption compatibility 비용 |
| adoption-aware capability routing predicate | adopt | classifier/routing alignment |
| unrelated newer event age-out | reject | coarse meaning 소멸 |
| explicit unkeyed/pending resolution | adopt | provenance-bearing 해소 |
| multi-Evidence inherit=max | reject | inherit 의미를 집계 연산으로 변경 |
| inherit single-ref only | adopt | 기존 provenance 의미와 일치 |
| family row-level key | reject | member 일부 retirement 불가 |
| family × member key | adopt | A active/B retired 동시 표현 |
| typed shell declaration alone | reject | arbitrary physical authority |
| declaration ∩ kind root | adopt | semantic owner와 physical authority 분리 |
| route-host → route_entry | reject | ordinary route까지 broad authority |
| exact app_shell_route_host | adopt | host boundary만 개방 |
| eager api_client root | reject | no-API custom layout 파손 |
| required-on-use root | adopt | 실제 API surface 사용 때만 필수 |
| shared-surface global scope | reject | member/cap/fan-out 의미 훼손 |
| dedicated app-shell-spec | adopt | narrow target identity/gate |

---

## 9. Decision D1 — Readiness Maturity 유지

### 9.1 Formula

```text
fact_idx       = target fact profile이 연속으로 만족하는 최고 mode index
decision_idx   = target open decision의 최저 Blocking Mode index - 1
readiness_idx  = min(fact_idx, decision_idx)
readiness_mode = order[readiness_idx]
```

Malformed lifecycle/decision/policy/target contract는 fail closed한다.

### 9.2 Base output

Intent가 있어도 top-level 다음 필드는 base maturity다.

```text
readiness_mode
next_mode
allowed_paths
forbidden_paths
blocking
next_actions
```

Intent 결과는 별도 `work_intent`에 둔다.

### 9.3 Intent prerequisite

```text
intent_prerequisite_pass =
  fact_idx >= index(final-fixture-ui)
  AND decision_cap_idx >= index(final-fixture-ui)
  AND target lifecycle/structure valid
```

Final-level blocker는 visual refresh를 막는다. API 진입만 막는 higher blocker는 순수
final visual work를 불필요하게 막지 않는다.

### 9.4 Effective profile

Maturity와 effective path profile은 별도다. No-API shell은 API/production maturity에서도
`no-api-host`를 사용할 수 있다.

---

## 10. Decision D2 — Explicit Work Intent와 Current Visual Operation Trust

### 10.1 Public contract

Local example:

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --base-ref refs/remotes/origin/main \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

`--base-ref`는 canonical tip assertion이다. Caller가 trust anchor를 선택하지 않는다.
CI에서는 PR event base SHA가 authoritative이며 `--base-ref`를 전달하면 exit 2다.

First slice에서 `visual-refresh`는 screen selector에만 허용한다. Figma mapping 존재,
최근 timestamp, filename 또는 current mode만으로 자동 활성화하지 않는다.

### 10.2 Input Result analyzer와 impact axes

```text
analyzeInputArtifacts(artifacts) -> {
  errors,
  warnings,
  trust: {
    by_input_id,
    by_file,
    duplicate_ids,
    graph_candidates,
    candidate_facts_by_file
  }
}
```

`input_artifact_trusted=true`는 검사 11 hard contract 전체가 통과할 때만 가능하다.
`validateInputArtifacts()`와 readiness가 같은 analyzer 결과를 소비한다.

Additive optional fields:

```yaml
impact_axes:
  - visual
source_lineage: figma-screen://file/abc123/CREATE-ATTACH
lineage_transition:
  from_input: IN-20260701-figma-001
  reason: legacy-lineage-adoption   # legacy-lineage-adoption | source-move
```

First slice의 `impact_axes` supported value는 `visual`이다. Array가 아니거나 unknown/duplicate
value가 있으면 Input Result hard error다.

```text
visual_impact_declared(input) =
  input_type ∈ {figma, visual-spec}
  OR source_type ∈ {figma, visual-spec}
  OR normalized impact_axes contains visual
```

### 10.3 Candidate-level facts for invalid input

Input Result hard trust와 별도로 candidate facts를 만든다.

```yaml
candidate_facts:
  file: docs/frontend-workflow/inputs/create/IN-B.md
  input_artifact_trusted: false
  recovered_input_id: IN-B
  recovered_captured_at: "2026-08-20T11:00:00+09:00"
  visual_hints:
    - source-type:figma
  scope_state: canonical-screen
  recovered_screens:
    - CREATE-ATTACH
  candidate_state: deny-only
  hard_errors:
    - missing-required-field:captured_by
```

Recoverable candidate requirements:

- frontmatter parseable
- valid unique recoverable input ID
- at least one structured visual hint
- canonical/raw/domain scope recoverable

Structured visual hints:

```text
visual enum
impact_axes contains visual
canonical Figma source_ref
```

Filename/body prose는 positive visual hint가 아니다.

If frontmatter is unparseable, input ID is duplicate/ambiguous, or visual candidate scope cannot be
recovered, the candidate index is `untrusted-global` and visual intent is inapplicable until fixed.

### 10.4 Reconciliation Contract v2 analyzer

```text
analyzeReconciliationContractV2(...) -> {
  errors,
  warnings,
  trust: {
    register_trusted,
    summaries_by_input,
    groups_by_key,
    projection_by_input,
    visual_effect_rows,
    effect_ref_index,
    unkeyed_resolutions,
    pending_input_resolutions
  }
}
```

Selected visual group:

```text
group_trusted == true
Basis == visual-evidence
Classification == simple-update
all Effect ∈ {update, create}
at least one effect row
```

Adopted capability routing requirement:

```text
Basis == visual-evidence
→ input visual_impact_declared == true
```

For inputs captured after adoption, a non-visual enum meeting/user-note without
`impact_axes: [visual]` produces a capability hard error and remains pending uncertainty.
No-adoption repositories keep existing general Contract v2 validation behavior.

### 10.5 Deterministic effect identity

Existing duplicate contract는 변경하지 않는다.

```text
exact duplicate key =
  (Input ID, Item, Effect, Target)
```

Canonical Target tuple:

```text
artifact: ["artifact", artifactId, section-or-empty, rowKey-or-empty]
child:    [kind, rowId, ownerArtifactId]
input:    ["input", inputId]
none:     ["none"]
```

Normalization:

- parser-trimmed values
- Unicode NFC
- fixed field order
- empty optional slots as `""`
- compact JSON array serialization
- UTF-8 bytes

```text
target_fingerprint =
  lowercase_hex(SHA-256(utf8(JSON.stringify(canonical_target_tuple))))

effect_ref =
  visual-effect:<input-id>/<item>/<effect>/<64-lowercase-hex-target-fingerprint>
```

Rules:

- trusted parseable Target row만 effect ref를 가진다.
- same input/item/effect + different Target → different refs.
- exact same 4-tuple → existing duplicate hard error.
- hash truncation 금지.
- raw Target string을 ref path에 직접 넣지 않는다.
- collision 감지 시 관련 rows 모두 hard-ambiguous다.

### 10.6 Visual-intent adoption proposal artifact

Optional canonical artifact:

```text
docs/frontend-workflow/_meta/visual-intent-adoption.md
artifact_type: visual-intent-adoption
artifact_id: visual-intent-adoption
```

Frontmatter:

```yaml
---
artifact_id: visual-intent-adoption
artifact_type: visual-intent-adoption
visual_intent_contract: 1
status: confirmed
structured_since_snapshot: "2026-07-20T00:00:00+09:00"
adopted_at: "2026-08-20T10:00:00+09:00"
baseline_digest: "sha256:<64-lowercase-hex>"
approved_by: "PM"
approved_at: "2026-08-20T10:00:00+09:00"
decision_id: "D-VISUAL-INTENT-ADOPTION"
canonical_remote: origin
canonical_branch: main
canonical_repository: "github:owner/repository"
---
```

Legacy unkeyed baseline:

```markdown
## Legacy Unkeyed Baseline

| Effect Ref | Screen ID | Canonical Target | Evidence | Input Captured At | Disposition |
|---|---|---|---|---|---|
| visual-effect:IN-OLD/01/update/<target-sha256> | CREATE-ATTACH | artifact:CREATE-ATTACH-figma-component-mapping | input:IN-OLD#extracted-facts/01 | 2026-07-30T09:00:00+09:00 | advisory-history |
```

Legacy pending visual dispositions:

```markdown
## Legacy Pending Visual Dispositions

| Input ID | Screen ID | Disposition Kind | Resolving Input | Target Keys | Resolving Evidence | Decision Ref |
|---|---|---|---|---|---|---|
| IN-LEGACY-PENDING | CREATE-ATTACH | superseded-by-trusted-input | IN-REPLACEMENT | mapping:CREATE-ATTACH-figma-component-mapping/M-001 | input:IN-REPLACEMENT#extracted-facts/01 | - |
| IN-LEGACY-MEETING | CREATE-ATTACH | no-screen-impact | - | - | - | D-LEGACY-NO-IMPACT |
```

Both tables and canonical history fields are part of the immutable authority payload and digest.

### 10.7 Adoption proposal trust

```text
adoption_proposal_trusted =
  unique canonical artifact
  AND exact frontmatter/schema/tables
  AND status ∈ {draft, confirmed}
  AND visual_intent_contract == 1
  AND structured_since_snapshot == register.structured_since
  AND adopted_at/approved_at RFC3339 and non-future
  AND canonical remote/branch/repository fields valid
  AND every legacy Effect Ref resolves to one trusted unkeyed effect
  AND every legacy pending row resolves to one candidate input and screen
  AND every baseline/disposition row satisfies its kind-specific contract
  AND baseline_digest matches normalized immutable payload
```

Adoption proposal trust also requires adoption-time completeness:

```text
for every potentially-overlapping visual candidate existing at adopted_at:
  trusted resolved disposition exists
  OR exact legacy unkeyed baseline row exists
  OR exact legacy pending disposition row exists
```

A register-missing/not-started/malformed legacy input cannot disappear simply because it lacks an
Effect Ref.

Proposal trust는 code authority가 아니다.

### 10.8 Canonical history anchor

#### CI

```text
canonical_anchor_source = authenticated-pr-base
canonical_tip_sha       = CI pull-request base SHA
```

Rules:

- CI-provided base SHA is authoritative.
- `--base-ref` is forbidden in CI and produces exit 2 `base-ref-override-forbidden`.
- Feature branch, tag or environment override cannot replace the PR base.

#### Local

Local authority fields come from the unchanged base adoption artifact.

```text
canonical_remote     = base adoption canonical_remote
canonical_branch     = base adoption canonical_branch
canonical_repository = base adoption canonical_repository
canonical_ref        = refs/remotes/<remote>/<branch>
canonical_tip_sha    = resolve(canonical_ref)
```

Trust requires:

- remote URL normalizes to `canonical_repository`
- canonical ref is a remote-tracking branch, not a local branch/tag
- canonical tip exists locally
- current HEAD and canonical tip have a merge-base
- canonical tip is reachable from the configured upstream lineage

Optional local `--base-ref` is an assertion only.

```text
accepted if argument is:
  exact canonical_ref
  OR exact SHA equal to canonical_tip_sha
```

Any other symbolic ref or SHA is exit 2 `untrusted-base-ref`.

Rejected examples:

```text
--base-ref HEAD
--base-ref refs/heads/feature
--base-ref refs/tags/unmerged-adoption
--base-ref <feature-only-sha>
```

### 10.9 Trusted merge-base and adoption authority

```text
merge_base_sha = git merge-base(current_head, canonical_tip_sha)
```

Authority-bearing normalized payload:

```text
artifact identity
visual_intent_contract
status
structured_since_snapshot
adopted_at
approved_by
approved_at
decision_id
canonical remote/branch/repository
canonical Legacy Unkeyed Baseline rows
canonical Legacy Pending Visual Dispositions rows
baseline_digest
```

```text
adoption_authority_trusted =
  adoption_proposal_trusted(current)
  AND canonical_history_anchor_trusted
  AND current.status == confirmed
  AND base artifact exists at merge_base_sha canonical path
  AND base artifact status == confirmed
  AND base proposal structure trusted
  AND current_authority_digest == base_authority_digest
  AND approval_decision_trusted(base)
  AND approval_decision_trusted(current)
  AND base/current approval identity/status/Owner agree
  AND approved_at <= merge_base_committed_at
```

Consequences:

- Newly added adoption artifact, even `status: confirmed`, is proposal-only.
- Draft→confirmed promotion in current branch is proposal-only until merged.
- Initial adoption PR cannot authorize screen/domain code in the same diff.
- `--base-ref HEAD` cannot turn that proposal into authority.
- After adoption and decision are merged into canonical branch, the next branch may use the unchanged artifact.
- Baseline/frontmatter/digest edit in working tree denies readiness immediately.
- Artifact delete/rename/duplicate denies authority.
- Canonical history unavailable denies authority.

### 10.10 Approval decision contract

`decision_id`는 새 decision-log가 아니라 기존 canonical global Open Decision row를 가리킨다.

```text
approval_decision_trusted(base_or_current) =
  global/open-decisions.md unique and hard-valid
  AND decision_id resolves exactly/case-sensitively to one global row
  AND no local ScreenSpec row has same ID
  AND row Status == resolved
  AND row Owner is nonempty/non-placeholder
  AND adoption.approved_by == row.Owner after trim
```

다음은 authority 0이다.

- missing/duplicate/malformed decision row
- local-only decision
- `Status=open`
- current tree에서만 resolved
- current tree에서 reopen
- `approved_by`와 Owner 불일치

### 10.11 Adoption two-stage workflow

Stage A — proposal/control-plane PR:

1. Audit trusted unkeyed effects.
2. Audit every unresolved/malformed visual candidate, regardless captured_at.
3. Fix/reconcile candidates where possible.
4. Add exact legacy pending dispositions only for human-reviewed residual cases.
5. Add adoption artifact as draft or confirmed proposal.
6. Add/reference one canonical global decision.
7. Human resolves decision and confirms proposal.
8. Validate baseline/digest and canonical history fields.
9. `visual-refresh` authority remains 0 because artifact is not in canonical merge-base.
10. Screen/domain code diff cannot cite the new artifact as authorization.
11. Merge the adoption PR into canonical branch.

Stage B — subsequent implementation PR:

1. Fetch canonical upstream containing unchanged confirmed artifact.
2. Resolve canonical anchor and merge-base.
3. Confirm base/current authority digests equal.
4. Reconcile new visual candidates to trusted dispositions.
5. Use `visual-refresh` with exact input and operation evidence.

### 10.12 Screen Source Map capability trust

```text
analyzeScreenSourceMapCapability(...) -> {
  structure_trusted,
  canonical_index,
  alias_index,
  namespace_index,
  diagnostics
}
```

Global structure requires canonical path/frontmatter, exact unique ten-column table, unique canonical
rows and structurally valid ScreenSpec references.

Alias relation states:

```text
authorizing
acknowledged-non-authorizing
conflicting
```

- one-canonical `confirmed|merged` → authorizing
- acknowledged `split|ambiguous` → relation-local non-authorizing
- candidate/deprecated → relation-local non-authorizing
- contradictory confirmed/merged → conflicting
- canonical-ID/source-alias collision → token-local conflicting

A valid split does not poison unrelated confirmed aliases.

### 10.13 Scope resolution

```text
scope_allows(screen) =
  active canonical screen exact relation
  OR authorizing source-map relation
```

Raw/source alias 자체는 authority를 만들지 않는다. Malformed/empty selected-input scope는
input trust false다.

For pending analysis:

```text
potentially_overlaps(candidate, screen) =
  canonical/authorizing scope contains screen
  OR unresolved raw screen token + affected domain contains screen.domain
  OR recoverable domain-only scope contains screen.domain
```

If neither screen nor domain scope can be recovered for a visual candidate, candidate index is
untrusted-global.

### 10.14 Canonical Evidence ref

```text
input:<input_id>#<section-slug>[/<1-based-bullet>]
```

Comparison은 canonical tuple 기준이다.

```text
same input ID + different section/bullet → not equal
```

Duplicate normalized refs는 invalid다.

### 10.15 Capability target identities

```text
mapping:<figma-mapping-artifact-id>/<mapping-key>
screen-visual:<screen-spec-artifact-id>/<visual-section-slug>
visual-family:<visual-contract-artifact-id>/<family-key>/<screen-id>
```

Family row 하나는 Member Screens의 canonical screen마다 key 하나로 전개된다.

```text
Family F members [SCREEN-A, SCREEN-B]
→ visual-family:<id>/F/SCREEN-A
→ visual-family:<id>/F/SCREEN-B
```

Ambiguous family fan-out은 keyed effect가 아니라 unkeyed blocker다.

### 10.16 Visual effect classification

```text
keyed-screen-visual:
  exact mapping/family-member/ScreenSpec identity

unkeyed-screen-visual:
  mapping/family/ScreenSpec visual surface에 닿고 screen scope가 있으나 exact key 없음

non-screen-visual:
  component-gap-register 등 screen code currentness를 직접 소유하지 않는 target
```

Whole mapping, section-only mapping, whole visual contract, section-only family target, whole
ScreenSpec와 ambiguous family fan-out은 unkeyed 예다.

### 10.17 Current active provenance adapters

Mapping:

```text
unique exact Mapping Key
one canonical Evidence ref
hard-valid Source Ref/Unit/Captured At
```

Family member:

```text
unique Family row
valid unique Member Screens
canonical Evidence ref set
one emitted key per current member
```

ScreenSpec optional table:

```markdown
## Visual Evidence

| Section | Evidence | Captured At | Status |
|---|---|---|---|
| ui-sections | input:IN-...#extracted-facts/01 | inherit | current |
```

Missing table means ScreenSpec section cannot authorize capability.

### 10.18 Trusted keyed effect ledger and completeness

```text
trusted_effects_by_key[key] = trusted keyed visual effects
latest_at(key) = max(effect.input.captured_at)
latest_trusted_refs(key) = refs at latest_at(key)
```

```text
relevant_target_keys(screen) =
  trusted keyed effects
  ∪ current active keys
  ∪ retirement keys
```

```text
active_complete(key) =
  unique hard-valid active record
  AND latest_trusted_refs(key) ⊆ active_record.evidence_refs
```

A newer unrelated key cannot hide an older/equal-time incomplete key.

### 10.19 Retirement tombstone and timestamp

```markdown
## Visual Target Retirements

| Target Key | Evidence | Captured At | Replaced By | Status |
|---|---|---|---|---|
| mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-...#extracted-facts/07 | inherit | mapping:CREATE-ATTACH-figma-component-mapping/M-020 | retired |
| visual-family:visual-consistency-contract/F/SCREEN-B | input:IN-...#extracted-facts/08 | inherit | - | retired |
```

Rules:

```text
Evidence count == 1 AND Captured At == inherit
→ effective timestamp = referenced input captured_at

Evidence count > 1 AND Captured At == inherit
→ hard-invalid

explicit RFC3339
→ must be >= every referenced input captured_at
```

```text
retired_complete(key) =
  unique valid tombstone
  AND latest_trusted_refs(key) ⊆ tombstone.evidence_refs
  AND effective timestamp >= latest_at(key)
```

Active record와 tombstone은 같은 exact key에 공존할 수 없다.

### 10.20 Family member removal and rename

```text
Before F members [A,B]
After  F members [A]
```

Required:

```text
visual-family:<id>/F/A → active_complete
visual-family:<id>/F/B → retired_complete
```

B tombstone 누락은 SCREEN-B만 stale하게 한다. Family rename은 old member keys를 retire하고
new member keys를 active로 만든다.

### 10.21 Key-local current operations

```text
active_operation(effect) =
  effect ref in active record
  AND active_complete(key)
  AND effect ref in latest_trusted_refs(key)
```

```text
retirement_operation(effect) =
  effect ref in tombstone
  AND retired_complete(key)
  AND effect ref in latest_trusted_refs(key)
  AND tombstone is latest complete authored state for key
```

Different-key newer event는 older disjoint operation을 거부하지 않는다. Same-key newer effect만
이전 operation을 폐기한다.

`current_visual_revision_at`과 `current_visual_event_at`은 report-only aggregate다.

### 10.22 Operation scope

```yaml
operation_scope:
  kind: retirement-only | active-update | mixed
  authorized_operations:
    - effect_ref: visual-effect:IN-REMOVE/01/update/<target-sha256>
      target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-002
      operation: retire
      evidence_ref: input:IN-REMOVE#extracted-facts/03
```

Stage 06 Packet은 exact operations를 복사한다. Run Report는 operations와 changed files를
연결한다. Post-change validator는 visual contract delta가 operation set 밖 key를 변경하지
않았는지 검사한다.

### 10.23 Immutable legacy unkeyed baseline and resolutions

Unkeyed effect가 non-blocking인 경우:

```text
(effect_ref, screen_id) is in immutable adoption baseline
OR
(effect_ref, screen_id) has a valid explicit resolution
```

```markdown
## Unkeyed Visual Resolutions

| Effect Ref | Screen ID | Resolution Kind | Target Keys | Resolving Evidence | Decision Ref |
|---|---|---|---|---|---|
| visual-effect:IN-U/01/update/<target-sha256> | CREATE-ATTACH | refined-to-key | mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-E2#extracted-facts/03 | - |
```

Resolution kinds:

```text
refined-to-key
superseded-by-keyed
no-screen-impact
```

`no-screen-impact`는 unique human-resolved canonical decision을 요구한다. Resolution은 blocker만
제거하며 authority는 exact keyed operation에서만 나온다.

### 10.24 Visual candidate classifier

Candidate discovery starts before Input Result hard trust.

```text
classify_visual_candidate(file) =
  trusted-visual
  OR recoverable-deny-only-visual
  OR non-visual
  OR untrusted-global
```

#### Trusted visual

```text
input_artifact_trusted
AND visual_impact_declared(input)
```

#### Recoverable deny-only visual

```text
frontmatter parseable
AND unique valid recovered input_id
AND structured visual hint exists
AND scope is recoverable
AND input_artifact_trusted == false
```

Examples:

- missing `captured_by`
- missing/invalid `status`
- deprecated/invalid confidence
- invalid supersedes reference
- one invalid non-scope field

These candidates never create positive authority. They block potentially-overlapping screens until fixed or explicitly dispositioned.

#### Untrusted-global

Examples:

- unparseable YAML input file
- duplicate/ambiguous recovered input ID
- visual hint exists but no recoverable screen/domain scope
- conflicting scope fields that cannot be reconciled

`untrusted-global` makes visual intent inapplicable repository-wide until fixed.

#### Non-visual

Trusted meeting/user-note without visual enum, `impact_axes: [visual]` or canonical Figma hint is not a visual candidate.

### 10.25 Pending visual input resolutions

Inputs without a trusted effect ref need an input-level resolution contract.

```markdown
## Pending Visual Input Resolutions

| Input ID | Screen ID | Resolution Kind | Resolving Input | Target Keys | Resolving Evidence | Decision Ref |
|---|---|---|---|---|---|---|
| IN-PENDING | CREATE-ATTACH | superseded-by-trusted-input | IN-NEW | mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-NEW#extracted-facts/03 | - |
| IN-NO-IMPACT | CREATE-ATTACH | no-screen-impact | - | - | - | D-NO-SCREEN-IMPACT |
```

Resolution kinds:

```text
superseded-by-trusted-input
no-screen-impact
canonical-screen-exclusion
```

`superseded-by-trusted-input` requires:

- resolving input trusted
- explicit source lineage/supersession or human-approved lineage transition
- resolving input later when both timestamps are trusted
- exact keyed, resolved-unkeyed or trusted non-screen disposition
- target/evidence projection complete

`no-screen-impact` requires one human-resolved canonical global decision.

`canonical-screen-exclusion` requires trusted canonical/authorizing scope proof that the selected screen is excluded.

A resolution clears only the named `(Input ID, Screen ID)` blocker and creates no positive authority.

### 10.26 Adoption-time pending completeness

Adoption proposal is invalid until every visual candidate existing at `adopted_at` is classified.

```text
adoption_candidate_complete(candidate, screen) =
  trusted resolved disposition
  OR immutable legacy unkeyed baseline row
  OR immutable legacy pending disposition row
```

Legacy pending disposition uses the same kind contracts as §10.25 and is included in the adoption digest.

The following cannot be silently grandfathered:

- register row missing
- not-started/in-progress/failed
- Input Result-invalid candidate
- scope-unclear candidate
- non-visual enum input with visual impact but no `impact_axes`

Untrusted-global candidates must be fixed before adoption; they cannot be waived by a baseline row.

### 10.27 Pending visual uncertainty index

Index는 selected input의 graph component나 timestamp보다 repository candidate set을 우선한다.

```text
pending_visual_uncertainty(selected, screen) =
  every visual candidate except selected
  AND potentially_overlaps(candidate, screen)
  AND candidate has no trusted resolved disposition
  AND candidate is not covered by immutable legacy baseline/disposition
```

There is no `candidate.captured_at >= selected.captured_at` filter.

Older unresolved example:

```text
IN-OLD @ 09:00 register missing, same screen/domain
IN-A   @ 10:00 exact M-001 current
→ IN-OLD remains pending blocker
→ IN-A denied until IN-OLD is resolved/dispositioned
```

Blocking dispositions:

```text
register-missing
not-started
in-progress
failed
input-result-invalid-recoverable
reconciled-hard-invalid
summary-projection-invalid
RR-SCHEMA/RR-ITEM/RR-REF/RR-ROUTE/RP input-local hard error
visual-impact-contract-mismatch
scope-unclear
unresolved-unkeyed
no-trusted-screen-disposition
```

`Reconcile Status=reconciled` 문자열은 trust를 대체하지 않는다.

### 10.28 Trusted resolved dispositions

Pending blocker가 해제되는 경우:

```text
resolved-keyed:
  reconciliation input/group/projection trusted
  AND every screen-relevant visual effect exact-keyed
  AND keys projection-complete

resolved-unkeyed:
  every relevant unkeyed effect has valid explicit resolution

resolved-non-screen:
  trusted routing proves only non-screen-visual outcome
  OR human-resolved no-screen-impact relation

resolved-disjoint-screen:
  trusted canonical scope excludes selected screen

resolved-pending-input:
  valid Pending Visual Input Resolution or immutable legacy pending disposition
```

Same screen의 disjoint exact key도 pending uncertainty를 해제한다. Same-key revocation은 key ledger가 소유한다.

### 10.29 Visual routing/source alignment

For repositories with trusted adoption authority:

```text
capability_visual_row_trusted(row) =
  Basis == visual-evidence
  AND input visual_impact_declared
  AND ordinary RR/RP routing/provenance trust
```

A meeting/user-note can carry visual evidence only when it declares:

```yaml
impact_axes:
  - visual
```

A post-adoption `Basis=visual-evidence` row without that declaration is hard-invalid for capability use and keeps the input pending.

Pre-adoption historical rows are handled by adoption audit. No-adoption repositories retain current general v2 behavior and receive no new global required check.

### 10.30 Input supersession graph trust

```text
successor -> predecessor
where successor.frontmatter.supersedes == predecessor.input_id
```

Trusted edge:

```text
successor captured_at > predecessor captured_at
same source_type
same source_lineage
frontmatter/Summary Supersedes parity
```

Component requires unique nodes, no self edge, acyclic graph and no branch ambiguity.

Graph는 predecessor의 모든 operations를 globally revoke하지 않는다.

```text
key_operation_superseded(effect) =
  newer trusted effect for same exact key
  OR explicit keyed resolution revokes exact effect/key
```

`graph_leaf`는 report provenance다.

### 10.31 Legacy lineage adoption and source move

Historical input is immutable. Do not backfill lineage or invent invalid cross-lineage supersession.

```yaml
source_lineage: figma-screen://file/new-file/CREATE-ATTACH
lineage_transition:
  from_input: IN-OLD
  reason: source-move
```

Transition requires:

- from input exists
- new input trusted
- old/new resolve to same canonical screen
- new input creates current exact operations or explicit pending resolution
- transition alone is not authority

### 10.32 Final evidence formula

```text
intent_evidence_valid =
  canonical_history_anchor_trusted
  AND adoption_authority_trusted
  AND visual_candidate_index_trusted
  AND selected_input.input_artifact_trusted
  AND selected_input.visual_impact_declared
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND scope_allows(selected_screen)
  AND every selected screen-resolving effect has unique 4-tuple effect ref
  AND every selected screen-resolving effect is exact-keyed
  AND every selected screen-resolving effect is key-locally current
  AND every selected operation is not key-superseded
  AND every relevant exact key is projection-complete
  AND blocking_unkeyed(screen) is empty
  AND pending_visual_uncertainty(selected_input, screen) is empty
  AND target_provenance_state == current
  AND selected supersession component is trusted
```

Not required:

```text
selected_input.captured_at == current_visual_event_at(screen)
selected_input_is_graph_leaf
```

### 10.33 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  history:
    source: canonical-upstream
    canonical_repository: github:owner/repository
    canonical_ref: refs/remotes/origin/main
    canonical_tip_sha: 0123456789abcdef
    base_ref_assertion: refs/remotes/origin/main
    assertion_verified: true
    merge_base_sha: abcdef0123456789
    base_adoption_blob_sha: 0123456789abcdef
    base_authority_digest: sha256:aaa
    current_authority_digest: sha256:aaa
    trusted: true
  adoption:
    artifact_id: visual-intent-adoption
    authority_trusted: true
    approval_decision:
      id: D-VISUAL-INTENT-ADOPTION
      owner: PM
      status: resolved
  candidate_index:
    trusted: true
    unresolved_global_candidates: []
  evidence:
    input_id: IN-A
    visual_impact_declared: true
    input_artifact_trusted: true
    reconciliation_trusted: true
    graph_leaf: false
    pending_visual_uncertainty: []
    blocking_unkeyed_effects: []
    operation_scope:
      kind: active-update
      authorized_operations:
        - effect_ref: visual-effect:IN-A/01/update/<target-sha256>
          target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-001
          operation: update
          evidence_ref: input:IN-A#extracted-facts/01
          key_local_current: true
```

---

## 11. Decision D3 — `visual-refresh` Authorization과 Deny Claims

### 11.1 Applicability

```text
target exists
AND active lifecycle
AND final-fixture facts/cap satisfied
AND intent_evidence_valid
```

Required mode는 `final-fixture-ui`; base maturity는 유지한다.

### 11.2 Deny claim schema

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

`authored_path`는 claim top-level canonical field다.

### 11.3 Exact waiver predicate

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

### 11.4 Positive physical envelope

```text
intent candidates =
  resolve({roles.screen})
  ∪ resolve({roles.domain_component})
```

Hook/API-client, candidate, delegated shared, shell reservation, generated, other-owner paths는
non-waivable deny다.

### 11.5 Effective formula

```text
matching_claims = all matching deny claims
waived_claims   = exact-waivable claims
active_denies   = matching_claims - waived_claims

allowed =
  intent applicable
  AND physical candidate match
  AND active_denies empty
```

Physical allowed는 exact operation scope를 지우지 않는다.

### 11.6 Output stability

No-intent output에 `work_intent`를 추가하지 않는다. Base `allowed_paths`를 intent path와
합치거나 교체하지 않는다.

---

## 12. Decision D4 — App Shell Artifact Model과 Physical Roots

### 12.1 Artifact and identity

```text
docs/frontend-workflow/app/shells/{shell}/shell-spec.md
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
```

Required: `artifact_id`, `artifact_type`, `shell_id`, `status`.
Optional: implementation paths, decision refs, API requirement, sources/dependencies/review.

Forbidden:

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

### 12.2 Typed declarations

```yaml
implementation_paths:
  - path: src/app/_layout.tsx
    kind: route-host
  - path: src/components/app-shell/host/**
    kind: shell-host
  - path: src/features/app-shell-runtime/hooks/**
    kind: hook
  - path: src/api/app-shell/**
    kind: api-client
```

Allowed kinds: `route-host|shell-host|hook|api-client`.
Declaration owns semantic kind and reservation provenance, not physical authority.

### 12.3 Target-profile root slots

```yaml
target_profiles:
  app-shell-v1:
    path_roots:
      route-host:
        role: app_shell_route_host
        binding: exact-file
        presence: optional
        resolution: on-declaration
      shell-host:
        role: app_shell_host
        binding: covered
        presence: optional
        resolution: on-declaration
      hook:
        role: app_shell_hook
        binding: covered
        presence: optional
        resolution: on-declaration-or-candidate
      api-client:
        role: api_client
        binding: covered
        presence: required-on-use
        resolution: on-declaration-or-candidate
```

### 12.4 Layout bindings

```yaml
roles:
  app_shell_route_host:
    - src/app/_layout.tsx
    - src/app/(authenticated)/_layout.tsx
  app_shell_host:
    - src/components/app-shell/host/**
  app_shell_hook:
    - src/features/app-shell-runtime/hooks/**
  api_client:
    - src/api/**
```

`app_shell_route_host`는 exact file only다. Broad subtree는 invalid다.

### 12.5 Lazy resolver

```text
resolveTargetProfileRoot(...) ->
  unused | bound | optional-unbound | required-on-use-unbound | invalid
```

- no shell → no lookup
- unused kind → no role lookup
- missing optional root → target-local permission 0, readiness exit 0
- API kind used + missing `api_client` → permission 0 + deny-only
- ordinary role lookup → existing LayoutConfigError/exit 2

No-API host-only shell은 `api_client`를 resolve하지 않는다.

### 12.6 Root binding

```text
root_binding(entry) =
  exactly one same-kind root fully covers path
  AND no different-kind root overlaps path
```

Zero/multiple/contradictory roots는 fail closed한다. Recoverable path는 deny-only다.

### 12.7 Fact profile

| Mode | Target-specific minimum |
|---|---|
| docs-only | artifact parse only |
| route-skeleton | valid identity/status/nav reference |
| screen-skeleton | core sections + root-bound host paths |
| rough-fixture-ui | state/non-route interactions complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API special case or valid actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.8 Path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | route-host |
| screen-skeleton | route-host, shell-host |
| rough/final | host + valid owned hook slices |
| api-integrated | valid hook/API slices; host frozen |
| production-ready | host + valid slices; unowned API denied |

### 12.9 No-API profile

```text
if api_required == false and readiness >= api-integrated-ui:
  effective_path_profile = no-api-host
```

Allowed: root-bound route-host/shell-host. Denied: hook/API/candidate/generated/Tier3/custom/other-owner.

---

## 13. Decision D5 — Target-aware API Candidate Ownership

### 13.1 Generic owner

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

Existing `screen_id` may remain compatibility alias in legacy output.

### 13.2 Surface resolution

- screen: existing domain/layout hook/API roles
- shared-surface: existing surface parser + generic conflict index
- app-shell hook: root-bound typed hook parent
- app-shell API: root-bound typed API parent; triggers required-on-use resolution

### 13.3 Tracking

`unknown:U-...` resolves in the same owner artifact.

### 13.4 Positive authority

```text
same owner
contract valid
confirmed + active
slice in one trusted typed parent
kind/root matches
no conflict
api_required != false
```

### 13.5 Deny-only candidate provenance

Deferred, invalid, outside declaration, root-unbound, required-on-use-unbound, kind mismatch,
cross-target conflict와 no-API candidate는 recoverable project-wide deny claim을 보존한다.

---

## 14. Decision D6 — Target-scoped Open Decisions

### 14.1 Existing schema

Canonical global register의 six columns와 `open|resolved` lifecycle을 재사용한다.

```text
ID | Decision Needed | Options | Blocking Mode | Owner | Status
```

### 14.2 Human-only transition

Agents may add open rows/references or source-backed conflict로 reopen할 수 있다.
`open → resolved`, re-resolution, confirmed promotion은 human-only다.

### 14.3 App-shell scope

App-shell `decision_refs`가 global row를 참조한다. Open/malformed ref는 해당 shell만 cap하며
unrelated screen/shared surface에는 fan-out하지 않는다.

### 14.4 Adoption and pending resolution approval

Adoption `decision_id`, unkeyed `no-screen-impact`, pending input `no-screen-impact`도 동일 global
resolver를 재사용한다. Local row, zero/multiple match, open status는 authority/blocker resolution을
만들지 않는다.

### 14.5 No #224 expansion

이 설계는 future append-only decision-log, supersession 또는 history schema를 만들지 않는다.

---

## 15. Decision D7 — Global Ownership, Recovery, Reservation

### 15.1 Namespace

```text
ScreenSpec route_entry/screen_entry
shared-surface implementation_paths
app-shell typed implementation_paths
API Candidate Slice Paths
generated outputs
```

### 15.2 Recovery classes

A. trusted typed + root-bound → normal ownership + positive candidate  
B. invalid but safely canonicalizable → deny-only ambiguous shell ownership  
C. no trustworthy project-relative target → no physical claim + hard error

### 15.3 Deny-only claim

```yaml
deny_claim:
  claim_id: deny:ambiguous-app-shell:MAIN-SHELL:0
  path: src/api/app-shell/**
  authored_path: src/api/app-shell/**
  deny_class: ambiguous-owner
  source:
    kind: app-shell-reservation
    shell_id: MAIN-SHELL
    reason: required-on-use-root-unbound
  overrideable_by: []
  owner:
    target_type: app-shell
    target_id: MAIN-SHELL
```

### 15.4 Precedence

Valid/deny-only shell reservations는 every screen/shared/other-shell context에 투영한다.
Broad `src/**`는 우회할 수 없다.

---

## 16. Public CLI Contract

Selectors:

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

Mutually exclusive다.

### 16.1 CI visual intent

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --json
```

CI event의 PR base SHA가 authoritative다.

```text
CI + --base-ref
→ exit 2
→ base-ref-override-forbidden
```

### 16.2 Local visual intent

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --base-ref refs/remotes/origin/main \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

`--base-ref` is optional assertion. It must resolve to the canonical tip declared by the base adoption artifact.

```text
--base-ref HEAD
--base-ref feature-branch
--base-ref local-tag
--base-ref feature-only-sha
→ exit 2 untrusted-base-ref
```

History unavailable은 syntax error가 아니라 keyed `applicable:false`, exit 0이다.
Unknown intent, missing input, selector conflict, malformed IDs/noncanonical path는 exit 2다.

### 16.3 App shell

```bash
npm run workflow:readiness -- \
  --app-shell MAIN-SHELL \
  --path src/app/_layout.tsx \
  --json
```

Optional adoption preview command는 proposal을 생성할 수 있지만 authority를 confirm하지 않는다.

---

## 17. workflow-state Contract

### 17.1 Adoption state

```yaml
visual_intent_adoption:
  proposal_trusted: true
  authority_trusted: true
  status: confirmed
  contract: 1
  structured_since_snapshot: "2026-07-20T00:00:00+09:00"
  baseline_digest: sha256:...
  legacy_unkeyed_count: 3
  legacy_pending_count: 2
  history:
    source: canonical-upstream
    canonical_repository: github:owner/repository
    canonical_ref: refs/remotes/origin/main
    canonical_tip_sha: 0123456789abcdef
    merge_base_sha: abcdef0123456789
    base_blob_sha: 0123456789abcdef
    base_authority_digest: sha256:aaa
    current_authority_digest: sha256:aaa
    unchanged_from_base: true
  approval_decision:
    id: D-VISUAL-INTENT-ADOPTION
    owner: PM
    base_status: resolved
    current_status: resolved
```

New proposal in current branch emits `authority_trusted:false`, reason `adoption-not-in-trusted-base`.

### 17.2 Candidate index

```yaml
visual_candidate_index:
  trusted: true
  candidates:
    IN-B:
      candidate_state: deny-only
      input_artifact_trusted: false
      visual_impact_declared: true
      scope_state: canonical-screen
      screens:
        - CREATE-ATTACH
      hard_errors:
        - missing-required-field:captured_by
```

Unrecoverable candidate emits `trusted:false`, reason `visual-input-contract-uncertain`.

### 17.3 Visual evidence state

```yaml
visual_evidence:
  CREATE-ATTACH:
    target_provenance_state: current
    blocking_unkeyed_effects: []
    pending_visual_uncertainty: []
    keys:
      mapping:CREATE-ATTACH-figma-component-mapping/M-001:
        state: active-complete
        latest_refs:
          - input:IN-A#extracted-facts/01
```

### 17.4 App shells

Emit `app_shells` only when adopted.

```yaml
app_shells:
  MAIN-SHELL:
    status: confirmed
    api_required: false
    implementation_paths:
      - path: src/app/_layout.tsx
        kind: route-host
        root_binding:
          state: bound
          role: app_shell_route_host
          root: src/app/_layout.tsx
    target_root_states:
      api-client:
        state: unused
```

### 17.5 Determinism

Sort target IDs, effect refs, keys, screens, refs, inputs, claims and diagnostics. Serialized trust
indexes include source/base hashes; stale generated trust is rejected.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Arbitrary base ref rejected

```json
{
  "error": {
    "code": "untrusted-base-ref",
    "provided": "HEAD",
    "canonical_ref": "refs/remotes/origin/main"
  },
  "exit_code": 2
}
```

### 18.2 CI override rejected

```json
{
  "error": {
    "code": "base-ref-override-forbidden",
    "authority_source": "ci-pull-request-base"
  },
  "exit_code": 2
}
```

### 18.3 Newly added adoption cannot self-authorize

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "history": {
        "canonical_tip_sha": "0123456789abcdef",
        "merge_base_sha": "abcdef0123456789",
        "base_adoption_present": false,
        "current_proposal_trusted": true,
        "authority_trusted": false
      },
      "blocking": [
        {"kind": "adoption-not-in-trusted-base"}
      ]
    }
  }
}
```

### 18.4 Older unresolved visual input

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": false,
      "evidence": {
        "pending_visual_uncertainty": [
          {
            "input_id": "IN-OLD",
            "captured_at": "2026-08-20T09:00:00+09:00",
            "selected_captured_at": "2026-08-20T10:00:00+09:00",
            "age_relation": "older",
            "reason": "register-missing",
            "still_blocking": true
          }
        ]
      }
    }
  }
}
```

### 18.5 Recoverable malformed Figma input

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": false,
      "evidence": {
        "pending_visual_uncertainty": [
          {
            "input_id": "IN-B",
            "candidate_state": "deny-only",
            "input_artifact_trusted": false,
            "visual_hints": ["source-type:figma"],
            "reason": "input-result-invalid-recoverable",
            "hard_errors": ["missing-required-field:captured_by"]
          }
        ]
      }
    }
  }
}
```

### 18.6 Unrecoverable candidate index

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "blocking": [
        {
          "kind": "visual-input-contract-uncertain",
          "file": "docs/frontend-workflow/inputs/create/broken.md",
          "reason": "scope-unrecoverable"
        }
      ]
    }
  }
}
```

### 18.7 Visual impact mismatch

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-MEETING",
      "applicable": false,
      "blocking": [
        {
          "kind": "visual-impact-contract-mismatch",
          "required": "impact_axes: [visual]"
        }
      ]
    }
  }
}
```

### 18.8 Disjoint current predecessor remains eligible

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": true,
      "evidence": {
        "graph_leaf": false,
        "pending_visual_uncertainty": [],
        "operation_scope": {
          "kind": "active-update",
          "authorized_operations": [
            {
              "effect_ref": "visual-effect:IN-A/01/update/<target-sha256>",
              "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-001",
              "operation": "update",
              "key_local_current": true
            }
          ]
        }
      }
    }
  }
}
```

### 18.9 Pure retirement

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-REMOVE",
      "applicable": true,
      "evidence": {
        "operation_scope": {
          "kind": "retirement-only",
          "authorized_operations": [
            {
              "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-002",
              "operation": "retire"
            }
          ]
        }
      }
    }
  }
}
```

### 18.10 No-API shell

```json
{
  "MAIN-SHELL": {
    "api_required": false,
    "readiness_mode": "api-integrated-ui",
    "effective_path_profile": "no-api-host",
    "target_root_states": {
      "api-client": {"state": "unused"}
    },
    "allowed_paths": [
      "src/app/_layout.tsx",
      "src/components/app-shell/host/**"
    ]
  }
}
```

---

## 19. validate/backstop Contract

### 19.1 Shared analyzers

Pure analyzers:

- Input Result Contract
- invalid-input candidate facts/recovery
- visual impact declaration
- Reconciliation Contract v2
- canonical Target tuple/fingerprint/effect ref
- adoption proposal current-tree trust
- canonical history-anchor trust
- adoption base-anchor trust
- adoption approval decision trust
- canonical Evidence normalization
- mapping/family-member/ScreenSpec target resolution
- keyed effect ledger
- unkeyed baseline/resolution
- pending input baseline/resolution
- active provenance/retirement timestamp
- per-key completeness/current operations
- supersession graph
- repository-wide all-age pending visual uncertainty
- Screen Source Map structure/relation state
- app-shell roots/ownership/deny claims

### 19.2 Canonical history resolver

```text
resolveCanonicalHistoryAnchor({
  executionEnvironment,
  ciPullRequestBaseSha,
  currentHead,
  currentTree,
  localGitRefs,
  optionalBaseRefAssertion
}) -> {
  source,
  canonicalRepository,
  canonicalRef,
  canonicalTipSha,
  mergeBaseSha,
  assertionVerified,
  trusted,
  diagnostics
}
```

CI:

- authenticated PR base SHA authoritative
- explicit argument forbidden

Local:

- canonical repository/remote/branch read from trusted base adoption payload
- remote URL identity verified
- only remote-tracking canonical ref accepted
- optional assertion must equal canonical ref or exact tip SHA

Current feature ref, arbitrary tag or caller-selected commit never becomes trust source.

### 19.3 History-aware adoption analyzer

```text
analyzeVisualIntentAdoptionAuthority({
  currentTree,
  trustedBaseTree,
  canonicalHistory,
  evaluationNow
}) -> {
  proposal_trust,
  base_anchor_trust,
  approval_decision_trust,
  authority_trust,
  diagnostics,
  provenance
}
```

Current-tree-only result는 authority로 사용할 수 없다. Trusted base bytes/semantic digest가 없으면
`authority_trust=false`다.

### 19.4 Initial creation and immutable-base guard

Base에 adoption artifact가 없고 current tree에 새 artifact가 있으면:

```text
proposal_trust may be true
authority_trust = false
reason = adoption-not-in-trusted-base
```

Hard authority failures:

- canonical base mismatch/untrusted ref
- base artifact missing
- current/base semantic authority digest mismatch
- confirmed artifact deletion/rename/duplicate
- immutable frontmatter/baseline/disposition edit
- baseline digest recomputation after mutation
- register `structured_since` differs from snapshot
- approval decision missing/open/malformed/duplicate
- base/current decision row disagreement
- `approved_by` != canonical Owner
- history unavailable

### 19.5 Visual candidate analyzer

```text
analyzeVisualCandidates({inputs, adoption, screenIndex, sourceMap}) -> {
  index_trusted,
  candidates_by_input,
  untrusted_global_files,
  diagnostics
}
```

It must inspect all files collected as input artifacts, including parseable invalid artifacts.

- trusted visual declaration → normal candidate
- recoverable invalid visual hint/scope → deny-only candidate
- unrecoverable identity/scope → index untrusted
- ordinary non-visual input → excluded

Candidate age does not remove it from the index.

### 19.6 Pending uncertainty analyzer

```text
analyzePendingVisualUncertainty({
  candidateIndex,
  reconciliationTrust,
  unkeyedResolutions,
  pendingInputResolutions,
  adoptionLegacyBaselines,
  selectedInput,
  selectedScreen
})
```

It includes:

- older, equal-time and newer candidates
- linked and unlinked candidates
- trusted and recoverable-invalid candidates
- reconciled-but-RR/RP-invalid candidates

It excludes only candidates with one trusted disposition or immutable baseline/disposition row.

### 19.7 Forward and backstop parity

`workflow:readiness --path`와 `workflow:forbidden-paths`는 동일 authorization context를 사용한다.
Both require:

```text
canonical history anchor trust
AND current-tree proposal trust
AND immutable-base adoption trust
AND approval decision trust
AND visual candidate index trust
AND identical pending uncertainty result
```

Readiness는 CI에서 나중에 발견할 base/candidate failure를 먼저 허용하지 않는다.

### 19.8 Authorization order

```text
1 concrete path canonicality
2 target/lifecycle/contract validity
3 resolve canonical history anchor
4 adoption proposal trust
5 adoption base-anchor/decision authority trust
6 collect all input candidate facts, including invalid recoverable files
7 validate candidate index completeness
8 selected input artifact/visual-impact trust
9 reconciliation/effect trust
10 effect identity
11 screen scope relation
12 keyed/unkeyed/non-screen classification
13 Evidence normalization
14 exact key and active/tombstone binding
15 per-key projection completeness
16 immutable unkeyed/pending baseline or explicit resolutions
17 all-age repository pending visual uncertainty
18 selected key-local active/retirement operation
19 supersession graph component trust
20 intent prerequisite/base readiness
21 target-root lazy resolution/no-API profile
22 positive physical profile
23 ownership/generated/candidate denies
24 claim waiver and deny precedence
25 structured operation provenance
```

### 19.9 Operation-scope postcondition

Stage 06 output validation:

- active/retired visual owner changes are subset of authorized keys
- retirement-only run cannot mutate unrelated active records
- mixed run may mutate only selected operations
- new unresolved unkeyed row is forbidden
- pending input cannot be silently deleted or omitted
- resulting ledger remains current

### 19.10 Packet/Report

Copy, never recompute:

- canonical repository/ref/tip/merge-base SHA
- base/current authority digests
- base-ref assertion result
- approval decision provenance
- candidate index trust and deny-only candidates
- pending input baseline/resolution provenance
- input/reconciliation trust
- visual impact declaration
- effect ref/Target fingerprint
- scope relation
- exact keys/refs
- unkeyed resolution
- pending visual uncertainty
- key-local operation state
- graph/lineage transition
- root bindings
- waived/active deny claims

### 19.11 Warning-first boundary

General source-map doctor와 visual-consistency checks는 warning-first다. Capability analyzers는
authorization evidence 사용만 deny하며 일반 command를 global required CI로 승격하지 않는다.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input result | impact_axes, candidate-fact analyzer, lineage/transition |
| reconciliation | 4-tuple effect ref, visual-impact predicate, exact disposition |
| visual-intent adoption | canonical history config, legacy unkeyed/pending baselines, approval |
| open decisions | adoption/no-impact approval, existing six-column/human transition |
| Figma mapping | active provenance + retirements |
| visual consistency | family member keys/evidence/retirements |
| ScreenSpec | optional Visual Evidence + retirements |
| screen identity | source-map capability relation |
| readiness | canonical history + all-age candidate index |
| forbidden paths | same history/candidate context helper |
| project layout | shell root roles/lazy resolver |
| implementation policy | target-profile roots |
| app-shell reference | typed paths, roots, no-API, recovery |
| Stage 04 | exact target/effect identity, impact declaration, dispositions |
| Stage 05/06/08 | proposal/implement/validate/report |
| implement-screen | base-anchored adoption + exact operations only |
| implement-app-shell | root-bound readiness only |
| COMMANDS | intent/input/canonical-base/adoption/shell examples |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| no adoption artifact | no-intent unchanged; visual intent 0 |
| new adoption in current branch | proposal valid; authority 0 |
| draft adoption in base/current | authority 0 |
| unchanged confirmed adoption in canonical merge-base | may authorize |
| `--base-ref HEAD` | exit 2 |
| feature branch/tag base ref | exit 2 |
| CI base + explicit override | exit 2; CI base authoritative |
| canonical local upstream tip | accepted |
| fake/missing/open approval decision | authority 0 |
| base/current adoption mismatch | readiness/backstop both deny |
| trusted base unavailable | visual intent 0 |
| same input/item/effect + different Target | distinct refs |
| exact duplicate 4-tuple | existing hard error |
| exact active input | may authorize active update |
| exact retirement input | may authorize removal |
| historical retirement | permission 0 |
| incomplete exact key | affected screen stale |
| immutable legacy unkeyed row | advisory non-authorizing history |
| immutable legacy pending disposition | clears exact legacy input/screen only |
| new unkeyed row | blocker until resolution |
| older register-missing visual input | blocker until disposition |
| older not-started visual input | blocker until disposition |
| recoverable invalid Figma input | deny-only blocker |
| unrecoverable visual candidate scope | visual candidate index fail closed |
| meeting/user-note + impact_axes visual | visual candidate/capability route eligible after trust |
| meeting/user-note without visual axis | ordinary non-visual; visual-evidence capability mismatch if later routed |
| ordinary non-visual meeting | not screen blocker |
| fully reconciled disjoint key | old disjoint operation released |
| trusted non-screen visual disposition | old screen operation not blocked |
| disjoint successor + supersedes | both key operations may execute |
| same-key successor | predecessor denied |
| family [A,B]→[A] | A active, B explicit retirement |
| split alias + unrelated confirmed alias | confirmed remains authorizing |
| no shell | no root lookup |
| no-API host shell without api_client | host readiness works |
| used API kind without API root | target-local deny-only |
| ordinary undefined role | existing LayoutConfigError |
| warning-first surfaces | no global promotion |

No new required CI check for non-adopters, dependency, release/version/tag.

---

## 22. Migration

### 22.1 Configure canonical history

Before adoption proposal:

1. Identify canonical repository identity.
2. Record canonical remote and branch in adoption proposal.
3. Fetch the canonical remote-tracking tip.
4. Verify PR CI exposes authenticated base SHA.
5. Do not use feature refs/tags as history anchors.

### 22.2 Two-stage visual-intent adoption

Proposal PR:

1. Ensure Reconciliation Register is valid Contract v2.
2. Audit every input file for visual candidate facts, including invalid recoverable files.
3. Fix unparseable or scope-unrecoverable visual candidates.
4. Reconcile existing register-missing/not-started/failed visual candidates where possible.
5. Audit trusted unkeyed screen-visual effects.
6. Create `visual-intent-adoption.md` as draft or confirmed proposal.
7. Snapshot `structured_since` and canonical history fields.
8. List exact legacy `(Effect Ref, Screen ID)` rows.
9. List only justified legacy pending `(Input ID, Screen ID)` dispositions.
10. Compute normalized digest over both tables and immutable frontmatter.
11. Add one canonical global approval decision.
12. Human resolves decision and confirms proposal.
13. Run proposal/current-tree and candidate-completeness validation.
14. Do not use the new artifact to authorize screen/domain code in the same change.
15. Merge the control-plane adoption PR into canonical branch.

Subsequent implementation PR:

1. Fetch canonical upstream containing adoption artifact and decision.
2. Resolve canonical tip/merge-base; optional base arg only asserts the exact tip.
3. Confirm base/current authority digests equal.
4. Reconcile or explicitly resolve every pending visual candidate, regardless age.
5. Run readiness with intent/input/concrete path.
6. Implement only exact operation scope.
7. Run validate/backstop and report history/candidate/effect provenance.

### 22.3 Visual impact metadata migration

Producers use visual enum where naturally applicable. Meeting/user-note inputs carrying Figma visual
changes add:

```yaml
impact_axes:
  - visual
```

After adoption, `Basis=visual-evidence` without `visual_impact_declared` is capability-invalid.
Pre-adoption legacy cases are audited during adoption and do not become implicit future exceptions.

### 22.4 Pending input resolution

- Older unresolved inputs are not aged out.
- `superseded-by-trusted-input` must cite a trusted resolving input and exact evidence.
- `no-screen-impact` requires human-resolved global decision.
- `canonical-screen-exclusion` requires authoritative scope proof.
- New candidates are resolved in the register, not appended to adoption baseline.

### 22.5 Input supersession

- `supersedes` records source lineage, not whole-screen operation revocation.
- Delta successor may use disjoint keys.
- Same-key update/retirement owns operation replacement.
- Whole-screen replacement must update/retire every affected key.
- Unresolved linked or unlinked inputs remain pending until trusted disposition.

### 22.6 #223 adoption

1. Preserve decision rows.
2. Add app-shell-spec draft.
3. Bind only used shell roots.
4. Declare typed paths inside roots.
5. No-API host-only shell need not define api_client.
6. Link decision refs/regenerate state.
7. Check shell/screen/shared paths.
8. Validate/backstop.

---

## 23. Implementation Slices

### 23.1 Slice A — Issue #222

Scope:

- Input Result/Reconciliation trust analyzers
- impact_axes schema/parser and visual-impact predicate
- invalid-input candidate facts/recovery
- canonical effect ref and Evidence normalization
- visual-intent adoption artifact/template/schema/manifest
- legacy unkeyed and legacy pending disposition tables
- approval decision resolver
- canonical CI/upstream history resolver
- shared readiness/backstop history context
- mapping/family-member/ScreenSpec target resolvers
- keyed ledger and unkeyed resolution
- Pending Visual Input Resolutions
- active/retirement operations
- supersession graph
- repository-wide all-age pending visual uncertainty
- projection completeness
- source-map relation
- deny claims and `visual-refresh`
- CLI/backstop/Packet/Report parity

Excludes app-shell artifacts, shared-surface semantic change, implementation completion ledger and #224.

Acceptance:

- no-intent compatibility
- arbitrary base ref cannot self-anchor adoption
- initial adoption same-change authority 0
- unchanged confirmed canonical-base adoption only
- resolved global approval decision required
- forward/backstop history parity
- adoption audits unresolved legacy visual inputs
- older unresolved visual input blocks until disposition
- invalid recoverable visual input remains deny-only
- unrecoverable candidate index fails visual intent closed
- non-visual category needs `impact_axes: [visual]` for capability visual routing
- fully trusted disjoint/non-screen disposition releases blocker
- current active or retirement exact operation only
- disjoint operations independently executable
- same-key predecessor denied
- pure last-key retirement executable
- family member removal deterministic
- Tier3/candidate/delegated/generated denies preserved

### 23.2 Slice B — Issue #223

Depends on Slice A authorization substrate.

Scope:

- app-shell artifact/template/schema/manifest
- target roots/lazy resolver
- exact route-host
- no-API profile
- generic candidate owner
- valid/deny-only ownership index
- state/readiness/validate/backstop
- skill/docs/distribution/migration

Acceptance:

- declaration alone creates no authority
- no-API host-only custom layout works without api_client
- used API kind without root fails closed
- outside-root/contradictory paths denied/reserved
- ordinary undefined role unchanged
- unrelated target cannot edit shell path

### 23.3 No Slice 0

Shared helpers ship with Slice A behavior. No abstraction-only PR.

---

## 24. File Impact Map

### Slice A

| Area | Expected files |
|---|---|
| input | `scripts/lib/input-artifact.mjs`, candidate facts, impact_axes, producer/schema/template/tests |
| reconciliation | `scripts/lib/reconciliation-items.mjs`, target/effect/trust/impact helpers/tests |
| adoption | artifact/template/schema/manifest/reference/history/baseline guards/tests |
| decisions | global resolver adapter for adoption/no-impact approvals/tests |
| history | canonical CI/upstream anchor resolver and CLI tests |
| mapping | mapping provenance/retirement parser/template/tests |
| family | visual consistency member-key/retirement tests |
| ScreenSpec | Visual Evidence/retirement parser/template/tests |
| identity | screen-source-map capability analyzer/tests |
| core | readiness/all-age candidate index/path authorization |
| backstop | forbidden-paths + same history/adoption/candidate context |
| execution | packet/report operation manifest/history/candidate provenance |
| docs/skills | input/visual refs, implement-screen, Stage 04/06/08, commands |

### Slice B

| Area | Expected files |
|---|---|
| layout/policy | layout schema/profile, target root resolver |
| artifact | app-shell template/schema/manifest/reference/skill |
| analyzer/state | shell analyzer/workflow-state |
| authorization | root binding/no-API/ownership/readiness |
| candidate | generic owner/tracking/conflict |
| validate/backstop | structural/root/ownership checks |
| distribution | pack/upgrade tests |
| docs | stages/matrix/migration |

---

## 25. Verification Matrix

### 25.1 #222

| # | Regression |
|---|---|
| 1 | no intent keeps API screen forbidden |
| 2 | valid current active input opens screen/domain only |
| 3 | valid current retirement opens removal path |
| 4 | mixed active update + retirement accepted |
| 5 | historical retirement denied |
| 6 | retirement scope cannot mutate unrelated key |
| 7 | invalid CLI combinations exit 2 |
| 8 | no adoption artifact → visual intent inapplicable |
| 9 | new draft adoption → proposal only, authority 0 |
| 10 | new confirmed adoption → proposal only, authority 0 |
| 11 | new confirmed adoption + screen diff same change → denied |
| 12 | unchanged confirmed adoption in canonical merge-base → accepted |
| 13 | base adoption missing → adoption-not-in-trusted-base |
| 14 | canonical history unavailable → readiness denied |
| 15 | canonical history unavailable → forbidden-paths denied |
| 16 | `--base-ref HEAD` with unmerged adoption → exit 2 |
| 17 | feature branch symbolic base ref → exit 2 |
| 18 | local tag pointing to unmerged adoption → exit 2 |
| 19 | feature-only SHA assertion → exit 2 |
| 20 | CI PR base present + explicit override → exit 2 |
| 21 | exact local canonical remote-tracking ref → accepted |
| 22 | exact SHA equal to canonical tip → accepted |
| 23 | remote URL differs from canonical repository → denied |
| 24 | canonical tip lacks adoption but feature has it → denied |
| 25 | current/base authority digest mismatch → readiness denied |
| 26 | baseline edit + digest recompute → readiness/backstop denied |
| 27 | adoption deletion/rename/duplicate → denied |
| 28 | structured_since snapshot mismatch → denied |
| 29 | future adopted_at/approved_at → denied |
| 30 | approval decision missing → denied |
| 31 | approval decision duplicate → denied |
| 32 | approval decision local-only → denied |
| 33 | approval decision open → denied |
| 34 | approval decision resolved only in current branch → denied |
| 35 | approval decision reopened in current → denied |
| 36 | approved_by differs from canonical Owner → denied |
| 37 | base/current decision disagreement → denied |
| 38 | v1/summary-only selected input → denied |
| 39 | malformed Summary/Items → denied |
| 40 | selected RR/RP-invalid group → denied |
| 41 | Effect outside update/create → denied |
| 42 | summary projection mismatch → denied |
| 43 | invalid selected input type/source/required field/timestamp → denied |
| 44 | duplicate selected input ID → denied |
| 45 | same input/item/effect + different targets → distinct refs |
| 46 | exact duplicate 4-tuple → existing hard error |
| 47 | fingerprint uses parsed canonical tuple |
| 48 | malformed Target has no trusted effect ref |
| 49 | target fingerprint collision → fail closed |
| 50 | direct canonical screen scope accepted |
| 51 | confirmed/merged source alias accepted |
| 52 | candidate/split/ambiguous alias non-authorizing |
| 53 | valid split does not poison unrelated confirmed alias |
| 54 | canonical/alias namespace collision token denied |
| 55 | malformed source map denies alias capability |
| 56 | exact mapping key required for authority |
| 57 | exact ScreenSpec visual section required |
| 58 | family target expands to member keys |
| 59 | ambiguous family fan-out → unkeyed blocker |
| 60 | exact mapping current Evidence accepted |
| 61 | same input ID, different Evidence bullet denied |
| 62 | exact family member Evidence accepted |
| 63 | every selected screen-resolving effect must bind |
| 64 | ledger survives active-row deletion |
| 65 | older incomplete key masked by newer other key → stale |
| 66 | equal-time unprojected key → stale |
| 67 | all latest-per-key refs reflected → current |
| 68 | key removed without tombstone → stale |
| 69 | malformed/duplicate retirement table → denied |
| 70 | single Evidence + inherit deterministic |
| 71 | multiple Evidence + inherit hard-invalid |
| 72 | explicit tombstone timestamp earlier than ref → denied |
| 73 | multi-Evidence valid explicit timestamp deterministic |
| 74 | active record and tombstone same key → invalid |
| 75 | later effect after retirement makes key stale |
| 76 | family [A,B]→[A]: A active, B retirement required |
| 77 | missing B tombstone makes B stale only |
| 78 | B removal does not poison A |
| 79 | family rename retires old and activates new member keys |
| 80 | immutable legacy unkeyed row advisory only |
| 81 | new unkeyed row blocks until resolution |
| 82 | unrelated newer exact event does not clear unkeyed blocker |
| 83 | refined-to-key resolution clears exact blocker |
| 84 | superseded-by-keyed requires explicit effect provenance |
| 85 | no-screen-impact requires human-resolved decision |
| 86 | partial multi-screen unkeyed resolution clears one screen only |
| 87 | component-gap-only result is non-screen |
| 88 | adoption proposal with old register-missing visual input and no disposition → denied |
| 89 | adoption proposal with old not-started visual input and no disposition → denied |
| 90 | adoption proposal with recoverable invalid visual input and no disposition → denied |
| 91 | adoption proposal with unparseable visual candidate → denied until fixed |
| 92 | valid legacy pending superseded-by-trusted-input disposition → accepted |
| 93 | valid legacy pending no-screen-impact decision → accepted |
| 94 | legacy pending disposition row is immutable after merge |
| 95 | older register-missing same-screen input blocks newer selected operation |
| 96 | older not-started same-screen input blocks |
| 97 | older failed same-screen input blocks |
| 98 | older scope-unclear same-domain input blocks conservatively |
| 99 | older input explicitly resolved to trusted disjoint screen → cleared |
| 100 | older input explicitly superseded/refined with complete projection → cleared |
| 101 | newer unlinked same-screen Figma + register missing blocks old operation |
| 102 | equal-time unlinked visual input blocks until disposition |
| 103 | linked successor reconciled with RR-REF hard error blocks old operation |
| 104 | linked successor projection mismatch blocks old operation |
| 105 | Reconcile Status=reconciled but input trust false blocks |
| 106 | recoverable malformed Figma missing captured_by → deny-only blocker |
| 107 | recoverable malformed Figma missing status → deny-only blocker |
| 108 | invalid supersedes ref on visual input → deny-only blocker |
| 109 | duplicate/ambiguous visual input ID → candidate index fail closed |
| 110 | unparseable visual input YAML → candidate index fail closed |
| 111 | visual candidate scope unrecoverable → candidate index fail closed |
| 112 | visual candidate timestamp invalid but scope recoverable → remains blocker |
| 113 | trusted figma enum input is visual candidate |
| 114 | trusted visual-spec enum input is visual candidate |
| 115 | meeting input with impact_axes visual is visual candidate |
| 116 | user-note input with impact_axes visual is visual candidate |
| 117 | ordinary meeting without visual axis is not visual blocker |
| 118 | post-adoption meeting visual-evidence without impact_axes visual → capability hard error |
| 119 | post-adoption meeting with impact_axes visual + trusted row → allowed candidate path |
| 120 | canonical Figma source_ref on malformed input acts as deny-only visual hint |
| 121 | natural-language mention of Figma alone does not create positive candidate |
| 122 | pending resolution superseded-by-trusted-input clears exact input/screen |
| 123 | pending resolution no-screen-impact requires resolved decision |
| 124 | pending canonical-screen-exclusion requires trusted scope proof |
| 125 | pending resolution creates no positive authority |
| 126 | disjoint input without supersedes leaves both operations executable |
| 127 | disjoint input with supersedes leaves both key operations executable |
| 128 | same-key successor denies predecessor operation |
| 129 | graph_leaf=false alone does not deny predecessor |
| 130 | fully trusted disjoint key releases pending blocker |
| 131 | fully trusted non-screen result releases pending blocker |
| 132 | unresolved unkeyed result remains blocker |
| 133 | whole-input replacement omitted key not silently retired |
| 134 | source move/new lineage same-key operation revokes old |
| 135 | transition without current operation/resolution denied |
| 136 | reversed/equal timestamp graph edge denied |
| 137 | cross-source/different-lineage/missing-lineage graph edge denied |
| 138 | cycle/branch/frontmatter-summary parity mismatch denied |
| 139 | final-level decision blocks intent |
| 140 | API-only higher blocker does not block final visual work |
| 141 | absorbed/malformed lifecycle denied |
| 142 | shared/shell/candidate/generated reservations denied |
| 143 | exact deny claim waiver succeeds |
| 144 | same-path Tier3 deny remains active |
| 145 | forward readiness and backstop share canonical anchor result |
| 146 | forward readiness and backstop share adoption digests |
| 147 | forward readiness and backstop share candidate index |
| 148 | forward readiness and backstop share pending all-age result |
| 149 | Packet/Report copies history, candidate and operation scope |
| 150 | postcondition rejects delta outside operation scope |
| 151 | no-intent legacy fixtures compatible |

### 25.2 #223

| # | Regression |
|---|---|
| 1 | no shell no-op/no root lookup |
| 2 | deterministic identity/state |
| 3 | shell decision caps shell only |
| 4 | malformed decision fails shell only |
| 5 | local Open Decisions rejected |
| 6 | forbidden identity fields rejected |
| 7 | invalid typed path denied |
| 8 | exact route-host accepted |
| 9 | ordinary route denied |
| 10 | route without ScreenSpec not adopted by declaration |
| 11 | ScreenSpec route conflict denied |
| 12 | broad route root rejected |
| 13 | explicit host root accepted |
| 14 | missing optional roots permission 0/exit 0 |
| 15 | no-API host-only layout without api_client works |
| 16 | unused API slot no lookup |
| 17 | API declaration/candidate triggers required-on-use |
| 18 | missing used API root permission 0/deny-only |
| 19 | ordinary undefined role remains exit 2 |
| 20 | API path declared shell-host contradiction |
| 21 | package.json host unbound |
| 22 | other domain cannot be acquired by declaration |
| 23 | overlapping/broad roots invalid |
| 24 | valid candidate requires root-bound parent |
| 25 | outside/wrong-kind/unbound candidate denied |
| 26 | required-on-use-unbound candidate deny-only |
| 27 | cross-target candidate conflict denied |
| 28 | deferred/invalid candidate deny-only |
| 29 | no-API candidate authority 0 |
| 30 | no-API API maturity preserves host |
| 31 | no-API denies hook/API/candidates |
| 32 | shell-screen/shared/shell overlaps denied |
| 33 | valid shell path reserved from other targets |
| 34 | missing-kind/recoverable path globally reserved |
| 35 | absolute/drive/UNC/root escape no physical claim |
| 36 | duplicate identity preserves recoverable denies |
| 37 | production `src/**` cannot bypass |
| 38 | empty paths authoring valid, permission 0 |
| 39 | Tier3 deny overrides root binding |
| 40 | deterministic forward/backstop/root states |
| 41 | distribution includes active payload |

Implementation PRs also run existing fixture-hook, API deferral, shared-surface, Open Decision,
readiness fail-open/redteam, path-backstop, distribution and upgrade regressions.

---

## 26. Risks / Known Limits

1. Canonical base anchoring requires git history and an authenticated CI base or verified remote-tracking tip.
2. Local remote refs can be stale; visual intent remains blocked until the canonical tip is fetched.
3. History unavailable intentionally overblocks visual intent while no-intent remains compatible.
4. Initial adoption is a two-stage process and cannot combine authority issuance with screen implementation.
5. Approval trust relies on the existing contract that `open → resolved` is human-only.
6. Adoption must audit unresolved legacy inputs that previously produced no Effect Ref.
7. All-age pending analysis may conservatively block old input debt until dispositioned.
8. Recoverable invalid visual inputs deliberately deny authority even when unrelated fields are missing.
9. Unrecoverable candidate identity/scope blocks all visual intent until fixed.
10. `impact_axes: [visual]` is a new additive producer contract for non-visual categories carrying visual change.
11. Full SHA-256 effect refs are verbose; outputs also show human-readable Target.
12. Input-level `supersedes` alone does not imply whole-screen operation replacement.
13. Retirement operation opens physical screen/domain paths while semantic narrowing relies on exact operation
    manifest, contract-delta validation and review; first slice does not claim perfect AST mapping.
14. Current target provenance requires template/parser additions before capability use.
15. General mapping/family doctors remain warning-first; capability use is stricter.
16. A stale/unkeyed/pending screen blocks inputs until reconciliation/provenance is corrected.
17. `lineage_transition` is audit provenance, not authority by itself.
18. Required-on-use API root missing is target-local fail closed; ordinary role errors stay global.
19. Deny-only recovery may temporarily lock malformed paths.
20. Contextless diff remains conservative.
21. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result + Reconciliation v2 hard trust required |
| D4 | effect ref includes full canonical Target fingerprint |
| D5 | existing duplicate 4-tuple preserved |
| D6 | canonical Evidence section/bullet required |
| D7 | exact mapping/ScreenSpec and family-member keys |
| D8 | per-key ledger and projection completeness |
| D9 | current retirement can authorize exact removal |
| D10 | screen aggregate timestamp report-only |
| D11 | unkeyed baseline immutable and exact-ref based |
| D12 | explicit unkeyed resolution only |
| D13 | adoption proposal cannot self-authorize |
| D14 | adoption authority requires unchanged confirmed canonical-base artifact |
| D15 | CI PR base is authoritative and not overrideable |
| D16 | local base assertion must equal canonical remote-tracking tip |
| D17 | arbitrary HEAD/feature/tag ref is rejected |
| D18 | adoption approval requires unique base/current resolved global decision |
| D19 | approved_by must match canonical decision Owner |
| D20 | history unavailable fails visual intent closed |
| D21 | forward/backstop share canonical history analyzer |
| D22 | all unresolved visual candidates enter pending index regardless age |
| D23 | adoption audits legacy pending inputs without effect refs |
| D24 | recoverable invalid visual input remains deny-only candidate |
| D25 | unrecoverable candidate index fails visual intent closed |
| D26 | visual impact declaration aligns pending classifier and capability routing |
| D27 | non-visual category uses impact_axes visual for visual evidence |
| D28 | trusted pending input resolution is explicit and screen-scoped |
| D29 | input graph owns lineage, exact-key ledger owns revocation |
| D30 | trusted keyed/unkeyed-resolution/non-screen/exclusion releases pending blocker |
| D31 | visual family identity is family × member screen |
| D32 | member removal/rename requires member retirement |
| D33 | source-map structure and relation-local authorization separated |
| D34 | deny claim exact waiver and non-waivable precedence |
| D35 | visual physical envelope is screen/domain-component only |
| D36 | dedicated optional app-shell-spec |
| D37 | typed shell declaration does not self-grant authority |
| D38 | exact optional app_shell_route_host |
| D39 | optional and required-on-use roots resolve lazily |
| D40 | ordinary undefined role fail-closed preserved |
| D41 | generic API Candidate owner |
| D42 | no-API shell uses no-api-host |
| D43 | recoverable invalid shell path remains deny-only |
| D44 | six-column Open Decision schema reused |
| D45 | global physical ownership namespace |
| D46 | #222 before #223 |
| D47 | no-intent/no-shell compatibility preserved |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다.

Implementation naming만 남는다.

- helper/module names
- diagnostic metadata field names
- adoption skill/reference slug
- app-shell skill/reference slug
- operation-manifest field names

다음은 별도 설계 변경 없이는 허용되지 않는다.

- `git merge-base(current, callerRef)`를 곧바로 trusted base로 사용
- CI PR base를 explicit argument로 override
- `--base-ref HEAD`, feature branch, local tag 또는 unmerged SHA 허용
- current-tree adoption artifact가 같은 diff에 authority 발급
- base에 없는 confirmed proposal 사용
- unresolved/open/fake approval decision 사용
- history unavailable에서 current tree만 신뢰
- forward readiness가 canonical-base guard를 생략
- selected input보다 older라는 이유로 unresolved visual input 제외
- adoption baseline이 register-missing/not-started legacy input을 audit하지 않음
- Input Result-invalid Figma file을 pending index에서 삭제
- unparseable/scope-unrecoverable visual candidate를 무시
- visual enum만 pending classifier에 사용하면서 meeting visual-evidence를 허용
- natural-language body로 visual impact 추론
- post-adoption non-visual input의 visual-evidence를 impact_axes 없이 허용
- reconciled status만으로 RR/RP hard-invalid input 해제
- input ID equality로 Evidence ref 대체
- screen timestamp로 per-key completeness 대체
- unrelated newer exact event로 unkeyed blocker 해소
- family row-level identity로 member removal 묵살
- member removal without tombstone
- shell declaration-only physical authority
- broad route_entry reuse
- eager unused api_client resolution
- ordinary undefined-role fail-closed 완화
- no-API hook/API authority
- malformed reservation 제거
- Open Decision table schema 변경

Baseline에서 재검증한 계약:

- readiness/policy/layout and undefined-role behavior
- Input Result Contract enums/scope/supersedes
- Reconciliation Contract v2 4-tuple duplicate/routing/provenance
- Open Decision six-column schema and human-only resolved transition
- Mapping Provenance exact Evidence
- Visual Consistency member/evidence contract
- Screen Source Map split semantics
- shared surface/API Candidate/path backstop
- #124/#210/#211 boundaries

정적 검증 요구:

- 28 numbered H2 sections
- balanced Markdown fences
- unique H2 headings
- parseable JSON/YAML examples
- independent #222/#223 acceptance matrices
- #221/#224 non-interference
- no-intent/no-shell compatibility
- canonical CI/upstream base anchoring
- base-anchored adoption and approval decision
- forward/backstop history parity
- adoption-time legacy pending completeness
- all-age repository visual candidate index
- invalid-input deny-only recovery
- visual impact routing/classifier alignment
- exact effect identity/Evidence binding
- per-key completeness and retirement timestamp
- member-level family retirement
- relation-local alias state
- lazy required-on-use API root
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
