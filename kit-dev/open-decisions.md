# Open Decisions

> v2 (2026-06-13). v1 은 [archive/open-decisions-v1.md](../archive/open-decisions-v1.md).
> 코덱스 리뷰 반영: 후속 기능(decision-log·deferred·Reversible·교차화면)을 MVP-A 본문에서 분리하고,
> **게이트를 푸는 전이는 사람-전용**이라는 불변식을 추가했다.

입력 작성 중 생기는 애매함을 `Unknowns` 에 모두 몰아넣지 않고, 구현 착수 여부를 막을 수 있는 의사결정 항목을 별도로 분리한다.

이 문서는 MVP 단계와 독립적으로 적용할 수 있는 판단 정확도 개선안이다. 목적은 다른 세션이나 다른 LLM 이 같은 파일만 보고도 "어디까지 착수 가능한가"를 더 선명하게 판단하게 만드는 것이다.

## 설계 근거

이 분리는 새 발명이 아니라 검증된 세 패턴을 프론트 워크플로우에 맞춘 것이다. 새 규칙을 추가할 때 이 근거를 기준으로 판단한다.

```txt
RAID 로그        Risks / Assumptions / Issues / Decisions / Dependencies 를 분리해 추적한다.
                 → 본 킷의 Unknowns / Assumptions / Conflicts / Open Decisions / (Dependencies) 가 여기에 대응.

ADR              결정은 append-only 로 남기고 STATUS 만 진화시킨다. 번복은 supersede 로 잇는다.
(결정 기록)       → resolved 결과를 전역 decision-log 에 불변 기록으로 남기는 근거 (후속).

Spec Kit         LLM 이 추측하지 않게 "[NEEDS CLARIFICATION]" 마커를 강제하고,
[NEEDS           "마커 0개" 를 다음 단계 진입 게이트로 쓴다.
 CLARIFICATION]  → 본 킷의 저작 규칙(추측 금지·행 추가·모드에서 멈춤)과 경로 backstop 의 근거.
```

## 문제

현재 ScreenSpec 입력 과정에서는 애매한 항목을 `Unknowns` 에 남긴다. 이 방식은 간단하지만 다음 문제가 있다.

- 사실 확인이 필요한 질문과 사람이 결정해야 하는 질문이 섞인다.
- 어떤 질문이 구현 착수를 막는지 알기 어렵다.
- `rough-fixture-ui`, `final-fixture-ui`, `api-integrated-ui` 중 어느 단계부터 막히는지 판단하기 어렵다.
- 다른 세션이 문서를 이어받을 때 "모르는 것이 있다"는 사실은 알 수 있지만, "지금 구현해도 되는가"는 다시 해석해야 한다.
- **LLM 이 애매함을 임의로 메우고 진행해도 그것을 잡는 장치가 없다.** (가장 핵심 실패 모드)

따라서 `Unknowns` 의 역할을 좁히고, 착수 판단에 영향을 주는 항목은 `Open Decisions` 로 분리한다.

## 개념 구분

```txt
Unknowns
= 아직 모르는 사실. 조사하거나 출처를 찾아 확인해야 하는 정보.

Open Decisions
= 사람이나 팀이 선택해야 하는 결정. 특정 구현 모드 진입을 막을 수 있음.

Assumptions (후속)
= 임시로 둔 가정. 추후 검증되거나 Open Decision 으로 승격될 수 있음.

Conflicts (골격 존재)
= 입력끼리 충돌하는 내용. 해결 전에는 관련 단계 진입을 막을 수 있음.

Dependencies (후속)
= 외부 산출물(BE 엔드포인트, 디자인 확정 등)에 막힌 항목. Unknown 도 Decision 도 아님.
```

MVP-A 에서는 `Unknowns` 와 `Open Decisions` 만 도입한다. `Assumptions`·`Dependencies` 는 후속, `Conflicts` 는 [conflicts.template.md](../frontend-workflow-kit/templates/global/conflicts.template.md) 로 이미 골격이 있다.

