# Issue #202 설계 — Reconciliation Contract v2

> 상태: proposal / discussion draft  
> 기준 저장소: `KiDooSong/k-frontend-workflow`  
> 기준 브랜치: `main` (`fa9fc6b` 확인 시점)  
> 대상 이슈: `#202 reconcile 계약 불변식이 validate 미강제 → LLM 리뷰 O(n) 라운드 팽창`  
> 제안 위치: `kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md`  
> 작성일: 2026-07-20

---

## 0. 결론 요약

이 작업은 **별도 설계가 필요하다.** 이유는 #202가 단순 검사 한두 개가 아니라 다음 세 계약을 동시에 바꾸기 때문이다.

1. `Reconciliation Register`의 자유서술 셀을 기계 검증 가능한 구조로 진화시켜야 한다.
2. 입력 단위 provenance와 항목·매핑 단위 provenance 사이의 최소 정밀도 바닥을 정해야 한다.
3. Stage 04 잠정 산출물을 어느 수준까지 리뷰하고 어디서 멈출지 reviewer contract를 정의해야 한다.

권고안은 다음과 같다.

- **새 산출물 축을 만들지 않는다.** 기존 `docs/frontend-workflow/_meta/reconciliation-register.md`를 v2로 확장한다.
- 기존 8컬럼 요약 표는 유지한다. 대신 같은 문서에 **`## Reconciliation Items` 구조화 표**를 추가한다.
- v2는 frontmatter의 `reconciliation_contract: 2`로 명시적으로 opt-in 한다. 필드가 없으면 기존 v1 동작을 그대로 유지한다.
- `workflow:validate` 검사 12를 확장하되, **결정적 구조·참조 검사는 hard**, 자연어 의미 추정은 **warning-first**로 분리한다.
- 항목 provenance는 canonical input의 `source_ref`·`captured_at`을 기본 상속하고, `source_unit`과 더 정밀한 `source_ref`가 필요한 경우에만 항목별 override 한다.
- `figma-component-mapping`의 기존 4컬럼 `## Component Mapping` 헤더는 바꾸지 않는다. 행에 안정 키를 추가하고 별도 `## Mapping Provenance` 표로 정밀도를 보강한다.
- `review_profile: reconcile-stage04-v1`을 명시하고, 리뷰어는 **routing·source backing·gate-raising 경계**만 필수 검토한다. 최종 pixel/token/copy fidelity는 이 프로필의 pass 조건이 아니다.
- 구현은 `A(구조 검사) + C(리뷰 프로필)`을 먼저, `B(provenance floor)`를 다음 PR로 분리한다.

이 설계의 핵심 문장은 다음이다.

> **정적 validator는 선언된 구조와 참조를 강제하고, reviewer는 diff에서 권한 경계를 확인한다. 자유서술의 의미를 hard gate로 추측하지 않는다.**

---

## 1. 현재 상태와 문제 경계

### 1.1 현재 Register 계약

현재 정본은 다음 파일들이다.

- `frontend-workflow-kit/docs/reference/input-reconciliation.md`
- `frontend-workflow-kit/templates/meta/reconciliation-register.template.md`
- `frontend-workflow-kit/scripts/lib/reconciliation-register.mjs`
- `frontend-workflow-kit/scripts/validate.mjs` 검사 12
- `frontend-workflow-kit/skills/reconcile-input/SKILL.md`

현재 Register는 입력당 canonical 행 1개인 8컬럼 표다.

```md
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
```

현재 검사 12가 기계적으로 확인하는 범위는 다음뿐이다.

- 필수 8컬럼 존재
- `Input ID` 중복
- `Reconcile Status` enum
- `in-progress`·`failed` 상태
- input artifact에는 있으나 Register 행이 없는 미처리 입력

현재 구현은 의도적으로 다음을 하지 않는다.

- `Classification` 셀 파싱
- `Result` 어휘 파싱
- `Touched Artifacts` 참조 해소
- `Created Items` 참조 해소
- `Classification`과 생성·수정 결과의 개수/종류 일치 확인
- Unknown·Conflict·Gap·Decision 라우팅 일치 확인
- provenance 정밀도 확인

특히 현재 코드의 hard rule은 `Created Items`의 `(open)` 같은 주석을 파싱하지 않고, 자식 항목 상태가 Register의 `Reconcile Status`를 움직이지 않게 하는 것이다. 이 원칙은 v2에서도 보존해야 한다.

### 1.2 현재 Input provenance

canonical input artifact는 이미 다음 값을 필수로 가진다.

- `source_ref`
- `captured_at`
- `captured_by`
- `input_id`

그러나 현재 검사 11은 `captured_at`이 비어 있지 않은지만 보고 RFC3339 형식은 검사하지 않는다. 또한 입력 전체의 출처는 알 수 있지만, 개별 reconciliation item이 어느 node/frame/record/instance에 근거했는지는 알 수 없다.

### 1.3 현재 Figma mapping provenance

`figma-component-mapping` 템플릿에는 다음이 이미 존재한다.

- frontmatter `sources`
- `## Frame`
- optional `## Provenance`
- optional `## Visual Spec`
- 출처 마커 `✔T`·`✔M`·`◎`·`▱`·`⚠`

다만 이것은 설명 중심이다.

- `## Component Mapping` 행과 provenance 사이에 안정적인 1:1 키가 없다.
- source node/frame 단위가 필수 스키마가 아니다.
- `records`인지 `instances`인지 같은 단위가 기계적으로 선언되지 않는다.
- `captured_at`의 형식을 검사하지 않는다.

### 1.4 현재 review rubric

`temp/evaluations/reconcile-input-rubric.md`에는 LLM 단계와 human-final 단계를 구분하는 유용한 평가표가 있다. 특히 다음 원칙이 명확하다.

