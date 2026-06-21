# 03 — 빠진 것과 95%로 좁히기

> 한 줄 요약: 빠진 것은 7가지(우선순위 있음)이고, 근본 처방은 3단(디자인 토큰 단일 출처 · 시각 계약 산출물 · 비주얼 회귀 게이트)이다. 단, 킷의 "새 산출물 축 추가 금지" 원칙에 맞춰 **새 축이 아니라 기존 design 축의 강화**로, warning-first 부터 도입해야 한다.
> 날짜: 2026-06-21 · status: draft

---

## 1. 빠진 것 (우선순위 순)

보고서 02 의 누수 분석을 근거로, "디자이너 화면 95% 재현"이라는 목적에 빠진 것들이다.

### 1순위 — 시각 계약 산출물 자체가 없음 (근본 원인)

- **디자인 토큰 단일 출처 부재.** 색상/간격 스케일/타이포(폰트·크기·굵기·행간)/radius/shadow/elevation 을 담는 정본이 없다. component-catalog 가 *코드에서 props 를 생성*하듯, 토큰도 Figma Variables/스타일에서 생성해 고정해야 하는데 그런 산출물이 없다.
- **컴포넌트/섹션별 측정값 + auto-layout 구조 부재.** 방향(row/column), gap, padding, 정렬(justify/align), sizing(hug/fill/fixed), 중첩/스크롤/sticky. 이게 "화면이 그 화면처럼 보이는지"를 결정하는데, screen-spec 의 `## UI Sections` 는 그냥 **섹션 이름의 순서 목록**일 뿐이다(예: "1. Header / 2. Coupon Status Tabs / …"). 중첩·겹침·절대배치(FAB 등)를 못 담는다.

### 2순위 — 시각 검증 게이트가 0

- 스크린샷/비주얼 리그레션 diff(렌더 스크린샷 ↔ Figma export)가 없다. warning-first 로라도 있어야 "95% 달성 여부"를 **측정**할 수 있다. 없으면 충실도는 영원히 주관적 인상.

### 3순위 — 에셋 파이프라인 부재

- 아이콘/일러스트/이미지. 매핑엔 "icon 필요"라고만 적히고(골든 예제 EmptyState `icon?: string`), Figma export → 네이밍 → @2x/@3x(또는 SVG) → 코드 와이어링 계약이 없다.

### 4순위 — 디자인 시스템 컴포넌트 자체의 충실도는 범위 밖

- "카탈로그 컴포넌트만 써라" + "화면에서 재스타일 금지"(린트 boundaries) 때문에, **카탈로그의 `Button` 이 Figma 와 다르게 생겼으면 화면 레벨에서 고칠 수 없다.** 즉 시각 충실도는 이 워크플로우 *상류*의 DS 컴포넌트 충실도에 의존하는데, 그건 이 킷이 다루지 않는다. component-catalog 는 import·props 만 담고 **스타일은 안 담는다**([component-catalog.md](../../../frontend-workflow-kit/examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md) 확인 — `variant`/`size` 이름만, 그 값의 시각 정의 없음).

### 5순위 — 반응형 / 테마 / 플랫폼 변이

- RN+Expo 는 다양한 화면폭·safe-area·다크모드가 있는데 Figma 프레임은 보통 고정폭. 반응형 의도·다크모드 변형을 담을 자리가 없다. component-guidelines 는 "색상만으로 상태 구분 금지"는 말하나 테마 토큰 매핑은 없다.

### 6순위 — 모션/인터랙션 시각

- 전환·애니메이션·press/focus/disabled 의 시각 처리. State Matrix 5상태는 *데이터 상태*이지 *시각 인터랙션 상태*가 아니다.

### 7순위 — 추출의 비형식성 (2~6 을 악화)

- §8 의 Figma MCP 추출이 동결되지 않으므로(보고서 02 §D), 위 1~6 의 값을 어렵게 구해도 **다음 실행이 재현/리뷰/검사할 수 없다.**

## 2. 95%로 좁히는 3단 처방

근본 원인은 "값을 담을 칸이 없다"(02 §B)이므로 처방도 거기서 시작한다.

### 처방 1 — 디자인 토큰 단일 출처 (`design/design-tokens.*`)

- Figma Variables/스타일 → 토큰 파일 **생성**(component-catalog 가 코드에서 생성되는 패턴과 동형: GENERATED 마커, 멱등).
- 색/간격/타이포/radius/shadow 를 의미 토큰(`color.bg.surface`, `space.4=16`)으로. 화면·컴포넌트는 리터럴 대신 토큰만 참조(이미 린트 "임의 색상 금지" 정책과 정합).
- 효과: "추측 금지"가 무해해진다 — LLM 은 추측이 아니라 **토큰을 참조**.

