# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; fifth review amendment applied; implementation not started
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
> 네 번째 amendment는 supersession의 시간·source-lineage trust, capability용
> Screen Source Map hard trust, dedicated app-shell route-host root, optional target-root
> resolver와 기존 undefined-role fail-closed 경계를 확정했다.
> 다섯 번째 amendment는 resolved visual target의 current evidence, lineage transition,
> relation-local Screen Source Map authorization, app-shell `api-client` root의
> required-on-use lazy resolution을 확정한다.

---

## 1. Executive Summary

현재 `readiness_mode`는 사실 기반 성숙도와 Open Decision 상한을 하나의 mode
사다리로 표현하고, 선택된 mode 하나의 `allowed_paths`/`forbidden_paths`가 기본
구현 권한이 된다. 이 모델은 진행 상태에는 적합하지만 “지금 하는 작업의 종류”를
표현하지 못한다. 이미 `api-integrated-ui`에 도달한 화면에 새 시각 입력이 도착해도
screen 경로는 계속 금지되고, 반대로 그 금지를 단순 제거하면 API 배선 중 화면 불변
계약이 깨진다.

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
7. selected input은 trusted supersession component의 current leaf여야 한다.
8. supersession edge는 strictly-later timestamp와 same logical source lineage가 필수다.
9. graph leaf만으로는 충분하지 않다. Selected input은 resolved visual target의 현재
   authored provenance에 포함되고 selected screen의 current visual revision이어야 한다.
10. 더 최신 trusted visual item이 target provenance에 반영되지 않았으면 target을
    stale로 보고 어떤 input에도 positive permission을 주지 않는다.
11. lineage-free legacy input이나 source 이동은 cross-lineage supersession edge를
    발명하지 않고 explicit lineage transition + current target provenance 갱신으로 처리한다.
12. Screen Source Map은 global structural trust와 alias relation trust를 분리한다.
    정상 `split|ambiguous` relation은 해당 alias만 non-authorizing이며 unrelated
    `confirmed|merged` relation을 닫지 않는다.
13. 모든 deny는 provenance-bearing claim으로 보존한다.
14. `visual-refresh`가 waive할 수 있는 것은 exact canonical work-step deny뿐이다.
15. `visual-refresh`는 screen/domain-component만 여는 독립 최소 권한 envelope다.
16. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
17. shell `implementation_paths`는 `path + kind` typed declaration이다.
18. typed declaration은 semantic ownership일 뿐 physical authority를 스스로 만들지 않는다.
19. shell positive authority는 policy-owned target root, layout binding, maturity profile의
    교집합에서만 나온다.
20. `route-host`는 broad `route_entry`를 재사용하지 않고 exact-file
    `app_shell_route_host`를 사용한다.
21. optional shell roots와 required-on-use `api-client` root는 target-profile 전용 lazy
    resolver로 실제 declaration/candidate가 소비할 때만 해소한다.
22. 일반 `resolvePaths`/`requireRole`의 undefined-role fail-closed 의미는 유지한다.
23. API Candidate owner를 `{target_type, target_id}`로 일반화한다.
24. `api_required:false` shell은 API maturity에서도 root-bound host 권한을 유지하는
    `no-api-host` profile을 사용한다.
25. malformed이지만 안전하게 canonicalize 가능한 shell path는 positive authority를
    만들지 않고 project-wide deny-only reservation으로 남긴다.
26. 기존 6-column Open Decision register와 `decision_refs`를 재사용한다.
27. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
    namespace를 사용하고 deny가 항상 우선한다.
28. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222 substrate를 소비하되
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

`production-ready`의 CI/review 사실은 시각 입력 도착과 독립적이다.
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
`forbidden_paths: string[]`에 합쳐진다. 합쳐진 뒤에는 canonical mode의 work-step
screen deny와 consumer Tier3/custom safety deny를 구분할 수 없다.

따라서 path 문자열을 삭제하는 방식의 intent override는 금지한다. 구현은 path
resolution 전에 deny origin을 claim으로 보존해야 한다.

### 2.4 Input Result Contract boundary

`validate.mjs` 검사 11은 `input-artifact.mjs`의 Input Result Contract를 사용한다.
현재 hard 범위에는 최소 다음이 포함된다.

- canonical frontmatter 존재
- required 9필드
- `input_id` lexical contract와 전역 유일성
- `captured_at` RFC3339 with timezone
- `input_type` 및 `source_type` enum
- effective `affected_domains` 및 `affected_screens` 존재
- `supersedes` target 존재와 self-reference 금지
- optional `confidence` enum

이 결과는 Reconciliation Contract v2의 RR/RP diagnostics와 별개다. Reconciliation
Item이 explicit provenance를 가졌더라도 input artifact 자체가 hard-invalid이면 code
authorization evidence가 될 수 없다.

### 2.5 Reconciliation Contract v2 trust

현재 v2 validator는 deterministic hard diagnostics와 advisory warnings를 계산한다.
Readiness는 `workflow:validate` 선행 성공을 가정할 수 없으므로 별도 Markdown 부분
parser를 만들지 않고 기존 v2 분석을 trust-producing pure analyzer로 추출한다.

### 2.6 Current target provenance boundary

Reconciliation Item의 `Effect`는 reconcile 시점의 역사적 행위다. 과거 item이
hard-valid하다는 사실은 target artifact가 지금도 해당 input을 current visual source로
가리킨다는 뜻이 아니다.

현재 repository에는 다음 current authored provenance surface가 이미 있거나 추가할 수 있다.

- Figma mapping: `## Mapping Provenance`의 `Evidence`
- Visual consistency family: `Screen Families` row의 `Evidence`
- ScreenSpec visual section: first implementation slice에서 추가하는 optional
  `## Visual Evidence` exact table

`visual-refresh`는 historical item만이 아니라 이 current authored provenance를 함께
검증해야 한다.

### 2.7 Screen Source Map boundary

`screen-source-map.md`는 planning/design/Figma alias를 canonical Screen ID에 연결하는
optional register다. General doctor는 warning-first다. Capability use에는 exact
frontmatter/table/header와 row/alias index를 검증하는 별도 analyzer가 필요하다.

정상적인 `split|ambiguous`는 map 구조 오류가 아니다. 해당 alias relation이 code
authority를 만들 수 없다는 뜻이다. 따라서 global structure trust와 alias-local
authorization state를 분리해야 한다.

### 2.8 Supersession and lineage boundary

Input artifact와 Reconciliation Register Summary는 `supersedes` 관계를 표현한다.
Capability-specific graph는 cycle/branch/parity뿐 아니라 timestamp와 source lineage를
검사한다. 그러나 explicit edge가 없는 더 최신 same-target input은 graph에서 발견되지
않는다. 그러므로 graph current leaf와 target-current visual revision은 별도 조건이다.

