# 제네레이터 도그푸드 보고서 — B(에이전트 위임) vs A(MCP 툴 직접 호출)

Run id: `e2e-agent-real-mcp-001` · 대상 앱: Coupons (`http://127.0.0.1:3100/`)
Plan: [plan.md](./plan.md) · 날짜: 2026-06-28

## 1. 목적

동일한 test plan(`coupon-001/plan.md`)에서 `.spec.ts`를 생성하는 두 경로를 비교한다.

- **B = `playwright-test-generator` 서브에이전트에 위임** — "테스트 만들어줘"라고 맡기면 에이전트가 스스로 라이브 페이지를 탐색하고 `generator_setup_page` / `generator_write_test` MCP 툴을 호출해 코드를 작성.
- **A = `playwright-test` MCP 툴 직접 호출** — 메인 루프가 직접 `generator_setup_page` → (탐색) → `generator_write_test`를 호출하고, 코드는 직접 작성.

두 경로 모두 결국 같은 `playwright-test` MCP를 쓴다. 차이는 *누가 코드를 작성·판단하느냐*(자율 에이전트 vs 직접 통제)이다.

## 2. 절차

1. B 실행 → `tests/web/coupons/`에 3개 파일 생성 → `npx playwright test`로 검증.
2. B 산출물 보존(스크래치패드 + 본 폴더 `_variant-b-generator-agent/`) 후 `tests/web/coupons/` 비움.
3. A 실행 → 같은 3개 경로에 직접 작성 → 검증.
4. A(현재 `tests/web/coupons/`) vs B 디프 비교.

## 3. 결과 (둘 다 동일하게 통과)

| 항목 | B (에이전트) | A (직접 호출) |
|---|---|---|
| 생성 파일 | coupon-list / coupon-detail / coupon-actions | 동일 |
| 테스트 수 | 5 (1 + 2 + 2) | 5 (1 + 2 + 2) |
| 실행 결과 | **5 passed (1.7s)** | **5 passed (0.9s)** |
| 총 라인 수 | 126줄 (42+50+34) | 78줄 (28+28+22) |
| testDir 수정 | 없음 | 없음 |

두 경로 모두 plan의 모든 시나리오를 커버했고, `playwright.config.mjs`(`testDir: ./tests/web`)는 전혀 건드리지 않았다. 도메인 경로(`coupons/...`)는 양쪽 다 `fileName` 파라미터로만 결정됨.

## 4. 스타일 차이 (디프 요약)

| 관점 | B (에이전트) | A (직접 호출) |
|---|---|---|
| 헤더 주석 | `// spec:` / `// seed:` 출처 주석 부착 | 없음 (간결) |
| plan 스텝 주석 | 각 스텝/expect를 주석으로 보존 (추적성↑) | 주석 없음 |
| 내비게이션 | 절대 URL `http://127.0.0.1:3100/` | baseURL 상대 경로 `/` (config 의존) |
| 행 로케이터 | `getByRole('listitem').filter({ hasText })` / `getByTestId('coupon-item').filter` | `[data-coupon-id="..."]` 속성 스코핑 |
| 목록 검증 | 쿠폰별 코드를 펼쳐서 반복 기술 | `expected[]` 배열 + for 루프 (데이터 드리븐) |
| 가시성 단언 | `not.toBeVisible()` | `toBeHidden()` / `toBeVisible()` |
| 상세 진입 검증 | 타이틀/메타/설명 위주 | + `coupon-detail` 컨테이너 가시성도 명시 |

핵심: **B는 추적성·자기설명(주석·출처) 지향으로 더 장황**, **A는 간결·로케이터 정밀(속성 스코핑)·데이터 드리븐 지향**. 두 스타일 모두 testid/role 기반 안정 로케이터를 쓰고 `waitForTimeout` 같은 안티패턴은 없음.

## 5. 장단점 정리

**B (에이전트 위임)**
- 장점: 한 번의 위임으로 탐색→작성→검증까지 자율 수행, 사람 개입 최소. plan 스텝을 주석으로 보존해 plan↔test 추적성이 좋음. 대량 시나리오에 확장 용이.
- 단점: 토큰/시간 비용 큼(이번 실행 약 35.7k 토큰, 66 tool calls, ~7분). 코드가 더 장황. 산출물에 대한 세밀한 통제는 떨어짐(스타일을 사후에 맞춰야 할 수 있음).

**A (MCP 툴 직접 호출)**
- 장점: 코드 스타일·로케이터 전략을 직접 통제. 더 간결. 도그푸드 증거 수집(어떤 파라미터가 어디로 라우팅되는지)에 적합. 비용 낮음.
- 단점: 탐색·작성·검증을 직접 단계별로 밟아야 함. 시나리오가 많아지면 수작업 부담 증가.

## 6. 라우팅/`testDir` 증거 (도그푸드 핵심)

- 양쪽 모두 `generator_write_test.fileName`을 `tests/web/coupons/*.spec.ts`로 줘서 **`testDir`(`tests/web`) 내부**라 수락됨 — 도메인은 하위 폴더일 뿐, config는 불변.
- `git diff playwright.config.mjs` = 빈 결과(불변 확인).
- plan은 여전히 `testDir` 바깥 `tests/web-plans/coupons/coupon-001/`에 존재 — plan은 자유 경로, test는 `testDir` 하위라는 라우팅 모델이 두 경로에서 동일하게 성립.

## 7. 권고

- **반복적/대량 생성·자율 워크플로** → B(에이전트). plan 추적성과 자동화가 이득.
- **스타일 통제·증거 수집·소규모/정밀 작업** → A(직접 호출). 간결하고 통제적.
- 실무 기본값: **planner→generator 자동 파이프라인은 B로 돌리되, 팀 컨벤션(헤더 주석 유무, 상대 URL, 로케이터 전략)을 에이전트 프롬프트/규칙으로 고정**하면 A의 간결함과 B의 자동화를 함께 얻을 수 있음.

## 부록 — 산출물 위치

- A (채택본, 실사용): `tests/web/coupons/{coupon-list,coupon-detail,coupon-actions}.spec.ts`
- B (보존본): `tests/web-plans/coupons/coupon-001/_variant-b-generator-agent/`
