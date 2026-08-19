# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; ninth review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-19  
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
> 이번 amendment는 현재 Contract v2 row cardinality와 operation lifecycle을 맞추기 위해
> 다음 세 경계를 닫는다.
>
> 1. effect identity를 실제 duplicate contract인 `(Input ID, Item, Effect, Target)`에 맞춘다.
> 2. 이동 가능한 timestamp cutover를 폐기하고 immutable adoption baseline을 사용한다.
> 3. input-level `supersedes`는 graph provenance/uncertainty를 소유하고, code capability
>    revocation은 exact-key ledger가 소유하도록 분리한다.

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
8. effect ref는 input/item/effect뿐 아니라 Target fingerprint를 포함한다.
9. 기존 Contract v2 duplicate 4-tuple을 유지하며 breaking triple uniqueness를 도입하지 않는다.
10. mapping과 ScreenSpec identity는 exact row/section key다.
11. visual-family identity는 family × canonical screen member relation이다.
12. 모든 exact key는 current active provenance 또는 explicit retirement tombstone과
    projection-complete해야 한다.
13. current active update와 current retirement는 모두 `visual-refresh` operation이 될 수 있다.
14. operation eligibility는 screen-global latest timestamp가 아니라 각 exact key의
    `latest_trusted_refs`가 소유한다.
15. 서로 다른 key의 pending operation은 나중에 다른 key input이 도착해도 각각 실행할 수 있다.
16. 같은 key에 더 최신 trusted effect가 있으면 이전 operation은 실행할 수 없다.
17. `current_visual_event_at(screen)`은 report/ordering aggregate이며 exclusive selector가 아니다.
18. exact key를 만들 수 없는 trusted screen-visual effect는 unresolved `unkeyed` blocker다.
19. unrelated newer exact event는 unkeyed blocker를 자동 해소하지 않는다.
20. unkeyed blocker는 exact-key refinement/supersession 또는 human-resolved no-screen-impact
    relation으로만 해소한다.
21. mutable `visual_intent_structured_since` timestamp는 사용하지 않는다.
22. optional confirmed `visual-intent-adoption` artifact가 기존 legacy unkeyed baseline을
    exact effect refs로 고정한다.
23. adoption artifact는 `structured_since` snapshot, adoption time, baseline digest를 소유하고
    confirmed 이후 mutation/deletion은 diff-aware hard error다.
24. adoption 이후 새 unkeyed effect를 baseline에 추가해 legacy로 재분류할 수 없다.
25. retirement tombstone의 `inherit`은 Evidence가 정확히 1개일 때만 허용한다.
26. 다중 Evidence tombstone은 explicit RFC3339 timestamp가 필요하고 모든 referenced
    input timestamp보다 이르지 않아야 한다.
27. input-level supersession graph는 lineage integrity, cycle/branch/parity와 unresolved
    successor uncertainty를 소유한다.
28. `supersedes`가 있다는 사실만으로 predecessor의 모든 exact-key operation을 폐기하지 않는다.
29. capability operation revocation은 same-key newer trusted effect 또는 explicit keyed
    resolution이 소유한다.
30. successor가 disjoint keys만 가지면 predecessor의 disjoint current operations는 실행 가능하다.
31. successor가 아직 reconcile되지 않아 key scope가 불명확하면 overlapping screen의
    predecessor operations를 보수적으로 막는다.
32. source lineage는 logical replacement stream이며 source move는 append-only transition으로 처리한다.
33. Screen Source Map은 global structure trust와 alias-local authorization state를 분리한다.
34. 모든 deny는 provenance-bearing claim이며 non-waivable deny가 우선한다.
35. `visual-refresh` physical envelope는 screen/domain-component만 연다.
36. `app-shell-spec`을 optional first-class implementation target으로 도입한다.
37. typed shell declaration은 semantic ownership일 뿐 physical authority를 스스로 만들지 않는다.
38. shell authority는 policy target root, layout binding, maturity profile의 교집합이다.
39. `route-host`는 exact-file `app_shell_route_host`만 사용한다.
40. optional shell roots와 required-on-use `api_client`는 실제 kind 사용 시에만 lazy resolve한다.
41. no-API shell은 API maturity에서도 root-bound host authority를 유지한다.
42. malformed이지만 recoverable한 shell path는 project-wide deny-only reservation으로 남는다.
43. 기존 6-column Open Decision register와 `decision_refs`를 재사용한다.
44. #222와 #223은 별도 구현 PR로 나누고 #223은 #222 substrate를 소비한다.

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
`workflow:validate` 선행 성공을 가정하지 않으므로 pure analyzer의 trust index를 직접
소비한다.

현재 duplicate effect hard contract는 다음 4-tuple이다.

```text
(Input ID, Item, Effect, Target)
```

같은 input/item/effect가 다른 Target에 쓰이는 multi-target item은 hard-valid할 수 있다.
Effect identity 설계는 이 row cardinality를 보존해야 한다.

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

`unkeyed-screen-visual`은 authority를 만들지 않으며 freshness 분석에서 사라지지도 않는다.

### 2.8 Operation lifecycle boundary

서로 다른 visual inputs가 Stage 04에서 연속으로 reconcile된 뒤 Stage 06 구현이 나중에
수행될 수 있다. Screen-global latest timestamp 또는 input graph leaf를 exclusive selector로
사용하면 이전의 서로 다른 key operation이 실행 불가능해진다.

따라서 currentness를 다음처럼 분리한다.

```text
key-local operation currentness  → authorization gate
input graph trust                → lineage/uncertainty gate
screen aggregate timestamps      → reporting/ordering only
```

### 2.9 Mutable cutover boundary

Timestamp 하나로 legacy/unkeyed를 나누면 값을 미래로 옮겨 blocker를 legacy로 재분류할 수
있다. `structured_since`보다 이른 별도 threshold는 mandatory item boundary 사이의 행을
분석에서 누락시킨다.

따라서 별도의 movable timestamp cutover를 사용하지 않는다. Legacy grandfathering은
confirmed adoption artifact에 exact effect refs로 고정한다.

### 2.10 Family member boundary

Visual family row는 여러 screen을 참조한다. Family row 하나를 capability key로 쓰면
member 일부가 제거될 때 active family row와 member retirement를 동시에 표현할 수 없다.

Capability identity는 family × screen relation으로 분해한다.

### 2.11 Retirement execution boundary

Tombstone은 구조적 currentness뿐 아니라 실제 제거 작업의 근거가 될 수 있어야 한다.
다만 tombstone이 존재한다는 사실만으로 authority를 만들지 않고 selected latest effect와
exact하게 결합해야 한다.

### 2.12 Unkeyed resolution boundary

Unkeyed effect보다 나중인 unrelated exact event가 존재한다는 이유만으로 unkeyed 의미가
해소되지는 않는다. 시간 비교는 replacement provenance가 아니다.

Adoption baseline에 없는 unkeyed effect는 명시적 resolution relation이 생길 때까지 blocker다.

### 2.13 Tombstone timestamp boundary

기존 provenance의 `inherit`은 한 Evidence가 가리키는 canonical input timestamp를
상속한다. 다중 Evidence set에 first/last/max를 암묵적으로 적용하지 않는다.

### 2.14 Screen Source Map boundary

General doctor는 warning-first다. Capability analyzer만 exact frontmatter/table/row와
relation state를 hard trust로 사용한다. `split|ambiguous`는 정상 구조일 수 있으므로
relation-local non-authorizing이다.

### 2.15 Supersession and lineage boundary

Input frontmatter의 `supersedes`는 source capture lineage의 input-level relation이다.
Exact code operation identity는 아니다.

Graph는 다음을 검사한다.

- target 존재/self-reference
- frontmatter/Summary parity
- strictly-later timestamp
- same source type/lineage
- cycle/branch ambiguity

Code capability revocation은 exact-key ledger가 소유한다. 다만 successor가 아직
reconcile되지 않아 key scope가 불명확하면 predecessor fallback을 보수적으로 막는다.

### 2.16 Layout resolver boundary

Ordinary `{roles.X}` undefined는 계속 `LayoutConfigError`다. Optional app-shell target root만
별도 lazy resolver를 사용한다.

### 2.17 Shared surface and shell boundary

Shared surface는 domain, explicit members, member cap과 fan-out을 전제로 한다. Global
shell을 shared-surface 특례로 만들지 않는다.

