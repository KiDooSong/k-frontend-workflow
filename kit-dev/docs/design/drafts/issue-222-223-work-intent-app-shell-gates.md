# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; sixth review amendment applied; implementation not started  
Issues: #222, #223  
Date: 2026-08-14  
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)  
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.
>
> 첫 amendment는 deny claim provenance, typed shell path taxonomy,
> target-aware API Candidate ownership, reconciled visual input evidence를 도입했다.
> 두 번째 amendment는 no-API shell envelope, Contract v2 input-local trust,
> exact visual-family membership, malformed shell path deny-only recovery,
> `claim.authored_path` canonical shape를 확정했다.
> 세 번째 amendment는 app-shell physical authority root, Input Result Contract trust,
> source-alias scope resolution, current unsuperseded input leaf를 확정했다.
> 네 번째 amendment는 supersession timestamp/source-lineage trust, capability용
> Screen Source Map hard trust, exact app-shell route-host root, optional target-root
> resolver를 확정했다.
> 다섯 번째 amendment는 target-current authored provenance, lineage transition,
> relation-local Screen Source Map authorization, `api-client` required-on-use root를
> 확정했다.
> 여섯 번째 amendment는 exact target-key별 projection completeness, explicit target
> retirement tombstone, selected effect row와 current provenance의 exact canonical
> Evidence ref 결합을 확정한다.

---

## 1. Executive Summary

현재 `readiness_mode`는 사실 기반 성숙도와 Open Decision 상한을 하나의 mode
사다리로 표현하고, 선택된 mode 하나의 `allowed_paths`/`forbidden_paths`가 기본
구현 권한이 된다. 이 모델은 진행 상태에는 적합하지만 “지금 하는 작업의 종류”를
표현하지 못한다. 이미 `api-integrated-ui`에 도달한 화면에 새 시각 입력이 도착해도
screen 경로는 계속 금지되고, 반대로 그 금지를 단순 제거하면 API wiring 중 화면
불변 계약이 깨진다.

또한 global app shell은 현재 `ScreenSpec`도 `shared-surface-spec`도 아니다.
`navigation-map`과 `visual-consistency-contract`에는 shell 관련 사실이 있을 수 있지만,
그 문서들은 구현 경로 owner이자 target-scoped readiness gate가 아니다. 결과적으로
shell Open Decision은 구현 경로를 막지 못하고 ordinary screen의 broad allowance가
shell 코드를 우회할 수 있다.

최종 설계는 다음을 확정한다.

1. `readiness_mode = min(fact_mode, decision_cap)`과 기존 mode order를 유지한다.
2. 진행 상태와 별도로 explicit work intent를 도입한다.
3. 첫 public intent는 screen-only `visual-refresh`다.
4. `visual-refresh`는 `--input <INPUT_ID>`와 hard-trusted evidence가 필수다.
5. evidence는 Input Result Contract와 Reconciliation Contract v2를 모두 통과한다.
6. raw/source alias는 capability 전용 Screen Source Map analyzer를 거친다.
7. selected input은 trusted supersession component의 leaf 또는 isolated node여야 한다.
8. graph leaf만으로는 충분하지 않다. selected effect는 exact visual target key와
   exact canonical Evidence ref로 current authored provenance에 결합돼야 한다.
9. currentness는 screen-level timestamp 하나로 먼저 축약하지 않는다. 모든 relevant
   exact target key에서 latest trusted effect evidence가 current active provenance 또는
   explicit retirement tombstone에 완전히 투영됐는지 먼저 검사한다.
10. target key 하나라도 projection-incomplete이면 screen 전체
    `target_provenance_state=stale`이며 어떤 input도 code permission을 얻지 못한다.
11. 모든 key가 complete/retired인 뒤 active complete key만으로 screen visual revision을
    계산하고, selected input이 그 current revision인지 확인한다.
12. historical target key는 행 삭제만으로 검사 대상에서 사라지지 않는다. 의도적 폐기는
    exact `Visual Target Retirements` tombstone을 요구한다.
13. supersession edge는 strictly-later timestamp와 same logical source lineage가 필수다.
14. lineage-free legacy input이나 source 이동은 cross-lineage edge를 발명하지 않고
    append-only `lineage_transition`과 current target provenance 갱신으로 처리한다.
15. Screen Source Map은 global structure trust와 alias-local authorization state를 분리한다.
16. 모든 deny는 provenance-bearing claim으로 보존한다.
17. `visual-refresh`가 waive할 수 있는 것은 exact canonical work-step deny뿐이다.
18. `visual-refresh`는 screen/domain-component만 여는 독립 최소 권한 envelope다.
19. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
20. shell typed declaration은 semantic ownership일 뿐 physical authority를 스스로
    만들지 않는다.
21. shell positive authority는 policy-owned kind root, layout binding, maturity profile의
    교집합에서만 나온다.
22. `route-host`는 broad `route_entry`를 재사용하지 않고 exact-file
    `app_shell_route_host`를 사용한다.
23. optional roots와 required-on-use `api_client` root는 실제 kind 사용 시에만 lazy
    resolve한다. 일반 undefined-role fail-closed 의미는 유지한다.
24. API Candidate owner를 `{target_type, target_id}`로 일반화한다.
25. `api_required:false` shell은 API maturity에서도 root-bound host 권한을 유지하는
    `no-api-host` profile을 사용한다.
26. malformed이지만 안전하게 canonicalize 가능한 shell path는 positive authority를
    만들지 않고 project-wide deny-only reservation으로 남긴다.
27. 기존 six-column Open Decision register와 `decision_refs`를 재사용한다.
28. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
    namespace를 사용하고 deny가 항상 우선한다.
29. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222 substrate를 소비하되
    #222 의미를 다시 설계하지 않는다.

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
decision_cap   = open/malformed Open Decision이 허용하는 최고 mode
readiness_mode = min(fact_mode, decision_cap)
```

`readiness_mode`는 작업 요청의 종류가 아니라 현재 성숙도와 decision ceiling이다.

### 2.2 Current path authorization

```text
base_allowed   = resolve(chosen_mode.allowed_paths)
base_forbidden = resolve(chosen_mode.forbidden_paths)
```

그 뒤 no-API 보정, API Candidate ownership, shared-surface reservation,
generated/do-not-edit, concrete path canonicality와 forbidden precedence가 적용된다.

`api-integrated-ui`는 hook/API-client를 열고 screen을 금지한다. 이는 API wiring 동안
screen JSX와 visual structure를 보존하는 보호 계약이다.

### 2.3 Deny provenance loss

현재 mode YAML deny와 Tier3 `layers[].access.forbid`는 최종
`forbidden_paths: string[]`으로 합쳐진다. 합쳐진 뒤 canonical work-step deny와
consumer safety deny를 구분할 수 없다. Intent override는 path string 삭제가 아니라
origin-bearing claim을 사용해야 한다.

### 2.4 Input Result Contract boundary

검사 11의 hard 범위:

- canonical frontmatter
- required nine fields
- `input_id` grammar와 uniqueness
- RFC3339 `captured_at`
- `input_type` / `source_type`
- effective `affected_domains` / `affected_screens`
- `supersedes` existence/self-reference
- optional confidence enum

Reconciliation RR/RP trust와 별개이며 둘 다 capability에 필요하다.

### 2.5 Reconciliation Contract v2 boundary

V2는 canonical Summary/Items structure, item grouping, routing, refs, provenance,
summary projection을 hard-validate한다. Readiness가 별도 parser를 만들지 않도록
trust-producing analyzer를 추출한다.

### 2.6 Current target provenance boundary

Reconciliation Item `Effect`는 historical action이다. 과거 item이 hard-valid하다는
사실은 현재 artifact가 해당 evidence를 current source로 채택한다는 뜻이 아니다.

Current authored provenance surface:

- Figma mapping exact `Mapping Provenance` row
- Visual consistency exact `Screen Families` row
- ScreenSpec optional exact `Visual Evidence` row
- intentional removal을 기록하는 `Visual Target Retirements` tombstone

### 2.7 Target-key projection boundary

Screen-level `max(captured_at)`만 비교하면 다른 target key의 누락된 projection을
더 최신인 unrelated key가 가릴 수 있다. Currentness는 exact target-key별 completeness를
먼저 검사하고, complete active keys만 screen revision 계산에 참여해야 한다.

### 2.8 Screen Source Map boundary

General doctor는 warning-first다. Capability use는 exact frontmatter/table/header,
canonical row identity, namespace-qualified alias relation을 별도 analyzer로 검사한다.
정상 `split|ambiguous`는 relation-local non-authorizing이지 global structure failure가
아니다.

### 2.9 Supersession and lineage boundary

Graph는 explicit `supersedes`만 표현한다. Missing edge나 source migration은 graph만으로
발견할 수 없으므로 target-current provenance와 per-key completeness가 별도 조건이다.
`source_lineage`는 source-specific producer가 제공하는 logical replacement stream key다.

### 2.10 Layout resolver boundary

일반 `resolvePaths()` / `requireRole()`의 undefined role은 `LayoutConfigError`다.
Optional app-shell roots만 target-profile lazy resolver를 사용한다. `api_client`는
모든 shell에 required가 아니라 app-shell API kind가 실제 사용될 때 required-on-use다.

### 2.11 Route-entry boundary

기본 Expo `route_entry`는 `src/app/**`로 넓다. Shell `route-host`는 exact-file
`app_shell_route_host`만 사용한다.

### 2.12 Shared surfaces

Shared-surface declaration은 권한이 아니다. Policy와 모든 member screen의 effective
intersection을 통과해야 한다. App shell도 declaration과 target kind root의 intersection을
통과해야 한다.

### 2.13 Open Decisions

Canonical home은 `global/open-decisions.md`; six-column schema와 human-only
`open → resolved`를 유지한다. `decision_refs`가 target scope를 소유한다.

### 2.14 API Candidate owner boundary

현재 screen-centric owner를 generic `{target_type,target_id}`로 확장한다. App-shell
candidate는 root-bound typed hook/API-client parent가 있어야 한다.

---

## 3. Reproduced Failure Modes

### 3.1 #222

1. Mature API-integrated screen에 visual task를 표현할 권한 축이 없다.
2. Evidence 없는 intent는 API wiring의 screen deny 우회 capability가 된다.
3. RR/RP만 검사하면 malformed input artifact가 evidence가 될 수 있다.
4. Raw alias scope를 해소하지 않으면 정상 identity reconciliation을 막는다.
5. Superseded input을 막지 않으면 stale bearer capability가 된다.
6. Graph leaf만 보면 missing `supersedes`나 source move를 놓친다.
7. Historical item만 보면 current artifact provenance에서 사라진 input도 권한을 얻는다.
8. Screen scalar max만 보면 key B의 unprojected latest effect를 key A의 newer current
   evidence가 가릴 수 있다.
9. Current row가 selected input ID만 같고 다른 section/bullet Evidence를 가리켜도
   잘못 통과할 수 있다.
10. Target key 행을 단순 삭제하면 historical trusted item이 검사 대상에서 사라질 수 있다.

### 3.2 #223

1. Navigation/visual docs는 shell implementation target이 아니다.
2. Shared surface global 특례는 member/cap/fan-out 의미를 훼손한다.
3. Typed declaration만 믿으면 arbitrary physical authority를 만들 수 있다.
4. Broad `route_entry`를 route-host root로 쓰면 ordinary route를 shell이 선점한다.
5. Malformed declaration을 index에서 제거하면 broad allow가 우회한다.
6. No-API shell이 API maturity에서 authority 0이 될 수 있다.
7. Eager role resolution은 no-shell/no-API custom layout을 깨뜨린다.
8. Global resolver를 완화하면 existing deny typo가 fail-open한다.

---

## 4. Goals

- maturity와 task authorization을 분리한다.
- hard-trusted, exact, current, projection-complete visual evidence만 screen path를 연다.
- historical input과 stale target key를 bearer capability로 만들지 않는다.
- API wiring 중 screen invariant를 유지한다.
- app shell을 independent implementation target으로 만든다.
- shell declaration과 policy-owned physical ceiling을 분리한다.
- no-API host authority를 보존한다.
- malformed owner가 다른 target 권한을 넓히지 않게 한다.
- shell Open Decision이 shell만 cap하도록 한다.
- no-intent/no-shell compatibility를 보존한다.
- #222와 #223을 별도 implementation PR로 나눈다.

---

## 5. Non-goals

- mode order 변경 또는 scalar visual-refresh mode
- reached-mode union
- evidence bypass
- filename/timestamp/source-ref 추론만으로 currentness 결정
- historical input mutation/backfill
- silent target key deletion
- Reconciliation Effect enum 변경
- global doctor warning을 required hard CI로 승격
- shell declaration-only authority
- broad default shell roots
- #224 decision-log contract
- Open Decision schema 변경
- automatic consumer migration
- dependency/release/version/tag 변경

---

## 6. Terminology

| Term | Meaning |
|---|---|
| maturity | fact와 decision cap이 허용하는 진행 상태 |
| work intent | explicit current task kind |
| input artifact trust | Input Result Contract hard validity |
| reconciliation trust | Contract v2 hard validity |
| effect evidence ref | trusted effect row의 canonical `input:<id>#section[/bullet]` |
| visual target key | exact current visual record identity |
| trusted effect ledger | exact target key별 trusted visual effect rows |
| active current record | owner artifact가 현재 적용 중이라고 선언한 target-key record |
| retirement tombstone | target key의 intentional removal을 append-only로 선언한 record |
| projection completeness | latest trusted refs가 active/retired record에 모두 반영된 상태 |
| target provenance stale | relevant key 하나 이상이 projection-incomplete인 상태 |
| screen visual revision | complete active target records가 참조하는 최신 input timestamp |
| source lineage | logical replacement stream key |
| lineage transition | legacy/source move의 append-only audit record |
| map structure trust | Screen Source Map global structural validity |
| alias relation state | authorizing / acknowledged-non-authorizing / conflicting |
| deny claim | origin/overrideability를 보존한 path deny |
| typed shell path | semantic kind와 narrow reservation declaration |
| kind root | policy/layout-owned physical authority ceiling |
| required-on-use root | 해당 kind를 실제 사용하면 필수인 root |
| deny-only ownership | positive authority 없이 다른 target을 차단하는 claim |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)` 유지.
2. 권한을 얻기 위해 mode를 낮추지 않음.
3. Intent는 explicit; bypass 없음.
4. Input Result Contract와 Reconciliation v2 모두 hard-trusted.
5. Selected effect는 exact target key와 exact canonical Evidence ref를 가짐.
6. Current provenance는 effect의 exact ref를 포함해야 함. Same input/different bullet은 불충분.
7. 모든 relevant target key의 latest trusted refs를 먼저 projection-completeness 검사.
8. 한 key라도 incomplete이면 screen 전체 stale, permission 0.
9. Silent target key deletion 금지; explicit retirement tombstone 필요.
10. Complete active keys만 screen revision에 참여.
11. Selected input은 current active target ref이자 screen revision input.
12. Graph leaf는 필요조건일 수 있으나 target currentness를 대체하지 않음.
13. Historical input mutation/backfill 금지.
14. Alias는 authorizing source-map relation 없이는 scope를 만들지 않음.
15. Split/ambiguous는 relation-local non-authorizing.
16. Intent는 base path union이 아님.
17. Deny는 claim 단위로 판정.
18. Non-waivable claim 하나라도 남으면 deny.
19. Tier3/custom/generated/ownership/candidate deny는 waive하지 않음.
20. Forward/backstop은 같은 analyzers/context 사용.
21. Packet/Report는 재계산하지 않음.
22. Shell declaration은 self-grant authority가 아님.
23. Route-host는 exact app-shell route-host root만 사용.
24. Optional/required-on-use roots는 lazy resolve.
25. Ordinary undefined role은 계속 LayoutConfigError.
26. Malformed owner가 other-target authority를 넓히지 않음.
27. No-API shell은 host만 유지하고 API authority는 얻지 않음.
28. No-intent/no-shell behavior 호환.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode union | reject | task kind와 API invariant 구분 불가 |
| API mode screen forbid 제거 | reject | 모든 API wiring에 screen mutation 개방 |
| historical item only | reject | current authored source를 증명 못함 |
| graph leaf only | reject | missing edge/source move를 놓침 |
| screen scalar max only | reject | 다른 key의 projection 누락을 가림 |
| per-key completeness then screen revision | adopt | exact projection과 whole-screen freshness 모두 보장 |
| current input ID equality | reject | 다른 section/bullet pointer를 허용 |
| exact canonical Evidence ref | adopt | effect→target provenance를 precise하게 결합 |
| silent key deletion | reject | 누락을 검사 대상 밖으로 숨김 |
| explicit retirement tombstone | adopt | intentional removal을 append-only로 증명 |
| global duplicate alias failure | reject | valid split가 unrelated relation을 닫음 |
| relation-local alias state | adopt | blast radius 최소화 |
| declaration-only shell authority | reject | arbitrary physical ownership 생성 |
| declaration ∩ kind root | adopt | semantic owner와 policy authority 분리 |
| route-host → route_entry | reject | ordinary routes까지 broad |
| exact app_shell_route_host | adopt | host file만 명시적으로 개방 |
| eager api_client root | reject | no-API custom layout 파손 |
| required-on-use root | adopt | actual usage에만 fail closed |
| shared-surface global scope | reject | member/cap/fan-out 훼손 |
| dedicated app-shell-spec | adopt | narrow target identity/gate |

---

## 9. Decision D1 — Readiness Maturity 유지

### 9.1 Formula

```text
fact_idx       = target fact profile이 연속 만족하는 최고 mode index
decision_idx   = target open decision의 최저 Blocking Mode index - 1
readiness_idx  = min(fact_idx, decision_idx)
readiness_mode = order[readiness_idx]
```

Malformed lifecycle/decision/policy/target contract는 fail closed한다.

### 9.2 Base output

Intent가 있어도 top-level `readiness_mode`, `next_mode`, `allowed_paths`,
`forbidden_paths`, `blocking`, `next_actions`는 base maturity 의미다.
Intent result는 `work_intent`에 둔다.

### 9.3 Prerequisite

```text
intent_prerequisite_pass =
  fact_idx >= index(final-fixture-ui)
  AND decision_cap_idx >= index(final-fixture-ui)
  AND target lifecycle/structure valid
```

Final-level blocker는 visual refresh를 막고 API-only higher blocker는 막지 않는다.

### 9.4 Effective profile

Maturity와 effective path profile은 별도다. No-API app shell은 API/production maturity에서
`no-api-host` profile을 사용할 수 있다.

---

## 10. Decision D2 — Explicit Work Intent와 Exact Current Evidence

### 10.1 Public contract

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260814-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

First slice에서 screen selector에만 허용한다. Mapping 존재, recent timestamp, filename,
current mode만으로 자동 활성화하지 않는다.

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

`input_artifact_trusted=true`는 검사 11 hard contract 전체가 통과할 때만 true다.
Validate adapter는 existing diagnostics shape/order를 유지한다.

Capability용 additive optional fields:

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

각 trusted effect row는 다음 normalized fields를 가진다.

```yaml
input_id: IN-20260814-figma-003
item_id: RI-VISUAL-003
target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-012
evidence_ref: input:IN-20260814-figma-003#extracted-facts/02
captured_at: "2026-08-14T10:00:00+09:00"  # input artifact captured_at
```

`evidence_ref`는 raw string input ID 비교가 아니라 existing
`parseInputEvidenceRef`가 반환한 canonical tuple을 serialize한 값이다.

Capability grammar:

```text
input:<input_id>#<section-slug>[/<1-based-bullet>]
```

Whole-input pointer, unresolved pointer, zero bullet, noncanonical alias는 capability evidence가
아니다.

### 10.4 Screen Source Map capability analyzer

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
- parseable canonical frontmatter
- exact artifact identity
- exactly one exact 10-column table
- unique canonical screen rows
- structurally valid ScreenSpec path/route/status

Alias namespaces:

```text
planning:<token>
design:<token>
figma-node:<token>
```

Relation states:

- one-canonical `confirmed|merged` → `authorizing`
- acknowledged `split|ambiguous` → `acknowledged-non-authorizing`
- one-canonical `candidate|deprecated` → `acknowledged-non-authorizing`
- contradictory/mixed/duplicate relation → `conflicting`

Relation-local failures do not poison unrelated authorizing aliases.
Canonical-ID/source-alias collision is token-local fail closed.

### 10.5 Scope resolution

```text
scope_allows(screen) =
  direct active canonical relation
  OR authorizing source-map relation
```

Raw token itself never grants permission. Exact visual target/evidence checks are separately required.

### 10.6 Exact visual target keys

Every capability effect row resolves to exactly one key.

```text
mapping:<artifact_id>/<mapping-key>
visual-family:<artifact_id>/<family-key>
screen-visual:<screen-spec-artifact-id>/<section-slug>
```

Rules:

- Figma mapping target must include exact `M-...` row key.
- Visual family target must include exact Family row key.
- ScreenSpec target must include visual-allowed section slug.
- Whole artifact/section-only mapping/family targets may remain general reconciliation targets but
  are insufficient for capability.

A target key is project-unique after artifact identity resolution.

### 10.7 Current active provenance records

Analyzer produces one current record per active target key.

```yaml
target_key: mapping:CREATE-ATTACH-figma-component-mapping/M-012
state: active
evidence_refs:
  - input:IN-20260814-figma-003#extracted-facts/02
owner_artifact: CREATE-ATTACH-figma-component-mapping
source_location: mapping-provenance/M-012
```

#### A. Figma mapping

Exact `Mapping Provenance` row:

```text
Mapping Key == target key row
Evidence parses as exactly one canonical input evidence ref
Source Ref/Unit/Captured At hard-valid
one provenance row per Mapping Key
```

Mapping row's evidence set has exactly one ref.

#### B. Visual family

Exact `Screen Families` row:

- unique Family key
- selected screen exact Member
- Evidence is semicolon-separated canonical evidence refs
- no unresolved/free-prose/placeholder/duplicate canonical ref
- row is active, not retired

#### C. ScreenSpec visual section

Optional exact table:

```markdown
## Visual Evidence

| Section | Evidence | Captured At | Status |
|---|---|---|---|
| ui-sections | input:IN-...#extracted-facts/01 | inherit | current |
```

Contract:

- exactly one exact table
- Evidence is semicolon-separated canonical refs
- Section is visual-allowed
- one `current` row per section
- duplicate refs/current rows invalid
- without this table, ScreenSpec visual section cannot authorize capability

### 10.8 Exact effect-to-current Evidence binding

For every selected effect row used by capability:

```text
selected_effect.evidence_ref
  ∈ active_current_record(selected_effect.target_key).evidence_refs
```

For mapping, active record has one ref, so this is equality.
For family/ScreenSpec, exact membership in the canonical set is required.

The following is denied:

```text
selected effect:
  input:IN-X#extracted-facts/01

current target:
  input:IN-X#extracted-facts/99
```

Same `input_id` does not compensate for different section/bullet.

Rules:

- raw text is canonicalized through the shared parser before comparison
- duplicate canonical refs after normalization are invalid
- selected group with multiple effect rows must bind every effect row that resolves to the selected
  screen; selecting one matching row does not hide another mismatched row
- current row may include additional older trusted refs, but every selected/latest required ref must
  be present

### 10.9 Trusted effect ledger by target key

Build a ledger from all Input Result-trusted and Reconciliation-trusted visual effect rows.

```text
trusted_effects_by_key[key] = sorted trusted effect rows for exact key
latest_at(key) =
  max(effect.input.captured_at)

latest_trusted_refs(key) =
  set(effect.evidence_ref
      for trusted effects at latest_at(key))
```

Hard ambiguity:

- same key + same max timestamp + incompatible target semantics
- duplicate normalized `(target_key,evidence_ref)` from distinct items without exact duplicate
  suppression contract
- unresolved or noncanonical ref

The ledger is independent of whether the key currently exists in its owner artifact. Therefore
deleting a row cannot remove the key from completeness analysis.

### 10.10 Relevant target-key set

```text
relevant_target_keys(screen) =
  keys from trusted visual effects resolving to screen
  ∪ keys from current active records resolving to screen
  ∪ keys from retirement tombstones resolving to screen
```

A trusted historical key remains relevant until an active current record or valid retirement
tombstone accounts for its latest trusted refs.

### 10.11 Per-key projection completeness

For active key:

```text
target_key_complete(key) =
  active record unique and hard-valid
  AND latest_trusted_refs(key) ⊆ active_record.evidence_refs
```

For a key without trusted effects, an active record may exist as authoring data but cannot itself
create intent authority.

Projection-incomplete examples:

```text
M-001 current A @ 11:00
M-002 trusted B @ 10:00 but no current record/ref
→ M-002 incomplete
→ screen stale

M-001 current A @ 11:00
M-002 trusted B @ 11:00 but no current record/ref
→ M-002 incomplete
→ screen stale
```

A newer unrelated key cannot mask an older/equal-time incomplete key.

### 10.12 Explicit target retirement tombstone

Silent row deletion is forbidden. Each visual owner artifact may contain at most one optional exact
table:

```markdown
## Visual Target Retirements

| Target Key | Evidence | Captured At | Replaced By | Status |
|---|---|---|---|---|
| mapping:CREATE-ATTACH-figma-component-mapping/M-002 | input:IN-...#extracted-facts/07 | inherit | mapping:CREATE-ATTACH-figma-component-mapping/M-020 | retired |
```

Contract:

- exact five-column header and one table per owner artifact
- Target Key belongs to that artifact and resolves uniquely
- Status exactly `retired`
- Evidence is nonempty semicolon-separated canonical refs; no duplicates
- `Captured At` is RFC3339 or `inherit`
- `Replaced By` is `-` or a valid exact target key
- active current record and retirement tombstone for same key cannot coexist
- tombstone does not authorize `visual-refresh`

Retired completeness:

```text
target_key_retired_complete(key) =
  unique valid tombstone
  AND latest_trusted_refs(key) ⊆ tombstone.evidence_refs
  AND tombstone effective captured_at >= latest_at(key)
```

A key deleted without a valid tombstone is `missing-current-record`, therefore stale.
A later trusted effect for a retired key makes it stale again until a new active record or later
tombstone accounts for that effect.

No Reconciliation Effect enum is added. Retirement is an `Effect=update` to the owner artifact/key,
and the tombstone carries exact evidence of that update.

### 10.13 Screen target-provenance state

```text
target_provenance_state(screen) = current
iff every relevant target key is either:
  target_key_complete(key)
  OR target_key_retired_complete(key)
```

Otherwise:

```text
target_provenance_state = stale
intent permission = 0 for every input
next action = update active provenance or add valid retirement tombstone
```

This check occurs before any screen scalar revision.

### 10.14 Screen visual revision

Only complete active keys participate.

```text
complete_active_refs(screen) =
  union(active_record.evidence_refs for complete active keys)

current_visual_revision_at(screen) =
  max(captured_at of inputs referenced by complete_active_refs)
```

Retired keys do not raise the current visual revision and cannot authorize.

Selected input must satisfy:

```text
selected input referenced by selected active target key
AND selected effect exact evidence ref is in that key's current refs
AND selected input captured_at == current_visual_revision_at(screen)
AND target_provenance_state(screen) == current
```

Equal-time disjoint active keys are allowed only when every relevant key is complete and their
latest required refs are all represented. Same-key equal-time conflicting refs are denied.

### 10.15 Supersession graph and source lineage

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

Figma lineage represents logical screen stream, not bare file:

```text
figma-screen://file/<file-key>/<stable-source-screen-key>
```

Component trust also requires unique nodes, frontmatter/Summary parity, no self edge, acyclic graph,
and at most one direct successor per predecessor.

Graph leaf/isolated is necessary but not sufficient; §§10.8–10.14 remain mandatory.

### 10.16 Legacy lineage adoption and source move

Historical input is immutable. New input may declare:

```yaml
source_lineage: figma-screen://file/new-file/CREATE-ATTACH
lineage_transition:
  from_input: IN-OLD
  reason: source-move
```

Valid transition:

- old input exists and is older
- new input hard-trusted/reconciled
- old/new resolve to same canonical screen
- new effect exact ref is projected into current active record
- all target keys complete/retired
- new input is current screen revision
- transition is audit provenance, not graph edge/authority by itself

Old input becomes non-current through authored provenance/revision movement, not historical mutation.

### 10.17 Final evidence formula

```text
intent_evidence_valid =
  selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND scope_allows(selected_screen)
  AND every selected effect has exact trusted target key
  AND every selected effect exact evidence ref binds to current active record
  AND target_provenance_state(selected_screen) == current
  AND selected_input_is_current_screen_revision
  AND supersession_component_trusted
  AND selected_input_is_graph_leaf_or_isolated
```

### 10.18 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260814-figma-003
    input_artifact_trusted: true
    reconciliation_trusted: true
    graph_leaf: true
    target_provenance_state: current
    current_visual_revision_at: "2026-08-14T11:00:00+09:00"
    target_keys:
      - key: mapping:CREATE-ATTACH-figma-component-mapping/M-012
        effect_evidence_ref: input:IN-20260814-figma-003#extracted-facts/02
        current_evidence_refs:
          - input:IN-20260814-figma-003#extracted-facts/02
        projection_complete: true
      - key: mapping:CREATE-ATTACH-figma-component-mapping/M-002
        state: retired
        retirement_evidence_refs:
          - input:IN-20260814-figma-003#extracted-facts/07
        projection_complete: true
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

Required mode is `final-fixture-ui`; base maturity remains unchanged.

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

### 11.3 Exact waiver

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

Actual claim object만 사용한다.

### 11.4 Positive envelope

```text
resolve({roles.screen})
∪ resolve({roles.domain_component})
```

Hook/API-client, candidates, delegated shared paths, valid/deny-only shell reservations,
generated and other-owner paths remain non-waivable denies.

### 11.5 Formula

```text
matching_claims = all matching claims
waived_claims  = exact-waivable claims
active_denies  = matching_claims - waived_claims

allowed =
  intent applicable
  AND positive candidate match
  AND active_denies empty
```

### 11.6 Output stability

Base path arrays remain base semantics. No-intent output has no `work_intent`.

---

## 12. Decision D4 — App Shell Artifact Model과 Physical Roots

### 12.1 Artifact and identity

```text
docs/frontend-workflow/app/shells/{shell}/shell-spec.md
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
```

Required: `artifact_id`, `artifact_type`, `shell_id`, `status`.  
Optional: paths, decisions, API requirement, sources/dependencies/review.  
Forbidden: screen/shared identity fields and route identity.

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

Kinds: `route-host|shell-host|hook|api-client`.
Declaration owns semantic kind and reservation provenance, not physical permission.

### 12.3 Target-profile roots

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

Route-host accepts exact files only. Default Expo preset does not create broad shell roots.

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
- unused kind → no lookup
- optional used/missing → permission 0, readiness exit 0
- api-client used/missing → target-local hard fail/permission 0/deny-only
- ordinary role resolution retains LayoutConfigError

No-API host-only shell never resolves `api_client`.

### 12.6 Root binding

```text
exactly one same-kind root covers path
AND no different-kind root overlaps path
```

Zero/ambiguous/contradictory root means no positive authority.

### 12.7 Invalid declarations and recovery

Invalid shape, kind, path, overlap, root binding, contradiction or cross-owner conflict means shell
positive permission 0. Recoverable narrow path remains deny-only.

### 12.8 Fact profile

| Mode | Shell fact minimum |
|---|---|
| docs-only | parsed artifact only |
| route-skeleton | identity/status/navigation reference |
| screen-skeleton | core sections + root-bound host path |
| rough-fixture-ui | state/non-route interaction complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API case or actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.9 Path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | route-host |
| screen-skeleton | route-host/shell-host |
| rough/final | hosts + valid active hook slices |
| api-integrated | active hook/API slices; hosts frozen |
| production-ready | root-bound hosts + active slices |

### 12.10 No-API profile

```text
if api_required == false and readiness >= api-integrated-ui:
  effective_path_profile = no-api-host
```

Allowed root-bound route/shell hosts. Denied all hooks/API clients/candidates and all other claims.
No API root lookup when API kind unused.

---

## 13. Decision D5 — Target-aware API Candidate Ownership

### 13.1 Owner

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

### 13.2 Surface resolution

- screen: existing domain/layout roles
- shared surface: existing contract + generic conflict index
- app-shell hook: trusted root-bound typed hook parent
- app-shell API client: trusted root-bound typed API parent; triggers required-on-use root

### 13.3 Tracking

Unknown tracking resolves in same owner artifact.

### 13.4 Positive authority

```text
same owner
valid contract
confirmed active
slice inside one trusted parent
matching kind/root
no conflict
api_required != false
```

### 13.5 Deny-only candidates

Deferred, invalid, outside, root-unbound, required-on-use-unbound, kind mismatch, conflict and
no-API candidates retain project-wide deny-only claims.

---

## 14. Decision D6 — Target-scoped Open Decisions

- reuse global six-column table
- app-shell `decision_refs`
- `open|resolved`, human-only resolve
- malformed ref caps only shell
- resolved ref remains provenance
- no unrelated screen/shared fan-out
- zero-ref row remains valid/non-blocking
- same mode order applies against shell fact profile

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

### 15.2 Recovery

A. trusted typed + root-bound → normal owner/positive candidate  
B. invalid but canonical narrow → deny-only ambiguous owner  
C. no trustworthy project path → no physical claim + hard error

### 15.3 Deny-only example

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

### 15.4 Projection

Valid/deny-only shell reservations project to screen/shared/other-shell contexts.
Broad `src/**` cannot bypass.

---

## 16. Public CLI Contract

Selectors:

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

Mutually exclusive.

Visual intent requires screen + intent + input. Invalid syntax is exit 2.
Evidence/currentness/root failure is keyed `applicable:false` or path denial, exit 0.
Ordinary undefined layout role remains exit 2.

---

## 17. workflow-state Contract

### 17.1 App shells

Emit only when adopted.

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

### 17.2 Visual evidence index

Recommended additive deterministic summary:

```yaml
visual_evidence:
  CREATE-ATTACH:
    target_provenance_state: current
    current_revision_at: "2026-08-14T11:00:00+09:00"
    active_keys:
      mapping:CREATE-ATTACH-figma-component-mapping/M-012:
        projection_complete: true
        current_refs:
          - input:IN-20260814-figma-003#extracted-facts/02
    retired_keys:
      mapping:CREATE-ATTACH-figma-component-mapping/M-002:
        projection_complete: true
        retirement_refs:
          - input:IN-20260814-figma-003#extracted-facts/07
```

If serialized, source hashes must prevent stale trust reuse.

### 17.3 Determinism

Sort IDs, keys, refs, claims, diagnostics and paths. Existing screens/surfaces shape remains
additive-compatible.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Valid current intent

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260814-figma-003",
      "applicable": true,
      "evidence": {
        "target_provenance_state": "current",
        "current_visual_revision_at": "2026-08-14T11:00:00+09:00",
        "target_keys": [
          {
            "key": "mapping:CREATE-ATTACH-figma-component-mapping/M-012",
            "effect_evidence_ref": "input:IN-20260814-figma-003#extracted-facts/02",
            "current_evidence_refs": [
              "input:IN-20260814-figma-003#extracted-facts/02"
            ],
            "projection_complete": true
          }
        ]
      },
      "allowed_paths": [
        "src/features/create/screens/**",
        "src/features/create/components/**"
      ]
    }
  }
}
```

### 18.2 Exact pointer mismatch

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-X",
      "applicable": false,
      "evidence": {
        "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-012",
        "effect_evidence_ref": "input:IN-X#extracted-facts/01",
        "current_evidence_refs": [
          "input:IN-X#extracted-facts/99"
        ],
        "reason": "exact-evidence-ref-mismatch"
      },
      "allowed_paths": []
    }
  }
}
```

### 18.3 Per-key stale masked by newer key

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "applicable": false,
      "evidence": {
        "target_provenance_state": "stale",
        "incomplete_target_keys": [
          {
            "key": "mapping:CREATE-ATTACH-figma-component-mapping/M-002",
            "latest_trusted_refs": [
              "input:IN-B#extracted-facts/01"
            ],
            "current_evidence_refs": [],
            "reason": "latest-effect-not-projected"
          }
        ]
      },
      "allowed_paths": []
    }
  }
}
```

### 18.4 Retired key

```json
{
  "visual_evidence": {
    "target_key": "mapping:CREATE-ATTACH-figma-component-mapping/M-002",
    "state": "retired",
    "projection_complete": true,
    "retirement_evidence_refs": [
      "input:IN-R#extracted-facts/07"
    ],
    "replaced_by": "mapping:CREATE-ATTACH-figma-component-mapping/M-020"
  }
}
```

### 18.5 Relation-local split map

```json
{
  "screen_source_map_capability": {
    "structure_trusted": true,
    "relations": {
      "design:J010": {
        "state": "acknowledged-non-authorizing",
        "reason": "split"
      },
      "design:K020": {
        "state": "authorizing",
        "canonical_screen_id": "SCREEN-C"
      }
    }
  }
}
```

### 18.6 No-API shell without API role

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
- Reconciliation Contract v2/effect ledger
- Screen Source Map structure/relation
- visual target key resolver
- active current provenance adapters
- retirement tombstone adapter
- per-key projection completeness
- screen visual revision
- supersession/lineage transition
- shell root/ownership/deny claims

Validate adapters preserve public diagnostics and warning-first boundaries.

### 19.2 Authorization order

```text
1 concrete path canonicality
2 target/lifecycle/contract validity
3 input artifact trust
4 reconciliation/effect-row trust
5 scope relation
6 exact target key
7 exact effect Evidence ref
8 active/retired target record trust
9 per-key projection completeness for all relevant keys
10 screen target-provenance state
11 current screen visual revision
12 graph leaf/lineage transition trust
13 intent prerequisite/base readiness
14 target-root lazy resolution/no-API profile
15 positive path profile
16 ownership/generated/candidate denies
17 claim waiver
18 remaining deny precedence
19 structured provenance
```

### 19.3 Diff backstop

Forward and diff consume identical context. Visual backstop requires `--input` and includes exact
refs/per-key completeness. Shell backstop uses same roots/deny-only reservations.

### 19.4 Packet/Report

Copy, never recompute:

- input/reconciliation trust
- scope relation
- selected effect target keys/evidence refs
- current active refs
- latest refs by key
- incomplete/retired key states
- screen revision
- graph/transition
- root bindings
- deny claims

### 19.5 Warning-first boundary

General source-map/visual doctor remains warning-first. Capability strictness only denies use as
authorization evidence.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input contract | trust, lineage, transition |
| reconciliation | target keys, exact effect refs, effect ledger |
| figma mapping | active current row + retirement table |
| visual consistency | family Evidence set + retirement table |
| ScreenSpec | Visual Evidence + retirement table |
| screen identity | relation-local capability analyzer |
| project layout | shell roots/lazy resolver |
| implementation policy | target root slots |
| app-shell reference | paths, roots, no-API, recovery |
| Open Decisions | shell scope |
| shared surfaces | shell reservation separation |
| Stage 05/06/08 | author/implement/validate/report |
| commands | intent/input/shell |
| implement-screen | exact current projection-complete evidence |
| implement-app-shell | root-bound readiness |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current behavior |
| v1/summary-only | permission 0 |
| invalid input | permission 0 |
| graph leaf but non-current target | permission 0 |
| same input/different Evidence bullet | permission 0 |
| key B unprojected, key A newer/current | screen stale |
| equal-time unprojected disjoint key | screen stale |
| all latest per-key refs projected | current |
| target key deleted without tombstone | stale |
| valid retirement tombstone | retired key complete, no authority |
| legacy lineage-free isolated current input | may authorize |
| source move transition + current provenance | new may authorize, old denied |
| acknowledged split + unrelated confirmed alias | confirmed remains authorizing |
| no app-shell | no root lookup/new required file |
| no-API shell without api_client | host works |
| used API kind without root | local fail closed |
| ordinary undefined role | LayoutConfigError |
| missing optional shell role | local permission 0 |
| old state reader | ignores additive keys |
| warning-first surfaces | no promotion |

No new required CI, dependency, release/version/tag.

---

## 22. Migration

### 22.1 #222

1. Create immutable canonical input.
2. Ensure Input Result Contract hard-valid.
3. Reconcile under Contract v2 with exact target key and exact Evidence ref.
4. Update the corresponding current active provenance row in the same change.
5. For every relevant key, ensure latest trusted refs are represented.
6. If intentionally removing a key, add a valid retirement tombstone; do not silently delete.
7. Resolve scope through canonical ID or authorizing map relation.
8. Ensure graph/lineage and current screen revision.
9. Run readiness with intent/input and concrete paths.
10. Run validate/backstop and copy provenance.

Legacy/source move uses new input + `lineage_transition` + active provenance movement.
Historical input is not edited.

### 22.2 #223

1. Preserve decision rows.
2. Add app-shell draft.
3. Add roots only for used kinds.
4. Declare paths inside roots.
5. Host-only no-API shell need not define API root.
6. Link decisions/regenerate state.
7. Check shell/screen/shared paths.
8. Validate/backstop.

Malformed recoverable paths remain deny-only.

---

## 23. Implementation Slices

### 23.1 Slice A — #222

Scope:

- Input Result/Reconciliation analyzers
- exact target key/evidence-ref normalization
- trusted effect ledger by key
- mapping/family/ScreenSpec active record adapters
- Visual Target Retirements tombstones
- per-key completeness and screen revision
- source-map relation analyzer
- graph/lineage transition
- deny claims and visual-refresh
- CLI/backstop/packet/report parity

Excludes app-shell artifact and #224.

Acceptance:

- no-intent compatibility
- exact current projection-complete evidence only
- silent key deletion cannot hide history
- same input/different pointer denied
- screen/domain-component only
- all sensitive paths denied

### 23.2 Slice B — #223

Depends on Slice A substrate.

Scope:

- app-shell artifact/template/schema/manifest
- root slots/lazy resolver
- exact route-host
- no-API envelope
- generic candidate owner
- ownership/recovery/state/readiness/validate/backstop
- skills/docs/distribution/migration

Acceptance:

- declaration alone no authority
- no-API custom layout works
- used API kind without root fails closed
- other targets cannot edit shell path

### 23.3 No Slice 0

Shared helpers ship with Slice A behavior, no abstraction-only PR.

---

## 24. File Impact Map

### Slice A

| Area | Expected files |
|---|---|
| input | input analyzer/producer/schema/template/tests |
| reconciliation | items analyzer/target/evidence helpers/tests |
| current evidence | mapping provenance, visual consistency, ScreenSpec helpers |
| retirement | common Visual Target Retirements parser/template contracts |
| identity | Screen Source Map capability analyzer |
| core | readiness/path authorization |
| backstop | forbidden-paths |
| execution | packet/report |
| docs/skills | input/visual references, implement-screen, Stage 06/08, commands |

### Slice B

| Area | Expected files |
|---|---|
| layout/policy | target roots/lazy resolver/schema |
| artifact | shell template/schema/manifest/reference/skill |
| analyzer/state | shell analyzer/workflow-state |
| authorization | root/no-API/ownership/readiness |
| candidate | generic owner/conflicts |
| validate/backstop | structural/root/ownership |
| distribution | pack/upgrade tests |
| docs | stages/matrix/migration |

---

## 25. Verification Matrix

### 25.1 #222

| # | Regression |
|---|---|
| 1 | no intent keeps API screen forbidden |
| 2 | valid current trusted input opens screen/domain only |
| 3 | invalid CLI intent/input combinations exit 2 |
| 4 | v1/summary-only denied |
| 5 | malformed Summary/Items denied |
| 6 | RR/RP-invalid group denied |
| 7 | Effect outside update/create denied |
| 8 | summary projection mismatch denied |
| 9 | unrelated input RR error isolated |
| 10 | invalid input type/source/required field/timestamp denied |
| 11 | duplicate input ID denied |
| 12 | direct canonical scope accepted |
| 13 | canonical scope excluding selected denied |
| 14 | confirmed/merged alias accepted |
| 15 | candidate/split/ambiguous alias non-authorizing |
| 16 | split does not poison unrelated confirmed alias |
| 17 | conflicting alias token denied locally |
| 18 | malformed map structure denies alias use |
| 19 | exact mapping target key required |
| 20 | exact family target key required |
| 21 | ScreenSpec section needs current Visual Evidence row |
| 22 | mapping current row exact effect Evidence ref accepted |
| 23 | same input ID, different Evidence bullet denied |
| 24 | same input ID, exact canonical Evidence ref accepted |
| 25 | family contains input but not selected effect ref denied |
| 26 | duplicate normalized current Evidence refs denied |
| 27 | every effect row in selected group must bind exactly |
| 28 | target key ledger survives active-row deletion |
| 29 | older latest-per-key item masked by newer other key → stale |
| 30 | equal-time disjoint unprojected item → stale |
| 31 | all latest-per-key refs reflected → current |
| 32 | active current set may contain older trusted refs but latest subset required |
| 33 | key removed without retirement tombstone → stale |
| 34 | malformed/duplicate retirement table → stale/hard-invalid |
| 35 | retirement Evidence not covering latest refs → stale |
| 36 | valid retirement covering latest refs → retired complete |
| 37 | active record and tombstone same key → invalid |
| 38 | later effect after retirement makes key stale again |
| 39 | retired key excluded from screen revision |
| 40 | selected input absent from current active refs denied |
| 41 | selected input older than complete active screen revision denied |
| 42 | equal-time complete disjoint active keys deterministic |
| 43 | same-key equal-time incompatible refs denied |
| 44 | later same-target input without supersedes denies old |
| 45 | source move/new lineage denies old |
| 46 | transition without current provenance denied |
| 47 | superseded trusted input denied |
| 48 | latest same-lineage leaf accepted |
| 49 | incomplete newer input blocks old fallback |
| 50 | reversed/equal timestamp edge denied |
| 51 | cross-source/different-lineage/missing-lineage edge denied |
| 52 | cycle/branch/parity mismatch denied |
| 53 | final-level decision blocks intent |
| 54 | API-only higher blocker does not block visual final work |
| 55 | absorbed/malformed lifecycle denied |
| 56 | shared/shell/candidate/generated reservations denied |
| 57 | exact deny claim waiver succeeds |
| 58 | same-path Tier3 deny remains active |
| 59 | forward/backstop same target ledger/ref/currentness |
| 60 | packet/report copies exact refs and key states |
| 61 | no-intent legacy fixtures compatible |

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
| 26 | cross-target conflict denied |
| 27 | deferred/invalid/no-API candidate deny-only |
| 28 | no-API API maturity preserves hosts |
| 29 | no-API denies hook/API/candidates at production too |
| 30 | shell-screen/shared/shell overlaps denied |
| 31 | valid/deny-only paths reserved from other targets |
| 32 | malformed recoverable paths remain deny-only |
| 33 | absolute/root escape no physical claim |
| 34 | duplicate identity preserves recoverable denies |
| 35 | broad production allow cannot bypass |
| 36 | empty paths authoring valid/permission 0 |
| 37 | Tier3 deny overrides root binding |
| 38 | selector/ID errors exit 2 |
| 39 | deterministic root/readiness state |
| 40 | forward/backstop parity |
| 41 | distribution includes payload |

Implementation PRs also run existing fixture-hook, API deferral, shared-surface, Open Decision,
readiness fail-open/redteam, path-backstop, distribution and upgrade regressions.

---

## 26. Risks / Known Limits

1. Whole-screen visual intent intentionally uses a coarse final screen revision, but only after
   exact per-key completeness succeeds.
2. Active provenance and retirement tables require template/parser migration for capability use.
3. Retirement is conservative; missing tombstone blocks until authoring is repaired.
4. Mapping rows support one current Evidence ref; multiple latest refs require split keys or a future
   explicit multi-ref mapping contract.
5. General doctors remain warning-first while capability use is stricter.
6. Transition is audit provenance, not a currentness bypass.
7. Required-on-use API root is target-local fail closed.
8. Deny-only recovery may temporarily lock malformed paths.
9. Contextless diff remains conservative.
10. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness formula/order 유지 |
| D2 | visual-refresh requires explicit input |
| D3 | Input Result + Reconciliation v2 trust |
| D4 | exact target key and canonical effect Evidence ref |
| D5 | per-key latest trusted projection completeness before screen revision |
| D6 | silent deletion forbidden; explicit retirement tombstone |
| D7 | selected input must be current active screen revision |
| D8 | graph leaf alone insufficient |
| D9 | logical source lineage and append-only transition |
| D10 | source-map structure and relation-local states separated |
| D11 | exact provenance-bearing deny claims |
| D12 | screen/domain-component-only visual profile |
| D13 | dedicated app-shell-spec |
| D14 | shell declaration does not self-authorize |
| D15 | exact app_shell_route_host |
| D16 | optional/required-on-use roots lazy |
| D17 | ordinary undefined role fail-closed preserved |
| D18 | generic API Candidate owner |
| D19 | no-API host profile |
| D20 | malformed shell path deny-only |
| D21 | six-column Open Decision schema reused |
| D22 | global physical namespace |
| D23 | #222 before #223 |
| D24 | no-intent/no-shell compatibility |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다.

Implementation naming만 남는다.

- helper/module names
- diagnostic metadata field names
- app-shell skill/reference slug

다음은 별도 설계 변경 없이는 허용되지 않는다.

- historical input bearer capability
- input-ID-only current evidence matching
- screen max before per-key completeness
- silent target key deletion
- stale target fallback
- cross-lineage edge inference
- split relation global poisoning
- shell declaration-only authority
- broad route_entry route-host
- eager unused API root
- ordinary undefined-role relaxation
- no-API hook/API authority
- malformed reservation removal
- Open Decision schema change

Baseline에서 재검증한 계약:

- readiness/policy/layout and undefined-role behavior
- Input Result Contract and immutable inputs
- Reconciliation Contract v2 effect/evidence grammar
- Mapping Provenance exact Evidence
- Visual Consistency family Evidence
- Screen Source Map split semantics
- shared surface/Open Decisions/API candidates/path backstop
- #124/#210/#211 boundaries

정적 검증:

- 28 numbered H2 sections
- balanced Markdown fences
- unique H2 headings
- JSON/YAML examples parseable
- independent #222/#223 acceptance matrices
- #221/#224 non-interference
- existing Open Decision schema/human transition
- no-intent/no-shell compatibility
- exact evidence ref binding
- per-key projection completeness
- explicit retirement tombstone
- target-current screen revision
- relation-local alias states
- required-on-use roots
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223
behavior가 이미 구현됐다는 증거로 사용하지 않는다.
