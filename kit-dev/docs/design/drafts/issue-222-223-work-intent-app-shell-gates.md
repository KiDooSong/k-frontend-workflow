# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; third review amendment applied; implementation not started
Issues: #222, #223
Date: 2026-08-14
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`main`, PR #225 merge 이후)
Implementation order: #222 → #223

> 이 문서는 설계만 확정한다. source code, test, policy YAML, schema, template,
> example, distributed payload를 변경하지 않는다. #221과 #224는 범위 밖이다.
>
> 첫 리뷰 amendment는 deny claim provenance, typed shell path taxonomy,
> target-aware API Candidate ownership, reconciled visual input evidence를 도입했다.
> 두 번째 amendment는 no-API shell envelope, Contract v2 input-local trust,
> exact visual-family membership, malformed shell path deny-only recovery,
> `claim.authored_path` canonical shape를 확정했다.
> 세 번째 amendment는 app-shell physical authority root, Input Result Contract trust,
> source-alias scope resolution, current unsuperseded input leaf를 확정한다.

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
5. evidence는 Reconciliation Contract v2 trust뿐 아니라 Input Result Contract
   per-input hard trust도 통과해야 한다.
6. selected input은 supersession graph의 current unsuperseded leaf여야 한다.
7. input의 canonical `affected_screens` 또는 authoritative Screen Source Map relation이
   selected screen scope를 증명해야 한다.
8. 모든 deny는 provenance-bearing claim으로 보존한다.
9. `visual-refresh`가 waive할 수 있는 것은 exact canonical work-step deny뿐이다.
10. `visual-refresh`는 screen/domain-component만 여는 독립 최소 권한 envelope다.
11. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
12. shell `implementation_paths`는 `path + kind` typed declaration이다.
13. typed declaration은 ownership/semantic 분류일 뿐 물리 권한이 아니다.
14. shell positive authority는 typed declaration과 policy/layout-owned kind root의
    교집합에서만 나온다.
15. API Candidate owner를 `{target_type, target_id}`로 일반화한다.
16. `api_required:false` shell은 API maturity에 도달해도 route/shell host 권한을
    유지하는 `no-api-host` profile을 사용한다.
17. malformed이지만 안전하게 canonicalize 가능한 shell path는 positive authority를
    만들지 않고 project-wide deny-only reservation으로 남긴다.
18. 기존 6-column Open Decision register와 `decision_refs`를 재사용한다.
19. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
    namespace를 사용하고 deny가 항상 우선한다.
20. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222 substrate를 소비하되
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
Item이 explicit provenance를 가졌더라도 input artifact 자체가 hard-invalid이면 그
artifact는 code authorization evidence가 될 수 없다.

### 2.5 Reconciliation Contract v2 trust

현재 v2 validator는 deterministic hard diagnostics와 advisory warnings를 계산한다.
내부적으로 canonical Summary trust와 `(Input ID, Item)` group trust를 사용하지만,
public 반환은 `{ errors, warnings }`다.

Readiness는 `workflow:validate` 선행 성공을 가정할 수 없다. 따라서 intent evidence를
위한 별도 Markdown 부분 parser는 금지하고, 기존 v2 분석을 trust-producing pure
analyzer로 추출한다.

### 2.6 Screen Source Map boundary

`screen-source-map.md`는 planning/design/Figma alias를 canonical Screen ID에 연결하는
optional register다. 일반 doctor surface는 warning-first다. 그러나 raw/source alias를
`visual-refresh` capability evidence로 사용할 때는 별도의 strict relation resolver가
필요하다.

Capability resolver가 strict하다는 사실은 doctor의 일반 warning-first exit contract를
hard gate로 승격하지 않는다. 오직 해당 input이 positive intent evidence가 되는 것을
fail closed한다.

### 2.7 Supersession boundary

Input artifact와 Reconciliation Register Summary는 모두 `supersedes` 관계를 표현한다.
현재 Input Result Contract는 target 존재와 self-reference를 검사하지만, visual intent
eligibility에 필요한 다음 사실은 별도다.

- selected input이 다른 input에 의해 superseded되지 않았는가
- frontmatter와 Summary의 `Supersedes`가 일치하는가
- graph가 acyclic인가
- 하나의 predecessor를 여러 newer input이 동시에 supersede하는 branch가 없는가
- newer input이 존재하지만 아직 reconcile되지 않은 경우 old input을 fallback으로
  재사용하지 않는가

이 설계는 capability-specific supersession trust를 추가한다.

### 2.8 Visual family parsing boundary

현재 visual-consistency parser는 `Screen Families` 표의 `Family`와 `Member Screens`를
실제로 파싱할 수 있다. generic reconciliation target index의 row-key 해소만으로는
family row가 target screen을 포함하는지 증명하지 못한다.

따라서 visual contract를 intent evidence로 사용할 때 strict family-membership resolver를
추가한다.

### 2.9 Shared surfaces

`shared-surface-spec`은 다음 의미를 가진다.

- 같은 domain의 canonical screen 최소 2개
- 명시적 `member_screens`
- member screen minimum readiness cap
- decision member fan-out
- non-route uniform behavior
- narrow `implementation_paths`

선언은 권한이 아니다. declared path가 policy와 모든 member screen의 교집합을
통과해야만 positive permission을 만든다. app shell도 같은 원칙을 사용하되 member
intersection 대신 target-specific kind root를 사용한다.

### 2.10 Open Decisions

canonical global home은 `docs/frontend-workflow/global/open-decisions.md`이고 row schema는
다음 6개 column이다.

```text
ID | Decision Needed | Options | Blocking Mode | Owner | Status
```

`decision_refs`가 target과 row의 관계를 소유한다. global row는 zero-ref여도 valid하고,
referrer가 없으면 어떤 target도 막지 않는다. `open → resolved`는 사람 전용이다.

### 2.11 Current API Candidate owner boundary

현재 API Candidate v2의 positive authorization과 conflict collection은 주로
ScreenSpec과 `screen_id`에 맞춰져 있다. Domain과 screen identity가 없는 app shell에는
그 규칙을 그대로 적용할 수 없다.

### 2.12 Existing fixes and remaining gaps