### 2.18 Existing fixes and remaining problem

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
- RR/RP만 검사하면 hard-invalid input artifact가 authority가 될 수 있다.
- raw alias exact canonical-only 규칙은 정상 identity reconciliation을 막는다.
- graph leaf만 보면 missing supersedes/new lineage input을 놓친다.
- graph leaf를 mandatory selector로 쓰면 disjoint predecessor operation이 deadlock된다.
- screen scalar timestamp만 보면 다른 key projection 누락을 가린다.
- input ID만 비교하면 다른 evidence bullet을 current 근거로 오인한다.
- tombstone authority가 없으면 pure removal이 Stage 06에 진입하지 못한다.
- exact key 없는 coarse row를 버리면 old exact input이 재사용된다.
- family row-level key는 member 일부 retirement를 표현하지 못한다.
- `(Input, Item, Effect)` effect ref는 valid multi-target rows를 충돌시킨다.
- movable cutover는 unresolved blocker를 legacy로 재분류하는 fail-open이다.
- multi-Evidence tombstone의 inherit 의미가 없으면 retired completeness가 구현마다 달라진다.

### 3.2 App shell gate and ownership

- navigation-map은 route truth owner이지만 implementation target이 아니다.
- visual contract는 visual policy owner이지만 shell readiness gate가 아니다.
- shared-surface global 특례는 member/cap/fan-out 의미를 훼손한다.
- typed declaration alone은 API/package/다른 domain path를 shell path로 탈취할 수 있다.
- broad `route_entry`를 route-host root로 쓰면 ordinary route를 탈취할 수 있다.
- invalid owner를 index에서 버리면 broad `src/**`가 우회한다.
- no-API shell은 API mode에서 host/candidate 모두 닫힐 수 있다.
- eager root resolution은 no-shell/no-API custom layout을 깨뜨린다.

---

## 4. Goals

- maturity와 work intent를 분리한다.
- current, projection-complete exact operation만 screen edit authority를 만든다.
- effect identity를 실제 v2 row cardinality와 일치시킨다.
- 서로 다른 key의 current operations를 도착 순서와 input graph leaf 여부와 무관하게 각각 실행 가능하게 한다.
- 같은 key의 stale operation은 실행하지 못하게 한다.
- active update와 current retirement removal을 모두 지원한다.
- unkeyed visual row를 explicit resolution 전까지 fail closed한다.
- legacy grandfathering을 immutable exact baseline으로 제한한다.
- family member relation의 일부 제거/rename을 명시적으로 표현한다.
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
- evidence bypass
- filename/timestamp만으로 intent 자동 추론
- historical input mutation/backfill
- Contract v2 duplicate 4-tuple을 triple로 breaking 변경
- raw Target 문자열을 effect ref에 직접 포함
- mutable timestamp cutover
- implicit target retirement
- coarse visual target에서 exact key 추론
- family member removal의 silent inference
- input-level `supersedes`를 자동 whole-operation replacement로 해석
- implementation-completion ledger
- doctor/visual warnings 전체의 required CI 승격
- broad default shell roots
- app-shell declaration-only authority
- Open Decision schema 변경
- #224 decision-log contract
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
| canonical Target tuple | parsed Target kind와 필드를 deterministic array로 직렬화한 값 |
| target fingerprint | canonical Target tuple의 full SHA-256 lowercase hex |
| effect ref | input/item/effect/target fingerprint를 포함한 row identity |
| canonical Evidence ref | `input:<id>#<section>[/<1-based-bullet>]` tuple |
| capability target key | exact current visual implementation relation identity |
| mapping key | `mapping:<artifact>/<M-key>` |
| family member key | `visual-family:<artifact>/<family>/<screen>` |
| screen visual key | `screen-visual:<screen-artifact>/<section>` |
| keyed visual effect | exact capability key로 해소된 screen visual effect |
| unkeyed visual effect | capability-capable screen surface에 닿지만 exact key가 없는 effect |
| non-screen visual effect | component-gap 등 screen code currentness를 직접 소유하지 않는 effect |
| visual-intent adoption | legacy baseline을 immutable하게 고정하는 optional confirmed artifact |
| legacy unkeyed baseline | adoption 시점에만 grandfathered한 exact effect-ref/screen rows |
| active record | current mapping/family-member/ScreenSpec provenance record |
| retirement tombstone | exact key/member relation의 explicit retired provenance |
| trusted effect ledger | exact key별 trusted effects와 canonical refs index |
| projection completeness | latest refs가 active record 또는 tombstone에 모두 반영된 상태 |
| active operation | selected effect가 key-local latest active record에 exact-bound된 작업 |
| retirement operation | selected effect가 key-local latest tombstone에 exact-bound된 제거/대체 작업 |
| key-local supersession | same exact key의 newer trusted refs가 predecessor operation을 폐기하는 규칙 |
| input graph trust | input-level lineage edge의 구조/시간/source/parity trust |
| successor uncertainty | newer successor가 아직 reconcile되지 않아 exact key scope가 불명확한 상태 |
| current visual event | complete key states의 report-only aggregate timestamp |
| operation scope | selected input이 실제로 authorize한 exact active/retired keys 집합 |
| source lineage | logical replacement stream key |
| lineage transition | legacy/source move의 append-only audit relation |
| alias relation state | authorizing / acknowledged-non-authorizing / conflicting |
| deny claim | path, source, class, overrideability를 가진 deny |
| typed shell path | semantic kind와 reservation claim, physical authority 자체는 아님 |
| kind root | policy/layout-owned shell physical ceiling |
| required-on-use | 해당 kind declaration/candidate가 있을 때만 필수인 root |
| deny-only ownership | positive authority 없이 다른 target을 차단하는 recoverable claim |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. Intent는 explicit이며 bypass가 없다.
4. Input Result Contract와 Reconciliation v2 hard trust를 모두 요구한다.
5. Selected screen scope는 canonical ID 또는 authorizing source-map relation이어야 한다.
6. Trusted effect identity는 실제 v2 duplicate 4-tuple과 충돌하지 않아야 한다.
7. Same input/item/effect + different Target은 서로 다른 effect refs다.
8. Exact same 4-tuple은 기존 RR-ITEM duplicate error다.
9. Capability effect는 canonical Evidence ref를 가져야 한다.
10. Keyed effect는 exact active record 또는 exact tombstone에 결합한다.
11. Input ID만 같고 section/bullet이 다르면 deny한다.
12. Relevant exact key 전체의 projection completeness를 screen scalar보다 먼저 검사한다.
13. Trusted historical key는 active record나 tombstone 없이는 ledger에서 사라지지 않는다.
14. Current active record 삭제는 retirement tombstone 없이는 stale다.
15. Current retirement operation은 실제 removal을 authorize할 수 있다.
16. Historical retirement는 authority가 아니다.
17. Retirement operation은 exact retired keys의 remove/replace scope만 정당화한다.
18. Unkeyed screen visual effect는 authority를 만들지 않는다.
19. Adoption baseline 또는 explicit resolution 없는 unkeyed effect는 blocker다.
20. Later unrelated exact event는 unkeyed blocker를 해소하지 않는다.
21. Confirmed adoption baseline은 append-only가 아니라 immutable이다.
22. Adoption 이후 새 blocker를 baseline에 추가해 legacy로 재분류하지 않는다.
23. `structured_since`가 adoption snapshot과 다르면 visual intent는 fail closed한다.
24. Family capability identity는 member screen별이다.
25. Member 제거는 explicit member-key retirement가 필수다.
26. Screen-global event와 input graph leaf는 exclusive operation selector가 아니다.
27. Same-key newer evidence만 predecessor exact operation을 폐기한다.
28. Disjoint successor keys는 predecessor disjoint operation을 폐기하지 않는다.
29. Unreconciled/scope-unclear successor는 overlapping screen predecessor fallback을 막는다.
30. Source move는 invalid cross-lineage edge를 만들지 않는다.
31. Deny는 claim 단위로 판정하고 non-waivable claim이 우선한다.
32. Forward/backstop은 동일 authorization context를 소비한다.
33. Packet/Report는 trust/currentness를 재계산하지 않는다.
34. Shell declaration은 physical authority를 스스로 만들지 않는다.
35. Route-host는 exact root 안에서만 가능하다.
36. Optional/required-on-use roots는 lazy resolve한다.
37. Ordinary undefined role은 계속 `LayoutConfigError`다.
38. No-API shell은 host만 유지하며 hook/API/candidate authority를 얻지 않는다.
39. Malformed owner declaration은 다른 target authority를 넓히지 않는다.
40. No-intent/no-shell behavior는 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode union | reject | task kind와 API freeze를 구분하지 못함 |
| API screen forbid 제거 | reject | 모든 API wiring에 screen mutation 개방 |
| scalar visual-refresh mode | reject | maturity/task kind 재혼합 |
| evidence 없는 intent | reject | bearer capability |
| historical item only | reject | current authored provenance 불명 |
| input ID equality | reject | 다른 evidence bullet 오인 |
| effect ref without Target | reject | valid multi-target rows collision |
| v2 duplicate triple hardening | reject | existing valid multi-target item breaking change |
| Target fingerprint effect ref | adopt | existing 4-tuple cardinality 보존 |
| raw Target in effect ref | reject | unsafe/unbounded grammar와 unstable escaping |
| screen max timestamp only | reject | cross-key projection/operation masking |
| exact key ledger | adopt | key별 latest projection/currentness 확인 |
| screen-global event as selector | reject | disjoint pending operation 소실 |
| graph leaf as selector | reject | input-level edge가 disjoint key operation deadlock 생성 |
| key-local operation eligibility | adopt | same-key stale만 거부, disjoint key 실행 가능 |
| input graph as lineage/uncertainty | adopt | graph 사실과 code capability 분리 |
| whole-input implicit supersession | reject | omitted key 의미 추론/operation loss |
| separate implementation ledger | defer | current #222 slice보다 범위 큼 |
| tombstone currentness only, authority 없음 | reject | pure removal deadlock |
| separate public visual-retirement intent | defer | first slice public surface 불필요 확장 |
| visual-refresh internal retirement operation | adopt | 기존 CLI + exact operation scope |
| unkeyed timestamp age-out | reject | unrelated event가 coarse meaning을 소멸 |
| mutable visual-intent cutover | reject | future/forward 이동으로 blocker bypass |
| immutable adoption baseline | adopt | exact grandfathered effect refs 고정 |
| explicit unkeyed resolution | adopt | provenance-bearing refinement/supersession |
| multi-Evidence inherit=max | reject | 기존 inherit 의미를 집계 연산으로 변경 |
| inherit single-ref only | adopt | 기존 provenance 의미와 일치 |
| family row-level key | reject | member 일부 retirement 불가 |
| family × member key | adopt | A active/B retired 동시 표현 |
| historical input backfill | reject | immutability 위반 |
| lineage transition + current target update | adopt | append-only migration |
| global duplicate alias failure | reject | valid split가 unrelated alias 차단 |
| relation-local alias state | adopt | blast radius 제한 |
| typed shell declaration alone | reject | arbitrary physical authority |
| declaration ∩ kind root | adopt | semantic owner와 physical authority 분리 |
| route-host → route_entry | reject | ordinary route까지 broad authority |
| exact app_shell_route_host | adopt | host boundary만 개방 |
| eager api_client root | reject | no-API custom layout 파손 |
| required-on-use root | adopt | API surface 사용 때만 fail closed |
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
  --input IN-20260819-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

