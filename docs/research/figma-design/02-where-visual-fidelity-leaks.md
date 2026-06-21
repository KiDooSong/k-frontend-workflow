# 02 — 파이프라인에서 시각 충실도가 새는 지점

> 한 줄 요약: Figma 시각값은 입력 단계에선 잡힐 수 있으나, 정착지(figma-component-mapping)에 담을 칸이 없어 자연어로 흩어지고, 구현 단계의 "추측 금지"가 그것을 TODO 로 만들며, 픽셀 보정은 동결되지 않는 §8 한 줄에 의존하고, 검증 단계엔 시각 게이트가 0 이다.
> 날짜: 2026-06-21 · status: draft

---

## 0. 추적 대상

킷의 핵심 루프는 다음이다([roadmap-current.md](../../../frontend-workflow-kit/roadmap-current.md)):

```txt
Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
```

이 흐름을 따라 **하나의 구체적 시각값**("EmptyState 일러스트–문구 세로 간격 = 24px")이 코드에 도달하는지 추적한다. 이 값은 실제 킷 예제에 존재한다 — 좋은 추적 대상이다.

## A. 입력 수집 — 여기까진 살아 있다

Figma 입력 산출물은 시각 수치를 `Extracted Facts` 로 잡을 수 있다. 실제 예제 [IN-20260614-figma-002.md](../../../frontend-workflow-kit/examples/input-validation/pass/docs/frontend-workflow/inputs/IN-20260614-figma-002.md):

```md
## Extracted Facts
- 일러스트-문구 세로 간격: 16 → 24.
- 나머지 배치는 v1 과 동일.

## Suggested Target Artifacts
- domains/coupons/screens/coupon-list/figma-component-mapping.md (EmptyState 프레임 갱신)
```

여기까진 정상이다. 값(24)도 있고, 정착지(figma-component-mapping)도 지정됐다. **그러나 입력 산출물은 "수집 기록"이지 정본이 아니다** — 값은 정착지로 옮겨가야 살아남는다.

## B. Reconciliation → figma-component-mapping — **첫 번째 누수 (가장 큼)**

지정된 정착지의 계약을 보자. [figma-component-mapping.template.md](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md) 의 표 컬럼은 단 4개다:

```md
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
```

그리고 템플릿 주석이 경계를 못박는다:

> "이 문서는 Figma 프레임/노드 → UI 요소 → 카탈로그 컴포넌트의 **시각 매핑**만 담는다."

여기서 "시각 매핑"은 **"어떤 노드가 어떤 컴포넌트인가"(컴포넌트 레벨)** 를 뜻하지, **"padding 24, gap 16, #333, 14px/600"(값 레벨)** 이 아니다. 골든 예제도 마찬가지다 — coupon-list 의 figma-component-mapping 비고 칸은 "썸네일 좌, 정보 우" 같은 **정성 메모**뿐이다.

결과: "24px" 가 들어갈 **구조화된 칸이 없다.** 잘해야 `## Notes` 에 자연어로 한 줄("간격 24") 남고, 그건:

- 기계가 파싱하지 못한다(자유 텍스트).
- 코드와 대조(drift 검사)되지 않는다.
- 다음 화면에 재사용되지 않는다(토큰이 아니므로).

> **핵심**: figma-component-mapping 은 "이 노드 = CouponCard" 까지만 안다. "CouponCard 가 Figma 에서 정확히 어떻게 생겼나(치수·간격·색)"는 담지 못한다.

## C. 화면 구현 — **두 번째 누수 ("추측 금지"가 TODO 를 만든다)**

설령 값이 mapping 의 Notes 에 자연어로 있어도, 구현 단계 규칙이 강하게 막는다. [frontend-llm-workflow.md](../../../frontend-llm-workflow.md) LLM 규칙:

> "디자인 값을 추측하지 않는다. 모르면 TODO 주석으로 남긴다."

[component-guidelines.md](../../../frontend-workflow-kit/examples/input-reconciliation/project-before/docs/frontend-workflow/design/component-guidelines.md) 가 못박는다:

> "색상·간격·타이포 등 구체 디자인 값은 추측하지 않는다. Figma 등 출처가 없으면 값을 채우지 말고 **TODO** 로 남긴다."

