# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; eighth review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-18  
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
> 이번 amendment는 operation lifecycle의 마지막 세 경계를 닫는다.
>
> 1. screen 전역 최신 timestamp가 아니라 **exact key-local currentness**로 operation을 실행한다.
> 2. unkeyed effect는 시간 경과로 소멸하지 않고 **명시적 resolution 또는 capability cutover**로만 해소한다.
> 3. retirement tombstone의 다중 Evidence와 `Captured At: inherit` 의미를 결정적으로 고정한다.

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
7. 모든 selected visual effect는 canonical Evidence ref를 가진다.
8. mapping과 ScreenSpec identity는 exact row/section key다.
9. visual-family identity는 family × canonical screen member relation이다.
10. 모든 exact key는 current active provenance 또는 explicit retirement tombstone과
    projection-complete해야 한다.
11. current active update와 current retirement는 모두 `visual-refresh` operation이 될 수 있다.
12. operation eligibility는 screen-global latest timestamp가 아니라 **각 exact key의 최신 trusted refs**로 결정한다.
13. 서로 다른 key의 pending operation은 나중에 다른 key 입력이 도착해도 각각 실행할 수 있다.
14. 같은 key에 더 최신 effect가 있으면 이전 operation은 실행할 수 없다.
15. `current_visual_event_at(screen)`은 report/ordering aggregate이며 exclusive selector가 아니다.
16. exact key를 만들 수 없는 post-cutover trusted screen-visual effect는 unresolved
    `unkeyed` blocker로 남는다.
17. 더 최신 unrelated exact event는 unkeyed blocker를 자동 해소하지 않는다.
18. unkeyed blocker는 exact-key refinement/supersession 또는 human-resolved no-screen-impact
    relation으로만 해소한다.
19. capability cutover 이전 coarse row는 non-authorizing legacy history다.
20. retirement tombstone에서 `inherit`은 Evidence가 정확히 1개일 때만 허용한다.
21. 다중 Evidence tombstone은 explicit RFC3339 timestamp가 필요하고 모든 referenced
    input timestamp보다 이르지 않아야 한다.
22. selected input은 trusted supersession graph의 leaf 또는 isolated node여야 한다.
23. source lineage는 logical replacement stream이며 source move는 append-only transition으로 처리한다.
24. Screen Source Map은 global structure trust와 alias-local authorization state를 분리한다.
25. 모든 deny는 provenance-bearing claim이며 non-waivable deny가 우선한다.
26. `visual-refresh` physical envelope는 screen/domain-component만 연다.
27. `app-shell-spec`을 optional first-class implementation target으로 도입한다.
28. typed shell declaration은 semantic ownership일 뿐 physical authority를 스스로 만들지 않는다.
29. shell authority는 policy target root, layout binding, maturity profile의 교집합이다.
30. `route-host`는 exact-file `app_shell_route_host`만 사용한다.
31. optional shell roots와 required-on-use `api_client`는 실제 kind 사용 시에만 lazy resolve한다.
32. no-API shell은 API maturity에서도 root-bound host authority를 유지한다.
33. malformed이지만 recoverable한 shell path는 project-wide deny-only reservation으로 남는다.
34. 기존 6-column Open Decision register와 `decision_refs`를 재사용한다.
35. #222와 #223은 별도 구현 PR로 나누고 #223은 #222 substrate를 소비한다.

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
수행될 수 있다. Screen-global latest timestamp를 exclusive selector로 사용하면 이전의
서로 다른 key operation이 실행 불가능해진다.

따라서 currentness는 다음 두 층으로 분리한다.

```text
key-local operation currentness  → authorization gate
screen aggregate timestamps      → reporting/ordering only
```

### 2.9 Family member boundary

Visual family row는 여러 screen을 참조한다. Family row 하나를 capability key로 쓰면
member 일부가 제거될 때 active family row와 member retirement를 동시에 표현할 수 없다.

Capability identity는 family × screen relation으로 분해한다.

### 2.10 Retirement execution boundary

Tombstone은 구조적 currentness뿐 아니라 실제 제거 작업의 근거가 될 수 있어야 한다.
다만 tombstone이 존재한다는 사실만으로 authority를 만들지 않고 selected latest effect와
exact하게 결합해야 한다.

### 2.11 Unkeyed resolution boundary

Unkeyed effect보다 나중인 unrelated exact event가 존재한다는 이유만으로 unkeyed 의미가
해소되지는 않는다. 시간 비교는 replacement provenance가 아니다.

Post-cutover unkeyed effect는 명시적 resolution relation이 생길 때까지 blocker다.

### 2.12 Tombstone timestamp boundary

기존 provenance의 `inherit`은 한 Evidence가 가리키는 canonical input timestamp를
상속한다. 다중 Evidence set에 first/last/max를 암묵적으로 적용하지 않는다.

### 2.13 Screen Source Map boundary

General doctor는 warning-first다. Capability analyzer만 exact frontmatter/table/row와
relation state를 hard trust로 사용한다. `split|ambiguous`는 정상 구조일 수 있으므로
relation-local non-authorizing이다.

### 2.14 Supersession and lineage boundary

Supersession graph는 cycle/branch/parity와 strictly-later timestamp, same source lineage를
검사한다. Explicit edge 없는 newer same-screen input은 exact-key ledger 또는 unkeyed
blocker가 잡는다.

### 2.15 Layout resolver boundary

Ordinary `{roles.X}` undefined는 계속 `LayoutConfigError`다. Optional app-shell target root만
별도 lazy resolver를 사용한다.

### 2.16 Shared surface and shell boundary

Shared surface는 domain, explicit members, member cap과 fan-out을 전제로 한다. Global
shell을 shared-surface 특례로 만들지 않는다.