- #124는 `api_required:false` 화면의 non-API path 잠금을 해소했다.
- #210은 API Candidate v2 per-slice deferral과 ownership을 만들었다.
- #211은 fixture mode에서 owned hook slice를 열면서 API mode의 screen 불변을 유지했다.
- #222는 maturity와 작업 종류를 분리하는 authorization 축이 없는 문제다.
- #223은 shell target/path/decision owner가 없는 문제다.
- app shell에는 #124와 대칭인 no-API host preservation이 필요하다.
- typed shell path에는 shared-surface와 대칭인 외부 physical authorization ceiling이
  필요하다.

---

## 3. Reproduced Failure Modes

### 3.1 #222 — mature screen에 visual 작업 권한이 없음

공개 kit 기준으로 다음을 확인했다.

1. 선택된 mode 하나가 base path envelope를 소유한다.
2. `final-fixture-ui`에서는 screen/domain-component/hook이 열릴 수 있다.
3. `api-integrated-ui`에서는 hook/API-client가 열리고 screen이 forbidden이다.
4. 별도 visual task profile이 없다.
5. Open Decision을 reopen해 mode를 낮추면 maturity와 gate provenance를 거짓으로 만든다.
6. evidence 없는 `--intent`는 API 배선 작업의 screen deny 우회 capability가 된다.
7. flattened deny path에서 `{roles.screen}`을 삭제하면 Tier3/custom deny를 함께
   삭제할 수 있다.
8. RR/RP trust만 보면 Input Result Contract-invalid artifact가 evidence가 될 수 있다.
9. raw source alias를 canonical ID exact match로만 검사하면 reconciliation에서 identity가
   확정된 정상 input을 영구적으로 막는다.
10. superseded input을 막지 않으면 stale visual input이 reusable bearer capability가 된다.

따라서 work intent, source evidence, input/result trust, identity scope resolution,
supersession freshness, deny provenance가 함께 필요하다.

### 3.2 #223 — shell decision과 path owner가 없음

공개 kit 기준으로 다음을 확인했다.

1. `navigation-map`은 route topology 정본이지만 implementation target이 아니다.
2. `visual-consistency-contract`는 visual ownership 정본이지만 readiness hard gate가 아니다.
3. `shared-surface-spec`은 domain/member/member-cap/fan-out을 전제로 한다.
4. global register의 zero-ref row는 target을 막지 않는다.
5. state에 app shell index가 없다.
6. ordinary screen에는 global shell path를 예약할 owner가 없다.
7. 기본 layout role에는 app-shell host가 없다.
8. screen-centric candidate owner는 domainless shell candidate를 표현하지 못한다.
9. malformed shell declaration을 positive index에서 제거하면 `src/**`가 우회한다.
10. no-API shell이 API maturity에 도달하면 host와 candidate가 모두 닫힐 수 있다.
11. typed `kind`를 artifact만 믿으면 `src/api/**`, `package.json`, 다른 domain path를
    `shell-host`로 표기해 새 물리 권한을 만들 수 있다.

Typed declaration은 semantic/ownership claim이어야 하며 policy/layout-owned root보다
넓은 physical authority를 만들 수 없어야 한다.

---

## 4. Goals

- readiness maturity와 현재 작업 종류의 권한을 분리한다.
- hard-trusted current visual input에 바인딩된 refresh만 허용한다.
- API 배선 작업 중 screen 불변을 tool-level invariant로 유지한다.
- intent가 waive할 수 있는 deny와 절대 보존할 deny를 provenance로 구분한다.
- app shell을 route-less/global 1급 implementation target으로 만든다.
- shell path kind를 author가 명시하되 physical authority는 policy/layout이 소유한다.
- shell API Candidate를 generic target owner 모델에 연결한다.
- no-API shell이 API maturity에서 host path를 잃지 않게 한다.
- malformed shell owner가 다른 target의 authority를 넓히지 않게 한다.
- raw/source alias input scope가 authoritative map을 통해 canonical screen에 해소되게 한다.
- superseded input이 visual intent token으로 재사용되지 않게 한다.
- shell Open Decision이 해당 shell만 cap하도록 한다.
- no-adoption/no-intent repository의 기존 동작을 유지한다.
- #222와 #223 구현을 독립 리뷰 가능한 PR로 분리한다.

---

## 5. Non-goals

- `readiness_mode` order 변경
- 새 scalar mode 삽입
- reached-mode path union
- timestamp/source type만으로 intent 자동 추론
- evidence 없는 trusted override 또는 bypass flag
- path 문자열만 비교해 safety deny 삭제
- v1/summary-only register를 visual intent authority로 사용
- visual-consistency나 Screen Source Map doctor 전체를 hard CI gate로 승격
- app-shell-spec declaration만으로 임의 물리 root 생성
- default Expo preset에 broad app-shell host authority 자동 주입
- superseded input fallback
- #224 decision-log/supersession history 계약
- Open Decision table column 추가
- shared surface global scope 확장
- consumer migration 자동 실행
- Open Decision resolve 또는 `confirmed` 승격
- warning-first surface의 hard/required CI promotion
- 새 required CI check
- generic app-surface abstraction
- release/version/tag 변경

---

## 6. Terminology

| Term | Meaning |
|---|---|
| maturity | 사실과 decision cap이 허용하는 기계적 진행 상태 |
| work intent | 호출자가 명시하는 현재 작업 종류 |
| intent evidence | intent capability를 허용하는 canonical input/reconciliation provenance |
| input artifact trust | Input Result Contract hard validity |
| register trust | v2 register global structure hard validity |
| input reconciliation trust | selected input summary/projection/ref hard validity |
| group trust | selected `(Input ID, Item)` effect group hard validity |
| scope resolution | affected screen token을 canonical screen relation으로 해소한 결과 |
| current input leaf | supersession component에서 newer successor가 없는 trusted input |
| authorization profile | target와 intent에 따른 독립 path envelope |
| implementation target | screen, shared surface, app shell처럼 path owner가 될 수 있는 대상 |
| typed path declaration | shell 내부 semantic kind와 narrow ownership claim |
| kind root | policy가 kind에 연결하고 layout이 물리 glob으로 해소하는 authority ceiling |
| root binding | declared path가 해당 kind root에 완전히 포함되는 관계 |
| deny claim | path, authored token, origin, class, overrideability를 보존한 구조화 deny |
| waived claim | exact intent predicate로 무시됐으나 provenance에 남는 deny |
| safety deny | intent가 override할 수 없는 Tier3/generated/ownership/candidate deny |
| deny-only ownership | positive authority 없이 다른 target만 차단하는 recoverable claim |
| target-scoped decision | referrer target만 cap하는 Open Decision |
| candidate owner | `{target_type, target_id}` API Candidate identity |
| subordinate slice | 같은 target의 typed hook/API-client root 안의 narrower candidate |
| no-API host envelope | API maturity에서도 no-API shell host authority를 유지하는 profile |

