# Issue #222/#223 설계 — Work Intent와 App Shell Gate

Status: accepted design draft; fourth review amendment applied; implementation not started
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
> resolver와 기존 undefined-role fail-closed 경계를 확정한다.

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
6. raw/source alias는 capability용 hard-trusted Screen Source Map relation을 거쳐야 한다.
7. selected input은 trusted supersession graph의 current unsuperseded leaf여야 한다.
8. supersession edge는 strictly later `captured_at`과 exact same source lineage를 요구한다.
9. source lineage는 `source_ref`에서 추측하지 않고 additive `source_lineage` key로
   source-specific producer가 명시한다.
10. 모든 deny는 provenance-bearing claim으로 보존한다.
11. `visual-refresh`가 waive할 수 있는 것은 exact canonical work-step deny뿐이다.
12. `visual-refresh`는 screen/domain-component만 여는 독립 최소 권한 envelope다.
13. `app-shell-spec`을 선택적 1급 implementation target으로 도입한다.
14. shell `implementation_paths`는 `path + kind` typed declaration이다.
15. typed declaration은 ownership/semantic 분류일 뿐 물리 권한이 아니다.
16. shell positive authority는 typed declaration과 policy/layout-owned kind root의
    교집합에서만 나온다.
17. `route-host`는 broad `{roles.route_entry}`를 재사용하지 않고 exact-file 전용 optional
    `{roles.app_shell_route_host}`를 사용한다.
18. optional shell roots는 target-profile 전용 lazy resolver로 해소한다. 기존
    `resolvePaths`/`requireRole`의 undefined-role fail-closed 의미는 바꾸지 않는다.
19. API Candidate owner를 `{target_type, target_id}`로 일반화한다.
20. `api_required:false` shell은 API maturity에 도달해도 route/shell host 권한을
    유지하는 `no-api-host` profile을 사용한다.
21. malformed이지만 안전하게 canonicalize 가능한 shell path는 positive authority를
    만들지 않고 project-wide deny-only reservation으로 남긴다.
22. 기존 6-column Open Decision register와 `decision_refs`를 재사용한다.
23. screen/shared surface/app shell/generated/API candidate가 하나의 전역 물리 경로
    namespace를 사용하고 deny가 항상 우선한다.
24. 구현은 #222와 #223을 별도 PR로 나눈다. #223은 #222 substrate를 소비하되
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

### 2.6 Screen Source Map current boundary

`screen-source-map.md`는 planning/design/Figma alias를 canonical Screen ID에 연결하는
optional register다. 현재 parser는 `Canonical Screen ID`와 `Mapping Status`가 있는 첫
표를 고르고, doctor는 warning-first 진단을 낸다.

이 parser/doctor contract는 cold-start 관측 surface로는 적절하지만 code capability
정본으로는 충분하지 않다. 다음이 현재 hard contract가 아니다.

- canonical frontmatter parse/identity
- exact 10-column table header
- duplicate heading/table/header 방지
- canonical row identity uniqueness
- capability alias uniqueness
- canonical Screen ID와 source alias namespace collision

따라서 general doctor는 유지하되, raw/source alias를 `visual-refresh` capability에 쓸
때만 별도의 strict analyzer를 사용한다.

### 2.7 Supersession current boundary

Input artifact와 Reconciliation Register Summary는 모두 `supersedes` 관계를 표현한다.
현재 Input Result Contract는 target 존재와 self-reference를 검사하지만 다음은 검사하지
않는다.

- successor의 `captured_at`이 predecessor보다 실제로 늦은가
- successor와 predecessor가 같은 source lineage인가
- cross-source input이 잘못 supersede하는가

따라서 acyclic/current-leaf만으로는 오래된 input이 최신 leaf가 되는 역전 graph를 막지
못한다. Capability-specific supersession trust에 timestamp와 lineage를 추가한다.

### 2.8 Source lineage boundary

`source_ref`는 개별 capture의 evidence pointer다. Figma node/frame, 문서 section,
회의 recording 등 더 정밀한 위치를 포함할 수 있고 revision마다 달라질 수 있다.
Generic kit가 `source_ref` 문자열에서 stable lineage를 추측하면 source별 의미를
재발명하게 된다.

따라서 additive optional frontmatter `source_lineage`를 도입한다. 일반 input validity와
no-intent 동작에는 필수가 아니지만, supersession edge가 visual capability freshness에
사용될 때는 양 endpoint에 필수다.

### 2.9 Visual family parsing boundary

현재 visual-consistency parser는 `Screen Families` 표의 `Family`와 `Member Screens`를
실제로 파싱할 수 있다. generic reconciliation target index의 row-key 해소만으로는
family row가 target screen을 포함하는지 증명하지 못한다.

따라서 visual contract를 intent evidence로 사용할 때 strict family-membership resolver를
추가한다.

### 2.10 Layout resolver fail-closed boundary

현재 `layout-profile.mjs`의 `requireRole()`과 `resolvePaths()`는 undefined `{roles.X}`를
`LayoutConfigError`로 처리한다. Undefined forbidden role을 조용히 `[]`로 만들면 deny가
사라져 권한이 넓어질 수 있기 때문에 이 의미는 유지해야 한다.

반면 optional app-shell roots는 미채택 consumer에서 존재하지 않는 것이 정상이다.
Optional slot을 일반 `resolvePaths()`에 그대로 넣으면 app-shell authoring만 한 repo가
exit 2가 되고, `requireRole()`을 전역 완화하면 기존 fail-closed invariant가 깨진다.
따라서 target-profile optional root만을 위한 별도 lazy resolver가 필요하다.

### 2.11 Route-entry boundary

기본 Expo layout의 `{roles.route_entry}`는 `src/app/**` 전체를 가리킨다. 이를 app-shell
`route-host` ceiling으로 재사용하면 일반 화면 route 파일까지 shell positive authority
후보가 된다.

App shell route host는 root layout/provider/router boundary여야 하므로 별도의 exact-file
optional role을 사용한다.

### 2.12 Shared surfaces

`shared-surface-spec`은 다음 의미를 가진다.

- 같은 domain의 canonical screen 최소 2개
- 명시적 `member_screens`
- member screen minimum readiness cap
- decision member fan-out
- non-route uniform behavior
- narrow `implementation_paths`

