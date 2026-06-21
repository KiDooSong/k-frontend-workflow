# Maestro Dogfood 001 — Planner→Generator E2E flow on a real Expo web app

> 날짜: 2026-06-21 · status: dogfood run report (evidence, 게이트 아님)
> 대상 앱: [`temp/runs/figma-fidelity-001/app`](../figma-fidelity-001/app) (Expo SDK 56 · react-native-web · NativeWind) — **앱 소스 무수정**
> 스코프: **L010 회원가입 랜딩** 1화면 + 그 결과 화면 · **Web 표면만**(네이티브=Maestro, 범위 밖)
> 결과: **`npx playwright test` → 9 passed (4.9s)**, 0 fail. 체인 전체 green.

## 0. TL;DR

`screen-spec(confirmed) → Planner 플랜 → Generator 스펙 → npx playwright test(green)` 전체 흐름을
**실제 구동 앱**에 붙여 한 번 완주했다. 흐름 자체는 **마찰이 거의 없었고**, 마찰은 전부 *에이전트*가 아니라
**앱/킷 경계의 가정**(testID 부재 · expo-router 아님 · flat 레이아웃)에서 나왔다 — 이게 이 도그푸드가 건진 telemetry다.

## 1. 무엇이 "진짜"이고 무엇을 내가 "대역"했나 (정직 경계)

| 단계 | 실제 실행 | 내가 역할 대역 |
|---|---|---|
| `@playwright/test` 설치(1.61.0) + chromium | ✅ 실제 | — |
| `npx playwright init-agents --loop=claude` (planner/generator/healer 정의 + `.mcp.json` 생성) | ✅ 실제 | — |
| Planner: 라이브 앱 탐색 → 플랜 작성 | — | ✅ 대역(harness preview snapshot으로 관찰 → `specs/L010.plan.md`) |
| Generator: locator를 라이브 DOM에 검증 → 스펙 직렬화 | — | ✅ 대역(snapshot/eval로 검증 → `tests/web/L010.spec.ts`) |
| `npx playwright test` 실행 | ✅ **실제 green** | — |
| Healer | — | (미실행 — §6에 시나리오) |

> 왜 대역?: planner/generator/healer 서브에이전트는 `playwright-test` **MCP 서버**가 *클라이언트에 연결*돼야
> 도는데, 이 세션엔 그 MCP가 안 붙어 있다. 그래서 동일한 **관찰→검증→직렬화 루프**를 harness 브라우저 도구로 수행하고,
> **테스트 실행은 진짜**로 돌렸다. (real 에이전트 run이 추가로 줄 것 = §7)

## 2. 흐름 — 단계별로 어떻게 흘렀나 (킷 매핑 포함)

1. **입력 확인** — L010 screen-spec이 이미 **킷 포맷**(`status: confirmed`, State/Interaction Matrix,
   Acceptance, Unknowns, Open Decisions)이라 Planner 입력이 turnkey였다. → 리서치 03 §3의 "screen-spec이 플랜의 단일 출처"가 그대로 성립.
2. **앱 기동** — `npm run web -- --port 19006` (preview). 홈 렌더 확인 → 딥링크 `?screen=l010`로 L010 진입 확인.
3. **Planner(대역)** — 라이브 snapshot으로 7개 섹션·5개 액션 관찰 → screen-spec Matrix와 1:1 대조 →
   `specs/L010.plan.md`. **사람-게이트**에서 `pending/error`(미구현 천장 밖), D-L010-1(시각 OD), U-L010-2(open)을 명시적으로 제외/제한.
4. **Generator(대역)** — 플랜의 각 스텝을 라이브 DOM에 검증하며 locator 확정(아래 F4가 여기서 잡힘) → `tests/web/L010.spec.ts`.
5. **실행** — `npx playwright test` → **9 passed**. webServer는 떠 있는 :19006 재사용.
6. **evidence 위치** — 이 green은 Verification Matrix `Web` 열 evidence가 될 것(아직 안 만듦). Status/confirmed는 사람 몫(§6).

## 3. 결과 (evidence)

```
Running 9 tests using 8 workers
  9 passed (4.9s)        # test-results/.last-run.json: { "status": "passed", "failedTests": [] }
```
- 렌더 1 + provider/login 선택 5 + back/close 2 + 홈→모달 진입 1 = 9.
- HTML 리포트: `playwright-report/index.html` (`npx playwright show-report`로 열람).