---

## 7. Safety Invariants

1. `readiness_mode = min(fact_mode, decision_cap)`을 유지한다.
2. 권한을 얻기 위해 mode를 낮추지 않는다.
3. intent는 호출자가 명시하며 자동 추론하지 않는다.
4. `visual-refresh`는 `--input`과 hard-trusted evidence 없이는 permission 0이다.
5. selected input은 Input Result Contract와 Reconciliation Contract v2를 모두 통과한다.
6. selected input은 supersession graph의 current trusted leaf다.
7. source alias는 authoritative Screen Source Map relation 없이 canonical scope를 만들지 않는다.
8. Reconciliation Item의 허용 effect는 실제 enum `update|create`다.
9. intent는 base allowed path 누적 합집합이 아니다.
10. deny는 origin을 가진 claim으로 판정한다.
11. `claim.authored_path`가 canonical field다.
12. same path의 non-waivable claim 하나라도 남으면 deny한다.
13. Tier3/custom/generated/other-owner/candidate deny는 waive하지 않는다.
14. forward check와 diff backstop은 같은 trust와 authorization helper를 소비한다.
15. Work Packet/Run Report는 provenance를 재계산하지 않는다.
16. generated ownership을 어떤 target도 우회하지 못한다.
17. shell typed declaration은 물리 권한을 스스로 만들지 않는다.
18. shell positive authority는 policy/layout-owned kind root 안에서만 가능하다.
19. missing/ambiguous/contradictory root binding은 positive permission 0이다.
20. malformed owner declaration이 다른 target의 authority를 넓히지 않는다.
21. app shell decision은 unrelated target에 fan-out하지 않는다.
22. shared-surface member/cap/fan-out 의미는 유지한다.
23. `api_required:false` target은 candidate authority를 얻지 않는다.
24. no-API shell은 API maturity에서 host authority를 잃지 않는다.
25. intent 없는 기존 실행은 기존 의미와 호환된다.

---

## 8. Option Analysis

| Option | Decision | Reason |
|---|---|---|
| reached-mode allowed union | reject | task kind와 API screen invariant를 구분하지 못함 |
| API mode screen forbid 제거 | reject | 모든 API 배선 작업에 screen mutation을 엶 |
| scalar `visual-refresh` mode | reject | maturity와 intent를 다시 혼합 |
| Open Decision reopen | reject | 실제 maturity와 provenance를 왜곡 |
| evidence 없는 explicit intent | reject | caller 규율만 남음 |
| RR 부분 parser | reject | validate/readiness drift |
| Input Result Contract message 재파싱 | reject | 문자열 diagnostic에 권한 로직 종속 |
| shared pure analyzers | adopt | validate와 readiness가 동일 hard contract 소비 |
| selected input current leaf | adopt | stale input 재사용 차단 |
| affected_screens canonical-only exact | reject | 정상 source alias workflow를 영구 차단 |
| authoritative source-map resolution | adopt | raw alias를 human-confirmed identity로 해소 |
| flattened deny 삭제 | reject | Tier3/custom deny 손실 |
| provenance deny claim | adopt | origin/waiver deterministic |
| shell kind를 경로명에서 추론 | reject | unknown layer fail-open |
| typed shell declaration alone | reject | artifact가 임의 physical authority 생성 |
| typed declaration ∩ kind root | adopt | semantic ownership과 policy authority 분리 |
| default broad app-shell root | reject | 미채택 repo/consumer에 권한 확대 |
| malformed shell path drop | reject | other target broad allow 우회 |
| deny-only recovery | adopt | privilege expansion 없이 보수적 reservation |
| shared-surface global scope | reject | member semantics 훼손 |
| dedicated app-shell-spec | adopt | narrow target identity와 gate |
| generic app-surface first slice | reject | 현재 요구보다 과도한 일반화 |
| navigation-map target 승격 | reject | route truth와 mutable ownership 결합 |
| Open Decision schema 확장 | reject | `decision_refs`로 target scope 표현 가능 |

---

## 9. Decision D1 — Readiness Maturity 유지

### 9.1 Formula

```text
fact_idx       = target fact profile이 연속으로 만족하는 최고 mode index
decision_idx   = target에 적용된 open decision의 최저 Blocking Mode index - 1
readiness_idx  = min(fact_idx, decision_idx)
readiness_mode = order[readiness_idx]
```

malformed lifecycle/decision/policy/target contract는 fail closed한다.

### 9.2 Base output ownership

Intent가 있어도 다음은 base maturity를 뜻한다.

```text
readiness_mode
next_mode
allowed_paths
forbidden_paths
blocking
next_actions
```

`visual-refresh` 때문에 `readiness_mode`를 낮추거나 거짓 출력하지 않는다.

### 9.3 Decision levels

```text
intent_prerequisite_pass =
  fact_idx >= required_idx
  AND decision_cap_idx >= required_idx
  AND target structural state valid
```

`final-fixture-ui` blocker는 visual refresh를 막는다. API integration만 막는 상위 blocker는
final-level visual work를 불필요하게 막지 않는다.

### 9.4 Effective path profile is separate

동일 mode라도 target facts에 따라 effective profile이 달라질 수 있다.
`api_required:false` app shell의 `no-api-host`가 대표 사례다.

---

## 10. Decision D2 — Explicit Work Intent와 Evidence Trust

### 10.1 Public contract

```text
--screen <SCREEN_ID>
--intent visual-refresh
--input <INPUT_ID>
```

첫 slice에서 intent는 screen target에만 허용한다.

### 10.2 No inference and no bypass

다음은 intent를 자동 활성화하지 않는다.

- Figma mapping 존재
- 최근 timestamp
- source type/file name
- current mode
- caller assertion만 존재

Evidence bypass flag/config/environment variable은 없다.

### 10.3 Input Result Contract analyzer

기존 `validateInputArtifacts()`의 순수 로직을 다음 analyzer로 분리한다.

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

`validateInputArtifacts()`는 analyzer 결과를 기존 `{errors,warnings}` shape/order로
투영한다.

Per-input trust 예시:

```yaml
by_input_id:
  IN-20260811-figma-003:
    input_artifact_trusted: true
    hard_error_codes: []
    effective_scope:
      affected_domains: [create]
      affected_screens:
        - raw:design/J010
    supersedes: IN-20260801-figma-001
```

