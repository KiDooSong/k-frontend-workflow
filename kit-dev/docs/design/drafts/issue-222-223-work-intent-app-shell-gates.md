# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; seventh review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-18  
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)  
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.
>
> 이전 amendment들은 deny claim provenance, hard-trusted input/reconciliation evidence,
> exact visual target/current provenance, target-key별 projection completeness,
> source lineage/transition, relation-local Screen Source Map authorization,
> typed app-shell roots, no-API envelope, target-aware API Candidate와
> malformed ownership recovery를 확정했다.
>
> 이번 amendment는 다음 마지막 seam을 닫는다.
>
> - current retirement operation이 실제 제거 작업을 authorize할 수 있는 좁은 계약
> - exact key를 만들지 못한 trusted visual row의 unkeyed/stale blocker
> - visual-family capability identity의 screen-member 단위 분해와 member retirement

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
아니다. 결과적으로 shell Open Decision은 실제 shell 경로를 막지 못하고 ordinary
screen의 broad allowance가 shell 코드를 우회할 수 있다.

최종 설계는 다음을 확정한다.

1. `readiness_mode = min(fact_mode, decision_cap)`과 기존 mode order를 유지한다.
2. 진행 maturity와 별도로 explicit work intent를 둔다.
3. 첫 public intent는 screen-only `visual-refresh`다.
4. `visual-refresh`는 `--input <INPUT_ID>`와 hard-trusted current evidence가 필수다.
5. Input Result Contract와 Reconciliation Contract v2를 동일 analyzer 결과로 검증한다.
6. raw/source alias는 capability 전용 Screen Source Map relation을 거친다.
7. 모든 selected visual effect는 canonical Evidence ref와 exact capability target identity를 가진다.
8. mapping과 ScreenSpec identity는 exact row/section key다.
9. visual-family identity는 family row가 아니라 **family × canonical screen member relation**이다.
10. 모든 exact key는 trusted effect ledger와 current active provenance 또는 explicit
    retirement tombstone 사이의 projection completeness를 통과해야 한다.
11. exact key를 만들 수 없는 trusted screen-visual effect는 조용히 버리지 않고
    `unkeyed` blocker로 보존한다.
12. current active update와 current retirement는 모두 `visual-refresh` operation이 될 수 있다.
13. retirement operation은 exact tombstone evidence와 retired-complete key에만 바인딩된다.
14. retirement-only input도 마지막 visual key를 실제 화면 코드에서 제거할 수 있다.
15. retirement evidence는 exact retired keys의 remove/replace operation만 정당화하며
    unrelated active-target 변경의 근거로 재사용하지 않는다.
16. selected input은 trusted supersession graph의 current leaf 또는 isolated node여야 한다.
17. graph leaf만으로 충분하지 않다. Selected operation은 screen의 current visual event여야 한다.
18. source lineage는 logical replacement stream이며 source move는 append-only transition으로 처리한다.
19. Screen Source Map은 global structure trust와 alias-local authorization state를 분리한다.
20. 모든 deny는 provenance-bearing claim이며 non-waivable deny가 우선한다.
21. `visual-refresh` physical envelope는 screen/domain-component만 연다.
22. `app-shell-spec`을 optional first-class implementation target으로 도입한다.
23. typed shell declaration은 semantic ownership일 뿐 physical authority를 스스로 만들지 않는다.
24. shell authority는 policy target root, layout binding, maturity profile의 교집합이다.
25. `route-host`는 exact-file `app_shell_route_host`만 사용한다.
26. optional shell roots와 required-on-use `api_client`는 실제 kind 사용 시에만 lazy resolve한다.
27. no-API shell은 API maturity에서도 root-bound host authority를 유지한다.
28. malformed이지만 recoverable한 shell path는 project-wide deny-only reservation으로 남는다.
29. 기존 6-column Open Decision register와 `decision_refs`를 재사용한다.
30. #222와 #223은 별도 구현 PR로 나누고 #223은 #222 substrate를 소비한다.

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

### 2.6 Historical effect versus current target

Reconciliation `Effect`는 역사적 행위다. 과거 row가 hard-valid하다는 사실만으로
현재 target artifact가 그 input을 current visual source로 사용한다는 결론은 나오지 않는다.

Current authored provenance owners:

- Figma mapping: `## Mapping Provenance`
- Visual Consistency: `Screen Families` row `Evidence`
- ScreenSpec: optional exact `## Visual Evidence`
- retired target/member relation: optional exact `## Visual Target Retirements`

### 2.7 Exact key and unkeyed boundary

General Contract v2는 visual artifact 전체/section target을 허용할 수 있다. 그러나
`visual-refresh` capability에는 exact implementation relation이 필요하다.

따라서 trusted visual effect는 다음 중 하나로 분류한다.

```text
keyed-screen-visual
unkeyed-screen-visual
non-screen-visual
```

`unkeyed-screen-visual`은 authority를 만들지 않으며 freshness ledger에서 사라지지도 않는다.

### 2.8 Family member boundary

Visual family row는 여러 screen을 참조한다. Family row 하나를 하나의 capability key로
쓰면 member 일부가 제거될 때 active family row와 member retirement를 동시에 표현할 수 없다.

따라서 capability identity는 family × screen relation으로 분해한다.

### 2.9 Retirement execution boundary

Tombstone은 구조적 currentness만이 아니라 실제 제거 작업의 근거가 되어야 한다.
Tombstone을 current로 인정하면서 authority는 0으로 두면 Stage 04에서 제거를 기록한 뒤
Stage 06에서 JSX를 제거할 수 없는 deadlock이 생긴다.

### 2.10 Screen Source Map boundary

General doctor는 warning-first다. Capability analyzer만 exact frontmatter/table/row와
relation state를 hard trust로 사용한다. `split|ambiguous`는 정상 구조일 수 있으므로
relation-local non-authorizing이다.

### 2.11 Supersession and lineage boundary

Supersession graph는 cycle/branch/parity와 strictly-later timestamp, same source lineage를
검사한다. Explicit edge 없는 newer same-screen item은 target ledger/current event가 잡는다.

### 2.12 Layout resolver boundary

Ordinary `{roles.X}` undefined는 계속 `LayoutConfigError`다. Optional app-shell target root만
별도 lazy resolver를 사용한다.

### 2.13 Shared surface and shell boundary

Shared surface는 domain, explicit members, member cap과 fan-out을 전제로 한다. Global
shell을 shared-surface 특례로 만들지 않는다.

### 2.14 Existing fixes and remaining problem

- #124: no-API screen path 잠금 해소
- #210: API Candidate v2 slice ownership/deferral
- #211: fixture hook authority와 API-mode screen freeze 양립
- #222: maturity와 work type의 authorization 축 부재
- #223: shell target/path/decision owner 부재

---

## 3. Reproduced Failure Modes

### 3.1 Mature screen visual work