- LLM은 gate를 올리기만 한다.
- decision/unknown/conflict/gap의 close·resolve·accept와 `confirmed` 승격은 사람 전용이다.
- `expected-llm-after`와 human-final인 `expected-after`를 혼동하면 안 된다.
- simple-update 누락보다 gate-lowering 침범이 더 심각하다.

하지만 이 파일은 `temp/` 평가 증거이며 consumer가 읽는 canonical review contract가 아니다. 현재 `reconcile-input` skill에도 reviewer의 정지 조건과 finding 일괄 제출 규칙은 없다.

---

## 2. 왜 별도 설계가 필요한가

### 2.1 자유서술을 검사하려면 먼저 canonical 구조가 필요하다

현재 `Classification`, `Touched Artifacts`, `Created Items`는 사람에게는 읽히지만 validator에는 비정형 문자열이다. 이 상태에서 검사 코드를 먼저 추가하면 정규식이 문서 스타일에 종속되고 false positive가 늘어난다.

따라서 구현 순서는 반드시 다음이어야 한다.

```txt
계약 구조 정의
→ parser 단일 출처
→ 구조적 검사
→ 선택적 semantic heuristic
```

### 2.2 routing 정확성에는 hard와 heuristic의 경계가 필요하다

예를 들어 “입력 A와 입력 B가 상호배타적이다”라는 문장을 자연어로 읽어 Unknown이 아니라 Conflict로 보내는 것은 semantic 판단이다. validator가 모든 문장을 정확히 이해할 수 있다고 가정하면 false positive가 hard gate가 된다.

대신 v2에서는 작성자가 `Basis=input-input-conflict`를 명시하게 하고, validator는 다음을 hard하게 검사한다.

```txt
Basis=input-input-conflict
→ Classification=conflict
→ conflict:C-xxx target 필요
```

작성자가 Basis 자체를 잘못 골랐는지는 warning heuristic 또는 reviewer가 본다.

### 2.3 정적 snapshot은 누가 gate를 내렸는지 알 수 없다

현재 문서에서 `D-001`이 `resolved`라고 해서 그것을 LLM이 닫았는지 사람이 닫았는지는 정적 validator가 알 수 없다. 따라서 다음은 static hard gate로 만들면 안 된다.

- 현재 `resolved`인 decision을 보고 “LLM 권한 침범”으로 단정
- 현재 `accepted`인 gap을 보고 “LLM이 accept했다”고 단정
- 현재 `confirmed`인 문서를 보고 reconcile 세션의 잘못이라고 단정

gate-raising-only는 두 층으로 처리한다.

1. v2 item effect 어휘에는 `resolve`·`close`·`accept`·`confirm`을 넣지 않는다.
2. 실제 diff에서 해당 상태 전이가 있었는지는 reviewer rubric이 확인한다.

### 2.4 migration과 hard-gate 승격을 분리해야 한다

기존 consumer register를 즉시 v2 hard gate로 해석하면 모든 과거 행이 실패한다. 따라서 v2는 명시 opt-in이고, 신규 템플릿과 신규/변경 행부터 적용할 수 있어야 한다.

---

## 3. 목표와 비목표

### 3.1 목표

1. 입력 1개에서 발생한 reconciliation item N개를 구조적으로 표현한다.
2. Register 요약 행과 item 효과의 분류·참조·개수를 대조한다.
3. D-/C-/U-/G-/INV-/VER- 및 artifact 참조가 실제 문서/행으로 해소되는지 확인한다.
4. 선언된 routing basis가 허용된 classification/effect/target 조합과 일치하는지 확인한다.
5. visual evidence가 behavior canonical section으로 잘못 유출되는 명백한 경우를 잡는다.
6. provenance의 최소 바닥을 `source_ref + source_unit + captured_at`으로 고정한다.
7. Stage 04 reviewer의 필수 검토 범위와 정지 조건을 canonical 문서로 만든다.
8. v1 register와 기존 출력은 opt-in 전까지 byte/behavior compatible하게 유지한다.

### 3.2 비목표

- 임의 자연어의 진실성 또는 의미를 hard gate로 판정
- source-specific Figma/API/회의록 수집기 구현
- 외부 URL·Figma node의 실재 여부 네트워크 검증
- decision resolve, Unknown close, Conflict resolve, Gap accept 자동화
- `confirmed` 자동 승격
- 새 readiness fact 또는 새 implementation mode 추가
- 새 artifact axis 추가
- pixel fidelity·토큰 완전성·visual regression 성공을 reconciliation gate로 사용
- 정적 snapshot만으로 변경 actor를 추론
- reviewer에게 최종 구현 품질이나 downstream 코드 품질까지 요구

---

## 4. 핵심 설계 결정

### 결정 D1 — 기존 Register 파일을 v2로 확장한다

새 `_meta/reconciliation-items.yaml` 같은 별도 정본을 만들지 않는다.

이유:

- register와 item index가 서로 다른 파일이면 dual source of truth가 된다.
- 새 artifact axis 및 upgrade/migration 부담이 생긴다.
- Stage 04에서 사람이 한 화면에서 요약과 세부를 함께 읽는 장점이 사라진다.

### 결정 D2 — 기존 8컬럼 표는 요약 표로 유지한다

기존 표는 사용자-facing summary와 input lifecycle의 canonical row 역할을 계속한다.

v2의 machine details는 같은 문서의 `## Reconciliation Items`에 둔다.

### 결정 D3 — item이 아니라 effect를 한 행으로 기록한다

하나의 reconciliation item이 여러 효과를 만들 수 있다.

예:

```txt
resolved decision과 충돌
→ C-001 create-open
→ D-204 reopen
```

따라서 `Item` ID를 공유하는 여러 effect 행을 허용한다. Classification 개수는 `(Input ID, Item)`의 unique item 수로 센다.

### 결정 D4 — hard gate는 선언된 구조만 검사한다

다음은 hard다.

