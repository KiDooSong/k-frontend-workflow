# Input Reconciliation

> Consumer reference for canonical input artifacts, the Reconciliation Register, retry semantics, and validate check 12. It covers how normalized inputs become workflow documentation. It does not define source-specific raw parsers.

> Workflow stages: this covers **Stage 03** (create canonical input artifact, [workflow-stages/03-create-canonical-input-artifact.md](workflow-stages/03-create-canonical-input-artifact.md)) and **Stage 04** (reconcile input, [workflow-stages/04-reconcile-input.md](workflow-stages/04-reconcile-input.md)) in the [workflow spine](workflow-spine.md).

외부 입력 스킬이 저장한 새 입력 결과물을 기존 frontend-workflow 문서와 맞춰보고, 단순 반영인지, 결정 필요인지, 충돌인지 분류하는 단계다.

이 문서는 입력을 "가져오는 방법"을 정의하지 않는다. Figma, 기획 문서, API 문서, 회의록, QA 메모 등은 프로젝트별 입력 스킬이 수집·해석한다. 킷은 두 가지 경계만 가진다.

- `workflow:create-input`: 이미 정규화된 입력 facts 를 canonical `docs/frontend-workflow/inputs/{input_id}.md` 로 쓰는 generic producer.
- `reconcile-input`: canonical 입력 artifact 를 기존 frontend-workflow 문서와 대조하는 reconciliation 단계.

즉 킷은 Figma raw format, 내부 폴더 구조, auth navigation map, 화면 id drift 같은 consumer-specific mapping 을 알지 않는다. 그런 추출·해석은 consumer repo 의 source-specific producer 가 맡고, 마지막에 normalized producer payload 또는 CLI flags 로 generic producer 를 호출한다.

```txt
source-specific producer
→ raw source 수집/해석
→ normalized producer payload
→ workflow:create-input
→ docs/frontend-workflow/inputs/{input_id}.md

reconcile-input
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

입력 스킬 또는 adapter 는 입력 원천별로 따로 존재할 수 있다.

```txt
figma-input skill
visual-spec-input skill
planning-doc-input skill
api-doc-input skill
meeting-note-input skill
qa-input skill
testid-input skill
policy-migration-input skill
user-note-input skill
```

이 스킬들은 원본을 가져오고, 요약하고, normalized payload 를 만든다. 우리 킷은 수집 방식과 raw format 해석에는 관여하지 않는다.

중요한 계약은 source-specific producer 가 마지막에 `workflow:create-input` 를 호출해 **입력 결과물 위치**와 **`input_id`** 를 남기는 것이다. 입력 생성은 acceptance, confirmed 승격, 구현 허가를 의미하지 않는다. reconciliation 은 반드시 별도 단계다.

### Generic Producer Boundary

`workflow:create-input` 는 canonical input artifact 를 만드는 scaffold/producer 이다. source-specific adapter 는 Figma/OpenAPI/회의록/내부 데이터 등을 프로젝트 맥락에 맞게 먼저 정규화하고, producer 는 그 결과를 파일로 렌더링한다.

```bash
node tools/frontend-workflow/scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --source figma \
  --input-type visual-spec \
  --source-type figma \
  --source-ref "figma://file/node" \
  --captured-by "consumer-figma-adapter" \
  --domain auth \
  --screen AUTH-001 \
  --title "Auth login visual spec" \
  --summary "Login visual facts from the design source." \
  --fact "Primary CTA is visible in the default state." \
  --target "AUTH-001 figma-component-mapping" \
  --expected "classification: simple-update"
```

Source-specific adapters should prefer structured mode:

```bash
node tools/frontend-workflow/scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --from-json input.json
```

또는 `--from-yaml input.yaml` 을 사용할 수 있다. Producer 는 `input_id` 를 `IN-{YYYYMMDD}-{source}-{NNN}` 로 생성하고, 같은 id 파일 덮어쓰기를 기본으로 거부한다. 내용이 바뀌면 새 입력을 만들고 `supersedes` 로 이전 `input_id` 를 연결한다.

### Source-Specific Producers And Screen Identity

source-specific producer(Figma/planning adapter)는 자기 source 의 화면 코드를 들고 온다. 그 코드는 **alias 이지 canonical Screen ID 가 아니다**(계약: [screen-identity.md](screen-identity.md)). producer 는:

- 가능하면 `screen-source-map.md` 를 참조해 planning/design/source 코드를 canonical `affected_screens` 로 매핑한다.
- 매핑이 ambiguous 면 canonical id 를 **추측해 채우지 않는다.** source 코드를 `## Extracted Facts` 에 남기고 `expected_reconciliation` 에 `classification: scope-unclear` 를 적는다.
- `AUTH-*` 같은 canonical Screen ID 를 **발명하지 않는다.**
- source alias 를 payload 에 실어 보낸다: planning ids, design ids, node ids, route hints, source raw refs.

