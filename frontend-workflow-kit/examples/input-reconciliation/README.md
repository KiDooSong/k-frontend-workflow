# example — input-reconciliation

미래 **reconcile-input** 스킬을 위한 md-only 테스트 fixture.
외부 입력(기획/Figma/API/회의/QA)이 들어왔을 때, baseline 문서 트리가 **어떻게 갱신되어야 하는가**를
입력 전(before) / 입력 후(after) 한 쌍으로 고정해 둔 것이다.

## 이 예제가 무엇이고, 무엇이 아닌가

- 이 예제는 **production app 이 아니다.** "샘플 커머스 앱"(Expo Router / React Native)의 문서일 뿐, 배포 대상이 아니다.
- 이 예제는 **코드 구현 예제가 아니다.** golden example 인 `examples/coupon-feature` 와 달리 `src/` 가 없다 — 화면/훅/API client/컴포넌트 코드는 한 줄도 없다.
- 이 예제는 **future skill 테스트용 md fixture 다.** 여기 문서는 사람이 읽는 가이드가 아니라, 스킬이 입력으로 받고 출력과 대조하는 고정 입력/정답 쌍이다.
- `input-reconciliation` 은 **reconcile-input 스킬 테스트용**이다 (이 디렉터리). `multi-screen-dry-run` 은 workflow-state / readiness / implement-screen 테스트 입력용으로, 별도 예제다.
- **구현 결과물은 별도 세션에서 implement-screen 을 실행해 생성한다.** 이 fixture 자체는 코드를 만들지 않는다.
- 이 예제는 기존 **coupon-feature golden example 을 대체하지 않는다.** golden example 은 "코드까지 완주한 1건"의 few-shot 기준으로 그대로 남는다.

## 구조

```txt
input-reconciliation/
  project-before/                 # 입력이 닿기 전의 baseline 문서 트리
    docs/frontend-workflow/        # 6개 화면 + global/_meta (트리 설명은 하위 README)
  inputs/                          # 외부 입력 5건 (reconcile-input 의 입력) — 파일명 = input_id
    IN-20260613-planning-001.md
    IN-20260613-figma-001.md
    IN-20260613-api-001.md
    IN-20260613-meeting-001.md
    IN-20260613-qa-001.md
  expected-llm-after/             # reconcile-input(LLM) 단독 출력 정답 (사람 닫기 전 — open/reopened/conflict/gap/simple-update)
  expected-after/                  # 위에 사람 단계까지 끝낸 이상적 최종 상태 (human-final)
  reports/                         # reconciliation 요약 등 산출 리포트
```

> **파일명 규약**: `inputs/` 의 각 파일명은 그 파일 frontmatter 의 `input_id` 와 **글자 그대로 같다**
> (`IN-YYYYMMDD-{source}-NNN.md`). reconcile-input·register·리포트가 모두 `input_id` 로 입력을 참조하므로,
> 파일명을 id 와 일치시키면 "어느 입력 파일이 어느 register 행인지"를 grep 한 번으로 추적할 수 있다.

## 5개 입력과 각자 테스트하는 것

`inputs/` 의 5건은 reconcile-input 이 마주칠 대표 시나리오를 한 건씩 고정한다.
input_id 는 킷의 `IN-YYYYMMDD-{source}-NNN` 형식이고, 모두 `captured_at: 2026-06-13` 이다.

| input_id | 종류 | 테스트하는 것 |
|---|---|---|
| IN-20260613-planning-001 | planning | Open Decision 해소 입력 → `D-001`(만료 쿠폰 노출) 을 separate tab 으로 해소, COUPON-001 의 UI Sections·Copy Keys simple-update. API status enum 과의 잠재 충돌을 Unknown 으로 올리는지. |
| IN-20260613-figma-001 | figma | 시각 디자인 입력 → figma-component-mapping 생성(CouponCard 가로형), 카탈로그에 없는 컴포넌트를 Component Gap `G-001`(SegmentedTabs) `open` 으로 **제안만** 하는지. "비즈니스 동작=ScreenSpec, 시각=Figma" 경계 준수. |
| IN-20260613-api-001 | api | 데이터 계약 입력 → api-manifest 의 `GET /coupons` 응답을 bare array → page envelope 로 simple-update, `U-001` resolves-unknown, `D-003`(페이지네이션) 에 정보 제공. "화면은 API DTO 에 직접 의존하지 않는다" 유지. |
| IN-20260613-meeting-001 | meeting | resolved 결정과의 **충돌** 입력 → `D-204`(로그인 후 항상 홈)에 returnTo 우선이 부딪힘. `C-001` 생성, `D-204` 를 `resolved → open` 으로 재오픈, navigation-map Route Guard 갱신. 결과는 사람 결정 보류. |
| IN-20260613-qa-001 | qa | 누락 상태 입력 → COUPON-001 State Matrix 에 `offline`/network-error 행 추가, api-error-policy(네트워크/오프라인 retry) 갱신, Acceptance Criteria 추가. simple-update 범위. |

## md-only 게이트 천장

이 fixture 는 md-only 다 — `src/` 도, 진짜 생성된 `component-catalog.md` 도 없다(대신 `*.snapshot.md`).
그래서 사실(fact) 기준으로 도달 가능한 readiness 천장은 **모든 화면이 `screen-skeleton`** 이다.
`fake_hook_exists = false`, `component_catalog_generated = false` 이므로 `rough-fixture-ui` 이상은 사실만으로는 닿을 수 없다.

리포트나 expected-after 에 나오는 **target readiness 는 design intent**(나중에 implement-screen 세션이
fake hook·생성 카탈로그·figma 매핑·사람 승인을 더했을 때 도달할 목표)이며, md-only 게이트의 실제 출력과는 일부러 다르다.
두 층은 항상 라벨을 붙여 구분한다 — "Target readiness (design intent)" vs "md-only gate output (actual)".

## 나중 세션이 이 fixture 를 쓰는 법

1. baseline 으로 `project-before/` 를 연다.
2. `inputs/` 의 5건을 reconcile-input 에 입력한다.
3. reconcile-input(LLM) 이 만든 결과를 **`expected-llm-after/` 와 1:1 로 대조한다.** 이것이 LLM 단독 출력의 정답지다
   (decision/conflict 는 `open`·재오픈까지만, simple-update·gap 제안 반영, 닫기·승격·accept 는 없음).
4. 그 다음 사람이 결정을 닫은 **이상적 최종 상태**는 `expected-after/` 다. reconcile-input 은 blocker 를 **올리기만** 하고
   (결정 resolve·충돌 close·status confirmed 승격·gap accept 는 사람-전용), `expected-after/` 는 그 사람 단계까지 마친 트리다.
   따라서 `expected-llm-after/` → (사람 결정) → `expected-after/` 순서이고, LLM 출력은 전자와 같아야 후자와는 다른 게 정상이다.
   어디까지가 LLM 몫이고 어디부터가 사람 몫인지는 `expected-llm-after/README.md` 의 diff 표와 reconciliation 요약 리포트가 명시한다.