선언은 권한이 아니다. Declared path가 policy와 모든 member screen의 교집합을
통과해야만 positive permission을 만든다. App shell도 같은 원칙을 사용하되 member
intersection 대신 target-specific kind root를 사용한다.

### 2.13 Open Decisions

Canonical global home은 `docs/frontend-workflow/global/open-decisions.md`이고 row schema는
다음 6개 column이다.

```text
ID | Decision Needed | Options | Blocking Mode | Owner | Status
```

`decision_refs`가 target과 row의 관계를 소유한다. Global row는 zero-ref여도 valid하고,
referrer가 없으면 어떤 target도 막지 않는다. `open → resolved`는 사람 전용이다.

### 2.14 Current API Candidate owner boundary

현재 API Candidate v2의 positive authorization과 conflict collection은 주로
ScreenSpec과 `screen_id`에 맞춰져 있다. Domain과 screen identity가 없는 app shell에는
그 규칙을 그대로 적용할 수 없다.

### 2.15 Existing fixes and remaining gaps

- #124는 `api_required:false` 화면의 non-API path 잠금을 해소했다.
- #210은 API Candidate v2 per-slice deferral과 ownership을 만들었다.
- #211은 fixture mode에서 owned hook slice를 열면서 API mode의 screen 불변을 유지했다.
- #222는 maturity와 작업 종류를 분리하는 authorization 축이 없는 문제다.
- #223은 shell target/path/decision owner가 없는 문제다.
- App shell에는 #124와 대칭인 no-API host preservation이 필요하다.
- Typed shell path에는 shared-surface와 대칭인 외부 physical authorization ceiling이
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
11. timestamp가 역전된 edge도 current leaf를 만들 수 있다.
12. API/meeting 등 다른 source lineage가 visual input을 supersede할 수 있다.
13. loose Screen Source Map parser를 권한 정본으로 재사용하면 duplicate header/table이나
    namespace collision에 따라 alias relation이 달라질 수 있다.

따라서 work intent, source evidence, input/result trust, identity scope resolution,
supersession time/lineage freshness, map capability trust, deny provenance가 함께 필요하다.

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
12. `route-host → {roles.route_entry}`를 쓰면 일반 `src/app/*.tsx` route가 shell authority
    후보가 된다.
13. optional shell role lookup을 일반 resolver로 완화하면 existing forbidden-role typo가
    조용히 사라질 수 있다.

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
- app-shell route host를 일반 screen route surface와 분리한다.
- optional shell role 부재를 target-local unbound로 처리하면서 기존 undefined-role
  fail-closed invariant는 보존한다.
- shell API Candidate를 generic target owner 모델에 연결한다.
- no-API shell이 API maturity에서 host path를 잃지 않게 한다.
- malformed shell owner가 다른 target의 authority를 넓히지 않게 한다.
- raw/source alias input scope가 hard-trusted map을 통해 canonical screen에 해소되게 한다.
- superseded input과 역전/cross-lineage edge가 visual intent token으로 재사용되지 않게 한다.
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
- visual-consistency, Screen Source Map doctor를 global hard CI gate로 승격
- app-shell-spec declaration만으로 임의 물리 root 생성
- `{roles.route_entry}` 전체를 app-shell route authority로 사용
- default Expo preset에 broad app-shell root 자동 주입
- undefined ordinary role을 조용히 빈 배열로 처리
- `source_ref` 문자열 heuristic으로 lineage 추론
- superseded input fallback
- #224 decision-log/history 계약
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
| map capability trust | Screen Source Map을 code capability relation에 사용할 수 있는 hard trust |
| scope resolution | affected screen token을 canonical screen relation으로 해소한 결과 |
| source lineage | 같은 upstream source revision family를 나타내는 explicit opaque key |
| current input leaf | trusted supersession component에서 newer successor가 없는 input |
| authorization profile | target와 intent에 따른 독립 path envelope |
| implementation target | screen, shared surface, app shell처럼 path owner가 될 수 있는 대상 |
| typed path declaration | shell 내부 semantic kind와 narrow ownership claim |
| kind root | policy가 kind에 연결하고 layout이 물리 glob으로 해소하는 authority ceiling |
| optional target root | target-profile 전용으로 missing이 정상인 lazy-resolved role slot |
| root binding | declared path가 해당 kind root에 완전히 포함되는 관계 |
| route-host root | exact shell layout/provider/router host 파일의 optional role binding |
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
6. raw/source alias는 hard-trusted Screen Source Map relation 없이는 scope를 만들지 않는다.
7. Screen Source Map의 canonical/alias namespace collision은 fail closed한다.
8. selected input은 trusted supersession graph의 current leaf다.
9. every supersession edge는 successor timestamp가 strictly later다.
10. every supersession edge는 exact same `source_type`과 exact same `source_lineage`다.
11. `source_lineage`는 `source_ref`에서 추론하지 않는다.
12. Reconciliation Item의 허용 effect는 실제 enum `update|create`다.
13. intent는 base allowed path 누적 합집합이 아니다.
14. deny는 origin을 가진 claim으로 판정한다.
15. `claim.authored_path`가 canonical field다.
16. same path의 non-waivable claim 하나라도 남으면 deny한다.
17. Tier3/custom/generated/other-owner/candidate deny는 waive하지 않는다.
18. forward check와 diff backstop은 같은 trust와 authorization helper를 소비한다.
19. Work Packet/Run Report는 provenance를 재계산하지 않는다.
20. generated ownership을 어떤 target도 우회하지 못한다.
21. shell typed declaration은 물리 권한을 스스로 만들지 않는다.
22. shell positive authority는 policy/layout-owned kind root 안에서만 가능하다.
23. app-shell route-host는 exact optional `app_shell_route_host` root만 사용한다.
24. missing optional target root는 target-local unbound이며 readiness exit 0/permission 0이다.
25. existing mode policy/forbidden/ordinary role의 undefined token은 계속 LayoutConfigError다.
26. no-shell repository는 optional shell role을 resolve하지 않는다.
27. malformed owner declaration이 다른 target의 authority를 넓히지 않는다.
28. app shell decision은 unrelated target에 fan-out하지 않는다.
29. shared-surface member/cap/fan-out 의미는 유지한다.
30. `api_required:false` target은 candidate authority를 얻지 않는다.
31. no-API shell은 API maturity에서 host authority를 잃지 않는다.
32. intent 없는 기존 실행은 기존 의미와 호환된다.

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
| loose Screen Source Map parser reuse | reject | header/table/namespace ambiguity |
| strict capability analyzer | adopt | doctor를 승격하지 않고 권한 relation만 fail closed |
| current leaf only, no time/lineage | reject | reversed/cross-source edge가 stale leaf 생성 |
| explicit `source_lineage` + strict time | adopt | source-specific stable identity와 freshness 분리 |
| infer lineage from `source_ref` | reject | revision pointer/adapter grammar를 generic kit가 재발명 |
| flattened deny 삭제 | reject | Tier3/custom deny 손실 |
| provenance deny claim | adopt | origin/waiver deterministic |
| shell kind를 경로명에서 추론 | reject | unknown layer fail-open |
| typed shell declaration alone | reject | artifact가 임의 physical authority 생성 |
| typed declaration ∩ kind root | adopt | semantic ownership과 policy authority 분리 |
| route-host → `{roles.route_entry}` | reject | broad `src/app/**`가 일반 route를 shell에 개방 |
| exact optional `app_shell_route_host` | adopt | root layout/provider 파일만 명시적 채택 |
| globally optionalize undefined roles | reject | existing forbidden typo가 권한 확대 |
| target-profile-only optional resolver | adopt | missing shell root와 ordinary fail-closed를 분리 |
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