canonical frontmatter 는 안정적으로 유지한다 — source alias 는 frontmatter 를 키우지 않고 body 로 보낸다. `workflow:create-input` 은 optional `source_screen_refs` 를 받아 `## Source Screen Refs` 섹션으로 렌더한다(없으면 섹션도 없다 — byte-stable). frontmatter 는 그대로다.

```json
{
  "source_screen_refs": [
    { "source": "planning-figma", "source_id": "A-001", "route_hint": "/signup/email", "node_id": null, "confidence": "candidate" },
    { "source": "design-figma",   "source_id": "J010", "node_id": "1:234", "confidence": "candidate" }
  ]
}
```

이 source ref 들은 reconcile-input 이 Screen Source Map 으로 canonical 화면을 확정할 때 쓰는 evidence 다. canonical frontmatter 확장이 과하면 그냥 `## Extracted Facts` 에 같은 내용을 적어도 된다.

생성 후 흐름:

```txt
workflow:create-input
→ workflow:validate
→ reconcile-input
→ workflow:state / workflow:readiness / workflow:validate
```

## Input Result Contract

입력 결과물의 frontmatter 는 다음 **canonical schema** 를 따른다. 정본의 단일 출처는 [templates/input/input-artifact.template.md](../../templates/input/input-artifact.template.md) 이고, 아래 표가 그 계약이다. kit repository fixtures may include examples, but packed consumer payloads do not include examples/.

