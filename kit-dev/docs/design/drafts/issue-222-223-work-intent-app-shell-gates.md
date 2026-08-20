# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; tenth review amendment applied; implementation not started  
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
> typed app-shell roots, no-API envelope, target-aware API Candidate와
> malformed ownership recovery를 확정했다.
>
> 이번 amendment는 code authority를 직접 넓힐 수 있는 마지막 세 경계를 닫는다.
>
> 1. `visual-intent-adoption`은 같은 변경에서 자기 권한을 발급하지 못한다. Trusted
>    merge-base에 이미 존재하고 변경되지 않은 confirmed artifact만 authority root다.
> 2. approval `decision_id`는 canonical global Open Decision에 unique하게 해소되고,
>    trusted base와 current tree 모두에서 human-only `resolved` 상태여야 한다.
> 3. stale fallback 방지는 input graph component에만 의존하지 않는다. 모든 newer 또는
>    concurrent visual-source input을 screen-scoped pending uncertainty index로 검사한다.
> 4. forward readiness도 history-aware adoption 결과를 필수로 소비한다. Trusted base를
>    구할 수 없거나 immutable content가 달라지면 `applicable:false`다.

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
4. `visual-refresh`는 `--input <INPUT_ID>`와 hard-trusted current evidence가 필수다.
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
20. adoption proposal은 현재 tree에서 structurally valid할 수 있지만 code authority는 0이다.
21. adoption authority는 trusted merge-base에 confirmed artifact가 이미 존재할 때만 생긴다.
22. base/current adoption authority payload가 같지 않으면 visual intent는 fail closed한다.
23. adoption approval decision은 canonical global row에 unique하게 해소되고 base/current에서 resolved여야 한다.
24. `approved_by` 문자열은 독립 trust source가 아니며 canonical decision Owner와 일치해야 한다.
25. trusted history를 구할 수 없으면 readiness와 backstop 모두 visual intent를 거부한다.
26. 모든 newer 또는 concurrent visual-source input을 graph edge와 무관하게 검사한다.
27. missing/not-started/in-progress/failed 또는 reconciled-but-hard-invalid input은 pending uncertainty다.
28. fully trusted keyed/non-screen/disjoint disposition이 생긴 뒤에만 pending blocker가 해제된다.
29. retirement tombstone의 `inherit`은 Evidence가 정확히 1개일 때만 허용한다.
30. 다중 Evidence tombstone은 explicit RFC3339 timestamp가 필요하다.
31. Screen Source Map은 global structure trust와 alias-local authorization state를 분리한다.
32. 모든 deny는 provenance-bearing claim이며 non-waivable deny가 우선한다.
33. `visual-refresh` physical envelope는 screen/domain-component만 연다.
34. `app-shell-spec`을 optional first-class implementation target으로 도입한다.
35. typed shell declaration은 semantic ownership일 뿐 physical authority를 스스로 만들지 않는다.
36. shell authority는 policy target root, layout binding, maturity profile의 교집합이다.
37. `route-host`는 exact-file `app_shell_route_host`만 사용한다.
38. optional shell roots와 required-on-use `api_client`는 실제 kind 사용 시에만 lazy resolve한다.
39. no-API shell은 API maturity에서도 root-bound host authority를 유지한다.
40. malformed이지만 recoverable한 shell path는 project-wide deny-only reservation으로 남는다.
41. 기존 6-column Open Decision register와 human-only transition을 재사용한다.
42. screen/shared/app-shell/generated/API Candidate가 하나의 physical namespace를 사용한다.
43. #222와 #223은 별도 구현 PR로 나누고 #223은 #222 substrate를 소비한다.

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