### 2.17 Existing fixes and remaining problem

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
- screen scalar timestamp만 보면 다른 key projection 누락을 가린다.
- input ID만 비교하면 다른 evidence bullet을 current 근거로 오인한다.
- tombstone authority가 없으면 pure removal이 Stage 06에 진입하지 못한다.
- exact key 없는 coarse row를 버리면 old exact input이 재사용된다.
- family row-level key는 member 일부 retirement를 표현하지 못한다.
- screen-global current event를 gate로 쓰면 먼저 reconcile된 disjoint key operation이 실행 불가능해진다.
- unrelated newer exact event로 unkeyed row를 age-out하면 unresolved visual meaning을 누락한다.
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
- 서로 다른 key의 current operations를 도착 순서와 무관하게 각각 실행 가능하게 한다.
- 같은 key의 stale operation은 실행하지 못하게 한다.
- active update와 current retirement removal을 모두 지원한다.
- unkeyed visual row를 explicit resolution 전까지 fail closed한다.
- legacy coarse row의 migration cutover를 결정적으로 정의한다.
- family member 일부 제거/rename을 명시적으로 표현한다.
- tombstone timestamp를 deterministic하게 계산한다.
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
- code implementation completion ledger 도입
- historical input mutation/backfill
- implicit target retirement
- timestamp-only unkeyed resolution
- coarse visual target에서 exact key 추론
- family member removal의 silent inference
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
| visual capability cutover | post-cutover exact-key/unkeyed 규칙을 적용하는 RFC3339 기준점 |
| canonical Evidence ref | `input:<id>#<section>[/<1-based-bullet>]` tuple |
| effect ref | `visual-effect:<input-id>/<item>/<effect>` deterministic row identity |
| capability target key | exact current visual implementation relation identity |
| mapping key | `mapping:<artifact>/<M-key>` |
| family member key | `visual-family:<artifact>/<family>/<screen>` |
| screen visual key | `screen-visual:<screen-artifact>/<section>` |
| keyed visual effect | exact capability key로 해소된 screen visual effect |
| unkeyed visual effect | capability-capable visual surface에 닿지만 exact key가 없는 effect |
| non-screen visual effect | component-gap 등 screen code currentness를 직접 소유하지 않는 effect |
| active record | current mapping/family-member/ScreenSpec provenance record |
| retirement tombstone | exact key/member relation의 explicit retired provenance |
| trusted effect ledger | exact key별 trusted effects와 canonical refs index |
| projection completeness | latest refs가 active record 또는 tombstone에 모두 반영된 상태 |
| key-local current operation | selected effect가 해당 exact key의 latest trusted ref이자 complete authored state에 결합된 operation |
| active operation | key-local current effect가 active record에 결합된 update/create |
| retirement operation | key-local current effect가 retirement tombstone에 결합된 remove/replace |
| current visual event | complete key events의 screen-level max; report/ordering용, authorization selector 아님 |
| current visual revision | complete active records의 screen-level max; rendered-state report |
| operation scope | selected input이 authorize한 exact active/retired keys 집합 |
| unkeyed resolution | coarse effect를 exact keys, later keyed replacement 또는 no-screen-impact decision에 명시적으로 연결한 record |
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
6. Capability effect는 canonical Evidence ref와 deterministic effect ref를 가진다.
7. Keyed effect는 exact active record 또는 exact tombstone에 결합한다.
8. Input ID만 같고 section/bullet이 다르면 deny한다.
9. Relevant exact key 전체의 projection completeness를 screen scalar보다 먼저 검사한다.
10. Trusted historical key는 active record나 tombstone 없이는 ledger에서 사라지지 않는다.
11. Current active record 삭제는 retirement tombstone 없이는 stale다.
12. Current retirement operation은 실제 removal/replacement를 authorize할 수 있다.
13. Historical retirement는 authority가 아니다.
14. Operation eligibility는 exact key-local latest refs로 판정한다.
15. 더 최신 unrelated key는 이전 disjoint current operation을 무효화하지 않는다.
16. 같은 key의 newer effect는 이전 operation을 무효화한다.
17. `current_visual_event_at`은 report/ordering용이며 exclusive eligibility가 아니다.
18. Retirement operation은 exact retired keys의 remove/replace scope만 정당화한다.
19. Unkeyed screen visual effect는 authority를 만들지 않는다.
20. Post-cutover unresolved unkeyed effect는 unrelated event 시간과 무관하게 blocker다.
21. Unkeyed effect는 explicit resolution 없이 해소되지 않는다.
22. Pre-cutover legacy coarse effect는 non-authorizing advisory history다.
23. Component-gap-only visual effect는 screen currentness blocker가 아니다.
24. Family capability identity는 member screen별이다.
25. Member 제거는 explicit member-key retirement가 필수다.
26. Tombstone `inherit`은 single Evidence에만 허용한다.
27. Multi-Evidence tombstone은 explicit timestamp가 모든 referenced inputs보다 이르지 않아야 한다.
28. Graph leaf만으로 currentness를 판단하지 않는다.
29. Source move는 invalid cross-lineage edge를 만들지 않는다.
30. Deny는 claim 단위로 판정하고 non-waivable claim이 우선한다.
31. Forward/backstop은 동일 authorization context를 소비한다.
32. Packet/Report는 trust/currentness를 재계산하지 않는다.
33. Shell declaration은 physical authority를 스스로 만들지 않는다.
34. Route-host는 exact root 안에서만 가능하다.
35. Optional/required-on-use roots는 lazy resolve한다.
36. Ordinary undefined role은 계속 `LayoutConfigError`다.
37. No-API shell은 host만 유지하며 hook/API/candidate authority를 얻지 않는다.
38. Malformed owner declaration은 다른 target authority를 넓히지 않는다.
39. No-intent/no-shell behavior는 호환된다.

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
| screen max timestamp only | reject | cross-key projection/operation masking |
| exact key ledger | adopt | key별 latest projection/currentness 확인 |
| screen-global event as selector | reject | disjoint pending operation 소실 |
| key-local operation eligibility | adopt | same-key stale만 거부, disjoint key 실행 가능 |
| separate implementation ledger | defer | current #222 slice보다 범위 큼 |
| tombstone currentness only, authority 없음 | reject | pure removal deadlock |
| separate public visual-retirement intent | defer | first slice public surface 불필요 확장 |
| visual-refresh internal retirement operation | adopt | 기존 CLI + exact operation scope |
| unkeyed timestamp age-out | reject | unrelated event가 coarse meaning을 소멸 |
| explicit unkeyed resolution | adopt | provenance-bearing refinement/supersession |
| cutover 이전 legacy history | adopt | 기존 coarse rows의 호환성 보존 |
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
  --input IN-20260818-figma-003 \
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