- enum·문법
- 참조 해소
- summary와 item multiset 일치
- basis/classification/effect/target 허용 행렬
- provenance 필수값과 timestamp 형식
- visual basis와 명백히 금지된 behavior section 조합

다음은 warning-first다.

- Unknown의 문구가 실질적으로 A/B conflict처럼 보임
- `Result`가 현재 child status와 stale해 보임
- source granularity가 최소 바닥은 충족하지만 더 정밀할 수 있음
- 자유서술에서 visual/behavior 경계가 애매함

### 결정 D5 — action history와 current child status를 분리한다

`Effect=reopen`은 reconcile 시점에 수행한 역사적 행위다. 나중에 사람이 decision을 다시 resolve해도 effect 기록은 바꾸지 않는다.

validator는 target 존재를 hard하게 보되, target의 **현재** status가 effect 당시 상태와 같은지를 hard하게 요구하지 않는다. 현재 상태와 `Result`의 불일치는 stale warning으로만 낸다.

### 결정 D6 — provenance는 input-level 값을 상속할 수 있다

모든 item에 source 정보를 반복 입력하면 저작 부담이 커진다.

따라서 다음 상속을 허용한다.

```txt
Source Ref = inherit
→ input artifact frontmatter.source_ref

Captured At = inherit
→ input artifact frontmatter.captured_at
```

단 `Source Unit`은 item마다 반드시 명시한다. 이것이 records-vs-instances 같은 정밀도 바닥이다.

---

## 5. Reconciliation Contract v2

### 5.1 Frontmatter

v2 register는 다음 필드를 추가한다.

```yaml
---
title: Reconciliation Register
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "2026-07-20T00:00:00+09:00"
---
```

필드 의미:

| 필드 | 의미 |
|---|---|
| `reconciliation_contract` | `2`이면 v2 parser/check 활성화. 없으면 v1. |
| `review_profile` | reviewer의 범위와 stop rule. v2에서는 `reconcile-stage04-v1` 필수. |
| `structured_since` | 이 시각 이후에 capture된 input은 structured item 필수. 이전 입력은 legacy summary-only 허용. RFC3339 필수. |

`structured_since`를 두는 이유는 기존 register의 모든 과거 행을 한 번에 backfill하지 않아도 되게 하기 위해서다.

### 5.2 기존 8컬럼 Summary Table

헤더는 유지한다.

```md
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
```

v2에서는 자유서술 범위를 줄이고 다음 grammar를 사용한다.

#### Classification

```txt
<classification>[×N] + <classification>[×N] ...
```

예:

```txt
simple-update×2 + conflict + new-decision
```

허용 enum:

- `simple-update`
- `resolves-unknown`
- `resolves-decision`
- `new-decision`
- `component-gap`
- `investigation-needed`
- `conflict`
- `scope-unclear`
- `reject-input`

annotation은 item table에 둔다. v2 summary cell에서 `conflict (decision reopen)` 같은 괄호 annotation은 warning으로 시작하고 향후 금지 후보로 둔다.

#### Reconcile Status

기존 enum을 유지한다.

- `not-started`
- `in-progress`
- `reconciled`
- `failed`

#### Result

v2 canonical code:

- `pending`
- `accepted`
- `rejected`
- `pending-user-decision`
- `delegated`
- `no-change`
- `mixed`
- `failed`

초기 rollout에서는 enum 위반을 warning-first로 시작하고 dogfood 후 hard 승격한다. `Reconcile Status`와의 권고 조합은 다음이다.

| Reconcile Status | 허용 Result |
|---|---|
| `not-started`, `in-progress` | `pending` |
| `failed` | `failed` |
| `reconciled` | `accepted`, `rejected`, `pending-user-decision`, `delegated`, `no-change`, `mixed` |

#### Touched Artifacts

세미콜론으로 구분한 typed artifact ref만 둔다.

```txt
artifact:COUPON-001#ui-sections; artifact:COUPON-001-figma-component-mapping
```

#### Created Items

status annotation 없이 typed target ref만 둔다.

```txt
decision:D-001@COUPON-001; conflict:C-001@conflicts; gap:G-001@component-gap-register
```

`(open)`·`(resolved)` 같은 현재 상태 주석은 v2 summary에서 금지한다. 현재 상태의 단일 출처는 대상 표다.

#### Supersedes

- `-`
- 존재하는 `input_id`

### 5.3 `## Reconciliation Items` Table

v2 register에는 다음 표가 존재한다.

```md
## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
```

#### 컬럼 계약

| 컬럼 | 계약 |
|---|---|
| `Input ID` | Summary Table의 실제 input id. |
| `Item` | input-scoped 2자리 ID(`01`, `02`...). 같은 item의 여러 effect는 같은 값을 쓴다. |
| `Basis` | 입력 사실의 routing basis enum. |
| `Classification` | 기존 classification enum. 같은 item의 모든 effect에서 동일해야 한다. |
| `Effect` | reconciliation이 수행한 역사적 효과 enum. |
| `Target` | typed artifact/row ref. |
| `Evidence` | canonical input artifact의 section pointer. |
| `Source Ref` | `inherit` 또는 더 정밀한 source pointer. |
| `Source Unit` | evidence가 무엇을 세거나 가리키는지 나타내는 enum. |
| `Captured At` | `inherit` 또는 RFC3339 timestamp. |

### 5.4 Basis enum

| Basis | 의미 |
|---|---|
| `compatible-fact` | 기존 계약과 충돌하지 않는 사실 보강 |
| `visual-evidence` | frame/node/layout/component appearance에 관한 시각 증거 |
| `unknown-answer` | 기존 Unknown에 답 또는 근거를 제공 |
| `decision-answer` | 열린 Decision의 선택지/근거를 제공 |
| `new-choice` | 새 선택이 필요 |
| `component-missing` | catalog에 없는 shared component 필요 |
| `verification-gap` | 조사/검증 없이는 확정 불가 |
| `input-input-conflict` | 두 입력/문서의 대칭 충돌 |
| `resolved-decision-conflict` | 새 입력이 이미 resolved된 결정에 도전 |
| `scope-unclear` | 영향 scope 또는 canonical identity 불명확 |
| `reject` | 입력 또는 item을 반영하지 않음 |