## 라이프사이클 — 결정당 canonical 행 한 곳

화면 하나에만 속한 결정은 해당 ScreenSpec 의 `Open Decisions` 표에 산다. 여러 화면이
같은 결정을 공유하면 optional `open-decision-register`
(`docs/frontend-workflow/global/open-decisions.md`)에 canonical 행 하나를 두고 각 ScreenSpec 이
`decision_refs`로 참조한다. 상세 consumer 계약은
[`docs/reference/open-decisions.md`](../frontend-workflow-kit/docs/reference/open-decisions.md)가 정본이다.
상태는 두 위치 모두 `open → resolved` 두 가지뿐이다.

```txt
open              LLM 또는 사람이 추가. 자기 Blocking Mode 이상 진입을 막는다.
resolved          사람이 닫는다. 표에 남기고 선택한 값을 Options 에 표시한다(이동하지 않음).
resolved → open   재오픈. 새 입력이 resolved 결정과 충돌하면 LLM 이 해당 decision 을 open 으로
                  되올릴 수 있다(게이트를 올리는 보수적 방향). 이전 값은 Conflicts 에 보존한다.
                  다시 resolved 로 닫는 것은 사람만 한다. (상세: input-reconciliation.md)
```

게이트 무결성을 위한 핵심 불변식:

```txt
게이트를 푸는 상태 전이(open → resolved)는 사람만 한다.
LLM 은 blocker 를 "올리는" 것(open 행 추가, resolved → open 재오픈)만 가능하고, 절대 "내리지" 못한다.
```

이는 README 불변식 6("confirmed 승격은 사람만")과 같은 계열이다. `Reversible` 기반의 `deferred` 우회 경로, 전역 `decision-log` 이관, `superseded` 체인은 **후속**이다. canonical 교차-화면 참조는 #193에서 기존 결정 축 안의 additive 계약으로 구현됐으며, 게이트를 내리는 새 전이는 추가하지 않는다.

## ScreenSpec 섹션

ScreenSpec 본문에 다음 섹션을 추가한다.

```md
## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
| D-002 | 쿠폰 목록 정렬 기준은 무엇인가? | expiry_date / created_at / manual_priority | final-fixture-ui | PM | open |
| D-003 | 쿠폰 목록 페이지네이션 방식은? | cursor / offset / none | api-integrated-ui | BE | open |
```

resolved 된 행은 선택값을 표시한다(예: `Options` 를 `→ hide` 로). `Decision Result`·`Decision Ref` 전용 컬럼은 후속.

### 필드

| Field | Required | Description |
|---|---:|---|
| ID | yes | **프로젝트 전역** 유일한 결정 ID. 결정당 canonical 행 1개. 예: `D-001` |
| Decision Needed | yes | 결정해야 하는 질문 |
| Options | no | 현재 알려진 선택지. 없으면 `TBD`. resolved 면 선택값을 표시 |
| Blocking Mode | yes | 이 결정이 열려 있을 때 막는 최소 모드 |
| Owner | no | 결정 책임자. 예: `PM`, `Design`, `BE`, `FE` |
| Status | yes | `open`, `resolved` 중 하나 (`deferred` 는 후속). resolved 는 재오픈으로 open 으로 되돌아갈 수 있다(재-resolve 는 사람만) |

`Blocking Mode` 는 `implementation-mode-policy.yaml` 에 정의된 모드 이름이어야 한다(정책 파일이 단일 출처).

```txt
docs-only
route-skeleton
screen-skeleton
rough-fixture-ui
final-fixture-ui
api-integrated-ui
production-ready
```

`ID` 는 local/global 전체에서 결정당 canonical 행 **1개**만 존재한다. 교차-화면 결정은
global register 행 하나 + 각 ScreenSpec의 `decision_refs`로 표현하며 다른 ScreenSpec의 local
행을 직접 참조할 수 없다.