`source_ref`는 개별 capture pointer이고 stable replacement stream이 아니다. Additive
`source_lineage`는 source-specific producer가 제공하는 opaque logical stream key다.

### 2.9 Layout resolver boundary

현재 `layout-profile.mjs`의 `requireRole()`과 `resolvePaths()`는 undefined `{roles.X}`를
`LayoutConfigError`로 처리한다. Undefined forbidden role을 `[]`로 만들면 deny가
사라지므로 이 의미는 유지한다.

App-shell target roots는 adoption과 kind 사용 여부에 따라 없을 수 있다. 이 root만
별도 lazy resolver가 처리하며 일반 layout resolver를 완화하지 않는다.

### 2.10 Route-entry boundary

기본 Expo `{roles.route_entry}`는 `src/app/**` 전체다. 이를 app-shell `route-host`
ceiling으로 재사용하면 일반 화면 route까지 shell 권한 후보가 된다. App shell route
host에는 exact-file `app_shell_route_host`를 사용한다.

### 2.11 Shared surfaces

`shared-surface-spec`은 domain, 최소 2 member, member cap, decision fan-out을 전제로
한다. 선언은 권한이 아니다. Declared path가 policy와 member screen들의 교집합을
통과해야만 positive permission을 만든다. App shell도 target-specific kind root를
통과해야 한다.

### 2.12 Open Decisions

Canonical global home은 `docs/frontend-workflow/global/open-decisions.md`이며 기존
6-column schema와 human-only `open → resolved` transition을 유지한다. `decision_refs`가
target scope를 소유한다.

### 2.13 Current API Candidate owner boundary

현재 API Candidate v2 positive authorization과 conflict collection은 주로 ScreenSpec과
`screen_id`에 맞춰져 있다. Domainless app shell에는 generic owner identity와 typed
hook/API-client parent가 필요하다.

### 2.14 Existing fixes and remaining gap

- #124는 `api_required:false` screen의 non-API path 잠금을 해소했다.
- #210은 API Candidate v2 per-slice deferral과 ownership을 만들었다.
- #211은 fixture mode의 owned hook slice와 API mode의 screen 불변을 양립시켰다.
- #222는 maturity와 작업 종류를 분리하는 authorization 축이 없는 문제다.
- #223은 shell target/path/decision owner가 없는 문제다.

---

## 3. Reproduced Failure Modes

### 3.1 #222 — mature screen visual work

1. 선택된 mode 하나가 base path envelope를 소유한다.
2. `final-fixture-ui`에서는 screen/domain-component/hook이 열릴 수 있다.
3. `api-integrated-ui`에서는 hook/API-client가 열리고 screen이 forbidden이다.
4. evidence 없는 `--intent`는 API wiring 작업의 screen deny 우회 capability가 된다.
5. RR/RP trust만 보면 Input Result Contract-invalid artifact가 evidence가 될 수 있다.
6. raw alias canonicalization이 없으면 정상 identity reconciliation을 영구 차단한다.
7. superseded input을 막지 않으면 stale input이 bearer capability가 된다.
8. graph leaf만 확인하면 explicit `supersedes`가 없는 더 최신 same-target input을 놓친다.
9. 과거 item target이 current artifact provenance에서 사라졌어도 historical row만으로
   permission을 얻을 수 있다.

따라서 intent, input/reconciliation trust, scope, graph freshness, target-current
provenance와 deny claim이 모두 필요하다.

### 3.2 #223 — app shell gate and ownership

1. navigation-map은 route topology 정본이지만 implementation target이 아니다.
2. visual-consistency-contract는 visual policy 정본이지만 readiness hard gate가 아니다.
3. shared surface를 global 특례로 확장하면 member/cap/fan-out 의미가 흐려진다.
4. typed path declaration만 믿으면 `src/api/**`, `package.json`, ordinary route를
   shell-host/route-host라고 적어 새 physical authority를 만들 수 있다.
5. malformed shell declaration을 index에서 제거하면 broad `src/**`가 우회한다.
6. no-API shell이 API maturity에 도달하면 host와 candidate가 모두 닫힐 수 있다.
7. optional/required role을 eager resolve하면 no-shell/no-API custom layout을 깨뜨리고,
   전역 resolver를 완화하면 기존 fail-closed invariant를 깨뜨린다.

---

## 4. Goals

- readiness maturity와 현재 작업 종류의 권한을 분리한다.
- hard-trusted current visual evidence에 바인딩된 refresh만 허용한다.
- historical input을 재사용 가능한 bearer capability로 만들지 않는다.
- API wiring 중 screen 불변을 tool-level invariant로 유지한다.
- app shell을 route-less/global 1급 implementation target으로 만든다.
- shell declaration은 semantic owner가 되되 physical authority는 policy/layout이 소유한다.
- no-API shell host authority를 API maturity에서도 보존한다.
- malformed owner가 다른 target의 authority를 넓히지 않게 한다.
- shell Open Decision이 shell만 cap하도록 한다.
- no-intent/no-shell compatibility를 보존한다.
- #222와 #223 구현을 독립 PR로 분리한다.

---

## 5. Non-goals

- mode order 변경 또는 scalar `visual-refresh` mode 추가
- reached-mode path union
- timestamp/file name만으로 intent 자동 추론
- evidence bypass flag
- path 문자열 기반 deny 삭제
- v1/summary-only register를 capability evidence로 사용
- doctor/visual warning 전체를 global hard CI로 승격
- app-shell declaration만으로 arbitrary physical root 생성
- broad default shell host/route root 제공
- cross-lineage supersession edge를 자동 추론
- historical input file 수정/backfill 강요
- #224 decision-log 계약
- Open Decision table column 변경
- consumer migration 자동 실행
- Open Decision resolve/confirmed promotion
- dependency/release/version/tag 변경

---

## 6. Terminology