First slice에서 `visual-refresh`는 screen selector에만 허용한다.

다음으로 자동 활성화하지 않는다.

- Figma mapping 존재
- 최근 timestamp
- filename/source type
- current readiness mode
- caller assertion만 존재

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

### 10.4 Deterministic effect identity aligned with v2 cardinality

Existing duplicate contract is unchanged.

```text
exact duplicate key =
  (Input ID, Item, Effect, Target)
```

Canonical parsed Target tuple:

```text
artifact target:
  ["artifact", artifactId, section-or-empty, rowKey-or-empty]

child target:
  [kind, rowId, ownerArtifactId]

input target:
  ["input", inputId]

none target:
  ["none"]
```

Normalization:

- parser-trimmed grammar values
- Unicode NFC
- fixed tuple field order
- empty optional slots represented by `""`
- JSON array serialization without insignificant whitespace
- UTF-8 bytes

```text
target_fingerprint =
  lowercase_hex(SHA-256(utf8(JSON.stringify(canonical_target_tuple))))
```

Full effect ref:

```text
visual-effect:<input-id>/<item>/<effect>/<64-lowercase-hex-target-fingerprint>
```

Example:

```text
visual-effect:IN-X/01/update/7f5f...<64 hex total>
```

Rules:

- trusted, parseable Target row만 effect ref를 가짐
- same input/item/effect + different Target → different fingerprints/refs
- exact same 4-tuple → existing RR-ITEM duplicate hard error
- hash truncation 금지
- raw Target text를 URI path에 직접 넣지 않음
- diagnostics/Packet/Report는 effect ref와 canonical Target raw display를 함께 보존
- target fingerprint collision이 실제로 검출되면 both rows hard-ambiguous; first-wins 금지

기존 multi-target item은 유지된다. Triple uniqueness를 새 hard contract로 만들지 않는다.

### 10.5 Visual-intent adoption artifact

Mutable timestamp field `visual_intent_structured_since`를 사용하지 않는다.

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
adopted_at: "2026-08-19T10:00:00+09:00"
baseline_digest: "sha256:<64-lowercase-hex>"
approved_by: "{human}"
approved_at: "2026-08-19T10:00:00+09:00"
decision_id: "D-..."
---
```

Legacy baseline table:

```markdown
## Legacy Unkeyed Baseline

| Effect Ref | Screen ID | Canonical Target | Evidence | Input Captured At | Disposition |
|---|---|---|---|---|---|
| visual-effect:IN-OLD/01/update/<target-sha256> | CREATE-ATTACH | artifact:CREATE-ATTACH-figma-component-mapping | input:IN-OLD#extracted-facts/01 | 2026-07-30T09:00:00+09:00 | advisory-history |
```

Current-tree trust:

```text
adoption_trusted =
  unique canonical artifact
  AND exact frontmatter/schema/table
  AND status == confirmed
  AND visual_intent_contract == 1
  AND structured_since_snapshot == register.structured_since
  AND adopted_at/approved_at RFC3339
  AND structured_since_snapshot <= adopted_at <= approved_at <= evaluation_now
  AND every baseline Effect Ref resolves to one trusted unkeyed effect
  AND every baseline row screen is in that effect's canonical scope
  AND every baseline input captured_at <= adopted_at
  AND baseline_digest matches canonical sorted rows + immutable frontmatter snapshot
```

`evaluation_now`는 analyzer argument로 주입한다. Pure analyzer가 wall clock을 직접 읽지 않는다.

Canonical digest input:

```text
{
  visual_intent_contract,
  structured_since_snapshot,
  adopted_at,
  sorted baseline rows with normalized effect ref/screen/target/evidence/captured_at/disposition
}
```

Confirmed immutability:

- creation PR에서는 exact initial artifact를 허용
- 이후 diff-aware validate/backstop은 frontmatter immutable fields, baseline rows,
  digest의 edit/delete/reorder semantic change를 hard error
- baseline row 추가도 hard error
- register `structured_since`가 snapshot과 달라지면 current-tree analyzer hard-untrusted
- adoption artifact 삭제/rename/duplicate도 visual intent hard error
- adoption을 미래 날짜로 생성하면 hard error
- confirmed artifact를 다시 draft로 내려 baseline을 재작성하는 경로 금지

새 unkeyed effect는 baseline에 추가하지 않는다. Exact resolution을 사용한다.

Artifact가 없으면 no-intent behavior는 유지하고 `visual-refresh`만 inapplicable이다.

### 10.6 Strict Screen Source Map capability analyzer

```text
analyzeScreenSourceMapCapability({mapFile, raw, activeScreens}) -> {
  structure_trusted,
  canonical_index,
  alias_index,
  namespace_index,
  diagnostics
}
```

Global structure trust:

- canonical `_meta/screen-source-map.md`
- parseable frontmatter
- exact artifact identity
- exactly one canonical table
- exact unique 10-column header
- unique Canonical Screen ID row
- valid ScreenSpec path/route/status references

Alias relation states:

```text
authorizing
acknowledged-non-authorizing
conflicting
```

Rules:

- one-canonical `confirmed|merged` → authorizing
- acknowledged `split|ambiguous` → relation-local non-authorizing
- candidate/deprecated → relation-local non-authorizing
- contradictory confirmed/merged mappings → conflicting
- canonical-ID/source-alias collision → token-local conflicting

A valid split does not poison unrelated confirmed aliases.

### 10.7 Scope resolution

```text
scope_allows(screen) =
  active canonical screen exact relation
  OR authorizing source-map relation
```

Raw/source alias 자체는 authority를 만들지 않는다. Malformed/empty scope는 input trust
false 또는 scope false다.

### 10.8 Canonical Evidence ref

Shared parser output:

```text
input:<input_id>#<section-slug>[/<1-based-bullet>]
```

Canonical comparison은 tuple 기준이다.

```text
same input ID + different section/bullet → not equal
```

Duplicate normalized refs는 invalid다.

### 10.9 Capability target identities

#### A. Figma mapping

```text
mapping:<figma-mapping-artifact-id>/<mapping-key>
```

Mapping Key는 exact `M-...`다. Whole artifact 또는 `#component-mapping` section-only는
capability key가 아니다.

#### B. Visual family member relation

```text
visual-family:<visual-contract-artifact-id>/<family-key>/<screen-id>
```

Active `Screen Families` row 하나는 `Member Screens`의 canonical screen마다 key 하나로
전개된다.