## 판단 규칙

`Open Decisions` 는 낮은 모드의 작업을 불필요하게 막지 않아야 한다. 결정 항목은 자기 `Blocking Mode` 이상으로 진입하려 할 때만 blocker 가 된다.

예를 들어 다음 결정이 열려 있다고 하자.

```md
| D-001 | 만료 쿠폰 노출 여부 | show / hide | final-fixture-ui | PM | open |
```

이 경우:

```txt
rough-fixture-ui: 가능
final-fixture-ui: 불가
api-integrated-ui: 불가
production-ready: 불가
```

즉, fixture 기반 거친 화면은 만들 수 있지만, 최종 UI 로 승격하기 전에는 결정이 필요하다.

## 저작 규칙 (LLM 행동)

이 표는 LLM 이 **스스로 채우지 않으면** 의미가 없다. 데이터 구조만 있고 행동 규칙이 없으면 LLM 은 그냥 추측하고 진행한다. 따라서 [llm-rules.template.md](../frontend-workflow-kit/templates/global/llm-rules.template.md) 에 다음을 명시한다(Spec Kit 의 "추측 금지" 와 동일 원리).

```txt
입력만으로 해소되지 않고 산출물의 형태를 바꾸는 선택을 만나면:
  1. 임의로 고르지 않는다.
  2. Open Decisions 표에 open 행을 추가한다 (Blocking Mode 를 보수적으로 — 애매하면 한 단계 낮게).
  3. 그 화면을 해당 Blocking Mode 미만까지만 구현하고 멈춘다.

resolved 로 닫는 것은 사람만 한다. LLM 은 blocker 를 올리기만 한다 — open 행 추가, 그리고 새 입력이 기존 resolved 결정과 충돌하면 그 결정을 resolved → open 으로 재오픈(이전 값은 Conflicts 에 보존). 어떤 행도 스스로 resolved 로 바꾸지 않는다(재-resolve 는 사람만).
```

## Readiness 통합

`workflow-state.mjs` 는 ScreenSpec 의 local 표와 optional global register를 같은 parser로 읽고,
`decision_refs`를 해소해 화면별 파생값에 추가한다. referenced row는 canonical `source`를 보존하고,
open이면 기존 `blocking_decisions`에 합쳐져 같은 decision cap을 사용한다. resolved reference는
`derived.decision_refs`에 남지만 blocker가 아니다.
단, `Open Decisions`·`Unknowns` 같은 막힘 레지스터 섹션은 **stub/authored 판정에서 제외**한다 — 결정만 남긴 화면은 본문을 쓴 게 아니므로 여전히 stub 이다(`spec.mjs` 의 `isStub`). 새 규칙이 "결정을 일찍 남기라"고 권하므로 이 제외가 없으면 결정만 있는 화면이 authored 로 오판된다.

예상 출력:

```yaml
screens:
  COUPON-001:
    derived:
      open_decisions_count: 3
      blocking_decisions:
        - id: D-001
          decision_needed: 만료 쿠폰을 목록에 노출할 것인가?
          blocking_mode: final-fixture-ui
          owner: PM
        - id: D-002
          decision_needed: 쿠폰 목록 정렬 기준은 무엇인가?
          blocking_mode: final-fixture-ui
          owner: PM
        - id: D-003
          decision_needed: 쿠폰 목록 페이지네이션 방식은?
          blocking_mode: api-integrated-ui
          owner: BE
```

`readiness.mjs` 는 두 값을 분리해 계산하고, **반드시 둘의 하한을 택한다**(이게 다운그레이드 불변식이다).

- `fact_mode` = 화면의 사실(status·figma_mapping_status·api_confidence·matrices·fake_hook_exists)이 만족하는 **최고 모드**. open decision 을 **무시**하고 계산한다.
- `decision_cap` = 열려 있는 open decision 의 가장 낮은 `Blocking Mode` **바로 아래** 모드. open decision 이 없으면 상한 없음.

