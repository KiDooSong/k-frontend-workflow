# testID 계약 후보 — screen-spec / accessibility / interaction declared anchor

> Status: **DESIGN / DRAFT (제안, 게이트 아님)**. 2026-06-21.
> 근거: [dogfood-001-l010](../../../../../docs/research/playwright/dogfood-001-l010.md) §6.1(testID를 "스펙 선언 계약"으로 승격) · F2 해소 · [02 §b-3/b-4](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md).
> 이 문서는 **제안**이다. 정본 템플릿 편집·구현 착수·hard gate·confirmed 승격은 **사람만** + 별도 명시 지시. 폴더 불변식("E2E는 evidence")은 [README](README.md).

---

## 0. 한 줄

testID는 Generator / Playwright / Maestro가 **발명**하는 게 아니라, **screen-spec 저자가 선언하고 구현자가 코드에 심는 계약**이다. E2E 도구는 그 앵커를 **소비**만 한다.
현재 킷엔 testID 규칙이 **0개**(골든 예제·템플릿·llm-rules 전수 확인) — "처방됐으나 미채택"인 갭을 도그푸드가 실증했다.

---

## 1. 왜 "계약"인가 (근거)

- **도그푸드 실측:** `screen-spec → Planner → Generator → playwright test` 체인을 role 9 + testID 9 = **18/18 green**. RNW `createDOMProps`가 `testID → data-testid`를 **Playwright 설정 0**으로 내보냄을 라이브 확인.
- **F2 해소:** `getByRole('button',{name:'Google'})`는 **카피(라벨 리터럴)에 결합** → 문구가 바뀌면 깨진다. `getByTestId('signup-provider-google')`는 **카피에서 분리** → 마크업·문구가 바뀌어도 살아남는다.
- **한 번 선언, 세 표면 소비:** 같은 `testID` 한 개가 web(`data-testid`, Playwright)·iOS·Android(`testID`, Maestro/Detox) 세 열을 동시에 먹인다.
- **그래서 *선언 위치*가 필요하다:** testID가 어디서 선언되는지 규율이 없으면 Generator가 **임의 발명** → 표면마다 다른 앵커 → drift. 계약은 "testID는 spec→코드 한 방향으로만 흐른다"를 못 박는 것이다.

---

## 2. 계약: 누가 / 언제 / 누가 소비

| 단계 | 주체 | 행위 | 모드 사다리 위치 |
|---|---|---|---|
| **선언(declare)** | **screen-spec 저자** | 안정 앵커 testID를 screen-spec의 Accessibility / Interaction 계약에 선언. 미정이면 추측 말고 **Unknowns / Open Decisions**. | docs-only ~ screen-skeleton(계약 작성 시) |
| **삽입(insert)** | **구현자** | 컴포넌트 코드에 `testID={...}` 를 심는다. screen-spec 선언을 **그대로** 옮긴다(발명 아님). | **screen-skeleton ~ rough/final-fixture-ui** |
| **소비(consume)** | **Playwright / Maestro / Detox / Generator** | 선언된 앵커를 `getByTestId` / `id:` / `by.id` 로 **읽기만**. 새 testID를 만들지 않는다. | final-fixture-ui 이후(E2E 진입점) |

> 핵심 비대칭: **선언과 소비를 분리**한다. Generator는 라이브 DOM에서 locator를 *검증*하되, **앵커 자체는 계약에서 받아 쓴다**. 도구가 만든 앵커가 spec에 역류하지 않으면 표면 간 drift가 생긴다.

---

## 3. 네이밍 규약

| 종류 | 형식 | 예 |
|---|---|---|
| element | `{screen}-{element}` | `l010-title` · `coupon-list-empty` |
| action | `{screen}-{action}` | `l010-login-submit` · `signup-provider-google` |
| list item | `{screen}-{entity}-item-{stableId}` (기본) · `{screen}-item-{stableId}` (예외) | `wishlist-product-item-SKU123` · `coupon-list-item-42` |