| Term | Meaning |
|---|---|
| maturity | 사실과 decision cap이 허용하는 진행 상태 |
| work intent | 호출자가 명시하는 현재 작업 종류 |
| intent evidence | code capability를 허용하는 trusted current provenance |
| input artifact trust | Input Result Contract hard validity |
| reconciliation trust | Contract v2 register/input/group/projection hard validity |
| visual target key | exact current visual provenance row를 식별하는 normalized key |
| current evidence set | current target artifact가 지금 참조하는 input IDs |
| screen visual revision | selected screen current evidence set의 최신 trusted timestamp |
| target-provenance stale | 더 최신 trusted item이 있으나 current target provenance에 반영되지 않은 상태 |
| source lineage | source-specific producer가 발급한 logical replacement stream key |
| lineage transition | legacy unset 또는 source move를 새 current target provenance로 전환하는 audit record |
| map structure trust | Screen Source Map global frontmatter/table structural trust |
| alias relation state | authorizing, acknowledged-non-authorizing, conflicting 중 하나 |
| deny claim | path, authored token, origin, class, overrideability를 보존한 deny |
| typed path declaration | app shell semantic kind와 narrow reservation claim |
| kind root | policy target profile이 layout role로 해소하는 physical ceiling |
| required-on-use root | 해당 kind declaration/candidate가 실제 존재할 때만 필수인 root |
| deny-only ownership | positive authority 없이 다른 target만 차단하는 recoverable claim |
| no-API host envelope | no-API shell이 API maturity에서도 host를 유지하는 profile |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. Intent는 explicit하며 evidence bypass가 없다.
4. Input Result Contract와 Reconciliation v2 hard trust를 모두 요구한다.
5. Selected input은 trusted graph leaf이자 current visual revision evidence여야 한다.
6. Historical reconciliation item만으로 permission을 만들지 않는다.
7. Current target provenance가 selected input을 참조하지 않으면 deny한다.
8. 더 최신 trusted same-screen visual item이 provenance에 반영되지 않으면 모두 deny한다.
9. Cross-lineage/legacy transition은 graph edge를 발명하지 않고 current provenance로 처리한다.
10. Source alias는 authorizing map relation 없이는 scope를 만들지 않는다.
11. Normal split/ambiguous alias는 relation-local non-authorizing이며 unrelated relation을 닫지 않는다.
12. Intent는 base allowed union이 아니다.
13. Deny는 claim 단위로 판정한다.
14. Same path에 non-waivable claim 하나라도 남으면 deny한다.
15. Tier3/custom/generated/other-owner/candidate deny는 waive하지 않는다.
16. Forward와 backstop은 동일 helper/context를 소비한다.
17. Packet/Report는 provenance를 재계산하지 않는다.
18. Shell declaration은 physical authority를 스스로 만들지 않는다.
19. Positive shell authority는 trusted root binding 안에서만 가능하다.
20. `route-host`는 exact `app_shell_route_host` 안에서만 가능하다.
21. Optional/required-on-use roots는 target-profile에서 lazy resolve한다.
22. Ordinary undefined role은 계속 LayoutConfigError다.
23. Malformed owner declaration이 다른 target 권한을 넓히지 않는다.
24. No-API shell은 host를 유지하지만 hook/API/candidate authority를 얻지 않는다.
25. Intent 없는 기존 실행은 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode allowed union | reject | task kind와 API screen invariant 구분 불가 |
| API mode screen forbid 제거 | reject | 모든 API wiring에 screen mutation 개방 |
| scalar visual-refresh mode | reject | maturity와 task kind 재혼합 |
| evidence 없는 explicit intent | reject | caller discipline만 남음 |
| historical item trust only | reject | current target provenance를 증명하지 못함 |
| graph leaf only | reject | missing supersedes/cross-lineage newer input을 놓침 |
| target-current provenance + revision index | adopt | authored current source와 later item drift를 함께 검사 |
| input files lineage backfill | reject | input immutability 위반 |
| lineage transition record + current provenance | adopt | legacy/source move를 append-only로 처리 |
| global duplicate-alias failure | reject | valid split가 unrelated alias capability까지 닫음 |
| structure trust + relation-local state | adopt | blast radius 최소화 |
| typed shell declaration alone | reject | arbitrary physical authority 생성 |
| declaration ∩ kind root | adopt | semantic owner와 policy authority 분리 |
| route-host → route_entry | reject | ordinary route까지 broad authority |
| exact app_shell_route_host | adopt | host boundary만 명시적으로 개방 |
| eager required api_client root | reject | no-API/custom layout을 불필요하게 깨뜨림 |
| required-on-use lazy root | adopt | 실제 API surface 사용 때만 fail closed |
| shared-surface global scope | reject | member/cap/fan-out 의미 훼손 |
| dedicated app-shell-spec | adopt | narrow target identity와 gate |

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

Intent가 있어도 top-level `readiness_mode`, `next_mode`, `allowed_paths`,
`forbidden_paths`, `blocking`, `next_actions`는 base maturity 의미를 유지한다.
Intent 결과는 별도 `work_intent`에 둔다.

### 9.3 Intent prerequisite

```text
intent_prerequisite_pass =
  fact_idx >= index(final-fixture-ui)
  AND decision_cap_idx >= index(final-fixture-ui)
  AND target lifecycle/structure valid
```

Final-level blocker는 visual refresh를 막고 API-only higher blocker는 불필요하게 막지 않는다.

### 9.4 Effective path profile

Maturity와 effective path profile은 별도다. `api_required:false` app shell은
`api-integrated-ui|production-ready`에서도 `no-api-host` profile을 사용할 수 있다.

---

## 10. Decision D2 — Explicit Work Intent와 Current Evidence Trust

### 10.1 Public contract

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260814-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

First slice에서 `visual-refresh`는 screen selector에만 허용한다. Figma mapping 존재,
최근 timestamp, filename, current mode만으로 자동 활성화하지 않는다.

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

`input_artifact_trusted=true`는 현재 검사 11 hard contract 전체가 통과할 때만 가능하다.
`validateInputArtifacts()`는 analyzer 결과를 기존 diagnostics shape/order로 투영한다.
Readiness는 message 문자열을 재파싱하지 않는다.

Additive optional fields:

```yaml
source_lineage: figma-screen://file/abc123/CREATE-ATTACH
lineage_transition:
  from_input: IN-20260701-figma-001
  reason: legacy-lineage-adoption   # legacy-lineage-adoption | source-move
```

