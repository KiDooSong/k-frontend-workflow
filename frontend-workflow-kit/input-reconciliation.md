# Input Reconciliation

> 코덱스 ↔ 클로드 교차 리뷰 반영(2026-06-13):
> **Conflict 는 신호(passive log)일 뿐 게이트가 아니다. 게이트는 Open Decision 재오픈이 건다.**
> 처리 이력·결과·멱등성은 `Reconciliation Register` 가 담당하고, 결과 어휘(accepted/rejected/…)는
> register 의 `Result` 에 둔다(`conflicts.template.md` 의 A/B 스키마는 손대지 않는다).
> **2차 반영:** register 의 `Status` 를 `Reconcile Status`(reconcile 행위 라이프사이클)로 바꾸고
> 자식 항목(C/D/U/G/INV/VER)의 open/closed 와 분리한다 — open decision 을 남기고 끝난 입력이
> "미처리"로 오탐되어 코드 게이트가 계속 막던 문제를 차단한다.
> **3차 반영:** `component-gap` 분류 추가 — 카탈로그에 없는 공통 컴포넌트가 필요한 입력(figma 등)은
> 기존 `Component Gap Register`(Tier 1 아티팩트)에 `G-xxx` 를 `open` 으로 제안한다(제안만, accept 는 사람).
> 새 산출물 축이 아니라 기존 레지스터에 reconcile 을 잇는 것이다. (골든 테스트 finding 반영)

외부 입력 스킬이 저장한 새 입력 결과물을 기존 frontend-workflow 문서와 맞춰보고, 단순 반영인지, 결정 필요인지, 충돌인지 분류하는 단계다.

이 문서는 입력을 "가져오는 방법"을 정의하지 않는다. Figma, 기획 문서, API 문서, 회의록, QA 메모 등은 프로젝트별 입력 스킬이 수집하고 저장한다고 가정한다. 이 킷은 그 결과물의 위치와 메타만 받아 기존 산출물과 대조한다.

```txt
input skill
→ 입력 수집 및 저장
→ 입력 결과물 위치 반환

frontend-workflow-kit
→ 입력 결과물을 읽음
→ 기존 산출물과 대조
→ 업데이트 / Unknown / Open Decision / Conflict 로 분류
→ Reconciliation Register 에 처리 이력·결과 기록
→ 사람 결정 후 문서 업데이트
→ workflow:state / readiness / validate
```

## 목적

새 입력은 프로젝트를 앞으로 밀 수도 있고, 기존 결정을 뒤집을 수도 있다. 입력이 들어올 때마다 LLM이 조용히 기존 문서를 덮어쓰면 결정 이력과 구현 방향이 쉽게 흐트러진다.

Input Reconciliation의 목적은 다음이다.

- 새 입력이 기존 문서와 같은 방향인지 확인한다.
- 기존 `confirmed` 문서나 `resolved` 결정과 충돌하는지 확인한다.
- 단순 업데이트, 사실 확인, 결정 필요, 충돌을 분리한다.
- 코드 변경 전에 문서 상태와 readiness를 다시 계산하게 한다.
- 사용자가 지금 결정할 수 있는 항목은 직접 결정하게 하고, 보류/문의가 필요한 항목은 blocker로 남긴다.

## 전제

입력 스킬은 입력 원천별로 따로 존재할 수 있다.

```txt
figma-input skill
planning-doc-input skill
api-doc-input skill
meeting-note-input skill
qa-input skill
user-note-input skill
```

이 스킬들은 원본을 가져오고, 요약하고, 결과물을 프로젝트 안 어딘가에 저장한다. 우리 킷은 수집 방식에는 관여하지 않는다.

중요한 계약은 입력 스킬이 마지막에 **입력 결과물 위치**와 **`input_id`** 를 남기는 것이다.

## Input Result Contract