`input_artifact_trusted=true`는 현재 검사 11 hard contract 전체가 통과할 때만 가능하다.

- frontmatter
- required 9 fields
- `input_id` format/uniqueness
- `captured_at`
- `input_type`/`source_type`
- effective scopes
- `supersedes` existence/self-reference
- `confidence` enum when present

Deprecated aliases와 filename mismatch 같은 existing warnings는 trust를 낮추지 않는다.
Input Fidelity v2 warning-first 진단도 이 capability trust를 자동 차단하지 않는다.

### 10.4 Reconciliation Contract v2 analyzer

```text
analyzeReconciliationContractV2(...) -> {
  errors,
  warnings,
  trust: {
    register_trusted,
    summaries_by_input,
    groups_by_key,
    projection_by_input
  }
}
```

Validate adapter는 기존 public diagnostics를 유지한다.

### 10.5 Register trust

다음 전체가 hard-valid해야 한다.

- `reconciliation_contract: 2`
- review profile 및 structured timestamp
- canonical Summary 정확히 1개, exact 8 columns
- Reconciliation Items heading/table 정확히 1개
- exact 10 columns
- v1 parser와 canonical source mismatch 없음
- register-wide RR-SCHEMA hard error 0

### 10.6 Selected input reconciliation trust

```text
reconciliation_input_trusted(input) =
  register_trusted
  AND unique Summary row
  AND Reconcile Status == reconciled
  AND summary grammar/ref trusted
  AND projection trusted
  AND selected group trusted
  AND selected-input RR-SCHEMA/RR-ITEM/RR-REF/RR-ROUTE/RP hard error 0
```

다른 input에만 귀속된 hard error는 selected input을 자동 차단하지 않는다.

### 10.7 Selected visual group semantics

```text
group_trusted == true
Basis == visual-evidence
Classification == simple-update
all Effect ∈ { update, create }
at least one effect row
```

Summary status가 reconciliation 완료를 소유하고, item Effect는 역사적 행위를 소유한다.

### 10.8 Screen-precise target relations

허용 relation:

A. selected ScreenSpec의 visual-allowed section
B. selected screen_id와 exact 일치하는 sibling Figma mapping
C. exact unique visual `Screen Families` row whose `Member Screens` contains selected screen

Whole artifact/section, unrelated family, component-gap-only target은 capability evidence로
불충분하다.

### 10.9 Strict visual-family resolver

```text
unique visual contract artifact
AND artifact_type == visual-consistency-contract
AND exactly one canonical Screen Families table
AND exact Family row key
AND exactly one matching row
AND valid unique Member Screens
AND selected active Screen ID exact member
```

Failure는 readiness intent만 `applicable:false`로 만든다.

### 10.10 Scope resolution

Input의 effective `affected_screens`는 canonical field를 우선하고, 기존
`suggested_scope.screens` alias가 Input Result Contract상 유효한 경우 그 값을 사용한다.

각 token은 다음으로 분류한다.

```text
canonical-screen
raw-source-alias
legacy-source-alias
invalid
```

#### Direct canonical scope

Token이 active ScreenSpec의 canonical ID와 exact 일치하면 해당 screen relation을 만든다.

#### Raw source alias scope

권장 grammar:

```text
raw:planning/<source-id>
raw:design/<source-id>
raw:figma-node/<node-id>
```

Legacy unprefixed alias는 기존 map 호환을 위해 exact match만 시도한다. 여러 alias
column 또는 여러 canonical row에 매치되면 ambiguous다.

Strict source-map capability relation:

```text
screen-source-map exists
AND exactly one canonical mapping table
AND alias token resolves to exactly one row
AND row canonical ID is an active ScreenSpec
AND Mapping Status ∈ { confirmed, merged }
AND selected screen == row canonical ID
```

`candidate|ambiguous|split|deprecated`, duplicate alias, missing row, missing ScreenSpec는
positive scope를 만들지 않는다. `split`은 first slice에서 raw alias만으로 권한을 만들지
않으며 exact canonical input을 새로 발행하거나 별도 후속 설계가 필요하다.

#### Per-target scope decision

```text
scope_allows(selected_screen) =
  selected screen in direct canonical relations
  OR selected screen in authoritative source-map relations
```

Trusted exact reconciliation target relation은 필수지만 raw alias의 authoritative map을
대체하지 않는다. Raw token 자체는 권한을 만들지 않는다.

Malformed/empty scope는 input artifact trust false 또는 capability scope false다.

### 10.11 Supersession analyzer

Input artifact trust와 v2 Summary trust를 사용해 graph를 만든다.

```text
edge newer -> older
where newer.frontmatter.supersedes == older.input_id
```

Summary `Supersedes`의 `-`/empty는 null로 normalize한다.

Component trust:

```text
every node has unique canonical input artifact
every referenced predecessor exists
frontmatter supersedes == Summary Supersedes for every registered node
no self edge
acyclic
each predecessor has at most one direct newer successor
```

두 newer input이 같은 predecessor를 supersede하면 branch ambiguity다. 어느 leaf도
capability evidence가 되지 않는다.

Selected input eligibility:

```text
selected input is in trusted graph component
AND selected input has no newer successor
AND selected input itself is input_artifact_trusted
AND selected input reconciliation is trusted/reconciled
```

Newer successor가 존재하면 old input은 상태와 무관하게 거부한다.

- newer `reconciled` → use newer leaf
- newer `not-started|in-progress|failed` 또는 Summary 없음 → old fallback 금지,
  `reconcile latest superseding input <ID>`
- newer artifact hard-invalid → graph untrusted, old fallback 금지
- cycle/branch/parity mismatch → fail closed

### 10.12 Final intent evidence formula

```text
intent_evidence_valid =
  selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND selected_visual_target_relation_valid
  AND scope_allows(selected_screen)
  AND supersession_component_trusted
  AND selected_input_is_current_leaf
```

### 10.13 Authorization context