Reconciliation RR/RP trust와 별도다.

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
pending visual index             → unresolved newer evidence gate
screen aggregate timestamps      → reporting/ordering only
```

### 2.9 Adoption authority boundary

`visual-intent-adoption`은 legacy baseline을 grandfathering하고 code capability를 켜는
control-plane authority root다. Current-tree shape/digest만으로는 인간 승인 또는 이미
merge된 신뢰 상태를 증명할 수 없다.

따라서 다음을 분리한다.

```text
adoption proposal trust   → current tree의 구조·digest 검증
adoption authority trust  → proposal trust + trusted-base anchor + resolved approval decision
```

새ly-added artifact는 proposal일 뿐 같은 diff에서 screen authority를 만들지 못한다.

### 2.10 Newer visual uncertainty boundary

`supersedes`는 optional이다. 새 Figma input이 edge 없이 도착하거나, linked successor가
`reconciled`라고 표시됐지만 RR/RP hard-invalid일 수 있다. Graph component만 검사하면
이 input들은 freshness gate에서 누락된다.

따라서 repository의 모든 Input Result-trusted visual-source input을 screen scope로 index한다.

### 2.11 Family member boundary

Visual family row는 여러 screen을 참조한다. Family row 하나를 capability key로 쓰면
member 일부가 제거될 때 active family row와 member retirement를 동시에 표현할 수 없다.

Capability identity는 family × screen relation으로 분해한다.

### 2.12 Retirement timestamp boundary

기존 provenance의 `inherit`은 한 Evidence가 가리키는 canonical input timestamp를
상속한다. 다중 Evidence set에 first/last/max를 암묵적으로 적용하지 않는다.

### 2.13 Screen Source Map boundary

General doctor는 warning-first다. Capability analyzer만 exact frontmatter/table/row와
relation state를 hard trust로 사용한다. `split|ambiguous`는 정상 구조일 수 있으므로
relation-local non-authorizing이다.

### 2.14 Layout resolver boundary

Ordinary `{roles.X}` undefined는 계속 `LayoutConfigError`다. Optional app-shell target root만
별도 lazy resolver를 사용한다.

### 2.15 Shared surface and shell boundary

Shared surface는 domain, explicit members, member cap과 fan-out을 전제로 한다. Global
shell을 shared-surface 특례로 만들지 않는다.

### 2.16 Existing fixes and remaining problem

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
- same change가 adoption artifact를 만들고 그 artifact로 자기 screen diff를 열 수 있다.
- current-tree digest만 검사하면 base baseline mutation을 forward readiness가 허용할 수 있다.
- unlinked newer Figma input은 graph uncertainty에서 누락될 수 있다.
- `reconciled`이지만 input-local hard-invalid successor가 old fallback을 막지 못할 수 있다.

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
- forward와 backstop 모두 동일한 trusted-base history 결과를 소비한다.
- 모든 newer/concurrent overlapping visual input을 stale fallback 분석에 포함한다.
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
- evidence 또는 adoption-history bypass
- timestamp/file name만으로 intent 자동 추론
- current-tree `confirmed` 문자열을 인간 승인 증거로 사용
- historical input mutation/backfill
- implicit target retirement
- coarse target에서 exact key 자동 추론
- family member removal silent inference
- input-level supersedes를 implicit whole-screen replacement로 해석
- unresolved newer visual input 무시
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
| unkeyed effect | screen visual surface에 닿지만 exact key가 없는 effect |
| adoption proposal trust | current-tree artifact 구조·digest의 순수 검증 결과 |
| adoption authority trust | proposal + base anchor + resolved approval decision |
| trusted base | explicit/CI/configured base ref와 current HEAD의 merge-base |
| authority payload | adoption identity, contract, status, snapshot, approval, baseline의 normalized semantics |
| pending visual uncertainty | newer/concurrent visual input의 screen impact가 아직 trusted disposition이 아닌 상태 |
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
3. Intent는 explicit하며 bypass가 없다.
4. Input Result Contract와 Reconciliation v2 hard trust를 모두 요구한다.
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
20. Adoption authority는 unchanged confirmed artifact가 trusted base에 있을 때만 가능하다.
21. Approval decision은 base/current 모두에서 unique global resolved row여야 한다.
22. `approved_by` free-form 문자열은 독립 trust source가 아니다.
23. History unavailable이면 visual intent는 fail closed한다.
24. Readiness와 backstop은 동일 base anchor/digest를 소비한다.
25. 모든 newer/concurrent visual-source input을 edge 유무와 무관하게 검사한다.
26. Reconciled-but-hard-invalid visual input은 pending uncertainty다.
27. Fully trusted exact/non-screen/disjoint disposition만 pending blocker를 해제한다.
28. Screen-global event와 graph leaf는 exclusive operation selector가 아니다.
29. Same-key newer evidence만 predecessor exact operation을 폐기한다.
30. Disjoint successor keys는 predecessor disjoint operation을 폐기하지 않는다.
31. Family capability identity는 member screen별이다.
32. Member 제거는 explicit member-key retirement가 필수다.
33. Deny는 claim 단위로 판정하고 non-waivable claim이 우선한다.
34. Packet/Report는 trust/currentness를 재계산하지 않는다.
35. Shell declaration은 physical authority를 스스로 만들지 않는다.
36. Route-host는 exact shell root 안에서만 가능하다.
37. Optional/required-on-use roots는 lazy resolve한다.
38. Ordinary undefined role은 계속 `LayoutConfigError`다.
39. No-API shell은 host만 유지하며 hook/API/candidate authority를 얻지 않는다.
40. Malformed owner declaration은 다른 target authority를 넓히지 않는다.
41. No-intent/no-shell behavior는 호환된다.

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
| graph for lineage + pending index | adopt | linked/unlinked uncertainty 모두 처리 |
| current-tree confirmed adoption | reject | self-issued authority |
| base-anchored two-stage adoption | adopt | approval/authority 분리 |
| approved_by string only | reject | 작성 가능한 문자열 |
| unique resolved global decision | adopt | 기존 human-only transition 재사용 |
| CI-only adoption guard | reject | forward/backstop 의미 불일치 |
| shared history-aware context | adopt | pre-edit와 diff 동일 판정 |
| timestamp unkeyed cutover | reject | threshold 이동으로 blocker 우회 |
| immutable exact baseline | adopt | legacy 예외 고정 |
| unrelated newer event age-out | reject | coarse meaning 소멸 |
| explicit unkeyed resolution | adopt | provenance-bearing 해소 |
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

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --base-ref origin/main \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

First slice에서 `visual-refresh`는 screen selector에만 허용한다. Figma mapping 존재,
최근 timestamp, filename 또는 current mode만으로 자동 활성화하지 않는다.

### 10.2 Input Result Contract analyzer

```text
analyzeInputArtifacts(artifacts) -> {
  errors,
  warnings,
  trust: {
    by_input_id,
    by_file,
    duplicate_ids,
    graph_candidates
  }
}
```

`input_artifact_trusted=true`는 검사 11 hard contract 전체가 통과할 때만 가능하다.
`validateInputArtifacts()`와 readiness가 같은 analyzer 결과를 소비한다.

Additive optional capability fields:

```yaml
source_lineage: figma-screen://file/abc123/CREATE-ATTACH
lineage_transition:
  from_input: IN-20260701-figma-001
  reason: legacy-lineage-adoption   # legacy-lineage-adoption | source-move
