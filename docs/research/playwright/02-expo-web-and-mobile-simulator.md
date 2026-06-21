# 보고서 02 — Expo 모바일 시뮬레이터 + Expo 웹에서 Playwright(및 대안)를 잘 돌리기

> Playwright Test Agents 를 우리 frontend-workflow-kit 의 검증 레이어로 끼우기 전에, "어떤 화면 표면을 무엇으로 검증할 수 있는가"를 결정론적으로 못 박기 위한 환경/도구 가이드.
> 한 줄 요약: **Playwright 는 react-native-web(Expo 웹) 빌드만 직접 구동한다. 네이티브 시뮬레이터 E2E 는 Maestro/Detox/Appium 영역이며, "Expo 웹 통과 ≠ 네이티브 통과"이므로 검증을 표면별로 분기해 Verification Matrix 의 `{iOS, Android, Web}` 열로 보내야 한다.**
>
> date: 2026-06-20 · status: draft · 시리즈: 01(Agents 사용법) / **02(이 문서: 환경)** / 03(워크플로우 끼우기)

---

## 0. 이 보고서의 한계와 가장 중요한 정확성 포인트

이 문서 전체를 떠받치는 단 하나의 사실:

> **Playwright 는 네이티브 iOS/Android 앱 UI 를 자동화하지 못한다. 브라우저/WebView 만 구동한다.**