## 4. 발견 (Findings) — 도그푸드의 본체

| # | 발견 | 근거 / 함의 |
|---|---|---|
| **F1** | **셋업이 Windows/Expo에서 그대로 됨.** `init-agents`가 `.mcp.json`에 `cmd /c npx playwright run-test-mcp-server`를 **자동**으로 박았다 | 리서치 01 §b.1의 "Windows는 cmd 래핑 필요할 수도" **불확실성 해소 — 수동 개입 0** |
| **F2** | **앱에 `testID` 0개.** `accessibilityRole/Label`은 잘 깔림 | 리서치의 **testID-우선 정책(02 §b-4 #1) 적용 불가** → `getByRole`+접근성 이름으로 폴백. 부작용: selector가 **카피에 결합**("kakao로 가입하기") → 카피 바뀌면 테스트 깨짐. **권고: Button/SocialLoginButton/NavigationBar/결과 Text에 `testID` 추가**(가산적·시각 무영향) |
| **F3** | **expo-router 아님.** 단일 `App.tsx` + 쿼리파라미터 상태 네비 | 킷의 `route_entry: src/app/**`·route-tree/nav-graph 생성기(expo-router 파싱) **그대로는 안 맞음**. 대신 딥링크 `?screen=l010`가 결정적 진입점 — **figma 세션이 스크린샷 diff용으로 만든 기능이 E2E seed로 재활용**됨(우연한 정렬) |
| **F4** | **라이브 검증이 selector 함정을 잡음.** "회원가입"은 heading이 아니라 plain `<Text>` | `getByRole('heading')`이면 실패 → `getByText` 사용. 리서치 01 §c.2 경고를 **실제로 만남** = Generator의 "직렬화 전 라이브 검증" 단계의 가치 입증 |
| **F5** | **RN Modal은 DOM E2E엔 문제없음.** App.tsx 주석의 "headless 캡처에서 틀어짐"은 *스크린샷* 얘기 | 홈→모달 진입(test 9) 통과. 모달 내용이 DOM에 있어 role/text assertion 정상. 딥링크는 *결정성/격리*용으로 여전히 선호 |
| **F6** | **킷 포맷 screen-spec = turnkey Planner 입력.** Matrix가 플랜 시나리오로 1:1 | "spec=진실원천, test=evidence" 규율이 마찰 없이 성립: D-L010-1은 시나리오 0개 제거(시각 OD), U-L010-2는 로그인 링크 assertion을 **데모값까지만** 제한 |
| **F7** | **데이터 seam 없음(pre-hook 앱).** API/TanStack Query/fixture-hook 부재 — provider 선택은 로컬 상태 | 킷의 load-bearing 게이트 fact `fake_hook_exists`가 **여기엔 해당 자체가 없음**. 모드 사다리상 이 앱은 screen-skeleton↔rough-fixture-ui. 그런데 데이터가 없어 모든 상태가 결정적 → Planner가 사다리 예측보다 **이른 단계에서도 잘 굴렀다**(§5) |
| **F8** | **레이아웃/role 불일치(Axis 1).** flat `components/`·`screens/` (≠ `src/features/{domain}/...`) | 킷 `expo-feature` 프리셋으로 실제로 돌리려면 `project-layout.yaml` roles 오버라이드 필요 — 채택 진단서가 지목한 **Axis-1 경로 그대로**. "깨끗하고 잘 도는 앱조차 킷 바인딩 전에 오버라이드가 필요"를 새 각도로 확인 |

## 5. 모드 사다리 & 채택 읽기

- 이 앱 ≈ **screen-skeleton / rough-fixture-ui**(UI 있음, 데이터 훅·API 없음).
- 리서치 03 §2는 "Planner는 `final-fixture-ui`에서 처음 의미"라 했지만 — **이 앱은 데이터가 없어 모든 상태가 공짜로 결정적**이라
  딥링크만으로 Planner/Generator가 더 이른 단계에서도 매끄럽게 동작했다. 규칙의 본질은 *모드*가 아니라 **데이터 결정성**임을 보여준다.
- 도그푸드가 만든 telemetry 한 줄: **플로우(에이전트)는 견고하고 저마찰**. 비용은 전부 **경계 가정**(testID·route·layout)에 있다.

## 6. evidence ≠ gate (킷에 들어간다면 어디에)

- **9/9 green은 evidence다.** U-L010-2를 닫지 않고, D-L010-1을 닫지 않고, L010을 confirmed 위로 올리지 않고, 어떤 모드도 게이트하지 않는다.
- 킷에선 Verification Matrix `Web` 열의 evidence 링크(playwright-report)로 들어가고, **Status(passed/failed)는 사람이 기입**.
- **Healer 시나리오(미실행):** 디자인이 "회원가입"→"가입/로그인"으로 카피를 바꾸면 F4 selector가 깨진다. Healer는 (a) 변경을 따라가거나
  (b) 진짜 회귀면 assertion을 느슨히 해 green을 만든다 — **그 diff가 사람 게이트가 필요한 이유**. CI 무인 자동수정 금지(리서치 01 §c.3) 그대로.

## 7. 재현 (commands)

```bash
# 앱(웹) 기동 — preview 또는:
cd temp/runs/figma-fidelity-001/app && npm run web -- --port 19006
# 도그푸드 하니스(별도 디렉터리):
cd temp/runs/maestro-dogfood-001
npm install                       # @playwright/test 1.61
npx playwright install chromium
npx playwright init-agents --loop=claude   # (이미 실행됨 — .claude/agents/*, .mcp.json)
npx playwright test               # → 9 passed (떠 있는 :19006 재사용)
npx playwright show-report
```

## 8. 진짜(비대역) 에이전트 run이 추가로 줄 것

- `playwright-test` MCP를 클라이언트에 연결하면 planner/generator/healer 서브에이전트가 직접 돈다.
  추가로 검증될 것: `planner_save_plan`의 정확한 직렬화 · generator의 라이브 locator 자동 선택(아마 동일 `getByRole` 결과) · healer 자동수정 루프.
- 단, **본 run이 증명한 핵심**(스펙→플랜→스펙→green 체인이 실제 앱에서 성립, 경계 가정이 진짜 비용)은 대역 여부와 무관하게 유효하다.

## 9. Update — testID 실험(B) + F9 드리프트 (후속)

- **실험 B(testID)**: L010 플로우 컴포넌트에 `testID` 박고(`app-testid.patch`) 스펙을 `getByTestId` 로 전환 → `tests/web/L010.testid.spec.ts`. `testID→data-testid` 라이브 확인(설정 0), **9/9 green**. role 베이스라인도 안 깨짐(하위호환). 실험 후 **앱 원복**(변경은 패치로만).
- **선택자 분리 입증(F2 해소)**: `'Google로 가입하기'`(카피) → `signup-provider-google`(앵커).
- **F9 드리프트(라이브 포착)**: 첫 9/9 green이던 email 테스트가 재실행 실패 → 워커1개로도 일관 실패 → 다른 세션이 앱에 **J020 이메일 가입 플로우**를 추가하고 `email` 라우팅을 `결과`→`J020 폼`으로 바꿈. 테스트는 현실에 맞춰 수정하되 **screen-spec 행은 stale → reconcile 필요**로 표면화(조용한 green 금지).
- **종합 보고서**: [docs/research/playwright/dogfood-001-l010.md](../../../docs/research/playwright/dogfood-001-l010.md).
- **최종**: 실험 A(role) 9 + 실험 B(testID) 9 = **18/18**.

---
### 산출물 인덱스
```
maestro-dogfood-001/
├─ .claude/agents/playwright-test-{planner,generator,healer}.md   ← init-agents 실제 생성
├─ .mcp.json                      ← cmd /c 래핑 자동(F1)
├─ playwright.config.ts           ← Expo 웹 :19006 배선, reuseExistingServer
├─ seed.spec.ts                   ← "좋은 seed"(딥링크 진입, 빈 껍데기 교체)
├─ specs/L010.plan.md             ← Planner(대역) 산출 + 사람-게이트 리뷰
├─ tests/web/L010.spec.ts         ← 실험 A(getByRole), 9/9 + F9 드리프트 테스트
├─ tests/web/L010.testid.spec.ts  ← 실험 B(getByTestId), 9/9 (app-testid.patch 전제)
├─ app-testid.patch               ← 앱 testID 변경(원복했으므로 기록만)
└─ run-report.md                  ← 이 문서
```
