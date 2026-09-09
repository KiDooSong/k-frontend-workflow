# 작업 단위 실행 계약 v1 — 비순차 입력과 부분 구현

- 상태: **제안 / B 설계 전용 / 구현 없음**
- 추적: [#238](https://github.com/KiDooSong/k-frontend-workflow/issues/238), 상위 [#239](https://github.com/KiDooSong/k-frontend-workflow/issues/239)
- 조사 기준: `90d9a10e1f41d24be08317bb683934d06ad0fae6` (PR #235 반영 main)
- 작성일: 2026-09-10
- 사용자 요구: #238의 12개 선택 및 Q1/Q2/Q10 보충. 이 문서의 기술 선택은 별도 리뷰 대상이다.
- 경계: B는 이 파일만 추가한다. 아래 YAML/JSON/CLI는 **C/D에서 구현할 제안**이지 현재 지원 기능이 아니다.

## 1. 결정 요약

화면 전체 `readiness_mode`를 조작하지 않고, **현재 근거로 수행할 작업과 실제 변경 경로**를 별도로 판정한다.
기존 모드 사다리와 출력은 미채택 consumer에서 그대로 유지한다. 새 경로도 제품 승인·머지·출시를 판정하지 않는다.

선택한 방법은 기존 계약에 붙이는 opt-in **작업 단위(work unit)** 이다. 단위는 세션/PR 번호가 아니라
`result-layout`, `result-data`, `save-action` 같은 재사용 가능한 제품 작업 범위다. 평범한 작업은 기존 경로를 사용한다.
새 지원이 필요한 owner에만 단위와 연결 근거를 선언하고, 매 실행마다 새로운 수동 계획서/승인서를 만들지 않는다.

| 결정 | 선택 |
|---|---|
| 기존 readiness | 현재의 누적 모드 요약과 legacy 권한 계산을 보존한다. 이를 전체 제품 완성도/출시 점수로 재명명하지 않는다. |
| 작업 선택 | 요청에서 agent가 단위와 필요한 경로를 고르고 도구가 검증한다. caller의 선택 자체는 허가가 아니다. |
| 모드와 독립된 근거 | `visual`, `api-contract`, `behavior` 세 종류의 고정 predicate로 출발한다. 임의 플러그인/식 언어는 만들지 않는다. |
| 미결 결정 | canonical 결정의 영향 범위를 명시적으로 연결한다. 범위 미선언은 보수적으로 적용하며 자동으로 무관하다고 판단하지 않는다. |
| 큰 입력 | 관련 범위의 reconcile/review checkpoint로 종료·머지·재개한다. 입력 전체 완료를 가장하지 않는다. |
| 품질 | 허용된 시각은 가용 근거대로 충실히 구현한다. rough 모드라는 이유로 근거를 무시하지 않는다. |
| 검증 | 코드 변경, 실행한 검사, 미실행/실패, 시각 확인을 분리한다. 캡처 부재만으로 새 머지 gate/Draft 의무를 만들지 않는다. |
| 도입 | 대표 owner부터 활성화한다. 기존 권한을 일괄 합치거나 과거 모드/결정을 자동 복구하지 않는다. |

**버린 대안:** 모든 하위 모드 allowed 합집합(비단조 forbidden/claim 우회), 강제 production-ready/가짜 결정,
프롬프트에만 의존한 예외, 매 세션 사람이 작성하는 work permit, 모든 TypeScript 동작을 판정하는 semantic hard gate.

## 2. 현행 코드와 변경 필요성

아래 경로는 조사 SHA에 존재하는 정본/구현이다. 현재 동작과 제안을 혼동하지 않는다.

| 표면 | 현재 사실 | 처분 |
|---|---|---|
| [mode policy](../../../../frontend-workflow-kit/policies/implementation-mode-policy.yaml), [legacy readiness](../../../../frontend-workflow-kit/scripts/readiness-legacy.mjs) | 누적 prerequisite 사다리지만 api-integrated는 screen을 forbid한다. `blocking`은 상위 모드 미충족도 포함한다. | 모드를 고쳐 우회하지 않는다. C는 현재 허용, D는 독립 predicate를 다룬다. |
| [public readiness](../../../../frontend-workflow-kit/scripts/readiness.mjs) | intent 없음은 legacy로 위임, intent 있음은 visual CLI로 보낸다. | 명시적 work selector를 별도 분기로 추가한다. 기존 옵션 의미를 덮어쓰지 않는다. |
| [implement-screen](../../../../frontend-workflow-kit/skills/implement-screen/SKILL.md), [runner model](../../../../frontend-workflow-kit/scripts/lib/workflow-run.mjs) | skill은 blocking 시 중단, runner clean 조건도 blocking_count=0 등을 요구한다. | C에서 현재 범위의 실행 가능성과 상위 미충족을 구분한다. legacy runner 결과를 사후 성공으로 바꾸지 않는다. |
| [path backstop](../../../../frontend-workflow-kit/scripts/lib/path-backstop.mjs) | concrete path, project-wide API claims, owner, deferred/conflict, no-API 제약이 함께 적용된다. | claim/소유권 제약을 재사용한다. readiness_mode를 가짜로 바꿔 helper를 통과시키지 않는다. |
| [visual reference](../../../../frontend-workflow-kit/docs/reference/visual-reconciliation.md), [authority](../../../../frontend-workflow-kit/scripts/lib/visual-refresh-authority.mjs) | 기존 visual-refresh는 정확한 input/기존 screen 파일, reconciled+accepted 등 좁은 조건을 사용한다. | v1 조건을 약화하지 않는다. partial/새 파일/복수 owner는 새 work 분기에서만 다룬다. |
| [shared surface](../../../../frontend-workflow-kit/docs/reference/shared-surfaces.md) | domain surface/member 경로 교집합과 decision fan-out이 있다. 일반 screen의 broad allow로 delegated path를 열 수 없다. | shared owner 및 모든 영향 host를 각각 평가한다. #223 global shell을 임의 surface로 꾸미지 않는다. |
| [reconcile skill](../../../../frontend-workflow-kit/skills/reconcile-input/SKILL.md), [review rubric](../../../../frontend-workflow-kit/docs/reference/reconcile-review-rubric.md) | 부분 checkpoint, 누적 Items, review floor가 이미 있다. partial은 구현 허가가 아니다. | 기존 기록을 재사용하되 selected coverage에 대한 좁은 연결만 추가한다. |
| [doc ownership](../../../../frontend-workflow-kit/docs/reference/doc-ownership.md) | 입력/행동/결정/생성물/실행 지침의 소유권을 분리한다. | 제품 사실·결정 Status를 work unit으로 복제하지 않는다. |

### C와 D를 가르는 재현 사례

- 현재 rough-fixture의 exact screen/hook 경로가 helper에서 허용되지만 상위 API blocker 때문에 실행자가 정지한다: **C**.
- 같은 화면이 api-integrated이고 기존 v1 visual-refresh 조건을 충족한다: **기존 v1 경로의 올바른 선택/C 안내**.
- input이 partial이거나 시각 구현에 새로운 화면 전용 파일이 필요하여 v1이 거부한다: **D**.
- 디자인 미완료로 누적 모드를 못 올리지만 API 계약 자체는 확정되어 client/계약 테스트를 만들 수 있다: **D**.
- shared path가 다른 owner 소유라 거부된다: **위임/복수 owner 평가**. C가 screen의 권한을 넓혀 해결하지 않는다.
- source/identity/ownership/정책 선언이 손상됐다: **유효한 거부**. 작업 종류를 바꿔 회피하지 않는다.

## 3. 실행 흐름과 종료 지점

### 3.1 작은 요청

요청 → 필요한 근거만 수집/대조 → 현재 작업 판정 → 허용 부분 구현 → 관련 검사 → 보고/PR.
단계가 바뀌었다는 이유로 사용자의 같은 요청을 다시 받지 않는다. read-only 요청을 구현 요청으로 확대하지 않는다.

### 3.2 도메인 수십 장의 인입

추출/정규화 → canonical input → 이번 범위 reconcile → **Stage 04 review checkpoint** →
머지/핸드오프 → 필요한 제품 질문을 묶어 확인 → 국소 작업 선택 → 구현/검증.
같은 세션에서 이어가도 되고 checkpoint에서 정상 종료해도 된다. 이는 전 화면 구현 실패가 아니다.

완료 범위, 미처리 원문 pointer, 누적 effect, 남은 질문, 재개 행동은 기존 Register/Notes/PR 보고가 소유한다.
같은 immutable input의 세션 분할로 새 input_id/supersedes를 만들지 않는다. 아직 추출하지 않은 내용을
전사 완료라고 주장하거나, input bytes를 몰래 덧붙여 동일 snapshot이라고 표시하지 않는다.
실제 새 snapshot/추출 내용 변화는 기존 input 계약에 따른 새 입력이다. 원천별 추출 도구는 consumer 소관이다.

Stage 04는 이번 routing/source-backing/raise-only/coverage를 리뷰한다. downstream 구현·최종 디자인 승인·
열린 제품 결정 해결을 pass 조건으로 끌어오지 않는다. 실제 in-scope 결함은 수정하되 필수 finding은 한 번에 모은다.
한 라운드 성공이나 n회 이후 자동 승인은 보장하지 않는다. 새 review engine이나 자동 무한 재시도는 없다.

## 4. 두 실행 경로

### 4.1 C: `current` — 기존 권한 그대로

현재 요청 mode가 현재 상한 이내인지, owner가 active/valid인지, **요청한 모든 concrete path를 기존 helper가
허용하는지** 확인한다. 더 낮은 mode의 policy 경로를 가져오거나, `allowed_paths`를 합치거나,
`readiness_mode`/`blocking`을 덮어써 통과시키지 않는다.

상위 모드 prerequisite와 유효한 decision cap 위의 제한은 `future_requirements`로 보여준다.
기존 helper를 통과한 것 외에도 unresolved execution ambiguity를 판정할 수 없으면 중단한다.
특히 malformed state/policy/lifecycle/refs, 불명확한 packet D/U 후보, input의 실제 미처리 의존을
`blocking_count`만 보고 무시하지 않는다. 코드별 분류가 없는 후보는 보수적으로 남긴다.
C는 selected request를 사용한 새 실행 eligibility를 만들 뿐, 과거 HALT를 권한 승인으로 재해석하지 않는다.

### 4.2 D: `scoped` — 승인된 채택 영역에서의 독립 작업

실행의 논리식은 다음이다. 어떤 항목도 requester의 `allowed:true` 같은 값으로 대체할 수 없다.

```text
permit(owner, unit, path, change, snapshot) =
  valid_current_owner_and_resources
  AND adopted_owner_and_profile
  AND valid_declared_unit_and_relevant_coverage
  AND operation_predicates_satisfied
  AND no_applicable_open_or_unresolved_decision
  AND path_within_owner_envelope_and_operation_roles
  AND no_project_wide_deny_or_conflicting_claim
  AND supported_change_kind_and_snapshot
```

기존 cumulative phase의 제한만 scoped predicate가 대체한다. source/decision/schema/owner/generated/claim 제한은
대체하지 않는다. scope가 있어도 어떤 경로도 선언하지 않았다면 code 권한은 없다.
단위에 필요한 전제가 없어 거부되면 가능한 다른 독립 단위를 보고할 수 있지만, 거부된 단위를
다른 이름/intent/기존 broad mode로 재시도해 개방하지 않는다.

## 5. 최소 저작 계약과 신뢰 경계 (D)

권한과 범위의 정본은 다음 세 곳이다. partial coverage의 리뷰 증거는 §7처럼 기존 review에 붙인다.
execution request/packet은 **도구 산출물**이며 별도의 사람이 관리하는 권한 정본이 아니다.

| 내용 | 소유 위치 | 변경 권한 |
|---|---|---|
| pilot owner와 task role 상한 | 기존 implementation-mode policy의 optional `work_execution` | policy 채택/경로 상한 변경은 사람 승인 |
| 안정적인 작업 단위, 근거 연결, private 경로 | 해당 ScreenSpec/surface-spec의 optional `work_execution` | 근거 연결은 Stage 04/05; 소유권 확대·제품 결정은 별도 사람 확인 |
| 기존 결정의 작업 영향 범위 | **그 결정이 있는 canonical 문서**의 optional `decision_work_scopes` | 영향 축소/해제는 사람 확인; Status/답은 기존 OD 행 하나가 소유 |

세션별 work unit을 만들지 않는다. 보통 visual/data/behavior 몇 개로 시작하고, 실제 독립 부분을 나눠야 할 때만
`save-action`처럼 세분한다. 여러 owner의 채택/결정 영향 제안은 한 번에 묶어 사람이 확인할 수 있다.
agent가 인간 승인 metadata를 만들어 통과시키는 것은 허용하지 않는다. schema 검사가 승인 actor를 증명하지는
못하므로 승인 근거와 실제 diff에 대한 리뷰는 기존 human-owned 전이 정책의 책임이다.
이 모델은 repository/CI를 우회할 수 있는 악성 작성자를 막는 보안 sandbox가 아니다.

### 5.1 Policy opt-in

다음은 제안 schema 예제다. existing mode `order`/`modes`를 삭제하거나 재해석하지 않는다.
`version`은 정수 1, owners는 중복 없는 typed owner이며 알 수 없는 version/key/profile은 scoped 사용을 거부한다.
owner 표기는 `screen:<canonical screen_id>` 또는 `surface:<canonical surface_id>`다.

```yaml
work_execution:
  version: 1
  owners: [screen:RESULT-001]
  profiles: [visual, api-contract, behavior]
  role_limits:
    visual: [screen, domain_component, hook, test]
    api-contract: [api_client, test]
    behavior: [screen, domain_component, hook, api_client, test]
  deny_paths: []
```

`role_limits`는 허용 가능한 역할의 상한이지 글롭 권한이 아니다. 실제 owner 경로와 다시 교집합을 취한다.
`test`는 이 분기에서만 쓰는 concrete test-root 분류다. 기존 layout에 test role이 없으면 해당 owner의 명시적
`test_paths`를 사용하며 임의의 `tests/**`를 가정하지 않는다. API schema/generated output은 위 역할에 포함하지 않는다.
custom policy는 명시적으로 이 profile을 채택하기 전까지 scoped 권한이 없다. 기존 forbidden을 문구나 이름으로
'단계용 제한'이라고 추측해 제거하지 않는다. 기존 mode policy 밖의 추가 경로 금지는 `deny_paths`에도 명시적으로
옮겨 검토한다. 이를 포함한 migration diff를 사람이 확인하기 전에는 opt-in하지 않는다.

### 5.2 Owner 계약

예제의 식별자와 경로는 합성이다. `contracts`/`decisions`는 기존 typed reference로 unique 해소되어야 한다.
unit ID는 owner 내 고유 `[a-z][a-z0-9-]*`; 종류는 위 세 enum, null/중복/unknown은 오류다.
관련 문서의 실제 값과 상태를 읽으며 참조가 존재한다는 것만으로 내용의 적합성을 입증하지 않는다.

```yaml
work_execution:
  version: 1
  private_paths:
    domain_component: [src/features/result/components/result-panel/**]
    hook: [src/features/result/hooks/result-preview/**]
  test_paths: [src/features/result/tests/result-panel/**]
  units:
    - id: result-layout
      kind: visual
      contracts: [artifact:RESULT-001-figma-mapping#component-mapping]
      sources:
        - input_id: IN-20260910-visual-spec-001
          items: ['01']
          source_refs: [input:IN-20260910-visual-spec-001#extracted-facts/01]
      isolation:
        decisions: [decision:D-SAVE@RESULT-001-screen-spec]
        disabled_units: [save-action]
        exposure: development-only
    - id: save-action
      kind: behavior
      contracts: [artifact:RESULT-001-screen-spec#interaction-matrix]
      sources: []
```

Screen의 screen 역할은 **해당 screen_entry의 exact path만** 가진다. 새 파일도 이미 확인된 canonical identity가
필요하며 source token에서 ID를 만들지 않는다. route_entry는 새 profile로 열지 않고 기존 route 절차를 사용한다.
private_paths는 같은 domain의 사람이 채택한 좁은 exact/terminal `/**`만 허용한다. 다른 screen entry, surface,
global shared, generated, API claim과의 충돌은 전체 owner 색인에서 거부한다. 채택된 root 안에서 필요한 새
screen-local 파일은 매번 사람의 재승인을 받지 않는다. root나 소유권을 넓히는 변경은 별도 권한 변경이다.
API client/hook claim은 기존 API Candidates v2의 Slice Paths에서 가져오며 private_paths로 덮어쓸 수 없다.
`api-contract` unit에는 선택하는 `{method, path}`의 `api_candidates` 비어 있지 않은 배열이 추가로 필수다.
`behavior`에서 API를 사용할 때도 같은 배열이 필요하고 `api_required:false`와의 충돌은 거부한다.

sources가 비어 있는 기존 정본 기반 작업도 가능하다. 외부 입력을 지우고 이 경로로 전환하는 우회는 아니다.
시작 요청에서 지정한 input과 해당 정본의 현재 source refs를 근거 집합에 포함하며 미처리 의존을 숨기지 않는다.
참조한 canonical artifact의 status/승인 범위/값은 현물에서 읽고 unit에 별도의 confirmed 상태를 저장하지 않는다.

### 5.3 결정의 범위 — 미선언은 보수적으로 적용

먼저 해당 owner에 도달하는 **모든** OD를 현재 정본에서 모은다. local/global decision_refs, surface/member
fan-out, 기존 Conflict/Unknown 관계를 누락하지 않는다. unit이 직접 나열한 decisions만 검사하지 않는다.
malformed/ambiguous/missing ref는 기존처럼 거부한다. 불명확한 관계는 무관함이 아니라 `scope-review-needed`다.

optional binding은 canonical decision home의 frontmatter에 둔다. global 문서의 예:

```yaml
decision_work_scopes:
  version: 1
  bindings:
    - decision_id: D-SAVE
      owner: screen:RESULT-001
      known_units: [result-layout, save-action]
      blocks: [save-action]
      basis_digest: sha256:<computed-by-tool>
      approval_ref: <existing-human-approval-evidence>
```

- binding이나 해당 owner 항목이 없으면 open 결정이 그 owner의 **모든 scoped unit**을 막는다. legacy의
  Blocking Mode 계산은 별도로 유지한다. 기존에 무관한 상위 blocker가 있다는 이유만으로 C 권한을 바꾸지는 않는다.
- known_units는 현재 unit ID/kind/의존 집합과 일치해야 한다. 뒤에 unit을 추가해 blocks 목록에 없는 권한을 얻지 못한다.
- blocks는 known_units의 부분집합이다. 빈 배열은 이 owner의 scoped 작업을 막지 않는다는 **명시적인 사람 판단**이다.
  empty/missing/unknown을 같은 값으로 처리하지 않는다. agent가 binding을 자동 채택해 권한을 넓히지 않는다.
- basis_digest는 canonical OD의 ID/질문/선택지/Blocking Mode, 현재 관련 Conflict refs와 내용,
  owner/referrer graph, unit ID/kind/contracts/isolation 관계를 key-sorted UTF-8 stable JSON으로 만든 sha256이다.
  참조 집합이나 의미를 담은 내용이 바뀌면 binding은 stale이다. digest 생성 자체는 사람의 확인을 대신하지 않는다.
- resolved 여부는 기존 canonical Status에서 읽는다. **reopen은 binding을 반드시 실효**시킨다. Stage 04의
  reopen 처리 및 신구 snapshot 전이 검사에 binding 제거를 포함한다. 옛 scope를 그대로 둔 reopen diff는 통과시키지
  않는다. 재확인 없이 binding을 복구하는 diff는 gate-lowering 위반이며 actual diff와 승인 근거를 리뷰한다.
- scope 영향 축소는 Status resolve와 별개의 사람 소유 변경이다. resolved/open을 binding에 복제하지 않는다.
- 같은 decision이 여러 owner에 도달하면 각각 평가한다. binding에 없는 host를 자동 면제하지 않는다.

Unknown의 새 상태 enum은 만들지 않는다. 미확인 사실이 selected contracts에 필요하면 해당 unit은 미준비다.
관계 범위와 명시적 isolation이 채택돼 있으면 시각적 외형만 만들 수 있다. 관계를 판단할 수 없으면 묶어서 질문한다.

## 6. 작업별 predicate와 미완성 기능 격리

| kind | 필요한 근거 | 허용되는 작업 | 금지하는 추론 |
|---|---|---|---|
| visual | active canonical identity, 대상 Figma/mapping, catalog/기존 디자인 규칙, 관련 coverage | screen/private UI/표시용 fixture hook/대상 test에서 근거 있는 시각 구현 | API·과금·전이·기존 이벤트 의미 추측, draft visual로 behavior 확정 |
| api-contract | 선택 API v2의 confirmed active 계약, slice ownership, 실제 schema/manifest 근거 | client/순수 adapter/계약 test. UI·업무 동작 연결은 하지 않음 | API 존재만으로 동작 명세나 loading/error UX를 발명 |
| behavior | selected behavior의 confirmed canonical 계약, 필요한 state/interaction/data/copy 근거, API 사용 시 해당 계약 | 알려진 UI 상태·hook·client 연결. 최종 Figma 없이 기존/임시 UI 사용 가능 | 본문 존재나 OD 0건을 완전한 명세로 간주 |

visual 근거의 구체 바닥은 canonical Figma file+node/source anchor, 대상 mapping의 `provenance_contract: 1`,
M-key와 provenance row의 일대일 정합, 대상 owner와의 일치다. 기존 provenance/input-fidelity helper를 재사용하되
final-fixture mode나 v1 single-file 전제를 이 분기에 복사하지 않는다. 선택 부분이 unreadable이면 그 부분의 허가는
보류한다. 원본 대조가 미검증인 부분은 기존 fidelity 계약에 따라 별도로 표시하고 pixel 정합 완료로 주장하지 않는다.
visual의 hook은 fixture/표시용 변경만이며 API-client 또는 종류 불명 API claim을 열지 않는다. active hook claim의
owner/유효성 조건은 유지하고 deferred/conflict claim은 fixture라는 이유로 면제하지 않는다.

confirmed canonical 계약은 기존 문서의 status뿐 아니라 실제 승인 범위와 값으로 확인한다. ScreenSpec이 draft여도
다른 confirmed Domain Rules가 해당 동작을 온전히 소유한다면 그 근거를 사용할 수 있다. 애매한 behavior를 위해
가짜 결정/confirmed 승격/새 승인 상태를 만들지 않는다. 확정 근거가 없으면 visual/fixture만 가능하다.
authored/coverage/상태 관련성 등 자유서술의 의미는 parser만으로 입증할 수 없다. authoring/reconcile reviewer가
대상 contracts를 대조하고 기계는 참조·상태·digest·선언 정합을 검증한다. 이 분담은 §10에서도 유지한다.

### 격리 계약

isolation이 있는 visual unit은 지정한 미실행 behavior의 외형을 만드는 범위다. owner의 정상 동작을 끄는 선언이 아니다.
disabled_units는 같은 owner의 behavior unit으로 unique 해소되며 관련 open decision을 유지한다.
exposure의 초기 enum은 `development-only` 하나다. production-ready에 해당하는 기능 공개를 자동 수행하지 않는다.

- 기존 preview/test/dev 구성이 있으면 재사용한다. 적절한 구성이 없으면 일반 사용자 경로에 새로 공개하지 않고
  미연결 presentational component와 test까지 구현한 뒤 실행 가능한 preview가 없음을 보고한다.
- 임시 표시와 이벤트 실행을 분리한다. onPress 이외의 진입점·effect·직접 호출·deep link 등 영향 경로를 조사한다.
  disabled 표시만으로 격리 성공이라고 하지 않는다. 기존 feature gate/미연결 경계를 우선 쓰고 관련 test/review로 확인한다.
- 기존 운영 기능을 임의로 비활성화하지 않는다. 부수 효과나 기존 동작 변경이 필요하면 behavior로 다시 판정한다.
- 해제는 후속 behavior 작업이다. 필요한 결정의 사람 확인/해결 및 현재 API·계약·권한 재평가 후 연결한다.
  코드를 만들었거나 전회 허가를 받았다는 이유로 해제하지 않는다. 조건은 기존 unit/Decision/PR을 참조한다.
- development-only 보장에 필요한 수정도 실제 대상 path로 허가·검증해야 한다. 권한이 없으면 부족한 부분을 보고하며
  private UI에 공유 gate를 복제하거나 route 제약을 우회하지 않는다.

Figma에 없는 화면 폭·긴 문구·접근성 대응은 기존 채택된 패턴을 사용한다. 새로운 레이아웃 우선순위가 필요하면
제안하고 미제공 디자인을 발명하지 않는다. 모드가 낮으므로 근거 있는 디자인을 대충 구현해도 된다는 규칙은 없다.

## 7. partial input을 작업에 연결하는 coverage

기존 Register v1/v2, Summary·Items·Partial Reconciliation Notes를 재사용한다. v1 및 Register 미채택의
ordinary 경로는 현행을 보존한다. 다만 **새 partial-input scoped 허가에는 v2 typed Items를 요구**한다.
producer 전체를 이전할 필요는 없지만 해당 input/owner의 새 경로는 의미를 추적할 수 있게 명시적으로 채택한다.

1. selected input의 immutable bytes/hash와 scope/source refs를 읽고 기존 input validation의 hard 계약을 유지한다.
2. in-progress/failed/invalid/duplicate이면 selected coverage를 발급하지 않는다. 미완성 effect group도 인정하지 않는다.
3. unit.sources.items는 해당 input의 기존 Item group에 unique 해소돼야 한다. 필요한 effect가 완결되고 대상
   artifact/owner로 연결돼야 한다. 새 ID로 effect를 반복하거나 권한 획득용의 가짜 simple-update를 쓰지 않는다.
4. 이번 source units와 남은 다른 범위를 구분한다. **Item 존재만으로 관련 미처리가 없음을 입증할 수 없다**.
5. 이 의미적 coverage 확인은 기존 Stage 04 review 출력에 작은 structured attachment로 남긴다. 모든 reconcile/PR의
   의무가 아니라 partial-input에서 새 scoped 허가를 사용하는 경우만 필요하다.
6. reconciled 입력의 Result도 제품 승인이 아니다. 남은 open decision은 §5의 적용 범위로 판단한다.

attachment 필수 키는 `version:1`, `owner`, `unit`, `input_id`, `item_ids`, `source_refs`, `input_sha256`,
`effects_sha256`, `contracts_sha256`, `review_scope:reconcile-stage04-v1`, `coverage:complete-for-unit`이다.
기존 review Markdown의 `work-coverage` YAML fence에 저장하고 request에서 그 파일을 참조한다.
동일 owner/unit/input 중복, unknown 값, 빈 source/item은 거부한다. 산문의 "모두 확인"을 NLP로 허가로 변환하지 않는다.

hash 규약: input_sha256은 원본 bytes, effects_sha256은 selected Item group의 모든 기존 effect 필드를 정렬한
canonical JSON, contracts_sha256은 선택 계약들의 canonical 경로와 raw bytes sha256의 정렬된 매핑이다.
source_refs/item_ids/owner/unit도 attachment와 unit 선언 사이에서 일치해야 한다. missing 값을 빈 문자열로 대체하지 않는다.
review path는 consumer가 실제 사용한 report 위치다. 예제의 `_meta/reviews/`는 새 필수 디렉터리가 아니다.

receipt는 source/routing의 리뷰 증거이지 사람의 제품 판단/결정 범위 변경 승인이 아니다. agent reviewer도 기존
Stage 04 책임 안에서 작성할 수 있다. 구조 검증이 의미적 완전성을 증명하지는 않는다. hash를 도구가 채워도
complete-for-unit 판정 자체를 도구가 자동 확정하지 않는다.
input bytes/선택 effect/대상 canonical 계약/현재 결정이 변하면 재평가한다. 선택 밖의 Item 추가만으로 선택 effect
hash가 바뀌지는 않으므로 무관한 완료 작업을 다시 하지 않는다. 다만 의존 집합의 변화는 현재 값으로 확인한다.
attachment 부재는 **이 scoped 신청**의 미준비이며 무관한 screen/일반 reconcile의 새 hard error가 아니다.
신규 scoped source 수용 상태는 다음으로 한정한다. `reconciled + accepted`는 기존 Stage 04 검토와 typed Items를
사용한다. `reconciled + pending` 또는 `partially-reconciled + pending|accepted`는 unit coverage attachment까지
요구한다. 그 밖의 Result는 자동 허가하지 않고 기존 분류·미결 처리 후 재신청한다. 이는 input 전체 승인 정책을
바꾸는 것이 아니다. 기존 visual-refresh는 계속 reconciled+accepted를 요구하며 partial+accepted도 통과시키지 않는다.

## 8. 경로·shared·변경 종류

### 8.1 경로 판정을 중복 구현하지 않는다

D에서는 기존 helper에서 canonical path 및 claim/owner 고유 제약을 분리해 공유한다. legacy 호출은 같은 mode
predicate를 사용해 이전 결과를 보존하고, scoped 호출만 §6의 predicate를 사용한다.
가짜 api-integrated-ui screen object를 넘기거나 deniedMatches를 버리거나 forbidden 문자열을 제거하는 방식은 금지한다.
항상 유지할 거부는 deferred/conflict/invalid API candidate, non-owner/unclaimed API, no-API, malformed
lifecycle/참조/policy, absorbed owner, shared delegation, generated ownership, project 명시 deny다.
namespace 비교는 기존 canonical path/snapshot helper를 사용하고 OS case folding 등으로 권한을 만들지 않는다.

### 8.2 복수 owner는 "하나만 허가하면 됨"이 아니다

screen 작업에서 delegated shared path를 만나면 surface owner의 subrequest로 위임한다. scoped shared-surface에서는
surface와 모든 host의 **그 작업에 대한** predicate/decisions/path 제약이 통과해야 한다. scoped host는 모두 해당
work 계약이 있어야 하며 미채택 host에는 현재 legacy path 허가를 요구한다. 어떤 host도 조용히 면제하지 않는다.
member 전체 mode 최솟값은 legacy 표시로 유지하고 새 분기에서는 작업과 무관한 상위 prerequisite만 제외한다.
이는 D의 권한 변경이지 C의 동작 정리가 아니다. 기존 membership의 최소 2개·동일 domain 제약도 바꾸지 않는다.

catalog 등록 UI primitive도 존재만으로 수정 권한이 생기지 않는다. 기존 승인 owner와 적용 policy에서 편집권이
명확하고 사용처 영향을 조사·검증할 수 있을 때 같은 변경에 포함한다. 현행 모델이 권한 소유자를 표현하지 못하는
global 공통 영역은 unsupported로 별도 작업에 보내고 #223의 app-shell 계약을 만들어낸 것처럼 취급하지 않는다.
API candidate 공동소유자, surface host, global component 사용자는 현재 repo에서 다시 확인한다.
넓은 screen allow 하나로 다른 owner의 deny를 상쇄하지 않는다. 같은 path에 여러 책임이 있다면 **모든 필요한
책임 측**의 허가를 요구한다. 알 수 없거나 충돌하는 ownership은 묶어서 사람에게 확인한다.

surface unit에는 `host_units: {<member_screen_id>: <host_unit_id>}` 연결을 둔다. 모든 member가 정확히 한 번
나타나고 참조 unit이 존재해야 하며 kind/계약이 이번 shared 변경과 맞아야 한다. 미채택 host는 unit ID 대신
`legacy-current`로 표시하고 실제 legacy surface 계산이 사용하는 member base envelope를 적용한다.
채택 host도 surface에 대한 동의는 **동일 surface의 예약을 덧붙이기 전** member role 상한으로 검사한다.
ordinary screen의 delegated deny를 아무 곳에서나 제거하는 예외가 아니다. surface identity/membership/실제
소유 경로가 확인된 surface 평가에서만 이 base envelope를 사용하며 다른 surface 예약·명시 deny는 유지한다.

### 8.3 초기 변경 범위

scoped source 구현은 regular file의 `M`, `A`만 지원한다. 새 path도 부모 디렉터리 실체·symlink·case alias를 검사한다.
copy/rename/delete/type/mode-change/submodule은 초기 버전에서 거부한다. C current는 기존 지원 동작을 보존한다.
불필요한 옛 파일 삭제나 구조 이전은 별도 maintenance 작업으로 분리하고 A+M으로 위장하지 않는다.
생성물은 직접 수정하지 않고 소관 command로 재생성한다. 생성 diff를 단순 무시하지 말고 command/입력/snapshot
대응을 보고한다. 검증/재생성이 만드는 파일도 실행 전 별도 소유·허용 범위를 확인한다.

## 9. CLI·Packet·Run의 제안 계약

### 9.1 request는 전달 자료이지 권한이 아니다

새 `--work <request.json>`을 readiness/packet/run/report/forbidden-paths에서 공통 사용한다.
`--intent`/`--input`/`--path`/`--surface`/`--screen`/`--requested-mode`/저장 readiness override와는 동시에 쓸 수 없다.
owner/mode/path는 request에 모은다. unknown option/schema는 exit 2다. root/docs/src/policy/manifest/layout/ci는
각 CLI가 실제 지원하는 명시 resource 옵션을 쓰고 같은 project-relative 해석과 resource 집합을 자식 command에 전달한다.

```json
{
  "version": 1,
  "requests": [
    {
      "owner": "screen:RESULT-001",
      "authority": "scoped",
      "unit": "result-layout",
      "coverage_reports": ["docs/frontend-workflow/_meta/reviews/result-review.md"],
      "targets": [
        {"path": "src/features/result/screens/result-screen.tsx", "change": "M"}
      ]
    }
  ]
}
```

C는 같은 schema의 `authority:current`만 구현한다. 이 경우 unit/coverage_reports는 지정 금지이고,
비어 있지 않은 requested_mode가 필수이며 모든 target은 현재 existing helper의 허가와 일치해야 한다.
D에서 scoped를 추가하며 그 경우 unit은 필수, requested_mode는 금지한다. 빈 requests/targets, 중복 JSON key,
동일 request 안의 중복 target, owner 불일치, unknown field는 입력 오류다. 여러 request가 공유하는 path는 §8의
AND로 정규화한다. caller가 allowed/approved/decision exclusions/fact override를 직접 지정하는 필드는 없다.
change 값은 계획이며 실제 snapshot의 A/M/기타와 다시 대조한다. 존재/부재와 다른 주장이나 추가 diff를 신뢰하지 않는다.

agent가 사용자 작업 요청에서 후보 request를 조립한다. 새 unit/채택 root/decision binding이 필요한 때만 기존
저작·사람 확인으로 돌아간다. 매번 request나 metadata를 사람이 손으로 작성해야 하는 절차는 없다.
JSON 순서가 권위 순서는 아니다. unit/canonical owner graph에서 필수 의존을 추가하되 implicit path 권한을 만들지 않는다.

### 9.2 출력과 상태

work 분기 JSON은 work_contract:1, snapshot, requests, ready, errors, denials, future_requirements,
required_reviews를 갖는다. request별 owner/unit, path별 bool/reasons, 사용 근거를 제시한다.
필요한 legacy summary는 legacy_readiness에 그대로 담으며 count를 고치거나 기존 blocking에서 항목을 삭제하지 않는다.
ready는 구현 후보 준비 상태일 뿐 품질·제품 승인이 아니다. advisory 검증 부족을 몰래 path 허가로 바꾸지 않는다.

| 조건 | work run 결과 | exit |
|---|---|---|
| 모든 selected path 허가와 필요한 실행 전 근거 확보 | HALT_READY_FOR_WORK | 0 |
| 하나 이상의 deny/실행 전 모호함 | HALT_AMBIGUITY, 이유와 독립적으로 가능한 request 보고 | 0 |
| absorbed owner만으로 이루어진 요청 | HALT_NOT_APPLICABLE, target 안내만 하고 자동 전환하지 않음 | 0 |
| 입력/수집/비JSON/미지원 snapshot 오류 | HALT_TOOL_ERROR | 2 |
| 구현 snapshot의 report 생성 | DONE_PENDING_REVIEW, 위반/미검증도 그대로 운반 | 0 |

일부만 실행하려면 독립성이 확인된 범위를 명시적으로 재선택하고 재평가한다. runner가 deny 항목을 버리고 전체 ready를
반환하지 않는다. 무관한 global partial warning은 전역 deny가 아니다. 같은 snapshot/근거의 검사를 이유 없이 반복하지
않되 변경·실패·구체적 미해결 우려가 있으면 관련 검사를 다시 한다. forensic report 생성과 성공 판정도 구분한다.
forbidden-paths의 work 분기도 기존 default advisory, --enforce 위반 exit 1, usage exit 2를 보존한다.
새 required CI를 만들지 않으며 run의 exit 0을 forbidden-paths 통과라고 읽지 않는다.

## 10. snapshot 구속·diff·의미 검증

### 10.1 작업자가 자기 권한을 열지 않는다

preflight는 현재 실체에서 authority를 계산한다. 전달된 packet/receipt의 path_allowed는 신뢰하지 않는다.
구현 후 actual Git bytes/modes/paths로 같은 판정기를 다시 실행한다. 기존 visual-refresh의 Git object/resource/
transport helper를 재사용하고, 공유 helper 변경은 v1 전체 회귀로 검증한다.

- authority baseline은 구현 시작 직전의 검증된 tree다. 부모 commit으로 무조건 고정하지 않고, 같은 세션에서 끝낸
  input/reconcile/명시적 사람 확인을 포함할 수 있다. 식별 가능한 tree·commit·승인 근거를 기록한다.
- authoring과 구현은 한 대화에서 할 수 있지만 implementation 범위에는 authority 변경을 섞지 않는다.
  policy/roots/units/decision binding/status/selected input/effects/contracts가 바뀌면 authoring checkpoint로
  돌아가 기존 review/human-owned 규약을 충족한 뒤 baseline을 새로 잡는다.
- checkpoint가 언제나 별도 PR/세션을 요구하지는 않는다. 다만 유리한 policy를 구현 diff에 추가하고 after만 보고
  허가하는 것은 금지한다. before/after authority read set 및 새 claim/삭제에 의한 오염을 검사한다.
- baseline tree는 원격 PR/CI에서 읽을 수 있는 commit으로 보존한다. 로컬 loose tree ID만 남기고 원격 재현이
  가능하다고 주장하지 않는다. 한 PR 안의 authoring commit과 implementation commit을 구분할 수 있으나,
  PR 전체의 authoring diff도 승인/리뷰 대상이다. 잘라낸 범위로 authority 변경을 숨기지 않는다.
- baseline을 만들려고 사용자 index/untracked 작업을 임의로 stage/reset하지 않는다. staged/range/base의 실체를
  읽으며 name/status-only diff, binary 복호화로 bytes 누락, submodule ignore 설정에 따른 변경 누락, root 혼동,
  symlink 우회를 허용하지 않는다. selected work 밖 변경도 전체 diff에서 분류해 보고한다.
- input/policy를 구현 뒤 바꾸면 오래된 receipt를 재사용하지 않는다. 반면 예상된 허가 source-code 변경만으로
  coverage를 무효화하지 않는다. 계약 hash와 구현 snapshot은 다른 축이다.

D를 채택한 owner의 scoped path는 ordinary concrete 판정/backstop에서도 채택 marker를 읽는다.
이 path에는 `authority:scoped`와 유효한 unit 선택이 필요하다. selector 누락뿐 아니라 C의 `authority:current`로
되돌리는 시도도 work-selection-required로 거부한다. scoped 실패 뒤 legacy production-ready의
broad allow로 돌아가는 우회를 막기 위함이다. no-selector summary는 표시할 수 있지만 채택 path의 실제 편집은
추가 제약을 받는다. 이는 **채택 owner만의 의도적인 D 변화**이며 미채택 byte-compatibility와 구별한다.
기존 visual-refresh도 채택 owner의 task 필요 path에서는 work-selection-required를 반환하고 새 scoped 호출을
안내한다. 새 호출의 결과를 옛 v1 승인으로 꾸미지 않는다. 미채택 owner의 v1 조건과 결과는 그대로다.

### 10.2 기계가 증명하지 않는 것

파일 allow는 그 안의 모든 행동을 바꿀 권한이 아니다. 같은 tsx에서 visual/behavior가 혼합되면 diff와 관련 test/review로
변경하지 않은 동작을 확인한다. 완전한 TypeScript 의미 동등성·pixel-perfect·승인 actor의 암호학적 검증은 만들지 않는다.
기계는 참조/상태/digest/path/claim/snapshot/선언 정합을, reviewer는 내용/범위/의미적 격리를 책임진다.
"정적 검사가 통과했으니 격리됐다"는 식으로 semantic 검토 부재를 숨기지 않는다.

## 11. 보고·리뷰·정상 종료

기존 PR/Run Report/Stage 08 handoff에 다음 구분을 추가한다. 전체 작업에 새 register/status 축을 요구하지 않는다.

```text
이번 범위 / owner·unit:
코드에 반영한 내용:
미연결·격리한 동작 / Decision·해제 조건:
권한 근거 / 구현 snapshot / backstop 결과:
실행한 검증 / 실제 결과:
미실행 또는 실패한 검증 / 이유·원인 미확정:
Figma와의 대응 / 아직 눈으로 확인하지 못한 조건:
남은 작업 / 다음에 읽을 기존 기록:
```

실행·캡처가 불가능해도 일반 review PR을 낼 수 있다. 시뮬레이터 자원·시간·환경 제약만으로 자동 Draft/merge blocker를
추가하지 않는다. 기존 required CI, 알려진 실제 결함, 권한 위반은 별도다. 환경 문제라는 분류에도 근거가 필요하다.
사용자의 main 후속 확인 예정은 수행된 증거가 아니다. 미확인은 보통 PR/hand-off에 남기고 개별 issue를 강제하지 않는다.
안전한 부분의 merge는 가능하지만 merge/공개는 사람의 결정이다. runner exit 0/Done이 승인하는 것은 아니다.

## 12. 이전·호환·rollback

1. **baseline:** 대표 작업을 현행 main에서 기록한다. 권한·중단 이유·실제 필요한 사용자 재요청을 구분한다.
2. **C:** legacy 기본 동작을 보존하는 current work 호출과 task-aware skill 경로를 사용한다. helper 결과 동등성을 확인한다.
3. **D pilot:** 사람이 한 화면/한 domain을 골라 policy role/deny 상한, owner roots/units, 필요한 decision binding을
   검토·채택한다. 과거 Blocking Mode 조정을 자동 복구하지 않고 현재 유효한 결정을 다시 읽는다.
4. **부분 source:** v2와 coverage attachment는 해당 작업에만 채택한다. 옛 입력을 일괄 재작성하지 않는다.
5. **확대:** visual v1, API deferral, no-API, shared host, bad path 회귀와 여러 입력 도착 순서를 검증한 뒤 확대한다.
6. **rollback:** 새 scoped 실행을 먼저 중단한다. flag를 지워 즉시 legacy 전체 권한으로 되돌리지 않는다.
   현재 diff/미완료 work를 리뷰해 명시 deny를 보존하거나 원래 허용 범위로 되돌린 owner부터 채택을 철회한다.
   input/effect/work 기록을 지워 숨기지 않는다. 새 upgrade planner는 채택 선언이 남은 자동 downgrade를 거부해야 한다.

미채택 consumer는 기존 CLI/JSON/exit/mode/claim/visual v1 및 payload 호환을 유지한다. 채택 consumer에는
해당 owner의 concrete 편집에 task 선택이 필요함을 upgrade notes에 명시한다. 새로운 schema/CLI는 D에서
payload 경계에 맞춰 배포한다. B 문서는 kit-dev에만 있고 consumer payload에 포함하지 않는다.
**수정되지 않은 구버전 binary가 새 marker를 이해하고 막아준다고 보장할 수는 없다.** planner/도입 안내는 지원되지
않는 downgrade를 막으며, 사람이 구버전 도구를 직접 실행하는 우회는 지원·보장 밖이다. 새 도구의 legacy 호출은
§10의 adopted-path 제약을 적용한다. 호환성을 권한 우회의 이름으로 사용하지 않는다.

## 13. 구현 분리와 수용 조건

| PR | 필요한 내용 | 제외 |
|---|---|---|
| B (본 PR) | 이 제안·근거·C/D 경계·회귀·도입 계획 | runtime/schema/template/policy 변경, CI 승격, consumer 데이터 변경 |
| C | current request 검증, 실행 eligibility/transport, CLI/skill/Stage 06·08 정합, 관련 재검증 | 새 profile 허가, binding/partial 허가, shared cap 완화, 기존 helper 결과 확대 |
| D | opt-in schema/저작 안내, typed scope/evidence/decision 판정, 3 profile, 공통 path 제약, entry/backstop 연결, 이전/tests | #223/224/228 전체 해결, 새 required CI, 범용 rule engine, caller 권한 override |
| E | 최종 skill 읽기 중복 정리, pilot 증거, 원래 문제의 개선/잔여/한계 | 새 eval platform, 측정 결과 조작, 전체 consumer 강제 이전 |

C/D 세분화는 리뷰 가능한 일관성 단위로만 한다. D 규모상 분리가 필요하면 #239에 명시하고 잘라야 하며,
미완성 predicate가 표면에 노출되거나 preflight와 backstop의 허가가 다른 중간 PR을 활성화하지 않는다.
각 구현 PR에 필요한 schema·CLI·문서·test를 함께 둔다. E까지 사용법을 미루지 않는다.

### 회귀 매트릭스 — 향후 테스트 요구이며 B에서 실행한 결과가 아니다

| ID | 사례 | 예상 |
|---|---|---|
| W01 | 미채택 repo/기존 CLI/기존 visual v1 | 기존 결과 byte-compatible, 권한 확대 없음 |
| W02 | C current, 상위 API blocker, exact UI path 허가 | 후보 ready, future blocker와 mode/helper 결과 보존 |
| W03 | C current, 예전 mode에서는 허용/현재 deny | deny. 낮은 mode/union으로 개방하지 않음 |
| W04 | malformed owner/policy/state/OD, ambiguous 후보 | error/deny. future로 분류해 무시하지 않음 |
| W05 | 선택 밖의 정상 partial input | warning으로 전역 deny를 만들지 않음 |
| W06 | 선택 partial v2, valid item/coverage/current hash | 해당 unit만 후보 허가. input 전체 accepted 아님 |
| W07 | partial 표시만, receipt 없음, v1/가짜 effect/미완 group | 새 scoped 허가 없음. 기존 일반 경로 의미 보존 |
| W08 | input hash/item source/target 계약 교체, 관련 decision 추가 | stale/re-evaluate. 이전 receipt로 허가하지 않음 |
| W09 | 선택 밖 effect 추가, 관련 사실 불변 | 중복 reconcile 없음. 현재 정보로 권한 재평가 |
| W10 | Figma 선행, behavior 미정, preview 격리 | visual 가능/behavior 불가, OD open 유지, 일반 공개 안 함 |
| W11 | API/behavior 확정, Figma 미정 | api-contract/behavior 후보 가능, 디자인 발명 금지 |
| W12 | API만 확정, behavior 미정 | client/test까지만, 동작 연결 불가 |
| W13 | OD binding 없음/owner 부족/unknown unit | scoped 보수적 deny, legacy cap 불변 |
| W14 | 사람 확인 binding, 무관한 unit | 해당 unit 가능. blocked unit/미기재 host 불가 |
| W15 | binding 후 unit 추가/의미 변경/reopen | scope 실효. 삭제/Status 위장만으로 허가 복원하지 않음 |
| W16 | 같은 tsx 시각 변경에 API 부수 효과/기존 기능 비활성화 혼입 | path 통과와 semantic 위반 구별. 관련 test/review에서 부적합 |
| W17 | private root A/M 및 밖/다른 owner/deferred claim | 전자만. API active/confirmed 조건 유지 |
| W18 | scoped 실패 후 no-selector/current/옛 intent broad 허가 요청 | adopted path는 selector/추가 제약으로 deny |
| W19 | surface, 모든 host 허가/미채택 host deny/비member | 필요한 모든 owner AND. 모르는 host 면제 금지 |
| W20 | catalog 있으나 global 편집 owner 불명 | catalog만으로 권한 생성 안 함 |
| W21 | name-only diff/symlink/case alias/binary/NUL/submodule/rename/type | 손상·미지원 snapshot을 유효하다고 취급하지 않음 |
| W22 | 구현 diff에 policy/units/binding/input 권한 확대 | self-grant 거부, authoring checkpoint로 이동 |
| W23 | custom repo/project root, 명시 resource, base/range | 동일 해석, 실제 Git bytes/mode 사용 |
| W24 | actual diff에 미신청 path/owner 밖 path | 전체 diff에서 누락 없이 보고, enforce 실패 |
| W25 | simulator 미실행/환경 실패/실제 코드 장애 | 구분 보고. 전자만으로 새 merge gate 생성 안 함 |
| W26 | 큰 input checkpoint 후 다음 세션 | 같은 input/누적 Items 재사용, 완료 effect 재수행 없음 |
| W27 | 입력 3종 도착 순서 6개, 동일 유효 facts로 수렴 | 최종 permit 집합 동일. 실제 supersession/decision 차이는 별도 |
| W28 | opt-in 철회/downgrade로 legacy 권한이 확대됨 | 조용한 rollback 중단, 명시적인 경계 복원 필요 |

W16/W25/W26의 의미와 실운용은 정적 fixture만으로 증명하지 않는다. 구조 테스트와 실제 agent/사람 리뷰를 구별한다.
C에는 W01-W04, D에는 관련 전체 구조/CLI/Git 회귀와 v1 suite가 필요하다. macOS case-insensitive 검증은 기존 smoke에
관련 test를 포함하되 새로운 required status로 승격하는 것과는 별개다.

## 14. 요구사항 추적과 설계 리뷰 종료

| 사용자 선택 | 설계 반영 |
|---|---|
| Q1B 및 도메인 수십 장 보충 | §3의 작은 요청/큰 인입 분리, §11의 정상 handoff |
| Q2B 및 disabled 보충 | §6 격리와 §7 unit coverage. partial 표시만으로 개방하지 않음 |
| Q3A | §6 development-only, 새 공개 경로/새 preview framework 강제 없음 |
| Q4B | §6 api-contract와 behavior 분리, 확정된 실제 동작은 디자인 대기 없이 연결 |
| Q5B | §5.3 기존 결정의 사람 확인 scope, 반복 승인 아닌 재사용 binding |
| Q6B/Q7B | §5.2 private root와 §8 복수 owner/공유 영향 확인 |
| Q8B | §7/§10 현재 hash·의존 재평가, 무관한 완료 작업 보존 |
| Q9B | §6 기존 반응형·접근성 패턴 사용 |
| Q10A 및 모바일 환경 보충 | §11 일반 review PR, 실행/캡처 부재만으로 새 merge gate 없음 |
| Q11B | §3/§11 안전한 부분 merge와 전체 기능 완료 구분 |
| Q12B | §12 pilot 도입·범위 검토·보수적 rollback |

### 종료 조건과 남는 한계

B의 종료 조건은 #238의 요구와 구체 흐름이 대응하고, current/scoped 권한 차이, coverage, 결정 적용, shared 책임,
snapshot, 점진 채택/rollback, C/D 테스트를 구현자가 새로운 제품 선택을 발명하지 않고 구현할 수 있는 것이다.
미래의 모든 입력 형식, 완전한 TS 의미 검증, 실기기 미검증 0건, #223/224/228 해결은 종료 조건이 아니다.

중점 리뷰: scope 확인이 매번 사람 대기를 다시 만드는가, partial 범위의 누락을 기계가 입증했다고 과장하는가,
legacy 진입점/공동소유자/authority 변경으로 권한이 새는가, 실행 불가를 새 merge gate로 바꾸는가.
채택한 기술 변경은 이 문서에 모으고 이슈에 다른 기술 규칙을 복제하지 않는다.
E에서는 디자인 선행/API 선행/partial 재개/실행 불가 사례의 완료 범위·불필요한 중단/질문·권한 밖 변경·리뷰 횟수·
재작업/시간을 기록한다. 웹에서 얻을 수 없는 token 수나 독립 비교는 N/A다. 비교에는 같은 입력·시작 상태·동등한
도구 조건을 쓰고 과거 추정이나 synthetic green을 실측으로 변환하지 않는다.

이 설계는 미구현이며 현재 권한을 바꾸지 않는다. B merge는 설계 채택이고 C/D 실행·검증은 별도 PR이다.
#238은 D까지의 완료 조건을 충족하기 전에는 open을 유지한다. A/#236/PR #240 리뷰·구현에는 간섭하지 않는다.