- API-integrated screen은 intent 없이 screen forbidden이다.
- 과거 mode path union은 API wiring invariant를 깨뜨린다.
- evidence 없는 `--intent`는 bearer capability가 된다.
- RR/RP만 검사하면 hard-invalid input artifact가 authority가 될 수 있다.
- raw alias를 exact canonical ID만 요구하면 정상 identity reconciliation을 막는다.
- graph leaf만 보면 missing supersedes/new lineage input을 놓친다.
- screen scalar timestamp만 보면 다른 key의 projection 누락을 가린다.
- input ID만 비교하면 다른 evidence bullet을 current 근거로 오인한다.
- tombstone이 authority를 만들지 않으면 순수 제거 작업이 Stage 06에 진입하지 못한다.
- exact key 없는 newer coarse row를 버리면 old exact input이 계속 reusable하다.
- family row-level key는 member 일부 retirement를 표현하지 못한다.

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
- current, projection-complete visual event만 screen edit authority를 만든다.
- active update뿐 아니라 current retirement removal도 정상 실행 가능하게 한다.
- coarse/unkeyed visual row가 old capability를 조용히 유지하지 못하게 한다.
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
- implicit target retirement
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
| canonical Evidence ref | `input:<id>#<section>[/<1-based-bullet>]` tuple |
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
| active operation | selected effect가 active current record에 exact-bound된 작업 |
| retirement operation | selected effect가 latest valid tombstone에 exact-bound된 제거/대체 작업 |
| current visual event | complete active 또는 retirement operation 중 최신 screen event |
| current visual revision | complete active records만으로 표현한 current rendered state timestamp |
| operation scope | selected input이 실제로 authorize한 active/retired exact keys 집합 |
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
6. Capability effect는 canonical Evidence ref를 가져야 한다.
7. Keyed effect는 exact active record 또는 exact tombstone에 결합한다.
8. Input ID만 같고 section/bullet이 다르면 deny한다.
9. Relevant exact key 전체의 projection completeness를 screen scalar보다 먼저 검사한다.
10. Trusted historical key는 active record나 tombstone 없이는 ledger에서 사라지지 않는다.
11. Current active record 삭제는 retirement tombstone 없이는 stale다.
12. Current retirement operation은 실제 removal을 authorize할 수 있다.
13. Historical retirement는 authority가 아니다.
14. Retirement operation은 exact retired keys의 remove/replace scope만 정당화한다.
15. Unkeyed screen visual effect는 authority를 만들지 않는다.
16. Newer/equal-time unkeyed effect는 old exact capability를 차단한다.
17. Component-gap-only visual effect는 screen currentness blocker가 아니다.
18. Family capability identity는 member screen별이다.
19. Member 제거는 explicit member-key retirement가 필수다.
20. Graph leaf만으로 currentness를 판단하지 않는다.
21. Source move는 invalid cross-lineage edge를 만들지 않는다.
22. Deny는 claim 단위로 판정하고 non-waivable claim이 우선한다.
23. Forward/backstop은 동일 authorization context를 소비한다.
24. Packet/Report는 trust/currentness를 재계산하지 않는다.
25. Shell declaration은 physical authority를 스스로 만들지 않는다.
26. Route-host는 exact root 안에서만 가능하다.
27. Optional/required-on-use roots는 lazy resolve한다.
28. Ordinary undefined role은 계속 `LayoutConfigError`다.
29. No-API shell은 host만 유지하며 hook/API/candidate authority를 얻지 않는다.
30. Malformed owner declaration은 다른 target authority를 넓히지 않는다.
31. No-intent/no-shell behavior는 호환된다.

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
| screen max timestamp only | reject | 다른 key projection 누락 masking |
| exact key ledger | adopt | key별 latest projection 확인 |
| tombstone currentness only, authority 없음 | reject | 순수 제거 deadlock |
| separate visual-retirement public intent | defer | first slice public surface 불필요 확장 |
| visual-refresh 내부 retirement operation | adopt | 기존 CLI 유지 + exact operation scope |
| coarse row 조용히 제외 | reject | old capability 유지 |
| unkeyed blocker | adopt | non-authorizing freshness signal |
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
    visual_effect_rows
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

Component-gap-only item is `non-screen-visual`, not screen stale blocker.

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

`XOR` is exact-key state exclusivity, not boolean text matching:

- mapping/family-member/ScreenSpec active operation binds to the active record
- retirement operation binds to the retirement tombstone
- active record and tombstone for one exact key cannot coexist
- no record or both records → invalid

Mapping active binding is equality. Family-member/ScreenSpec active binding and retirement binding
are exact canonical set membership.

Selected group의 selected screen에 해소되는 모든 effect가 binding을 통과해야 한다.
한 row만 맞는다고 mismatched row를 숨기지 않는다.

This section defines authored-record binding only. Latest-event and authority semantics are applied
by §10.16; a historical tombstone ref is not automatically an operation.

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

### 10.14 Explicit target/member retirement

Each visual owner artifact may contain one optional exact table.

```markdown
## Visual Target Retirements

| Target Key | Evidence | Captured At | Replaced By | Status |
|---|---|---|---|---|
| mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-...#extracted-facts/07 | inherit | mapping:CREATE-ATTACH-figma-component-mapping/M-020 | retired |
| visual-family:visual-consistency-contract/F/SCREEN-B | input:IN-...#extracted-facts/08 | inherit | - | retired |
```

Contract:

- exact five-column header, one table per owner artifact
- Target Key belongs to owner artifact and resolves uniquely
- family retirement key includes canonical screen member
- Status exactly `retired`
- Evidence nonempty canonical ref set, no duplicates
- Captured At RFC3339 or `inherit`
- Replaced By `-` or valid exact key
- active record and tombstone for same exact key cannot coexist