```

### 10.3 Reconciliation Contract v2 analyzer

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
    unkeyed_resolutions
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

### 10.4 Deterministic effect identity

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

### 10.5 Visual-intent adoption proposal artifact

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
---
```

Legacy baseline:

```markdown
## Legacy Unkeyed Baseline

| Effect Ref | Screen ID | Canonical Target | Evidence | Input Captured At | Disposition |
|---|---|---|---|---|---|
| visual-effect:IN-OLD/01/update/<target-sha256> | CREATE-ATTACH | artifact:CREATE-ATTACH-figma-component-mapping | input:IN-OLD#extracted-facts/01 | 2026-07-30T09:00:00+09:00 | advisory-history |
```

Current-tree proposal trust:

```text
adoption_proposal_trusted =
  unique canonical artifact
  AND exact frontmatter/schema/table
  AND status ∈ {draft, confirmed}
  AND visual_intent_contract == 1
  AND structured_since_snapshot == register.structured_since
  AND adopted_at/approved_at RFC3339 and non-future
  AND every baseline Effect Ref resolves to one trusted unkeyed effect
  AND every baseline Screen ID belongs to that effect scope
  AND every baseline input captured_at <= adopted_at
  AND baseline_digest matches canonical sorted rows
```

Proposal trust는 code authority가 아니다.

### 10.6 Approval decision contract

`decision_id`는 새 decision-log가 아니라 기존 canonical global Open Decision row를 가리킨다.

```text
approval_decision_trusted(base_or_current) =
  global/open-decisions.md unique and hard-valid
  AND decision_id resolves exactly/case-sensitively to one global row
  AND no local ScreenSpec row has the same ID
  AND row Status == resolved
  AND row Owner is nonempty/non-placeholder
  AND adoption.approved_by == row.Owner after trim
```

기존 계약에서 `open → resolved`는 human-only다. Trusted base에 이미 존재하는 resolved row를
요구함으로써 free-form `approved_by`나 self-authored current-tree row를 승인 증거로 쓰지 않는다.

다음은 authority 0이다.

- missing/duplicate/malformed decision row
- local-only decision
- `Status=open`
- current tree에서 resolved row를 reopen
- `approved_by`와 canonical Owner 불일치

### 10.7 Trusted-base history context

Visual intent는 history-aware context가 필수다.

Base ref resolution priority:

```text
1 explicit --base-ref <ref>
2 CI-provided pull-request base SHA
3 configured canonical upstream default ref (normally origin/main)
4 otherwise unavailable
```

```text
history_context = {
  base_ref,
  merge_base_sha,
  merge_base_committed_at,
  base_adoption_blob_sha,
  base_authority_digest,
  current_authority_digest,
  source
}
```

`merge_base_sha`는 current HEAD와 base ref의 git merge-base다. Current working-tree artifact는
merge-base blob과 비교한다.

History를 구할 수 없거나 base ref가 resolve되지 않으면:

```text
applicable: false
reason: adoption-history-unavailable
```

No-intent execution은 history를 요구하지 않는다.

### 10.8 Base-anchored adoption authority

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
canonical Legacy Unkeyed Baseline rows
baseline_digest
```

```text
adoption_authority_trusted =
  adoption_proposal_trusted(current)
  AND history_context.available
  AND current.status == confirmed
  AND base artifact exists at canonical path
  AND base artifact status == confirmed
  AND base proposal structure trusted
  AND current_authority_digest == base_authority_digest
  AND approval_decision_trusted(base)
  AND approval_decision_trusted(current)
  AND base/current approval decision identity/status/Owner agree
  AND approved_at <= merge_base_committed_at
