# 플래너 도그푸드 보고서 — 직접(MCP 직접 호출) vs 에이전트(`playwright-test-planner` 위임)

Run id: `e2e-agent-real-mcp-001` · 대상 앱: Coupons (`http://127.0.0.1:3100/`)
날짜: 2026-06-28

대상 산출물:
- 직접: [plan.direct.md](./plan.direct.md)
- 에이전트: [plan.agent.md](./plan.agent.md)

## 1. 목적

동일한 앱을 대상으로 test plan을 만드는 두 경로를 비교한다.

- **직접** = 메인 루프가 `planner_setup_page` → `browser_navigate`/`browser_snapshot`/`browser_click` → `planner_save_plan` 을 직접 호출하고, 시나리오 구성을 직접 판단.
- **에이전트** = `playwright-test-planner` 서브에이전트에 "앱을 탐색해서 플랜을 만들라"고 위임. 에이전트가 스스로 탐색·시나리오 도출·저장.

두 경로 모두 같은 `playwright-test` MCP를 쓴다. 차이는 *누가 탐색하고 시나리오를 설계하느냐*.

## 2. 정량 비교

| 항목 | 직접 | 에이전트 |
|---|---|---|
| 스위트 수 | 3 | 4 |
| 테스트 수 | **5** | **17** |
| spec 파일 수 | 3 (list / detail / actions) | 4 (list / detail / copy / apply) |
| 플랜 라인 수 | 66줄 (3.3 KB) | 266줄 (12.8 KB) |
| 토큰 사용 | 측정 불가(메인 루프 인라인) | **32,758** (격리 측정) |
| 툴 호출 | 약 11회 | **48회** |
| 소요 시간 | 수십 초 | ~5.4분 |
| testDir 수정 | 없음 | 없음 |

토큰 비대칭은 generator 보고서와 동일한 이유: 에이전트는 별도 서브에이전트라 사용량이 격리 집계되지만, 직접 경로는 메인 대화에 섞여 정확한 분리 수치가 없다. 또한 직접 경로는 **이 세션 앞단계(1~4단계)의 라이브 탐색을 재사용**해 더 싸 보이는 점도 감안해야 한다(공정 비교라면 직접에도 탐색 비용을 더해야 함).

## 3. 커버리지 차이 — 에이전트가 더 깊게 잡은 것 (핵심)

에이전트 플랜은 직접 플랜이 **놓친 실제 동작 3가지**를 발굴했고, 앱 소스(index.html)로 교차검증한 결과 모두 **진짜 동작**이다:

1. **View가 status를 비운다** (plan.agent 2.4). `view-button` 핸들러가 `setStatus('')`를 호출 → Copy로 띄운 메시지가 View 진입 시 사라짐. 직접 플랜엔 없음.
2. **Apply 상태가 쿠폰별로 누적된다** (plan.agent 4.4). 각 Apply는 해당 버튼에만 `.applied`를 추가하고 되돌리지 않음 → 여러 쿠폰을 동시에 Applied로 만들 수 있음. 직접 플랜은 단일 Apply만 검증.
3. **상세→Back 시 Applied 상태가 초기화된다** (plan.agent 2.5). `renderList()`가 목록 innerHTML을 통째로 재생성 → `.applied`가 사라짐. 상태 보존이 아니라 리셋이라는 미묘한 동작을 정확히 포착. 직접 플랜엔 없음.

→ 자율 탐색 경로(에이전트)가 **상태 전이·부수효과(side effect)** 류의 엣지 케이스에서 확연히 강했다.

## 4. 에이전트 플랜의 리스크 (정밀도 주의)

깊이의 대가로 일부 단언이 **앱 정의 상태가 아니라 브라우저 포커스 아티팩트**를 검증한다:

- Copy/Apply 관련 다수 스텝의 "the button gains the active state" / "no longer active" (예: 3.1, 3.4, 4.4). 스냅샷의 `[active]`는 앱 클래스가 아니라 `document.activeElement`(포커스) 표시다. Copy 버튼은 어떤 클래스도 얻지 않으므로, 이 단언들은 사실상 "클릭 후 포커스가 그 버튼에 있다"를 검증하는 것 — 기술적으론 참이지만 앱 기능이 아닌 우발적 동작이라 **취약하거나 가치가 낮은 단언**이 될 수 있다.
- 결과적으로 17개 중 일부는 generator 단계에서 그대로 코드화하면 의미가 모호하다. 채택 전 "포커스 active"와 "앱의 `.applied` 클래스"를 분리하도록 다듬는 게 좋다.

또 사소한 자기보고 오차: 에이전트는 "17 tests across 3 spec files"라 했지만 실제로는 **4개 파일**(copy/apply 분리)이다.

## 5. 스타일 / 포맷 비교

| 관점 | 직접 | 에이전트 |
|---|---|---|
| PR #114 포맷(`### N.`/`#### N.M.`, per-test `**File:**`, plain prose) | 준수 | 준수 |
| 시나리오 분해 | 굵게 묶음(쿠폰 1.1에 목록 전체) | 잘게 분해(쿠폰별/전이별 개별 테스트) |
| 내비게이션 표기 | "open home page" 수준 | 스텝마다 절대 URL 명시 |
| 파일 분할 | copy+apply를 `coupon-actions`로 통합 | `coupon-copy`/`coupon-apply`로 분리 |
| overview 깊이 | 핵심 동작 요약 | 상태 리셋·누적까지 서술 |
| 미도달 시나리오(empty-state) | 기록함 | 기록함(동일하게 정확) |

## 6. testDir / 라우팅 증거 (도그푸드 핵심, 두 경로 동일)

- 두 플랜 모두 `planner_save_plan.fileName`(자유 경로)으로 `tests/web-plans/coupons/coupon-001/` 아래에 저장 — `testDir` 바깥.
- 각 테스트의 `file`은 `tests/web/coupons/*.spec.ts`(=`testDir` 내부)로 지정 — 도메인은 하위 폴더.
- `git diff playwright.config.mjs` = 빈 결과 → **config/testDir 불변 확인**. 도메인은 오직 파라미터로만 라우팅됨.

## 7. 권고

- **커버리지 우선 / 미지의 앱 탐색** → 에이전트. 상태 전이·부수효과까지 자율 발굴해 직접보다 3배 이상 시나리오를 뽑음.
- **정밀·통제 / 비용 민감 / 이미 잘 아는 앱** → 직접. 핵심만 간결하게, 저비용.
- 실무 권장 절충: **에이전트로 폭넓게 초안 → 사람이 정밀도 게이트**(포커스-active 같은 우발적 단언 제거, 파일 분할 정책 통일)를 거쳐 채택. 에이전트 프롬프트에 "포커스/active 같은 브라우저 아티팩트는 단언하지 말 것", "copy/apply 파일 분할 규칙" 등을 규칙으로 박아두면 깊이와 정밀도를 동시에 확보.
- 다음 단계 제안: 에이전트 플랜(17 케이스)을 generator로 실제 코드화해 **몇 개가 실제로 통과하는지**(특히 4번 리스크 항목) 검증하면, "깊은 플랜이 정말 견고한가"까지 닫을 수 있음.

## 부록 — 산출물 위치

- 직접 플랜: `tests/web-plans/coupons/coupon-001/plan.direct.md` (3 스위트 / 5 테스트)
- 에이전트 플랜: `tests/web-plans/coupons/coupon-001/plan.agent.md` (4 스위트 / 17 테스트)
- 관련: generator 비교는 [generator-b-vs-a-report.md](./generator-b-vs-a-report.md)