```text
retired_complete(key) =
  unique valid tombstone
  AND latest_trusted_refs(key) ⊆ tombstone.evidence_refs
  AND tombstone.effective_captured_at >= latest_at(key)
```

No new Reconciliation Effect enum is added. Retirement is an existing `Effect=update` to owner/key
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

### 10.16 Current operation classification

A selected keyed effect can authorize one of two internal operation kinds.

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
  AND tombstone is the latest complete event for that key
```

Tombstone은 passive authority가 아니다. **Selected latest effect와 exact-bound될 때만**
retirement operation이 된다.

Historical retirement input은 `latest_trusted_refs` 또는 screen current event 조건을
통과하지 못해 authority가 없다.

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

이 check는 screen timestamp보다 먼저 수행한다.

### 10.18 Current visual event and rendered revision

두 timestamp를 분리한다.

```text
current_visual_revision_at(screen) =
  max(latest_at(key) for active_complete keys)
```

이는 current rendered state의 active visual source를 뜻한다. Active key가 없으면 null일 수 있다.

```text
current_visual_event_at(screen) =
  max(latest_at(key) for active_complete or retired_complete keys)
```

이는 현재 state를 만든 latest active update 또는 retirement event다.

Selected input must satisfy:

```text
selected input has at least one active_operation or retirement_operation
AND selected input captured_at == current_visual_event_at(screen)
AND every selected screen-resolving effect is a valid current operation
```

Consequences:

- 마지막 remaining key retirement도 current event가 되어 removal authority를 만든다.
- Mixed active update + retirement in one input works.
- Older retirement input cannot reopen screen after a newer event.
- Active key가 없어도 pure retirement input can authorize removal.

### 10.19 Retirement operation scope

Physical path envelope는 screen/domain-component다. 그러나 semantic authorization은
selected exact operation keys로 제한한다.

```yaml
operation_scope:
  kind: retirement-only | active-update | mixed
  authorized_operations:
    - target_key: mapping:.../M-002
      operation: retire
      evidence_ref: input:IN-REMOVE#extracted-facts/03
```

Rules:

- retirement-only context는 exact retired keys의 remove 또는 `Replaced By` target으로의
  replacement만 정당화한다.
- unrelated active key의 provenance, family membership, mapping row를 변경하면 operation
  scope violation이다.
- mixed context는 selected input의 exact active/retirement operations만 허용한다.
- Stage 06 Work Packet은 authorized operations를 복사한다.
- Run Report는 implemented operations와 changed files를 operation key별로 연결한다.
- Post-change validator는 visual owner artifact delta가 operation set 밖의 active/retired key를
  추가·변경하지 않았는지 검사한다.
- Path backstop은 physical boundary를 검사하고, operation-scope validator는 authored visual
  contract delta를 검사한다.

Code line-to-key semantic mapping은 첫 slice에서 완전 자동화하지 않는다. 따라서 reviewer와
implement-screen은 exact operation list를 근거로 code diff를 확인한다. 이는 arbitrary edit를
권한 의미로 인정하지 않으며, machine-enforced path gate와 deterministic contract-delta gate를
결합한 최소 첫 slice다.

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

### 10.21 Unkeyed blocker and legacy cutover

Unkeyed effect never authorizes.

```text
blocking_unkeyed(screen) =
  if current_visual_event_at(screen) is null:
    every trusted unkeyed effect
  else:
    unkeyed effects with captured_at >= current_visual_event_at(screen)
```

If blocking set is nonempty:

```text
target_provenance_state = unkeyed-or-stale
intent permission = 0 for every input
next action = refine reconciliation Target to exact target/member key and project evidence
```

This preserves legacy compatibility:

- coarse row older than a later complete exact current event is non-authorizing but not permanent blocker
- coarse row newer than or equal to current event fails closed
- no current exact event + coarse row fails closed

Examples:

```text
IN-A exact M-001 current @ 10:00
IN-B whole mapping trusted @ 11:00
→ IN-A denied; screen unkeyed-or-stale
```

```text
IN-A exact M-001 current @ 11:00
IN-B whole mapping trusted @ 11:00
→ fail closed
```

After IN-B Target is refined to exact key/member relation and active/tombstone provenance is updated,
normal completeness applies.

### 10.22 Supersession graph trust

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

### 10.23 Legacy lineage adoption and source move

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
- new input creates current active/retirement operations
- new input is current visual event
- transition alone is not authority

### 10.24 Final evidence formula

```text
intent_evidence_valid =
  selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND scope_allows(selected_screen)
  AND selected effects are keyed current operations
  AND every relevant exact key is projection-complete
  AND blocking_unkeyed(screen) is empty
  AND target_provenance_state == current
  AND selected_input.captured_at == current_visual_event_at(screen)
  AND supersession_component_trusted
  AND selected_input_is_graph_leaf_or_isolated