### 5.5 Effect enum

허용 effect:

- `update`
- `create`
- `create-open`
- `reopen`
- `link-evidence`
- `record`
- `reject`

의도적으로 다음 effect는 없다.

- `resolve`
- `close`
- `accept`
- `confirm`
- `implement`

이 어휘 부재가 machine record 차원의 gate-raising-only 경계다. 실제 문서 diff에서 금지 상태 전이가 있었는지는 reviewer가 확인한다.

### 5.6 Target grammar

#### Artifact target

```txt
artifact:<artifact_id>
artifact:<artifact_id>#<section-slug>
artifact:<artifact_id>#<section-slug>/<row-key>
```

예:

```txt
artifact:COUPON-001#ui-sections
artifact:COUPON-001#state-matrix/offline
artifact:COUPON-001-figma-component-mapping#component-mapping/M-001
```

#### Child row target

```txt
decision:<D-ID>@<owner-artifact-id>
unknown:<U-ID>@<owner-artifact-id>
conflict:<C-ID>@<owner-artifact-id>
gap:<G-ID>@<owner-artifact-id>
investigation:<INV-ID>@<owner-artifact-id>
verification:<VER-ID>@<owner-artifact-id>
```

예:

```txt
decision:D-204@AUTH-001
conflict:C-001@conflicts
unknown:U-001@COUPON-001
gap:G-001@component-gap-register
verification:VER-001@COUPON-001
```

owner artifact를 필수로 하는 이유는 U-/INV-/VER-가 화면/도메인별로 중복될 가능성을 제거하기 위해서다.

### 5.7 Evidence grammar

최소형:

```txt
input:<input_id>#summary
input:<input_id>#extracted-facts
input:<input_id>#source-screen-refs
input:<input_id>#expected-reconciliation
```

선택적으로 bullet index를 붙일 수 있다.

```txt
input:IN-20260720-figma-001#extracted-facts/02
```

1차 구현에서 section 존재는 hard, bullet index 해소는 warning-first로 시작한다. 향후 input fact에 stable ID를 도입하면 exact hard ref로 승격할 수 있다.

### 5.8 Source Unit enum

- `document`
- `statement`
- `record`
- `instance`
- `node`
- `frame`
- `token`
- `screenshot`
- `measurement`
- `aggregate`
- `n/a`

규칙:

- 숫자 집계가 포함된 사실은 `record`·`instance`·`aggregate` 중 하나를 써야 한다.
- Figma component instance 근거는 `instance`, raw node 근거는 `node`, 화면 전체 프레임 근거는 `frame`을 권장한다.
- `n/a`는 `reject` 또는 source가 없는 purely procedural item에만 허용한다.

### 5.9 예시

```md
| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | 01 | visual-evidence | simple-update | create | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001 | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | instance | inherit |
| IN-20260720-figma-001 | 02 | component-missing | component-gap | create-open | gap:G-001@component-gap-register | input:IN-20260720-figma-001#extracted-facts/02 | figma://file/abc/node/1:235 | instance | inherit |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | create-open | conflict:C-001@conflicts | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | reopen | decision:D-204@AUTH-001 | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |
```

---

## 6. Routing matrix

validator는 선언된 `Basis`에 대해 다음 조합을 hard하게 검사한다.

| Basis | Classification | 필수/허용 Effect·Target |
|---|---|---|
| `compatible-fact` | `simple-update` | `update|create` + `artifact:*` |
| `visual-evidence` | `simple-update` | `update|create` + visual 허용 artifact/section |
| `unknown-answer` | `resolves-unknown` | `link-evidence` + `unknown:*` |
| `decision-answer` | `resolves-decision` | `link-evidence` + `decision:*` |
| `new-choice` | `new-decision` | `create-open` + `decision:*` |
| `component-missing` | `component-gap` | `create-open` + `gap:*` |
| `verification-gap` | `investigation-needed` | `create-open|record` + `investigation:*|verification:*`; blocking이면 별도 `decision:*` effect 허용 |
| `input-input-conflict` | `conflict` | `create-open|record` + `conflict:*`; 구현 선택을 가르면 별도 `decision:*` effect 허용 |
| `resolved-decision-conflict` | `conflict` | 같은 Item에 `conflict:* create-open`과 `decision:* reopen` 둘 다 필수 |
| `scope-unclear` | `scope-unclear` | `unknown:*` 또는 `decision:*`; screen-level artifact write는 금지 |
| `reject` | `reject-input` | `reject` + `-` 또는 원 input target |

### 6.1 Visual vs behavior target rule

`Basis=visual-evidence`는 다음 target을 허용한다.

- `figma-component-mapping`
- `visual-consistency-contract`
- `component-gap-register`
- ScreenSpec의 `ui-sections`, `notes`, `sources`처럼 시각 reference를 담는 제한된 section

다음 target은 hard error다.

- ScreenSpec `interaction-matrix`
- `state-matrix`
- `data-requirements`
- `api-candidates`
- `acceptance-criteria`
- Navigation Map의 behavior edge
- Domain Rules의 business rule

단, Figma 입력이 behavior 충돌을 **발견**한 경우에는 별도 item을 `new-choice` 또는 `resolved-decision-conflict`로 기록한다. visual item 자체가 behavior를 확정하지 않는다.

### 6.2 Scope-unclear rule

`Basis=scope-unclear` item은 canonical screen identity가 해소되기 전까지 screen-level artifact target을 가질 수 없다.

허용:

- `unknown:*`
- `decision:*`
- domain/app-level canonical artifact
- input artifact 내 evidence 보존

금지:

- raw source token을 canonical Screen ID로 간주한 ScreenSpec write

---

## 7. Summary ↔ Items 일치 규칙

### 7.1 Classification multiset

item table에서 unique `(Input ID, Item)`를 묶고 classification multiset을 계산한다.

예:

```txt
01 simple-update
02 simple-update
03 conflict
```

Summary는 다음과 같아야 한다.

```txt
simple-update×2 + conflict
```

순서 차이는 허용하되 validator가 canonical order를 제안한다.

### 7.2 Touched Artifacts

각 effect target의 owner artifact를 모아 Summary `Touched Artifacts`와 비교한다.

- exact set mismatch: hard error
- section detail만 다른 경우: 초기에는 warning, dogfood 후 hard 후보

### 7.3 Created Items

다음 effect target을 `Created Items` 집합에 포함한다.

- `create`
- `create-open`
- `reopen`
- `link-evidence`
- `record`

`update`로 기존 artifact 본문만 보강한 경우는 기본적으로 `Touched Artifacts`에만 둔다. 다만 특정 row를 새로 만들었다면 `Effect=create`를 사용한다.

### 7.4 Result consistency

1차 rollout에서는 warning-first다.

- `pending-user-decision`인데 관련 decision target이 하나도 없음
- `accepted`인데 이 input이 생성/재오픈한 decision이 현재 모두 open
- `delegated`인데 INV-/VER- target이 없음
- `rejected`인데 non-reject effect가 존재

현재 child status는 역사적 effect와 다를 수 있으므로 hard error로 만들지 않는다.

---

## 8. Referential integrity와 stale detection

### 8.1 Hard reference checks

- Summary row의 Input ID가 실제 input artifact로 해소됨
- item의 Input ID가 Summary row와 input artifact 양쪽에 존재
- `Evidence`가 같은 input id를 가리킴
- target owner artifact_id가 실제 문서로 해소됨
- D-/C-/U-/G- target ID가 지정 section의 실제 row로 해소됨
- target kind와 실제 section kind가 일치
- 같은 `(Input ID, Item, Effect, Target)` 중복 금지
- 같은 item의 Classification/Basis 불일치 금지

### 8.2 Stale warning checks

- Summary `Result=pending-user-decision`인데 관련 decision이 모두 resolved
- Summary `Result=accepted|rejected`인데 관련 Conflict가 open으로 남아 있음
- decision reopen과 연결된 Conflict 중 한쪽만 resolved
- item target은 존재하지만 해당 input id/source evidence가 대상 row 본문에서 사라짐
- `Touched Artifacts`는 item에 있지만 실제 문서에 input source/ref 흔적이 전혀 없음

마지막 두 항목은 문서별 표준 provenance 칸이 없는 경우 false positive가 날 수 있으므로 warning-first다.

### 8.3 자연어 routing heuristic

다음은 warning-only 후보다.

- Unknown row에 서로 다른 두 input id 또는 `A/B`, `vs`, `상호배타`, `충돌` 패턴이 같이 있음
- visual mapping Notes에 routing/filter/sorting/API behavior 키워드가 있음
- conflict item이 있는데 Conflict row가 없고 Unknown만 존재
- `resolved-decision-conflict` basis인데 current target decision이 한 번도 reopen된 흔적이 없음

이 heuristic은 hard gate 또는 `--enforce` 승격 대상이 아니다. false-positive evidence가 충분히 쌓인 뒤 별도 사람 승인으로만 승격한다.

---

## 9. Provenance Contract

### 9.1 공통 timestamp 규칙

RFC3339 with timezone을 사용한다.

허용:

```txt
2026-07-20T10:15:30+09:00
2026-07-20T01:15:30Z
```

금지:

```txt
2026-07-20
2026/07/20 10:15
10:15 KST
```

공유 parser를 `scripts/lib/provenance.mjs` 같은 한 곳에 두고 다음이 같이 사용한다.

- 검사 11 input `captured_at`
- 검사 12 v2 item `Captured At`
- Figma mapping provenance

### 9.2 Input-level inheritance

item `Source Ref=inherit`와 `Captured At=inherit`는 해당 input artifact의 값을 사용한다.

상속 후에도 다음은 item에 반드시 남는다.

- `Source Unit`
- `Evidence`

### 9.3 Precision floor

기계 검사는 “외부 사실이 진짜인가”가 아니라 “얼마나 구체적으로 근거를 선언했는가”만 본다.

최소 통과 조건:

```txt
input evidence section pointer 존재
+ source ref 존재 또는 inherit 가능
+ source unit enum 명시
+ captured_at RFC3339 또는 inherit 가능
```

Figma/node-based item의 추가 최소 조건:

```txt
Source Unit=node|instance|frame 중 하나
+ Source Ref에 node/frame 식별 가능한 토큰 존재
```

숫자 집계 item의 추가 최소 조건:

```txt
Source Unit=record|instance|aggregate 중 하나
```

validator는 실제 숫자가 올바른지 또는 Figma node가 실재하는지는 확인하지 않는다.

---

## 10. `figma-component-mapping` provenance v1

### 10.1 기존 4컬럼 header 보존

다음 헤더는 바꾸지 않는다.

```md
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
```

각 mapping row의 첫 셀에 안정 키를 넣는다.

```md
| `M-001` · Auth frame / node `1:234` | Primary CTA | components/ui/Button | variant=primary |
```

### 10.2 Frontmatter opt-in

```yaml
provenance_contract: 1
```

필드가 없으면 기존 mapping 문서는 v0로 처리한다. 신규 템플릿과 reconcile-input이 새로 만드는 mapping에는 v1을 쓴다.

### 10.3 Mapping Provenance Table

```md
## Mapping Provenance

| Mapping Key | Source Ref | Source Unit | Captured At | Evidence |
|---|---|---|---|---|
| M-001 | figma://file/abc/node/1:234 | instance | inherit | input:IN-20260720-figma-001#extracted-facts/01 |
```