### 10.3 Reconciliation Contract v2 analyzer와 cutover

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
    unkeyed_resolutions
  }
}
```

Visual intent adoption은 Reconciliation Register frontmatter의 additive field를 요구한다.

```yaml
reconciliation_contract: 2
visual_intent_structured_since: "2026-08-18T00:00:00+09:00"
```

Contract:

- valid RFC3339 with timezone
- absent/invalid field → no-intent behavior unchanged, `visual-refresh` permission 0
- input `captured_at < visual_intent_structured_since`인 unkeyed effect는 legacy advisory history
- input `captured_at >= visual_intent_structured_since`인 unkeyed effect는 resolution 전까지 blocker
- timestamp는 authority나 resolution 자체를 만들지 않음

Selected visual group:

```text
group_trusted == true
Basis == visual-evidence
Classification == simple-update
all Effect ∈ {update, create}
at least one effect row
```

Deterministic effect identity:

```text
visual-effect:<input-id>/<item>/<effect>
```

Contract v2의 duplicate `(Input ID, Item, Effect)` hard error 때문에 effect ref는 unique하다.

### 10.4 Strict Screen Source Map capability analyzer

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

### 10.5 Scope resolution

```text
scope_allows(screen) =
  active canonical screen exact relation
  OR authorizing source-map relation
```

Raw/source alias itself는 authority를 만들지 않는다. Malformed/empty scope는 input trust
false 또는 scope false다.

### 10.6 Canonical Evidence ref

Shared parser output:

```text
input:<input_id>#<section-slug>[/<1-based-bullet>]
```

Canonical comparison은 tuple 기준이다.

```text
same input ID + different section/bullet → not equal
```

Duplicate normalized refs는 invalid다.

### 10.7 Capability target identities

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

Family target effect row는 exact family row를 가리키고, trusted input scope가 member
screen set을 정한다. Effect는 다음 member keys로 deterministic fan-out된다.

```text
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

### 10.8 Visual effect classification

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

Component-gap-only item is `non-screen-visual`, not screen blocker.

### 10.9 Current active provenance adapters

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

### 10.10 Exact effect-to-authored-record binding

For every selected keyed effect, the canonical ref must bind to exactly one current authored
record of the same key.

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

Mapping active binding is equality. Family-member/ScreenSpec active binding and retirement binding
are exact canonical set membership.

Selected group의 selected screen에 해소되는 모든 effect가 binding을 통과해야 한다.
한 row만 맞는다고 mismatched row를 숨기지 않는다.

This section defines authored-record binding only. Key-local latest-event semantics are applied by
§10.16; historical tombstone ref는 자동으로 operation이 아니다.

### 10.11 Trusted keyed effect ledger

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

### 10.12 Relevant exact key set

```text
relevant_target_keys(screen) =
  keyed trusted effects resolving to screen
  ∪ current active keys resolving to screen
  ∪ retirement tombstone keys resolving to screen
```

Family keys는 member-level이므로 removed member만 해당 screen relevant set에 남는다.

### 10.13 Per-key active completeness

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

```text
M-001 current A @ 11:00
M-002 trusted B @ 11:00 but unprojected
→ M-002 incomplete → screen stale
```

### 10.14 Explicit target/member retirement and timestamp semantics

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
- multi-Evidence row는 explicit RFC3339가 필수
- first/last ref 선택이나 implicit max aggregation을 하지 않음
- referenced input이 unresolved/hard-untrusted이면 tombstone invalid

```text
retired_complete(key) =
  unique valid tombstone
  AND latest_trusted_refs(key) ⊆ tombstone.evidence_refs
  AND tombstone.effective_captured_at >= latest_at(key)
```

No new Reconciliation Effect enum is added. Retirement is existing `Effect=update` to owner/key
plus tombstone provenance.

A later trusted effect for a retired key makes it stale again until a new active record or later
tombstone accounts for it.

### 10.15 Family member removal and rename

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

- old member keys `F/<screen>` are explicitly retired
- new member keys `G/<screen>` are active
- `Replaced By` may link old member key to new member key

### 10.16 Key-local current operation classification

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

- selected input의 selected screen-resolving effects 모두 `selected_operation_current`여야 함
- same key에 newer trusted refs가 있으면 older effect는 거부
- different key의 newer event는 older disjoint current operation을 거부하지 않음
- selected input은 operation scope에 포함된 keys만 authorize
- tombstone은 selected latest effect와 exact-bound될 때만 retirement operation
- historical retirement ref는 latest refs를 통과하지 못해 authority 0

Normal sequential example:

```text
IN-A @ 10:00 → M-001 active_complete, not implemented yet
IN-B @ 11:00 → M-002 active_complete, not implemented yet
```

Result:

```text
--input IN-A → M-001 key-local current → allowed for M-001 scope
--input IN-B → M-002 key-local current → allowed for M-002 scope
```

Same-key replacement:

```text
IN-A @ 10:00 → M-001
IN-B @ 11:00 → M-001
```

Result:

```text
IN-A ref ∉ latest_trusted_refs(M-001) → denied
IN-B may authorize
```

No implementation completion ledger is introduced in this slice. A key-local current operation may
be re-evaluated idempotently until same-key evidence supersedes it or authored state changes.
Run Report records execution evidence but is not a gate-raising source.

### 10.17 Screen projection state

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

This check occurs before screen aggregate timestamps.

### 10.18 Screen aggregate timestamps are report-only

```text
current_visual_revision_at(screen) =
  max(latest_at(key) for active_complete keys)
```

Current rendered-state summary다. Active key가 없으면 null일 수 있다.

```text
current_visual_event_at(screen) =
  max(latest_at(key) for active_complete or retired_complete keys)
```

Current authored visual event의 report/ordering summary다.

Neither field is an exclusive authorization selector.

```text
selected_input.captured_at == current_visual_event_at(screen)
```

를 eligibility에 요구하지 않는다. Eligibility는 §10.16 key-local operation currentness로만
판정한다.

Consequences:

- 마지막 remaining key retirement는 key-local current retirement operation으로 removal 가능
- mixed active update + retirement input 가능
- later unrelated key가 earlier disjoint pending operation을 폐기하지 않음
- same-key later effect만 earlier operation을 폐기

### 10.19 Operation scope

Physical path envelope는 screen/domain-component다. Semantic authorization은 selected exact
operation keys로 제한한다.

```yaml
operation_scope:
  kind: retirement-only | active-update | mixed
  authorized_operations:
    - target_key: mapping:.../M-002
      operation: retire
      evidence_ref: input:IN-REMOVE#extracted-facts/03
      key_latest_at: "2026-08-18T10:00:00+09:00"
```

Rules:

- retirement-only context는 exact retired keys의 remove 또는 `Replaced By` replacement만 정당화
- unrelated active key provenance/family membership/mapping row 변경은 scope violation
- active-update context는 selected current active keys만 정당화
- mixed context는 selected input의 exact active/retirement operations만 허용
- Stage 06 Work Packet은 authorized operations를 복사
- Run Report는 implemented operations와 changed files를 operation key별로 연결
- post-change validator는 visual owner artifact delta가 operation set 밖의 key를 변경하지 않았는지 검사
- path backstop은 physical boundary, operation-scope validator는 authored visual-contract delta 검사

Code line-to-key semantic mapping은 first slice에서 완전 자동화하지 않는다. Machine-enforced
path gate, deterministic contract-delta gate, exact operation manifest, implement-screen/reviewer
verification을 결합한다.

### 10.20 Unkeyed visual effect index

```text
unkeyed_visual_effects(screen) =
  trusted visual-evidence update/create effects
  AND target reaches mapping / visual family / ScreenSpec visual surface
  AND canonical screen scope resolves
  AND exact capability key cannot be produced
```

Screen resolution:

- whole mapping/section → mapping frontmatter screen ID
- whole ScreenSpec → ScreenSpec screen ID
- visual contract whole/section → trusted input screen scope intersect active/historical family members
- ambiguous screen set → all resolved scoped screens receive unkeyed blocker

Non-screen targets such as component-gap-register are excluded.

### 10.21 Unkeyed capability cutover

```text
is_post_cutover(effect) =
  effect.input.captured_at >= register.visual_intent_structured_since
```

Rules:

- pre-cutover unkeyed effect → legacy advisory history; never authority, not blocker
- post-cutover unkeyed effect → unresolved blocker until exact resolution contract passes
- later unrelated exact event does not age it out
- timestamp comparison with screen current event does not resolve it
- cutover field absence/invalid → `visual-refresh` inapplicable; no-intent behavior unchanged

### 10.22 Explicit Unkeyed Visual Resolutions

Reconciliation Register v2 may contain one exact table.

```markdown
## Unkeyed Visual Resolutions

| Effect Ref | Screen ID | Resolution Kind | Target Keys | Resolving Evidence | Decision Ref |
|---|---|---|---|---|---|
| visual-effect:IN-U/01/update | CREATE-ATTACH | refined-to-key | mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-E2#extracted-facts/03 | - |
```

Canonical columns and enums:

```text
Resolution Kind:
  refined-to-key
  superseded-by-keyed
  no-screen-impact
```

Structural contract:

- exactly one table/header
- unique `(Effect Ref, Screen ID)` row
- Effect Ref resolves to one trusted post-cutover unkeyed effect
- Screen ID is in that effect's resolved canonical scope
- Target Keys is `;`-separated exact key set or `-` where permitted
- Resolving Evidence is `;`-separated canonical ref set or `-` where permitted
- Decision Ref is `-` or canonical Open Decision ID
- duplicate normalized keys/refs invalid

`refined-to-key`:

```text
Target Keys nonempty
Resolving Evidence nonempty
all refs belong to trusted keyed effects resolving to those keys/screen
all target keys projection-complete
resolving keyed inputs captured_at >= unkeyed input captured_at
Decision Ref == -
```

`superseded-by-keyed`:

```text
Target Keys nonempty
Resolving Evidence nonempty
all refs belong to later trusted keyed effects
later keyed effects explicitly name this Effect Ref as superseded/refined provenance
all target keys projection-complete
Decision Ref == -
```

`no-screen-impact`:

```text
Target Keys == -
Resolving Evidence == - or canonical supporting refs
Decision Ref resolves to a human-resolved canonical decision
resolved decision states why this coarse visual row has no screen-code impact
```

Resolution row is not positive authority. It only clears the referenced unkeyed blocker after all
kind-specific conditions pass. Exact keyed operations remain the only authority source.

One unkeyed effect scoped to multiple screens requires one valid resolution row per screen. Partial
resolution clears only resolved screens.

### 10.23 Blocking unkeyed formula