```

### 10.25 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260818-figma-003
    input_artifact_trusted: true
    reconciliation_trusted: true
    graph_leaf: true
    target_provenance_state: current
    current_visual_revision_at: null
    current_visual_event_at: "2026-08-18T10:00:00+09:00"
    blocking_unkeyed_effects: []
    operation_scope:
      kind: retirement-only
      authorized_operations:
        - target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-002
          operation: retire
          evidence_ref: input:IN-20260818-figma-003#extracted-facts/03
    key_states:
      mapping:CREATE-ATTACH-figma-component-mapping/M-002:
        state: retired-complete
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

Physical allowed does not erase operation scope. Retirement-only/mixed scope remains in output,
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

### 12.7 Fact profile

| Mode | Target-specific minimum |
|---|---|
| docs-only | artifact parse only |
| route-skeleton | valid identity/status/nav reference |
| screen-skeleton | core sections + trusted root-bound host paths |
| rough-fixture-ui | state/non-route interactions complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API special case or valid actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.8 Normal path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | route-host |
| screen-skeleton | route-host, shell-host |
| rough/final | host + valid owned hook candidate slices |
| api-integrated | valid owned hook/API slices; host frozen |
| production-ready | host + valid active slices; unowned API denied |

### 12.9 No-API profile

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

No separate public `visual-retirement` intent is added in first slice. Operation kind is derived
from exact current active/tombstone binding.

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
    current_visual_revision_at: null
    current_visual_event_at: "2026-08-18T10:00:00+09:00"
    blocking_unkeyed_effects: []
    keys:
      mapping:CREATE-ATTACH-figma-component-mapping/M-002:
        state: retired-complete
        latest_refs:
          - input:IN-20260818-figma-003#extracted-facts/03
```

If state serializes trust indexes, source hashes/version hashes are mandatory; stale generated trust
cannot be accepted.

### 17.3 Determinism

Sort target IDs, exact keys, member screen IDs, refs, input IDs, claims and diagnostics.
Existing screens/surfaces shape remains additive-compatible.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Pure retirement authorization

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-REMOVE",
      "applicable": true,
      "evidence": {
        "target_provenance_state": "current",
        "current_visual_revision_at": null,
        "current_visual_event_at": "2026-08-18T10:00:00+09:00",
        "operation_scope": {
          "kind": "retirement-only",
          "authorized_operations": [
            {
              "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-002",
              "operation": "retire",
              "evidence_ref": "input:IN-REMOVE#extracted-facts/03"
            }
          ]
        }
      },
      "allowed_paths": [
        "src/features/create/screens/**",
        "src/features/create/components/**"
      ]
    }
  }
}
```

### 18.2 Unkeyed blocker

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
            "input_id": "IN-B",
            "target": "artifact:CREATE-ATTACH-figma-component-mapping",
            "captured_at": "2026-08-18T11:00:00+09:00"
          }
        ]
      },
      "next_actions": [
        "refine IN-B reconciliation Target to an exact mapping/member/section key"
      ]
    }
  }
}
```

### 18.3 Family member retirement

```json
{
  "SCREEN-B": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-FAMILY-REMOVE",
      "applicable": true,
      "evidence": {
        "operation_scope": {
          "kind": "retirement-only",
          "authorized_operations": [
            {
              "target_key": "visual-family:visual-consistency-contract/F/SCREEN-B",
              "operation": "retire",
              "evidence_ref": "input:IN-FAMILY-REMOVE#extracted-facts/02"
            }
          ]
        }
      }
    }
  }
}
```

### 18.4 Exact evidence mismatch