규칙:
- **`stableId`는 안정적 도메인 식별자**(entity id). **배열 인덱스 / 위치 금지**(재정렬에 깨진다). **카피 텍스트 금지**.
- **kebab-case.** `{screen}` prefix는 `screen_id`의 안정 슬러그를 쓴다(라우트 아님 — 라우트는 바뀐다).
- **예외(stutter 회피) — 한 가지로 고정:** `{screen}` 슬러그가 이미 엔티티 컬렉션을 가리키면 `{entity}`를 생략해 **`{screen}-item-{stableId}`** 로 쓴다(예: 화면 `coupon-list` → `coupon-list-item-42`). `screen`과 `entity`가 같은 단어면 한 번만 쓴다(화면 `coupon` → `coupon-item-42`). 한 화면 내 **한 형태로 일관**.
- **안정성 원칙:** testID는 *카피·마크업·레이아웃이 바뀌어도 살아남는 계약*. 그래서 **의미(역할/엔티티) 기반**으로 짓고 **시각/문구 기반으로 짓지 않는다**.

---

## 4. 금지 (도그푸드가 실증한 함정)

1. **카피 기반 label을 testID 대체로 쓰기 금지.** `getByText('신규가입 쿠폰')` 같은 카피 결합 선택자를 안정 앵커 자리에 두지 않는다(F2). **문구는 Copy Keys, 앵커는 testID** — 분리한다.
2. **Generator / Playwright / Maestro가 임의 testID 발명 금지.** 도구가 만든 앵커는 screen-spec에 역류하지 않으면 표면 간 drift를 만든다. testID는 **spec → 코드** 방향으로만 흐른다.
3. **testID green으로 OD / confirmed 자동 승격 금지.** 18 green이 `U-*` / `D-*` 를 닫지 않고 화면을 confirmed 위로 올리지 않는다(불변식: 승격은 사람). green은 Verification Matrix `Web` 열 evidence 링크로만 들어간다.
4. **testID를 접근성(role/label) 대체로 쓰기 금지.** `getByTestId` 남용은 접근성 회귀를 못 잡는다(user-facing 아님). **2층 구조**: 기본 후킹 = testID, **접근성 의미 단언**(role + accessible name) = `getByRole`/`getByLabel`. 컴포넌트엔 `testID` + `accessibilityRole`/`accessibilityLabel` **둘 다** 심는다.

---

## 5. 어디에 둘지 권고 (작업 #2)

**권고: 3-way 하이브리드. 단 지금은 이 design draft로만 — 정본 편집은 별도 명시 지시 + 슬롯.**

| 무엇을 | 어디에 | 근거 |
|---|---|---|
| **네이밍 규약**(짧은 규칙) | **llm-rules** | llm-rules는 "린트로 강제할 수 없는 규칙만" 담는 자리. 네이밍 규약의 정확한 집(도그푸드 §6.1). 길수록 LLM 준수율↓ → 최소로. |
| **화면별 testID 선언** | **screen-spec** | screen-spec의 Accessibility / Interaction / Acceptance Criteria가 이미 *화면 계약의 단일 출처*. 안정 앵커를 화면 계약에 명시하는 게 자연 확장. |
| **계약 설계**(누가/언제/소비·금지·운영) | **이 design draft** | 지금 위치. 정본에 흩어 두면 토론·후속 PR 근거가 사라진다. |

**왜 지금 정본을 안 건드리나:** 이 세션은 design 중심이고, 코드·정책 변경은 명시 지시가 있을 때만 한다. 정본 템플릿 편집은 [visual-spec VS-1 패턴](../visual-spec-od-decisions.md)(전제 충족 → 순차 슬롯에서 옵션 섹션화)을 따른다. 아래 §6은 그 슬롯에서 적용할 **문구 제안**이지 적용분이 아니다.

---

## 6. 최소 문구 patch 제안 (proposal — 정본 미적용)

> ⚠ 아래는 **제안 텍스트**다. 이 PR은 `templates/global/llm-rules.template.md` / `templates/screen/screen-spec.template.md`를 **편집하지 않는다**. 적용은 별도 명시 지시 + 슬롯.

### 6.1 `llm-rules.template.md` 에 추가할 섹션 (제안)

```md
## E2E 앵커(testID) 네이밍
- testID는 screen-spec이 선언하고 구현자가 심는 계약이다. Generator/E2E 도구는 소비만 — 임의 발명 금지.
- 네이밍: `{screen}-{element}` · `{screen}-{action}` · 리스트 `{screen}-{entity}-item-{stableId}`
  (stableId = 안정적 도메인 id, 배열 인덱스/위치 금지).
- 카피 텍스트를 testID로 쓰지 않는다(문구는 Copy Keys). testID는 접근성(role/label)을 대체하지 않는다 — 둘 다 둔다.
```

(lint 강제 0 — 규약일 뿐. 길이 최소: llm-rules는 짧을수록 준수율↑.)