검사:

- 모든 Component Mapping row에 unique `M-xxx` key 존재
- 모든 key에 provenance row 정확히 1개
- orphan provenance row 금지
- Source Unit·timestamp·Evidence 형식 검사
- frontmatter `sources`/`## Frame`과 source ref의 파일/frame 축이 명백히 모순되면 warning

### 10.4 records-vs-instances 예시

```md
| M-010 | figma://file/abc/node/2:100 | instance | 2026-07-20T10:15:30+09:00 | input:...#extracted-facts/04 |
```

“카드 12개”가 Figma component instance 수라면 `instance`다. API 응답 record 수라면 `record`다. 이 구분을 prose에만 두지 않고 enum으로 남긴다.

---

## 11. Validate 통합

### 11.1 Check 번호

새 numbered hard gate를 만들지 않고 **검사 12를 확장**한다.

이유:

- 같은 canonical artifact의 구조·coverage·consistency 검사다.
- 사용자-facing “하드 게이트 12종” 카운트를 불필요하게 바꾸지 않는다.
- v1/v2 분기는 동일 parser가 담당하는 편이 drift가 적다.

진단 메시지에는 stable prefix를 둔다.

- `RR-SCHEMA-*` Register schema
- `RR-ITEM-*` item/effect
- `RR-REF-*` reference
- `RR-ROUTE-*` routing matrix
- `RP-*` provenance
- `RR-STALE-*` warning

초기에는 JSON object shape를 바꾸지 않고 message prefix로 제공한다. 향후 `code` 필드를 추가하려면 별도 compatibility 검토를 한다.

### 11.2 Parser 구조

권고 모듈 분리:

```txt
scripts/lib/reconciliation-register.mjs
  - v1 summary parse
  - contract version/frontmatter parse

scripts/lib/reconciliation-items.mjs
  - named section table parse
  - enum/target/evidence grammar
  - summary projection
  - routing matrix

scripts/lib/provenance.mjs
  - RFC3339
  - source unit enum
  - inherit resolution

scripts/lib/reconciliation-target-index.mjs
  - artifact_id index
  - decisions/unknowns/conflicts/gaps/investigation/verification row index
```

`validate.mjs`에서 이미 수집한 docs/inputArtifacts를 인덱스에 전달해 재귀 walk를 반복하지 않는다.

### 11.3 v1 compatibility

`reconciliation_contract`가 없으면:

- 현재 첫 표 parser와 검사 12 결과 유지
- `Reconciliation Items` 요구 없음
- output/exit code 변화 없음
- legacy register에 새 warning을 기본 발생시키지 않음

`reconciliation_contract: 2`일 때만 v2 규칙을 활성화한다.

### 11.4 `--enforce` 의미

기존 `--enforce`는 row 없음과 `not-started`를 error로 승격하는 계약을 유지한다.

v2에서 deterministic schema/ref/routing 오류는 `--enforce`와 무관하게 hard error다. semantic heuristic은 `--enforce`로도 hard 승격하지 않는다.

---

## 12. Review Profile — `reconcile-stage04-v1`

### 12.1 Reviewer의 필수 검토 범위

1. **Source backing**
   - item마다 Evidence, Source Ref, Source Unit, Captured At이 최소 바닥을 충족하는가.
2. **Routing**
   - Basis와 Classification이 맞는가.
   - Conflict/Unknown/Decision/Gap/INV-/VER-가 올바른 축으로 갔는가.
3. **Gate-raising boundary**
   - diff에서 LLM이 resolve/close/accept/confirm을 수행하지 않았는가.
   - resolved decision 충돌 시 Conflict 기록 + reopen이 함께 있는가.
4. **Scope**
   - visual evidence가 behavior를 확정하지 않았는가.
   - raw source token으로 canonical Screen ID를 발명하지 않았는가.
   - code/tests/generated/live policy/CI를 수정하지 않았는가.
5. **Completeness**
   - validator가 잡는 summary/item/ref 오류가 모두 해소됐는가.
   - 남은 불확실성이 D/U/C/G/INV/VER 또는 명시 Result로 표현됐는가.

### 12.2 Reviewer가 pass 조건으로 요구하면 안 되는 것

- 잠정 mapping의 최종 pixel-perfect 정확도
- 모든 Figma node의 전체 ancestry
- 모든 token의 final canonical naming
- human decision의 최종 선택
- Copy Key `confirmed` 승격
- downstream code 구현
- visual regression green
- provenance floor를 넘는 무한 정밀화
- 스타일·표현만 다른 비기능적 rewrite

### 12.3 Severity

| 등급 | 예 | Pass 차단 |
|---|---|---|
| Critical | gate-lowering, code/generated/live policy 수정, 기존 결정 조용히 덮어쓰기 | 예 |
| Major | 잘못된 routing, target 없음, summary/item mismatch, visual→behavior 누출 | 예 |
| Minor | provenance floor 누락, noncanonical grammar, stale result | v2 필수값이면 예, heuristic이면 아니오 |
| Info | 더 정밀한 node ancestry, 문구 개선, optional visual detail | 아니오 |

### 12.4 Finding 일괄 제출 규칙

reviewer는 한 라운드에 발견한 필수 finding을 전부 제출한다.

권고 출력:

```md
Verdict: CHANGES_REQUIRED

Hard findings
- RR-ROUTE-001 ...
- RR-REF-002 ...
- RP-001 ...

Non-blocking notes
- INFO ...

Stop condition after fixes
- workflow:validate passes
- no Critical/Major finding
- remaining uncertainty is represented by open D/U/C/G/INV/VER
```

금지:

- 한 라운드에 한 finding만 의도적으로 제출
- 이전 라운드에서 통과한 fidelity 수준을 다음 라운드에 임의 상향
- Info 항목을 새 pass 조건으로 전환
- human-final 상태를 Stage 04 candidate에 요구