입력 결과물의 frontmatter 는 다음 **canonical schema** 를 따른다. 정본의 단일 출처는 [templates/input/input-artifact.template.md](templates/input/input-artifact.template.md) 와 [examples/input-reconciliation/inputs/*.md](examples/input-reconciliation/inputs/) 이고, 아래 표가 그 계약이다.

```md
---
# --- required ---
input_id: "IN-20260613-figma-001"            # 전역 유일·불변. 멱등성·역추적·supersede·미처리 감지의 키
input_type: "figma"                          # normalized category: planning | figma | api | meeting | qa | user-note
source_type: "figma"                         # concrete source adapter/type: planning-doc | figma | api-doc | meeting | qa | user-note
source_ref: "figma-planning/coupon-list-12-v2"   # 원본 링크 또는 파일 경로
captured_at: "2026-06-13T00:00:00+09:00"     # 수집 시점
captured_by: "sample-figma-input-skill"      # 저장한 입력 스킬
status: "captured"                           # 입력 자체의 상태 (≠ Reconcile Status — 아래 참조)
affected_domains: ["coupons"]                # 관련 도메인 (canonical scope 필드)
affected_screens: ["COUPON-001"]             # 관련 화면 (canonical scope 필드)
# --- optional ---
confidence: "candidate"                      # optional(recommended): unknown | candidate | confirmed
supersedes: null                             # optional: 같은 원천의 이전 input_id (입력↔입력 축)
raw_artifacts: []                            # optional: 원본 첨부(스크린샷·export 등) 경로/URL 목록
---

## Summary
입력 요약은 frontmatter 가 아니라 여기 body 의 `## Summary` 섹션에 둔다.
```

| Field | 위상 | 설명 |
|---|---|---|
| `input_id` | **required** | 전역 유일·불변. 멱등성·역추적·supersede·미처리 감지가 이 키에 걸린다 |
| `input_type` | **required** | normalized category(사람이 읽는 분류 라벨): `planning`/`figma`/`api`/`meeting`/`qa`/`user-note` |
| `source_type` | **required** | concrete source adapter/type: `planning-doc`/`figma`/`api-doc`/`meeting`/`qa`/`user-note` |
| `source_ref` | **required** | 원본 링크 또는 파일 경로 |
| `captured_at` | **required** | 입력을 수집한 시점 |
| `captured_by` | **required** | 어떤 입력 스킬이 저장했는지 |
| `status` | **required** | **입력 자체의 상태**(예: `captured`). register 의 `Reconcile Status` 와 다르다 — 아래 참조 |
| `affected_domains` / `affected_screens` | **required** | **canonical scope 필드**(관련 도메인/화면) |
| `confidence` | optional(recommended) | `unknown`/`candidate`/`confirmed`. 기본 `candidate`. confirmed 라도 LLM 이 문서를 confirmed 로 올리진 않는다 |
| `supersedes` | optional | 같은 원천의 이전 `input_id`(입력↔입력 축. 결정값 번복 아님) |
| `raw_artifacts` | optional | 원본 첨부(스크린샷·export 등) 경로/URL 목록 |

**deprecated alias (읽기 호환만 — 새로 쓰지 말 것):**

```txt
suggested_scope.domains / suggested_scope.screens   → affected_domains / affected_screens 로 대체.
frontmatter summary                                 → body 의 ## Summary 섹션이 정본.
```

이전 입력은 중첩 `suggested_scope` 와 frontmatter `summary` 를 썼다. 둘은 deprecated alias 다 — parser 는 한동안 읽어 호환만 유지하고(발견 시 경고), 새 입력·템플릿·생성기는 canonical 필드만 출력한다.

입력 결과물의 저장 위치 (파일명 = `input_id`):

```txt
docs/frontend-workflow/inputs/{input_id}.md
예: docs/frontend-workflow/inputs/IN-20260613-figma-001.md
    docs/frontend-workflow/inputs/IN-20260613-api-001.md
```

required 중 `input_id` 가 특히 핵심이다 — 멱등성·역추적·supersede·미처리 감지가 모두 이 키에 걸린다. optional(`confidence`·`supersedes`·`raw_artifacts`)은 없어도 되지만, required 필드가 비면 입력 결과물로서 불완전하다.

`input_id` 불변 계약:

```txt
input_id 는 한 번 발급하면 불변이다.
입력 내용이 바뀌면 같은 id 를 덮어쓰지 않고 새 input_id 를 발급한다.
새 입력은 supersedes 로 이전 input_id 를 가리킨다.
```

이 규칙이 없으면 같은 id 에 다른 내용이 실려 "이미 처리한 입력"으로 잘못 스킵된다. id 형식은 충돌을 줄이려 `IN-{날짜}-{source}-{seq}` 처럼 source 를 끼우는 것을 권장한다.

### `status` vs `Reconcile Status` — 세 가지 다른 축

"status" 라는 단어가 세 곳에 나오지만 **출처도 의미도 라이프사이클도 다르다.** 한 칸에 섞으면 결정 대기 입력이 "미처리"로 오탐된다.

```txt
입력 artifact 의 status   (입력 frontmatter)                       입력을 수집/적재했는가.   값: captured (등 입력 수집 상태)
Reconcile Status          (Reconciliation Register)                그 입력을 reconcile 했는가. 값: not-started → in-progress → reconciled / failed
자식 항목 open|resolved    (Open Decisions·Conflicts·Unknowns·Gap)  그 입력이 만든 결정/충돌이 닫혔는가.
```

- **입력 `status`** 는 입력 결과물 *자체*의 상태다. reconcile 행위와 무관하다 — 입력 스킬이 적재를 끝냈으면 `captured` 다. 입력 스킬이 쓰며, reconcile-input 은 이 값을 바꾸지 않는다.
- **`Reconcile Status`** 는 reconcile **행위**의 상태다(register 가 단일 출처). 그 입력을 reconcile 했는지만 본다.
- **자식 항목 상태** 는 그 입력이 만든 `D-`/`C-`/`U-`/`G-` 가 닫혔는지다. 각 레지스터가 단일 출처다.

세 축은 독립이다. 예: 입력 `status=captured` + `Reconcile Status=reconciled` + 자식 `D-001=open` 은 "입력 적재 완료 / reconcile 완료 / 사람 결정만 대기"라는 **정상** 상태다. 이 조합을 "미처리"로 보면 안 된다 — 미처리 감지는 오직 `Reconcile Status` 만 본다(아래 "Code Change Gate").

## Reconciliation Register

입력의 처리 이력과 결과를 한곳에 남기는 **살아있는 레지스터**다. `Unknowns`·`Open Decisions`·`Conflicts` 와 같은 mutable-status 표 가족이다(행은 지우지 않고 Reconcile Status·Result 만 갱신한다). 엄밀한 append-only 불변 기록은 후속 `decision-log`/ADR 의 몫이고, 이 레지스터는 그보다 가볍다.

저장 위치 (입력 원문은 `inputs/`, register 는 처리 이력용 **meta-register** 라 `_meta/` 에 둔다 — `validate.mjs` 가 `_meta/` 를 authoring 검사에서 제외하므로 register 가 artifact_type 검사에 걸리지 않는다):

```txt
docs/frontend-workflow/_meta/reconciliation-register.md
```

스키마:

```md
## Reconciliation Register
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260613-meeting-001 | meeting | conflict + new-decision | reconciled | pending user decision | COUPON-001 | C-001, D-004 | - |
```

필드:

| Field | Description |
|---|---|
| Input ID | 입력 결과물의 `input_id`. 레지스터의 키. 입력당 canonical 행 1개 |
| Source | `source_type` 요약 |
| Classification | 이 입력이 만든 분류 **목록**(입력 1개가 여럿일 수 있다. 예: `conflict + new-decision`) |
| Reconcile Status | **reconcile 행위의 라이프사이클**: `not-started` → `in-progress` → `reconciled` / `failed`. 자식 항목 상태의 rollup 이 아니며, 입력 frontmatter 의 `status` 와도 별개다(위 "status vs Reconcile Status") |
| Result | 처리 결과/대기 어휘: `accepted` / `rejected` / `delegated` / `pending user decision` / `conflict-created` 등. reject-input 의 사유도 여기 적는다 |
| Touched Artifacts | 이 입력이 수정한 문서(ScreenSpec 등) |
| Created Items | 이 입력이 만든/재오픈한 레지스터 항목(`C-…`, `D-…`, `U-…`, `G-…`, `INV-…`, `VER-…`). 링크만 남긴다 |
| Supersedes | 이 입력이 대체하는 **이전 입력**의 id (입력↔입력 축) |

세 가지를 명확히 한다.

- **`Reconcile Status` 는 reconcile 행위의 상태지 자식 항목의 rollup 이 아니다.** 입력이 만든 C-001/D-001 이 아직 open 이어도 reconcile 자체는 `reconciled` 일 수 있다(정상). "입력을 처리했는가"와 "그 입력이 만든 결정/충돌이 다 닫혔는가"는 **다른 라이프사이클**이다. 이 둘을 한 칸에 섞으면 결정 대기 입력이 "미처리"로 오탐된다.
- **자식 item 의 open/closed 는 각 레지스터(Open Decisions·Conflicts·Unknowns)가 단일 출처다.** register 에 다시 적지 않는다(이중 기재 → 로그가 현실과 어긋난다). register 는 "이 입력을 reconcile 해서 이런 항목을 만들었다"만 기록한다.
- **`Supersedes` 는 입력↔입력 축만** 쓴다. 결정값 번복(decision supersede)은 여기 적지 않는다 — 후속 `decision-log` 의 몫이다. 두 축을 한 칼럼에 섞으면 이력 추적이 흐려진다.

## Reconciliation Flow

새 입력이 들어오면 코드 변경 전에 다음 흐름을 탄다. **register 를 문서 수정보다 먼저 쓰는 것**이 핵심이다(아래 register-first 참고).

```txt
1.  입력 결과물 경로와 input_id 를 받는다.
2.  Register 에 같은 input_id 행이 `reconciled` 면 멈춘다 (이미 처리됨 — 멱등성).
      `in-progress`(이전 실행이 중단됨)면 새 행을 추가하지 말고 그 행을 이어서 처리한다.
3.  Register 에 행을 먼저 쓴다 (Reconcile Status: `in-progress`).   ← 어떤 문서 수정보다 먼저.
4.  입력 요약(body `## Summary`)과 범위(`affected_domains`/`affected_screens`, 구 `suggested_scope`)를 읽는다.
5.  관련 기존 산출물을 찾는다.
6.  기존 confirmed/resolved 결정과 충돌하는지 대조한다.
7.  변경 유형을 분류한다 (입력 1개가 여러 분류일 수 있다).
8.  사용자 결정이 필요한 경우 멈추고 선택지를 제시한다.
9.  결정 결과에 따라 문서를 업데이트한다.
      - 입력 vs 입력 충돌이면 Conflicts 에 기록한다 (그 자체로는 gate 아님 — 구현 형태를 가르면 Open Decision 도 함께 올린다).
      - resolved 결정에 도전하는 입력이면 Conflicts 에 이전 값을 남기고 해당 Open Decision 을 재오픈한다.
      - Unknown 의 답을 제공하는 입력이면 출처와 근거를 기존 Unknown 에 연결하되 Status 는 `open` 으로 둔다 (`resolved` 는 사람 전용).
      - 검증 없이는 결정 불가면 Investigation/Verification 을 만들고(INV-/VER-), 막을 화면에 Open Decision 을 올린다 (investigation·Unknown 단독은 게이트가 아니다 — 게이트는 Open Decision).
      - 카탈로그에 없는 공통 컴포넌트가 필요하면 Component Gap Register 에 `G-xxx` 를 `open` 으로 제안한다 (제안만 — accept 는 사람, 직접 생성 금지).
10. Register 행을 `reconciled` 로 바꾸고 Result·Touched Artifacts·Created Items 를 채운다.
      자식 decision 이 열려 있어도 reconcile 자체는 끝난 것이다 (그 차단은 readiness 가 담당).
11. workflow:state → workflow:readiness → workflow:validate 를 실행한다.
12. readiness 가 허용한 범위에서만 개발한다.
```

관련 기존 산출물:

```txt
ScreenSpec
Navigation Map
Domain Rules
Component Catalog
Open Decisions
Conflicts
Global / domain rules
API schema / OpenAPI / API manifest
```

## Classification

새 입력은 다음 중 하나 **이상**으로 분류한다.

| Type | Meaning | Action |
|---|---|---|
| simple-update | 기존 방향과 충돌하지 않는 보강 | 관련 문서 업데이트 |
| resolves-unknown | `Unknowns`의 사실 확인에 답/근거를 제공 | 답/근거를 Unknown 행에 연결하고 resolvable 로 표시하되 Status 는 `open` 유지. `resolved` 닫기는 사람 전용 |
| resolves-decision | 열린 `Open Decision`에 대한 선택을 제공 | 사용자 확인 후 `resolved` 처리 |
| new-decision | 새 선택이 필요함 | `Open Decisions`에 `open` 행 추가 |
| component-gap | 카탈로그에 없는 새 공통 컴포넌트가 필요(주로 figma·디자인 입력) | `Component Gap Register`(`global/component-gap-register.md`)에 `G-xxx` 를 `open` 으로 **제안만**. accept(카탈로그 반영)·구현은 사람 (게이트 내림 계열). 새 공통 컴포넌트 직접 생성은 llm-rules 금지 |
| investigation-needed | 검증·실험·플랫폼 확인 없이는 결정 불가 | Investigation/Verification 생성(INV-/VER-) + 막을 화면에 Open Decision 을 올림 (investigation·Unknown 단독은 게이트 아님 — 게이트는 Open Decision). 상세: `investigation-and-verification.md` |
| conflict | 기존 입력/문서와 충돌 | `Conflicts`에 기록(resolved 결정과 충돌이면 decision 재오픈) |
| scope-unclear | 영향 범위가 불명확 | 막아야 하면 `Open Decisions`(게이트), 단순 확인이면 `Unknowns`(fact-finding)로 남김 |
| reject-input | 새 입력을 반영하지 않기로 함 | Register `Result` 에 사유 기록, 문서는 유지 |

입력 하나가 위 분류 중 **여러 개**를 동시에 만들 수 있다(예: simple-update 3 + conflict 1 + new-decision 1). 각각은 별도 item 으로 처리하고, Reconciliation Register 한 행에 `Classification` 목록과 `Created Items` 로 묶는다.

## Conflict Handling

충돌은 LLM이 조용히 해결하지 않는다. LLM의 역할은 충돌을 감지하고, 영향 범위와 선택지를 정리해 사용자에게 올리는 것이다.

```txt
LLM
= 충돌 감지
= 영향 범위 정리
= 선택지 제안
= 문서 업데이트 보조

User
= 지금 결정
= 다른 팀에 문의
= 보류
= 기존 결정 유지
= 새 입력 채택
```

`Owner`는 추천 책임자 또는 문의처다. 자동 권한 판정자가 아니다. `Owner=PM`이라고 해서 사용자가 판단 가능한 결정을 무조건 PM에게 넘기면 안 된다.

### Conflict 는 신호, Gate 는 Open Decision

`Conflicts` 표는 현재 **passive log** 다 — `readiness.mjs`·`validate.mjs` 어느 쪽도 읽지 않는다. 따라서 **충돌을 Conflicts 에 적는 것만으로는 어떤 모드 게이트도 걸리지 않는다.** 게이트를 실제로 내리는 건 **open 상태의 Open Decision** 뿐이다.

```txt
입력 vs 입력 / 문서 vs 문서 충돌 (대칭)
= Conflicts A/B 표에 기록. 그 자체로는 gate 가 아니다.
= **어느 쪽을 택해야 구현 형태가 정해지는 충돌이면 Open Decision 도 함께 만든다**
  (Blocking Mode 보수적으로). 그래야 게이트가 걸린다.
= 구현 형태와 무관한 순수 기록성 충돌만 Conflicts 단독으로 둔다.

입력 vs 이미 resolved 된 결정 (비대칭)
= 단순 충돌이 아니라 "결정 재오픈" 이다.
= Conflicts 에 이전 값을 보존(감사)하고,
= 해당 resolved Open Decision 을 다시 open 으로 올린다.
= readiness 는 이 open decision 때문에 다운그레이드된다.   ← 실제 gate.
= 사람이 재심 후 다시 resolved 로 닫는다.
```

재오픈 권한:

```txt
LLM 허용:
- 새 입력이 기존 resolved 결정과 충돌함을 감지
- Conflict 를 open 으로 기록(이전 값 보존)
- 해당 decision 을 open 으로 재오픈해 blocker 를 다시 올림  (= 게이트 올리는 보수적 방향)

LLM 금지:
- 새 값을 골라 resolved 로 닫기
- 이전 결정 값을 조용히 덮어쓰기
- Conflict 기록 없이 decision 만 바꾸기
```

즉 게이트를 **올리는** 재오픈은 LLM 가능, 게이트를 **내리는** 재-resolve 는 사람만. 이는 README 불변식 6, Open Decisions 의 "게이트 해제는 사람-전용"과 같은 계열이다.

**Conflict 와 그것이 재오픈한 decision 의 닫힘은 묶인다.**

```txt
C-001 이 D-001 재오픈 때문에 생겼다면,
사람이 D-001 을 다시 resolved 로 닫을 때 C-001 도 함께 resolved 로 닫는다.
(아니면 readiness 는 풀렸는데 충돌 로그만 open 인 stale 상태가 된다.)
```

## Conflict Status

`Conflicts` 표의 Status 는 `Unknowns`·`Open Decisions` 가족과 같은 **2-state** 다.

```txt
open      충돌 발견, 아직 처리 안 됨. (LLM 은 여기까지만 — 올리기만)
resolved  사람이 닫음. 출처 문서/결정을 고치고 닫는다.
```

게이트 무결성 불변식(가족 공통):

```txt
Conflict 를 resolved 로 닫는 것(= 게이트 해제 계열)도 사람만 한다.
LLM 은 conflict 를 open 으로 올리기만 한다.
```

`accepted` / `rejected` / `delegated` / `superseded 후보` 같은 **처리 방식 어휘는 Status 가 아니라 Reconciliation Register 의 `Result` 에 둔다.** 이렇게 해야 `conflicts.template.md` 의 A/B 대칭 스키마를 안 건드리고, 모든 결과 어휘가 register 한곳에 모인다. (`delegated` 는 사실 "닫힘"이 아니라 "열림 + 문의 중"이라 Status 로 두면 애매하다 — Result 로 가는 또 하나의 이유.)

`deferred` 는 Open Decisions 의 `deferred/Reversible/Assumptions` 묶음과 함께 후속으로 다룬다.

## Example

기존 결정(resolved):

```md
## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | → hide | final-fixture-ui | PM | resolved |
```

새 기획 입력(IN-20260613-meeting-001):

```txt
만료 쿠폰도 재발급 동선 때문에 목록에 노출해야 한다.
```

이 입력은 기존 resolved 결정과 충돌한다. LLM 이 바로 `hide` 를 `show` 로 바꾸면 안 된다. 이건 단순 충돌이 아니라 **결정 재오픈**이다.

**1) Conflicts 에 기존 A/B 템플릿 그대로 기록한다**(이전 값 보존 = 감사). `A` 가 새 입력, `B` 가 기존 결정이다.

```md
## Conflicts
| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |
|---|---|---|---|---|---|
| C-001 | 만료 쿠폰 목록 노출 | IN-20260613-meeting-001 / show | D-001 / hide | COUPON-001 | open |
```

**2) 게이트를 실제로 거는 건 Conflicts 가 아니라 D-001 재오픈이다.** LLM 이 D-001 을 `resolved → open` 으로 올린다(blocker 를 다시 올리는 보수적 방향이라 LLM 허용). 이전 값 `hide` 는 C-001 의 `B` 에 남아 있다.

```md
## Open Decisions
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
```

이제 `readiness_mode = min(fact_mode, decision_cap)` 에서 D-001 이 다시 `decision_cap` 을 끌어내려 화면이 `rough-fixture-ui` 로 다운그레이드된다 — 반박당한 결정 위에서 작업이 진행되지 않는다.

**3) Reconciliation Register 에 남긴다.**

```md
## Reconciliation Register
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260613-meeting-001 | meeting | conflict (decision reopen) | reconciled | pending user decision | COUPON-001 | C-001, D-001(reopened) | - |
```

reconcile 행위는 끝났으므로 `Reconcile Status=reconciled`. 자식 D-001 이 open 이라 `Result=pending user decision` — 이 조합이 "처리는 됐고 사람 결정만 남았다"를 정확히 표현한다. 이전 모델처럼 `Status=open` 으로 두면 "미처리 입력"으로 오탐돼 코드 게이트가 계속 막혔다.

**4) 사람이 재심 후 결정한다.** 새 입력을 채택하면:

```txt
1. D-001 을 사람이 resolved 로 다시 닫는다 (예: Options 를 → show).   ← 게이트 내림, 사람 전용.
2. C-001 도 함께 resolved 로 닫는다 (재오픈을 부른 decision 이 닫혔으므로).
3. 관련 ScreenSpec / Copy Keys / Interaction Matrix / API Candidates 를 수정한다.
4. Register 행의 Result 를 `accepted` 로 갱신한다 (Reconcile Status 는 이미 `reconciled`). 게이트는 D-001 resolved 가 푼다.
5. workflow:state / readiness / validate 를 다시 실행한다.
```

기존 결정을 유지하기로 하면 Register `Result` 를 `rejected` 로 적고 D-001 을 `→ hide` 로 다시 닫는다(C-001 도 함께 닫는다).

## Code Change Gate

새 입력이 들어온 뒤에는 코드 변경 전에 reconciliation 을 거쳐야 한다.

```txt
input result exists (input_id 보유)
→ reconcile input  (register pending → 문서 수정 → register reconciled)
→ workflow:state
→ workflow:readiness
→ code change within allowed_paths
→ workflow:validate
```

미처리 감지는 **input_id ↔ Reconciliation Register** 대조로 한다.

```txt
inputs/ 에 input_id 는 있는데
  - register 에 그 행이 없거나
  - Reconcile Status 가 in-progress(이전 실행 중단) / failed 면
→ 미처리(reconcile 미완). 이 상태에서의 코드 변경은 경고/차단 대상.

Reconcile Status=reconciled 면 자식 decision 이 open 이어도 "미처리"가 아니다.
그 open decision 의 차단은 readiness 다운그레이드가 이미 담당한다 (register 가 중복 차단하지 않는다).
```

초기에는 hard fail 이 아니라 LLM rule 과 skill 절차로 강제한다. 이후 hook/CI 단계에서 위 미처리 감지를 경고하거나 실패시킨다. (계약은 지금 고정, CI 강제는 후속 — Open Decisions 의 validate 처리와 같은 방식.)

## Skill Shape

후속 스킬 이름 예시:

```txt
reconcile-input
```

입력:

```txt
- input result path
- optional target screen/domain
```

절차(register-first):

```txt
1.  입력 결과물을 읽고 input_id 를 확인한다.
2.  Register 에 같은 input_id 가 `reconciled` 면 멈춘다 (이미 처리 — 멱등성). `in-progress` 면 새 행 없이 이어서 처리.
3.  Register 에 행을 먼저 쓴다 (Reconcile Status: `in-progress`).   ← 어떤 문서 수정보다 먼저.
4.  `affected_domains`/`affected_screens`(구 `suggested_scope`) 를 기준으로 관련 산출물을 연다.
5.  기존 confirmed/resolved 결정과 충돌 여부를 확인한다.
6.  classification 을 만든다 (입력 1개 → item N개 가능).
7.  자동 반영 가능한 simple-update 만 문서에 반영한다.
8.  decision/conflict 는 사용자에게 선택지를 제시한다.
      - resolved 결정과 충돌하면 Conflict 에 이전 값을 남기고 해당 decision 을 open 으로 재오픈한다.
      - Unknown 의 답을 제공하면 출처와 근거를 기존 Unknown 에 연결하되 Status 는 `open` 으로 둔다 (`resolved` 는 사람 전용).
      - 검증 없이는 결정 불가면 Investigation/Verification 을 만들고 막을 화면에 Open Decision 을 올린다 (Unknown 단독은 게이트 아님).
      - 카탈로그에 없는 공통 컴포넌트가 필요하면 Component Gap Register 에 `G-xxx` 를 `open` 으로 제안한다 (accept 는 사람).
9.  사용자 결정 후 문서를 업데이트한다.
10. Register 행을 `reconciled` 로 바꾸고 Result·Touched Artifacts·Created Items 를 채운다 (자식 decision 이 open 이어도 reconcile 은 끝).
11. workflow:state/readiness/validate 결과를 보고한다.
```

**register-first 가 핵심이다.** 문서부터 고치고 register 를 나중에 쓰면, 중간에 세션이 끊겼을 때 "처리 중이었음"을 알 수 없어 재실행이 같은 수정을 중복한다. pending 행을 먼저 남기면 중단돼도 미완 상태가 보인다.

금지:

```txt
- resolved 결정 재-resolve / 임의 변경      (재오픈=open 으로 올리기는 가능, 재-resolve 는 사람만)
- Unknown 을 `resolved` 로 닫기             (답/근거 연결은 가능, 닫기는 사람만)
- 이전 결정 값을 조용히 덮어쓰기
- Conflict 기록 없이 decision 만 바꾸기
- confirmed 문서 임의 강등/승격
- Gap 을 직접 accept 하거나 새 공통 컴포넌트를 직접 만들기   (제안=`open` 만, accept 는 사람)
- 충돌을 조용히 덮어쓰기
- Owner만 보고 사용자 판단 가능성을 배제하기
- 입력을 수정하려고 같은 input_id 를 덮어쓰기   (새 id + supersedes)
- reconciliation 전 코드 변경
```

## Relationship To Open Decisions

`Open Decisions`는 입력 작성 중 생긴 결정 대기 항목을 다룬다.

`Input Reconciliation`은 새 입력이 기존 세계와 맞는지 확인한다.

```txt
Open Decisions
= 아직 결정되지 않은 선택을 모드 게이트로 표현

Input Reconciliation
= 새 입력이 기존 문서/결정과 충돌하는지 검토하고 반영 경로를 결정
```

둘은 연결된다. Reconciliation 중 새 선택이 필요하면 `Open Decisions`에 행을 추가한다. 기존 resolved 결정과 충돌하면 `Conflicts`에 이전 값을 남기고 해당 `Open Decision`을 재오픈한다 — 게이트는 그 open decision 이 건다. 사용자 결정 후 `Open Decisions` 또는 관련 문서를 업데이트한다.

## MVP Placement

이 축은 기존 MVP 로드맵을 갈아엎지 않는다. `Input → Documents → State → Readiness → Work → Validate` 루프 앞에 관문을 하나 추가한다.

```txt
Input Skill
→ Input Reconciliation
→ Documents
→ State
→ Readiness
→ Work
→ Validate
```

MVP-A 에서 문서 설계·스킬 절차 초안·**Reconciliation Register 계약**(스키마 + register-first + `input_id` 불변·required + `Reconcile Status`/자식 상태 분리)을 고정한다.

후속(MVP-D 또는 이후) validate/hook 후보:

```txt
- 미처리 감지        input_id 는 있는데 register 행 없음 / Reconcile Status=in-progress·failed
- stale conflict     open conflict 가 가리키는(B=D-…) decision 이 resolved 면 실패
- 고위험 대칭 충돌   구현 형태를 가르는 충돌인데 대응 Open Decision 이 없음
- 닫힘 동기화        재오픈으로 생긴 conflict 가 그 decision 닫힐 때 함께 닫혔는지
```