### 6.2 `screen-spec.template.md` Accessibility 섹션에 추가할 안내 (제안)

현재:
```md
## Accessibility
- {a11y 요구사항}
```

제안(주석 한 줄 + 선언 불릿 — additive):
```md
## Accessibility
<!-- E2E 안정 앵커가 필요한 요소는 testID를 함께 선언한다(카피 아님·인덱스 아님). 네이밍 규약은 llm-rules.
     미정이면 추측 말고 Unknowns/Open Decisions 로. testID 는 선언일 뿐 — 도구가 발명하지 않는다. -->
- {a11y 요구사항} (role / label)
- testID: `{screen}-{element}` = {요소}   ← E2E 앵커(선언만)
```

그리고 Acceptance Criteria 주석에 표면 분기 한 줄(이미 "테스트 ID 를 적는다" 존재 — 확장):
```md
<!-- 테스트로 옮길 항목은 표면별로 적는다:
       (웹) → tests/web/*.spec.ts  [Playwright, Verification Matrix Web 열]
       (네이티브) → maestro/*.yaml  [Maestro, iOS/Android 열]
     E2E 는 evidence 이지 게이트 아님 — green 이 confirmed/OD 를 닫지 않는다. -->
```

> **불변식 보존(중요):** 표 헤더·필수 섹션 이름은 **바꾸지 않는다**(`workflow-state.mjs`가 헤더로 표를 파싱). 추가는 **주석/불릿 수준의 additive만** — 새 필수 표/컬럼을 강제하지 않는다(warning-first 원칙, 새 readiness fact 신설 아님).

---

## 7. 표면 매핑 (한 testID, 세 소비처)

```txt
RN 컴포넌트:  <Pressable testID="coupon-list-item-42"
                        accessibilityRole="button" accessibilityLabel="신규가입 쿠폰, 6/30 만료">
Web (RNW):    <div data-testid="coupon-list-item-42" role="button" aria-label="신규가입 쿠폰, 6/30 만료">
  Playwright:  page.getByTestId('coupon-list-item-42')        // 주 후킹
               page.getByRole('button', { name: /신규가입 쿠폰/ })  // 접근성 의미(보조)
  Maestro:     - tapOn: { id: 'coupon-list-item-42' }          // 네이티브 testID 동일 prop
  Detox:       element(by.id('coupon-list-item-42'))
```

`testID` 하나를 선언하면 web의 `data-testid`와 네이티브의 `testID`가 **같은 소스**에서 나온다([03 §3.2](../../../../../docs/research/playwright/03-workflow-integration.md)). 카피(`aria-label`/문구)는 별개 계약(Copy Keys)이고, 앵커(`testID`)와 접근성 의미(`role`/`label`)는 **둘 다** 둔다.

---

## 8. 의존 / 순서 (substrate)

- **네이밍 규약 · screen-spec testID 선언은 지금 설계 가능**(substrate 무관) — 화면 계약 저작 규율일 뿐.
- 그러나 **E2E role(`web_e2e` / `native_e2e`) · `e2e-index` 생성 뷰는 Tier3 substrate 이후 후보**다. [tier3 access matrix 정정](../../../../temp/proposals/tier3-access-matrix-revision.md)(`edits_at` → mode×layer 행렬)이 정착해야 테스트 경로가 데이터 주도 `layers:`로 자연 표현되고 재작업이 없다(도그푸드 §6.2). **그 전엔 role/index를 신설하지 않는다.**
- 이 분리 덕에 **계약(이 문서)은 지금 합의**하고, **기계 강제(role·index·검사)는 substrate 이후**로 안전하게 미룬다.

---

## Cross-links

- 폴더 불변식·운영 규율: [README](README.md) · [e2e-evidence-discipline.md](e2e-evidence-discipline.md)
- 리서치: [dogfood-001-l010 §6](../../../../../docs/research/playwright/dogfood-001-l010.md) · [01 §c.2/g](../../../../../docs/research/playwright/01-playwright-agents-planner-generator-healer.md) · [02 §b-3/b-4](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md) · [03 §3.2](../../../../../docs/research/playwright/03-workflow-integration.md)
- 템플릿(patch 대상): [screen-spec.template.md](../../../../templates/screen/screen-spec.template.md) · [llm-rules.template.md](../../../../templates/global/llm-rules.template.md)
- substrate: [tier3-layer-model.md](../customizable-architecture/tier3-layer-model.md) · [tier3-access-matrix-revision](../../../../temp/proposals/tier3-access-matrix-revision.md)