```

Consequences:

- Newly added adoption artifact, even `status: confirmed`, is proposal-only.
- Draft→confirmed promotion in current branch is proposal-only until merged.
- Initial adoption PR cannot authorize screen/domain code in the same diff.
- After adoption and decision are merged, the next branch may use the unchanged artifact.
- Baseline/frontmatter/digest edit in working tree denies readiness immediately.
- Artifact delete/rename/duplicate denies authority.
- Trusted base unavailable denies authority.

### 10.9 Adoption two-stage workflow

Stage A — proposal/control-plane PR:

1. Audit legacy unkeyed effects.
2. Add adoption artifact as draft or human-confirmed proposal.
3. Add or reference one canonical global decision.
4. Human resolves the decision and confirms the proposal.
5. Validate baseline/digest.
6. `visual-refresh` authority remains 0 because artifact is not in trusted base.
7. Screen/domain code diff cannot cite the new artifact as authorization.
8. Merge the adoption PR.

Stage B — subsequent implementation PR:

1. Update/fetch trusted base containing the unchanged confirmed artifact.
2. Resolve base history context.
3. Confirm base/current authority digests equal.
4. Use `visual-refresh` with exact input and operation evidence.

### 10.10 Screen Source Map capability trust

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

### 10.11 Scope resolution

```text
scope_allows(screen) =
  active canonical screen exact relation
  OR authorizing source-map relation
```

Raw/source alias 자체는 authority를 만들지 않는다. Malformed/empty scope는 input trust false다.

For uncertainty analysis, unresolved raw screen scope may still be a potential overlap when its
resolved affected domain contains the selected screen domain.

### 10.12 Canonical Evidence ref

```text
input:<input_id>#<section-slug>[/<1-based-bullet>]
```

Comparison은 canonical tuple 기준이다.

```text
same input ID + different section/bullet → not equal
```

Duplicate normalized refs는 invalid다.

### 10.13 Capability target identities

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

### 10.14 Visual effect classification

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

### 10.15 Current active provenance adapters

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

### 10.16 Trusted keyed effect ledger and completeness

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

### 10.17 Retirement tombstone and timestamp

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

### 10.18 Family member removal and rename

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

### 10.19 Key-local current operations

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

### 10.20 Operation scope

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

### 10.21 Immutable legacy baseline and explicit unkeyed resolution

Unkeyed effect가 non-blocking인 경우:

```text
(effect_ref, screen_id) is in base-anchored immutable adoption baseline
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

### 10.22 Input supersession graph trust

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

### 10.23 Visual-source input classifier

Pending uncertainty index는 Input Result-trusted input만 사용한다.

```text
is_visual_source_input(input) =
  input_artifact_trusted
  AND (
    input_type ∈ {figma, visual-spec}
    OR source_type ∈ {figma, visual-spec}
  )
```

한 쪽만 visual enum인 mismatched pair도 보수적으로 visual candidate로 분류한다. Fully trusted
reconciliation disposition이 생긴 뒤에만 non-screen/disjoint로 해제할 수 있다.

### 10.24 Potential screen overlap

```text
potentially_overlaps(input, screen) =
  canonical/authorizing scope contains screen
  OR unresolved raw screen token exists
     AND effective affected_domains contains screen.domain
```

Visual input의 screen tokens와 domain 모두 해소 불가능하면 visual intent capability index가
untrusted이며, scope가 해소될 때까지 project visual intent를 fail closed한다. No-intent는 무영향이다.

### 10.25 Pending visual uncertainty index

Index는 selected input의 graph component가 아니라 repository의 모든 visual-source input을 본다.

```text
newer_or_concurrent(candidate, selected) =
  candidate.input_id != selected.input_id
  AND candidate.captured_at >= selected.captured_at
```

Equal timestamp는 순서를 증명할 수 없으므로 reconciliation disposition 전까지 uncertainty다.

```text
pending_visual_uncertainty(selected, screen) =
  visual-source candidates
  AND newer_or_concurrent
  AND potentially_overlaps(screen)
  AND disposition is not trusted-resolved
```

Blocking dispositions:

```text
register-missing
not-started
in-progress
failed
reconciled-hard-invalid
summary-projection-invalid
RR-SCHEMA/RR-ITEM/RR-REF/RR-ROUTE/RP input-local hard error
scope-unclear
unresolved-unkeyed
no-trusted-screen-disposition
```

`Reconcile Status=reconciled` 문자열은 trust를 대체하지 않는다.

### 10.26 Trusted resolved dispositions

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
```

Same screen의 disjoint exact key도 pending uncertainty를 해제한다. Same-key revocation은 key ledger가
소유한다.

### 10.27 Unlinked and hard-invalid examples

Unlinked pending input:

```text
IN-A @ 10:00 exact M-001
IN-B @ 11:00 same screen Figma, supersedes absent, register missing
→ IN-B pending uncertainty
→ IN-A denied until IN-B disposition trusted
```

Linked reconciled-but-invalid input:

```text
IN-B supersedes IN-A
Summary status = reconciled
selected input-local RR-REF or projection hard error exists
→ disposition = reconciled-hard-invalid
→ IN-A denied
```

Fully reconciled disjoint input:

```text
IN-B unlinked, fully trusted exact M-002
→ pending blocker cleared
→ IN-A M-001 remains key-local current
```

Trusted non-screen visual result:

```text
IN-B fully trusted component-gap-only/no-screen-impact
→ does not block IN-A screen operation
```

### 10.28 Final evidence formula

```text
intent_evidence_valid =
  adoption_authority_trusted
  AND selected_input.input_artifact_trusted
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