### 12.5 Stop condition

다음이 모두 만족되면 리뷰를 종료한다.

1. `workflow:validate` hard errors 0
2. reviewer Critical/Major 0
3. gate-lowering diff 0
4. source/provenance floor 충족
5. unresolved 사항이 canonical open item으로 표현됨
6. scope 밖 code/tests/generated/live policy/CI 변경 0

남은 precision 개선은 별도 follow-up이며 현재 reconcile pass를 막지 않는다.

---

## 13. 문서/스킬 변경안

### 13.1 Canonical docs

- `docs/reference/input-reconciliation.md`
  - v1/v2 contract
  - item/effect/routing matrix
  - summary grammar
  - migration
- 신규 `docs/reference/reconcile-review-rubric.md`
  - `reconcile-stage04-v1`
  - severity/stop condition/finding batch rule
- `docs/reference/doc-ownership.md`
  - reconciliation contract owner와 review rubric owner 추가

### 13.2 Templates

- `templates/meta/reconciliation-register.template.md`
  - v2 frontmatter
  - structured_since
  - Summary canonical grammar
  - `## Reconciliation Items`
- `templates/screen/figma-component-mapping.template.md`
  - `provenance_contract: 1`
  - `M-xxx` key convention
  - `## Mapping Provenance`

### 13.3 Skills

- `skills/reconcile-input/SKILL.md`
  - item table을 summary와 함께 작성
  - review profile pointer
  - source unit 선택 규칙
  - final response에 `review_profile`과 stop evidence 보고
- 필요 시 consumer local reviewer prompt/template
  - 새 별도 skill보다 기존 skill의 “Review Contract” 절을 우선

### 13.4 Changelog/roadmap

- `kit-dev/CHANGELOG.md`
- `kit-dev/roadmap-current.md`
- Issue #202에 설계 결정/PR slice 링크

---

## 14. 구현 PR 분할

### PR 202-A — Register v2 + Check 12 structural enforcement

범위:

- contract version/frontmatter
- Reconciliation Items parser
- summary projection
- typed target/evidence grammar
- routing matrix hard checks
- reference index
- v1 compatibility tests
- review profile canonical doc와 skill pointer

우선순위: **최우선**

이 PR에서 하지 않는 것:

- Figma mapping provenance hard check
- 자연어 semantic hard gate
- Result stale hard gate

### PR 202-B — Provenance floor

범위:

- shared RFC3339/source unit parser
- 검사 11 `captured_at` 형식
- item inheritance
- Figma mapping `M-xxx` + Mapping Provenance
- records-vs-instances tests

rollout:

- v2/new mapping에 hard
- legacy input timestamp는 첫 릴리스 warning-first 후 승격 여부 판단

### PR 202-C — Heuristic warnings + dogfood evidence

범위:

- possible-conflict-routed-as-unknown
- visual behavior leakage keyword warning
- stale Result/child status warning
- reconcile fixture/dogfood에서 review round 수와 false positive 측정

주의:

- warning-first 유지
- CI required check 승격 없음
- promotion은 별도 사람 승인

---

## 15. 테스트 계획

### 15.1 v1 compatibility

- 기존 `examples/reconciliation-validation/pass|fail|unreconciled|malformed-register` 결과 byte/exit 동일
- `reconciliation_contract` 없는 register는 item table 없이 통과/실패가 기존과 동일
- 기존 `Created Items` 주석을 계속 파싱하지 않음

### 15.2 v2 pass

- simple-update 2개 + conflict 1개 summary multiset 일치
- conflict item이 C create-open + D reopen 두 effect를 가짐
- input/source/captured_at inherit 해소
- typed artifact/row target 모두 해소

### 15.3 v2 hard failures

- item table 필수 컬럼 누락
- orphan item input
- duplicate item/effect/target
- same item의 Basis/Classification 불일치
- summary classification count mismatch
- Created Items 누락/과잉
- Touched Artifacts 누락/과잉
- target artifact 없음
- target row 없음
- target kind/section mismatch
- `resolved-decision-conflict`에 reopen effect 없음
- `unknown-answer`가 decision target으로 감
- visual-evidence가 interaction-matrix를 update
- `scope-unclear`가 raw token 기반 ScreenSpec을 update
- invalid Source Unit
- invalid RFC3339
- `inherit`할 input source_ref/captured_at 부재

### 15.4 warning-only

- Unknown prose가 A/B conflict처럼 보임
- pending-user-decision인데 현재 decision resolved
- section pointer는 있으나 bullet index가 해소되지 않음
- legacy noncanonical Result spelling

### 15.5 Figma mapping

- M key ↔ provenance 1:1 pass
- duplicate M key
- missing provenance
- orphan provenance
- `Source Unit=record`와 `instance` 구분
- node/instance인데 source ref에 식별자 없음
- provenance contract 없는 legacy mapping은 기존 동작 유지

### 15.6 Review contract

- canonical review doc가 payload에 포함되는지 distribution test
- `reconcile-input` skill이 review profile·stop condition·batch finding rule을 가리키는지 contract test
- fixture의 `expected-llm-after`는 pass, human-final만 요구하는 reviewer fixture는 reject

---

## 16. Migration

### 16.1 신규 consumer

새 템플릿으로 즉시 v2 사용.

```yaml
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: <adoption timestamp>
```

### 16.2 기존 consumer

1. 기존 8컬럼 표는 유지한다.
2. frontmatter에 v2 필드와 현재 시각의 `structured_since`를 추가한다.
3. 과거 input은 summary-only legacy로 둔다.
4. 이후 capture된 input부터 item table을 작성한다.
5. 기존 Figma mapping은 다음 reconcile 때 `provenance_contract: 1`로 승격한다.

### 16.3 기존 과거 행 backfill

선택 사항이다. backfill할 경우 실제 과거 source가 불명확하면 정밀도를 발명하지 않는다.