```text
Family F members [SCREEN-A, SCREEN-B]
→ visual-family:<id>/F/SCREEN-A
→ visual-family:<id>/F/SCREEN-B
```

Family target effect row는 exact family row를 가리키고 trusted input scope가 member
screen set을 정한다.

```text
fan_out =
  scoped canonical screens
  ∩ (active members ∪ historical member keys ∪ retirement member keys)
```

Fan-out set이 비거나 ambiguous하면 keyed effect가 아니라 unkeyed blocker다.

#### C. ScreenSpec visual section

```text
screen-visual:<screen-spec-artifact-id>/<visual-section-slug>
```

Whole ScreenSpec artifact는 unkeyed다. Visual-allowed section과 current `Visual Evidence` row가
필요하다.

### 10.10 Visual effect classification

모든 trusted `visual-evidence` update/create row를 다음으로 분류한다.

```text
keyed-screen-visual:
  target is mapping/family-member/ScreenSpec exact capability identity

unkeyed-screen-visual:
  target reaches a capability-capable screen visual surface
  and screen scope resolves
  but exact target identity cannot be produced

non-screen-visual:
  component-gap-register or other visual-support artifact
  that does not directly own selected screen code currentness
```

Examples of unkeyed screen visual effects:

```text
artifact:<screen-figma-mapping-id>
artifact:<screen-figma-mapping-id>#component-mapping
artifact:<visual-contract-id>
artifact:<visual-contract-id>#screen-families
artifact:<screen-spec-id>
family row target whose member fan-out is ambiguous
```

Component-gap-only item은 `non-screen-visual`이며 screen blocker가 아니다.

### 10.11 Current active provenance adapters

#### Mapping

Exact `Mapping Provenance` row:

```text
Mapping Key exact
Evidence canonical ref set exactly one
Source Ref/Unit/Captured At hard-valid
```

#### Family member

Exact `Screen Families` row:

- unique Family key
- structurally valid unique `Member Screens`
- canonical Evidence ref set
- each current member emits one member key with the row Evidence set

#### ScreenSpec

Optional exact table:

```markdown
## Visual Evidence

| Section | Evidence | Captured At | Status |
|---|---|---|---|
| ui-sections | input:IN-...#extracted-facts/01 | inherit | current |
```

- exactly one table/header
- visual-allowed section
- one current row per section
- canonical ref set, no duplicates
- missing table means ScreenSpec target cannot authorize capability

### 10.12 Exact effect-to-authored-record binding

For every selected keyed effect, canonical ref가 같은 exact key의 authored state 한 곳에만
결합해야 한다.

```text
selected_effect.evidence_ref
  ∈ active_record(selected_effect.target_key).evidence_refs
  XOR
selected_effect.evidence_ref
  ∈ retirement_tombstone(selected_effect.target_key).evidence_refs
```

- active operation binds to active record
- retirement operation binds to tombstone
- active record and tombstone for one exact key cannot coexist
- no record or both records → invalid

Mapping active binding은 equality다. Family-member/ScreenSpec active binding과 retirement
binding은 exact canonical set membership이다.

Selected group의 selected screen-resolving effects 모두 binding을 통과해야 한다.

### 10.13 Trusted keyed effect ledger

```text
trusted_effects_by_key[key] =
  all Input Result-trusted + Reconciliation-trusted keyed visual effects

latest_at(key) =
  max(effect.input.captured_at)

latest_trusted_refs(key) =
  set(effect.evidence_ref for effects at latest_at(key))
```

Ledger는 current artifact row 존재와 독립적이다. Row 삭제로 historical key가 사라지지 않는다.

Hard ambiguity:

- same key + same max timestamp + incompatible semantics
- duplicate normalized `(target_key,evidence_ref)` from distinct items without exact dedupe contract
- unresolved/noncanonical ref
- target fingerprint collision

### 10.14 Relevant exact key set and completeness

```text
relevant_target_keys(screen) =
  keyed trusted effects resolving to screen
  ∪ current active keys resolving to screen
  ∪ retirement tombstone keys resolving to screen
```

```text
active_complete(key) =
  unique hard-valid active record
  AND latest_trusted_refs(key) ⊆ active_record.evidence_refs
```

A newer unrelated key cannot hide older/equal-time incomplete key.

```text
M-001 current A @ 11:00
M-002 trusted B @ 10:00 but unprojected
→ M-002 incomplete → screen stale
```

### 10.15 Explicit target/member retirement and timestamp semantics

Each visual owner artifact may contain one optional exact table.

```markdown
## Visual Target Retirements

| Target Key | Evidence | Captured At | Replaced By | Status |
|---|---|---|---|---|
| mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-...#extracted-facts/07 | inherit | mapping:CREATE-ATTACH-figma-component-mapping/M-020 | retired |
| visual-family:visual-consistency-contract/F/SCREEN-B | input:IN-...#extracted-facts/08 | inherit | - | retired |
```

Structural contract:

- exact five-column header, one table per owner artifact
- Target Key belongs to owner artifact and resolves uniquely
- family retirement key includes canonical screen member
- Status exactly `retired`
- Evidence nonempty canonical ref set, no duplicates
- Replaced By `-` or valid exact key
- active record and tombstone for same exact key cannot coexist

`Captured At` contract:

```text
Evidence count == 1 AND Captured At == inherit
→ effective_captured_at = referenced input.captured_at

Evidence count > 1 AND Captured At == inherit
→ hard-invalid

Captured At is explicit RFC3339
→ effective_captured_at = explicit value
→ explicit value >= captured_at of every referenced input
```

Additional rules:

- single Evidence + explicit timestamp도 referenced input보다 이르면 hard-invalid
- multi-Evidence row는 explicit RFC3339 필수
- first/last ref 선택이나 implicit max aggregation 금지
- referenced input unresolved/hard-untrusted → tombstone invalid

```text
retired_complete(key) =
  unique valid tombstone
  AND latest_trusted_refs(key) ⊆ tombstone.evidence_refs
  AND tombstone.effective_captured_at >= latest_at(key)
```

No new Reconciliation Effect enum is added. Retirement는 existing `Effect=update` to owner/key와
exact tombstone provenance로 표현한다.

### 10.16 Family member removal and rename

Member removal:

```text
Before F members [A,B]
After  F members [A]
```

Required state:

```text
visual-family:<id>/F/A → active_complete
visual-family:<id>/F/B → retired_complete
```

B removal without member tombstone makes only SCREEN-B stale. SCREEN-A remains active/current.

Family rename F→G:

- old member keys `F/<screen>` explicitly retired
- new member keys `G/<screen>` active
- `Replaced By` may link old member key to new member key

### 10.17 Key-local current operation classification

Authorization eligibility is exact-key local.

#### Active update operation

```text
active_operation(effect) =
  effect.evidence_ref ∈ active_record(effect.key).evidence_refs
  AND active_complete(effect.key)
  AND effect.evidence_ref ∈ latest_trusted_refs(effect.key)
```

#### Retirement operation

```text
retirement_operation(effect) =
  effect.evidence_ref ∈ tombstone(effect.key).evidence_refs
  AND retired_complete(effect.key)
  AND effect.evidence_ref ∈ latest_trusted_refs(effect.key)
  AND tombstone is the latest complete authored state for that key
```

#### Selected operation currentness

```text
selected_operation_current(effect) =
  active_operation(effect)
  OR retirement_operation(effect)
```

Rules:

- selected input의 selected screen-resolving effects 모두 key-local current여야 함
- same key에 newer trusted refs가 있으면 older effect 거부
- different key의 newer event는 older disjoint current operation을 거부하지 않음
- selected input은 operation scope keys만 authorize
- tombstone은 selected latest effect와 exact-bound될 때만 operation
- historical retirement ref는 authority 0

Normal sequential example:

```text
IN-A @ 10:00 → M-001 active_complete, not implemented yet
IN-B @ 11:00 → M-002 active_complete, not implemented yet
```

```text
--input IN-A → M-001 key-local current → allowed for M-001 scope
--input IN-B → M-002 key-local current → allowed for M-002 scope
```

Same-key replacement:

```text
IN-A @ 10:00 → M-001
IN-B @ 11:00 → M-001
```

```text
IN-A ref ∉ latest_trusted_refs(M-001) → denied
IN-B may authorize
```

No implementation-completion ledger is introduced. Run Report는 execution evidence지만
capability gate-raising source가 아니다.

### 10.18 Screen projection state and report-only aggregates

```text
target_provenance_state(screen) = current
iff every relevant exact key is:
  active_complete(key)
  OR retired_complete(key)
```

그 외:

```text
target_provenance_state = stale
intent permission = 0 for every input
```

Report-only fields:

```text
current_visual_revision_at(screen) =
  max(latest_at(key) for active_complete keys)

current_visual_event_at(screen) =
  max(latest_at(key) for active_complete or retired_complete keys)
```