```text
blocking_unkeyed(screen) =
  post-cutover trusted unkeyed effects resolving to screen
  whose `(Effect Ref, Screen ID)` has no valid explicit resolution
```

If nonempty:

```text
target_provenance_state = unkeyed-or-stale
intent permission = 0 for every input on that screen
next action = refine or explicitly resolve each Effect Ref
```

Examples:

```text
IN-U @ 10:00 whole mapping, possible M-002
IN-E @ 11:00 exact unrelated M-001
→ IN-U remains blocker
```

```text
IN-U refined explicitly to exact M-002
M-002 active/tombstone projection complete
→ IN-U blocker cleared
```

```text
IN-LEGACY captured before visual_intent_structured_since
→ advisory non-authorizing history, not blocker
```

### 10.24 Supersession graph trust

Graph edge:

```text
successor -> predecessor
where successor.frontmatter.supersedes == predecessor.input_id
```

Every capability edge:

```text
successor.captured_at > predecessor.captured_at
successor.source_type == predecessor.source_type
successor.source_lineage == predecessor.source_lineage
```

Lineage is logical replacement stream, e.g.:

```text
figma-screen://file/<file-key>/<stable-source-screen-key>
```

Component trust also requires unique nodes, frontmatter/Summary parity, no self edge, acyclic graph,
and at most one direct successor per predecessor.

Selected input must be graph leaf or isolated. Same-key ledger currentness and unkeyed resolution are
additional independent conditions.

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
- new input is trusted
- old/new resolve to same canonical screen
- new input creates current key-local active/retirement operations
- transition alone is not authority

### 10.26 Final evidence formula

```text
intent_evidence_valid =
  selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND scope_allows(selected_screen)
  AND every selected screen-resolving effect is keyed
  AND every selected screen-resolving effect is key-locally current
  AND every relevant exact key is projection-complete
  AND blocking_unkeyed(screen) is empty
  AND target_provenance_state == current
  AND supersession_component_trusted
  AND selected_input_is_graph_leaf_or_isolated
```

Not required:

```text
selected_input.captured_at == current_visual_event_at(screen)
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
    graph_leaf: true
    eligibility_basis: key-local-current-operations
    current_visual_revision_at: "2026-08-18T11:00:00+09:00"
    current_visual_event_at: "2026-08-18T11:00:00+09:00"
    blocking_unkeyed_effects: []
    operation_scope:
      kind: active-update
      authorized_operations:
        - target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-001
          operation: update
          evidence_ref: input:IN-A#extracted-facts/01
          key_latest_at: "2026-08-18T10:00:00+09:00"
          key_local_current: true
```

The screen aggregate event may be newer because another disjoint key exists. It does not invalidate
this operation.

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

### 12.6 Root binding

```text
root_binding(entry) =
  exactly one resolved same-kind root fully covers path
  AND no different-kind root overlaps path
```

Zero/multiple/contradictory roots fail closed. Recoverable path remains deny-only.

### 12.7 Invalid declarations and recovery

Hard-invalid:

- string-only/missing path or kind
- unknown kind
- duplicate/overlap
- unsafe/noncanonical/broad path
- missing/ambiguous required-on-use root
- kind contradiction
- cross-owner conflict

Recoverable narrow path remains project-wide deny-only. Absolute/drive/UNC/root escape or
unrepresentable path produces no physical claim plus hard error.

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

No-API host-only shell with no API declaration/candidate does not resolve `api_client`.

---

## 13. Decision D5 — Target-aware API Candidate Ownership

### 13.1 Owner

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

Existing `screen_id` may remain compatibility alias.

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

Unkeyed `no-screen-impact` resolution may reference an existing canonical Open Decision. It does not
add columns or change the human-only transition contract.

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

Evidence/currentness/unkeyed/root failure is keyed `applicable:false` or path denial, readiness exit 0.
Ordinary undefined layout role remains configuration error/exit 2.

No separate public `visual-retirement` intent is added. Operation kind derives from exact active or
tombstone binding.

---

## 17. workflow-state Contract

### 17.1 App shells

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

### 17.2 Visual evidence summary

Recommended additive summary:

```yaml
visual_evidence:
  CREATE-ATTACH:
    target_provenance_state: current
    current_visual_revision_at: "2026-08-18T11:00:00+09:00"
    current_visual_event_at: "2026-08-18T11:00:00+09:00"
    aggregate_timestamps_are_authorization_selectors: false
    blocking_unkeyed_effects: []
    keys:
      mapping:CREATE-ATTACH-figma-component-mapping/M-001:
        state: active-complete
        latest_at: "2026-08-18T10:00:00+09:00"
      mapping:CREATE-ATTACH-figma-component-mapping/M-002:
        state: active-complete
        latest_at: "2026-08-18T11:00:00+09:00"
```

If state serializes trust indexes, source/version hashes are mandatory; stale generated trust
cannot be accepted.

### 17.3 Determinism

Sort target IDs, exact keys, member IDs, refs, effect refs, input IDs, claims and diagnostics.
Existing screens/surfaces shape remains additive-compatible.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Earlier disjoint key operation remains eligible

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-A",
      "applicable": true,
      "evidence": {
        "eligibility_basis": "key-local-current-operations",
        "current_visual_event_at": "2026-08-18T11:00:00+09:00",
        "selected_input_captured_at": "2026-08-18T10:00:00+09:00",
        "operation_scope": {
          "kind": "active-update",
          "authorized_operations": [
            {
              "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-001",
              "operation": "update",
              "key_latest_at": "2026-08-18T10:00:00+09:00",
              "key_local_current": true
            }
          ]
        }
      }
    }
  }
}
```

### 18.2 Same-key stale operation

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-OLD",
      "applicable": false,
      "evidence": {
        "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-001",
        "selected_ref_latest_for_key": false,
        "key_latest_at": "2026-08-18T11:00:00+09:00"
      },
      "next_actions": ["use the latest keyed evidence for M-001"]
    }
  }
}
```