- `Source Ref=inherit`가 가능하면 사용
- `Source Unit=document|statement`처럼 확인 가능한 최소 단위 사용
- 확인 불가한 node/instance를 추측하지 않음
- `legacy-unavailable` 같은 escape hatch를 hard 통과용으로 만들지 않음

backfill 불가 행은 `structured_since` 이전 legacy로 남긴다.

---

## 17. 위험과 완화

### 위험 R1 — 저작 부담 증가

한 input에 여러 effect 행을 써야 한다.

완화:

- skill이 표를 작성
- template에 대표 사례 제공
- summary를 item table에서 계산하는 helper 함수는 제공하되, 초기에는 새 mutating CLI를 만들지 않음

### 위험 R2 — Summary와 Items의 이중 기입

두 표현이 drift할 수 있다.

완화:

- validator가 exact set/multiset을 비교
- 장기적으로 read-only `workflow:reconciliation-summary --json` 또는 sync helper 검토
- v2의 canonical detail은 Items, Summary는 projection이라고 명문화

### 위험 R3 — table이 너무 넓음

10컬럼 표가 사람이 읽기 어렵다.

완화:

- 한 셀을 자유서술로 키우지 않고 짧은 typed token 사용
- 상세 설명은 대상 artifact와 input에 남김
- Markdown 렌더보다 grep/parser 안정성을 우선

### 위험 R4 — semantic false positive

자연어 routing detector가 잘못 경고할 수 있다.

완화:

- heuristic은 warning-only
- `--enforce`로 승격하지 않음
- telemetry/dogfood 증거 후 별도 promotion decision

### 위험 R5 — actor 오판

현재 resolved 상태를 LLM 침범으로 오판할 수 있다.

완화:

- static validator는 actor-sensitive hard rule을 만들지 않음
- diff reviewer가 gate-lowering을 확인
- effect는 historical action으로 정의

### 위험 R6 — provenance가 형식 채우기로 전락

`inherit + statement`만 반복해 정밀도가 낮을 수 있다.

완화:

- Figma/node/count 계열에는 Source Unit별 추가 규칙
- reviewer는 source precision floor만 확인하되 명백히 더 구체적인 source가 있는데 `document`로 뭉개면 Major로 판단 가능
- 무한 정밀화는 금지

---

## 18. Issue #202 제안 A/B/C 대응표

| Issue 제안 | 설계 대응 | 완료 조건 |
|---|---|---|
| A. validate 행 정합 검사 | Contract v2 item/effect table, summary projection, typed ref, routing matrix, check 12 확장 | v2 pass/fail fixtures + v1 compatibility |
| A. Unknown vs Conflict routing | Basis enum hard mapping + 자연어 heuristic warning | declared basis misrouting hard, prose inference warning |
| A. stale 상호참조 | hard target resolution + Result/current status stale warning | orphan/missing target hard, historical status mismatch warning |
| B. provenance schema | Source Ref/Unit/Captured At + inheritance, Figma Mapping Provenance | node/frame/unit/time one-to-one tests |
| C. review rubric/fidelity signal | `review_profile: reconcile-stage04-v1`, canonical rubric, batch finding, stop condition | skill/doc/distribution contract test |

---

## 19. 수용 기준

Issue #202는 다음이 충족될 때 닫을 수 있다.

- [ ] 신규 register template가 v2 contract를 생성한다.
- [ ] v1 consumer는 opt-in 전 기존 validate 결과가 유지된다.
- [ ] v2에서 Classification multiset과 item effects가 일치하지 않으면 hard fail한다.
- [ ] Created Items/Touched Artifacts typed ref가 실제 artifact/row로 해소되지 않으면 hard fail한다.
- [ ] declared routing basis와 classification/effect/target 조합이 틀리면 hard fail한다.
- [ ] 자연어 의미 추정은 warning-only이며 `--enforce`에도 hard 승격되지 않는다.
- [ ] input/item/mapping provenance가 RFC3339·source unit·source ref 계약을 가진다.
- [ ] Figma mapping의 기존 4컬럼 header와 readiness fact 의미는 유지된다.
- [ ] static validate가 human action을 LLM action으로 오판하지 않는다.
- [ ] canonical review profile이 Stage 04 candidate의 review 범위와 stop condition을 정의한다.
- [ ] reviewer는 필수 finding을 한 번에 제출하고 Info를 pass blocker로 쓰지 않는다.
- [ ] gate-lowering·code/generated/live policy/CI 변경은 reviewer Critical로 차단한다.
- [ ] dogfood에서 기존 10~20 라운드 계열 finding의 대부분이 첫 validate 또는 첫 review round에 일괄 표면화된다.

---

## 20. 권고 결정

다음 결정을 Issue #202에 채택하는 것을 권고한다.

1. **설계 채택:** 기존 Register를 opt-in v2로 확장한다.
2. **검사 위치:** 새 numbered check가 아니라 validate 검사 12를 확장한다.
3. **구조:** Summary Table 유지 + Reconciliation Items effect table 추가.
4. **Hard 경계:** 구조·참조·선언된 routing만 hard, 자연어 heuristic은 warning-only.
5. **Provenance:** input 상속 + item별 Source Unit 필수 + RFC3339.
6. **Figma:** 기존 4컬럼 mapping 유지, M-key와 Mapping Provenance 추가.
7. **Review:** `reconcile-stage04-v1` profile을 canonical화하고 batch finding/stop rule을 강제한다.
8. **구현 순서:** 202-A(Register+review) → 202-B(provenance) → 202-C(heuristic/dogfood).

이 접근은 #202가 지적한 세 곱셈 인자를 각각 줄인다.

```txt
기계 강제 0
→ v2 structural/ref/routing checks

정밀도 바닥 0
→ source_ref + source_unit + captured_at

잠정물 최종-fidelity 리뷰
→ review_profile + explicit stop condition
```