```json
{
  "path_authorization": {
    "allowed": false,
    "reason": "exact-evidence-ref-mismatch",
    "selected_ref": "input:IN-X#extracted-facts/01",
    "current_refs": ["input:IN-X#extracted-facts/99"]
  }
}
```

### 18.5 No-API shell without API root

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
- canonical Evidence normalization
- exact mapping/family-member/ScreenSpec key resolution
- keyed effect ledger
- unkeyed screen-visual index
- active provenance adapters
- retirement tombstone/member relation parser
- per-key completeness/current event
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
5 screen scope relation
6 effect classification: keyed / unkeyed / non-screen
7 exact Evidence normalization
8 exact target/member key
9 active/tombstone record trust
10 every relevant key projection completeness
11 unkeyed blocker evaluation
12 screen provenance state
13 selected current active/retirement operation
14 current visual event
15 graph leaf/lineage transition trust
16 intent prerequisite/base readiness
17 target-root lazy resolution/no-API profile
18 positive physical profile
19 ownership/generated/candidate denies
20 claim waiver and remaining deny precedence
21 structured operation provenance
```

### 19.3 Forward/diff parity

`workflow:readiness --path`와 `workflow:forbidden-paths`는 동일 context를 사용한다.

Visual backstop requires `--input` and copies:

- exact key/ref
- operation kind
- operation scope
- key completeness
- blocking unkeyed effects
- current event
- deny claims

### 19.4 Operation-scope postcondition

Stage 06 output validation:

- active/retired visual owner artifact changes must be subset of authorized operation keys
- retirement-only run cannot mutate unrelated active mapping/family-member/ScreenSpec evidence
- mixed run may mutate only selected input's active/retirement keys
- new unkeyed visual row is forbidden in capability execution path
- resulting screen ledger must remain current

Code semantic removal is reviewed against operation keys and cited code anchors. First slice does not
claim perfect AST-to-design-key inference.

### 19.5 Packet/Report

Copy, never recompute:

- input/reconciliation trust
- scope relation
- exact keys/refs
- keyed/unkeyed classification
- active/retired completeness
- current revision/event
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
| reconciliation | exact key/ref, keyed/unkeyed classification |
| Figma mapping | active Mapping Provenance + retirements |
| visual consistency | family member keys, Evidence refs, member retirements |
| ScreenSpec | optional Visual Evidence + retirements |
| screen identity | source-map structure/relation state |
| project layout | shell root roles/lazy resolver |
| implementation policy | target-profile root slots |
| app-shell reference | typed paths, roots, no-API, recovery |
| Open Decisions | shell referrer scope |
| shared surfaces | shell reservation separation |
| Stage 04 | exact target/member key or explicit unkeyed blocker |
| Stage 05/06/08 | author, implement operation scope, validate/report |
| implement-screen | current active/retirement operations only |
| implement-app-shell | root-bound readiness only |
| COMMANDS | intent/input/shell examples |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| v1/summary-only | visual intent permission 0 |
| input artifact hard-invalid | permission 0 |
| exact current active input | may authorize active update |
| exact current retirement input | may authorize removal/replacement |
| last remaining key retirement | current event exists; removal can authorize |
| historical retirement input | permission 0 |
| same input ID/different bullet | permission 0 |
| incomplete exact key | whole screen stale |
| newer/equal-time unkeyed row | old exact input denied |
| older unkeyed row + later complete event | non-authorizing legacy, not permanent blocker |
| component-gap-only visual row | not screen stale blocker |
| family [A,B]→[A] | A active, B explicit member retirement |
| family member removed without tombstone | removed screen stale only |
| family rename | old member keys retired, new member keys active |
| legacy lineage-free current input | allowed only while current event |
| source move | append-only transition + current operation |
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

1. Create immutable canonical input.
2. Ensure Input Result Contract hard-valid.
3. Reconcile under Contract v2.
4. Use exact mapping key, family row + member scope, or ScreenSpec visual section.
5. Update active provenance or write exact retirement tombstone in same reconciliation change.
6. Do not leave new capability-relevant row unkeyed.
7. Resolve screen scope through canonical ID or authorizing source-map relation.
8. Ensure selected input is graph leaf/isolated and current visual event.
9. Run readiness with intent/input/concrete path.
10. Implement only authorized operation keys.
11. Run validate/backstop and report exact operations.

Legacy coarse rows:

- older than a later complete exact event: remain non-authorizing history
- newer/equal: refine Target to exact key/member relation before implementation

Legacy lineage/source move:

- do not edit old input
- create new lineage-bearing input
- set lineage transition
- update active/tombstone current provenance
- old input becomes non-current

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
- Evidence normalization
- mapping/family-member/ScreenSpec key resolvers
- keyed effect ledger
- unkeyed screen-visual index/blocker
- active provenance adapters
- target/member retirement tombstones
- active/retirement current operations
- projection completeness/current revision/current event
- source-map relation analyzer
- graph/lineage transition
- deny claims/visual-refresh
- CLI/backstop/operation-scope Packet/Report

Excludes app-shell artifacts, shared-surface semantic change and #224.

Acceptance:

- no-intent compatibility
- current active or retirement operation only
- pure last-key retirement executable
- newer/equal unkeyed row blocks old capability
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
| reconciliation | `scripts/lib/reconciliation-items.mjs`, target/evidence helpers/tests |
| mapping | mapping-provenance parser/template/reference/tests |
| family | visual-consistency parser/template/member-key/retirement tests |
| ScreenSpec | Visual Evidence/retirement parser/template/tests |
| identity | screen-source-map capability analyzer/tests |
| core | readiness/path authorization/current event |
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
| 4 | last remaining key retirement has non-null current visual event |
| 5 | mixed active update + retirement in one input accepted |
| 6 | tombstone selected ref mismatch denied |
| 7 | historical retirement input denied |
| 8 | retirement-only operation cannot mutate unrelated active visual key |
| 9 | invalid CLI intent/input combinations exit 2 |
| 10 | v1/summary-only denied |
| 11 | malformed Summary/Items denied |
| 12 | RR/RP-invalid group denied |
| 13 | Effect outside update/create denied |
| 14 | summary projection mismatch denied |
| 15 | unrelated input error isolated |
| 16 | invalid input type/source/required field/timestamp denied |
| 17 | duplicate input ID denied |
| 18 | direct canonical scope accepted |
| 19 | confirmed/merged alias accepted |
| 20 | candidate/split/ambiguous alias non-authorizing |
| 21 | split does not poison unrelated confirmed alias |
| 22 | conflicting alias token denied locally |
| 23 | malformed map structure denies alias use |
| 24 | exact mapping target key required for authority |
| 25 | exact ScreenSpec section key required for authority |
| 26 | family target expands to member-level keys |
| 27 | family member fan-out ambiguous → unkeyed blocker |
| 28 | exact mapping current ref accepted |
| 29 | same input ID, different bullet denied |
| 30 | exact family member current ref accepted |
| 31 | family row contains input but not selected ref denied |
| 32 | duplicate normalized current refs denied |
| 33 | every selected screen-resolving effect must bind |
| 34 | ledger survives active-row deletion |
| 35 | older latest-per-key item masked by newer other key → stale |
| 36 | equal-time unprojected exact item → stale |
| 37 | all latest-per-key refs reflected → current |
| 38 | key removed without tombstone → stale |
| 39 | malformed/duplicate retirement table → stale/hard-invalid |
| 40 | retirement Evidence not covering latest refs → stale |
| 41 | valid retirement covering latest refs → retired complete |
| 42 | active record and tombstone same exact key → invalid |
| 43 | later effect after retirement makes key stale |
| 44 | retired key excluded from rendered revision but included in event |
| 45 | family [A,B]→[A]: A active, B retirement required |
| 46 | B removal without member tombstone makes B stale only |
| 47 | B removal does not poison A |
| 48 | family rename retires old member keys and activates new keys |
| 49 | older exact current input + newer whole-artifact row → denied |
| 50 | equal-time exact current + unkeyed row → fail closed |
| 51 | no current event + unkeyed row → fail closed |
| 52 | older unkeyed row + later complete exact event → no permanent blocker |
| 53 | unkeyed row refined/projected → current |
| 54 | component-gap-only visual follow-up not screen blocker |
| 55 | selected input absent from current operations denied |
| 56 | selected input older than current visual event denied |
| 57 | later same-target input without supersedes denies old |
| 58 | source move/new lineage denies old |
| 59 | transition without current operation denied |
| 60 | superseded trusted input denied |
| 61 | latest same-lineage leaf accepted |
| 62 | incomplete newer input blocks old fallback |
| 63 | reversed/equal timestamp edge denied |
| 64 | cross-source/different-lineage/missing-lineage edge denied |
| 65 | cycle/branch/parity mismatch denied |
| 66 | final-level decision blocks intent |
| 67 | API-only higher blocker does not block final visual work |
| 68 | absorbed/malformed lifecycle denied |
| 69 | shared/shell/candidate/generated reservations denied |
| 70 | exact deny claim waiver succeeds |
| 71 | same-path Tier3 deny remains active |
| 72 | forward/backstop same key/ref/unkeyed/current operation state |
| 73 | packet/report copies operation scope and exact refs |
| 74 | postcondition rejects visual contract delta outside operation scope |
| 75 | no-intent legacy fixtures compatible |

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

1. Retirement operation opens physical screen/domain paths, while semantic narrowing relies on exact
   operation manifest plus visual-contract delta validation and review; first slice does not claim
   perfect AST-to-design-key mapping.
2. Unkeyed blocker cutover uses current visual event timestamp; older legacy coarse rows remain
   non-authorizing history rather than permanent blockers.
3. Family member fan-out depends on trusted canonical screen scope and historical/member/tombstone
   indexes; ambiguous fan-out fails closed as unkeyed.
4. Current target provenance requires template/parser additions and adoption before capability use.
5. General mapping/family doctors remain warning-first; capability use is stricter.
6. A stale/unkeyed screen blocks all inputs until reconciliation/provenance is corrected.
7. `lineage_transition` is audit provenance, not authority by itself.
8. Required-on-use API root missing is target-local fail closed; ordinary role errors stay global.
9. Deny-only recovery may temporarily lock malformed paths.
10. Contextless diff remains conservative.
11. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result Contract + Reconciliation v2 trust required |
| D4 | canonical Evidence section/bullet ref required |
| D5 | mapping/ScreenSpec exact key and family member key required |
| D6 | trusted exact key ledger persists independently of current rows |
| D7 | every relevant exact key must be active-complete or retired-complete |
| D8 | current retirement operation can authorize exact removal/replacement |
| D9 | retirement operation scope is exact-key constrained |
| D10 | current visual event includes complete active and retirement events |
| D11 | unkeyed screen visual effects are non-authorizing blockers |
| D12 | newer/equal unkeyed row blocks old capability; older legacy row may age out |
| D13 | component-gap-only visual item is not screen currentness blocker |
| D14 | visual family identity is family × canonical member screen |
| D15 | member removal/rename requires explicit member-key retirement |
| D16 | source lineage is logical replacement stream |
| D17 | source move uses append-only transition + current operation |
| D18 | source-map structure and alias-local authorization separated |
| D19 | deny claim top-level authored_path and exact waiver |
| D20 | visual physical envelope is screen/domain-component only |
| D21 | dedicated optional app-shell-spec |
| D22 | typed shell declaration does not self-grant authority |
| D23 | exact optional app_shell_route_host |
| D24 | optional and required-on-use roots resolve lazily |
| D25 | ordinary undefined role fail-closed preserved |
| D26 | generic API Candidate owner |
| D27 | no-API shell uses no-api-host |
| D28 | recoverable invalid shell path remains deny-only |
| D29 | six-column Open Decision schema reused |
| D30 | global physical ownership namespace |
| D31 | #222 before #223 |
| D32 | no-intent/no-shell compatibility preserved |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다.

Implementation naming만 남는다.

- helper/module names
- diagnostic metadata field names
- app-shell skill/reference slug
- exact operation-manifest field names

다음은 별도 설계 변경 없이는 허용되지 않는다.

- historical active/retirement input bearer capability
- input ID equality로 Evidence ref 대체
- screen max timestamp로 per-key completeness 대체
- tombstone currentness는 인정하면서 removal authority 0으로 두는 deadlock
- retirement input으로 unrelated active target 변경
- exact key 없는 newer/equal visual row 조용히 제외
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
- current active and retirement operations
- unkeyed blocker
- member-level family identity/retirement
- exact ref binding
- per-key completeness
- append-only lineage transition
- relation-local alias state
- lazy required-on-use API root
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