### 18.3 Unresolved unkeyed blocker

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-E",
      "applicable": false,
      "evidence": {
        "target_provenance_state": "unkeyed-or-stale",
        "blocking_unkeyed_effects": [
          {
            "effect_ref": "visual-effect:IN-U/01/update",
            "input_id": "IN-U",
            "target": "artifact:CREATE-ATTACH-figma-component-mapping",
            "resolution_state": "missing"
          }
        ]
      },
      "next_actions": ["add an explicit Unkeyed Visual Resolution"]
    }
  }
}
```

### 18.4 Tombstone timestamp invalid

```json
{
  "path_authorization": {
    "allowed": false,
    "reason": "multi-evidence-inherit-invalid",
    "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-002"
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
              "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-002",
              "operation": "retire",
              "evidence_ref": "input:IN-REMOVE#extracted-facts/03",
              "key_local_current": true
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
- Reconciliation Contract v2 + visual capability cutover
- canonical Evidence/effect-ref normalization
- exact mapping/family-member/ScreenSpec key resolution
- keyed effect ledger
- unkeyed screen-visual index
- Unkeyed Visual Resolutions
- active provenance adapters
- retirement tombstone/member relation parser
- tombstone timestamp resolver
- per-key completeness/key-local current operation
- screen aggregate reports
- supersession/lineage transition
- Screen Source Map structure/relation state
- app-shell roots/ownership/deny claims

Validate adapters preserve public diagnostics and warning-first boundaries.

### 19.2 Authorization order

```text
1 concrete path canonicality
2 target/lifecycle/contract validity
3 input artifact trust
4 reconciliation/effect trust
5 capability cutover trust
6 screen scope relation
7 effect classification: keyed / unkeyed / non-screen
8 exact Evidence/effect-ref normalization
9 exact target/member key
10 active/tombstone record + timestamp trust
11 every relevant key projection completeness
12 explicit unkeyed resolution/blocker evaluation
13 screen provenance state
14 selected key-local active/retirement operations
15 graph leaf/lineage transition trust
16 intent prerequisite/base readiness
17 target-root lazy resolution/no-API profile
18 positive physical profile
19 ownership/generated/candidate denies
20 claim waiver and remaining deny precedence
21 structured operation provenance
```

Screen aggregate timestamps are computed after operation analysis for output only.

### 19.3 Forward/diff parity

`workflow:readiness --path`와 `workflow:forbidden-paths`는 동일 context를 사용한다.

Visual backstop requires `--input` and copies:

- exact key/ref/effect ref
- key-local currentness
- operation kind/scope
- key completeness
- unresolved unkeyed effects/resolutions
- aggregate report timestamps
- deny claims

### 19.4 Operation-scope postcondition

Stage 06 output validation:

- active/retired visual owner artifact changes must be subset of authorized operation keys
- retirement-only run cannot mutate unrelated active visual key
- active-update run cannot mutate other pending disjoint keys
- mixed run may mutate only selected input's operations
- new post-cutover unkeyed row is forbidden in capability execution path
- resulting exact-key ledger must remain projection-complete

Code semantic removal is reviewed against operation keys and cited code anchors. First slice does not
claim perfect AST-to-design-key inference.

### 19.5 Packet/Report

Copy, never recompute:

- input/reconciliation/cutover trust
- scope relation
- exact keys/refs/effect refs
- keyed/unkeyed classification
- unkeyed resolution state
- active/retired completeness and tombstone timestamp provenance
- key-local currentness
- aggregate revision/event reports
- operation scope
- graph/transition
- root bindings
- waived/active deny claims

### 19.6 Warning-first boundary

General source-map doctor and visual-consistency checks remain warning-first. Capability analyzers
only deny use as authorization evidence.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input result | analyzer, lineage/transition |
| reconciliation | cutover, exact key/ref/effect ref, keyed/unkeyed classification/resolution |
| Figma mapping | active Mapping Provenance + retirements |
| visual consistency | family member keys, Evidence refs, member retirements |
| ScreenSpec | optional Visual Evidence + retirements |
| screen identity | source-map structure/relation state |
| project layout | shell root roles/lazy resolver |
| implementation policy | target-profile root slots |
| app-shell reference | typed paths, roots, no-API, recovery |
| Open Decisions | shell scope + optional unkeyed no-screen-impact reference |
| shared surfaces | shell reservation separation |
| Stage 04 | exact target/member key or explicit post-cutover unkeyed blocker/resolution |
| Stage 05/06/08 | author, implement operation scope, validate/report |
| implement-screen | key-local current active/retirement operations only |
| implement-app-shell | root-bound readiness only |
| COMMANDS | intent/input/shell examples |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| missing visual capability cutover | no-intent unchanged, visual intent permission 0 |
| v1/summary-only | visual intent permission 0 |
| input artifact hard-invalid | permission 0 |
| exact current active input | may authorize its key-local active update |
| exact current retirement input | may authorize its key-local removal/replacement |
| IN-A key A, later IN-B key B | A와 B 각각 실행 가능 |
| older same-key input | denied |
| screen aggregate event newer than selected disjoint key | selected key may remain eligible |
| last remaining key retirement | removal can authorize |
| historical retirement input | permission 0 |
| same input ID/different bullet | permission 0 |
| incomplete exact key | affected screen stale |
| post-cutover unkeyed row + newer unrelated exact row | unkeyed remains blocker |
| unkeyed row explicitly refined/projected | blocker clears |
| pre-cutover legacy coarse row | advisory non-authorizing history |
| component-gap-only visual row | not screen blocker |
| single tombstone Evidence + inherit | referenced input timestamp |
| multi-Evidence tombstone + inherit | hard-invalid |
| multi-Evidence explicit timestamp too early | hard-invalid |
| valid multi-Evidence explicit timestamp | deterministic |
| family [A,B]→[A] | A active, B explicit member retirement |
| family member removed without tombstone | removed screen stale only |
| family rename | old member keys retired, new member keys active |
| legacy lineage-free current input | allowed only while key-local current |
| source move | append-only transition + current operations |
| split alias + unrelated confirmed alias | confirmed remains authorizing |
| no shell | no new key/root lookup |
| no-API host shell without api_client | host readiness works |
| used API kind without API root | target-local deny-only |
| ordinary undefined role | existing LayoutConfigError |
| old state reader | ignores additive keys |
| warning-first surfaces | no promotion |

No new required CI check, dependency, release/version/tag.

---

## 22. Migration

### 22.1 #222 adoption

1. Set `visual_intent_structured_since` when adopting visual intent capability.
2. Create immutable canonical input.
3. Ensure Input Result Contract hard-valid.
4. Reconcile under Contract v2.
5. Use exact mapping key, family row + member scope, or ScreenSpec visual section.
6. Update active provenance or write exact retirement tombstone in the same reconciliation change.
7. For multi-Evidence tombstone, use explicit RFC3339 not earlier than any referenced input.
8. Do not leave post-cutover capability-relevant row unkeyed.
9. If coarse target is unavoidable, add an explicit Unkeyed Visual Resolution before implementation.
10. Resolve screen scope through canonical ID or authorizing source-map relation.
11. Ensure selected input is graph leaf/isolated and every selected operation is key-locally current.
12. Run readiness with intent/input/concrete path.
13. Implement only authorized operation keys.
14. Run validate/backstop and report exact operations.

Legacy coarse rows:

- captured before cutover → advisory non-authorizing history
- captured at/after cutover → explicit resolution required; later unrelated event does not clear

Legacy lineage/source move:

- do not edit old input
- create new lineage-bearing input
- set lineage transition
- update active/tombstone current provenance
- old same-key input becomes non-current

### 22.2 #223 adoption

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
- visual capability cutover
- Evidence/effect-ref normalization
- mapping/family-member/ScreenSpec key resolvers
- keyed effect ledger
- post-cutover unkeyed screen-visual index/blocker
- Unkeyed Visual Resolutions parser/analyzer
- active provenance adapters
- target/member retirement tombstones
- tombstone timestamp resolver
- active/retirement key-local current operations
- projection completeness + report-only aggregate timestamps
- source-map relation analyzer
- graph/lineage transition
- deny claims/visual-refresh
- CLI/backstop/operation-scope Packet/Report

Excludes app-shell artifacts, implementation completion ledger, shared-surface semantic change and #224.

Acceptance:

- no-intent compatibility
- disjoint current operations remain independently executable
- same-key stale operation denied
- current active or retirement operation only
- pure last-key retirement executable
- post-cutover unkeyed row blocks until explicit resolution
- pre-cutover legacy coarse row does not permanently block
- multi-Evidence tombstone deterministic
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
| reconciliation | `scripts/lib/reconciliation-items.mjs`, cutover/resolution/target/evidence helpers/tests |
| mapping | mapping-provenance parser/template/reference/tests |
| family | visual-consistency parser/template/member-key/retirement tests |
| ScreenSpec | Visual Evidence/retirement parser/template/tests |
| identity | screen-source-map capability analyzer/tests |
| core | readiness/path authorization/key-local operation analysis |
| backstop | forbidden-paths + operation-scope adapter |
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
| 4 | last remaining key retirement executable |
| 5 | mixed active update + retirement accepted |
| 6 | tombstone selected ref mismatch denied |
| 7 | historical retirement input denied |
| 8 | retirement-only operation cannot mutate unrelated active key |
| 9 | invalid CLI combinations exit 2 |
| 10 | missing/invalid visual capability cutover → intent inapplicable |
| 11 | v1/summary-only denied |
| 12 | malformed Summary/Items denied |
| 13 | RR/RP-invalid group denied |
| 14 | Effect outside update/create denied |
| 15 | summary projection mismatch denied |
| 16 | unrelated input error isolated |
| 17 | invalid input type/source/required field/timestamp denied |
| 18 | duplicate input ID denied |
| 19 | direct canonical scope accepted |
| 20 | confirmed/merged alias accepted |
| 21 | candidate/split/ambiguous alias non-authorizing |
| 22 | split does not poison unrelated confirmed alias |
| 23 | conflicting alias token denied locally |
| 24 | malformed map structure denies alias use |
| 25 | exact mapping target required for authority |
| 26 | exact ScreenSpec section required for authority |
| 27 | family target expands to member-level keys |
| 28 | ambiguous family fan-out → unkeyed blocker |
| 29 | exact mapping current ref accepted |
| 30 | same input ID, different bullet denied |
| 31 | exact family member current ref accepted |
| 32 | family row contains input but not selected ref denied |
| 33 | duplicate normalized current refs denied |
| 34 | every selected screen-resolving effect must bind |
| 35 | ledger survives active-row deletion |
| 36 | older latest-per-key item masked by newer other key → stale |
| 37 | equal-time unprojected exact item → stale |
| 38 | all latest-per-key refs reflected → current |
| 39 | key removed without tombstone → stale |
| 40 | malformed/duplicate retirement table → stale/hard-invalid |
| 41 | retirement Evidence not covering latest refs → stale |
| 42 | valid retirement covering latest refs → retired complete |
| 43 | active record and tombstone same exact key → invalid |
| 44 | later same-key effect after retirement makes key stale |
| 45 | single Evidence + inherit resolves input timestamp |
| 46 | multiple Evidence + inherit hard-invalid |
| 47 | multiple Evidence + explicit timestamp earlier than any ref hard-invalid |
| 48 | multiple Evidence + valid explicit timestamp deterministic |
| 49 | family [A,B]→[A]: A active, B retirement required |
| 50 | B removal without member tombstone makes B stale only |
| 51 | B removal does not poison A |
| 52 | family rename retires old member keys/activates new keys |
| 53 | IN-A@10 key A and IN-B@11 key B both independently executable |
| 54 | same key IN-A@10/IN-B@11 → A denied, B current |
| 55 | later unrelated key does not invalidate earlier disjoint retirement operation |
| 56 | current_visual_event_at newer than selected key is report-only |
| 57 | post-cutover older unkeyed M-002 possibility + newer exact M-001 remains blocker |
| 58 | equal-time exact current + unresolved unkeyed row fail closed |
| 59 | no exact current event + post-cutover unkeyed row fail closed |
| 60 | explicit refined-to-key resolution + complete projection clears blocker |
| 61 | explicit superseded-by-keyed resolution + complete projection clears blocker |
| 62 | no-screen-impact resolution requires human-resolved decision |
| 63 | unrelated newer exact event alone does not clear unkeyed blocker |
| 64 | pre-cutover legacy coarse row advisory/non-authorizing, not blocker |
| 65 | partial multi-screen unkeyed resolution clears only resolved screen |
| 66 | malformed/duplicate Unkeyed Visual Resolutions row does not clear blocker |
| 67 | component-gap-only visual follow-up not screen blocker |
| 68 | selected input absent from current operations denied |
| 69 | later same-target input without supersedes denies old via key ledger |
| 70 | source move/new lineage denies old same-key operation |
| 71 | transition without current operation denied |
| 72 | superseded trusted input denied |
| 73 | latest same-lineage leaf accepted |
| 74 | incomplete newer same-lineage input blocks old fallback |
| 75 | reversed/equal timestamp edge denied |
| 76 | cross-source/different-lineage/missing-lineage edge denied |
| 77 | cycle/branch/parity mismatch denied |
| 78 | final-level decision blocks intent |
| 79 | API-only higher blocker does not block final visual work |
| 80 | absorbed/malformed lifecycle denied |
| 81 | shared/shell/candidate/generated reservations denied |
| 82 | exact deny claim waiver succeeds |
| 83 | same-path Tier3 deny remains active |
| 84 | forward/backstop same key-local/unkeyed/timestamp state |
| 85 | packet/report copies operation scope, exact refs, resolutions |
| 86 | postcondition rejects visual contract delta outside operation scope |
| 87 | no-intent legacy fixtures compatible |

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

1. Key-local current operation can remain re-runnable until same-key evidence supersedes it; first
   slice does not add an implementation completion ledger. Runs must be idempotent and reported.
2. Operation opens physical screen/domain paths while semantic narrowing relies on exact operation
   manifest, visual-contract delta validation and review; first slice does not claim perfect
   AST-to-design-key mapping.
3. Post-cutover unresolved unkeyed effect blocks the affected screen until explicit resolution.
4. Pre-cutover coarse rows are advisory history and cannot authorize.
5. `no-screen-impact` unkeyed resolution requires a human-resolved canonical decision.
6. Family member fan-out depends on trusted canonical scope and historical/member/tombstone indexes;
   ambiguous fan-out fails closed as unkeyed.
7. Current target provenance requires template/parser additions and adoption before capability use.
8. General mapping/family doctors remain warning-first; capability use is stricter.
9. `lineage_transition` is audit provenance, not authority by itself.
10. Required-on-use API root missing is target-local fail closed; ordinary role errors stay global.
11. Deny-only recovery may temporarily lock malformed paths.
12. Contextless diff remains conservative.
13. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result Contract + Reconciliation v2 trust required |
| D4 | visual capability cutover required for intent adoption |
| D5 | canonical Evidence section/bullet and effect ref required |
| D6 | mapping/ScreenSpec exact key and family-member key required |
| D7 | trusted exact key ledger persists independently of current rows |
| D8 | every relevant exact key must be active-complete or retired-complete |
| D9 | current retirement operation can authorize exact removal/replacement |
| D10 | operation eligibility is exact key-local, not screen-global latest event |
| D11 | disjoint current operations remain independently executable |
| D12 | current_visual_event_at is report/ordering only |
| D13 | retirement operation scope is exact-key constrained |
| D14 | unkeyed post-cutover effects remain blockers until explicit resolution |
| D15 | unrelated later exact event cannot age out unkeyed effect |
| D16 | pre-cutover coarse rows are advisory non-authorizing history |
| D17 | Unkeyed Visual Resolutions provide refinement/supersession/no-impact provenance |
| D18 | component-gap-only visual item is not screen blocker |
| D19 | visual family identity is family × canonical member screen |
| D20 | member removal/rename requires explicit member-key retirement |
| D21 | tombstone inherit allowed only for one Evidence ref |
| D22 | multi-Evidence tombstone requires non-early explicit timestamp |
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
- app-shell skill/reference slug
- exact operation-manifest field names

다음은 별도 설계 변경 없이는 허용되지 않는다.

- historical active/retirement bearer capability
- input ID equality로 Evidence ref 대체
- screen-global event로 disjoint key operation 폐기
- same-key newer effect가 있는데 old operation 허용
- implementation report를 gate-raising completion source로 사용
- unrelated timestamp로 post-cutover unkeyed blocker age-out
- unkeyed effect의 implicit exact-key 추론
- multi-Evidence tombstone의 implicit inherit aggregation
- tombstone currentness는 인정하면서 removal authority 0으로 두는 deadlock
- retirement input으로 unrelated active target 변경
- family row-level identity로 member removal 묵살
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
- key-local active/retirement operations
- report-only screen aggregate event
- explicit unkeyed resolution + cutover
- deterministic tombstone timestamp
- member-level family identity/retirement
- exact ref binding/per-key completeness
- append-only lineage transition
- relation-local alias state
- lazy required-on-use API root
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