```yaml
authorization_context:
  target_type: screen
  target_id: CREATE-ATTACH
  work_intent: visual-refresh
  evidence:
    input_id: IN-20260811-figma-003
    input_artifact_trusted: true
    reconciliation_trusted: true
    current_leaf: true
    scope_resolution:
      kind: source-map
      source_token: raw:design/J010
      canonical_screen_id: CREATE-ATTACH
      mapping_status: confirmed
      source: _meta/screen-source-map.md
    item_groups:
      - item_id: RI-VISUAL-003
        effects: [update]
        group_trusted: true
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

`authored_path`는 top-level canonical field다.

### 11.3 Claim sources

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

### 11.4 Exact waiver

```text
waivableByVisualRefresh(claim) =
  source.kind == mode-policy
  AND source.field == forbidden_paths
  AND source.mode == api-integrated-ui
  AND claim.authored_path == "{roles.screen}"
  AND source.role == screen
  AND deny_class == work-step-boundary
  AND overrideable_by contains visual-refresh
```

Actual claim object를 테스트하며 projected string을 사용하지 않는다.

### 11.5 Positive envelope

```text
intent candidates =
  resolve({roles.screen})
  ∪ resolve({roles.domain_component})
```

Hook/API-client/candidate/delegated/generated/other-owner paths는 deny claim이다.

### 11.6 Formula

```text
matching_claims = all matching deny claims
waived_claims  = exact-waivable claims
active_denies  = matching_claims - waived_claims

allowed =
  intent applicable
  AND positive candidate match
  AND active_denies is empty
```

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
  waived_claims:
    - deny:mode-policy:api-integrated-ui:screen:0
  active_deny_claims: []
```

---

## 12. Decision D4 — App Shell Artifact Model과 Physical Roots

### 12.1 Artifact

```text
docs/frontend-workflow/app/shells/{shell}/shell-spec.md
artifact_type: app-shell-spec
shell_id: MAIN-SHELL
```

여러 shell을 허용하되 identity/path는 disjoint해야 한다.

### 12.2 Frontmatter

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

### 12.3 Typed declarations

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

Allowed kinds:

```text
route-host
shell-host
hook
api-client
```

Typed declaration owns semantic kind and reservation provenance. It does not by itself grant
physical edit authority.

### 12.4 Policy-owned target profile

Kind→root mapping is kit policy-owned, not authored in shell-spec.

```yaml
target_profiles:
  app-shell-v1:
    path_roots:
      route-host:
        - "{roles.route_entry}"
      shell-host:
        - "{roles.app_shell_host}"
      hook:
        - "{roles.app_shell_hook}"
      api-client:
        - "{roles.api_client}"
```

Exact serialization may live additively in `implementation-mode-policy.yaml`; no new artifact
axis is required.

### 12.5 Layout-owned role bindings

`project-layout.yaml` resolves role tokens.

- `route_entry` and `api_client` reuse existing roles.
- `app_shell_host` and `app_shell_hook` are new optional roles.
- default Expo preset does not synthesize broad defaults for the new roles.
- consumer must explicitly bind adopted shell host/hook roots.
- missing optional role means artifact authoring may continue, but entries of that kind have
  positive permission 0.

Example consumer binding:

```yaml
roles:
  app_shell_host:
    - src/components/app-shell/host/**
  app_shell_hook:
    - src/features/app-shell-runtime/hooks/**
```

### 12.6 Root safety

Effective roots of distinct kinds must be disjoint. Overlap or ambiguous containment is layout
configuration error for shell authorization and positive permission 0.

Roots must be project-relative, canonical, representable, and narrower than blanket repository
roots. `src/**`, project root, `docs/**`, and package-level arbitrary roots are not valid
app-shell host/hook role bindings.

### 12.7 Root binding

```text
root_binding(entry) =
  exactly one resolved root of entry.kind fully covers entry.path
  AND no root of a different kind overlaps entry.path
```

Cases:

- zero matching kind roots → `kind-root-unbound`
- multiple distinct matching roots after dedupe → `kind-root-ambiguous`
- different-kind sensitive root overlap → `kind-contradiction`
- valid unique binding → positive authority candidate

### 12.8 Declaration versus authority

```text
typed declaration
  = semantic classification + narrow ownership reservation

positive physical authority
  = trusted typed declaration
  ∩ resolved policy/layout kind root
  ∩ maturity path-kind profile
  - active deny claims
```

Therefore:

```yaml
- path: src/api/app-shell/**
  kind: shell-host
```

is invalid because it contradicts the resolved `api-client` root.

```yaml
- path: package.json
  kind: shell-host
```

is unbound and permission 0.

```yaml
- path: src/features/payments/components/**
  kind: shell-host
```

cannot acquire ownership unless an explicitly adopted `app_shell_host` root covers it. A
cross-domain existing path also remains subject to other-owner reservations.

### 12.9 Invalid typed entries

Hard-invalid cases:

- string-only entry
- missing/non-string path
- missing/unknown kind
- duplicate/overlap
- unsafe/noncanonical/broad path
- missing/ambiguous root binding
- kind contradiction
- cross-owner conflict

Shell positive permission becomes 0. Recoverable path stays deny-only under §15.

### 12.10 Body ownership

Canonical sections:

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

Local Open Decisions table is forbidden.

### 12.11 Fact profile

| Mode | Target-specific minimum |
|---|---|
| docs-only | artifact parse result only |
| route-skeleton | valid identity/status/navigation map |
| screen-skeleton | core sections + nonempty trusted root-bound paths |
| rough-fixture-ui | state/non-route interaction complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API special case or valid actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.12 Normal path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | root-bound route-host |
| screen-skeleton | root-bound route-host/shell-host |
| rough/final | host kinds + valid owned active hook candidate slices |
| api-integrated | valid owned active hook/API-client slices; host frozen |
| production-ready | root-bound host + valid active slices; unowned hook/API denied |

### 12.13 No-API profile

```text
if api_required == false and readiness >= api-integrated-ui:
  effective_path_profile = no-api-host
```

Allowed:

```text
root-bound route-host
root-bound shell-host
```

Denied:

```text
all typed hook
all typed api-client
all candidate paths
all generated/Tier3/custom/other-owner/contract denies
```

This profile remains at production-ready.

---

## 13. Decision D5 — Target-aware API Candidate Ownership

### 13.1 Owner

```yaml
owner:
  target_type: screen | shared-surface | app-shell
  target_id: CREATE-ATTACH | CHAT-COMPOSER | MAIN-SHELL
```

Existing `screen_id` may remain a compatibility alias.

### 13.2 Surface resolution

- screen: existing domain/layout hook/API-client roles
- app-shell: exactly one trusted root-bound typed hook/API-client entry
- shared-surface: existing parser plus generic conflict participation

An unbound or contradictory shell typed entry cannot classify a positive candidate.

### 13.3 Tracking