Neither field is an exclusive authorization selector.

### 10.19 Operation scope

Physical path envelope는 screen/domain-component다. Semantic authorization은 selected exact
operation keys로 제한한다.

```yaml
operation_scope:
  kind: retirement-only | active-update | mixed
  authorized_operations:
    - effect_ref: visual-effect:IN-REMOVE/01/update/<target-sha256>
      target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-002
      operation: retire
      evidence_ref: input:IN-REMOVE#extracted-facts/03
      key_latest_at: "2026-08-19T10:00:00+09:00"
```

Rules:

- retirement-only context는 exact retired keys의 remove 또는 `Replaced By` replacement만 정당화
- unrelated active key provenance/family membership/mapping row 변경은 scope violation
- active-update context는 selected current active keys만 정당화
- mixed context는 selected input의 exact active/retirement operations만 허용
- Stage 06 Work Packet은 authorized operations 복사
- Run Report는 operations와 changed files를 exact effect/key별 연결
- post-change validator는 visual owner artifact delta가 operation set 밖 key를 변경하지 않았는지 검사
- path backstop은 physical boundary, operation-scope validator는 authored visual-contract delta 검사

### 10.20 Unkeyed effect baseline and resolution

```text
unkeyed_visual_effects(screen) =
  trusted visual-evidence update/create effects
  AND target reaches mapping / visual family / ScreenSpec visual surface
  AND canonical screen scope resolves
  AND exact capability key cannot be produced
```

An unkeyed effect is non-blocking only when:

```text
(effect_ref, screen_id) is in immutable adoption baseline
OR
(effect_ref, screen_id) has a valid explicit resolution
```

No timestamp age-out exists.

### 10.21 Explicit Unkeyed Visual Resolutions

Reconciliation Register v2 may contain one exact table.

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

Structural contract:

- exactly one table/header
- unique `(Effect Ref, Screen ID)` row
- Effect Ref resolves to exactly one trusted unkeyed effect
- Screen ID is in effect's canonical scope
- Target Keys `;`-separated exact key set or `-` where permitted
- Resolving Evidence canonical ref set or `-`
- Decision Ref `-` or canonical Open Decision ID
- duplicate normalized keys/refs invalid

`refined-to-key`:

```text
Target Keys nonempty
Resolving Evidence nonempty
all refs belong to trusted keyed effects resolving to keys/screen
all keys projection-complete
Decision Ref == -
```

`superseded-by-keyed`:

```text
Target Keys nonempty
Resolving Evidence nonempty
all refs belong to newer trusted keyed effects
keyed effects explicitly reference this full Effect Ref as refinement/supersession provenance
all keys projection-complete
Decision Ref == -
```

`no-screen-impact`:

```text
Target Keys == -
Resolving Evidence == - or supporting refs
Decision Ref resolves to human-resolved canonical decision
resolved decision explains no screen-code impact
```

Resolution row는 blocker만 제거한다. Positive authority는 keyed current operations에서만 나온다.

One unkeyed effect scoped to multiple screens requires one row per screen.

### 10.22 Blocking unkeyed formula

```text
blocking_unkeyed(screen) =
  trusted unkeyed effects resolving to screen
  whose `(effect_ref, screen_id)` is neither:
    immutable baseline row
    nor valid explicit resolution row
```

If nonempty:

```text
target_provenance_state = unkeyed-or-stale
intent permission = 0 for every input on screen
```

Later unrelated exact events do not clear this set.

### 10.23 Supersession graph trust and key-aware capability ownership

Input graph edge:

```text
successor -> predecessor
where successor.frontmatter.supersedes == predecessor.input_id
```

Every trusted edge:

```text
successor.captured_at > predecessor.captured_at
successor.source_type == predecessor.source_type
successor.source_lineage == predecessor.source_lineage
frontmatter Supersedes == Summary Supersedes
```

Component trust:

- unique nodes
- no self edge
- acyclic
- at most one direct successor per predecessor
- no branch ambiguity

The graph does **not** globally revoke predecessor operations.

```text
key_operation_superseded(effect) =
  exists newer trusted keyed effect for same exact key
  OR explicit keyed resolution revokes that exact effect/key
```

The existing `latest_trusted_refs(key)` implements same-key revocation.

Disjoint successor:

```text
IN-A @ 10:00: M-001
IN-B @ 11:00: supersedes IN-A, M-002 only
```

Result:

```text
M-001 latest ref remains IN-A → IN-A M-001 operation remains eligible
M-002 latest ref is IN-B → IN-B M-002 operation eligible
IN-A graph_leaf == false is report provenance only
```

Same-key successor:

```text
IN-A @ 10:00: M-001
IN-B @ 11:00: supersedes IN-A, M-001
```

Result:

```text
M-001 latest refs owned by IN-B → IN-A operation denied
```

Input-level `supersedes` means source capture lineage, not implicit whole-operation replacement.
A producer that intends whole-screen replacement must emit update/retire effects for every affected
exact key. Omitted keys remain current and a warning explains that `supersedes` alone does not carry
forward or retire operations.

### 10.24 Successor uncertainty blocker

A newer successor can exist before Stage 04 establishes exact keys.

```text
blocking_successor_uncertainty(effect, screen) =
  exists newer successor in selected input's trusted graph component
  AND successor scope resolves to screen
  AND successor reconciliation state is missing | not-started | in-progress | failed
      OR successor visual rows are scope-unclear/unkeyed for screen
```

If true, predecessor operation on that screen is temporarily denied.

```text
next action = reconcile/refine successor input
```

Once successor is reconciled:

- same-key effects revoke predecessor through key ledger
- disjoint exact keys release predecessor disjoint operations
- unresolved unkeyed successor remains blocker through §10.22

This preserves stale-input fallback safety without treating graph leaf as permanent operation owner.

### 10.25 Legacy lineage adoption and source move

Historical input is immutable. Do not backfill lineage or invent invalid cross-lineage supersession.

```yaml
source_lineage: figma-screen://file/new-file/CREATE-ATTACH
lineage_transition:
  from_input: IN-OLD
  reason: source-move
```

Transition contract:

- from_input exists and is older
- new input trusted
- old/new resolve to same canonical screen
- new input creates current key-local active/retirement operations
- transition alone is not authority

### 10.26 Final evidence formula

```text
intent_evidence_valid =
  adoption_trusted
  AND selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND scope_allows(selected_screen)
  AND every selected screen-resolving effect has unique 4-tuple-aligned effect ref
  AND every selected screen-resolving effect is keyed
  AND every selected screen-resolving effect is key-locally current
  AND every selected operation is not key-superseded
  AND every relevant exact key is projection-complete
  AND blocking_unkeyed(screen) is empty
  AND blocking_successor_uncertainty(selected_input, screen) is empty
  AND target_provenance_state == current
  AND supersession_component_trusted
```

Not required:

```text
selected_input.captured_at == current_visual_event_at(screen)
selected_input_is_graph_leaf_or_isolated
```

### 10.27 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-A
    input_artifact_trusted: true
    reconciliation_trusted: true
    graph_component_trusted: true
    graph_leaf: false
    eligibility_basis: key-local-current-operations
    adoption:
      artifact_id: visual-intent-adoption
      baseline_digest: sha256:...
      structured_since_snapshot: "2026-07-20T00:00:00+09:00"
    current_visual_event_at: "2026-08-19T11:00:00+09:00"
    blocking_unkeyed_effects: []
    blocking_successor_uncertainty: []
    operation_scope:
      kind: active-update
      authorized_operations:
        - effect_ref: visual-effect:IN-A/01/update/<target-sha256>
          target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-001
          operation: update
          evidence_ref: input:IN-A#extracted-facts/01
          key_latest_at: "2026-08-19T10:00:00+09:00"
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

Actual claim object를 검사한다.

### 11.4 Positive physical envelope

```text
intent candidates =
  resolve({roles.screen})
  ∪ resolve({roles.domain_component})
```

Hook/API-client, candidate, delegated shared, valid/deny-only shell reservation, generated,
other-owner paths는 non-waivable deny다.

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

Physical allowed does not erase operation scope. Active/retirement/mixed scope remains in output,
Packet, Report and post-change validation.

### 11.6 Output stability

No-intent output에 `work_intent`를 추가하지 않는다. Base `allowed_paths`를 intent path로
교체하거나 합치지 않는다.

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

Forbidden identity:

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

`app_shell_route_host`는 exact files only다. Broad subtree는 invalid다.
Default Expo preset은 broad shell roles를 합성하지 않는다.

### 12.5 Lazy root resolver

```text
resolveTargetProfileRoot({layout, profile, kind, usage}) -> {
  state: unused | bound | optional-unbound | required-on-use-unbound | invalid,
  globs,
  role,
  reason
}
```