### 10.29 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  history:
    base_ref: origin/main
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
      base_trusted: true
      current_trusted: true
  evidence:
    input_id: IN-A
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

### 14.4 Adoption approval scope

Adoption `decision_id`도 global register resolver를 재사용하지만 readiness fan-out decision은 아니다.
Exactly one resolved row가 adoption approval provenance다. Local row, zero/multiple match, open status는
adoption authority를 만들지 않는다.

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

Visual intent:

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --base-ref origin/main \
  --json
```

History source priority는 explicit arg → CI base SHA → configured upstream이다. History unavailable은
CLI syntax error가 아니라 keyed `applicable:false`, exit 0이다.

Unknown intent, missing input, selector conflict, malformed IDs/noncanonical path는 exit 2다.

App shell:

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
  history:
    base_ref: origin/main
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

### 17.2 Visual evidence state

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

### 17.3 App shells

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

### 17.4 Determinism

Sort target IDs, effect refs, keys, screens, refs, inputs, claims and diagnostics. Serialized trust
indexes include source/base hashes; stale generated trust is rejected.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Newly added adoption cannot self-authorize

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "history": {
        "base_ref": "origin/main",
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

### 18.2 History unavailable

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "blocking": [
        {"kind": "adoption-history-unavailable"}
      ],
      "next_actions": ["fetch or provide a trusted --base-ref"]
    }
  }
}
```

### 18.3 Unlinked pending newer visual input

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
            "linked_by_supersedes": false,
            "captured_at": "2026-08-20T11:00:00+09:00",
            "reconcile_status": "missing",
            "reason": "newer-overlapping-visual-input-unresolved"
          }
        ]
      }
    }
  }
}
```

### 18.4 Reconciled-but-hard-invalid successor

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
            "linked_by_supersedes": true,
            "reconcile_status": "reconciled",
            "reconciliation_trusted": false,
            "reason": "reconciled-hard-invalid",
            "diagnostic_codes": ["RR-REF-...", "RR-ITEM-..."]
          }
        ]
      }
    }
  }
}
```

### 18.5 Disjoint current predecessor remains eligible

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

### 18.6 Pure retirement

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

### 18.7 No-API shell

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
- Reconciliation Contract v2
- canonical Target tuple/fingerprint/effect ref
- adoption proposal current-tree trust
- adoption history/base-anchor trust
- adoption approval decision trust
- canonical Evidence normalization
- mapping/family-member/ScreenSpec target resolution
- keyed effect ledger
- unkeyed baseline/resolution
- active provenance/retirement timestamp
- per-key completeness/current operations
- supersession graph
- repository-wide pending visual uncertainty
- Screen Source Map structure/relation state
- app-shell roots/ownership/deny claims

### 19.2 History-aware adoption analyzer

