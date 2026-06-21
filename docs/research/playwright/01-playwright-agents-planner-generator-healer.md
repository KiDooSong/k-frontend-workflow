# 01 — Playwright Agents(Planner / Generator / Healer) 잘 쓰는 법

> 한 줄 요약: Playwright의 3종 Test Agent(planner→generator→healer)를 이 킷의 **방어선·readiness·Open Decision·evidence** 모델 위에 얹어, "환각 없이" Expo 웹(react-native-web) E2E 를 결정적으로 굴리는 운영 가이드.
> 날짜: 2026-06-20 · status: draft
> 묶음: 본 보고서(01)는 에이전트 운용에 집중하고, **Expo 웹/네이티브 환경 배선은 02**, **우리 워크플로우 단계별 삽입 지점은 03** 에서 다룬다(중복 최소화, 교차 참조).

---

## 0. 이 보고서가 깔고 가는 전제

Playwright는 **브라우저/WebView만 자동화**한다. Expo 프로젝트에서 Playwright(및 그 위의 Planner/Generator/Healer)가 직접 커버하는 표면은 **react-native-web 웹 빌드 하나뿐**이다. 네이티브 iOS/Android 시뮬레이터 E2E 는 Maestro(Expo 공식 EAS Workflows 권장)/Detox/Appium 영역이며 — Playwright 메인테이너가 [공식 이슈에서 "There are no plans as of today to add native mobile app testing"](https://github.com/microsoft/playwright/issues/23359) 라고 못 박았다. 본 보고서의 모든 절차는 "웹 표면 한정"이라는 책임 경계 위에서 읽어야 한다(환경 배선의 구체는 02).

이 킷의 언어로 번역하면: **Playwright Agents 는 4차 도구가 아니라, 생성된 테스트라는 evidence 를 만들어 내는 기계다.** 통과(green)는 readiness 를 끌어올리지도, Open Decision 을 닫지도, `confirmed` 승격을 일으키지도 않는다. 그 경계는 §9 에서 명시한다.

또한 Test Agents 와 `init-agents` 는 **Playwright v1.56(2025-10)** 에 도입됐다([릴리스 노트](https://github.com/microsoft/playwright/releases/tag/v1.56.0)). 즉 비교적 신생 기능이고, 에이전트 정의가 Playwright 버전과 강하게 결합돼 있어 **업그레이드 때마다 재생성**이 전제다(§2.4).

---

## (a) 3종 개요와 역할 분담

세 에이전트는 [공식 문서](https://playwright.dev/docs/test-agents)상 **독립적으로, 순차적으로, 또는 체이닝된 agentic loop** 로 쓸 수 있다. 표준 순서는 Planner → Generator → Healer.

| 에이전트 | 한 줄 역할 | 입력 | 출력(쓰기 대상) | 핵심 MCP 도구 | 앱 조작 권한 | 모델 |
|---|---|---|---|---|---|---|
| **Planner** | 라이브 앱을 탐색해 사람이 읽는 Markdown **테스트 플랜**을 쓴다 | 자유 텍스트 요청 + seed test + (옵션) PRD | `specs/*.md` | `planner_setup_page`, `browser_*`(navigate/click/type/snapshot), `planner_save_plan` | 있음(탐색용) | sonnet |
| **Generator** | 플랜을 받아 **라이브 앱에 붙어** 각 스텝을 실제 실행하며 locator/assertion을 검증한 뒤 `*.spec.ts`로 직렬화 | `specs/<plan>.md` + seed test | `tests/**/*.spec.ts` | `generator_setup_page`, `browser_*`(+ `browser_verify_*`), `generator_read_log`, `generator_write_test` | 있음(검증용) | sonnet |
| **Healer** | 스위트를 돌려 **깨진 테스트를 자동 복구**(locator/wait/flow 수정), 통과하거나 guardrail이 루프를 끊을 때까지 | 실패하는 테스트 스위트 | 기존 `tests/**`(코드 edit) | `test_run`, `test_debug`, `browser_snapshot/console_messages/network_requests/evaluate`, `browser_generate_locator`, `edit` | **없음(읽기+코드 edit만)** | sonnet |

역할 분담에서 가장 중요한 비대칭 두 가지:

1. **Planner 는 절대 `.spec.ts` 를 쓰지 않는다.** 오직 Markdown 만 만든다. 플랜의 `File:` 경로는 Generator 가 만들 "타깃"일 뿐이다. (이를 "planner가 테스트를 쓴다"고 오해하는 게 흔한 함정 — §8.)
2. **Healer 는 앱을 못 건드린다.** 클릭/타이핑 같은 조작 도구가 빠져 있고 `edit`(코드 수정)과 읽기형 조사 도구만 가진다. 즉 Healer는 "앱 버그를 고치는" 게 아니라 "테스트 코드를 고치는" 에이전트다 — 이 비대칭이 §5의 오버핏 위험의 뿌리다.

이 킷의 **방어선 모델**과의 매핑(개념 문서의 1차/2차/3차 위에 한 층 더):

```txt
[생성 단계]  Planner → Generator         : evidence(테스트 코드)를 만든다 — green 은 "완료"가 아니다
[1차 방어]   결정적 스크립트 가드레일     : workflow:validate / forbidden-paths / test-fixtures (golden)
[2차 방어]   명령(state/readiness/validate): 도구 무관 게이트
[3차 방어]   사람/Codex 의미·제품 리뷰     : confirmed 승격은 사람만 — Healer의 자동수정도 이 라인에서 검토
```

Playwright Agents 는 위 그림에서 **"evidence 생산 라인"** 에 들어가고, Healer 의 출력은 반드시 **3차 방어선(사람 리뷰)** 을 거쳐야 한다(§5, §9).

---

## (b) 셋업

### b.1 init-agents: 명령과 생성물

에이전트 정의는 한 명령으로 생성한다. 클라이언트를 골라 `--loop` 에 넘긴다:

```bash
# 클라이언트 택1. Playwright 업그레이드 때마다 재실행(§b.4)
npx playwright init-agents --loop=claude     # .claude/agents/*.md + .claude/prompts/*.md + .mcp.json + specs/ + tests/seed.spec.ts
npx playwright init-agents --loop=vscode     # .github/agents/*.agent.md + .github/prompts/*.prompt.md + .vscode/mcp.json
npx playwright init-agents --loop=codex      # .codex/agents/*.toml
npx playwright init-agents --loop=opencode   # .opencode/... + opencode.json
```

공통적으로 만들어지는 것:

```txt
specs/                  플랜이 들어갈 디렉터리(아직 비어 있음)
tests/seed.spec.ts      page 컨텍스트 부트스트랩(§b.5) — 세 에이전트가 공유하는 시작 상태
playwright.config.ts    러너 설정(우리는 여기에 Expo 웹 webServer 를 배선 — 02)
.mcp.json (or 동등물)   playwright-test MCP 서버 지정
<클라이언트>/agents/*    planner / generator / healer 정의(지시문 + MCP 도구 목록)
```

세 에이전트가 말하는 MCP 서버는 모두 동일 명령으로 뜬다(클라이언트가 보통 자동 기동):

```bash
npx playwright run-test-mcp-server
# Windows 에서는 cmd 래핑이 필요할 수 있다:
cmd /c npx playwright run-test-mcp-server
```

> 이 킷 레포는 PowerShell(Windows) 환경이 1차이므로, MCP 기동 형태를 `cmd /c …` 로 둬야 하는지 한 번 확인하고 `.mcp.json` 에 박아 두는 것을 권한다.

### b.2 에이전트 정의 파일이란 무엇인가

[공식 문서](https://playwright.dev/docs/test-agents)는 에이전트 정의를 **"collections of instructions and MCP tools"** 라고 정의한다. 각 정의는 YAML frontmatter(`name`, `description`, `model: sonnet`, `color`, `tools:` 목록) + 자연어 지시 본문으로 이뤄진다. 즉 **동작이 모델 가중치가 아니라 레포 안의 텍스트 파일로 정의**되며, 따라서 사람이 직접 편집·버전관리·리뷰할 수 있다(§e 에서 활용).

예) Planner 정의의 골격:

```markdown
---
name: playwright-test-planner
description: Use this agent when you need to create comprehensive test plan for a web application
model: sonnet
color: green
tools:
  - search
  - playwright-test/browser_navigate
  - playwright-test/browser_click
  - playwright-test/browser_snapshot
  - playwright-test/planner_setup_page
  - playwright-test/planner_save_plan
---
1. Navigate and Explore — invoke planner_setup_page once before any other tool; explore the snapshot;
   "Do not take screenshots unless absolutely necessary"
2. Analyze User Flows
3. Design Comprehensive Scenarios (happy path; edge/boundary; error/validation)
4. Structure Test Plans (title; steps; expected outcomes; "always assume blank/fresh state")
5. Create Documentation via planner_save_plan
```

Healer 정의에는 운영상 중요한 **하드 룰**이 본문에 박혀 있다(verbatim 발췌):

```markdown
- If the error persists and you have high level of confidence that the test is correct,
  mark this test as test.fixme() ... Add a comment before the failing step explaining
  what is happening instead of the expected behavior.
- Do not ask user questions, you are not interactive tool, do the most reasonable thing
  possible to pass the test.
- Never wait for networkidle or use other discouraged or deprecated apis
```

이 세 줄이 곧 §5(가드)와 §4(안티-플레이키)의 근거다. "사람에게 질문하지 않는다"는 것은 **승인 게이트가 에이전트 안에 없다**는 뜻이고, 그래서 사람 경계는 **바깥(에디터에서 사람이 호출 → diff 검토 → 머지)** 에서 만들어야 한다.

### b.3 클라이언트별 차이

핵심 MCP 도구 세트는 클라이언트 간 동일하지만, **산출 위치와 호출 래핑**이 다르다:

| 클라이언트 | 에이전트 정의 위치 | 프롬프트/모드 | MCP 설정 | 비고 |
|---|---|---|---|---|
| claude | `.claude/agents/playwright-test-*.md` | `.claude/prompts/*.md`(frontmatter `agent:`) | `.mcp.json` | 도구가 `mcp__playwright-test__browser_*` 로 네임스페이스 |
| vscode/copilot | `.github/agents/*.agent.md` (또는 `.github/chatmodes/*`) | `.github/prompts/*.prompt.md` | `.vscode/mcp.json` | **VS Code v1.105+(2025-10-09)** 필요 |
| codex | `.codex/agents/*.toml` | — | (codex 설정) | `edit` 보유 단계(generator/healer)는 `sandbox_mode='workspace-write'`, planner 는 `read-only` 로 자동 분기 |
| opencode | `.opencode/prompts/...` | — | `opencode.json` | — |

우리 레포는 이미 `.claude/`(정본)와 `.codex/`(로컬 호환 래퍼) 를 함께 쓰는 패턴이다(루트 `AGENTS.md` 참조). Playwright 에이전트도 같은 관례를 따르되, **`.codex/` 산출물은 git 무시 대상**으로 두고 `.claude/` 를 source of truth 로 삼는 게 레포 컨벤션과 일관된다.

### b.4 재생성 시점(언제 다시 `init-agents` 하나)

[공식 문서 verbatim](https://playwright.dev/docs/test-agents): 에이전트 정의는 **"should be regenerated whenever Playwright is updated to pick up new tools and instructions."**

이게 빈말이 아니라는 실증: 실제로 도구명이 바뀐 적이 있다(`playwright_test_run_test` → `test_run`, `playwright_test_debug_test` → `test_debug`). 구버전 정의를 그대로 두면 Healer가 **"존재하지 않는 MCP 도구"** 를 참조해 깨진다([이슈 #37789](https://github.com/microsoft/playwright/issues/37789)).

운영 규칙(이 킷의 멱등·결정성 사상과 정합):
- Playwright 의존성 bump 를 **하나의 PR** 로 묶고, 그 PR 안에서 `npx playwright init-agents --loop=<client>` 를 다시 돌려 **에이전트 정의 diff 를 함께 리뷰**한다.
- 재생성 산출물(`.claude/agents/*` 등)을 **커밋**해 팀 전체가 동일 정의를 쓰게 한다(정의 드리프트 방지).
- 플랜 재생성은 별개 정책이다 — 정의는 "Playwright 업그레이드 시", 플랜(`specs/*.md`)은 "앱 플로우/UI가 실질적으로 바뀌었을 때"이며, 소수 플로우만 바뀌면 플랜 전체 재생성 대신 손으로 편집하는 편이 싸다(§c.1).

### b.5 seed test 의 역할

`tests/seed.spec.ts` 는 **일반 테스트가 아니다.** Planner/Generator 가 MCP 도구(`planner_setup_page` / `generator_setup_page`)를 통해 **직접 실행**해, 탐색·검증의 출발 page 컨텍스트를 만든다. 공식 문서상 seed 실행은 **global setup, project dependencies, 그리고 필요한 모든 fixtures 와 hooks 를 포함한 초기화를 수행**하고, 그렇게 만든 **"ready-to-use page context"** 를 다른 에이전트가 물려받는다.

> 정밀화(도시에 verdict 반영): "seed 가 fixture/global-setup 과 **별도 라이프사이클**"이라는 표현은 부정확하다. seed 는 그것들을 **우회하는 게 아니라 실행(invoke)하는 메커니즘**이다. 정확히는 "러너의 **일반 테스트 실행 흐름(HTML 리포트 통합·기본 trace 기록 등)** 과는 분리돼 돌지만, fixture/global-setup 과 분리된 것은 아니다(오히려 그 안에서 그것들을 실행)"가 맞다. `generator_setup_page` 의 핸들러는 소스상 `getOrCreateSeedFile(...)` → `runSeedTest(...)` 를 호출하며, seed 가 없으면 **빈 기본 seed 를 자동 생성**한다.

기본 생성 seed 는 사실상 빈 껍데기다:

```typescript
// tests/seed.spec.ts (init-agents 가 만드는 기본형 — 이대로 두면 안 된다)
import { test, expect } from '@playwright/test';
test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    // generate code here.
  });
});
```

**좋은 seed 작성법(이게 곧 플랜·생성물 품질의 상한선이다 — "Agents copy what they see"):**

```typescript
// tests/seed.spec.ts (권장형) — 프로젝트 fixtures 에서 import
import { test, expect } from './fixtures';        // @playwright/test 직접 import 금지
test('seed', async ({ page }) => {
  // 여기서 page 가 "원하는 시작 상태"가 되도록 만든다:
  //  - 인증 세션(로그인 완료) — storageState 주입(§4.4)
  //  - 필요한 피처 플래그 ON
  //  - 정확한 시작 라우트로 이동(Expo 웹 baseURL 기준)
  //  - 결정적 테스트 데이터(시드/팩토리)
});
```

원칙:
- **빈 seed 금지.** 빈 seed 면 에이전트가 비인증·빈 상태의 앱을 탐색해 "엉뚱한 플로우"를 계획/생성한다(§8 함정).
- 인증/데이터/플래그는 seed(또는 그 fixtures/global-setup)에 둔다. 모호한 플로우(로그인/결제/2FA)일수록 seed 로 컨텍스트를 충분히 줘야 Healer 의 비대화형 "강행 수정"이 빗나가지 않는다.
- Expo 웹 한정이므로, seed 의 `page.goto` 기준 URL 은 **react-native-web dev server / export 서버**여야 한다(배선은 02).

---

## (c) 각 에이전트를 잘 쓰는 운영 절차

### c.1 Planner — 좋은 입력과 플랜 리뷰

**Planner 에 주는 3가지 입력**([공식](https://playwright.dev/docs/test-agents)):
1. **명확한 요청** — "guest checkout 플랜 만들어줘"처럼 **단일 코히어런트 플로우**. "앱 전체 플랜"은 금물.
2. **seed test** — §b.5 의 준비된 page.
3. **(옵션) PRD** — 도메인 컨텍스트. (단, "PRD 를 실제로 어떻게 먹이는가"는 클라이언트별로 문서화가 부족 — 파일 경로/붙여넣기/@-멘션 중 무엇인지 hands-on 확인 필요.)

Claude Code 에서의 1-shot 호출 형태:

```markdown
# .claude/prompts/playwright-test-plan.md
---
agent: playwright-test-planner
description: Create test plan
---
Create a test plan for the coupon list screen of my app.
- Seed file: `tests/seed.spec.ts`
- Test plan: `specs/coupon-list.plan.md`
- Test plan should contain around 12 tests.        # ← 시나리오 개수/깊이는 프롬프트로 조종
- Include negative/edge cases: empty list, expired-only, network error + retry.
```

**Planner 입력 베스트프랙티스(Expo + 이 킷 맥락):**
- **스코프를 화면/플로우 단위로 좁힌다.** 에이전트 지시 자체가 "시나리오는 독립적·임의 순서 실행 가능"을 요구하므로, 좁은 단일 목적 suite 가 생성·치유 모두 훨씬 안정적이다. 이 킷에서는 **screen-spec 한 장(또는 한 도메인)** 이 자연스러운 단위다.
- **개수와 음성(negative) 케이스를 프롬프트로 명시.** happy path 만 나오지 않게 "empty/whitespace/validation-error"를 콕 집는다. screen-spec 의 **State Matrix(loading/success/empty/error/refreshing)** 와 **Interaction Matrix** 가 그대로 시나리오 소스가 된다 — Planner 요청에 "State Matrix 의 5개 상태를 모두 커버"를 넣으면 evidence 가 spec 과 1:1 로 정렬된다.
- **모든 expect 를 관찰 가능한 구체 문자열로.** "동작한다" 대신 "카운터가 '1 item left' 로 바뀐다", "URL 이 `/coupons/[id]` 로 바뀐다". 이 킷의 Copy Keys 표(예: `coupon.list.empty`)가 확정 문구를 제공한다면 그 문자열을 expect 에 그대로 쓰게 한다.
- **step 은 사용자 의도 언어로, 셀렉터 금지.** "쿠폰 카드를 누른다" 라고 쓰고 CSS/XPath 는 쓰지 않는다(Generator 가 라이브로 실제 locator 를 해석).

생성되는 플랜은 결정적 구조의 Markdown 이다(`planner_save_plan` 이 고정 직렬화):

```markdown
# Coupon List Test Plan
## Application Overview
<overview>
## Test Scenarios
### 1. Coupon List
**Seed:** `tests/seed.spec.ts`
#### 1.1. should-show-empty-state
**File:** `tests/coupon-list/should-show-empty-state.spec.ts`
**Steps:**
  1. Navigate to the coupon list
    - expect: The empty state message is visible
    - expect: No coupon cards are rendered
```

**플랜 리뷰 = "코드 리뷰처럼" (사람 게이트):** 플랜은 plain Markdown 이고 구조가 엄격하므로 손으로 고치는 게 싸다. Generator 에 넘기기 **전에**:
- 스코프 밖 테스트 삭제, `File:` 경로 정리,
- 모호한 expect 를 관찰 가능한 문장으로 날카롭게,
- 빠진 edge/error 케이스 추가,
- screen-spec 의 **Acceptance Criteria** 항목과 대조(예: coupon-list 의 "State Matrix 5개 상태 구현 → `CouponListScreen.test.tsx`").

이 "플랜 휴먼 게이트"는 잘못된 테스트를 나중에 Healer 로 치유하는 것보다 훨씬 저렴하다. **이 킷에서 플랜 리뷰는 곧 작은 evidence 설계 리뷰**이며, 03 에서 보듯 ScreenSpec 의 Acceptance Criteria/Interaction Matrix 와 양방향으로 맞춰야 한다.

### c.2 Generator — 안정적 locator 를 뽑게 하는 법과 생성물 리뷰

Generator 는 **추측 생성이 아니라** 라이브 앱에 붙어 각 스텝을 실제 수행하며 locator/assertion 을 검증한 뒤 코드로 직렬화한다. 워크플로: `generator_setup_page`(seed 실행) → 각 스텝을 `browser_*` 로 실시간 실행(스텝 텍스트를 intent 로 사용) → `generator_read_log` → 즉시 `generator_write_test`.

생성물 골격(공식 출력 형식):

```typescript
// spec: specs/coupon-list.plan.md
// seed: tests/seed.spec.ts
import { test, expect } from './fixtures';   // 권장: 커스텀 fixtures (직접 @playwright/test import 지양)

test.describe('Coupon List', () => {          // describe = 플랜 최상위 항목
  test('should show empty state', async ({ page }) => {   // 타이틀 = 시나리오명
    // Navigate to the coupon list                         // 스텝 텍스트 = 주석 intent
    await page.goto('/(tabs)/coupons');
    // Verify empty state (web-first assertion: 자동 재시도)
    await expect(page.getByTestId('coupon-list-empty')).toBeVisible();
  });
});
```

헤더의 `// spec:` / `// seed:` 는 **어떤 플랜/seed 에서 나왔는지 기록하는 메타데이터 주석**일 뿐 런타임 동작을 트리거하지 않는다 — 그러나 이 1:1 provenance 덕에 evidence 추적이 된다(어떤 테스트가 어떤 플랜 항목에서 왔는지).

**locator 안정성: getByRole 우선, getByTestId 폴백.** Playwright 권장 우선순위는 `getByRole` > `getByText` > `getByLabel` > `getByPlaceholder` > `getByAltText` > `getByTitle` > `getByTestId`. 그러나 **Expo(react-native-web) 에서는 실무상 `getByTestId` 를 1차 안정 셀렉터로 둔다.** 이유:

- react-native-web 의 `createDOMProps` 가 RN 의 `testID` 를 **그대로 DOM `data-testid` 로** 내보낸다(소스 verbatim: `if (testID != null) { domProps['data-testid'] = testID; }`). Playwright `getByTestId` 의 기본 속성이 `data-testid` 이므로 **설정 0으로 `page.getByTestId('coupon-list-empty')` 가 `<View testID="coupon-list-empty">` 를 잡는다.**
- 반면 `role="button"`(Pressable/TouchableOpacity)은 RNW 가 역사적으로 **네이티브 `<button>` 이 아니라 `div[role=button]`** 으로 렌더한 사례가 있어, `getByRole('button')` 은 ARIA role 로는 매칭되지만 네이티브 버튼 동작(암묵적 submit 등)은 다를 수 있다([RNW #1899](https://github.com/necolas/react-native-web/issues/1899)). 그래서 버튼류는 testID 로 잡는 게 안전하다.

다만 `getByTestId` 남용은 **접근성 회귀를 못 잡는다**(user-facing 아님). 그래서 정책은 "기본 hook 은 testID, **접근성이 의미 있는 단언**(role+accessible name)은 `getByRole`" 의 2층 구조다. 이 킷의 screen-spec 은 이미 **Accessibility 섹션**에서 `accessibilityRole="button"`, `accessibilityLabel="{title}, {만료일}"` 를 요구한다 — 컴포넌트에 그 props 가 있으면 RNW 가 `role`/`aria-label` 로 내보내 `getByRole('button', { name })` 이 작동한다(RNW 의 `role` 값은 [analogous HTML 요소로 추론](https://necolas.github.io/react-native-web/docs/accessibility/)되며, ARIA 매핑 세부는 02 에서). **결론: 컴포넌트에 `testID` + `accessibilityRole`/`accessibilityLabel` 둘 다 심어야 Generator 의 role-우선·testID-폴백 전략이 Expo 웹에서 성립한다.**

Generator 가 안정적 코드를 뽑게 만드는 레버(우선순위 순):
1. **모범 seed/fixture/POM 을 먼저 깐다.** 에이전트는 본 패턴을 복제한다 — seed 가 role 기반 locator·POM·안정 데이터를 보여주면 생성물도 그렇게 나온다.
2. **컨벤션을 명문화해 주입한다**(§e): "생성물은 `./fixtures` 에서 import, `@playwright/test` 직접 import 금지", "인라인/positional 셀렉터 금지, POM 메서드 사용", "web-first assertion 사용", "nth-child·긴 CSS 체인 금지".
3. **쓰기 권한을 디렉터리로 제한**: 생성물은 `tests/generated/`(또는 합의된 경로)만, `tests/fixtures/`·`tests/pages/` 는 수정 불가. 이 킷의 **forbidden-paths backstop** 사상과 정확히 같은 결이다 — "에이전트가 만질 수 있는 경로"를 결정적으로 못 박는다.
4. **결정적 데이터 상태**: factory/seed 엔드포인트로 사전 시딩, 테스트 간 데이터 격리, 일관된 UI 타이밍. 라이브 검증 단계가 흔들리면 생성물도 흔들린다.

POM 을 fixture 로 주입해 인라인 셀렉터를 막는 패턴:

```typescript
// tests/fixtures.ts — 생성 테스트는 이 './fixtures' 에서 import
import { test as base, expect } from '@playwright/test';
import { CouponListPage } from './pages/CouponListPage';
export const test = base.extend<{ coupons: CouponListPage }>({
  coupons: async ({ page }, use) => { await use(new CouponListPage(page)); },
});
export { expect };

// tests/pages/CouponListPage.ts — testID/role 기반 locator 캡슐화
export class CouponListPage {
  constructor(private page: import('@playwright/test').Page) {}
  readonly empty = () => this.page.getByTestId('coupon-list-empty');
  async goto() { await this.page.goto('/(tabs)/coupons'); }
}
```

**생성물 리뷰 = "주니어 PR" 취급(사람 게이트).** 머지 전 반드시:
- **selector 품질**: role 우선/ testID 폴백인가? `nth-child`·positional·긴 CSS 체인 섞였나?
- **fixture/POM 준수**: `@playwright/test` 직접 import 로 fixture 를 우회했나?
- **assertion 이 web-first 인가**: `expect(locator).toBeVisible()` 인가, 아니면 즉시 반환되는 `isVisible()` 인가(§4).
- **스코프 크리프 / 외부 의존**: 서드파티 사이트에 붙는 테스트가 섞였나?

> ⚠ **비결정성 주의:** 같은 플랜+같은 앱이라도 LLM 특성상 **생성 코드가 실행마다 달라질 수 있다**(선택 locator·구조·주석). 그래서 생성물은 **반드시 커밋해 버전관리하고 diff 를 리뷰**해야 하며, "재현 가능한 산출물"로 무비판 신뢰하면 안 된다. 이 비결정성은 이 킷의 **결정적 가드레일(멱등 생성기) 과 정반대 성질**이다 — 그래서 Playwright 테스트는 "가드레일"이 아니라 "리뷰 대상 evidence" 로 분류해야 한다(§9).

### c.3 Healer — 언제/어디서 돌리고, 자동수정 오버핏을 막는 가드

**Healer 의 7단계 워크플로(소스 verbatim):** ① `test_run` 으로 전체 실행해 실패 식별 → ② 각 실패를 `test_debug` 로 디버그 → ③ 에러에서 일시정지하면 스냅샷/콘솔/네트워크로 컨텍스트 파악 → ④ 근본원인 4분류(셀렉터 변경 / 타이밍 / 데이터 의존 / 앱 변경) → ⑤ 코드 수정(셀렉터 갱신, assertion 수정, **동적 데이터는 정규식 locator**) → ⑥ 재시작 검증 → ⑦ 통과까지 반복. 무한 재시도는 **guardrail("guardrails stop the loop")** 이 끊는다.

**언제/어디서 돌리나 — 로컬/PR 에서, CI 무인 자동수정 금지.**
- [공식 워크플로우는 "에디터 안 대화형"](https://playwright.dev/docs/test-agents) 이 1차다. **CI 무인 자동수정 모드는 공식 가이드가 없다**(도시에 verdict: confirmed — test-agents 문서에 unattended/pipeline/auto-commit 관련 지침 자체가 없음).
- 따라서 **개발자-in-the-loop**: 로컬 또는 PR/피처 브랜치에서 Healer 호출 → 제안된 셀렉터/wait/flow 수정을 **PR diff 로 검토** → 머지.
- **CI 잡 자체에서는 라이브 자가치유 대신 결정적 retries + trace 에 의존**한다(§4). CI 에서 generator/healer 가 라이브 앱(MCP)에 붙으면 LLM/타이밍에 따라 같은 입력에도 다른 패치가 나와 재현성이 깨진다.

Healer 호출(태스크 프롬프트 전문):

```markdown
# .claude/prompts/playwright-test-heal.md
---
agent: playwright-test-healer
description: Fix tests
---
Run all my tests and fix the failing ones.
```

**자동수정 오버핏을 막는 가드(가장 중요한 절):**

Healer 의 1차 목표는 "**pass**"다. 그래서 **진짜 회귀(앱 버그)** 도 assertion 을 완화하거나 더 느슨한 locator 로 바꿔 "통과"시킬 수 있다 — 즉 **green 이 정상이라는 보장이 아니다.** 가드:

1. **Healer 가 만든 변경은 항상 사람이 `git diff` 로 검토.** 특히 집중해서 볼 3가지:
   - **(a) assertion 기대값 완화** — "확정 배너가 보인다" → "아무 텍스트나 보인다" 류로 약해졌나?
   - **(b) 정규식 locator 치환** — 동적 데이터 대응으로 정당할 수 있으나, 너무 헐거워졌나?
   - **(c) `test.fixme()` 추가** — 이건 **복구 실패를 사람에게 넘긴 신호**다. 반드시 PR 에서 트리아지.
2. **`test.fixme()` 사일런트 커버리지 손실을 색출.** Healer 가 "테스트가 맞다는 확신"으로 fixme 처리하면 그 시나리오는 조용히 실행에서 빠지고, 주석만 남는다. 놓치면 **깨진 기능이 green 으로 보인다.**

   ```typescript
   // Healer 가 복구 불가로 판단하면 이렇게 남긴다 — 실제 회귀 신호일 수 있다(트리아지 대상)
   test.fixme('checkout shows confirmation', async ({ page }) => {
     // NOTE(healer): expected confirmation banner to be visible, but the page
     // stays on the payment step and no banner appears. Healing skipped.
     await expect(page.getByRole('status')).toContainText('Order confirmed');
   });
   ```

   ```bash
   # PR 리뷰 루프(이 킷의 "검사 = 명령" 사상에 맞춰 결정적으로):
   git diff -- tests/                     # Healer 변경 전수 검토
   git grep -n 'test.fixme(' -- tests/    # 자동 스킵 색출 → 전부 트리아지
   ```
3. **변경 범위를 좁게 잠근다.** Codex 루프의 `workspace-write` 또는 claude 의 `edit` 권한으로 Healer 가 **공용 헬퍼/픽스처까지 넓게** 고치면 다른 테스트로 회귀가 전파된다. 워크스페이스를 **테스트 디렉터리만 쓰기 가능**하게 좁히고 앱 소스는 못 건드리게 한다.
4. **"앱이 의도적으로 바뀜(리팩터/리디자인)" vs "앱이 깨짐(회귀)"을 분리.** 전자에서만 Healer 로 셀렉터를 따라가게 하고, 회귀가 의심되면 **Healer 실행 전에 사람이 앱 버그를 먼저 수동 확인**하는 게이트를 둔다.
5. **`guardrails stop the loop` 을 "품질 보장"으로 오해 금지.** guardrail 은 무한 재시도를 끊는 **종료 장치**일 뿐, "좋은 수정"을 보장하지 않는다. 멈췄다고 수정이 옳은 게 아니다.

> 이 가드 세트는 이 킷의 **"validate 통과 ≠ 제품적 올바름"** 명제의 Playwright 판이다. Healer 의 green 은 evidence 가 갱신됐다는 뜻이지, 제품이 옳다는 판정이 아니다. 판정은 **3차 방어선(사람/Codex 리뷰)** 가 한다.

---

## (d) 안티-플레이키 베스트프랙티스

플레이키니스는 **설정 레벨**에서 잡는다(Healer 의 라이브 치유로 때우지 않는다). 핵심 4종:

### d.1 web-first auto-wait assertion (sleep/networkidle 금지)

`expect(locator).toBeVisible()` 같은 web-first assertion 은 **조건 충족까지 자동 재시도**한다. 반면 `expect(await locator.isVisible()).toBe(true)` 는 **즉시 반환**되어 대기하지 않는다 — 생성물이 후자를 쓰면 플레이키하다(리뷰에서 교정). 또한 Healer 정의가 **"Never wait for networkidle"** 를 못 박았으니, 대기 문제는 `networkidle`/하드코딩 `sleep` 이 아니라 auto-wait locator 로 수렴시킨다.

```typescript
// 권장
await expect(page.getByText('Welcome')).toBeVisible();
// 지양 — 자동 재시도 없음
expect(await page.getByText('Welcome').isVisible()).toBe(true);
```

### d.2 retries + d.3 trace (CI 결정성의 핵심)

```typescript
// playwright.config.ts (발췌 — Expo 웹 webServer 전체 배선은 02)
import { defineConfig } from '@playwright/test';
export default defineConfig({
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,        // CI 결정성↑; 로컬은 0으로 두어 flake 가 즉시 드러나게
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: 'http://localhost:8081',     // Metro 웹 기본(SDK 버전별 확인 — 02)
    trace: 'on-first-retry',              // 'on' 금지(무겁고 아티팩트 폭증); 첫 재시도에만 기록
    testIdAttribute: 'data-testid',       // RNW testID → data-testid 와 일치(기본값이라 사실 생략 가능)
  },
});
```

- `retries: CI ? 2 : 0` — 실패 시 워커를 폐기하고 새 워커에서 재실행; 실패→통과면 "flaky" 로 마킹돼 가시화된다. **로컬 0** 으로 두는 게 핵심: flake 를 숨기지 않고 드러낸다.
- `trace: 'on-first-retry'` — CI 권장. 스크린샷/DOM 스냅샷/네트워크/콘솔/액션 로그를 캡처. `npx playwright show-trace trace.zip` 또는 `trace.playwright.dev` 에 드롭(로컬 로드, 업로드 없음)으로 연다.
- `fullyParallel: true` — 개별 테스트까지 병렬화하고 샤딩도 균형 있게 쪼갠다. `test.describe.serial` 남용은 격리를 깨고 retries 가 그룹 전체를 재실행하게 만들어 지양.

### d.4 storageState 로 인증 1회만 (격리 + 속도)

`setup` 프로젝트가 1회 로그인해 `storageState` JSON 을 쓰고, 다른 프로젝트가 `dependencies` + `use.storageState` 로 소비한다. **에이전트 루프에서는 이 인증 부트스트랩을 seed.spec.ts 에 둔다**(planner/generator/healer 가 모두 로그인 상태로 동작).

```typescript
// tests/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
const authFile = 'playwright/.auth/user.json';
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_USER!);     // CI secrets 에서
  await page.getByLabel('Password').fill(process.env.E2E_PASS!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.context().storageState({ path: authFile });           // 다른 프로젝트가 재사용
});
```

> 🔒 **`playwright/.auth` 는 반드시 `.gitignore`.** 이 JSON 은 **실세션 쿠키/헤더(계정 가장 가능)** 를 담는다. 절대 커밋하지 말고 CI secrets 에서 재생성한다.

---

## (e) AGENTS.md / 프로젝트 컨텍스트로 에이전트 품질 올리기

에이전트 정의가 텍스트라는 점을 활용해 **두 채널**로 컨텍스트를 주입한다:

1. **생성된 에이전트 `.md` 직접 편집** — planner 탐색 전략, generator 코드 스타일, healer 의 UI 드리프트 허용도를 손본다. (재생성 시 덮어쓰이므로, 재생성 PR 에서 diff 를 보고 커스터마이즈를 다시 얹는다.)
2. **`AGENTS.md`/`CLAUDE.md` 에 프로젝트 규칙** — 비즈니스 규칙, 컨벤션, "생성물은 `./fixtures` import / 인라인 셀렉터 금지 / web-first assertion / testID 우선" 같은 코딩 규약. (단, **어떤 `--loop` 클라이언트가 실제로 무엇을 읽는지**는 검증 필요 — `.claude/CLAUDE.md` vs `AGENTS.md` vs 생성된 `*.agent.md`. 도시에상 confidence low.)
3. **(옵션) Skill 로 컨벤션 인코딩** — 서드파티지만 [Currents 의 Playwright Best Practices Skill](https://github.com/currents-dev/playwright-best-practices-skill) 이 실재한다: `npx skills add https://github.com/currents-dev/playwright-best-practices-skill`. POM, 커스텀 fixture, web-first/auto-retrying assertion 을 명시적으로 다루며 공식 Playwright 권장과 부합한다(공식 Microsoft 제공물은 아님 — 벤더 산출물임에 유의).

이 킷 레포 정합: 우리 루트 `AGENTS.md` 는 이미 "skill 매칭 시 `SKILL.md` 부터 끝까지 읽어라", "Open Decision/사람 게이트는 사용자 명시 요청 없이 닫지 말라"를 규정한다. **Playwright 에이전트용 규칙도 같은 `AGENTS.md` 에 한 섹션으로 추가**해, "Healer 출력은 PR 리뷰 필수 / 생성 테스트는 evidence 이지 confirmed 근거 아님 / forbidden 경로 밖만 쓰기"를 명문화하면 레포 컨벤션과 일관된다.

---

## (f) 흔한 함정과 체크리스트

### f.1 흔한 함정(우선순위 순)

1. **Playwright 로 Expo 네이티브를 테스트하려는 시도** — 시뮬레이터 네이티브 UI 는 구동 불가. "mobile app 플랜"을 네이티브 빌드로 Planner 에 시키는 건 category error. 웹(react-native-web)만 커버.
2. **seed 빈약/빈 seed** — 빈 seed 면 비인증·빈 상태에서 잘못된 플로우를 계획/생성. 인증/플래그/데이터를 seed 에.
3. **Healer 를 CI 무인 자동수정으로 머지** — 회귀를 느슨한 셀렉터/assertion 으로 덮을 수 있다. PR 게이트 필수.
4. **생성 테스트를 "진실원천"으로 취급** — spec(+제품 요구)이 의도, 테스트는 evidence. generator 는 오후 한나절에 ~200개를 쏟아내 CI 시간·flake 예산을 폭증시킬 수 있다 — 큐레이션 필수.
5. **업그레이드 후 에이전트 정의 미재생성** — 도구명 드리프트(`test_run` 등)로 Healer 가 깨진다([#37789](https://github.com/microsoft/playwright/issues/37789)).
6. **플랜 step 에 CSS/XPath 박기** — 플랜은 셀렉터-프리(의도+expect)여야 한다. 셀렉터를 박으면 라이브 해석과 충돌.
7. **"planner 가 테스트를 쓴다" 오해** — planner 는 Markdown 만. `.spec.ts` 는 generator.
8. **`getByRole('button')` 이 네이티브 `<button>` 이라 가정** — RNW 는 종종 `div[role=button]`. 버튼류는 testID 로.
9. **`getByTestId` 가 설정 없이 안 될 거라 가정 / 반대로 `testIdAttribute` 불필요 오버라이드** — RNW 가 이미 `data-testid` 를 내보내므로 기본값으로 작동. 의도 없이 오버라이드하면 오히려 깨진다.
10. **VS Code 버전 게이트 망각** — agentic UX 는 **v1.105+** 필요.
11. **web-first assertion 미사용 / `networkidle`·`sleep` 의존** — flaky. auto-wait 로 수렴.
12. **storageState/auth JSON 커밋** — 세션 탈취 위험. gitignore.
13. **MCP `browser_run_code_unsafe` 활성** — RCE-equivalent. 비신뢰 에이전트 클라이언트엔 비활성, CI 에선 `--isolated`, 비프로덕션 단기 크리덴셜만.

### f.2 운영 체크리스트(복붙용)

```txt
[셋업]
[ ] init-agents --loop=<client> 산출물 커밋(.claude/agents/* 등), .codex/* 는 gitignore
[ ] MCP 기동 형태 확인(Windows: cmd /c npx playwright run-test-mcp-server)
[ ] seed.spec.ts: 빈 껍데기 아님 — 인증/플래그/시작라우트/데이터 채움, ./fixtures import
[ ] playwright.config: baseURL=Expo 웹 서버, retries(CI?2:0), trace=on-first-retry, fullyParallel
[ ] playwright/.auth → .gitignore, E2E_USER/E2E_PASS 는 CI secrets

[Planner]
[ ] 요청은 단일 화면/플로우(screen-spec 1장 단위), 개수+negative 케이스 명시
[ ] State Matrix(5상태)/Interaction Matrix 를 시나리오 소스로 지정
[ ] 플랜 리뷰(사람): 스코프밖 삭제 / File경로 / expect 구체화 / Acceptance Criteria 대조

[Generator]
[ ] 컴포넌트에 testID + accessibilityRole + accessibilityLabel 둘 다 존재
[ ] 컨벤션 주입: ./fixtures import, 인라인/positional 셀렉터 금지, web-first assertion
[ ] 쓰기 경로 제한(tests/generated/ 만), fixtures/pages 수정 불가
[ ] 생성물 리뷰(주니어 PR): selector 품질 / POM 준수 / assertion web-first / 스코프크리프
[ ] 생성물 커밋 → diff 리뷰(비결정성 대비)

[Healer]
[ ] 로컬/PR 에서만 실행, CI 무인 자동수정 금지
[ ] git diff -- tests/ 로 (a)assertion 완화 (b)정규식 locator (c)test.fixme() 집중 검토
[ ] git grep 'test.fixme(' 전수 트리아지(사일런트 커버리지 손실)
[ ] 회귀 의심 시 Healer 전에 앱 버그 수동 확인

[업그레이드]
[ ] Playwright bump PR 안에서 init-agents 재실행 + 에이전트 정의 diff 리뷰
```

---

## (g) 거버넌스: "테스트는 evidence 이지 진실원천이 아니다"

이 킷의 3차 방어선·"통과 = 완료가 아니다"·"confirmed 승격은 사람만" 원칙을 Playwright Agents 에 그대로 적용한다:

- **진실원천(source of truth)은 플랜/요구가 아니라 screen-spec + 제품 요구다.** `specs/*.md`(플랜)는 **사람이 리뷰·편집한 의도**이고, `tests/*.spec.ts`(생성물)는 그 의도를 라이브로 검증한 **evidence/artifact** 다. 둘 다 **머지 전 사람 리뷰**를 거치며, **자동 머지로 진실원천 대접을 받지 않는다.**
- **green 은 게이트를 올리지 않는다.** Playwright suite 통과는 readiness 모드를 끌어올리지도, `blocks_mode` 를 해제하지도, Open Decision 을 닫지도, `confirmed` 로 승격하지도 않는다. 그것들은 전부 **사람 전용 전환**이다(루트 `AGENTS.md`: "Do not resolve Open Decisions or close human-owned gates unless the user explicitly asks").
- **Healer 의 green 은 특히 의심 대상이다.** "pass" 가 목표인 에이전트이므로 회귀를 가릴 수 있다 — 그래서 §c.3 가드(diff 검토·fixme 트리아지·범위 잠금)가 거버넌스의 실질이다.
- **소유권 분리(권장):** `specs/*.md` 는 기획/PM 이 의도 검토, `tests/*.spec.ts` 는 개발이 PR 리뷰, 에이전트 정의·seed 는 커밋해 팀 공유. evidence 폭증(generator ~200/half-day)을 막기 위해 **suite 를 큐레이션**한다(스코프 = screen-spec 단위).

이 킷의 사람-게이트(confirmed 사람 전용)와 어울리는 한 줄: **Playwright Agents 는 "evidence 를 빠르게·일관되게 만드는 4번째 손" 이지, 방어선이나 판정자가 아니다.** 결정적 가드레일(validate/forbidden-paths/golden)은 변하지 않는 "통과 가능성"을 잠그고, Playwright 의 green/diff 는 사람·Codex 가 보는 evidence 로 흘러가 — 최종 `confirmed`·readiness 승격·Open Decision resolve 는 사람이 닫는다. 구체적 삽입 지점(Investigation/Verification Matrix, Acceptance Criteria handoff, CI 배선 위치)은 **03** 에서 설계한다.

---

### 부록: 한눈에 보는 명령

```bash
# 셋업 / 재생성 (Playwright 업그레이드 때마다)
npx playwright init-agents --loop=claude          # 또는 vscode|codex|opencode

# MCP 서버(보통 클라이언트가 자동 기동; Windows 래핑)
cmd /c npx playwright run-test-mcp-server

# 로컬 locator 확인(같은 엔진으로 role/text/testid 우선 픽)
npx playwright codegen http://localhost:8081
npx playwright codegen --test-id-attribute=data-testid http://localhost:8081

# 실행 / 트레이스
npx playwright test
npx playwright show-trace trace.zip               # 또는 trace.playwright.dev 에 드롭

# Healer 검토 루프
git diff -- tests/ ; git grep -n 'test.fixme(' -- tests/

# Expo 웹 타깃 기동(배선 상세는 02)
npx expo start --web                              # dev server(Metro, ~8081)
npx expo export -p web                            # 프로덕션 빌드 dist/ → 정적 서버로 서빙
```