Malformed lifecycle/decision/policy/target contract는 fail closed한다.

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
    captured_at: "2026-08-11T10:00:00+09:00"
    source_type: figma
    source_lineage: figma://file/abc123
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
Input Fidelity v2 warning-first 진단도 capability trust를 자동 차단하지 않는다.

`source_lineage`는 additive optional field다. 일반 input validity와 no-intent repository에는
필수가 아니다. 다만 §10.13 supersession edge가 capability freshness에 사용되면 양 endpoint
모두에 필수다.

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

### 10.10 Screen Source Map capability analyzer

General `parseScreenSourceMap()`/doctor contract를 바꾸지 않고 별도의 analyzer를 둔다.

```text
analyzeScreenSourceMapCapability({
  mapFile,
  raw,
  activeScreens
}) -> {
  map_trusted,
  rows,
  alias_index,
  canonical_index,
  namespace_collisions,
  diagnostics
}
```

Canonical location:

```text
docs/frontend-workflow/_meta/screen-source-map.md
```

Canonical frontmatter:

```yaml
---
artifact_id: screen-source-map
artifact_type: screen-source-map
status: draft
last_reviewed: "2026-08-14"
---
```

`map_trusted=true`는 다음 전체를 만족할 때만 가능하다.

```text
canonical path exactly one
frontmatter exists and parses
artifact_id == screen-source-map
artifact_type == screen-source-map
status is a valid document lifecycle value
non-content stripped before table selection
exactly one canonical mapping table
header exactly equals canonical 10 columns in order
no missing/extra/duplicate header
Canonical Screen ID row value nonempty and unique
all capability aliases parse deterministically
no duplicate alias relation across canonical rows
no canonical Screen ID ↔ source alias namespace collision
```

Canonical 10-column header:

```text
Canonical Screen ID
Domain
Route
ScreenSpec Path
Planning IDs
Design IDs
Figma Node IDs
Source Inputs
Mapping Status
Decision / Notes
```

Alias index는 capability scope에 사용하는 column만 source kind와 함께 index한다.

```text
planning:<token>    ← Planning IDs
design:<token>      ← Design IDs
figma-node:<token>  ← Figma Node IDs
```

`Source Inputs`는 screen alias namespace가 아니므로 affected-screen resolution에 쓰지 않는다.

Row-level capability trust:

- Canonical Screen ID가 active ScreenSpec에 unique하게 해소
- `ScreenSpec Path`가 있으면 해당 active spec path와 exact 일치
- `Route`가 양쪽에 있으면 ScreenSpec route와 exact 일치
- Mapping Status가 enum
- alias token이 한 row 안에서도 중복되지 않음

`confirmed|merged` one-canonical row만 positive scope relation을 만든다.
`candidate|ambiguous|split|deprecated`는 permission 0이다.

#### Namespace collision

Canonical namespace는 active ScreenSpec IDs와 canonical map row IDs의 합집합이다.
Source alias token 문자열이 canonical namespace의 어떤 ID와도 같으면 collision이다.
Same row 여부와 무관하게 capability에 사용할 수 없다.

예:

```text
active canonical: AUTH-001
alias design:AUTH-001 → AUTH-002
```

`AUTH-001`을 direct canonical로 우선하지 않고 `canonical-alias-namespace-collision`으로
fail closed한다. Collision token은 canonical input token과 legacy alias token 양쪽에서
permission 0이다.

Map global structure가 untrusted하면 raw/legacy alias resolution은 전부 disabled다.
Map과 무관한 direct canonical token은 canonical ScreenSpec relation을 사용할 수 있지만,
deterministically recovered namespace collision token은 예외적으로 deny한다.

### 10.11 Scope resolution

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

Token이 active ScreenSpec canonical ID와 exact 일치하고 capability analyzer가 동일 token에
namespace collision을 보고하지 않으면 해당 screen relation을 만든다.

#### Raw source alias scope

권장 grammar:

```text
raw:planning/<source-id>
raw:design/<source-id>
raw:figma-node/<node-id>
```

Raw alias는 `map_trusted=true`일 때만 해소한다.

Legacy unprefixed alias는 backward compatibility를 위해 모든 capability alias namespace에
exact match를 시도한다. 정확히 한 source-kind/one-canonical relation일 때만 허용한다.
여러 alias column 또는 여러 canonical row에 매치되면 ambiguous다.

```text
scope_allows(selected_screen) =
  selected screen in direct canonical relations
  OR selected screen in hard-trusted source-map relations
```

Trusted exact reconciliation target relation은 계속 필수지만 raw alias의 authoritative map을
대체하지 않는다. Raw token 자체는 권한을 만들지 않는다.

Malformed/empty scope는 input artifact trust false 또는 capability scope false다.

### 10.12 Source lineage contract

Additive input frontmatter:

```yaml
source_lineage: figma://file/abc123
```

`source_lineage`는 source-specific producer가 소유하는 opaque stable identifier다.
Generic kit는 trim 외 정규화·추론을 하지 않고 exact equality로 비교한다.

권장 source별 의미:

| Source type | Recommended lineage key |
|---|---|
| figma | stable file key, node/frame/revision 제외: `figma://file/<file-key>` |
| planning-doc | stable document ID: `planning://document/<doc-id>` |
| visual-spec | stable artifact/document ID: `visual-spec://document/<id>` |
| meeting | 동일 회의 thread/series를 실제로 대체할 때만 stable series ID |
| api-doc | stable API document/version family ID |
| qa/testid | 동일 capture stream의 stable producer key가 있을 때만 사용 |

다음은 lineage source로 금지한다.

- `input_id` prefix
- `captured_by`
- `affected_domains`
- file name heuristic
- `source_ref`에서 suffix/node/version을 임의 제거한 값

`source_ref`는 evidence pointer이며 lineage fallback으로 사용하지 않는다.

Supersession edge가 visual capability component에 존재할 때:

```text
both endpoints source_lineage nonempty
AND successor.source_type == predecessor.source_type
AND successor.source_lineage == predecessor.source_lineage
```

Cross-source correction은 `supersedes`로 연결하지 않고 Reconciliation Item에서 conflict,
compatible fact, link-evidence 등 기존 routing으로 합성한다.

### 10.13 Supersession analyzer

Input artifact trust와 v2 Summary trust를 사용해 graph를 만든다.

```text
edge successor -> predecessor
where successor.frontmatter.supersedes == predecessor.input_id
```

Summary `Supersedes`의 `-`/empty는 null로 normalize한다.

Every edge trust:

```text
successor and predecessor input artifacts unique and trusted
frontmatter supersedes == Summary Supersedes
successor.captured_at and predecessor.captured_at parse by shared RFC3339 parser
successor.captured_at_epoch > predecessor.captured_at_epoch
successor.source_type == predecessor.source_type
successor.source_lineage nonempty
predecessor.source_lineage nonempty
successor.source_lineage == predecessor.source_lineage
```

Equal timestamp와 reversed timestamp는 hard-untrusted다. Input ID의 날짜/sequence는
freshness 근거로 사용하지 않는다.

Component trust:

```text
every edge trusted
every referenced predecessor exists
no self edge
acyclic
each predecessor has at most one direct successor
no branch ambiguity
```

Selected input eligibility:

```text
selected input is in trusted graph component
AND selected input has no successor
AND selected input itself is input_artifact_trusted
AND selected input reconciliation is trusted/reconciled
```

Single isolated input에는 lineage field가 필수가 아니다. Supersession edge가 하나라도 있는
component는 모든 edge endpoint에 lineage를 요구한다.

Successor가 존재하면 predecessor fallback은 상태와 무관하게 거부한다.

- successor `reconciled` → current leaf 사용
- successor `not-started|in-progress|failed` 또는 Summary 없음 → predecessor fallback 금지,
  `reconcile latest superseding input <ID>`
- successor artifact hard-invalid → component untrusted, predecessor fallback 금지
- reversed/equal timestamp → component untrusted
- missing/mismatched lineage → component untrusted
- cycle/branch/parity mismatch → fail closed

### 10.14 Final intent evidence formula

```text
intent_evidence_valid =
  selected_input.input_artifact_trusted
  AND selected_input.reconciliation_input_trusted
  AND selected_visual_group_trusted
  AND selected_visual_target_relation_valid
  AND scope_allows(selected_screen)
  AND screen_source_map_relation_trusted_when_used
  AND supersession_component_trusted
  AND selected_input_is_current_leaf
```

### 10.15 Authorization context

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
    captured_at: "2026-08-11T10:00:00+09:00"
    source_type: figma
    source_lineage: figma://file/abc123
    scope_resolution:
      kind: source-map
      map_trusted: true
      source_kind: design
      source_token: J010
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

### 12.4 Kind-specific path grammar

- `route-host`: exact project-relative file only. Glob/subtree ownership is forbidden.
- `shell-host`: exact path or narrow terminal `/**`.
- `hook`: exact path or narrow terminal `/**`.
- `api-client`: exact path or narrow terminal `/**`, candidate slice는 더 좁아야 함.

모든 kind에서 absolute/drive/UNC/root escape/arbitrary wildcard/blanket root를 금지한다.

### 12.5 Policy-owned target profile

Kind→root mapping은 kit policy-owned이며 shell-spec이 작성하지 않는다.

```yaml
target_profiles:
  app-shell-v1:
    optional_path_roots:
      route-host:
        role: app_shell_route_host
        binding: exact-file
      shell-host:
        role: app_shell_host
        binding: covered
      hook:
        role: app_shell_hook
        binding: covered
    required_path_roots:
      api-client:
        role: api_client
        binding: covered
```

`route-host`는 `{roles.route_entry}`를 재사용하지 않는다.

### 12.6 Optional target-root resolver

정확한 helper 이름은 구현 관례에 맞출 수 있지만 의미는 다음으로 고정한다.

```text
resolveOptionalTargetRoot({
  layout,
  role,
  target_profile,
  kind,
  domain: null
}) -> {
  bound: boolean,
  globs: string[],
  reason: null | "optional-role-missing"
}
```

허용 boundary:

```text
role ∈ {
  app_shell_route_host,
  app_shell_host,
  app_shell_hook
}
AND caller is app-shell target-profile root binding
```

Missing optional role은 throw하지 않고 `bound:false, globs:[]`를 반환한다. 해당 kind entry는
positive permission 0이며 shell readiness/result에 `kind-root-unbound`를 남긴다.

다음은 절대 바꾸지 않는다.

```text
layout.resolvePaths(...)
requireRole(...)
ordinary mode policy role tokens
forbidden_paths role tokens
Tier3 built-in role tokens
screen/shared/candidate role resolution
```

이 surface에서 undefined role은 계속 `LayoutConfigError`이며 CLI/config error exit 2다.

Optional resolver는 lazy하다.

- app-shell artifact가 없으면 호출하지 않는다.
- app-shell artifact가 있어도 해당 kind declaration이 없으면 그 optional role을 해소하지 않는다.
- no-shell repository는 new optional role 부재 때문에 state/readiness가 달라지지 않는다.
- `api_client`는 required slot이므로 undefined이면 기존 `LayoutConfigError`다.

### 12.7 Layout-owned role bindings

`project-layout.yaml` example:

```yaml
roles:
  app_shell_route_host:
    - src/app/_layout.tsx
    - src/app/(authenticated)/_layout.tsx
  app_shell_host:
    - src/components/app-shell/host/**
  app_shell_hook:
    - src/features/app-shell-runtime/hooks/**
```

Rules:

- New three roles are optional and default Expo preset has no binding.
- `app_shell_route_host` values are exact files only; terminal `/**`도 금지한다.
- route host file name을 `_layout.tsx`로 전역 hardcode하지 않는다. Consumer router의 actual
  host boundary를 exact list로 채택한다.
- `app_shell_host`/`app_shell_hook`은 narrow role roots다.
- Role root는 project-relative, canonical, representable해야 한다.
- `src/**`, `src/app/**`, project root, `docs/**`, package-level blanket은 금지한다.

### 12.8 Root safety

App-shell target-profile roots between kinds must be disjoint after canonical resolution.

```text
app_shell_route_host
app_shell_host
app_shell_hook
api_client
```

`app_shell_route_host`는 existing broad `route_entry` surface의 subset일 수 있지만,
`route_entry`는 shell positive root로 사용되지 않는다. Global ownership index가 actual
ScreenSpec `route_entry` claim과의 conflict를 별도로 검사한다.

### 12.9 Root binding

```text
root_binding(entry) =
  exactly one resolved root of entry.kind authorizes entry.path
  AND no root of a different app-shell kind overlaps entry.path
```

Kind-specific authorization:

```text
route-host:
  entry.path exactly equals one app_shell_route_host exact file

shell-host/hook/api-client:
  exactly one same-kind root fully covers entry.path
```

Cases:

- zero matching roots → `kind-root-unbound`
- multiple matching roots after canonical dedupe → `kind-root-ambiguous`
- different-kind sensitive root overlap → `kind-contradiction`
- valid unique binding → positive authority candidate

### 12.10 Route-host boundary

App-shell route host는 router layout/provider boundary다. 일반 screen route는 아니다.

```text
src/app/_layout.tsx
```

can be accepted only when exact `app_shell_route_host` binding exists.

```text
src/app/orders.tsx
```

is denied unless it is explicitly listed as an app-shell route host root. First slice guidance is
not to list ordinary route files. Presence/absence of a ScreenSpec does not expand the root.

Therefore:

- ordinary route without ScreenSpec cannot be adopted merely because it is under `src/app/**`.
- existing screen `route_entry` always conflicts through global ownership.
- broad route-entry policy root does not grant shell ownership.

### 12.11 Declaration versus authority

```text
typed declaration
  = semantic classification + narrow ownership reservation

positive physical authority
  = trusted typed declaration
  ∩ resolved policy/layout kind root
  ∩ maturity path-kind profile
  - active deny claims
```

Examples:

```yaml
- path: src/api/app-shell/**
  kind: shell-host
```

→ `api-client` contradiction, permission 0, recoverable deny-only.

```yaml
- path: package.json
  kind: shell-host
```

→ shell-host root unbound, permission 0, recoverable deny-only.

```yaml
- path: src/app/orders.tsx
  kind: route-host
```

→ absent exact `app_shell_route_host` binding, permission 0, recoverable deny-only.

```yaml
- path: src/features/payments/components/**
  kind: shell-host
```

→ cannot acquire ownership unless an explicit adopted `app_shell_host` root covers it, and remains
subject to other-owner reservation.

### 12.12 Invalid typed entries

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

Missing optional role itself is not a global layout usage error. It is a target-local unbound
binding. `workflow:validate` may report a hard app-shell authorization defect, while
`workflow:readiness --app-shell` returns keyed output/exit 0 with permission 0.

### 12.13 Body ownership

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

### 12.14 Fact profile

| Mode | Target-specific minimum |
|---|---|
| docs-only | artifact parse result only |
| route-skeleton | valid identity/status/navigation map + trusted root-bound route-host when code path requested |
| screen-skeleton | core sections + nonempty trusted root-bound host paths |
| rough-fixture-ui | state/non-route interaction complete |
| final-fixture-ui | confirmed + Visual Ownership complete |
| api-integrated-ui | no-API special case or valid actionable candidate |
| production-ready | existing CI/schema/state/review facts |

### 12.15 Normal path envelope

| Mode | Positive kinds |
|---|---|
| docs-only | none |
| route-skeleton | exact root-bound route-host |
| screen-skeleton | root-bound route-host/shell-host |
| rough/final | host kinds + valid owned active hook candidate slices |
| api-integrated | valid owned active hook/API-client slices; host frozen |
| production-ready | root-bound host + valid active slices; unowned hook/API denied |

### 12.16 No-API profile

```text
if api_required == false and readiness >= api-integrated-ui:
  effective_path_profile = no-api-host
```

Allowed:

```text
exact root-bound route-host
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
- optional root missing / root-unbound / kind contradiction with narrow path
- ordinary route declared route-host without exact root
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
  path: src/app/orders.tsx
  authored_path: src/app/orders.tsx
  deny_class: ambiguous-owner
  source:
    kind: app-shell-reservation
    shell_id: MAIN-SHELL
    contract_valid: false
    reason: kind-root-unbound
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
- required ordinary role/config resolution failure

Evidence/map/scope/supersession failure and missing optional shell root are keyed denial or
`applicable:false`, exit 0 for readiness.

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
      - path: src/app/_layout.tsx
        kind: route-host
        root_binding:
          role: app_shell_route_host
          root: src/app/_layout.tsx
          valid: true
      - path: src/components/app-shell/host/**
        kind: shell-host
        root_binding:
          role: app_shell_host
          root: src/components/app-shell/host/**
          valid: true
    ownership_claims:
      - path: src/app/_layout.tsx
        owner_state: valid
    derived:
      contract_errors: []
      path_errors: []
      decision_refs: []
```

### 17.2 Missing optional root

```yaml
app_shells:
  MAIN-SHELL:
    readiness_mode: docs-only
    implementation_paths:
      - path: src/app/_layout.tsx
        kind: route-host
        root_binding:
          role: app_shell_route_host
          valid: false
          reason: optional-role-missing
    deny_only_ownership:
      - path: src/app/_layout.tsx
        reason: kind-root-unbound
```

Readiness exits 0 and grants no positive path. Existing global layout resolver is not relaxed.

### 17.3 Input trust indexes