```text
analyzeVisualIntentAdoptionAuthority({
  currentTree,
  trustedBaseTree,
  mergeBaseMetadata,
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

### 19.3 Initial creation guard

Base에 adoption artifact가 없고 current tree에 새 artifact가 있으면:

```text
proposal_trust may be true
authority_trust = false
reason = adoption-not-in-trusted-base
```

같은 change의 screen/domain diff는 visual intent로 authorize되지 않는다. Adoption PR은
control-plane proposal로 merge한 후 다음 branch에서 사용한다.

### 19.4 Immutable-base guard

Hard authority failures:

- base artifact missing
- current/base semantic authority digest mismatch
- confirmed artifact deletion/rename/duplicate
- immutable frontmatter or baseline edit
- baseline digest recomputation after mutation
- register `structured_since` differs from snapshot
- approval decision missing/open/malformed/duplicate
- base/current decision row disagreement
- `approved_by` != canonical Owner
- history unavailable

### 19.5 Forward and backstop parity

`workflow:readiness --path`와 `workflow:forbidden-paths`는 동일 authorization context를 사용한다.
Both require:

```text
current-tree proposal trust
AND immutable-base trust
AND approval decision trust
```

Readiness는 CI에서 나중에 발견할 immutability failure를 먼저 허용하지 않는다.

If trusted base cannot be loaded:

```text
applicable: false
reason: adoption-history-unavailable
```

### 19.6 Authorization order

```text
1 concrete path canonicality
2 target/lifecycle/contract validity
3 resolve trusted history context
4 adoption proposal trust
5 adoption base-anchor/decision authority trust
6 selected input artifact trust
7 reconciliation/effect trust
8 effect identity
9 screen scope relation
10 keyed/unkeyed/non-screen classification
11 Evidence normalization
12 exact key and active/tombstone binding
13 per-key projection completeness
14 immutable baseline/explicit unkeyed resolution
15 repository-wide pending visual uncertainty
16 selected key-local active/retirement operation
17 supersession graph component trust
18 intent prerequisite/base readiness
19 target-root lazy resolution/no-API profile
20 positive physical profile
21 ownership/generated/candidate denies
22 claim waiver and deny precedence
23 structured operation provenance
```

### 19.7 Pending uncertainty analyzer

The analyzer indexes all Input Result-trusted visual-source inputs, not only graph successors.

Input-local hard diagnostics are attached to the candidate disposition. `reconciled` status with any
RR/RP hard-invalid trust remains blocking.

### 19.8 Operation-scope postcondition

Stage 06 output validation:

- active/retired visual owner changes are subset of authorized keys
- retirement-only run cannot mutate unrelated active records
- mixed run may mutate only selected operations
- new unresolved unkeyed row is forbidden
- resulting ledger remains current

### 19.9 Packet/Report

Copy, never recompute:

- base ref/merge-base SHA/base blob SHA
- base/current authority digests
- approval decision provenance
- input/reconciliation trust
- effect ref/Target fingerprint
- scope relation
- exact keys/refs
- unkeyed resolution
- pending visual uncertainty
- key-local operation state
- graph/lineage transition
- root bindings
- waived/active deny claims

### 19.10 Warning-first boundary

General source-map doctor와 visual-consistency checks는 warning-first다. Capability analyzers는
authorization evidence 사용만 deny하며 일반 command를 global required CI로 승격하지 않는다.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input result | analyzer, visual-source classifier, lineage/transition |
| reconciliation | 4-tuple effect ref, exact key/ref, trusted disposition |
| visual-intent adoption | artifact/template/schema/approval/base-anchor guard |
| open decisions | adoption approval referrer, existing six-column/human transition |
| Figma mapping | active provenance + retirements |
| visual consistency | family member keys/evidence/retirements |
| ScreenSpec | optional Visual Evidence + retirements |
| screen identity | source-map capability relation |
| readiness | history context + pending visual index |
| forbidden paths | same history/context helper |
| project layout | shell root roles/lazy resolver |
| implementation policy | target-profile roots |
| app-shell reference | typed paths, roots, no-API, recovery |
| Stage 04 | exact target/effect identity and trusted disposition |
| Stage 05/06/08 | proposal/implement/validate/report |
| implement-screen | base-anchored adoption + exact operations only |
| implement-app-shell | root-bound readiness only |
| COMMANDS | intent/input/base/adoption/shell examples |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| no adoption artifact | no-intent unchanged; visual intent 0 |
| new adoption in current branch | proposal valid; authority 0 |
| draft adoption in base/current | authority 0 |
| unchanged confirmed adoption in trusted base | may authorize |
| fake/missing/open approval decision | authority 0 |
| base/current adoption mismatch | readiness/backstop both deny |
| trusted base unavailable | visual intent 0 |
| same input/item/effect + different Target | distinct refs |
| exact duplicate 4-tuple | existing hard error |
| exact active input | may authorize active update |
| exact retirement input | may authorize removal |
| historical retirement | permission 0 |
| incomplete exact key | affected screen stale |
| immutable baseline row | advisory non-authorizing history |
| new unkeyed row | blocker until resolution |
| unlinked newer pending visual input | old operation blocked |
| linked reconciled hard-invalid input | old operation blocked |
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

### 22.1 Two-stage visual-intent adoption

Proposal PR:

1. Ensure Reconciliation Register is valid Contract v2.
2. Audit existing trusted unkeyed screen-visual effects.
3. Create `visual-intent-adoption.md` as draft or confirmed proposal.
4. Snapshot current `structured_since`.
5. List exact legacy `(Effect Ref, Screen ID)` baseline rows.
6. Compute baseline digest.
7. Add one canonical global approval decision.
8. Human resolves decision and confirms proposal.
9. Run proposal/current-tree validation.
10. Do not use the new artifact to authorize screen/domain code in the same change.
11. Merge the control-plane adoption PR.

Subsequent implementation PR:

1. Fetch/update trusted base containing adoption artifact and resolved decision.
2. Supply/resolve `--base-ref`.
3. Confirm base/current authority digests equal.
4. Reconcile new inputs to exact keys or explicit resolutions.
5. Verify pending visual uncertainty is empty.
6. Run readiness with intent/input/base/concrete path.
7. Implement only exact operation scope.
8. Run validate/backstop and report history/effect provenance.

### 22.2 Adoption mutation

Confirmed adoption baseline/frontmatter is immutable. New unkeyed effects use resolution rows; they are
not added to baseline. Reapproval requires a separately designed contract, not editing the old artifact.

### 22.3 Input supersession and pending uncertainty

- `supersedes` records source lineage, not whole-screen operation revocation.
- Delta successor may use disjoint keys.
- Same-key update/retirement owns operation replacement.
- Whole-screen replacement must update/retire every affected key.
- Every newer/concurrent visual-source input must receive a trusted screen disposition.
- Missing/unstarted/failed/hard-invalid inputs block old screen authority regardless of graph linkage.

### 22.4 #223 adoption

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
- effect ref and Evidence normalization
- visual-source input classifier
- visual-intent adoption artifact/template/schema/manifest
- proposal trust, resolved approval decision and base-anchor analyzer
- history resolver shared by readiness/backstop
- mapping/family-member/ScreenSpec target resolvers
- keyed effect ledger/unkeyed resolution
- active provenance/retirement tombstone
- key-local operations
- supersession graph
- repository-wide pending visual uncertainty index
- projection completeness/report aggregates
- source-map relation analyzer
- lineage transition
- deny claims/visual-refresh
- CLI/backstop/Packet/Report parity

Excludes app-shell artifacts, shared-surface semantic change, implementation completion ledger and #224.

Acceptance:

- no-intent compatibility
- initial adoption same-change authority 0
- unchanged confirmed base adoption only
- resolved global approval decision required
- forward/backstop history parity
- unlinked/hard-invalid newer visual input blocks stale fallback
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
| input | `scripts/lib/input-artifact.mjs`, producer/schema/template/tests |
| reconciliation | `scripts/lib/reconciliation-items.mjs`, target/effect/trust helpers/tests |
| adoption | new artifact/template/schema/manifest/reference/history guard/tests |
| decisions | global resolver adapter for adoption approval/tests |
| mapping | mapping provenance/retirement parser/template/tests |
| family | visual consistency member-key/retirement tests |
| ScreenSpec | Visual Evidence/retirement parser/template/tests |
| identity | screen-source-map capability analyzer/tests |
| core | readiness/history/pending visual index/path authorization |
| backstop | forbidden-paths + same history/adoption context |
| execution | packet/report operation manifest/history provenance |
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
| 12 | unchanged confirmed adoption already in trusted base → accepted |
| 13 | base adoption missing → adoption-not-in-trusted-base |
| 14 | trusted base unavailable → readiness denied |
| 15 | trusted base unavailable → forbidden-paths denied |
| 16 | current/base authority digest mismatch → readiness denied |
| 17 | baseline edit + digest recompute → readiness/backstop denied |
| 18 | adoption deletion/rename/duplicate → denied |
| 19 | structured_since snapshot mismatch → denied |
| 20 | future adopted_at/approved_at → denied |
| 21 | approval decision missing → denied |
| 22 | approval decision duplicate → denied |
| 23 | approval decision local-only → denied |
| 24 | approval decision open → denied |
| 25 | approval decision resolved only in current branch, not base → denied |
| 26 | approval decision reopened in current → denied |
| 27 | approved_by differs from canonical Owner → denied |
| 28 | base/current decision identity/status disagreement → denied |
| 29 | v1/summary-only input → denied |
| 30 | malformed Summary/Items → denied |
| 31 | selected RR/RP-invalid group → denied |
| 32 | Effect outside update/create → denied |
| 33 | summary projection mismatch → denied |
| 34 | invalid input type/source/required field/timestamp → denied |
| 35 | duplicate input ID → denied |
| 36 | same input/item/effect + different targets → distinct refs |
| 37 | exact duplicate 4-tuple → existing hard error |
| 38 | fingerprint uses parsed canonical tuple |
| 39 | malformed Target has no trusted effect ref |
| 40 | target fingerprint collision → fail closed |
| 41 | direct canonical screen scope accepted |
| 42 | confirmed/merged source alias accepted |
| 43 | candidate/split/ambiguous alias non-authorizing |
| 44 | valid split does not poison unrelated confirmed alias |
| 45 | canonical/alias namespace collision token denied |
| 46 | malformed source map denies alias capability |
| 47 | exact mapping key required for authority |
| 48 | exact ScreenSpec visual section required |
| 49 | family target expands to member keys |
| 50 | ambiguous family fan-out → unkeyed blocker |
| 51 | exact mapping current Evidence accepted |
| 52 | same input ID, different Evidence bullet denied |
| 53 | exact family member Evidence accepted |
| 54 | every selected screen-resolving effect must bind |
| 55 | ledger survives active-row deletion |
| 56 | older incomplete key masked by newer other key → stale |
| 57 | equal-time unprojected key → stale |
| 58 | all latest-per-key refs reflected → current |
| 59 | key removed without tombstone → stale |
| 60 | malformed/duplicate retirement table → denied |
| 61 | single Evidence + inherit deterministic |
| 62 | multiple Evidence + inherit hard-invalid |
| 63 | explicit tombstone timestamp earlier than ref → denied |
| 64 | multi-Evidence valid explicit timestamp deterministic |
| 65 | active record and tombstone same key → invalid |
| 66 | later effect after retirement makes key stale |
| 67 | family [A,B]→[A]: A active, B retirement required |
| 68 | missing B tombstone makes B stale only |
| 69 | B removal does not poison A |
| 70 | family rename retires old and activates new member keys |
| 71 | immutable baseline unkeyed row advisory only |
| 72 | new unkeyed row blocks until resolution |
| 73 | unrelated newer exact event does not clear unkeyed blocker |
| 74 | refined-to-key resolution clears exact blocker |
| 75 | superseded-by-keyed requires explicit effect provenance |
| 76 | no-screen-impact requires human-resolved decision |
| 77 | partial multi-screen resolution clears only one screen |
| 78 | component-gap-only result is non-screen |
| 79 | disjoint input without supersedes leaves both operations executable |
| 80 | disjoint input with supersedes leaves both key operations executable |
| 81 | same-key successor denies predecessor operation |
| 82 | graph_leaf=false alone does not deny predecessor |
| 83 | unlinked newer same-screen Figma input + register missing blocks old operation |
| 84 | unlinked newer same-screen Figma input + not-started blocks old operation |
| 85 | equal-time unlinked visual input blocks until disposition |
| 86 | linked successor reconciled with RR-REF hard error blocks old operation |
| 87 | linked successor projection mismatch blocks old operation |
| 88 | linked successor Reconcile Status=reconciled but input trust false blocks |
| 89 | raw unresolved newer screen token + same domain blocks conservatively |
| 90 | newer unlinked fully trusted disjoint key releases old operation |
| 91 | newer linked fully trusted disjoint key releases old operation |
| 92 | newer fully trusted non-screen visual result does not block |
| 93 | newer explicitly resolved no-screen-impact does not block |
| 94 | newer unresolved unkeyed result remains blocker |
| 95 | newer same-key trusted result revokes old through key ledger |
| 96 | whole-input replacement omitted key not silently retired |
| 97 | source move/new lineage same-key current operation revokes old |
| 98 | transition without current operation denied |
| 99 | reversed/equal timestamp graph edge denied |
| 100 | cross-source/different-lineage/missing-lineage graph edge denied |
| 101 | cycle/branch/frontmatter-summary parity mismatch denied |
| 102 | final-level decision blocks intent |
| 103 | API-only higher blocker does not block final visual work |
| 104 | absorbed/malformed lifecycle denied |
| 105 | shared/shell/candidate/generated reservations denied |
| 106 | exact deny claim waiver succeeds |
| 107 | same-path Tier3 deny remains active |
| 108 | forward readiness and backstop share base/adoption digests |
| 109 | forward readiness and backstop share pending visual index |
| 110 | Packet/Report copies history, decision and operation scope |
| 111 | postcondition rejects delta outside operation scope |
| 112 | no-intent legacy fixtures compatible |

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

1. Base-anchored adoption requires git history/base access for visual intent execution.
2. History unavailable intentionally overblocks visual intent while no-intent remains compatible.
3. Initial adoption is a two-stage process and cannot combine authority issuance with screen implementation.
4. Approval trust relies on the existing contract that `open → resolved` is human-only.
5. Pending visual index may conservatively block raw-scope inputs at domain level until identity resolves.
6. Visual-source classifier treats enum mismatch with one visual side as uncertainty until trusted disposition.
7. Full SHA-256 effect refs are verbose; outputs also show human-readable Target.
8. Input-level `supersedes` alone does not imply whole-screen operation replacement.
9. Retirement operation opens physical screen/domain paths while semantic narrowing relies on exact operation
   manifest, contract-delta validation and review; first slice does not claim perfect AST mapping.
10. Current target provenance requires template/parser additions before capability use.
11. General mapping/family doctors remain warning-first; capability use is stricter.
12. A stale/unkeyed/pending screen blocks inputs until reconciliation/provenance is corrected.
13. `lineage_transition` is audit provenance, not authority by itself.
14. Required-on-use API root missing is target-local fail closed; ordinary role errors stay global.
15. Deny-only recovery may temporarily lock malformed paths.
16. Contextless diff remains conservative.
17. Design-only CI does not prove new behavior.

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
| D14 | adoption authority requires unchanged confirmed trusted-base artifact |
| D15 | adoption approval requires unique base/current resolved global decision |
| D16 | approved_by must match canonical decision Owner |
| D17 | history unavailable fails visual intent closed |
| D18 | forward/backstop share history-aware adoption analyzer |
| D19 | input graph owns lineage, exact-key ledger owns revocation |
| D20 | all newer/concurrent visual-source inputs enter pending index |
| D21 | reconciled-but-hard-invalid input remains pending blocker |
| D22 | trusted keyed/unkeyed-resolution/non-screen disposition releases pending blocker |
| D23 | visual family identity is family × member screen |
| D24 | member removal/rename requires member retirement |
| D25 | source-map structure and relation-local authorization separated |
| D26 | deny claim exact waiver and non-waivable precedence |
| D27 | visual physical envelope is screen/domain-component only |
| D28 | dedicated optional app-shell-spec |
| D29 | typed shell declaration does not self-grant authority |
| D30 | exact optional app_shell_route_host |
| D31 | optional and required-on-use roots resolve lazily |
| D32 | ordinary undefined role fail-closed preserved |
| D33 | generic API Candidate owner |
| D34 | no-API shell uses no-api-host |
| D35 | recoverable invalid shell path remains deny-only |
| D36 | six-column Open Decision schema reused |
| D37 | global physical ownership namespace |
| D38 | #222 before #223 |
| D39 | no-intent/no-shell compatibility preserved |

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

- current-tree adoption artifact가 같은 diff에 authority 발급
- base에 없는 confirmed proposal 사용
- unresolved/open/fake approval decision 사용
- history unavailable에서 current tree만 신뢰
- forward readiness가 immutable-base guard를 생략
- graph-linked successor만 pending input으로 검사
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
- base-anchored adoption and approval decision
- forward/backstop history parity
- repository-wide pending visual uncertainty
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