```txt
readiness_mode = min(fact_mode, decision_cap)
```

즉 사실상 final-fixture-ui 가 가능해도(fact_mode) open decision 이 final-fixture-ui 를 막으면 readiness_mode 는 rough-fixture-ui 로 **내려간다** — "ready for final + blocker 동시 표기" 같은 모순이 생기지 않는다. 그 뒤 다음 모드 이상을 막는 decision 을 `blocking` 과 `next_actions` 에 포함한다.

**malformed Open Decision 은 fail-closed 다.** 다음은 모두 **조용히 무시하지 않고** surface 해 readiness 가 `invalid_open_decision` blocker 로 표시하고 화면을 **`docs-only` 로 고정**한다: ① `Blocking Mode` 가 정책에 없는 값(오타, 예: `final_fixture_ui`), ② `ID`/`Status` 누락 또는 `open|resolved` 아닌 Status, ③ `Blocking Mode = docs-only`(floor 는 막을 수 없음·무의미), ④ `## Open Decisions` 섹션에 실질 내용이 있는데 파싱 가능한 표가 없음(불릿·문장으로 작성, separator 불량 등 — 단 빈 섹션이나 `없음` 명시는 예외). validate 형식검사가 후속이라 live gate 인 readiness 가 보수적으로 막는 것 — 이게 없으면 오타 한 글자나 깨진 표로 게이트 전체가 풀리는 fail-open 이 된다.

예상 출력:

```yaml
# npm run workflow:readiness --screen COUPON-001 실제 출력 (golden example)
COUPON-001:
  readiness_mode: rough-fixture-ui
  next_mode: final-fixture-ui
  blocking:
    - open_decision:
        id: D-001
        blocking_mode: final-fixture-ui
        owner: PM
    - open_decision:
        id: D-002
        blocking_mode: final-fixture-ui
        owner: PM
    - open_decision:
        id: D-003
        blocking_mode: api-integrated-ui
        owner: BE
    - figma_mapping: missing
    - api_confidence: candidate
  next_actions:
    - "resolve decision D-001: 만료 쿠폰을 목록에 노출할 것인가?"
    - "resolve decision D-002: 쿠폰 목록 정렬 기준은 무엇인가?"
    - "resolve decision D-003: 쿠폰 목록 페이지네이션 방식은?"
    - create figma-component-mapping (status >= draft)
    - confirm API (resolve 1 open unknown(s))
```

## Validate 통합

> **구현 상태**: 실제 게이트는 위 Readiness 다운그레이드가 담당한다(✅). **형식 검사는 `validate.mjs` 검사 9 로 구현됨(✅)**. **경로 backstop 은 diff 기반 후속** — 트리 스캔은 공유 `src/api` 같은 전역 forbidden 경로에 오탐(골든 예제에서 즉시 false-positive)이라 CI diff 와 결합해 도입한다.

`validate.mjs` 형식 검사 (✅ 검사 9 구현):

- `Open Decisions` 표가 있으면(섹션에 내용이 있는데 표가 아니면 실패) 필수 컬럼을 확인한다.
- `Status` 는 `open`, `resolved` 중 하나여야 한다.
- `Blocking Mode` 는 정책 파일에 존재하는 모드여야 한다(open 행은 docs-only floor 위여야 함).
- `ID` 는 **프로젝트 전역**에서 중복되면 안 된다 (ScreenSpec local + global register 집계).
- `decision_refs`는 unique non-empty string 배열이고 global register 행 하나로 exact 해소돼야 한다.
- `Status=resolved` 인 항목은 `Options` 에 선택값을 표시한다(예: `→ hide`). validate 는 **약하게** 시작 — `Options` 가 **비어 있을 때만 경고**(exit 무영향)하고, "선택값인지"의 엄밀 검사는 후속 `Decision Result` 컬럼으로 한다.