`unknown:U-...` resolves in the same owner artifact:

```text
screen → ScreenSpec
shared-surface → surface-spec
app-shell → shell-spec
```

### 13.4 Positive authority

```text
same owner
contract valid
confirmed
active
slice fully within exactly one trusted typed hook/API-client entry
matching kind root
no conflict
api_required != false
```

### 13.5 Deny-only candidate provenance

Deferred, invalid, outside declaration, root-unbound, kind mismatch, conflict, and no-API
candidate paths preserve recoverable project-wide deny-only claims.

### 13.6 Conflict matrix

All target kind pairs participate. Only same-owner valid subordinate candidate is exempt from
parent-path conflict.

---

## 14. Decision D6 — Target-scoped Open Decisions

### 14.1 Reuse

- global six-column register
- app-shell `decision_refs`
- `open|resolved`
- human-only resolve
- existing Blocking Mode names

### 14.2 Scope

Open shell decision caps only that shell's mode/path/next actions. It does not fan out to
screens, shared-surface member cap, or another shell unless separately referenced.

### 14.3 Malformed cases

Missing/ambiguous/malformed ref/register caps the shell at docs-only. Resolved refs remain
provenance. Duplicate shell identity never first-wins.

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

### 15.3 Recoverable cases

- missing/unknown kind with narrow path
- root-unbound or kind contradiction with narrow path
- duplicate/overlap
- duplicate shell identity
- safely canonicalizable separator/dot/in-tree aliases

Nonrecoverable:

- absolute/drive/UNC
- root escape
- arbitrary/middle wildcard
- blanket root
- missing/non-string path

### 15.4 Deny-only claim

```yaml
deny_claim:
  claim_id: deny:ambiguous-app-shell:MAIN-SHELL:0
  path: src/api/app-shell/**
  authored_path: src/api/app-shell/**
  deny_class: ambiguous-owner
  source:
    kind: app-shell-reservation
    shell_id: MAIN-SHELL
    contract_valid: false
    reason: kind-contradiction
  overrideable_by: []
  owner:
    target_type: app-shell
    target_id: MAIN-SHELL
```

### 15.5 Projection

Valid and deny-only shell reservations are projected to every screen/shared/other-shell
authorization. Broad `src/**` cannot bypass them.

### 15.6 Positive formula

```text
authorized(file) =
  target/profile positive match
  AND root binding valid
  AND no active ownership/generated/candidate/contract deny
```

---

## 16. Public CLI Contract

### 16.1 Selectors

```text
--screen
--surface
--app-shell
```

Mutually exclusive.

### 16.2 Visual refresh

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260811-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

### 16.3 Shell

```bash
npm run workflow:readiness -- \
  --app-shell MAIN-SHELL \
  --path src/components/app-shell/host/Header.tsx \
  --json
```

### 16.4 Usage errors

Exit 2 before state load:

- invalid/blank intent
- intent without input
- input without intent
- malformed input ID
- intent without screen
- intent with surface/shell
- selector conflicts
- invalid shell ID
- path without supported selector
- noncanonical concrete path

Evidence/root/scope/supersession failure is keyed `applicable:false` or path denial, exit 0 for
readiness.

---

## 17. workflow-state Contract

### 17.1 App shells

Only emit `app_shells` when adopted.

```yaml
app_shells:
  MAIN-SHELL:
    status: confirmed
    api_required: false
    implementation_paths:
      - path: src/components/app-shell/host/**
        kind: shell-host
        root_binding:
          role: app_shell_host
          root: src/components/app-shell/host/**
          valid: true
    ownership_claims:
      - path: src/components/app-shell/host/**
        owner_state: valid
    derived:
      contract_errors: []
      path_errors: []
      decision_refs: []
```

### 17.2 Invalid shell

```yaml
app_shells:
  MAIN-SHELL:
    readiness_applicable: false
    deny_only_ownership:
      - path: src/api/app-shell/**
        reason: kind-contradiction
```

### 17.3 Input trust indexes

State need not serialize all internal analyzer details. Readiness may load analyzers directly.
If serialized for report reuse, values must be deterministic and carry source/version hashes;
stale generated trust cannot be accepted without matching input/register sources.

### 17.4 Determinism

Sort shell IDs, source paths, claims, graph nodes, and diagnostics. Existing screen/surface shape
remains additive-compatible.

---

## 18. Readiness JSON/YAML Contract

### 18.1 Valid visual intent

```json
{
  "CREATE-ATTACH": {
    "readiness_mode": "api-integrated-ui",
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260811-figma-003",
      "applicable": true,
      "evidence": {
        "input_artifact_trusted": true,
        "reconciliation_trusted": true,
        "current_leaf": true,
        "scope_relation": {
          "kind": "source-map",
          "source_token": "raw:design/J010",
          "screen_id": "CREATE-ATTACH",
          "mapping_status": "confirmed"
        },
        "item_ids": ["RI-VISUAL-003"]
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

### 18.2 Invalid input artifact

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260811-figma-003",
      "applicable": false,
      "allowed_paths": [],
      "evidence": {
        "input_artifact_trusted": false,
        "hard_error_codes": ["input-type-enum"]
      },
      "next_actions": [
        "fix Input Result Contract hard errors for IN-20260811-figma-003"
      ]
    }
  }
}
```

### 18.3 Superseded input

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-001",
      "applicable": false,
      "evidence": {
        "current_leaf": false,
        "superseded_by": "IN-002"
      },
      "next_actions": [
        "reconcile latest superseding input IN-002"
      ]
    }
  }
}
```

### 18.4 Unbound shell path

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "readiness_mode": "final-fixture-ui",
    "allowed_paths": [],
    "path_authorization": [
      {
        "path": "package.json",
        "kind": "shell-host",
        "allowed": false,
        "causes": [
          {"kind": "kind-root-unbound"}
        ],
        "owner_state": "deny-only"
      }
    ]
  }
}
```

### 18.5 No-API shell

```json
{
  "MAIN-SHELL": {
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
    ]
  }
}
```

### 18.6 Field stability

No-intent output omits work intent. No-shell repo omits shell keys. Existing path fields remain
base semantics. Ordering is deterministic.

---

## 19. validate/backstop Contract

### 19.1 Shared analyzers

Implement pure analyzers for:

- Input Result Contract
- Reconciliation Contract v2
- strict visual family relation
- strict Screen Source Map capability relation
- supersession graph
- app-shell typed paths/root binding
- ownership/deny claims