이건 환각 방지로는 훌륭하다. 하지만 **값을 구조적으로 공급하는 경로가 B 에서 끊겼으므로**, 구현 LLM 이 신뢰할 수 있는 입력은 "컴포넌트 매핑 + 자연어 메모"뿐이다. 그 결과는 둘 중 하나다:

1. 카탈로그 컴포넌트의 **기본 스타일**로 배치(= Figma 와 다를 수 있음), 또는
2. 정확한 값 자리에 **`// TODO: spacing from Figma`** 주석.

어느 쪽도 "95% 시각 일치"가 아니다. 구현 단계가 정직하게 "모른다"고 말할 뿐이다.

## D. §8 "UI 보정" — **세 번째 누수 (동결되지 않는 보정)**

킷은 픽셀 정합을 의도적으로 **맨 끝으로** 미룬다. §7:

> "이 단계의 목표는 기획 구조에 맞는 화면 배치 + 전체 상태 처리다. **픽셀 정합성은 최종 Figma 단계에서 잡는다.**"

그 "최종 Figma 단계"인 §8 의 메커니즘은 한 줄이다:

> "Figma MCP 를 쓰면 frame context 를 가져와 매핑 문서 작성에 활용한다."

문제 셋:

1. **선택적("쓰면")** — MCP 연결이 없으면 이 경로 자체가 없다.
2. **동결 산출물 없음** — MCP 로 가져온 정확한 값(px·color·auto-layout)을 **어디에도 고정하지 않는다.** 다음 실행/다음 사람은 그 추출을 재현·리뷰할 수 없다. 데이터 축이 "zod 로 고정"되는 것과 정반대다.
3. **게이트 없음** — §8 을 했는지, 결과가 Figma 와 맞는지 검사하는 것이 없다(아래 E).

즉 가장 중요한 시각 추출이 **임시(ad hoc)** 로, 휘발성으로 일어난다.

## E. Validate / 검증 — **네 번째 누수 (시각 게이트 0)**

다른 모든 축엔 기계 검사가 있다 — validate 12종, readiness, fixture 회귀, 검사 8(API), 검사 13(route). **시각엔 자동 검증이 전무하다.** [roadmap-current.md](../../../frontend-workflow-kit/roadmap-current.md) 게이트 인벤토리의 fact 어디에도 "스크린샷 일치율·토큰 일치·간격 검사"가 없다.

킷 자신의 표어가 [README.md](../../../frontend-workflow-kit/README.md) 에 있다:

> "검증 없는 루프는 그냥 자동화다."

시각 레이어는 정확히 **검증 없는 루프**다. 그래서 **"95% 달성했는지조차 측정 불가능"** 하다 — 비교 기준(Figma export vs 렌더 스크린샷)도, diff 도구도 없다.

## F. 누수 요약

```txt
Figma 시각값(예: gap 24px)의 운명

[A] 입력 Extracted Facts ──────────────► 값 살아있음 ✅
        │ (정착지로 이동)
        ▼
[B] figma-component-mapping ───────────► 담을 칸 없음 → 자연어 Notes 로 강등 ⚠ 1차 누수
        │ (구현이 읽음)
        ▼
[C] 화면 구현 (추측 금지) ─────────────► 기본 스타일 or // TODO ⚠ 2차 누수
        │ (§8 보정)
        ▼
[D] §8 UI 보정 (Figma MCP, 선택적) ────► 정확값 가능하나 동결 안 됨 ⚠ 3차 누수
        │ (검증)
        ▼
[E] Validate ─────────────────────────► 시각 게이트 0 → 측정 불가 ⚠ 4차 누수
```

네 번의 누수 중 **B(담을 칸 없음)** 가 근본 원인이다. B 만 막아 값이 구조적으로 살아남으면, C 의 "추측 금지"는 오히려 무해해지고(이제 추측이 아니라 *참조*), D 는 동결 산출물을 갱신하는 결정적 단계가 되며, E 는 그 산출물 대 코드/스크린샷을 검사할 수 있게 된다.

빠진 것의 목록과 B→E 를 닫는 처방은 [03 — 빠진 것과 95%로 좁히기](03-gaps-and-path-to-95.md) 로 이어진다.