경로 backstop (hook 없는 환경용 — 1차 방어는 다운그레이드):

`readiness_mode = min(fact_mode, decision_cap)` 다운그레이드가 forward 방향의 1차 방어다. validate 는 그 위에서 "cap 을 넘은 산출물"만 좁게 잡는다.

```txt
화면의 산출물/diff 가 readiness_mode 의 forbidden_paths 에 있으면  →  validate 실패.
(정책의 forbidden_paths 를 그대로 재사용 — 모드 판정 로직은 한 곳)
```

`fact_mode >= Blocking Mode` 자체는 게이트로 **쓰지 않는다.** 그건 "결정만 빼고 다 준비됨"이라는 **정상 blocker 상태**(준비 완료 + 사람 결정 대기)여서, 그대로 실패시키면 정상적으로 막힌 모든 화면이 시끄럽게 걸린다. 그 상태는 이미 readiness_mode 다운그레이드로 올바르게 표현된다. `rough→final` 처럼 *같은 경로*를 편집하는 품질 승격은 파일로 구분 불가하므로 forward gate(hook + 다운그레이드)에 의존한다 — backstop 은 경로 경계를 넘는 변경만 본다. hook 없는 환경(CI)용이라 초기엔 **경고로 시작**해 점진 강화한다.

## Unknowns 와의 관계

`Unknowns` 는 없애지 않는다. 역할을 좁힌다. 네 종류(`U`=Unknown, `D`=Decision, `C`=Conflict, `G`=Component Gap)는 모두 "막힘 레지스터" 한 가족이며 `ID 접두사 / Owner / Status` 를 공유한다. 단 readiness 자동 게이트는 `D`(Open Decision)만 건다 — `U` 는 fact-finding, `C` 는 신호, `G` 는 제안이다(위 "Unknown 은 자동 게이트가 아니다" 참조).

```md
## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시는 어디에 있는가? | open |
```

위 항목은 **사실 확인**이다. 누군가 문서나 API 예시를 찾으면 해결된다.

```md
## Open Decisions
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
```

이 항목은 정보를 찾는 문제가 아니라 **선택**의 문제다. 따라서 `Open Decisions` 에 있어야 한다.

### Unknown 은 자동 게이트가 아니다 (승격 사다리)

`Unknowns` 는 ScreenSpec 안의 **fact-finding 큐**다. open Unknown 은 `tbd_count` 로 집계되지만 **그 자체로는 어떤 모드도 막지 않는다** — MVP-A 의 자동 게이트는 Open Decision 의 `decision_cap` 과 정책 fact(`api_confidence_min` 등)뿐이다. Unknown 이 중요해지면 셋 중 하나로 처리한다.

```txt
단순 사실 확인이면        → Unknown 에 남긴다 (게이트 아님)
구현 방향을 막으면        → Open Decision 생성/재오픈 (← 이게 게이트)
오래 걸리는 검증이면      → Investigation/Verification 생성 (막아야 하면 Open Decision 동반)
```

즉 "막아야 하는데 아직 모른다"는 Unknown 으로만 두지 말고 Open Decision 으로 **승격**해야 실제로 게이트가 걸린다. Unknown 만 남기면 readiness 는 통과한다(fail-open). `input-reconciliation.md`·`investigation-and-verification.md` 가 이 규칙을 참조한다.

## 작성 기준

입력 작성자(사람·LLM)는 다음 기준으로 분류한다.

```txt
답을 어딘가에서 찾아오면 되는가?
→ Unknowns

팀이 정책/UX/API 방향을 선택해야 하는가?
→ Open Decisions (Blocking Mode 를 보수적으로 잡는다)

외부 산출물(BE/디자인 확정)에 막혔는가?
→ Dependencies 축은 후속. 막으면 Open Decision 으로 게이트한다
  (API 는 api_confidence=candidate, 디자인은 figma_mapping 으로도 자연히 막힌다).
  단순 추적이면 Unknowns — 막아야 하는데 Unknowns 로만 두지 말 것(fail-open).

두 입력이 서로 모순되는가?
→ Conflicts
```