`source_lineage`와 `lineage_transition`은 capability freshness용이다. 일반 no-intent input
validity를 소급해 깨지 않는다.

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
    visual_items
  }
}
```

Register, selected summary, selected group, projection, refs/routing/provenance가 hard-valid해야
한다. Selected visual group은 다음을 만족한다.

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

`structure_trusted=true` 조건:

- canonical `_meta/screen-source-map.md`
- parseable frontmatter
- `artifact_id: screen-source-map`
- `artifact_type: screen-source-map`
- exactly one canonical table
- exact unique 10-column header
- unique Canonical Screen ID row
- each row's ScreenSpec path/route/status structurally valid

Canonical header:

```text
Canonical Screen ID | Domain | Route | ScreenSpec Path | Planning IDs |
Design IDs | Figma Node IDs | Source Inputs | Mapping Status | Decision / Notes
```

`Source Inputs`는 provenance이며 screen alias index에는 넣지 않는다.

### 10.5 Relation-local alias states

Alias key는 namespace를 포함한다.

```text
planning:<token>
design:<token>
figma-node:<token>
```

각 alias는 다음 state 중 하나다.

```text
authorizing
acknowledged-non-authorizing
conflicting
```

Rules:

- exactly one `confirmed|merged` canonical relation → `authorizing`
- multiple rows and every row status is `split|ambiguous` →
  `acknowledged-non-authorizing`
- one-canonical `candidate|deprecated|split|ambiguous` →
  `acknowledged-non-authorizing`
- multiple different canonical rows with any `confirmed|merged`, or mixed contradictory states →
  `conflicting`
- duplicate alias within one row → `conflicting`

A relation-local non-authorizing/conflicting alias does not set global structure trust false.
Unrelated authorizing aliases remain usable.

Canonical-ID ↔ source-alias collision is token-local:

```text
canonical token C exists
AND C is source alias for another canonical screen
→ namespace_index[C] = conflicting
→ direct canonical and legacy alias interpretation of C both denied
```

Other tokens remain usable.

### 10.6 Scope resolution

Effective `affected_screens` uses canonical field first, then valid deprecated alias.

- active canonical Screen ID exact match → direct relation, unless namespace collision
- `raw:planning/...`, `raw:design/...`, `raw:figma-node/...` → matching alias namespace only
- legacy unprefixed alias → exact token search; multiple namespaces/canonical rows is ambiguous

```text
scope_allows(screen) =
  direct canonical relation
  OR authorizing source-map relation
```

Trusted exact visual target relation remains separately required. Raw token itself never grants
permission.

### 10.7 Visual target keys

Every selected visual effect row must resolve to an exact capability target key.

```text
mapping:<artifact_id>/<mapping-key>
visual-family:<artifact_id>/<family-key>
screen-visual:<screen-spec-artifact-id>/<section-slug>
```

Capability precision:

- Figma mapping target must include exact Mapping Key (`M-...`). Whole artifact/section is
  insufficient for capability, although it may remain valid general reconciliation routing.
- Visual family target must include exact Family row key.
- ScreenSpec target must include one of the visual-allowed sections and have a matching current
  Visual Evidence row.

### 10.8 Current authored provenance contracts

#### A. Figma mapping

Current evidence comes from exact `## Mapping Provenance` row.

```text
Mapping Key == target mapping key
Evidence is a valid input evidence ref
Evidence input == selected input
Source Ref/Unit/Captured At row remains hard-valid
```

If multiple Mapping Provenance rows exist for one Mapping Key, target is ambiguous and denied.

#### B. Visual family

Current evidence comes from exact `Screen Families` row `Evidence` cell. Capability grammar is a
semicolon-separated list of canonical `input:<input_id>[#section[/bullet]]` refs. Placeholder,
free prose, unresolved or duplicate refs make that family relation non-authorizing.

The row must uniquely contain selected screen in `Member Screens` and selected input in its current
evidence set.

#### C. ScreenSpec visual section

First implementation slice adds an optional exact table. Without it, ScreenSpec visual section may
remain a valid reconciliation target but cannot by itself authorize `visual-refresh`.

```markdown
## Visual Evidence

| Section | Evidence | Captured At | Status |
|---|---|---|---|
| ui-sections | input:IN-...#extracted-facts/01 | inherit | current |
```

Contract:

- exact header and one table
- Section is a visual-allowed ScreenSpec section slug
- one `current` row per section
- Evidence resolves to canonical input
- Captured At is RFC3339 or `inherit`
- duplicate current row or unresolved evidence → relation denied

This table is capability-specific provenance. It does not make ScreenSpec the Figma visual detail
source or alter behavior ownership.

### 10.9 Current evidence set and screen visual revision

For selected screen, collect all current authored provenance refs from exact target keys that
resolve to that screen.

```text
current_evidence_set(screen) =
  active mapping provenance inputs
  ∪ current visual-family row inputs for families containing screen
  ∪ current ScreenSpec Visual Evidence inputs
```

Every referenced input must be unique and Input Result Contract-trusted. Its effective timestamp is
that input's `captured_at`; target row timestamps cannot override input identity freshness.

```text
current_visual_revision_at(screen) =
  max(captured_at of current_evidence_set(screen))
```

Selected input must satisfy:

```text
selected input ∈ current_evidence_set(screen)
AND selected input captured_at == current_visual_revision_at(screen)
AND selected target key explicitly references selected input
```

Multiple inputs at the same maximum timestamp are allowed only when all are current refs and their
exact target keys are non-conflicting. Same target key with different equal-time inputs is
ambiguous and denied.

This coarse screen revision is intentional: `visual-refresh` opens the screen/domain-component
surface, so an older visual input cannot unlock the whole screen merely because one old mapping row
still exists.

### 10.10 Later trusted item drift detection

Build an index from all Input Result-trusted and Reconciliation-trusted visual groups.

```text
latest_trusted_item_at(screen) =
  max(effective input captured_at for trusted visual items resolving to screen)
```

If:

```text
latest_trusted_item_at(screen) > current_visual_revision_at(screen)
```

then the target artifacts have not incorporated the newest trusted visual evidence.

```text
target_provenance_state = stale
intent permission = 0 for every input
next action = reconcile/update current visual target provenance
```

This catches a later same-target input with missing `supersedes`, a source move to another lineage,
and a new visual item whose artifact provenance was not updated.

### 10.11 Supersession graph trust

Graph edge:

```text
successor -> predecessor
where successor.frontmatter.supersedes == predecessor.input_id
```

Every edge used for capability must satisfy:

```text
successor.captured_at > predecessor.captured_at
successor.source_type == predecessor.source_type
successor.source_lineage == predecessor.source_lineage
```

`source_lineage` is a logical replacement stream, not merely a source container. Recommended Figma
shape includes stable source-screen identity:

```text
figma-screen://file/<file-key>/<stable-source-screen-key>
```

A bare file key is too coarse because one Figma file may contain independent screen streams.
Generic kit never derives lineage from `source_ref`, file name, input ID or `captured_by`.

Component trust also requires unique nodes, frontmatter/Summary parity, no self edge, acyclic graph,
and at most one direct successor per predecessor.

Graph leaf is necessary but not sufficient; §10.9–10.10 current target checks are also required.

### 10.12 Legacy lineage adoption and source move

Input artifacts are immutable. Do not backfill `source_lineage` into a historical input.
Do not create cross-lineage or missing-lineage `supersedes` edges merely to retire an old token.

Use an append-only transition on the new input:

```yaml
source_lineage: figma-screen://file/new-file/CREATE-ATTACH
lineage_transition:
  from_input: IN-OLD
  reason: source-move   # or legacy-lineage-adoption
```

Transition contract:

- `from_input` exists and is older
- new input is Input Result/Reconciliation trusted
- both inputs resolve to the same canonical screen
- new input has exact current target provenance under §10.8
- new input is current screen revision under §10.9
- `lineage_transition` is audit provenance, not a graph edge and not an authority source by itself