### 처방 2 — 시각 계약 산출물 (figma-component-mapping 확장 또는 자매 문서)

- 컴포넌트 매핑 표에 **값 칸**을 더하거나, `## Visual Spec` 섹션 추가: 노드별 auto-layout(방향/gap/padding/정렬/sizing) + 토큰 참조(처방 1). 자유 리터럴이 아니라 **토큰 ID** 로 적어 검사 가능하게.
- 입력의 "gap 24"(02 §A)가 이제 `space.6` 같은 토큰 참조로 **구조적으로 정착**한다 → 02 §B 누수 해소.
- 경계 유지: 비즈니스 동작은 여전히 ScreenSpec 단일 출처(템플릿 기존 경계 그대로).

### 처방 3 — 비주얼 회귀 게이트 (warning-first)

- 렌더 스크린샷(Storybook story = State Matrix 행, 또는 Expo 웹 + Playwright — [docs/research/playwright/](../playwright/README.md) 와 직접 연결) ↔ Figma frame export diff.
- 처음엔 **warning-only/`continue-on-error`**(최근 route-cross-check·interaction-matrix v2·lint-pack 도입 방식과 동일), telemetry 후에만 하드 게이트 별도 Open Decision.
- 효과: "95%"가 비로소 **숫자로 측정**된다(픽셀 일치율).

## 3. 킷 사상과의 정합성 (반드시 지킬 것)

[roadmap-current.md](../../../frontend-workflow-kit/roadmap-current.md) "지금 하지 말 것"이 못박는다: **"새 산출물 축 추가 — idea surface 확장 금지."** 그래서 위 처방은 **새 축이 아니라 기존 축 강화**로 프레이밍해야 한다:

- 처방 1·2 는 기존 **저작/design 축**(figma-component-mapping 은 이미 존재) 안에서 확장. 새 "비주얼 축"을 만들지 않는다.
- 처방 3 은 기존 **조사/검증 축**의 evidence 생성기로(Playwright 보고서 03 이 이미 같은 논리로 E2E 를 흡수했다 — "테스트는 새 축이 아니라 Verification 축의 evidence").
- 모든 게이트는 **warning-first → telemetry → 사람-승인 decision PR** 순(킷의 일관된 승격 규율). confirmed 승격·게이트 내림은 **사람 전용** 불변식 유지.
- 토큰/시각스펙 생성기는 **멱등 + GENERATED 마커**(불변식 3·7).

## 4. 현실적 천장

- **순수 픽셀 100% 일치는 어떤 파이프라인이든 불가능**하다 — 폰트 렌더링 차, RN↔Figma 레이아웃 엔진 차, 플랫폼(iOS/Android/web) 차, 마이크로 인터랙션.
- 현실적 목표: **토큰·구조 레벨 충실도 ~95%**(처방 1·2 로 달성 가능) + **픽셀은 비주얼 회귀로 반복 수렴**(처방 3). "한 방에 95%"가 아니라 "측정 가능한 루프로 95%까지 좁힌다".
- 처방 없이 현 상태로는: 기능 95%+, **시각은 측정 불가**(달성했을 수도, 아닐 수도 — 알 방법이 없음).

## 5. 다음 액션 후보 (제안 — 사람 결정)

이 보고서는 게이트가 아니다. 실제 도입은 아래를 Open Decision/제안서로 올려 사람이 판단한다(킷 절차).

1. **OD 후보**: "design-tokens 생성 소스 계약"(Figma Variables → 생성 토큰; component-catalog 생성 패턴 재사용 여부).
2. **OD 후보**: "figma-component-mapping 에 Visual Spec(토큰 참조) 섹션 추가" — 템플릿/스키마/검사(warning-first) 슬라이스.
3. **OD 후보**: "비주얼 회귀 evidence 도입" — Storybook/Playwright(웹) 스크린샷 ↔ Figma export, warning-only CI smoke 부터.
4. 순차 원칙 준수: roadmap "다음 구현 후보"의 순차 슬롯에 한 항목씩(병렬 금지).

> 요약: **빠진 것은 "시각값을 담는 구조화 산출물 · 디자인 토큰 단일 출처 · 비주얼 검증 게이트" 세 가지**다. 이 셋이 채워지기 전엔 시각 충실도는 보장도 측정도 안 되는 영역으로 남는다. 다른 모든 축은 "고정→검사"인데 시각만 "선언→희망"인 비대칭(보고서 01)을, 같은 "고정→검사" 규율로 끌어오는 것이 처방의 본질이다.