Playwright 메인테이너가 공식 이슈에서 직접 못 박았다([microsoft/playwright#23359](https://github.com/microsoft/playwright/issues/23359)):

> "Playwright is a testing framework for web applications. You can automate WebView on Android as of today, but this is web specific too. **There are no plans as of today to add native mobile app testing.**"

공식 문서의 Android 클래스조차 범위를 웹으로 한정한다([class-android](https://playwright.dev/docs/api/class-android)):

> "Playwright has experimental support for Android automation. This includes **Chrome for Android and Android WebView.**"

설치 문서가 말하는 "native mobile emulation for Chrome (Android) and Mobile Safari"([intro](https://playwright.dev/docs/intro))는 **모바일 웹 환경(UA/뷰포트/터치) 에뮬레이션**이지 네이티브 앱 자동화가 아니다. 이 한 문장을 오해하면 Verification Matrix 의 `iOS`/`Android` 열을 "Playwright 가 통과시켰으니 passed"로 잘못 채우게 된다 — 이는 evidence 위조에 가깝다.

이 킷 관점에서의 함의:

- **Playwright Test Agents(planner/generator/healer)** 는 라이브 브라우저 `page` 컨텍스트 전용이다([test-agents](https://playwright.dev/docs/test-agents)). 따라서 Expo 에서 이들이 만질 수 있는 화면은 **react-native-web 웹 타깃뿐**이다.
- Verification Matrix 의 `Web` 열 evidence 는 Playwright 가 채울 수 있다. `iOS`/`Android` 열 evidence 는 Maestro/Detox/Appium 같은 별도 도구가 채워야 한다.
- 어떤 Case 행을 어떤 도구로 검증할지는 `blocks_mode` 와 함께 결정해야 한다(§7은 (d)에 통합).

---

## (a) 무엇이 가능 / 불가능한가

| 표면(surface) | Playwright 직접 구동 | 무엇으로 검증하나 | 우리 킷에서의 위치 |
|---|---|---|---|
| **Expo 웹 (react-native-web)** | ✅ **직접 가능** — 진짜 DOM, `getByTestId`/`getByRole` 동작 | Playwright (+ Test Agents). Verification Matrix `Web` 열 evidence | `screen-skeleton` 이상에서 `Web` 열 회귀 게이트로 사용 가능 |
| **모바일 웹 뷰포트 에뮬레이션** (`devices['Pixel 5']`, `isMobile`, `hasTouch`) | ⚠️ **프록시로만 가능** — 모바일 *웹* 레이아웃/터치/UA 분기 검증 | Playwright (Chromium/WebKit 기반). **네이티브의 대체재 아님** | 반응형 웹 회귀에만. 네이티브 evidence 로 승격 금지 |
| **네이티브 iOS 시뮬레이터** | ❌ **불가** | **Maestro**(Expo 권장) / Detox / Appium | Verification Matrix `iOS` 열 evidence |
| **네이티브 Android 에뮬레이터** | ❌ **불가** | **Maestro**(Expo 권장) / Detox / Appium | Verification Matrix `Android` 열 evidence |
| **Expo Go / 네이티브 dev client** | ❌ **불가** (네이티브 런타임) | Maestro / Detox / Appium | 위와 동일 |
| **WebView 내부 화면(Android)** | 🧪 **실험적** ([class-android](https://playwright.dev/docs/api/class-android)) | Playwright Android(실험적). 우리 타깃 앱엔 비핵심 | 해당 없음(현재 앱 구조에 WebView 화면 없음) |

핵심 분리 원칙: **Playwright 는 "웹 표면" 책임 경계 안에서만 쓴다.** 같은 화면의 네이티브 동작은 반드시 별도 도구로 커버하고, 이 경계를 문서(verification matrix frontmatter 등)에 명시한다.

---

## (b) Expo 웹 셋업 상세 — react-native-web 을 Playwright 로 돌리기

### b-1. 두 가지 서버 배선: dev server vs export+정적 서버

[verdict: confirmed] Expo 웹은 두 방식 중 하나로 띄워 Playwright `webServer`에 연결한다([expo workflow/web](https://docs.expo.dev/workflow/web/), [test-webserver](https://playwright.dev/docs/test-webserver)):

| 방식 | 명령 | 특징 | 언제 |
|---|---|---|---|
| **Dev server (Metro)** | `npx expo start --web` | 빠른 로컬 반복(HMR). 첫 번들이 느릴 수 있음 | 로컬 TDD, 화면 구현 중 빠른 확인 |
| **정적 export + 정적 서버** | `npx expo export -p web` → `npx serve dist` (또는 `npx expo serve`) | `dist/` 의 **프로덕션 번들**(`__DEV__` 제거, 미니파이). CI-현실적 | CI 게이트, 프로덕션 회귀 |

- 정적 export 산출물은 `dist/` 디렉터리에 생성된다([publishing-websites](https://docs.expo.dev/guides/publishing-websites/)).
- `npx expo serve` 는 `http://localhost:8081` 에서 정적 서빙하되 **HTTP 전용**이라 카메라/지오로케이션 등 secure-context 기능은 동작 안 할 수 있다 — 대부분의 UI E2E 엔 무관하나 권한 게이트 플로우면 주의([publishing-websites](https://docs.expo.dev/guides/publishing-websites/)).
- **CI 함정**: `npx expo export --platform web` 가 완료 후 자체 종료하지 않고 파이프라인을 멈추는 사례가 보고됨([expo/expo#27938](https://github.com/expo/expo/issues/27938)). CI 스크립트에서 타임아웃으로 감싸라.

> [verdict: partially-correct → corrected] 개발 서버 기본 포트는 보통 **8081**(현행 Metro 웹 번들러)이다. 단 레거시 webpack 웹 서버는 **19006** 을 썼고 `--port` 는 Metro 포트를 제어한다. **baseURL 을 하드코딩하기 전에 `npx expo start --web` 을 한 번 띄워 실제 바인딩 포트를 확인하라.** (출처: [expo CLI](https://docs.expo.dev/more/expo-cli/))

### b-2. web.output 모드와 라우팅(expo-router) — 우리 앱은 SPA 가 기본

`app.json` 의 `web.output` 이 정적 서버 배선을 좌우한다([publishing-websites](https://docs.expo.dev/guides/publishing-websites/), [static-rendering](https://docs.expo.dev/router/web/static-rendering/)):

| `web.output` | 산출물 | Playwright 영향 |
|---|---|---|
| `single` (기본) | 단일 `index.html` SPA | 정적 호스트가 **알 수 없는 경로 → index.html 로 rewrite** 해야 함. 안 하면 `page.goto('/coupons/123')` 같은 딥링크가 404. `npx serve` 는 SPA fallback 기본 제공, 순수 http-server 는 미제공 |
| `static` | 라우트별 HTML 파일 | rewrite 불필요. 단 **동적 라우트(`[id].tsx`)는 `generateStaticParams` 로 사전 생성**해야 그 경로로 navigate 가능 |
| `server` | client+server 디렉터리 + API 라우트 | 커스텀 Node 서버 필요 |

우리 타깃 앱은 `src/app/**`(expo-router) 구조다. **`output:'single'` 이면 정적 서버는 반드시 SPA fallback(`serve -s`) 을 써야 `/(tabs)/coupons` 같은 라우트로 직접 진입하는 테스트가 깨지지 않는다.**

### b-3. RNW 매핑: testID → data-testid, accessibility* → ARIA (가장 load-bearing 한 사실)

[verdict: confirmed, 소스 검증] react-native-web 의 `createDOMProps` 가 RN prop 을 DOM 속성으로 그대로 매핑한다([RNW createDOMProps 소스](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/modules/createDOMProps/index.js)):

```js
// react-native-web/src/modules/createDOMProps/index.js (master, 발췌)
if (testID != null) {
  domProps['data-testid'] = testID;           // RN testID -> DOM data-testid
}
const _ariaLabel = ariaLabel != null ? ariaLabel : accessibilityLabel;
if (_ariaLabel != null) {
  domProps['aria-label'] = _ariaLabel;         // accessibilityLabel -> aria-label
}
// role/accessibilityRole -> propsToAriaRole 변환표 거쳐 role 속성
if (role != null) {
  domProps['role'] = role === 'none' ? 'presentation' : role;
}
```

그리고 Playwright `getByTestId()` 의 **기본 속성이 정확히 `data-testid`** 다([locators](https://playwright.dev/docs/locators)). 따라서:

> **`<View testID="coupon-card-123" />` 는 별도 Playwright 설정 없이 `page.getByTestId('coupon-card-123')` 로 잡힌다.**

정밀 주의 2가지(주장 자체는 유효, corrected_statement 기준):
1. `accessibilityRole` 은 **raw passthrough 가 아니다.** 값이 변환표([propsToAriaRole](https://raw.githubusercontent.com/necolas/react-native-web/master/packages/react-native-web/src/modules/AccessibilityUtil/propsToAriaRole.js))를 거친다(예: `header→heading`, `image→img`, `adjustable→slider`). 즉 **속성은 `role` 이지만 값은 RN 네이밍 → ARIA 네이밍으로 remap** 될 수 있고, 표에 없는 role 은 드롭된다.
2. 현행 RNW 는 `role`/`aria-*` 직접 사용을 권장하고 `accessibility*` 는 레거시 back-compat 다([RNW accessibility](https://necolas.github.io/react-native-web/docs/accessibility/)). 둘 다 위 매핑을 만든다.

[verdict: confirmed] `role` 값으로 **시맨틱 HTML 요소를 추론**하기도 한다: `role="article" → <article>`, `role="heading" + aria-level={2} → <h2>`([RNW accessibility](https://necolas.github.io/react-native-web/docs/accessibility/)). 덕분에 `getByRole('heading', { level: 2 })` 가 실제 `<h2>` 를 잡는다. 단 RNW 문서는 role→요소 **전체 매핑표를 주지 않으며**, 대응 요소가 없는 role 은 `<div role="...">` 로 폴백된다(이것도 explicit ARIA role 이라 `getByRole` 에 잡힘).

우리 킷의 screen-spec 은 이미 이 매핑을 전제로 Accessibility 섹션을 쓴다. 예: `examples/coupon-feature/.../coupon-list/screen-spec.md` 의
```
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"
```
→ 웹 빌드에서 `<div role="button" aria-label="...">` 로 렌더되어 `getByRole('button', { name })` / `getByTestId` 로 검증 가능. **즉 screen-spec 의 Accessibility 계약이 곧 Playwright selector 계약이 된다.**

### b-4. ⚠️ selector 안정화 전략 — role='button' 의 함정

[verdict: medium] RNW 가 `role="button"` / `accessibilityRole="button"` 을 **네이티브 `<button>` 이 아니라 `div[role=button]`** 로 렌더해 온 역사가 있다(과거 Firefox flexbox-in-button 버그 우회)([RNW#1899](https://github.com/necolas/react-native-web/issues/1899)). 함의:

- `getByRole('button')` 는 **여전히 매칭된다**(ARIA role 을 질의하지 그 태그를 보지 않음).
- 그러나 **진짜 `<button>` 에 의존하는 동작**(폼 암묵 submit, 네이티브 `disabled` 시맨틱, 기본 키보드 처리)은 다르다.
- 실제 emit 되는 태그는 **RNW 버전에 따라 다르므로** 자기 빌드에서 DOM 을 확인하라.

**권장 selector 정책(이 킷 표준으로 못 박기):**

1. **주 selector = `testID` → `getByTestId`.** ARIA/마크업이 바뀌어도 살아남고, RNW 가 `data-testid` 를 네이티브로 emit 하므로 **Playwright 설정 0**. 리스트 아이템은 합성 ID 로: `` `coupon-item-${id}` `` (재정렬에도 결정적).
2. **`getByRole`/`getByLabel` 은 "접근성 의미 검증"용 보조**로만. 주 후킹 수단으로 쓰지 말 것.
3. **CSS/XPath/nth-child/positional 금지.** DOM 구조 변경에 깨진다([best-practices](https://playwright.dev/docs/best-practices)).
4. **web-first auto-wait assertion 사용.** `await expect(locator).toBeVisible()` (자동 재시도) — `expect(await locator.isVisible()).toBe(true)`(즉시 반환, 대기 없음) 금지([best-practices](https://playwright.dev/docs/best-practices)).
5. `testIdAttribute` 를 **불필요하게 override 하지 말 것.** RNW 가 이미 기본 `data-testid` 를 emit 한다. 의도적으로 속성을 바꾼 게 아니면 그대로 둔다([locators](https://playwright.dev/docs/locators)).

이 정책은 우리 불변식("화면은 AsyncState 계약만 의존")과 충돌하지 않는다 — selector 는 **테스트가 화면에 거는 계약**이지 화면이 TanStack Query 객체를 노출하는 것과 무관하다.

### b-5. playwright.config.ts — Expo 웹 dev server 배선

```typescript
// playwright.config.ts — 로컬 dev server(Metro) 배선
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,        // CI 결정성: 로컬은 0으로 flake 노출
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'blob' : 'html', // blob -> 샤드 merge-reports
  use: {
    baseURL: 'http://localhost:8081',     // Metro 웹 기본; SDK 버전별 실측 확인
    trace: 'on-first-retry',              // 싸고 디버깅 가능. 'on' 금지
    // testIdAttribute 는 기본 'data-testid' 그대로 — RNW 가 testID 를 그렇게 emit
  },
  webServer: {
    command: 'npx expo start --web',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI, // 로컬은 기존 서버 재사용, CI 는 새로 기동
    timeout: 120_000,                     // Metro 첫 웹 번들이 느림
    stdout: 'pipe',
    cwd: __dirname,                       // 모노레포면 앱 패키지로 고정
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

```typescript
// playwright.config.ts — CI: 프로덕션 export + 정적 서빙(SPA fallback)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    // export 후 dist/ 를 SPA fallback(-s)으로 서빙 (web.output:'single' 필수)
    command: 'npx expo export -p web && npx serve dist -s -l 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

RN 컴포넌트 → DOM → selector 대응 한눈에:

```tsx
// 앱 코드(react-native-web)
<Pressable testID="coupon-item-123" role="button" aria-label="신규가입 쿠폰, 6/30 만료">
  <Text>신규가입 쿠폰</Text>
</Pressable>
// 렌더 DOM (RNW): 흔히 <button> 이 아니라 div:
// <div data-testid="coupon-item-123" role="button" aria-label="신규가입 쿠폰, 6/30 만료">...</div>

// 테스트 — 주(가장 안정): testID -> data-testid
await page.getByTestId('coupon-item-123').click();
// 테스트 — 접근성 의미 검증(보조): ARIA role + accessible name
await expect(page.getByRole('button', { name: /신규가입 쿠폰/ })).toBeVisible();
```

### b-6. CI 배선 (GitHub Actions, 샤딩 + 리포트 머지)

[verdict: confirmed] 공식 패턴: 매트릭스 + `--shard=i/n` + blob 리포터 + `merge-reports`([test-sharding](https://playwright.dev/docs/test-sharding), [ci-intro](https://playwright.dev/docs/ci-intro)).

```yaml
name: e2e-web
on: { push: { branches: [ main ] }, pull_request: { branches: [ main ] } }
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest          # Linux 러너가 가장 저렴
    strategy:
      fail-fast: false
      matrix: { shardIndex: [1, 2, 3, 4], shardTotal: [4] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium   # 브라우저 캐시로 비용 절감
      - run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
        # webServer 가 config 에서 Expo 웹을 빌드/서빙
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with: { name: blob-report-${{ matrix.shardIndex }}, path: blob-report/, retention-days: 7 }
  merge-reports:
    if: ${{ !cancelled() }}
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/* }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { path: all-blob-reports, pattern: blob-report-*, merge-multiple: true }
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with: { name: html-report, path: playwright-report, retention-days: 14 }
```

이 잡은 우리 킷의 `workflow:validate`(exit 0/1 CI 게이트)와 **별개의 게이트**다 — Playwright 잡은 `Web` 열 evidence 를 생성하는 검증이지, readiness 판정 로직을 대체하지 않는다(판정 로직은 `readiness.mjs` 한 곳, 불변식). 두 게이트를 같은 CI 워크플로우에 나란히 두되 역할을 섞지 말 것.

---

## (c) 모바일 시뮬레이터 / 네이티브 경로

### c-1. 모바일 웹 디바이스 에뮬레이션 — 효용과 한계

[verdict: partially-correct → corrected] Playwright `devices` 레지스트리는 `viewport`/`userAgent`/`hasTouch`/`deviceScaleFactor`/`isMobile` 을 한 번에 세팅한다([emulation](https://playwright.dev/docs/emulation)). 이건 **모바일 *웹* 레이아웃/터치/UA 분기**를 검증하는 강력한 프록시다. 그러나:

- **무엇이 아닌가**: "Playwright will **simulate** the browser behavior such as userAgent, screenSize, viewport and if it hasTouch enabled"([emulation](https://playwright.dev/docs/emulation)). 즉 **브라우저 수준 시뮬레이션**이지 실제 단말/네이티브 OS 런타임/제스처/네이티브 접근성 트리/네이티브 모듈을 전혀 대표하지 못한다.
- **엔진 제약(정정 포인트)**: `isMobile` 은 **Firefox 에서 미지원**이다 — "Defaults to false and **is not supported in Firefox**"([class-browser](https://playwright.dev/docs/api/class-browser)). **단 원문 도시어의 "WebKit/Firefox 제약"은 부정확하다.** 제약은 **Firefox 전용**이고, **WebKit 은 `isMobile` 을 정상 지원**한다(공식 device 레지스트리의 iPhone 디스크립터가 `isMobile:true` + `defaultBrowserType:webkit`)([deviceDescriptorsSource.json](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/deviceDescriptorsSource.json)). 따라서 **모바일 웹 에뮬레이션은 Chromium 또는 WebKit 프로젝트로 돌려야** 하고, Firefox 프로젝트에 모바일 디스크립터를 붙이면 `isMobile`/터치가 조용히 무시된다.

```typescript
// playwright.config.ts — 모바일 웹 에뮬레이션 프로젝트(react-native-web 반응형 회귀용)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome',  use: { ...devices['Pixel 5'] } },   // Chromium -> isMobile 동작
    { name: 'Mobile Safari',  use: { ...devices['iPhone 13'] } }, // WebKit  -> isMobile 동작
    // 주의: Firefox 프로젝트에 모바일 디스크립터를 써도 isMobile 은 미지원(무시됨)
  ],
});
```

```typescript
// 디스크립터 대신 개별 옵션 세밀 제어
use: {
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; ...) Mobile/15E148',
  hasTouch: true,        // 'Specifies if viewport supports touch events. Defaults to false.'
  isMobile: true,        // meta viewport 반영 + 터치. Firefox 미지원, 기본 false
  deviceScaleFactor: 3,  // dpr, 기본 1
  locale: 'ko-KR', timezoneId: 'Asia/Seoul',
};
```

**선 긋기**: 모바일 웹 에뮬레이션은 "모바일 웹 회귀 테스트"로 유효하나 **"Expo 네이티브 E2E 대체재"로는 부적합**하다. 이 프로젝트의 결과를 Verification Matrix 의 네이티브(`iOS`/`Android`) evidence 로 승격하면 안 된다 — 어디까지나 `Web`(모바일 폼팩터) evidence 다.

### c-2. 진짜 네이티브 E2E — Maestro / Detox / Appium 비교

| 항목 | **Maestro** (Expo 권장) | **Detox** | **Appium** |
|---|---|---|---|
| 방식 | 블랙박스(무계측) | 그레이박스(앱 내부 접근) | 블랙박스(W3C WebDriver) |
| 대상 | RN/Expo/Flutter/네이티브/WebView, iOS·Android | **RN 전용**, iOS(시뮬레이터만)·Android | 범용(native/hybrid/mobile-web), 실기기 포함 |
| 셋업 난이도 | **낮음** — `.maestro/*.yml`, 앱 변경 불필요 | **높음** — `.detoxrc.js` + Android gradle/Java 변경 + 2종 APK 빌드 | **높음** — 드라이버(XCUITest/UiAutomator2) 셋업 |
| 플레이키니스 | **낮음** — 네트워크/애니메이션 settle 자동 대기, `sleep()` 불필요 | 낮음 — 앱 내부 동기화로 sleep 제거(트레이드오프: 테스트≠프로덕션 빌드) | **높음** — 네트워크 왕복 구조, 명시적 대기/리트라이 설계 필수 |
| 언어 | YAML | JS/Jest | 다언어(JS/Java/Python…) |
| iOS 실기기 | 지원(시뮬레이터 권장) | **미지원**(시뮬레이터만) | 지원 |
| Android 권고 | 에뮬레이터/실기기 | **AOSP 에뮬레이터 권고**(Google API 대신) | 에뮬레이터/실기기/클라우드 그리드 |
| CI 친화 | **EAS Workflows 공식 예제** 제공 | gradle/xcodebuild 빌드 잡 | Selenium 그리드/디바이스팜 친화 |
| 출처 | [maestro what-is](https://docs.maestro.dev/get-started/what-is-maestro), [expo e2e](https://docs.expo.dev/eas/workflows/examples/e2e-tests/) | [Detox getting-started](https://wix.github.io/Detox/docs/introduction/getting-started/), [config/devices](https://wix.github.io/Detox/docs/config/devices/) | [Appium intro](https://appium.io/docs/en/latest/intro/appium/) |

**Expo 공식 권장 = Maestro.** Expo 의 테스트 문서가 UI 테스트로 스냅샷 대신 E2E 를 권장하며 **Maestro 를 1차로 지목**한다([unit-testing](https://docs.expo.dev/develop/unit-testing/)); EAS Workflows 예제도 Maestro 기반이고 **Playwright 언급이 없다**([e2e-tests](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)).

> [verdict: partially-correct] 참고로 Lingvano 의 "Maestro + Expo 5단계 + GitHub CI" 튜토리얼([repo README](https://github.com/lingvano/react-native-eas-maestro/blob/main/README.md))은 실재하고 5단계 구조도 정확하지만, **"Expo 공식 가이드가 이를 인용한다"는 attribution 은 1차 출처로 확인되지 않으며**, 그 튜토리얼 자체는 Playwright/웹 경로를 언급하지 않는다(네이티브 전용). 즉 "Maestro 가 Expo 권장"의 근거는 위 Expo 공식 문서이지 Lingvano 튜토리얼이 아니다.

Maestro 최소 예시(우리 킷의 coupon-list screen-spec Acceptance Criteria 가 이미 `maestro/coupon-list.yaml` 을 참조함):

```yaml
# .maestro/coupon-list.yml — 무계측 블랙박스, sleep 불필요(Maestro 가 settle 자동 대기)
appId: com.example.app
---
- launchApp
- assertVisible: '쿠폰'
- tapOn:
    id: 'coupon-item-123'      # RN testID 와 동일 prop (웹/네이티브 공유)
- assertVisible: '쿠폰 상세'
```

```yaml
# EAS Workflows: build 잡 산출물(.apk/.app)을 Maestro 잡으로 체이닝
jobs:
  build_android_for_e2e:
    type: build            # 빌드 프로파일: android.buildType=apk, ios.simulator=true
  maestro_test:
    needs: [build_android_for_e2e]
    type: maestro
    params:
      flow_path: ['.maestro/coupon-list.yml']
```

> [verdict: medium] Maestro CLI 설치는 한 줄 curl 로 보고되나(`curl -fsSL "https://get.maestro.mobile.dev" | bash`) 공식 install 페이지 본문 직접 인용은 확보하지 못했다. **실행 전 [공식 install 페이지](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)에서 한 줄 명령을 재확인하라.**

선택 가이드 요약:

- **기본값 = Maestro.** 가장 빠른 셋업·낮은 플레이키니스·Expo 공식. 대부분의 네이티브 화면 플로우 evidence 는 여기서.
- **Detox = "RN 전용 + 앱 내부 상태 제어/동기화가 꼭 필요"** 할 때만. 네이티브 빌드 통합·iOS 실기기 미지원 비용을 먼저 수용.
- **Appium = "멀티플랫폼/웹뷰 혼합/실기기 클라우드 그리드/언어 자유"** 가 요구사항일 때. 셋업·플레이키니스 비용 최대.

### c-3. 실험적 rn-playwright-driver — 위치만 알아둘 것

[verdict: 도시어 high] "Playwright 멘탈모델로 RN 네이티브"라는 발상의 PoC. Hermes CDP 로 Metro 의 `/json` 디버그 엔드포인트에 붙어 앱 내 `global.__RN_DRIVER__` 하니스를 구동, `getByTestId`/`getByText`/`getByRole`·`evaluate`·screenshot 등 Playwright 호환 API 를 제공한다([0xBigBoss/rn-playwright-driver](https://github.com/0xBigBoss/rn-playwright-driver), Hermes 필수, Node≥18).

**그러나 레포가 2026-06-08 아카이브(read-only)되었다.** → **프로덕션 의존 대상 아님.** 우리 킷에 끼울 후보로 고려하지 말 것. (동일 니즈는 Mobilewright/Appwright 등 대안이 더 활발하다고 보고되나 본 조사 범위 밖이라 성숙도 미검증.)

---

## (d) ⚠️ "Expo 웹 통과 ≠ 네이티브 통과" — 어떤 검증을 어디로 보낼지 결정 가이드

### d-1. 왜 보장이 안 되는가 (방어선 관점)

react-native-web 와 네이티브는 **다른 런타임/렌더러**다:

- 웹은 React DOM 으로 실제 HTML(`<div>`/`<p>`/`<img>`)을 그리고 시맨틱을 `aria-*`/`role`/`data-testid` 로 표현한다([RNW accessibility](https://necolas.github.io/react-native-web/docs/accessibility/)). **같은 `testID`/`role` 을 줘도 네이티브에선 Playwright 가 못 잡는다**(Playwright 네이티브 미지원).
- 제스처(스와이프/롱프레스/관성 스크롤), 네이티브 접근성 트리, 네이티브 모듈(카메라/푸시/생체인증), 키보드 회피, Safe Area, 플랫폼별 네비게이션 애니메이션 — **웹에는 없거나 다르게 동작**한다.
- 따라서 **Playwright 의 green 은 "웹 표면이 동작한다"는 evidence 일 뿐**, iOS/Android 화면이 동작한다는 evidence 가 아니다. 이걸 혼동해 confirmed 승격하면 우리 3차 방어선(사람/Codex 의미·제품 리뷰)이 검출해야 할 회귀를 1차 방어선(스크립트 게이트)이 green 으로 덮어버린다 — **"통과 = 완료가 아니다"의 정확한 사례.**

### d-2. 검증 분기 결정 트리

```
검증할 Case 행이 있다
  │
  ├─ 순수 웹 분기(반응형/UA sniffing/웹 라우팅/SEO 메타)인가?
  │     └─ 예 → Playwright (Desktop + Mobile 에뮬 프로젝트). Verification Matrix: Web 열
  │
  ├─ 플랫폼 무관한 화면 로직(State Matrix 의 loading/empty/error 전이,
  │   Interaction Matrix 의 화면 이동, 카피/접근성 라벨)인가?
  │     └─ 예 → Playwright 로 Web 열 우선 확보(빠른 회귀).
  │            단 동일 Case 를 Maestro 스모크로 iOS/Android 열도 최소 1개 확보(스폿체크)
  │
  ├─ 네이티브 고유(제스처/네이티브 모듈/권한/키보드/Safe Area/딥링크 네이티브 핸들링)인가?
  │     └─ 예 → Maestro(기본) / Detox(앱 내부 상태 필요) / Appium(실기기·멀티플랫폼).
  │            Verification Matrix: iOS / Android 열. Playwright 로는 절대 커버 불가
  │
  └─ 백엔드 오케스트레이션/다단계 stateful/불안정 환경 의존인가?
        └─ Playwright Test Agents(generator/healer)에 맡기지 말 것(공식 비권장).
           결정적 데이터(seed 엔드포인트/격리/사전 시딩)부터 갖춘 뒤 진행
```

### d-3. 우리 킷 매핑 — Verification Matrix 와 screen-spec 으로 고정

이 결정을 "추론"으로 남기지 말고 **파일로 고정**한다(불변식: 추론을 파일로 고정):

1. **Verification Matrix(`docs/frontend-workflow/domains/{domain}/verification/{topic}-matrix.md`)** 에서 Case 행 × `{iOS, Android, Web}` 열로 evidence 를 분리해 기록한다. `Web` 열 evidence 는 Playwright 리포트/trace 링크, `iOS`/`Android` 열 evidence 는 Maestro 플로우 결과 링크. **한 열의 passed 를 다른 열로 복사 금지.**
2. **`blocks_mode`** 로 어떤 Case 가 어떤 모드를 막는지 표기한다. MVP-A 에선 readiness 가 verification 을 직접 게이트하지 않고, **링크된 Open Decision 이 실제 blocker** 다 — 예: "iOS 에서 쿠폰 사용 제스처 동작" Case 가 `failed`/`open` 이면 그걸 가리키는 Open Decision 이 `decision_cap` 으로 readiness 를 다운그레이드.
3. **screen-spec 의 Acceptance Criteria** 에서 테스트로 옮길 항목에 **표면별 테스트 ID 를 명시**한다. coupon-list 예시가 이미 그렇게 한다:
   ```
   - [ ] State Matrix 의 5개 상태가 모두 구현됨 → CouponListScreen.test.tsx   (단위/통합)
   - [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml                   (네이티브 E2E)
   ```
   여기에 **웹 E2E 행을 추가**하면 표면 3축이 명시적으로 갈라진다:
   ```
   - [ ] (웹) 쿠폰 클릭 시 /coupons/[id] 이동 → tests/coupons/coupon-list.spec.ts  (Playwright, Web 열)
   ```
4. **handoff 규칙**: Playwright 가 못 만지는 Case 는 "검증 불가"가 아니라 **"다른 도구로 handoff"** 로 표기한다. Verification Matrix Status 에 `not-applicable`(웹 한정 Case 의 네이티브 열) 또는 `blocked`(네이티브 도구 미구축) 를 정확히 쓴다 — `open` 으로 방치하면 fact-finding 큐가 아니라 실제 게이트가 오작동한다.

### d-4. 한 줄 운영 원칙

> **Playwright 는 `Web` 열을, Maestro(기본)/Detox/Appium 은 `iOS`/`Android` 열을 채운다. 어느 도구의 green 도 confirmed 승격을 자동으로 의미하지 않는다 — confirmed 승격은 사람만 한다(불변식).** Playwright Test Agents 의 healer 가 만든 selector 완화/`test.fixme()` 는 회귀를 덮을 수 있으므로(보고서 01 참조), 그 diff 역시 사람 리뷰를 거쳐 evidence 로 인정한다.

---

## 부록 A. 명령 모음 (실행 전 버전/포트 재확인 전제)

```bash
# Expo 웹 — 로컬 dev server (기본 http://localhost:8081, 실측 확인)
npx expo start --web

# Expo 웹 — 프로덕션 export + 정적 서빙(SPA fallback)
npx expo export -p web            # dist/ 생성 (--output-dir 로 변경). CI 에선 타임아웃으로 감쌀 것
npx serve dist -s                 # web.output:'single' SPA fallback
# 또는: npx expo serve            # dist/ 를 http://localhost:8081 로 (HTTP only)

# Playwright (웹 표면)
npm i -D @playwright/test && npx playwright install --with-deps
npx playwright test
npx playwright test --shard=1/4
npx playwright merge-reports --reporter html ./all-blob-reports
npx playwright show-trace trace.zip            # 또는 trace.playwright.dev 에 드롭(로컬 로드)
npx playwright codegen http://localhost:8081   # role/text/testid 우선 locator 사람이 확인

# Playwright Test Agents (웹/react-native-web 한정) — 보고서 01 참조
npx playwright init-agents --loop=claude       # Playwright 업그레이드마다 재생성

# 네이티브 E2E (Playwright 아님) — 표면별 handoff 대상
maestro test .maestro/coupon-list.yml          # Maestro (Expo 권장). 설치 명령은 공식 페이지 재확인
detox build -c ios.sim.debug && detox test -c ios.sim.debug   # Detox (RN 전용)
appium                                          # Appium 서버 (+ 클라이언트)
```

## 부록 B. 검증 출처(verdict 반영) 핵심 요약

| 주장 | verdict | 이 보고서 반영 |
|---|---|---|
| Playwright 네이티브 미구동 → Expo 는 웹만 직접, 네이티브는 Maestro/Detox/Appium | **confirmed** | §0, (a), (c)·(d) 전체의 토대 |
| RNW `testID→data-testid`, `getByTestId` 동작, `accessibilityLabel/role→aria` | **confirmed**(소스) | (b-3). 단 role 값은 변환표 거침 |
| Playwright Agents 셋업/planner→generator→healer 순서 | **confirmed** | 보고서 01 로 위임, (a)·(d)에서 참조 |
| 디바이스 에뮬레이션은 웹 흉내일 뿐, `isMobile` 엔진 제약 | **partially-correct → corrected** | (c-1): 제약은 **Firefox 전용**, WebKit 지원 |
| Expo 웹을 dev server / export+정적서버로 Playwright 연결 가능 | **confirmed** | (b-1)·(b-5) |
| Lingvano Maestro 튜토리얼이 Expo 공식 가이드에 인용됨 | **partially-correct** | (c-2): attribution 미확인으로 표기, Maestro 권장 근거는 Expo 공식 문서 |
| `seed.spec.ts` 가 fixture/global-setup 과 "별도 라이프사이클" | **partially-correct** | 환경 범위라 깊게 안 다룸(보고서 01 로 위임) |
| Healer `locator.normalize()` 로 best-practice locator 변환 | **partially-correct** | (d-4) 주의로만 언급, 공개 API 문서 미노출·동작 한정 |