Effects:

- historical lineage-free or old-lineage input becomes non-current because current target
  provenance/revision moved to the new input
- old input cannot be used as fallback
- subsequent captures in the new lineage may use normal `supersedes`

This avoids permanent migration deadlock while preserving strict same-lineage graph edges.

### 10.13 Final evidence formula

```text
intent_evidence_valid =
  selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND scope_allows(selected_screen)
  AND selected_target_key_trusted
  AND selected_input_referenced_by_current_target
  AND selected_input_is_current_screen_revision
  AND target_provenance_state == current
  AND supersession_component_trusted
  AND selected_input_is_graph_leaf_or_isolated
```

Isolated input may omit lineage, but still must be current target evidence and current screen
revision. Therefore an old isolated input cannot remain reusable after a later target-current input
appears.

### 10.14 Authorization context

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
    current_visual_revision_at: "2026-08-14T10:00:00+09:00"
    target_keys:
      - key: mapping:CREATE-ATTACH-figma-component-mapping/M-012
        current_evidence: input:IN-20260814-figma-003#extracted-facts/02
    scope_resolution:
      kind: source-map
      alias: design:J010
      relation_state: authorizing
      canonical_screen_id: CREATE-ATTACH
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

Projected string이 아니라 actual claim object를 테스트한다.

### 11.4 Positive envelope

```text
intent candidates =
  resolve({roles.screen})
  ∪ resolve({roles.domain_component})
```

Hook/API-client, candidate, delegated shared, valid/deny-only shell reservation, generated,
other-owner paths는 non-waivable deny claim이다.

### 11.5 Formula

```text
matching_claims = all matching deny claims
waived_claims  = exact-waivable claims
active_denies  = matching_claims - waived_claims

allowed =
  intent applicable
  AND positive candidate match
  AND active_denies is empty
```

### 11.6 Output stability

Top-level base path arrays를 intent-specific 값으로 교체하거나 합치지 않는다. No-intent
output에는 `work_intent` key를 추가하지 않는다.

---

## 12. Decision D4 — App Shell Artifact Model과 Physical Roots

### 12.1 Artifact and identity

```text
docs/frontend-workflow/app/shells/{shell}/shell-spec.md
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
```

Required frontmatter: `artifact_id`, `artifact_type`, `shell_id`, `status`.
Optional: `implementation_paths`, `decision_refs`, `api_required`, sources/dependencies/review.

Forbidden identity: `domain`, `member_screens`, `screen_id`, `route`, `route_entry`,
`screen_entry`, `surface_refs`, `member_surfaces`.

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
Typed declaration owns semantic kind and narrow reservation provenance, not physical permission.

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

`required-on-use` means the role is mandatory only when an app-shell API-client declaration or
candidate actually consumes that kind. It does not mean every app shell must resolve `api_client`.

### 12.4 Layout bindings

Consumer example:

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

`app_shell_route_host` accepts exact files only. `src/app/**` or terminal `/**` is invalid.
Default Expo preset does not synthesize broad shell roles.

### 12.5 Target-profile root resolver

```text
resolveTargetProfileRoot({layout, profile, kind, usage}) -> {
  state: unused | bound | optional-unbound | required-on-use-unbound | invalid,
  globs,
  role,
  reason
}
```

Resolver invocation is lazy.

- no app-shell artifact → no target-root lookup
- no declaration/candidate of a kind → state `unused`, no role lookup
- optional kind used but role missing → `optional-unbound`, permission 0, readiness exit 0
- api-client declaration/candidate used but role missing → `required-on-use-unbound`,
  target contract error + permission 0; readiness keyed result remains fail-closed
- ordinary mode/forbidden/screen/shared/candidate role resolution continues to use existing
  `resolvePaths`/`requireRole` and throws LayoutConfigError for undefined role

A no-API shell with route/shell-host only never resolves `api_client`.

### 12.6 Root binding

```text
root_binding(entry) =
  exactly one resolved root of entry.kind fully covers entry.path
  AND no different-kind root overlaps entry.path
```

States:

- zero root → kind-root-unbound
- multiple distinct roots → kind-root-ambiguous
- different-kind overlap → kind-contradiction
- valid unique root → positive authority candidate

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
| screen-skeleton | core sections + nonempty trusted root-bound host paths |
| rough-fixture-ui | state/non-route interaction complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API special case or valid actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.9 Normal path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | root-bound route-host |
| screen-skeleton | root-bound route-host/shell-host |
| rough/final | host kinds + valid owned active hook slices |
| api-integrated | valid owned active hook/API-client slices; host frozen |
| production-ready | root-bound host + valid active slices; unowned API surfaces denied |

### 12.10 No-API profile

```text
if api_required == false and readiness >= api-integrated-ui:
  effective_path_profile = no-api-host
```

Allowed: valid root-bound route-host/shell-host.
Denied: all hook/API-client/candidate plus generated/Tier3/custom/other-owner/contract claims.

No-API shell with no API entry/candidate does not resolve `api_client`; custom layout without that
role remains valid for host readiness.

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

- screen: existing domain/layout hook/API-client roles
- shared-surface: existing parser + generic conflict index
- app-shell hook: trusted root-bound typed hook parent
- app-shell API client: trusted root-bound typed api-client parent; this usage triggers
  required-on-use `api_client` resolution

### 13.3 Tracking

`unknown:U-...` resolves in the same owner artifact.

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
cross-target conflict, and no-API candidate paths preserve recoverable project-wide deny claims.

---

## 14. Decision D6 — Target-scoped Open Decisions

- canonical six-column global register reused
- app-shell `decision_refs`
- `open|resolved`; human-only resolve
- missing/ambiguous/malformed ref caps only that shell
- resolved ref remains provenance
- shell decision does not fan out to unrelated screens/shared member cap
- zero-ref global row remains valid and non-blocking

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

A. trusted typed + root-bound → normal ownership and positive candidate
B. invalid but safely canonicalizable → deny-only ambiguous shell ownership
C. no trustworthy project-relative target → no physical claim + hard error

Recoverable includes missing kind, root-unbound, required-on-use-unbound, kind contradiction,
duplicate/overlap, duplicate identity and safe aliases. Absolute/drive/UNC/root escape/arbitrary
wildcard/blanket/missing path are nonrecoverable.

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

Valid and deny-only shell reservations project to every screen/shared/other-shell context.
Broad `src/**` cannot bypass them.

```text
authorized(file) =
  positive target/profile match
  AND valid root binding
  AND no active ownership/generated/candidate/contract deny
```

---

## 16. Public CLI Contract

Selectors:

```text
--screen <SCREEN_ID>
--surface <SURFACE_ID>
--app-shell <SHELL_ID>
```

