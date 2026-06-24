# expected-llm-after — reconcile-input(LLM) 단독 출력 정답

`inputs/` 7건을 `project-before/` baseline 에 **reconcile-input 만** 돌렸을 때(사람 단계 전) 나와야 하는 트리다.
나중 세션이 reconcile-input 출력을 **이것과 1:1 로** 대조한다.

- 이 트리는 production app 도, 코드 구현 예제도 아니다 (md-only).
- future skill(reconcile-input) 테스트용 **LLM 단독 정답 fixture** 다.
- 구현 결과물은 별도 세션의 implement-screen 이 만든다 — 이 트리는 코드를 만들지 않는다.
- coupon-feature golden example 을 대체하지 않는다.

## 핵심 규칙 — LLM 은 올리기만, 닫지 않는다

reconcile-input(LLM)이 하는 일은 **게이트를 올리거나(open 추가·`resolved → open` 재오픈) 유지**하고,
simple-update(문서 형태가 안 바뀌는 갱신)·gap 제안(`open`)을 반영하는 것까지다.
**아무 것도 닫지 않는다.** 그래서 이 트리에는 다음이 **없다**:

- decision `resolved` (D-001·D-003·D-204 닫기)
- conflict `resolved` (C-001 닫기)
- unknown `resolved` (U-001 닫기)
- status `confirmed` 승격 (COUPON-001)
- gap `accepted` (G-001 카탈로그 반영)
- testID naming `confirmed` 승격
- live policy replacement / CI promotion / pre-edit hook enforcement

이 닫기·승격·accept 는 전부 사람 몫이고, 그 결과가 `../expected-after/`(human-final) 다.
즉 흐름은 **`project-before` → (reconcile-input) → `expected-llm-after` → (사람 결정) → `expected-after`** 다.

## expected-llm-after vs expected-after (차이)

| 산출물 / 항목 | expected-llm-after (LLM 단독) | expected-after (human-final) |
|---|---|---|
| decision-log **D-001** | `open` — IN-planning-001 이 separate-tab 을 후보로 올림 | `resolved` → separate tab |
| decision-log **D-003** | `open` — IN-api-001 이 offset/page 로 좁힘 | `resolved` → offset/page |
| decision-log **D-204** | `open` (**재오픈**) — returnTo 충돌로 resolved→open | `resolved` (재-resolve: 기본 홈 + returnTo 우선) |
| conflicts **C-001** | `open` | `resolved` (D-204 닫으며 동기 close) |
| **COUPON-001** status | `draft` (승인 메타 없음) | `confirmed` (approved_by/at/decision_id) |
| COUPON-001 **U-001** | `open` — IN-api-001 이 답 제공(resolvable), 닫기는 사람 | `resolved` |
| COUPON-001 탭 Copy Keys | `draft` (탭 존재가 D-001 에 달림) | `confirmed` |
| **AUTH-001** status | `confirmed` 그대로 (LLM 은 강등 금지) — 단 D-204 재오픈이 readiness 를 cap | `confirmed` (재확정) |
| AUTH-001 returnTo (Interaction/Acceptance) | **미반영** (D-204 대기) | 반영 |
| **navigation-map** Route Guard returnTo | **파일 미수정** (아래 참고) | 반영 |
| component-gap **G-001** | `open` *(사실 동일)* | `open` — accept 는 사람 |
| **figma-component-mapping** | 생성 *(사실 동일)* | 생성 |
| testID anchors | Accessibility 에 `draft/recommended` note | 사람 승인 전 confirmed 아님 |
| policy migration **D-501/C-002** | `open` — draft/live policy boundary decision 대기 | 이 fixture 에서도 open 유지(별도 promotion decision) |
| api-manifest **page envelope** | 반영 *(사실 동일)* — 단 D-003 은 open 으로 표기 | 반영 |
| api-error-policy **offline/네트워크** | 반영 *(사실 동일)* | 반영 |
| COUPON-001 State Matrix **offline 행** | 반영 *(사실 동일)* | 반영 |

`*(사실 동일)*` 은 **그 산출물의 핵심 사실/행이 `expected-after` 와 같다**는 뜻이지 파일이 byte 단위로 같다는 뜻이 아니다 — 제목은 `expected-llm-after` 로 적히고 본문엔 LLM-단계 맥락 주석이 더 붙는다. 이 산출물들은 전부 **순수 simple-update** 이거나 **gap 제안(open)** 이라 LLM 단독으로 완결된다(닫기·accept 불필요). 단 `api-manifest` 는 응답 형태=page envelope 라는 **사실만** 같고, 화면 페이지네이션 방식 `D-003` 은 `open` 으로 적는 차이가 있다.

## 일부러 여기 없는 것: navigation-map

`../expected-after/` 에는 `app/navigation-map.md` 가 있고 Route Guard 에 returnTo 우선이 반영돼 있다.
**이 트리에는 navigation-map 이 없다.** returnTo 반영은 resolved 결정 D-204 를 뒤집는 변경이라
reconcile-input 은 적용하지 않고 **멈춘다**(충돌 기록 + D-204 재오픈까지만). Route Guard 갱신은
사람이 D-204 를 재-resolve 한 뒤에 일어난다. 그래서 LLM 단독 출력에는 navigation-map 변경이 없다 —
이 "없음"이 LLM-vs-human 경계를 그대로 보여준다.

## reconcile 자체는 끝났다 (register 7행 reconciled)

자식 decision(D-001/D-003/D-204/D-501)·conflict(C-001/C-002)가 `open` 이어도 **reconcile 행위는 완료**다.
`_meta/reconciliation-register.md` 의 7개 행은 모두 `Reconcile Status: reconciled` 이고,
사람 결정이 남은 입력은 `Result: pending user decision` 으로 구분한다.
"입력을 처리했는가"와 "그 입력이 만든 결정이 다 닫혔는가"는 다른 라이프사이클이다(계약: input-reconciliation.md).

## Tier3 policy migration 은 promotion 이 아니다

IN-20260613-policy-migration-001 은 readiness access wired / policy draft generated / migration guide generated 를
reconcile 하지만, live `policies/implementation-mode-policy.yaml` replacement 는 하지 않는다. hard gate, CI, pre-edit hook
enforcement 도 승격하지 않는다. 그 선택은 D-501(open) 로 남긴다.

## md-only 게이트 천장 / readiness

reconcile-input 단독으로는 readiness 숫자가 **올라가지 않는다** — 게이트를 내리는 닫기·승격이 전부 사람 몫이기 때문이다.
오히려 D-204 재오픈으로 AUTH-001 의 design-intent 는 final-fixture-ui → rough-fixture-ui 로 **내려간다**.
md-only fact 천장(screen-skeleton)은 before/after 동일하다. 자세한 건 `reports/expected-readiness.md`.
