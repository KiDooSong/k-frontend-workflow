# Open Decisions

입력 작성 중 생기는 애매함을 `Unknowns`에 모두 몰아넣지 않고, 구현 착수 여부를 막을 수 있는 의사결정 항목을 별도로 분리한다.

이 문서는 MVP 단계와 독립적으로 적용할 수 있는 판단 정확도 개선안이다. 목적은 다른 세션이나 다른 LLM이 같은 파일만 보고도 "어디까지 착수 가능한가"를 더 선명하게 판단하게 만드는 것이다.

## 문제

현재 ScreenSpec 입력 과정에서는 애매한 항목을 `Unknowns`에 남긴다. 이 방식은 간단하지만 다음 문제가 있다.

- 사실 확인이 필요한 질문과 사람이 결정해야 하는 질문이 섞인다.
- 어떤 질문이 구현 착수를 막는지 알기 어렵다.
- `rough-fixture-ui`, `final-fixture-ui`, `api-integrated-ui` 중 어느 단계부터 막히는지 판단하기 어렵다.
- 다른 세션이 문서를 이어받을 때 "모르는 것이 있다"는 사실은 알 수 있지만, "지금 구현해도 되는가"는 다시 해석해야 한다.

따라서 `Unknowns`의 역할을 좁히고, 착수 판단에 영향을 주는 항목은 `Open Decisions`로 분리한다.

## 개념 구분

```txt
Unknowns
= 아직 모르는 사실. 조사하거나 출처를 찾아 확인해야 하는 정보.

Open Decisions
= 사람이나 팀이 선택해야 하는 결정. 특정 구현 모드 진입을 막을 수 있음.

Assumptions
= 임시로 둔 가정. 추후 검증되거나 Open Decision으로 승격될 수 있음.

Conflicts
= 입력끼리 충돌하는 내용. 해결 전에는 관련 단계 진입을 막을 수 있음.
```

MVP-A에서는 `Unknowns`와 `Open Decisions`만 도입해도 충분하다. `Assumptions`, `Conflicts`는 후속 확장으로 둘 수 있다.

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

### 필드

| Field | Required | Description |
|---|---:|---|
| ID | yes | 화면 안에서 유일한 결정 ID. 예: `D-001` |
| Decision Needed | yes | 결정해야 하는 질문 |
| Options | no | 현재 알려진 선택지. 없으면 `TBD` |
| Blocking Mode | yes | 이 결정이 열려 있을 때 막는 최소 모드 |
| Owner | no | 결정 책임자. 예: `PM`, `Design`, `BE`, `FE` |
| Status | yes | `open`, `resolved`, `deferred` 중 하나 |

`Blocking Mode`는 `implementation-mode-policy.yaml`의 모드 이름 중 하나여야 한다.

```txt
docs-only
route-skeleton
screen-skeleton
rough-fixture-ui
final-fixture-ui
api-integrated-ui
production-ready
```

## 판단 규칙

`Open Decisions`는 낮은 모드의 작업을 불필요하게 막지 않아야 한다. 결정 항목은 자기 `Blocking Mode` 이상으로 진입하려 할 때만 blocker가 된다.

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

즉, fixture 기반 거친 화면은 만들 수 있지만, 최종 UI로 승격하기 전에는 결정이 필요하다.

## Readiness 통합

`workflow-state.mjs`는 ScreenSpec의 `Open Decisions` 표를 파싱해 화면별 파생값에 추가한다.

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
        - id: D-003
          decision_needed: 쿠폰 목록 페이지네이션 방식은?
          blocking_mode: api-integrated-ui
          owner: BE
```

`readiness.mjs`는 현재 선택 가능한 모드를 계산한 뒤, 다음 모드 이상을 막는 open decision을 `blocking`과 `next_actions`에 포함한다.

예상 출력:

```yaml
COUPON-001:
  readiness_mode: rough-fixture-ui
  next_mode: final-fixture-ui
  blocking:
    - open_decision:
        id: D-001
        blocking_mode: final-fixture-ui
        owner: PM
  next_actions:
    - resolve decision D-001: 만료 쿠폰을 목록에 노출할 것인가?
```

## Validate 통합

`validate.mjs`는 처음에는 형식만 검사한다.

- `Open Decisions` 표가 있으면 필수 컬럼을 확인한다.
- `Status`는 `open`, `resolved`, `deferred` 중 하나여야 한다.
- `Blocking Mode`는 정책 파일에 존재하는 모드여야 한다.
- `ID`는 같은 ScreenSpec 안에서 중복되면 안 된다.
- `Status=resolved`인 항목은 결정 결과나 결정 출처가 있어야 한다.

초기 MVP-A 패치에서는 `resolved` 결과 출처 검사는 약하게 시작할 수 있다. 예를 들어 `Options` 안에 선택된 값을 표시하거나, 후속으로 `Decision Result`, `Decision Ref` 컬럼을 추가한다.

## Unknowns와의 관계

`Unknowns`는 없애지 않는다. 역할을 좁힌다.

```md
## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시는 어디에 있는가? | open |
```

위 항목은 사실 확인이다. 누군가 문서나 API 예시를 찾으면 해결된다.

반면 아래 항목은 결정이다.

```md
## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
```

이 항목은 정보를 찾는 문제가 아니라 선택의 문제다. 따라서 `Open Decisions`에 있어야 한다.

## 작성 기준

입력 작성자는 다음 기준으로 분류한다.

```txt
답을 어딘가에서 찾아오면 되는가?
→ Unknowns

팀이 정책/UX/API 방향을 선택해야 하는가?
→ Open Decisions

일단 가정하고 진행할 수 있지만 나중에 확인해야 하는가?
→ Assumptions 또는 Unknowns

두 입력이 서로 모순되는가?
→ Conflicts
```

MVP-A에서는 판단이 애매하면 `Open Decisions`에 둔다. 착수 가능성을 보수적으로 판단하는 편이 더 안전하다.

## 도입 순서

1. `screen-spec.template.md`에 `Open Decisions` 섹션을 추가한다.
2. golden example의 `coupon-list`에 2~3개 예시를 추가한다.
3. `workflow-state.mjs`가 open decision을 파싱해 `derived.blocking_decisions`를 만든다.
4. `readiness.mjs`가 다음 모드 진입 blocker로 표시한다.
5. `validate.mjs`가 표 형식과 mode/status 값을 검사한다.

이 변경은 Figma 연동, catalog 생성, lint-pack, hook 도입과 독립적이다. 따라서 MVP-B/C/D를 기다리지 않고 MVP-A의 판단 정확도 패치로 진행할 수 있다.

## 기대 효과

- 다른 세션이 문서를 이어받아도 착수 가능 범위를 빠르게 판단한다.
- "모르는 것"과 "결정해야 하는 것"이 섞이지 않는다.
- 낮은 단계 구현은 막지 않으면서, 결정이 필요한 높은 단계 진입만 막는다.
- readiness 출력이 더 실무적인 next action을 제공한다.
- LLM이 애매함을 임의로 해소하지 않고, 결정 대기 상태로 남긴다.
