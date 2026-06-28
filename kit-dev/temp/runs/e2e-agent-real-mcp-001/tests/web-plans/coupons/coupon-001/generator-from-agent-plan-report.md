# 제네레이터 도그푸드 보고서 (2) — 에이전트 플랜 기반: 직접 vs 제네레이터-에이전트

Run id: `e2e-agent-real-mcp-001` · 대상 앱: Coupons (`http://127.0.0.1:3100/`)
소스 플랜: [plan.agent.md](./plan.agent.md) (4 스위트 / **17 테스트**) · 날짜: 2026-06-28

## 1. 목적

`plan.agent.md`(플래너 에이전트가 만든 깊은 플랜, 17케이스)를 실제 `.spec.ts`로 코드화하는 두 경로를 비교하고, **깊은 플랜이 정말 통과하는 테스트로 닫히는지** 검증한다.

- **direct-gen** = 메인 루프가 `generator_setup_page` → 직접 코드 작성 → `generator_write_test` ×4.
- **agent-gen** = `playwright-test-generator` 서브에이전트에 위임.

## 2. 결과 (둘 다 17/17 통과)

| 항목 | direct-gen | agent-gen |
|---|---|---|
| 생성 파일 | 4 (list/detail/copy/apply) | 동일 |
| 테스트 수 | 17 | 17 |
| **실행 결과** | **17 passed (1.5s)** | **17 passed (1.6s)** |
| 총 라인 수 | **221** | **437** (~2배) |
| 토큰 | 측정 불가(인라인) | **50,434** (격리) |
| 툴 호출 | setup 1 + write 4 (+ 1 fix) | 46 |
| 소요 시간 | 수십 초 | ~5.2분 |
| testDir 수정 | 없음 | 없음 |

→ **두 경로 모두 17/17 통과**. 즉 플래너 에이전트의 깊은 플랜(상태 누적/리셋/status 클리어 포함)은 실제로 견고한 테스트로 100% 코드화됐다. "깊지만 헛다리"가 아니라 **실측 가능한 진짜 동작**이었음이 확인됨.

파일별 라인 수(직접 vs 에이전트): list 34/63 · detail 67/123 · copy 50/102 · apply 70/149.

## 3. "active state" 모호성 처리 — 두 경로 동일

지난 플래너 보고서에서 지적한 리스크(플랜의 "button gains the active state"가 앱 클래스가 아니라 **포커스 아티팩트**)는, 양쪽 모두 **`toBeFocused()` / `not.toBeFocused()`** 로 해석해 처리했고 통과했다. `.applied` 클래스는 별도로 `toHaveClass(/applied/)`로 검증. 즉 모호한 플랜 문구가 코드화 단계에서 합리적으로 해소됨.

## 4. 스타일 차이

| 관점 | direct-gen | agent-gen |
|---|---|---|
| 분량 | 컴팩트(221줄) | 장황(437줄, per-step 주석·반복 전개) |
| 헤더 주석 | 없음 | `// spec:` / `// seed:` 출처 |
| 플랜 스텝 추적 | 주석 없음 | 모든 expect를 주석으로 1:1 보존(추적성↑) |
| 로케이터 전략 | `getByTestId` 위주 (구현 안정형) | `getByRole('status')`, `getByRole('button',{name})` 등 **시맨틱/접근성형** + testid 혼용 |
| 반복 케이스(쿠폰 3종) | `for` 루프로 압축 | 케이스별 전개(가독성↑, DRY↓) |
| 행 스코핑 | `[data-testid="coupon-item"][data-coupon-id]` | 동일 |

핵심: **direct는 간결·DRY**, **agent는 추적성·접근성 로케이터·명시성**. 둘 다 안정 로케이터, 안티패턴 없음.

## 5. 주목할 점 — 행 스코핑 버그

direct-gen은 첫 실행에서 **실패 1건**이 났다: `[data-coupon-id="WELCOME10"]` 셀렉터가 li뿐 아니라 같은 속성을 가진 3개 버튼까지 매칭해 strict-mode 위반(4 elements). 행을 `[data-testid="coupon-item"][data-coupon-id=...]`로 좁혀 수정 → 17/17 통과.

agent-gen은 처음부터 같은 좁힌 셀렉터를 써서 이 버그가 없었다. **단, 이는 에이전트 프롬프트에 "버튼도 data-coupon-id를 가지므로 좁혀라"고 미리 경고를 넣어준 덕**이다(이전 라운드에서 얻은 교훈을 주입). 즉 이번 비교는 완전한 블라인드가 아니며, 에이전트가 사전 힌트의 이점을 봤다는 점을 감안해야 한다.

## 6. 전체 2×2 매트릭스 (플랜 소스 × 생성 방식)

| | direct-gen | agent-gen |
|---|---|---|
| **direct plan** (5케이스) | 5 passed · `_generated/from-direct-plan/direct-gen/` | 5 passed · `_generated/from-direct-plan/agent-gen/` |
| **agent plan** (17케이스) | 17 passed · `_generated/from-agent-plan/direct-gen/` | 17 passed · `_generated/from-agent-plan/agent-gen/` |

네 조합 모두 통과. 커버리지 폭은 **플랜 소스**가 좌우(5 vs 17)했고, **생성 방식**(direct/agent)은 통과율엔 영향 없이 **스타일·분량·비용**만 갈랐다.

## 7. 권고

- **커버리지는 플랜 단계에서 결정된다.** 깊은 커버리지를 원하면 플래너-에이전트에 투자하라(5→17). 생성 단계는 통과율을 좌우하지 않았다.
- **생성 방식 선택**: 대량/자율·추적성 중시 → agent-gen. 간결/통제·저비용 → direct-gen. 비용차가 큼(agent-gen 50k토큰·~5분 vs direct 수십초).
- **하이브리드 최적**: 플랜은 agent로 깊게 뽑되, 생성은 direct로 통제하거나, agent-gen을 쓰되 프롬프트에 팀 규칙(행 스코핑, 포커스-active 금지/허용, 로케이터 정책, 주석 정책)을 박아 품질을 고정. 이번 라운드에서 그 힌트 주입이 실제로 agent의 버그를 예방했다.

## 8. 현재 상태 / 산출물

- **라이브(testDir)**: `tests/web/coupons/` = **agent-gen(에이전트 플랜)** 17개 (가장 폭넓은 통과 세트). `playwright.config.mjs`/`testDir` 불변(`git diff` 빈 결과).
- 보존본(모두 `tests/web-plans/coupons/coupon-001/_generated/` 아래, testDir 바깥):
  - `from-direct-plan/direct-gen/`, `from-direct-plan/agent-gen/` (각 5케이스)
  - `from-agent-plan/direct-gen/`, `from-agent-plan/agent-gen/` (각 17케이스)
- 관련 보고서: [planner-direct-vs-agent-report.md](./planner-direct-vs-agent-report.md), [generator-b-vs-a-report.md](./generator-b-vs-a-report.md)

> 참고: `generator-b-vs-a-report.md`의 테스트 주석 경로(`// spec: .../plan.md`)는 플랜 파일명이 `plan.direct.md`로 변경되기 전 값이라 현재와 약간 어긋난다(주석일 뿐 동작 무관).