```md
---
# --- required ---
input_id: "IN-20260613-figma-001"            # 전역 유일·불변. 멱등성·역추적·supersede·미처리 감지의 키
input_type: "figma"                          # normalized category: planning | figma | visual-spec | api | meeting | qa | testid | architecture | policy-migration | user-note
source_type: "figma"                         # concrete source adapter/type: planning-doc | figma | visual-spec | api-doc | meeting | qa | qa-automation | testid | architecture | policy-migration | user-note
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
| `input_type` | **required** | normalized category(사람이 읽는 분류 라벨): `planning`/`figma`/`visual-spec`/`api`/`meeting`/`qa`/`testid`/`architecture`/`policy-migration`/`user-note` |
| `source_type` | **required** | concrete source adapter/type: `planning-doc`/`figma`/`visual-spec`/`api-doc`/`meeting`/`qa`/`qa-automation`/`testid`/`architecture`/`policy-migration`/`user-note` |
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

## Bootstrap Behavior

`docs/frontend-workflow/_meta/reconciliation-register.md` 가 없으면 validate check 12 는 NO-OP 이다. 이 동작은 cold start 와 점진 adoption 을 위한 의도된 기본값이다. register 를 만들기 전에도 check 11 은 `inputs/*.md` frontmatter 를 검증하지만, input↔register reconciliation coverage 는 확인하지 않는다.

팀이 input/reconcile flow 를 쓰기 시작하면 `templates/meta/reconciliation-register.template.md` 의 8컬럼 스키마로 register 를 만든다. register 가 도입된 뒤부터 check 12 는 구조와 상태를 검사한다.

## Reconciliation Flow

새 입력이 들어오면 코드 변경 전에 다음 흐름을 탄다. **register 를 문서 수정보다 먼저 쓰는 것**이 핵심이다(아래 register-first 참고).

```txt
1.  입력 결과물 경로와 input_id 를 받는다.
2.  Register 에 같은 input_id 행이 있으면 상태별로 처리한다.
      - `reconciled`: 멈춘다. 같은 입력은 이미 처리됐다. 다시 처리하려면 새 input_id + supersedes 를 만든다.
      - `in-progress`: 새 행을 추가하지 말고 그 행을 이어서 처리한다.
      - `failed`: 새 행을 만들지 않는다. 기존 행을 재사용하고 retry 중에는 `in-progress` 로 두며, 이전 실패 사유는 Result 에 보존하거나 retry note 로 이어 붙인다.
      - `not-started`: 기존 행을 재사용하고 `in-progress` 로 이동한다.
      - enum 위반, duplicate row, required column 누락: 먼저 register 구조를 고친다.
3.  행이 없으면 Register 에 행을 먼저 쓴다 (Reconcile Status: `in-progress`).   ← 어떤 문서 수정보다 먼저.
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
      Tier3/layout/policy-migration 입력을 다뤘다면 `npm run workflow:policy-draft -- --out <review-output-dir>`처럼
      review-only 출력 디렉터리를 명시해 policy-draft 생성 결과를 보고한다. 이 출력은 live policy 교체가 아니다.
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
figma-component-mapping
visual spec sections
testID / QA automation intake notes
project-layout / `layers:` declarations
layer-inventory
readiness output
implementation-mode-policy.draft.yaml
implementation-mode-policy.migration.md
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
| investigation-needed | 검증·실험·플랫폼 확인 없이는 결정 불가 | Register `Created Items` 에 `INV-`/`VER-` 포인터를 남기고, 필요한 증거·owner·검증 방법을 대상 ScreenSpec note 또는 review output에 적는다. 구현을 막아야 하면 별도 Open Decision 을 올린다. investigation/verification 자체와 Unknown 단독은 게이트가 아니며, green/failed evidence 만으로 confirmed 승격이나 decision resolve 를 하지 않는다. |
| conflict | 기존 입력/문서와 충돌 | `Conflicts`에 기록(resolved 결정과 충돌이면 decision 재오픈) |
| scope-unclear | 영향 범위가 불명확 | 막아야 하면 `Open Decisions`(게이트), 단순 확인이면 `Unknowns`(fact-finding)로 남김 |
| reject-input | 새 입력을 반영하지 않기로 함 | Register `Result` 에 사유 기록, 문서는 유지 |

입력 하나가 위 분류 중 **여러 개**를 동시에 만들 수 있다(예: simple-update 3 + conflict 1 + new-decision 1). 각각은 별도 item 으로 처리하고, Reconciliation Register 한 행에 `Classification` 목록과 `Created Items` 로 묶는다.

### 입력이 제공한 문구 (Copy Keys)

입력(기획·figma 등)이 탭 라벨·버튼·안내 문구 같은 **카피를 직접 제공**하면(주로 `simple-update`·`resolves-decision`), LLM 은 그 값을 해당 ScreenSpec 의 `Copy Keys` 에 **`draft`** 로 적는다 — 값은 채우되 미확정 상태다. `confirmed` 승격은 사람만 한다(보통 그 문구를 가르는 Open Decision 을 닫을 때 함께). 이는 "게이트는 올리기만, 닫기·승격은 사람" 불변식의 Copy Keys 판이다.

```txt
입력이 문구 제공  → Copy Keys 에 draft (LLM)        값 있음 · 미확정
문구 자체가 미정  → Copy Keys 에 tbd  (값 "TBD")     copy_keys_has_tbd 집계 대상
사람이 승인       → draft → confirmed (사람 전용)    LLM 승격 금지
```

예: `IN-planning-001` 이 상태 탭 라벨(사용 가능/사용 완료/만료)을 제공하지만 탭의 존재가 `D-001`(open)에 달려 있으면, 라벨 Copy Keys 는 `draft` 로 둔다. 사람이 `D-001` 을 separate-tab 으로 닫으며 `confirmed` 로 승격한다. (3-state 정의의 단일 출처는 `templates/screen/screen-spec.template.md` 의 Copy Keys 주석.)

### figma·디자인 입력의 두 산출 축

figma·디자인 입력은 **시각 매핑**과 **컴포넌트 갭**이라는 두 축을 만든다 — 섞지 않는다.

```txt
시각 매핑(프레임/노드 → UI 요소 → 컴포넌트)  → 화면 폴더의 figma-component-mapping.md 에 simple-update (LLM)
카탈로그에 없는 공통 컴포넌트                  → component-gap 으로 분리, G-xxx 를 open 으로 제안만 (accept 는 사람)
비즈니스 동작(분류·정렬·노출·탭 소속)          → 적지 않는다. ScreenSpec 단일 출처
```

시각 매핑은 `domains/{domain}/screens/{screen}/figma-component-mapping.md`(템플릿: [templates/screen/figma-component-mapping.template.md](../../templates/screen/figma-component-mapping.template.md))에 기록한다 — 산출물 형태를 바꾸지 않는 시각 갱신이라 `simple-update` 다. 프레임 ref 는 frontmatter `sources` 와 본문 Frame 절에 두고 비표준 `figma_frame_ref` 필드는 쓰지 않는다. 어떤 요소의 **존재**가 open decision 에 달려 있으면(예: 탭 분리가 `D-001`) 그 매핑이 후보 시각안임을 비고에 명시한다. `status` 는 readiness 의 `figma_mapping_status` fact 로 쓰여 `final-fixture-ui` 게이트(`figma_mapping_status >= draft`)를 가른다.

### Visual/Figma 입력 — visual spec 과 behavior 분리

visual/Figma 입력은 **시각 증거**다. behavior 의 단일 출처를 바꾸려면 별도 ScreenSpec/Decision 경로를 탄다.

| 입력 사실 | 업데이트 위치 | 주의 |
|---|---|---|
| frame, node, component mapping | `figma-component-mapping.md` 의 Frame / Component Mapping | ScreenSpec 에 동작을 추가하지 않는다 |
| color/spacing/type/radius 같은 visual value | `figma-component-mapping.md` 의 Visual Spec + Provenance | tokenized/source-backed 값은 token/provenance, raw/inferred 값은 gap/open 으로 기록 |
| baseline/facts/assets pointer | `figma-component-mapping.md` Assets / Provenance | private run artifact 는 public kit 에 복사하지 않고 ref 만 남긴다 |
| component catalog 에 없는 shared component | Component Gap Register `G-xxx open` | component-gap 제안만. accept/구현 금지 |
| state/interaction/routing/filtering/sorting/tab semantics/API behavior | ScreenSpec / Navigation Map / Open Decision | Figma 가 암시하더라도 behavior 로 확정하지 않는다 |
| resolved/confirmed behavior 와 충돌 | Conflicts + Open Decision 재오픈/생성 | 조용히 덮어쓰기 금지 |
| 순수 visual detail 충돌 | Data Corrections / Override Log, 필요 시 INV-/VER- | behavior edit 로 승격하지 않는다 |

`figma_mapping_status` 는 mapping artifact 의 존재/라이프사이클 fact 이며 `final-fixture-ui` 의 artifact-existence gate 에 쓰인다.
pixel fidelity, token completeness, visual regression green 을 의미하지 않으며, 그 증명은 별도 Verification evidence 로 다룬다.

### testID / QA automation 입력

testID/selector 입력은 구현을 돕는 evidence 다. reconcile-input 은 코드를 고치거나 test harness 를 만들지 않는다.

| 입력 사실 | 업데이트 위치 | 주의 |
|---|---|---|
| selector/testID naming proposal | testID intake note 가 있으면 그 note, 없으면 ScreenSpec Accessibility 의 draft/recommended note | naming confirmed 승격 금지 |
| selector 가 화면 의미/구조를 바꿈 | ScreenSpec simple-update 또는 Open Decision | UI 구조가 unresolved 면 Open Decision/Verification 생성 |
| E2E 실패/드리프트 evidence | Investigation/Verification 또는 Open Decision | green/failed 결과만으로 confirmed/resolve 하지 않는다 |
| harness/CI 제안 | Reconciliation Register Result 또는 Open Decision | production tests, CI, hard gate 를 직접 만들지 않는다 |

Acceptance Criteria 의 "테스트 파일/ID" 칸과 testID anchor 는 다른 개념이다. anchor 는 Accessibility/selector 계약에 두고,
Acceptance Criteria 는 검증 시나리오나 테스트 핸들을 적는다.
프로젝트에 Verification register 가 아직 없으면 `VER-xxx` 는 대상 산출물의 note(예: ScreenSpec Accessibility)와
Reconciliation Register `Created Items` 에 함께 남긴다. `Created Items` 는 링크/포인터일 뿐이고 open/closed 의 단일 출처는
나중에 도입될 Verification register 또는 해당 note 다.

### Tier3 layout / readiness / policy-draft migration 입력

Tier3 입력은 layout/profile/access boundary 를 다루므로 live policy promotion 과 엄격히 분리한다.

| 입력 사실 | 대조 대상 | reconcile 처리 |
|---|---|---|
| 새 layer/role glob/fact/access boundary | `project-layout.yaml`, `layers:` declarations, layer inventory | draft/review artifact 갱신 또는 Open Decision |
| readiness allowed/forbidden path 변화 | readiness output, layer-inventory | `readiness access wired` 로 보고. hard gate 승격으로 쓰지 않는다 |
| policy draft output | `implementation-mode-policy.draft.yaml` | review-only. live policy replacement 아님 |
| migration guide output | `implementation-mode-policy.migration.md` | live vs draft 차이와 human review notes 기록 |
| live policy 또는 resolved architecture decision 과 충돌 | Conflicts + Open Decision | 기존 live policy 를 조용히 덮어쓰지 않는다 |

이 표면의 금지선:

```txt
policies/implementation-mode-policy.yaml replacement ✗
CI / required check / --enforce promotion ✗
pre-edit hook enforcement ✗
confirmed status promotion ✗
Open Decision auto-resolve ✗
```

보고서·register 에는 다음 네 상태를 분리해 적는다.

```txt
readiness access wired
policy draft generated
live policy not replaced
hard gate / CI not promoted
```

### Reconcile-input review rubric

reconcile-input 결과를 리뷰할 때는 아래 항목을 통과 기준으로 본다.

| 항목 | Pass 기준 |
|---|---|
| register-first | 대상 문서 수정 전에 Reconciliation Register 행이 생성/재개됐고 최종 `Reconcile Status` 는 reconciliation 행위만 표현한다 |
| artifact routing | input kind 에 맞는 산출물로 갔다. visual은 figma mapping, behavior는 ScreenSpec, selector는 intake/Accessibility, Tier3 access는 draft/review artifact |
| visual vs behavior | Figma 값이 행동 정본을 조용히 덮어쓰지 않았다. token/provenance 또는 visual gap/open 이 기록됐다 |
| gate raising only | Open Decision 추가/재오픈, Conflict, Unknown, Gap, INV/VER 생성까지만 했다. resolve/close/confirmed/gap accept 는 없다 |
| no code/generated edits | production code, tests, generated files 를 직접 수정하지 않았다 |
| no live promotion | live implementation policy replacement, CI/hard gate promotion, pre-edit hook enforcement 가 없다 |
| idempotency | 같은 `input_id` 재실행 시 register 의 `reconciled` 행으로 멈출 수 있다. 내용 변경은 새 id + `supersedes` 다 |

## Screen Identity And New Screens

입력이 **존재하지 않는 화면**을 가리키거나 source 코드(planning `A-001`·design `J010`·Figma node id)를 들고 오면, reconcile-input 은 canonical Screen ID 를 발명하지 않고 **Screen Source Map**(`_meta/screen-source-map.md`)으로 푼다. canonical identity(`screen_id`/`route`/ScreenSpec 경로)는 워크플로우가 소유하고, source 코드는 alias/evidence 일 뿐이다. 전체 계약·예시: [screen-identity.md](screen-identity.md).

| 상황 | 처리 |
|---|---|
| source 코드가 `confirmed` canonical 로 매핑돼 있고 ScreenSpec 도 존재 | 그 `screen_id` 로 평소처럼 reconcile |
| `confirmed` canonical 인데 ScreenSpec 이 없음 | 내용 반영 전에 `workflow:create-screen` 으로 stub 을 만든 뒤 reconcile |
| 매핑이 `ambiguous` (같은 코드가 여러 화면, 근거 부족) | canonical id 를 만들지 않는다. `scope-unclear` 로 분류하고 구현이 막히면 Open Decision. 적절하면 Screen Source Map 에 `candidate`/`ambiguous` 행 |
| 입력이 분명히 새 화면을 도입하지만 canonical id 없음 | Screen Source Map 에 `candidate` 행을 만들고 사람에게 canonical `screen_id`/`route` 확인을 받은 뒤 `workflow:create-screen` |

```txt
reconcile-input 은:
- 기존 문서를 갱신하고 decision/gap/unknown 을 만들/재오픈할 수 있다.
- 하지만 canonical 화면 identity 를 발명하지 않는다.
identity 생성은: (1) 사람-확인, 또는 (2) workflow:create-screen(주어진 canonical id) 뿐이다.
workflow:create-screen 은 stub 만 만든다 — navigation-map 자동 수정·Open Decision resolve·confirmed 승격 없음.
```

doctor 는 Screen Source Map 일관성을 warning-first 로만 표면화한다(canonical 에 ScreenSpec 부재, route 불일치, split/ambiguous 없는 중복 alias, input `affected_screens` 의 raw alias). hard gate 가 아니며 cold-start 를 막지 않는다.

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
register 파일이 없으면 check 12 는 NO-OP 이다. register 가 있으면 inputs/ 의 input_id 와 register 행을 대조한다.

- register 행 없음: 미처리. 기본 경고, `--enforce` 에서 에러.
- `Reconcile Status=not-started`: 미시작. 기본 경고, `--enforce` 에서 에러.
- `Reconcile Status=in-progress`: 이전 실행 중단. 항상 에러.
- `Reconcile Status=failed`: reconcile 실패. 항상 에러.
- invalid enum / duplicate Input ID / required column 누락: 항상 에러.

Reconcile Status=reconciled 면 자식 decision 이 open 이어도 "미처리"가 아니다.
그 open decision 의 차단은 readiness 다운그레이드가 이미 담당한다 (register 가 중복 차단하지 않는다).
```

validate check 12 는 mixed severity 다. register 파일이 없으면 의도적으로 NO-OP 이고, register 가 있으면 row 없음과 `Reconcile Status=not-started` 만 기본 경고이며 `--enforce` 에서 에러가 된다. `in-progress`, `failed`, invalid enum, duplicate Input ID, missing required columns 는 항상 에러다. 입력 결과물 frontmatter 는 check 11 이 검사한다.

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
2.  Register 에 같은 input_id 행이 있는지 확인한다. `reconciled` 는 멈추고, `in-progress` 는 이어서 처리하고, `failed` 는 같은 행을 `in-progress` 로 재개하며 실패 사유를 Result 에 보존하고, `not-started` 는 같은 행을 `in-progress` 로 이동한다. enum/중복/컬럼 오류는 먼저 register 구조를 고친다.
3.  행이 없을 때만 Register 에 새 행을 먼저 쓴다 (Reconcile Status: `in-progress`).   ← 어떤 문서 수정보다 먼저.
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
      layout/policy migration 입력이면 `npm run workflow:policy-draft -- --out <review-output-dir>`처럼
      review-only 출력 디렉터리를 명시해 policy-draft 생성 결과도 보고한다.
```

**register-first 가 핵심이다.** 문서부터 고치고 register 를 나중에 쓰면, 중간에 세션이 끊겼을 때 "처리 중이었음"을 알 수 없어 재실행이 같은 수정을 중복한다. pending 행을 먼저 남기면 중단돼도 미완 상태가 보인다.

금지:

```txt
- resolved 결정 재-resolve / 임의 변경      (재오픈=open 으로 올리기는 가능, 재-resolve 는 사람만)
- Unknown 을 `resolved` 로 닫기             (답/근거 연결은 가능, 닫기는 사람만)
- 이전 결정 값을 조용히 덮어쓰기
- Conflict 기록 없이 decision 만 바꾸기
- confirmed 문서 임의 강등/승격
- 입력이 제공한 문구를 Copy Keys 에 confirmed 로 올리기   (draft 로 두고 confirmed 승격은 사람)
- Gap 을 직접 accept 하거나 새 공통 컴포넌트를 직접 만들기   (제안=`open` 만, accept 는 사람)
- 충돌을 조용히 덮어쓰기
- Owner만 보고 사용자 판단 가능성을 배제하기
- 입력을 수정하려고 같은 input_id 를 덮어쓰기   (새 id + supersedes)
- reconciliation 전 코드 변경
- production code / tests / generated files 직접 수정
- live `policies/implementation-mode-policy.yaml` 교체
- CI / hard gate / pre-edit hook enforcement 승격
```

최종 검증:

```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
# Tier3/layout/policy-migration 입력을 다룬 경우에만:
npm run workflow:policy-draft -- --out <review-output-dir>
```

`<review-output-dir>` 는 `docs/frontend-workflow/_meta/policy-drafts/...` 같은 리뷰용 디렉터리다. 이 명령은 draft/migration 산출물을
리뷰용으로 만들 뿐, live `policies/implementation-mode-policy.yaml` 을 교체하지 않는다.

fixture/dogfood 자체를 갱신하는 PR 에서는 adoption-probe 를 추가로 돌릴 수 있다. 일반 사용자 reconcile run 에서
adoption-probe 는 필수 명령이 아니다.

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

## Consumer Summary

```txt
source-specific producer
→ normalized payload
→ workflow:create-input
→ docs/frontend-workflow/inputs/{input_id}.md
→ reconcile-input
→ workflow:state / workflow:readiness / workflow:validate
→ implementation within readiness allowed_paths
```

Keep one canonical register row per input_id. Retry updates that row; changed input content or a new source snapshot gets a new input_id with supersedes.