- no shell → no lookup
- no declaration/candidate for kind → unused
- optional kind used + missing role → target-local permission 0, readiness exit 0
- API kind used + missing api_client → required-on-use-unbound, permission 0, deny-only
- ordinary role resolution remains LayoutConfigError/exit 2

No-API host-only shell never resolves `api_client`.

### 12.6 Root binding and contradiction

```text
root_binding(entry) =
  exactly one resolved same-kind root fully covers path
  AND no different-kind root overlaps path
```

States:

- zero root → kind-root-unbound
- multiple roots → kind-root-ambiguous
- different-kind overlap → kind-contradiction
- valid unique root → positive authority candidate

Examples:

```text
src/api/app-shell/** + kind:shell-host
→ api-client root contradiction → permission 0 + deny-only

package.json + kind:shell-host
→ outside shell-host root → permission 0 + deny-only
```

### 12.7 Invalid declarations

Hard-invalid:

- string-only/missing path or kind
- unknown kind
- duplicate/overlap
- unsafe/noncanonical/broad path
- missing/ambiguous required-on-use root
- kind contradiction
- cross-owner conflict

Recoverable narrow path remains deny-only under §15.

### 12.8 Fact profile

| Mode | Target-specific minimum |
|---|---|
| docs-only | artifact parse only |
| route-skeleton | valid identity/status/nav reference |
| screen-skeleton | core sections + trusted root-bound host paths |
| rough-fixture-ui | state/non-route interactions complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API special case or valid actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.9 Normal path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | route-host |
| screen-skeleton | route-host, shell-host |
| rough/final | host + valid owned hook candidate slices |
| api-integrated | valid owned hook/API slices; host frozen |
| production-ready | host + valid active slices; unowned API denied |

### 12.10 No-API profile

```text
if api_required == false and readiness >= api-integrated-ui:
  effective_path_profile = no-api-host
```

Allowed: root-bound route-host/shell-host.
Denied: hook/API-client/candidate/generated/Tier3/custom/other-owner/contract claims.

---

## 13. Decision D5 — Target-aware API Candidate Ownership

### 13.1 Owner

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

### 13.2 Surface resolution

- screen: existing domain/layout hook/API roles
- shared-surface: existing parser + generic conflict index
- app-shell hook: trusted root-bound typed hook parent
- app-shell API: trusted root-bound typed API parent; triggers required-on-use resolution

### 13.3 Tracking

`unknown:U-...` resolves in same owner artifact.

### 13.4 Positive authority

```text
same owner
contract valid
confirmed + active
slice fully in one trusted typed parent
kind/root matches
no conflict
api_required != false
```

### 13.5 Deny-only candidate provenance

Deferred, invalid, outside declaration, root-unbound, required-on-use-unbound, kind mismatch,
cross-target conflict and no-API candidate preserve recoverable project-wide deny claims.

---

## 14. Decision D6 — Target-scoped Open Decisions

- canonical six-column global register reused
- app-shell `decision_refs`
- `open|resolved`; human-only resolve
- missing/ambiguous/malformed ref caps shell only
- resolved ref remains provenance
- unrelated screen/shared member cap unaffected
- zero-ref global row remains valid/non-blocking

`Blocking Mode` uses the same mode order against app-shell fact profile.

Visual intent adoption artifact의 `decision_id`는 adoption 승인 provenance다. 해당 decision을
수정해 baseline을 재작성하는 authority로 사용하지 않는다.

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

Recoverable includes missing kind, root-unbound, required-on-use-unbound, contradiction,
duplicate/overlap/identity and safe aliases.

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

### 15.4 Projection and precedence

Valid/deny-only shell reservations project to every screen/shared/other-shell context.
Broad `src/**` cannot bypass them.

---

## 16. Public CLI Contract

Selectors:

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

Mutually exclusive.

Visual intent requires `--screen`, `--intent visual-refresh`, `--input`.
Unknown/blank intent, missing pair, selector conflict, malformed IDs or noncanonical `--path` are exit 2.

Evidence/currentness/adoption/unkeyed/root failure is keyed `applicable:false` or path denial,
readiness exit 0. Ordinary undefined layout role remains configuration error/exit 2.

No separate public `visual-retirement` intent is added. Operation kind derives from exact current
active/tombstone binding.

Optional adoption diagnostics command may be added:

```bash
npm run workflow:visual-intent-adoption -- --json
```

It previews baseline candidates but cannot confirm/modify an existing confirmed adoption artifact.

---

## 17. workflow-state Contract

### 17.1 Visual intent adoption

Emit only when artifact exists.

```yaml
visual_intent_adoption:
  status: confirmed
  contract: 1
  structured_since_snapshot: "2026-07-20T00:00:00+09:00"
  adopted_at: "2026-08-19T10:00:00+09:00"
  baseline_digest: sha256:...
  baseline_effect_count: 3
  trusted: true
```

### 17.2 Visual evidence summary

```yaml
visual_evidence:
  CREATE-ATTACH:
    target_provenance_state: current
    current_visual_event_at: "2026-08-19T11:00:00+09:00"
    blocking_unkeyed_effects: []
    blocking_successor_uncertainty: []
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
    ownership_claims: []
    deny_only_ownership: []
```

### 17.4 Determinism

Sort target IDs, effect refs, exact keys, member screen IDs, refs, input IDs, claims and diagnostics.
If state serializes trust indexes, source hashes/version hashes are mandatory; stale generated trust
cannot be accepted.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Disjoint predecessor remains eligible despite graph successor

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": true,
      "evidence": {
        "graph_component_trusted": true,
        "graph_leaf": false,
        "eligibility_basis": "key-local-current-operations",
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

### 18.2 Same-key predecessor denied

```json
{
  "path_authorization": {
    "allowed": false,
    "reason": "same-key-newer-effect",
    "selected_effect_ref": "visual-effect:IN-A/01/update/<old-target-sha256>",
    "latest_effect_refs": [
      "visual-effect:IN-B/01/update/<same-target-sha256>"
    ]
  }
}
```

### 18.3 Unkeyed blocker

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": false,
      "evidence": {
        "target_provenance_state": "unkeyed-or-stale",
        "blocking_unkeyed_effects": [
          {
            "effect_ref": "visual-effect:IN-U/01/update/<target-sha256>",
            "target": "artifact:CREATE-ATTACH-figma-component-mapping"
          }
        ]
      },
      "next_actions": [
        "refine or resolve each exact Effect Ref"
      ]
    }
  }
}
```

### 18.4 Successor uncertainty

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": false,
      "evidence": {
        "blocking_successor_uncertainty": [
          {
            "input_id": "IN-B",
            "reconcile_status": "not-started",
            "reason": "newer-successor-key-scope-unknown"
          }
        ]
      },
      "next_actions": ["reconcile successor IN-B"]
    }
  }
}
```

### 18.5 Pure retirement authorization

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
              "effect_ref": "visual-effect:IN-REMOVE/01/update/<target-sha256>",
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

### 18.6 No-API shell without API root

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
- visual-intent adoption current-tree trust
- canonical Evidence normalization
- mapping/family-member/ScreenSpec target resolution
- keyed effect ledger
- unkeyed screen-visual index/resolution
- active provenance adapters
- retirement tombstone/member relation parser
- deterministic tombstone timestamp
- per-key completeness/current operations
- input graph/key-aware supersession/uncertainty
- Screen Source Map structure/relation state
- app-shell roots/ownership/deny claims

### 19.2 Diff-aware immutable adoption guard

Current-tree analyzer alone cannot prove history. CI/backstop compares base and head for confirmed
adoption artifact.

Hard errors:

- confirmed artifact deletion/rename
- immutable frontmatter change
- `structured_since_snapshot` change
- `adopted_at`/approval provenance change
- baseline row add/remove/edit
- baseline digest change not caused by initial creation
- register `structured_since` change after adoption
- duplicate adoption artifact

Initial adoption creation is the only allowed baseline write. Subsequent unkeyed effects use
resolution table, not baseline mutation.

### 19.3 Authorization order

```text
1 concrete path canonicality
2 target/lifecycle/contract validity
3 visual-intent adoption trust
4 input artifact trust
5 reconciliation/effect trust
6 canonical Target tuple/fingerprint/effect identity
7 screen scope relation
8 keyed / unkeyed / non-screen classification
9 canonical Evidence normalization
10 exact mapping/member/section key
11 active/tombstone record trust
12 every relevant key projection completeness
13 immutable-baseline/explicit unkeyed resolution
14 screen provenance state
15 selected key-local active/retirement operation
16 input graph trust and successor uncertainty
17 intent prerequisite/base readiness
18 target-root lazy resolution/no-API profile
19 positive physical profile
20 ownership/generated/candidate denies
21 claim waiver and remaining deny precedence
22 structured operation provenance
```