State need not serialize all internal analyzer details. Readiness may load analyzers directly.
If serialized for report reuse, values must be deterministic and carry source/version hashes;
stale generated trust cannot be accepted without matching input/register/map sources.

### 17.4 Determinism

Sort shell IDs, source paths, claims, graph nodes, alias indexes, collision diagnostics, and
trust results. Existing screen/surface shape remains additive-compatible.

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
        "captured_at": "2026-08-11T10:00:00+09:00",
        "source_lineage": "figma://file/abc123",
        "scope_relation": {
          "kind": "source-map",
          "map_trusted": true,
          "source_kind": "design",
          "source_token": "J010",
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

### 18.2 Reversed supersession edge

```json
{
  "CREATE-ATTACH": {
    "work_intent": {
      "name": "visual-refresh",
      "input_id": "IN-20260801-figma-002",
      "applicable": false,
      "evidence": {
        "current_leaf": false,
        "supersession_component_trusted": false,
        "hard_error_codes": ["supersession-timestamp-not-later"],
        "edge": {
          "successor": "IN-20260801-figma-002",
          "predecessor": "IN-20260814-figma-001"
        }
      },
      "allowed_paths": []
    }
  }
}
```

### 18.3 Cross-lineage supersession

```json
{
  "work_intent": {
    "name": "visual-refresh",
    "applicable": false,
    "evidence": {
      "supersession_component_trusted": false,
      "hard_error_codes": ["supersession-source-lineage-mismatch"]
    },
    "allowed_paths": []
  }
}
```

### 18.4 Untrusted Screen Source Map

```json
{
  "work_intent": {
    "name": "visual-refresh",
    "applicable": false,
    "evidence": {
      "scope_relation": {
        "kind": "source-map",
        "map_trusted": false,
        "hard_error_codes": [
          "screen-source-map-duplicate-header",
          "screen-source-map-namespace-collision"
        ]
      }
    },
    "allowed_paths": []
  }
}
```

### 18.5 Missing app-shell route root

```json
{
  "MAIN-SHELL": {
    "target_type": "app-shell",
    "readiness_mode": "docs-only",
    "path_authorization": {
      "file": "src/app/_layout.tsx",
      "allowed": false,
      "owner_state": "deny-only",
      "causes": [
        {
          "kind": "kind-root-unbound",
          "role": "app_shell_route_host",
          "optional_role_missing": true
        }
      ]
    }
  }
}
```

### 18.6 Existing policy undefined role

This remains a configuration error, not keyed shell denial.

```text
layout-profile: undefined ordinary role
→ LayoutConfigError
→ CLI exit 2
```

### 18.7 No-API shell

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

### 18.8 Field stability

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
- supersession graph with timestamp/lineage trust
- app-shell typed paths/root binding
- optional target-root resolution
- ownership/deny claims

Validate adapters retain existing public diagnostic shapes and warning-first boundaries.

### 19.2 Screen Source Map capability boundary

General doctor remains warning-first. Capability analyzer hard trust is consumed only when a map
relation is used for code authorization.

At minimum test actual raw table objects, not rendered projections, for:

- exact frontmatter
- exact unique 10-column header
- duplicate table/header
- duplicate canonical row
- duplicate/ambiguous alias
- canonical-ID/source-alias namespace collision

### 19.3 Optional root boundary

Target-profile optional root lookup never changes the semantics of `layout.resolvePaths()` or
`requireRole()`.

```text
optional app-shell slot missing
→ target binding invalid
→ keyed readiness exit 0, permission 0

ordinary policy/forbidden role missing
→ LayoutConfigError
→ exit 2
```

No-shell repository never invokes optional shell root lookup.

### 19.4 Authorization order

```text
1 concrete canonicality
2 target/lifecycle/contract validity
3 input artifact trust
4 reconciliation trust
5 visual target relation
6 Screen Source Map capability trust when used
7 scope resolution
8 supersession timestamp/lineage/current leaf
9 intent prerequisite or base readiness
10 optional/required shell root resolution
11 shell root binding / no-API profile
12 positive profile match
13 ownership/generated/candidate denies
14 claim waiver
15 remaining deny precedence
16 structured provenance
```

### 19.5 Diff backstop

Forward and diff consume the same context. Visual backstop requires `--input`; shell backstop
uses the same optional resolver, exact route roots, root bindings, and deny-only reservations.

### 19.6 Work Packet / Run Report

Copy:

- input artifact trust
- reconciliation trust
- map trust and namespace diagnostics
- scope relation
- source lineage
- supersession timestamp/lineage/current leaf
- selected item groups
- optional root presence/root binding
- waived and active deny claims
- owner state

Never recompute.

### 19.7 Warning-first boundary

General doctor/visual warnings remain warning-first. Strict capability resolvers only deny use as
authorization evidence. Existing warning-first checks are not promoted to required CI.

---

## 20. Doc/Skill Ownership

| Surface | Follow-up |
|---|---|
| input artifact/reference | additive `source_lineage` semantics and producer ownership |
| input reconciliation | v2 trust and supersession parity |
| screen identity | hard-trusted source-map capability relation/namespace rules |
| project layout | optional `app_shell_route_host`/`app_shell_host`/`app_shell_hook` roles |
| implementation policy | app-shell target profile and optional/required root slots |
| layout-profile code | target-only optional resolver; ordinary fail-closed unchanged |
| app-shell reference | typed declarations, exact route roots, no-API, recovery |
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
| isolated input without source_lineage | allowed if otherwise trusted; no supersession edge |
| supersession edge missing lineage | component untrusted, intent permission 0 |
| later same-lineage successor | graph trusted candidate |
| reversed/equal timestamp | graph untrusted |
| cross-source/cross-lineage supersession | graph untrusted |
| raw alias + trusted confirmed/merged map | may establish scope |
| malformed/frontmatter-less/duplicate map | no alias capability |
| canonical/alias namespace collision | collision token denied |
| selected input superseded | no permission |
| newer input incomplete | old fallback forbidden |
| no Screen Source Map and canonical affected screen | direct relation works |
| no app-shell | no optional root resolution; no new required key/file |
| shell route root absent | authoring possible, route permission 0, exit 0 |
| shell host/hook root absent | authoring possible, corresponding permission 0, exit 0 |
| existing ordinary policy undefined role | unchanged LayoutConfigError/exit 2 |
| valid exact app_shell_route_host binding | route-host permission possible |
| ordinary src/app route | cannot gain shell authority from route_entry broad root |
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
3. For a revision intended to supersede another capture, emit stable `source_lineage` on both
   generations and ensure strictly later `captured_at`.
4. Reconcile under Contract v2.
5. Ensure input is current trusted supersession leaf.
6. Resolve scope through canonical ID or hard-trusted source map.
7. Run readiness with `--intent` and `--input`.
8. Check each concrete path.
9. Validate and report provenance.

Old superseded input is never fallback. Existing supersession chains without lineage remain valid
for historical documentation but cannot authorize visual-refresh until re-captured/reconciled with
an explicit trusted lineage; generic kit does not invent the missing value.

### 22.2 #223

1. Preserve decision rows.
2. Add app-shell-spec draft.
3. Add exact `app_shell_route_host` files and narrow host/hook role bindings as needed.
4. Declare typed paths within those roots.
5. Link decision refs.
6. Regenerate state.
7. Check shell/screen/shared paths.
8. Validate and run backstop.

Do not bind `app_shell_route_host` to `src/app/**`. Enumerate actual root layout/provider files.
String-only or outside-root paths are not auto-inferred; recoverable invalid paths remain deny-only
until fixed.

---

## 23. Implementation Slices

### 23.1 Slice A — #222

Scope:

- Input Result Contract analyzer trust
- additive source lineage parsing/provenance
- Reconciliation v2 analyzer trust
- strict visual-family resolver
- strict Screen Source Map capability analyzer
- namespace collision index
- supersession timestamp/lineage/current leaf
- deny claim provenance/waiver
- evidence-bound visual-refresh
- CLI intent/input
- forward/backstop parity
- packet/report provenance

Excludes app-shell artifact and #224.

Acceptance:

- no-intent compatibility
- hard-valid current input only
- canonical or hard-trusted authoritative scope only
- stale/reversed/equal/cross-lineage input denied
- screen/domain-component only
- Tier3/candidate/delegated/generated denied

### 23.2 Slice B — #223

Depends on Slice A authorization substrate.

Scope:

- app-shell template/schema/manifest
- target profile optional/required kind roots
- exact optional `app_shell_route_host`
- optional target-root resolver
- existing resolver fail-closed preservation
- typed path/root analyzer
- no-API host envelope
- generic candidate owner
- valid/deny-only ownership index
- state/readiness/validate/backstop
- skill/docs/distribution/migration

Acceptance:

- declaration alone creates no physical authority
- broad route_entry never grants shell route ownership
- ordinary route cannot become shell host without exact root binding
- missing optional role is keyed permission 0/exit 0
- ordinary undefined role remains LayoutConfigError/exit 2
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
| input | `scripts/lib/input-artifact.mjs`, producer/template/reference as needed, tests |
| reconciliation | `scripts/lib/reconciliation-items.mjs`, tests |
| identity | `scripts/lib/screen-source-map.mjs` or strict capability helper |
| visual | `scripts/lib/visual-consistency.mjs` or strict helper |
| core | readiness/path authorization |
| backstop | forbidden-paths |
| execution | packet/report |
| docs/skills | implement-screen, Stage 06/08, commands |

### Slice B

| Area | Expected files |
|---|---|
| layout/policy | project-layout profile/schema, implementation target profile |
| resolver | layout-profile optional-target-root helper and tests |
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
| 17 | raw design alias + trusted confirmed map + exact target accepted |
| 18 | raw alias + trusted merged unique one-canonical map accepted |
| 19 | raw alias candidate/ambiguous/split denied |
| 20 | raw alias missing map denied |
| 21 | map frontmatter missing/malformed/wrong artifact identity denied for alias capability |
| 22 | map canonical table missing or duplicate denied |
| 23 | map exact 10-column header mismatch/extra/duplicate denied |
| 24 | duplicate Canonical Screen ID row denied |
| 25 | duplicate alias relation denied |
| 26 | canonical Screen ID also source alias of another row → collision token denied |
| 27 | malformed/empty scope denied |
| 28 | exact ScreenSpec visual section accepted |
| 29 | sibling mapping screen mismatch denied |
| 30 | exact visual family member accepted |
| 31 | whole visual artifact/section denied |
| 32 | duplicate/malformed family denied |
| 33 | superseded trusted input denied |
| 34 | latest trusted leaf accepted |
| 35 | latest input not-started/in-progress/failed blocks old fallback |
| 36 | newer hard-invalid input blocks old fallback |
| 37 | supersession cycle denied |
| 38 | supersession branch denied |
| 39 | Summary/frontmatter supersedes mismatch denied |
| 40 | reversed captured_at edge denied |
| 41 | equal captured_at edge denied |
| 42 | same source_type but different source_lineage denied |
| 43 | cross-source_type supersession denied |
| 44 | missing source_lineage on an edge denied |
| 45 | valid strictly later same-lineage successor accepted |
| 46 | source_ref similarity alone does not establish lineage |
| 47 | isolated trusted input without lineage accepted when no edge exists |
| 48 | final-level decision blocks intent |
| 49 | API-only higher blocker does not block final visual work |
| 50 | absorbed/malformed lifecycle denied |
| 51 | delegated/shared/shell reservation denied |
| 52 | candidate paths denied |
| 53 | actual claim authored_path waiver succeeds |
| 54 | same-path Tier3 claim remains deny |
| 55 | custom layout retains claim origin |
| 56 | forward/backstop same evidence/map/lineage/result |
| 57 | packet/report copies trust/map/lineage/leaf/claims |
| 58 | legacy no-intent fixtures compatible |

### 25.2 #223

| # | Regression |
|---|---|
| 1 | no app-shell artifact no-op and optional roots are not resolved |
| 2 | valid identity/state deterministic |
| 3 | shell decision caps shell only |
| 4 | malformed decision fails shell only |
| 5 | local Open Decisions rejected |
| 6 | forbidden identity fields rejected |
| 7 | string-only/missing kind denied |
| 8 | missing app_shell_route_host role → route entry unbound, permission 0, readiness exit 0 |
| 9 | explicit exact root layout/provider file accepted as route-host |
| 10 | `src/app/orders.tsx` denied despite broad route_entry role |
| 11 | route file without ScreenSpec cannot acquire shell authority |
| 12 | existing ScreenSpec route_entry conflicts even when exact shell root is configured |
| 13 | app_shell_route_host subtree/broad glob binding rejected |
| 14 | shell-host with explicit app_shell_host root accepted |
| 15 | missing app_shell_host role gives permission 0/exit 0 |
| 16 | missing app_shell_hook role gives hook permission 0/exit 0 |
| 17 | unrelated existing policy references undefined role → LayoutConfigError/exit 2 |
| 18 | no-shell repo missing optional roles remains byte/semantic compatible |
| 19 | `src/api/**` declared shell-host is contradiction/deny-only |
| 20 | `package.json` declared shell-host unbound/deny-only |
| 21 | another domain component cannot be acquired by declaration |
| 22 | distinct app-shell kind roots overlap → target profile invalid |
| 23 | broad app-shell host/hook role root rejected |
| 24 | valid active same-shell candidate reaches API mode |
| 25 | candidate requires trusted root-bound hook/API entry |
| 26 | outside/wrong-kind/root-unbound candidate denied |
| 27 | cross-target candidate overlap denied |
| 28 | deferred/invalid candidate deny-only |
| 29 | no-API candidate authority 0 |
| 30 | no-API API maturity preserves exact root-bound route/shell host |
| 31 | no-API denies all hook/API/candidate |
| 32 | no-API production-ready still denies hook/API |
| 33 | shell-screen entry overlap denied |
| 34 | shell-shared overlap denied |
| 35 | shell-shell overlap denied |
| 36 | valid shell path reserved from other targets |
| 37 | missing-kind path permission 0 and globally reserved |
| 38 | optional-role-missing path permission 0 and globally reserved |
| 39 | ordinary route declared shell route-host remains deny-only until fixed |
| 40 | safely canonicalizable alias deny-only |
| 41 | kind contradiction recoverable path deny-only |
| 42 | absolute/drive/UNC/root escape no physical claim |
| 43 | duplicate identity preserves all recoverable denies |
| 44 | overlapping entries preserve deny-only |
| 45 | production-ready `src/**` cannot bypass |
| 46 | empty paths authoring valid, permission 0 |
| 47 | Tier3 deny overrides valid root binding |
| 48 | selector/ID errors exit 2 |
| 49 | deterministic state/readiness |
| 50 | forward/backstop parity for optional roots/route boundary/no-API/recovery |
| 51 | distribution includes new payload |

Implementation PRs also run existing fixture-hook, candidate deferral, shared-surface, Open
Decision, layout-profile fail-closed, readiness fail-open/redteam, path-backstop, distribution,
and upgrade regressions.

---

## 26. Risks / Known Limits

1. Contextless diff cannot infer intended target; explicit owner path remains conservative.
2. Trust analyzers must preserve public diagnostic ordering.
3. Strict source-map/family resolvers are capability gates, not global hard promotion.
4. Map global trust is conservative: one structural defect disables raw alias capability until fixed.
5. Canonical/alias namespace collision denies the token instead of selecting a precedence.
6. `source_lineage` is explicit producer-owned metadata; generic kit cannot recover missing lineage.
7. Historical supersession chains without lineage cannot authorize visual-refresh without a new
   trustworthy capture; no value is invented.
8. Strict timestamp ordering rejects equal-time batch captures as supersession. Such inputs should
   be independent or use distinct later capture timestamps.
9. Deny-only recovery can temporarily lock malformed paths.
10. Optional app-shell roots require explicit consumer adoption.
11. Exact route-host root enumeration adds migration work but prevents broad route ownership.
12. Shell visual-refresh remains future scope.
13. Design-only CI does not prove new behavior.

---

## 27. Resolved Decisions

| ID | Decision |
|---|---|
| D1 | readiness maturity formula/order 유지 |
| D2 | screen-only visual-refresh requires `--input` |
| D3 | Input Result Contract analyzer trust required |
| D4 | Reconciliation v2 analyzer trust required |
| D5 | exact visual target relation required |
| D6 | Screen Source Map has separate capability hard trust |
| D7 | canonical/alias namespace collision fails closed |
| D8 | canonical/direct or hard-trusted source-map scope required |
| D9 | selected input must be current trusted supersession leaf |
| D10 | supersession edge requires strictly later captured_at |
| D11 | supersession edge requires exact same source_type/source_lineage |
| D12 | source_lineage is explicit producer-owned metadata, not inferred from source_ref |
| D13 | deny claim top-level authored_path and exact waiver |
| D14 | visual profile is screen/domain-component only |
| D15 | dedicated optional app-shell-spec |
| D16 | typed shell declaration does not self-grant authority |
| D17 | policy target profile + layout role roots own physical ceiling |
| D18 | route-host uses exact optional app_shell_route_host, not route_entry |
| D19 | optional target-root resolver is lazy and target-local |
| D20 | ordinary undefined role keeps LayoutConfigError fail-closed |
| D21 | optional app_shell roles have no broad defaults |
| D22 | generic API Candidate owner |
| D23 | no-API shell uses no-api-host profile |
| D24 | recoverable invalid shell path remains deny-only |
| D25 | six-column Open Decision schema reused |
| D26 | global physical ownership namespace |
| D27 | #222 implemented before #223 |
| D28 | no-intent/no-shell compatibility preserved |

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
- reversed/equal/cross-lineage supersession acceptance
- `source_ref` heuristic lineage
- raw alias without hard-trusted relation
- Screen Source Map loose parser를 capability에 직접 사용
- namespace collision precedence 선택
- shell declaration-only physical authority
- route_entry broad root를 route-host에 재사용
- global undefined-role relaxation
- default broad shell root
- no-API hook/API authority
- malformed reservation 제거
- Open Decision schema 변경
- generic app-surface expansion

Baseline에서 재검증한 계약:

- readiness/policy/layout
- `LayoutConfigError`/`requireRole` fail-closed
- Input Result Contract
- Reconciliation Contract v2
- Screen Source Map template/parser/status model
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
- strict Screen Source Map capability trust
- timestamp/source-lineage supersession trust
- policy-owned shell roots
- exact optional route-host role
- optional resolver/ordinary fail-closed separation
- no-API host preservation
- deny-only malformed recovery
- `claim.authored_path` consistency

이 설계 PR은 design-only다. Branch CI는 기존 regression을 검증하지만 #222/#223 behavior가
이미 구현됐다는 증거로 사용하지 않는다.