MVP-A 에서는 판단이 애매하면 `Open Decisions` 에 두고 `Blocking Mode` 를 보수적으로(한 단계 낮게) 잡는다. 착수 가능성을 보수적으로 판단하는 편이 더 안전하다.

## 도입 순서

MVP-A 안에 넣을 것 (✅ = 구현 완료):

1. ✅ `screen-spec.template.md` 에 `Open Decisions` 섹션 (6컬럼, Status `open|resolved`).
2. ✅ `llm-rules.template.md` 에 **저작 규칙 + 게이트 해제는 사람-전용 불변식**.
3. ✅ golden example `coupon-list` 에 예시(D-001~003).
4. ✅ `workflow-state.mjs` 가 open decision 을 파싱해 `derived.blocking_decisions`·`open_decisions_count` 생성. blocker 섹션은 stub/authored 판정에서 제외(`isStub`).
5. ✅ `readiness.mjs` 가 `fact_mode`(decision 무시)·`decision_cap` 을 계산해 `readiness_mode = min(…)` 으로 다운그레이드. **← MVP-A 의 실제 게이트.**

후속(B~D) 확장:

- ✅ **validate Open Decisions 형식 검사**(검사 9) 구현됨 — 표 형식·`Status` enum·`Blocking Mode` 유효성·전역 ID 중복(resolved→Options 는 경고). ✅ `forbidden_paths` 경계 backstop 구현(MVP-B Phase 0, diff 기반, warning-first — `scripts/forbidden-paths.mjs`).
- **deferred + Reversible + Assumptions** — 셋은 상호의존(deferred 의 가정이 갈 곳이 Assumptions, 허용 여부를 가르는 게 Reversible)이라 **한 묶음으로 함께** 출시한다. `deferred` 역시 사람-전용 전이로 도입한다.
- **decision-log.md** — resolved 결과를 전역 append-only 로 이관 + ADR 식 `superseded` 체인 + ScreenSpec frontmatter `decision_id` 연결 + `resolved↔log` 대응 검사.
- ✅ **교차-화면 참조** — #193에서 optional global register canonical 행 + ScreenSpec `decision_refs` + state/readiness fan-out + 검사 9 해소를 구현. shared-surface 같은 non-screen referrer fan-out은 #192 후속.
- **인라인 마커** — State Matrix 셀·Copy Key 에 `[D-ID]` 참조를 박아 "어느 섹션이 막혔는지"까지 readiness 가 계산. validate 가 고아 결정(본문 참조 없는 open D-행)을 검출.
- `Dependencies` 축 도입(외부 산출물 blocker).
- 4종 레지스터(U/D/C/G) 공통 스키마·파서 통합.

이 변경은 Figma 연동, catalog 생성, lint-pack, hook 도입과 독립적이다. 따라서 MVP-B/C/D 를 기다리지 않고 MVP-A 의 판단 정확도 패치로 진행할 수 있다.

## 기대 효과

- 다른 세션이 문서를 이어받아도 착수 가능 범위를 빠르게 판단한다.
- "모르는 것"과 "결정해야 하는 것"이 섞이지 않는다.
- 낮은 단계 구현은 막지 않으면서, 결정이 필요한 높은 단계 진입만 막는다.
- readiness 출력이 더 실무적인 next action 을 제공한다.
- **LLM 이 게이트를 셀프 개방할 수 없다** — open 은 올리기만 가능하고, 해제는 사람만. 진행은 readiness 다운그레이드(forward)가 막고, 경로를 넘는 변경은 CI backstop 이 잡는다.
- "결정 대기로 남긴다"가 규칙(저작)과 검사(validate) 양쪽으로 강제된다.