### 19.4 Forward/diff parity

`workflow:readiness --path`와 `workflow:forbidden-paths`는 동일 context를 사용한다.

Visual backstop copies:

- effect ref + canonical Target display
- exact key/ref
- operation kind/scope
- key completeness
- baseline/resolution provenance
- graph leaf as report-only fact
- successor uncertainty
- deny claims

### 19.5 Operation-scope postcondition

Stage 06 output validation:

- active/retired visual owner artifact changes are subset of authorized operation keys
- retirement-only run cannot mutate unrelated active records
- mixed run may mutate only selected input's operations
- new unresolved unkeyed visual row is forbidden in capability execution path
- resulting ledger remains current

Code semantic removal is reviewed against operation keys and cited code anchors. First slice does not
claim perfect AST-to-design-key inference.

### 19.6 Packet/Report

Copy, never recompute:

- adoption trust/baseline digest
- input/reconciliation trust
- effect ref/Target fingerprint
- scope relation
- exact keys/refs
- keyed/unkeyed classification/resolution
- active/retired completeness
- key-local operation state
- graph/uncertainty/transition
- root bindings
- waived/active deny claims

### 19.7 Warning-first boundary

General source-map doctor and visual-consistency checks remain warning-first. Capability analyzers
only deny use as authorization evidence.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input result | analyzer, lineage/transition |
| reconciliation | 4-tuple effect ref, exact key/ref, graph semantics |
| visual-intent adoption | new optional artifact/template/reference/immutable diff guard |
| Figma mapping | active Mapping Provenance + retirements |
| visual consistency | family member keys, Evidence refs, member retirements |
| ScreenSpec | optional Visual Evidence + retirements |
| screen identity | source-map structure/relation state |
| project layout | shell root roles/lazy resolver |
| implementation policy | target-profile root slots |
| app-shell reference | typed paths, roots, no-API, recovery |
| Open Decisions | shell/adoption approval provenance |
| shared surfaces | shell reservation separation |
| Stage 04 | exact Target/effect identity and successor semantics |
| Stage 05/06/08 | author, implement operation scope, validate/report |
| implement-screen | key-local current active/retirement operations only |
| implement-app-shell | root-bound readiness only |
| COMMANDS | intent/input/adoption/shell examples |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| no adoption artifact | no-intent unchanged; visual intent permission 0 |
| initial confirmed adoption | exact legacy baseline allowed once |
| confirmed adoption mutation | hard error |
| register structured_since differs from snapshot | visual intent hard-invalid |
| v1/summary-only | visual intent permission 0 |
| input artifact hard-invalid | permission 0 |
| same input/item/effect + different targets | distinct effect refs |
| exact duplicate 4-tuple | existing hard error |
| exact current active input | may authorize active update |
| exact current retirement input | may authorize removal/replacement |
| last remaining key retirement | removal can authorize |
| historical retirement input | permission 0 |
| same input ID/different bullet | permission 0 |
| incomplete exact key | affected screen stale |
| unkeyed baseline row | advisory non-authorizing history |
| new unkeyed row | blocker until explicit resolution |
| unrelated newer exact event | does not clear unkeyed blocker |
| component-gap-only visual row | not screen blocker |
| family [A,B]→[A] | A active, B explicit member retirement |
| family member removed without tombstone | removed screen stale only |
| disjoint successor + supersedes predecessor | both disjoint key operations may execute |
| same-key successor | predecessor operation denied |
| unreconciled successor | overlapping predecessor screen temporarily blocked |
| legacy lineage/source move | append-only transition |
| split alias + unrelated confirmed alias | confirmed remains authorizing |
| no shell | no new root lookup |
| no-API host shell without api_client | host readiness works |
| used API kind without API root | target-local deny-only |
| ordinary undefined role | existing LayoutConfigError |
| old state reader | ignores additive keys |
| warning-first surfaces | no promotion |

No new required CI check for non-adopters, dependency, release/version/tag.

---

## 22. Migration

### 22.1 #222 adoption

1. Ensure Reconciliation Register is valid Contract v2.
2. Audit all existing trusted unkeyed screen-visual effects.
3. Create `visual-intent-adoption.md` once.
4. Snapshot current `structured_since`.
5. List only adoption-time legacy unkeyed `(Effect Ref, Screen ID)` rows.
6. Compute canonical baseline digest.
7. Human confirms adoption artifact and approval provenance.
8. After confirmation, never edit baseline or snapshot.
9. New inputs use exact mapping/family-member/ScreenSpec targets.
10. New unkeyed rows require explicit resolution, not baseline addition.
11. Update active provenance or retirement tombstone in same reconciliation change.
12. Resolve screen scope through canonical ID or authorizing source-map relation.
13. Reconcile newer successors before using predecessor operations on overlapping screens.
14. Run readiness with intent/input/concrete path.
15. Implement only authorized exact operations.
16. Run validate/backstop and report effect refs/operations.

Existing mutable `visual_intent_structured_since` drafts are removed during implementation migration;
they are not converted into authority. The one-time adoption preview command derives baseline rows
from current trusted data and requires human review before confirmation.

### 22.2 Input supersession migration

Producer/reference clarifies:

- `supersedes` records source-capture lineage
- it does not globally revoke all predecessor exact-key operations
- delta successor may use disjoint keys
- same-key update/retirement owns operation replacement
- whole-screen replacement must explicitly update/retire every affected key
- incomplete successor blocks fallback until reconciliation establishes scope

### 22.3 #223 adoption

1. Preserve decision rows.
2. Add app-shell-spec draft.
3. Bind only used shell roots.
4. Declare typed paths inside roots.
5. No-API host-only shell need not define api_client.
6. Link decision refs/regenerate state.
7. Check shell/screen/shared paths.
8. Validate/backstop.

Malformed recoverable paths remain deny-only until fixed.

---

## 23. Implementation Slices

### 23.1 Slice A — Issue #222

Scope:

- Input Result/Reconciliation trust analyzers
- canonical Target tuple/fingerprint/effect ref
- visual-intent adoption artifact/template/schema/manifest
- adoption baseline digest and diff-aware immutability guard
- Evidence normalization
- mapping/family-member/ScreenSpec key resolvers
- keyed effect ledger
- unkeyed screen-visual index/resolution
- active provenance adapters
- target/member retirement tombstones
- deterministic tombstone timestamp
- key-local active/retirement operations
- graph trust/key-aware supersession/successor uncertainty
- projection completeness/report aggregates
- source-map relation analyzer
- lineage transition
- deny claims/visual-refresh
- CLI/backstop/operation-scope Packet/Report

Excludes app-shell artifacts, shared-surface semantic change, implementation completion ledger and #224.

Acceptance:

- no-intent compatibility
- current active or retirement operation only
- actual 4-tuple-aligned unique effect refs
- immutable adoption baseline
- new unkeyed effect requires explicit resolution
- disjoint superseded predecessor operation remains executable after successor scope is known
- same-key predecessor denied
- incomplete successor blocks stale fallback
- pure last-key retirement executable
- member-level family removal deterministic
- screen/domain-component physical envelope only
- operation scope prevents unrelated visual contract mutation
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
| reconciliation | `scripts/lib/reconciliation-items.mjs`, target/evidence/effect-ref helpers/tests |
| adoption | new artifact template/schema/manifest/reference/diff guard/tests |
| mapping | mapping-provenance parser/template/reference/tests |
| family | visual-consistency parser/template/member-key/retirement tests |
| ScreenSpec | Visual Evidence/retirement parser/template/tests |
| identity | screen-source-map capability analyzer/tests |
| core | readiness/path authorization/key-local operation/graph uncertainty |
| backstop | forbidden-paths + adoption immutability + operation-scope adapter |
| execution | packet/report operation manifest |
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
| 3 | valid current pure retirement opens removal path |
| 4 | mixed active update + retirement accepted |
| 5 | historical retirement denied |
| 6 | retirement scope cannot mutate unrelated active key |
| 7 | invalid CLI combinations exit 2 |
| 8 | no adoption artifact → visual intent inapplicable |
| 9 | valid initial confirmed adoption accepted |
| 10 | future adopted_at/approved_at rejected |
| 11 | structured_since snapshot mismatch rejected |
| 12 | confirmed adoption frontmatter edit rejected by diff guard |
| 13 | confirmed baseline row add/remove/edit rejected |
| 14 | confirmed adoption deletion/rename rejected |
| 15 | baseline digest mismatch rejected |
| 16 | adoption baseline effect ref must resolve |
| 17 | post-adoption unkeyed cannot be added to baseline |
| 18 | v1/summary-only denied |
| 19 | malformed Summary/Items denied |
| 20 | RR/RP-invalid group denied |
| 21 | Effect outside update/create denied |
| 22 | summary projection mismatch denied |
| 23 | invalid input type/source/required field/timestamp denied |
| 24 | duplicate input ID denied |
| 25 | same input/item/effect + different targets produce distinct refs |
| 26 | exact same input/item/effect/target remains duplicate hard error |
| 27 | target fingerprint uses parsed tuple, not raw target text |
| 28 | malformed Target produces no trusted effect ref |
| 29 | target fingerprint collision fails closed |
| 30 | two same-screen unkeyed effects resolve independently |
| 31 | direct canonical scope accepted |
| 32 | confirmed/merged alias accepted |
| 33 | candidate/split/ambiguous alias non-authorizing |
| 34 | split does not poison unrelated confirmed alias |
| 35 | conflicting alias token denied locally |
| 36 | malformed map structure denies alias use |
| 37 | exact mapping target key required for authority |
| 38 | exact ScreenSpec section key required |
| 39 | family target expands to member-level keys |
| 40 | family member fan-out ambiguous → unkeyed blocker |
| 41 | exact mapping current ref accepted |
| 42 | same input ID, different bullet denied |
| 43 | exact family member current ref accepted |
| 44 | every selected screen-resolving effect must bind |
| 45 | ledger survives active-row deletion |
| 46 | older latest-per-key item masked by newer other key → stale |
| 47 | equal-time unprojected exact item → stale |
| 48 | all latest-per-key refs reflected → current |
| 49 | key removed without tombstone → stale |
| 50 | malformed/duplicate retirement table rejected |
| 51 | single Evidence + inherit deterministic |
| 52 | multiple Evidence + inherit hard-invalid |
| 53 | multi-Evidence explicit timestamp earlier than ref rejected |
| 54 | multi-Evidence valid explicit timestamp deterministic |
| 55 | active record and tombstone same key invalid |
| 56 | later effect after retirement makes key stale |
| 57 | family [A,B]→[A]: A active, B retirement required |
| 58 | B removal without member tombstone makes B stale only |
| 59 | B removal does not poison A |
| 60 | family rename retires old member keys and activates new keys |
| 61 | adoption-baseline unkeyed row is advisory/non-authorizing |
| 62 | new unkeyed row blocks regardless of unrelated newer event |
| 63 | refined-to-key resolution clears exact blocker |
| 64 | superseded-by-keyed resolution requires explicit effect ref provenance |
| 65 | no-screen-impact requires human-resolved decision |
| 66 | partial multi-screen resolution clears only one screen |
| 67 | component-gap-only follow-up not screen blocker |
| 68 | disjoint IN-B without supersedes leaves A/B executable |
| 69 | disjoint IN-B supersedes IN-A leaves A/B key operations executable |
| 70 | same-key successor denies old operation |
| 71 | graph_leaf=false alone does not deny key-current predecessor |
| 72 | unreconciled newer successor blocks overlapping predecessor screen |
| 73 | failed/in-progress successor blocks fallback |
| 74 | reconciled disjoint successor releases predecessor disjoint key |
| 75 | reconciled unkeyed successor remains blocker |
| 76 | whole-input replacement without keyed carry-forward does not silently retire omitted keys |
| 77 | source move/new lineage denies old same-key through current keyed operation |
| 78 | transition without current operation denied |
| 79 | reversed/equal timestamp edge denied |
| 80 | cross-source/different-lineage/missing-lineage edge denied |
| 81 | cycle/branch/parity mismatch denied |
| 82 | final-level decision blocks intent |
| 83 | API-only higher blocker does not block final visual work |
| 84 | absorbed/malformed lifecycle denied |
| 85 | shared/shell/candidate/generated reservations denied |
| 86 | exact deny claim waiver succeeds |
| 87 | same-path Tier3 deny remains active |
| 88 | forward/backstop same effect ref/key/graph/adoption state |
| 89 | Packet/Report copies effect ref and operation scope |
| 90 | postcondition rejects contract delta outside operation scope |
| 91 | no-intent legacy fixtures compatible |

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

1. Confirmed adoption immutability needs a diff-aware CI/backstop in addition to current-tree analyzer.
2. Initial adoption requires explicit human review of legacy unkeyed baseline rows.
3. Full SHA-256 effect refs are verbose; output must also show human-readable Target.
4. Key-aware supersession means input-level `supersedes` alone does not imply whole-screen operation replacement.
5. Unreconciled successor uncertainty may temporarily overblock an overlapping screen.
6. Retirement operation opens physical screen/domain paths while semantic narrowing relies on exact
   operation manifest, contract-delta validation and review; first slice does not claim perfect AST mapping.
7. Current target provenance requires template/parser additions before capability use.
8. General mapping/family doctors remain warning-first; capability use is stricter.
9. A stale/unkeyed screen blocks all inputs until reconciliation/provenance is corrected.
10. `lineage_transition` is audit provenance, not authority by itself.
11. Required-on-use API root missing is target-local fail closed; ordinary role errors stay global.
12. Deny-only recovery may temporarily lock malformed paths.
13. Contextless diff remains conservative.
14. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result Contract + Reconciliation v2 trust required |
| D4 | effect ref includes full canonical Target fingerprint |
| D5 | existing duplicate 4-tuple preserved; no breaking triple uniqueness |
| D6 | canonical Evidence section/bullet ref required |
| D7 | mapping/ScreenSpec exact key and family member key required |
| D8 | trusted exact key ledger persists independently of current rows |
| D9 | every relevant exact key active-complete or retired-complete |
| D10 | current retirement operation can authorize exact removal/replacement |
| D11 | operation scope exact-key constrained |
| D12 | screen aggregate timestamp is report-only |
| D13 | visual-intent legacy baseline is immutable adoption artifact |
| D14 | mutable visual-intent timestamp cutover rejected |
| D15 | unkeyed effects require baseline membership or explicit resolution |
| D16 | component-gap-only visual item not screen blocker |
| D17 | visual family identity is family × canonical member screen |
| D18 | member removal/rename requires explicit member-key retirement |
| D19 | input graph owns lineage/uncertainty, not global operation revocation |
| D20 | same-key ledger owns capability supersession |
| D21 | disjoint successor keys preserve predecessor disjoint operations |
| D22 | unreconciled successor blocks uncertain fallback |
| D23 | source lineage is logical replacement stream |
| D24 | source move uses append-only transition + current operation |
| D25 | source-map structure and alias-local authorization separated |
| D26 | deny claim top-level authored_path and exact waiver |
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
- exact operation-manifest field names

다음은 별도 설계 변경 없이는 허용되지 않는다.

- Contract v2 duplicate contract를 triple로 조용히 변경
- Target 없는 effect identity
- truncated target fingerprint
- mutable timestamp cutover로 legacy 분류
- confirmed adoption baseline mutation
- future adoption timestamp
- input graph leaf를 unconditional operation selector로 복원
- input-level supersedes로 disjoint operations를 자동 폐기
- incomplete successor가 있는데 old input fallback
- historical active/retirement input bearer capability
- input ID equality로 Evidence ref 대체
- screen max timestamp로 per-key completeness 대체
- tombstone currentness는 인정하면서 removal authority 0으로 두는 deadlock
- retirement input으로 unrelated active target 변경
- exact key 없는 visual row 조용히 제외
- family row-level capability identity로 member removal 묵살
- member removal without explicit tombstone
- cross-lineage supersession edge inference
- split relation 때문에 unrelated alias 전체 차단
- shell declaration-only physical authority
- broad route_entry reuse
- eager unused api_client resolution
- ordinary undefined-role fail-closed 완화
- no-API hook/API authority
- malformed reservation 제거
- Open Decision schema 변경

Baseline에서 재검증한 계약:

- actual RR-ITEM duplicate key includes Target
- readiness/policy/layout and undefined-role behavior
- Input Result Contract and immutable input flow
- Reconciliation Contract v2 routing/provenance
- Mapping Provenance exact Evidence
- Visual Consistency member/evidence contract
- Screen Source Map split semantics
- shared surface/Open Decisions/API candidate/path backstop
- #124/#210/#211 boundaries

정적 검증:

- 28 numbered H2 sections
- balanced Markdown fences
- unique H2 headings
- JSON/YAML examples parseable
- independent #222/#223 acceptance matrices
- #221/#224 non-interference
- existing Open Decision schema/human transition preserved
- no-intent/no-shell compatibility
- 4-tuple-aligned effect identity
- immutable adoption baseline
- key-aware supersession and successor uncertainty
- current active and retirement operations
- explicit unkeyed resolution
- member-level family identity/retirement
- exact ref binding
- per-key completeness
- deterministic tombstone timestamp
- append-only lineage transition
- relation-local alias state
- lazy required-on-use API root
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