Validate adapters retain existing public diagnostic shapes and warning-first boundaries.

### 19.2 Authorization order

```text
1 concrete canonicality
2 target/lifecycle/contract validity
3 input artifact trust
4 reconciliation trust
5 scope resolution
6 supersession current leaf
7 intent prerequisite or base readiness
8 shell kind root binding / no-API profile
9 positive profile match
10 ownership/generated/candidate denies
11 claim waiver
12 remaining deny precedence
13 structured provenance
```

### 19.3 Diff backstop

Forward and diff consume the same context. Visual backstop requires `--input`; shell backstop
uses the same root bindings and deny-only reservations.

### 19.4 Work Packet / Run Report

Copy:

- input artifact trust
- reconciliation trust
- scope relation
- supersession/current leaf
- selected item groups
- root binding
- waived and active deny claims
- owner state

Never recompute.

### 19.5 Warning-first boundary

General doctor/visual warnings remain warning-first. Strict capability resolvers only deny use as
authorization evidence.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input reconciliation | v2 trust and supersession parity |
| input result contract | analyzer trust export |
| screen identity | authoritative source-map capability relation |
| project layout | optional `app_shell_host`/`app_shell_hook` roles |
| implementation policy | app-shell target profile and kind-root mapping |
| app-shell reference | typed declarations, roots, no-API, recovery |
| open decisions | shell referrer scope |
| shared surfaces | shell reservation separation |
| visual reconciliation | current evidence-bound visual-refresh |
| Stage 05/06/08 | author, implement, validate/report |
| commands | intent/input/shell examples |
| implement-screen | current trusted input only |
| implement-app-shell | readiness/root-bound path only |

---

## 21. Compatibility Matrix

| Case | Required behavior |
|---|---|
| no intent | current screen behavior |
| v1/summary-only register | intent permission 0 |
| input artifact hard-invalid | intent permission 0 |
| raw alias + confirmed/merged unique map | may establish scope |
| raw alias ambiguous/candidate/split | no permission |
| selected input superseded | no permission |
| newer input incomplete | old fallback forbidden |
| no Screen Source Map and canonical affected screen | direct relation works |
| no app-shell | no new required key/file |
| shell host role absent | authoring possible, positive host permission 0 |
| valid explicit shell role binding | root-bound permission possible |
| shell kind contradiction | permission 0 + deny-only |
| no-API shell | host preserved, hook/API denied |
| shared surface | existing member/cap/fan-out semantics |
| old state reader | ignores additive shell keys |
| warning-first surfaces | no automatic promotion |

No new required CI check, dependency, release/version/tag.

---

## 22. Migration

### 22.1 #222

1. Create canonical input.
2. Ensure Input Result Contract hard-valid.
3. Reconcile under Contract v2.
4. Ensure input is current supersession leaf.
5. Resolve scope through canonical ID or authoritative source map.
6. Run readiness with `--intent` and `--input`.
7. Check each concrete path.
8. Validate and report provenance.

Old superseded input is never fallback.

### 22.2 #223

1. Preserve decision rows.
2. Add app-shell-spec draft.
3. Add explicit project-layout shell role bindings as needed.
4. Declare typed paths within those roots.
5. Link decision refs.
6. Regenerate state.
7. Check shell/screen/shared paths.
8. Validate and run backstop.

String-only or outside-root paths are not auto-inferred; recoverable invalid paths remain
deny-only until fixed.

---

## 23. Implementation Slices

### 23.1 Slice A — #222

Scope:

- Input Result Contract analyzer trust
- Reconciliation v2 analyzer trust
- strict visual-family resolver
- strict source-map capability resolver
- supersession graph/current leaf
- deny claim provenance/waiver
- evidence-bound visual-refresh
- CLI intent/input
- forward/backstop parity
- packet/report provenance

Excludes app-shell artifact and #224.

Acceptance:

- no-intent compatibility
- hard-valid current input only
- canonical or authoritative scope only
- stale/superseded input denied
- screen/domain-component only
- Tier3/candidate/delegated/generated denied

### 23.2 Slice B — #223

Depends on Slice A authorization substrate.

Scope:

- app-shell template/schema/manifest
- target profile kind roots
- optional layout roles
- typed path/root analyzer
- no-API host envelope
- generic candidate owner
- valid/deny-only ownership index
- state/readiness/validate/backstop
- skill/docs/distribution/migration

Acceptance:

- declaration alone creates no physical authority
- outside-root/contradictory paths denied and reserved
- valid root-bound paths mode-gated
- no-API host preserved
- unrelated target cannot edit shell path

### 23.3 No Slice 0

Shared helpers ship with Slice A behavior; no abstraction-only PR.

---

## 24. File Impact Map

### Slice A

| Area | Expected files |
|---|---|
| input | `scripts/lib/input-artifact.mjs` and tests |
| reconciliation | `scripts/lib/reconciliation-items.mjs` and tests |
| identity | `scripts/lib/screen-source-map.mjs` or strict helper |
| visual | `scripts/lib/visual-consistency.mjs` or strict helper |
| core | readiness/path authorization |
| backstop | forbidden-paths |
| execution | packet/report |
| docs/skills | implement-screen, Stage 06/08, commands |

### Slice B

