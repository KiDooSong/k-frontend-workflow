# Playwright Test Agents × Expo × frontend-workflow-kit — 리서치 보고서

> 날짜: 2026-06-20 · status: draft(리서치 산출물, 게이트 아님)
> Playwright 의 **Planner / Generator / Healer** 3종(Test Agents)을 이 킷의 Expo 워크플로우에 어떻게 들이는지에 대한 3장짜리 조사 보고서.

이 폴더는 **리서치 evidence** 다 — 킷의 `docs/frontend-workflow/` 산출물(screen-spec·readiness·validate 대상)이 **아니며**, 어떤 게이트도 걸지 않는다. 도입 결정은 보고서 03 의 단계적 로드맵과 별도 Open Decision 을 따른다.

## 보고서 3장

| # | 보고서 | 무엇을 답하나 |
|---|---|---|
| 01 | [Playwright Agents(Planner/Generator/Healer) 잘 쓰는 법](01-playwright-agents-planner-generator-healer.md) | 3종 셋업(`init-agents`)·역할 분담·운영 절차·안티-플레이키·거버넌스. "테스트는 evidence 이지 진실원천이 아니다." |
| 02 | [Expo 모바일 시뮬레이터 + Expo 웹에서 잘 돌리기](02-expo-web-and-mobile-simulator.md) | 환경/도구 경계. Expo 웹(react-native-web) 직접 셋업, 모바일 웹 에뮬레이션의 한계, 네이티브는 Maestro/Detox/Appium. |
| 03 | [우리 워크플로우 어디에 어떻게 끼울지](03-workflow-integration.md) | 모드 사다리·Investigation/Verification·Verification Matrix·방어선에 3종을 매핑. 신규 스크립트/스킬 제안 + 단계적 도입(E0→E4). |

읽는 순서: **01 → 02 → 03**. 03 은 01·02 의 결론을 전제로 킷 통합만 다룬다.

## 도그푸드 실행 기록

| 기록 | 무엇을 했나 |
|---|---|
| [dogfood-001-l010.md](dogfood-001-l010.md) | 01~03 의 결론을 **실제 구동 Expo 앱(L010 가입 랜딩)** 에 한 번 적용한 맛보기. `screen-spec → Planner 플랜 → Generator 스펙 → playwright test` 체인을 getByRole/getByTestId 두 번 굴려 **18/18 green**. testID 가 선택자를 카피 결합에서 풀어준 것, E2E 가 spec↔구현 드리프트를 라이브로 잡아낸 것(F9), 진짜 비용은 *에이전트*가 아니라 *앱↔킷 경계 가정*(testID·route·layout)이라는 것을 실증. 원시 로그 `temp/runs/maestro-dogfood-001/` 는 **비추적 로컬**(앱 카피·소스 임베드). |

## 이 보고서를 떠받치는 단 하나의 사실

> **Playwright 는 네이티브 iOS/Android 앱 UI 를 자동화하지 못한다. 브라우저/WebView 만 구동한다** ([microsoft/playwright#23359](https://github.com/microsoft/playwright/issues/23359)).

따라서 Expo 에서 Planner/Generator/Healer 가 직접 만질 수 있는 표면은 **react-native-web 웹 빌드 하나뿐**이다. Verification Matrix 의 `Web` 열은 Playwright 가, `iOS`/`Android` 열은 Maestro(Expo 공식)/Detox/Appium 이 채운다. 어느 도구의 green 도 `confirmed` 승격을 자동으로 의미하지 않는다(킷 불변식: confirmed 승격은 사람만).

## 핵심 사실 검증(adversarial verify 결과)

| 주장 | 판정 | 근거 |
|---|---|---|
| Playwright 는 네이티브 미구동 → Expo 는 웹만 직접, 네이티브는 Maestro/Detox/Appium | **confirmed** | [#23359](https://github.com/microsoft/playwright/issues/23359), [class-android](https://playwright.dev/docs/api/class-android) |
| RNW `testID → data-testid`, `getByTestId` 기본 `data-testid`, `accessibilityLabel/role → aria` | **confirmed**(소스) | [createDOMProps 소스](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/modules/createDOMProps/index.js), [locators](https://playwright.dev/docs/locators) |
| `npx playwright init-agents --loop=claude\|vscode\|codex\|opencode` → planner(specs/*.md) / generator(tests/*.spec.ts) / healer 순서 | **confirmed** | [test-agents](https://playwright.dev/docs/test-agents), [v1.56](https://github.com/microsoft/playwright/releases/tag/v1.56.0) |
| 디바이스 에뮬레이션은 모바일 *웹* 흉내일 뿐, `isMobile` 은 **Firefox 만** 미지원(WebKit 은 지원) | **partially-correct → 정정 반영** | [emulation](https://playwright.dev/docs/emulation), [class-browser](https://playwright.dev/docs/api/class-browser) |
| Expo 웹을 dev server(`expo start --web`) 또는 export(`expo export -p web`)+정적 서버로 Playwright 연결 | **confirmed** | [test-webserver](https://playwright.dev/docs/test-webserver), [publishing-websites](https://docs.expo.dev/guides/publishing-websites/) |

> 전체 11개 주장 중 5개 confirmed, 나머지는 partially-correct 로 보고서 본문에 정정 반영(예: `isMobile` 의 Firefox-only 제약, Lingvano 튜토리얼 attribution 미확인, 실험적 `rn-playwright-driver` 2026-06 아카이브).

## 조사 방법

- 6개 차원(Planner/Generator/Healer/Expo-웹/Expo-네이티브/CI·운영) 병렬 웹 조사 → 결정-critical 주장 11개 적대적 검증 → 킷 맥락에 맞춰 3장 작성(워크플로우 오케스트레이션).
- 1차 출처 우선: `playwright.dev`, `microsoft/playwright` 소스, `necolas/react-native-web` 소스, `docs.expo.dev`, `maestro.dev`, Wix Detox.
- 킷 example 대조 검증: COUPON-001/AUTH-001 screen-spec 의 State/Interaction Matrix·Acceptance Criteria handle(`maestro/*.yaml`, `*.test.tsx`)·Open Decision(D-001/D-204) 을 실제 파일과 대조해 보고서 03 의 통합 예시를 사실 확인.