Mutually exclusive.

Visual intent requires `--screen`, `--intent visual-refresh`, `--input`. Unknown/blank intent,
intent without input, input without intent, selector conflicts, malformed IDs or noncanonical
`--path` are exit 2.

Evidence/currentness/root failure is a keyed `applicable:false` or path denial with exit 0 for
readiness. Existing ordinary undefined layout role remains configuration error/exit 2.

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
      - path: src/components/app-shell/host/**
        kind: shell-host
        root_binding:
          state: bound
          role: app_shell_host
          root: src/components/app-shell/host/**
    target_root_states:
      api-client:
        state: unused
    ownership_claims: []
    deny_only_ownership: []
```

Invalid recoverable record retains deny-only claims. Duplicate identity never first-wins.

### 17.2 Evidence indexes

Readiness may load analyzers directly. If state serializes current evidence or trust indexes, it
must include deterministic source hashes and reject stale generated trust when inputs/register/
target artifacts differ.

Recommended additive summary:

```yaml
visual_evidence:
  CREATE-ATTACH:
    current_revision_at: "2026-08-14T10:00:00+09:00"
    current_inputs: [IN-20260814-figma-003]
    provenance_state: current
```

### 17.3 Determinism

Sort target IDs, source paths, target keys, input IDs, claims and diagnostics. Existing
`screens`/`surfaces` shapes remain additive-compatible.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Valid current visual intent

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260814-figma-003",
      "applicable": true,
      "evidence": {
        "input_artifact_trusted": true,
        "reconciliation_trusted": true,
        "graph_leaf": true,
        "current_target": true,
        "current_visual_revision_at": "2026-08-14T10:00:00+09:00",
        "target_provenance_state": "current",
        "target_keys": [
          "mapping:CREATE-ATTACH-figma-component-mapping/M-012"
        ]
      },
      "allowed_paths": [
        "src/features/create/screens/**",
        "src/features/create/components/**"
      ],
      "waived_claims": [
        "deny:mode-policy:api-integrated-ui:screen:0"
      ]
    }
  }
}
```

### 18.2 Historical input not current

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-OLD",
      "applicable": false,
      "evidence": {
        "graph_leaf": true,
        "current_target": false,
        "current_visual_revision_at": "2026-08-14T10:00:00+09:00",
        "selected_captured_at": "2026-08-01T10:00:00+09:00"
      },
      "next_actions": [
        "use current visual evidence input IN-NEW"
      ]
    }
  }
}
```

### 18.3 Target provenance stale

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-NEW",
      "applicable": false,
      "evidence": {
        "target_provenance_state": "stale",
        "latest_trusted_item_at": "2026-08-14T11:00:00+09:00",
        "current_visual_revision_at": "2026-08-14T10:00:00+09:00"
      },
      "next_actions": [
        "update current mapping/family/ScreenSpec visual provenance"
      ]
    }
  }
}
```

### 18.4 Relation-local split map

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

### 18.5 No-API shell without api_client role

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

### 18.6 Used API kind with missing root

```json
{
  "MAIN-SHELL": {
    "allowed_paths": [],
    "path_authorization": [
      {
        "path": "src/api/app-shell/**",
        "kind": "api-client",
        "allowed": false,
        "causes": [
          {"kind": "required-on-use-root-unbound", "role": "api_client"}
        ],
        "owner_state": "deny-only"
      }
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
- Screen Source Map structure + relation-local capability
- strict visual family
- current target provenance and screen visual revision
- supersession graph and lineage transition
- app-shell typed paths/root binding
- ownership/deny claims

Validate adapters preserve existing public diagnostics and warning-first boundaries.

### 19.2 Authorization order

```text
1 concrete path canonicality
2 target/lifecycle/contract validity
3 input artifact trust
4 reconciliation trust
5 scope relation
6 exact visual target key
7 current target provenance
8 current screen visual revision / stale-target check
9 supersession graph leaf/transition trust
10 intent prerequisite or base readiness
11 target-root lazy resolution
12 no-API profile selection
13 positive profile match
14 ownership/generated/candidate denies
15 claim waiver
16 remaining deny precedence
17 structured provenance
```

### 19.3 Diff backstop

Forward and diff consume the same authorization context. `workflow:forbidden-paths` visual context
requires `--input`; app-shell context uses the same lazy root states and deny-only reservations.

### 19.4 Packet/Report

Copy, never recompute:

- input/reconciliation trust
- scope relation
- target keys/current evidence refs
- current visual revision and stale-target state
- graph leaf/lineage transition
- target root states/bindings
- waived/active deny claims
- owner state

### 19.5 Warning-first boundary

General Screen Source Map doctor and visual-consistency diagnostics remain warning-first.
Capability analyzers only deny their use as authorization evidence; they do not globally promote
those commands to hard required CI.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input result contract | analyzer trust, source_lineage, lineage_transition |
| input reconciliation | v2 trust, visual target keys, currentness index |
| figma mapping | exact Mapping Provenance current evidence semantics |
| visual consistency | family Evidence input-ref grammar |
| ScreenSpec | optional exact Visual Evidence table |
| screen identity | structure/relation-local source-map capability |
| project layout | shell route/host/hook roles and lazy resolver |
| implementation policy | target-profile root presence/resolution |
| app-shell reference | typed paths, roots, no-API, recovery |
| Open Decisions | shell referrer scope |
| shared surfaces | shell reservation separation |
| Stage 05/06/08 | author, implement, validate/report |
| commands | intent/input/shell examples |
| implement-screen | current evidence only; read current target artifacts |
| implement-app-shell | root-bound readiness only |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| v1/summary-only | visual intent permission 0 |
| input artifact hard-invalid | permission 0 |
| current trusted input | may authorize |
| graph leaf but not current target evidence | permission 0 |
| later trusted item not reflected in target | all inputs permission 0 until provenance update |
| legacy lineage-free isolated current input | allowed if current revision |
| lineage-free input followed by transition input | old denied; new may authorize |
| cross-lineage source move | no cross-lineage graph edge; current provenance transitions |
| acknowledged split alias + unrelated confirmed alias | confirmed alias remains authorizing |
| conflicting alias token | only that token denied |
| no source map + direct canonical scope | works unless token collision is known |
| no app-shell | no new required key/file/root lookup |
| no-API host shell without api_client role | host readiness works |
| API-client kind used without api_client role | target-local fail closed/deny-only |
| ordinary undefined policy role | existing LayoutConfigError |
| missing optional shell role | target-local permission 0 |
| old state reader | ignores additive keys |
| warning-first surfaces | no automatic promotion |

No new required CI check, dependency, release/version/tag.

---

## 22. Migration

### 22.1 #222

1. Create immutable canonical input.
2. Ensure Input Result Contract hard-valid.
3. Use logical `source_lineage` for new replacement streams.
4. Reconcile under Contract v2 with exact visual target key.
5. Update current mapping/family/ScreenSpec visual provenance in the same reconciliation change.
6. Resolve scope through canonical ID or authorizing source-map relation.
7. Ensure selected input is graph leaf/isolated and current screen visual revision.
8. Run readiness with `--intent` + `--input` and concrete paths.
9. Run validate/backstop and copy provenance to report.

Legacy lineage-free predecessor:

- do not edit old input
- create new lineage-bearing input
- set `lineage_transition.from_input` and reason
- do not create an invalid missing-lineage supersession edge
- update current target provenance to new input
- old input becomes non-current and cannot authorize

Source move uses the same process with reason `source-move`.

### 22.2 #223

1. Preserve existing decision rows.
2. Add app-shell-spec draft.
3. Add exact/covered shell role bindings only for used kinds.
4. Declare typed paths inside roots.
5. No-API host-only shell need not define/resolve `api_client`.
6. Link decision refs and regenerate state.
7. Check shell/screen/shared concrete paths.
8. Validate and run target-aware backstop.

Malformed recoverable paths remain deny-only until fixed.

---

## 23. Implementation Slices

### 23.1 Slice A — Issue #222

Scope:

- Input Result Contract trust analyzer
- Reconciliation v2 trust analyzer
- visual target key resolver
- Figma mapping/family/ScreenSpec current provenance resolvers
- current screen visual revision and stale-target index
- strict Screen Source Map structure + relation states
- supersession graph/source lineage/lineage transition
- deny claims and evidence-bound visual-refresh
- CLI/backstop/packet/report parity

Explicit exclusions: app-shell artifact/parser/schema/template, shared-surface semantic changes,
#224 decision-log.

Acceptance:

- no-intent compatibility
- hard-valid current target evidence only
- old graph leaf not current target is denied
- later trusted unprojected item blocks all authorization
- canonical or authorizing alias scope only
- screen/domain-component only
- Tier3/candidate/delegated/generated denied

### 23.2 Slice B — Issue #223

Depends on Slice A authorization substrate.

Scope:

- app-shell artifact/template/schema/manifest
- target-profile root slots and lazy resolver
- exact app_shell_route_host, optional host/hook, required-on-use api_client
- typed path/root binding
- no-API host envelope
- generic candidate owner
- valid/deny-only ownership index
- state/readiness/validate/backstop
- skill/docs/distribution/migration

Acceptance:

- declaration alone creates no physical authority
- no-API host-only custom layout works without api_client role
- used API kind without root fails closed
- outside-root/contradictory paths denied and reserved
- ordinary undefined role behavior unchanged
- unrelated target cannot edit shell path

### 23.3 No Slice 0

Shared helpers ship with Slice A behavior; no abstraction-only PR.

---

## 24. File Impact Map

### Slice A

| Area | Expected files |
|---|---|
| input | `scripts/lib/input-artifact.mjs`, producer/schema/template/tests |
| reconciliation | `scripts/lib/reconciliation-items.mjs`, target/provenance helpers/tests |
| current evidence | mapping-provenance, visual-consistency, ScreenSpec visual-evidence helper |
| identity | `screen-source-map.mjs` strict capability analyzer/tests |
| core | readiness/path authorization |
| backstop | forbidden-paths |
| execution | packet/report |
| docs/skills | input/visual references, implement-screen, Stage 06/08, commands |

### Slice B

| Area | Expected files |
|---|---|
| layout/policy | project-layout schema/profile, target root slots/resolver |
| artifact | app-shell template/schema/manifest/reference/skill |
| analyzer/state | shell analyzer, workflow-state |
| authorization | root binding, no-API, ownership/readiness |
| candidate | generic owner/tracking/conflict |
| validate/backstop | structural/root/ownership checks |
| distribution | pack/upgrade tests |
| docs | stages, matrix, ownership, migration |

---

## 25. Verification Matrix

### 25.1 #222

| # | Regression |
|---|---|
| 1 | no intent keeps API screen forbidden |
| 2 | valid current trusted input opens screen/domain component only |
| 3 | invalid intent/input CLI combinations exit 2 |
| 4 | v1/summary-only denied |
| 5 | malformed Summary/Items denied |
| 6 | RR/RP hard-invalid selected group denied |
| 7 | Effect outside update/create denied |
| 8 | projection mismatch denied |
| 9 | unrelated input RR error isolated |
| 10 | invalid input_type/source_type denied |
| 11 | missing required input field denied |
| 12 | invalid captured_at denied despite item timestamp |
| 13 | invalid supersedes reference denied |
| 14 | duplicate input_id denied |
| 15 | direct canonical affected screen accepted |
| 16 | canonical scope excluding selected denied |
| 17 | raw alias + authorizing confirmed relation accepted |
| 18 | raw alias + one-canonical merged relation accepted |
| 19 | candidate alias non-authorizing |
| 20 | acknowledged split alias non-authorizing |
| 21 | acknowledged ambiguous alias non-authorizing |
| 22 | split alias does not close unrelated confirmed alias |
| 23 | conflicting confirmed alias token denied only locally |
| 24 | canonical-ID/alias collision token denied |
| 25 | malformed map structure denies alias capability globally |
| 26 | duplicate canonical row makes structure untrusted |
| 27 | exact mapping key current Evidence accepted |
| 28 | mapping whole artifact/section insufficient |
| 29 | duplicate Mapping Provenance key denied |
| 30 | exact family row current Evidence accepted |
| 31 | family free-prose/unresolved Evidence denied |
| 32 | exact ScreenSpec visual section + current Visual Evidence accepted |
| 33 | ScreenSpec visual section without current pointer denied |
| 34 | selected input absent from current target provenance denied |
| 35 | selected input referenced but older than screen current revision denied |
| 36 | later same-target input without supersedes denies old input |
| 37 | same screen moved to new lineage denies old input |
| 38 | later trusted item absent from target provenance makes target stale |
| 39 | stale target denies both old and new until provenance update |
| 40 | equal-time same target conflicting inputs denied |
| 41 | equal-time disjoint current target inputs deterministic |
| 42 | superseded trusted input denied |
| 43 | latest same-lineage trusted leaf accepted |
| 44 | latest incomplete input blocks old fallback |
| 45 | reversed timestamp edge denied |
| 46 | equal timestamp edge denied |
| 47 | cross-source edge denied |
| 48 | same source_type different lineage edge denied |
| 49 | missing endpoint lineage edge denied |
| 50 | lineage key includes logical source-screen stream, not bare file inference |
| 51 | isolated lineage-free input current target accepted |
| 52 | legacy lineage transition updates target and denies old |
| 53 | cross-lineage source-move transition denies old without invalid edge |
| 54 | transition record alone without current target update denied |
| 55 | cycle denied |
| 56 | branch denied |
| 57 | Summary/frontmatter supersedes mismatch denied |
| 58 | final-level decision blocks intent |
| 59 | API-only higher blocker does not block final visual work |
| 60 | absorbed/malformed lifecycle denied |
| 61 | delegated/shared/shell reservations denied |
| 62 | candidate paths denied |
| 63 | exact deny claim waiver succeeds |
| 64 | same-path Tier3 deny remains active |
| 65 | forward/backstop use same currentness/map/claims |
| 66 | packet/report copies target currentness and transition provenance |
| 67 | legacy no-intent fixtures compatible |

### 25.2 #223

| # | Regression |
|---|---|
| 1 | no app-shell artifact no-op and no root lookup |
| 2 | valid identity/state deterministic |
| 3 | shell decision caps shell only |
| 4 | malformed decision fails shell only |
| 5 | local Open Decisions rejected |
| 6 | forbidden identity fields rejected |
| 7 | string-only/missing kind denied |
| 8 | exact app_shell_route_host accepted |
| 9 | ordinary route file route-host denied |
| 10 | route file without ScreenSpec not adopted by declaration |
| 11 | existing ScreenSpec route_entry conflict denied |
| 12 | broad app_shell_route_host root rejected |
| 13 | explicit app_shell_host root accepted |
| 14 | missing app_shell_route_host gives permission 0/exit 0 |
| 15 | missing app_shell_host gives permission 0/exit 0 |
| 16 | missing app_shell_hook gives permission 0/exit 0 |
| 17 | no-API host-only layout without api_client role works |
| 18 | unused api-client slot does not resolve role |
| 19 | API-client declaration triggers required-on-use resolution |
| 20 | API Candidate triggers required-on-use resolution |
| 21 | used API kind + missing api_client gives permission 0/deny-only |
| 22 | ordinary policy undefined role remains LayoutConfigError/exit 2 |
| 23 | src/api declared shell-host contradiction/deny-only |
| 24 | package.json shell-host unbound/deny-only |
| 25 | another domain path cannot be acquired by declaration |
| 26 | overlapping kind roots invalid |
| 27 | broad host/hook roots rejected |
| 28 | valid same-shell candidate reaches API mode |
| 29 | candidate needs trusted root-bound parent |
| 30 | outside/wrong-kind/root-unbound candidate denied |
| 31 | required-on-use-unbound candidate deny-only |
| 32 | cross-target candidate conflict denied |
| 33 | deferred/invalid candidate deny-only |
| 34 | no-API candidate authority 0 |
| 35 | no-API API maturity preserves route/shell host |
| 36 | no-API denies hook/API/candidates |
| 37 | no-API production-ready still denies API surfaces |
| 38 | shell-screen overlap denied |
| 39 | shell-shared overlap denied |
| 40 | shell-shell overlap denied |
| 41 | valid shell path reserved from other targets |
| 42 | missing-kind path permission 0 and globally reserved |
| 43 | safely canonicalizable alias deny-only |
| 44 | absolute/drive/UNC/root escape no physical claim |
| 45 | duplicate identity preserves recoverable denies |
| 46 | overlapping entries preserve deny-only |
| 47 | production `src/**` cannot bypass |
| 48 | empty paths authoring valid, permission 0 |
| 49 | Tier3 deny overrides valid root binding |
| 50 | selector/ID errors exit 2 |
| 51 | deterministic state/readiness/root states |
| 52 | forward/backstop parity for lazy roots/no-API/recovery |
| 53 | distribution includes all active payload |

Implementation PRs also run existing fixture-hook, API deferral, shared-surface, Open Decision,
readiness fail-open/redteam, path-backstop, distribution and upgrade regressions.

---

## 26. Risks / Known Limits

1. Current screen revision is intentionally coarse because the intent opens whole screen paths.
2. Current target provenance requires template/parser additions and migration for capability use.
3. General mapping/family doctors remain warning-first; capability use is stricter.
4. `lineage_transition` is audit provenance, not a replacement for current target update.
5. A stale target blocks all inputs until reconciliation updates authored provenance.
6. Acknowledged split/ambiguous relation remains non-authorizing in first slice.
7. Required-on-use api-client missing is target-local fail closed; implementation must not silently
   weaken ordinary layout role errors.
8. Deny-only recovery may temporarily lock malformed paths.
9. Contextless diff cannot infer intended target and remains conservative.
10. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result Contract and Reconciliation v2 trust required |
| D4 | exact target key and current authored provenance required |
| D5 | selected input must be current screen visual revision |
| D6 | later unprojected trusted item marks target stale |
| D7 | source lineage is logical replacement stream |
| D8 | legacy/source move uses transition + current provenance, not invalid graph edge |
| D9 | source-map structure trust and relation-local states separated |
| D10 | acknowledged split/ambiguous does not poison unrelated aliases |
| D11 | deny claim top-level authored_path and exact waiver |
| D12 | visual profile is screen/domain-component only |
| D13 | dedicated optional app-shell-spec |
| D14 | typed declaration does not self-grant authority |
| D15 | exact optional app_shell_route_host |
| D16 | optional and required-on-use roots resolve lazily |
| D17 | ordinary undefined role fail-closed preserved |
| D18 | generic API Candidate owner |
| D19 | no-API shell uses no-api-host profile |
| D20 | recoverable invalid shell path remains deny-only |
| D21 | six-column Open Decision schema reused |
| D22 | global physical ownership namespace |
| D23 | #222 before #223 |
| D24 | no-intent/no-shell compatibility preserved |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다.

Implementation naming만 남는다.

- helper/module names
- diagnostic metadata field names
- app-shell skill/reference slug

다음은 별도 설계 변경 없이는 허용되지 않는다.

- historical input bearer capability
- graph leaf만으로 current 판단
- current target provenance bypass
- stale target에서 old fallback
- cross-lineage supersession edge 추론
- split relation 때문에 unrelated alias 전체 차단
- shell declaration-only physical authority
- route-host broad route_entry reuse
- eager unused api_client resolution
- ordinary undefined-role fail-closed 완화
- no-API hook/API authority
- malformed reservation 제거
- Open Decision schema 변경

Baseline에서 재검증한 계약:

- readiness/policy/layout and undefined-role behavior
- Input Result Contract and immutable input flow
- Reconciliation Contract v2 routing/provenance
- Mapping Provenance current Evidence
- Visual Consistency Screen Families Evidence
- Screen Source Map parser/doctor and split semantics
- shared surface/Open Decisions/candidate/path backstop
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
- target-current visual evidence and revision
- append-only lineage transition
- relation-local split/ambiguous handling
- required-on-use api-client root
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