| Area | Expected files |
|---|---|
| layout/policy | project-layout schema/profile, implementation target profile |
| artifact | app-shell template/schema/manifest/reference/skill |
| analyzer/state | shell analyzer, workflow-state |
| authorization | root binding, ownership, readiness |
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
| 2 | valid current trusted visual input opens screen/domain component only |
| 3 | invalid intent/input CLI combinations exit 2 |
| 4 | v1/summary-only register denied |
| 5 | malformed Summary/Items denied |
| 6 | RR/RP hard-invalid selected group denied |
| 7 | Effect outside update/create denied |
| 8 | projection mismatch denied |
| 9 | unrelated input RR error isolated |
| 10 | invalid input_type/source_type denied |
| 11 | missing captured_by/status/affected_domains denied |
| 12 | invalid captured_at denied despite explicit item Captured At |
| 13 | invalid input supersedes reference denied |
| 14 | duplicate input_id denied |
| 15 | direct canonical affected screen accepted |
| 16 | canonical affected screens excluding selected denied |
| 17 | raw design alias + confirmed map + exact target accepted |
| 18 | raw alias + merged unique one-canonical map accepted |
| 19 | raw alias candidate/ambiguous/split denied |
| 20 | raw alias missing map denied |
| 21 | duplicate alias relation denied |
| 22 | malformed/empty scope denied |
| 23 | exact ScreenSpec visual section accepted |
| 24 | sibling mapping screen mismatch denied |
| 25 | exact visual family member accepted |
| 26 | whole visual artifact/section denied |
| 27 | duplicate/malformed family denied |
| 28 | superseded trusted input denied |
| 29 | latest trusted leaf accepted |
| 30 | latest input not-started/in-progress/failed blocks old fallback |
| 31 | newer hard-invalid input blocks old fallback |
| 32 | supersession cycle denied |
| 33 | supersession branch denied |
| 34 | Summary/frontmatter supersedes mismatch denied |
| 35 | final-level decision blocks intent |
| 36 | API-only higher blocker does not block final visual work |
| 37 | absorbed/malformed lifecycle denied |
| 38 | delegated/shared/shell reservation denied |
| 39 | candidate paths denied |
| 40 | actual claim authored_path waiver succeeds |
| 41 | same-path Tier3 claim remains deny |
| 42 | custom layout retains claim origin |
| 43 | forward/backstop same evidence and result |
| 44 | packet/report copies trust/scope/leaf/claims |
| 45 | legacy no-intent fixtures compatible |

### 25.2 #223

| # | Regression |
|---|---|
| 1 | no app-shell artifact no-op |
| 2 | valid identity/state deterministic |
| 3 | shell decision caps shell only |
| 4 | malformed decision fails shell only |
| 5 | local Open Decisions rejected |
| 6 | forbidden identity fields rejected |
| 7 | string-only/missing kind denied |
| 8 | valid route-host inside route_entry root accepted |
| 9 | shell-host with explicit app_shell_host root accepted |
| 10 | missing app_shell_host role gives permission 0 |
| 11 | missing app_shell_hook role gives hook permission 0 |
| 12 | `src/api/**` declared shell-host is contradiction/deny-only |
| 13 | `package.json` declared shell-host unbound/deny-only |
| 14 | another domain component cannot be acquired by declaration |
| 15 | distinct kind roots overlap → target profile invalid |
| 16 | broad app-shell role root rejected |
| 17 | valid active same-shell candidate reaches API mode |
| 18 | candidate requires trusted root-bound hook/API entry |
| 19 | outside/wrong-kind/root-unbound candidate denied |
| 20 | cross-target candidate overlap denied |
| 21 | deferred/invalid candidate deny-only |
| 22 | no-API candidate authority 0 |
| 23 | no-API API maturity preserves root-bound host |
| 24 | no-API denies all hook/API/candidate |
| 25 | no-API production-ready still denies hook/API |
| 26 | shell-screen entry overlap denied |
| 27 | shell-shared overlap denied |
| 28 | shell-shell overlap denied |
| 29 | valid shell path reserved from other targets |
| 30 | missing-kind path permission 0 and globally reserved |
| 31 | safely canonicalizable alias deny-only |
| 32 | kind contradiction recoverable path deny-only |
| 33 | absolute/drive/UNC/root escape no physical claim |
| 34 | duplicate identity preserves all recoverable denies |
| 35 | overlapping entries preserve deny-only |
| 36 | production-ready `src/**` cannot bypass |
| 37 | empty paths authoring valid, permission 0 |
| 38 | Tier3 deny overrides valid root binding |
| 39 | selector/ID errors exit 2 |
| 40 | deterministic state/readiness |
| 41 | forward/backstop parity for root binding/no-API/recovery |
| 42 | distribution includes new payload |

Implementation PRs also run existing fixture-hook, candidate deferral, shared-surface, Open
Decision, readiness fail-open/redteam, path-backstop, distribution, and upgrade regressions.

---

## 26. Risks / Known Limits

1. Contextless diff cannot infer intended target; explicit owner path remains conservative.
2. Trust analyzers must preserve public diagnostic ordering.
3. Strict source-map/family resolvers are capability gates, not global hard promotion.
4. Only `confirmed|merged` one-canonical alias relations authorize first slice; `split` is denied.
5. Supersession branch denial is conservative and may require author cleanup.
6. Deny-only recovery can temporarily lock malformed paths.
7. Optional app-shell roots require explicit consumer adoption.
8. No default broad shell host root is provided.
9. Shell visual-refresh remains future scope.
10. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result Contract analyzer trust required |
| D4 | Reconciliation v2 analyzer trust required |
| D5 | exact visual target relation required |
| D6 | canonical/direct or authoritative source-map scope required |
| D7 | selected input must be current trusted supersession leaf |
| D8 | deny claim top-level authored_path and exact waiver |
| D9 | visual profile is screen/domain-component only |
| D10 | dedicated optional app-shell-spec |
| D11 | typed shell declaration does not self-grant authority |
| D12 | policy target profile + layout role roots own physical ceiling |
| D13 | optional app_shell_host/app_shell_hook have no broad defaults |
| D14 | generic API Candidate owner |
| D15 | no-API shell uses no-api-host profile |
| D16 | recoverable invalid shell path remains deny-only |
| D17 | six-column Open Decision schema reused |
| D18 | global physical ownership namespace |
| D19 | #222 implemented before #223 |
| D20 | no-intent/no-shell compatibility preserved |

---

## 28. Remaining Human Decisions and Design Verification

구현 시작을 막는 큰 human decision은 없다.

Implementation naming만 남는다.

- helper/module names
- diagnostic metadata field names
- app-shell skill/reference slug

다음은 별도 설계 변경 없이는 허용되지 않는다.

- evidence bypass
- stale/superseded input fallback
- raw alias without authoritative relation
- shell declaration-only physical authority
- default broad shell root
- no-API hook/API authority
- malformed reservation 제거
- Open Decision schema 변경
- generic app-surface expansion

Baseline에서 재검증한 계약:

- readiness/policy/layout
- Input Result Contract
- Reconciliation Contract v2
- Screen Source Map
- visual family parser
- candidate/path backstop
- shared surface/Open Decisions
- distribution boundaries
- #124/#210/#211

정적 검증:

- 28 numbered H2 sections
- balanced fences
- unique H2 headings
- JSON/YAML examples parseable
- independent #222/#223 matrices
- #221/#224 non-interference
- existing Open Decision schema/human transition preserved
- no-intent/no-shell compatibility
- policy-owned shell roots
- input artifact hard trust
- source alias scope resolution
- current unsuperseded leaf
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
