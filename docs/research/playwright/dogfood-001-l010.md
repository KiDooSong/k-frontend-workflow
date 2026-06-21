# Dogfood 001 — Planner/Generator 흐름 + testID 실험 (live Expo 앱, L010)

> 날짜: 2026-06-21 · status: **도그푸드 실행 기록(evidence, 게이트 아님)**
> 시리즈 [01](01-playwright-agents-planner-generator-healer.md)·[02](02-expo-web-and-mobile-simulator.md)·[03](03-workflow-integration.md) 의 결론을 **실제 구동 앱에 한 번 적용**해 본 맛보기 실행 기록.
> 대상 앱: `temp/runs/figma-fidelity-001/app` (Expo SDK 56 · react-native-web · NativeWind) — figma 세션 데모 앱. **회사 figma 결합 → 비추적(로컬 전용).**
> 하니스: `temp/runs/maestro-dogfood-001/` (앱과 격리) — **비추적 로컬 런**(앱 카피·소스 임베드). 원시 로그 `run-report.md` 등은 동 디렉터리(로컬).
> 스코프: **L010 가입 랜딩** 1화면 + 그 분기 · **Web 표면만**(네이티브=Maestro, 범위 밖).
> 추적 경계: 이 findings 문서만 `docs/research/` 에 추적. 런 디렉터리(figma 앱·하니스)는 `figma-fidelity-001` 과 동일 범주로 **비추적**(카피·앱소스·file_key 보호).

---

## 0. 한 줄 결과

`screen-spec(confirmed) → Planner 플랜 → Generator 스펙 → npx playwright test` 체인을 **실제 구동 앱에 두 번**(getByRole / getByTestId) 돌렸다.
**role 9 + testID 9 = 18/18 green.** 흐름 자체는 **저마찰**이었고, 값진 건 그 과정에서 나온 발견 — 특히 **E2E가 spec↔구현 드리프트를 라이브로 잡아낸 것(F9)** 과 **testID가 선택자를 카피 결합에서 풀어준 것(F2 해소)** 이다.

---

## 1. 어떻게 실험했나 (설계)

- **대상/표면**: L010 가입 화면(홈 → 로그인 진입 → L010 → provider 선택 → 결과/J020). Web(react-native-web)만.
- **격리**: Playwright 하니스를 **별도 디렉터리**(`temp/runs/maestro-dogfood-001/`)에 두고, 떠 있는 Expo 웹 서버(:19006)를 `reuseExistingServer` 로 재사용. → figma 세션의 앱 `package.json`·소스 무오염.
- **역할 대역 경계 (정직)**: planner/generator/healer 서브에이전트는 `playwright-test` **MCP 서버가 클라이언트에 연결**돼야 도는데 이 세션엔 그 MCP가 없다. 그래서:
  - **실제 실행**: `@playwright/test`(1.61) 설치 · `npx playwright init-agents --loop=claude`(에이전트 정의 3종 + `.mcp.json` 생성) · `npx playwright test`.
  - **역할 대역**: Planner/Generator는 harness 브라우저 도구(accessibility snapshot/eval)로 **동일한 관찰→라이브검증→직렬화 루프**를 수행. 모든 locator를 **라이브 DOM에 검증한 뒤** 직렬화.
- **두 실험** (스펙 파일은 비추적 하니스 `tests/web/` 에 로컬 보관):
  - **A (baseline)** `L010.spec.ts` — `getByRole` + 접근성 이름(앱 무수정).
  - **B (testID)** `L010.testid.spec.ts` — 컴포넌트에 `testID` 박고(`app-testid.patch`) `getByTestId` 로 전환. 실험 후 **앱은 원복**, 변경은 패치로만 보존.

---

## 2. 무엇이 실제로 돌았나

```
npx playwright test            # 실험 A(9) + B(9) 동시
→ 18 passed (3.2s)
npx playwright test L010.spec.ts   # 원복 앱(패치 없음) 재확인
→ 9 passed (2.1s)              # role 베이스라인은 패치-독립적으로 재현
```
- `init-agents` 가 Windows에서 그대로 동작, `.mcp.json` 에 `cmd /c npx playwright run-test-mcp-server` **자동** 래핑(F1).
- `testID → data-testid` 라이브 확인: L010 8개·결과 2개·홈 1개 앵커 전부 DOM에 노출(설정 0).

---

## 3. 결과 (무엇을 봤나)

| 실험 | 선택자 | 결과 | 핵심 |
|---|---|---|---|
| **A** baseline | `getByRole('button',{name})` + `getByText` | **9/9** | 앱 무수정으로 즉시 가능. 단 선택자가 **카피에 결합**(provider 버튼 라벨 리터럴) |
| **B** testID | `getByTestId('signup-provider-google')` | **9/9** | 선택자가 **카피에서 분리**. testID 추가는 role 테스트도 안 깸(하위호환) |
| **드리프트** F9 | — | **라이브 포착** | screen-spec 은 "email→결과 'email'" 인데 구현은 "email→J020 폼"으로 이동 |

**F9가 이 도그푸드의 백미다.** 처음 9/9 green이던 email 테스트가 재실행에서 실패 → 부하/플레이키 의심했으나 워커 1개로도 일관 실패 → 라이브로 확인하니 **다른 세션이 앱에 J020 이메일 가입 플로우를 추가하고 `email` 라우팅을 바꿔** 둔 것. 즉 **E2E가 "문서 계약 vs 실제 구현"의 어긋남을 잡아낸 것**이고, 이건 Healer가 "그냥 green 만들기"로 덮으면 안 되는(=overfit) 정확한 사례다. 테스트는 현실(email→J020)에 맞춰 고치되, **stale해진 screen-spec 행은 reconcile 필요**로 보고에 남겼다(조용한 green 금지).

---

## 4. 잘 되더라 (what worked)

1. **흐름이 저마찰.** 구동 웹 빌드 + 결정적 진입점만 있으면 Planner→Generator→evidence가 막힘없이 흐른다. 마찰은 *에이전트*가 아니라 *경계 가정*에서 나왔다.
2. **킷 포맷 screen-spec = turnkey 입력.** L010 screen-spec(`temp/runs/figma-fidelity-001/screen/…`, 비추적 로컬)의 State/Interaction Matrix가 플랜 시나리오로 1:1. "spec=진실원천, test=evidence" 규율이 마찰 없이 성립(D-L010-1 시각 OD는 시나리오 0개 제거, U-L010-2 open은 로그인 링크를 데모값까지만 단언).
3. **딥링크가 결정적 seed.** figma 세션이 스크린샷 diff용으로 만든 `?screen=l010` 가 그대로 에이전트 진입점이 됐다(우연한 정렬).
4. **testID가 F2를 깔끔히 해소.** `signup-provider-google` 같은 앵커로 카피 의존 제거. RNW `testID→data-testid` 가 **Playwright 설정 0**으로 동작(02 §b-3 라이브 확인). 같은 testID 한 개가 web/iOS/Android 세 열을 동시에 먹인다.
5. **셋업이 Windows/Expo에서 바로.** init-agents 수동 개입 0(F1).
6. **라이브 검증이 selector 함정을 잡음(F4).** 타이틀 텍스트는 heading role이 아니라 plain `<Text>` → `getByRole('heading')` 대신 `getByText`. 01 §c.2 경고를 실제로 만남 = Generator의 "직렬화 전 라이브 검증"의 가치.

---

## 5. 미흡했다 (gaps)

1. **진짜 에이전트 미구동.** `playwright-test` MCP가 세션에 없어 planner/generator/healer **서브에이전트 자체**는 못 돌리고 역할 대역. `planner_save_plan` 직렬화·healer 자동수정 루프는 미검증(체인 성립 자체는 대역 무관하게 입증됨).
2. **킷의 핵심 가정과 앱이 불일치.** ① **testID 0개**(F2) ② **expo-router 아님**(F3 — App.tsx + 쿼리파라미터 네비 → route-tree/nav-graph 생성기 무적용) ③ **flat 레이아웃**(F8 — `components/`·`screens/`, `src/features/{domain}` 아님 → `project-layout` 오버라이드 필요) ④ **데이터 seam 없음**(F7 — `fake_hook_exists` 게이트 해당 없음).
3. **드리프트 자동탐지 부재.** F9는 *E2E 실패*로 우연히 드러났다. 킷엔 아직 "screen-spec ↔ 실제 구현 라우팅" 정합을 보는 검사가 없다(03 §5.5의 검사 14~16은 *테스트 핸들* 정합이지 *구현 행동* 정합이 아님).
4. **J020 신규 화면은 testID/스펙 미정비.** 드리프트 종착지(EmailSignupScreen 등)는 앵커가 없어 text로 단언할 수밖에 없었다.
5. **표면 1종.** Desktop Chrome만. 모바일 뷰포트(WebKit `isMobile`)·네이티브(Maestro) 열은 미수행.

---

## 6. 이렇게 하는 방향이 좋겠다 (recommended direction)

1. **testID를 "스펙 선언 계약"으로 승격.** 누가/언제/어떻게 = **screen-spec 저자**가 안정 앵커를 Accessibility/Interaction 계약에 선언 → **구현자가 screen-skeleton~fixture-ui 단계에 코드에 삽입**(Generator는 *소비*만). 네이밍 규칙(`{screen}-{element}`, 리스트 `{entity}-item-${id}`)은 **llm-rules에 고정**. → 현재 킷엔 testID 규칙이 0개라(골든 예제·템플릿·llm-rules 전수 확인) 이건 *처방됐으나 미채택*인 갭. 이 도그푸드가 그 갭을 실증. (계약 후보 문구: `docs/design/drafts/e2e-evidence/testid-contract-candidate.md`.)
2. **마에스트로 도입은 Tier3 뒤로 순차.** E2E role(`web_e2e`/`native_e2e`)은 Tier3의 데이터주도 `layers:`(gates 없는 layer)로 자연 표현된다 → substrate 재설계가 끝난 뒤 끼우면 재작업이 없다.
3. **E2E는 evidence, 게이트 아님(불변식 유지).** 18 green이 U-L010-2/D-L010-1을 닫지 않고 L010을 confirmed 위로 올리지 않는다. Verification Matrix `Web` 열 evidence 링크로만 들어가고 Status는 사람.
4. **드리프트는 reconcile 파이프라인으로.** F9 같은 spec↔구현 어긋남은 테스트를 조용히 green 만들지 말고 **reconcile-input/Open Decision**으로 표면화(스펙 갱신 vs 구현 회귀를 사람이 판정). 더 나아가 "screen-spec route/interaction ↔ 실제 라우팅" warning-first 검사를 후보로.
5. **하니스는 per-run 격리 유지 + 비추적.** 앱과 분리 + `reuseExistingServer` + 실험 후 앱 원복(변경은 패치로). 앱 카피·소스가 임베드되므로 `figma-fidelity-001` 과 동일하게 **public repo 비추적**, 로컬 재현용으로만 보관.

---

## 7. 재현 & 산출물 (로컬 전용)

> 아래 두 디렉터리는 **비추적 로컬** — 리포지토리에 없다. figma 런을 보유한 로컬에서만 재현된다.

```bash
# 앱(웹): cd temp/runs/figma-fidelity-001/app && npm run web -- --port 19006
cd temp/runs/maestro-dogfood-001
npm install && npx playwright install chromium
npx playwright test                       # 실험 A(role) — 원복 앱에서 9/9
git apply app-testid.patch -C ...앱경로    # 실험 B 전제: 앱에 testID 적용(아래 주의)
npx playwright test L010.testid.spec.ts   # 실험 B(testID) — 9/9
```
> 주의: `app-testid.patch` 는 figma 앱(`temp/runs/figma-fidelity-001/app`)에 적용. 본 도그푸드는 적용→검증 후 **앱을 원복**했으므로, 실험 B 재현 시에만 패치를 다시 얹는다.

```
maestro-dogfood-001/   (비추적 로컬 — findings 만 본 docs 에 추적)
├─ .claude/agents/playwright-test-{planner,generator,healer}.md   ← init-agents 실제 생성
├─ .mcp.json                       ← cmd /c 자동 래핑(F1)
├─ playwright.config.ts            ← Expo 웹 :19006, reuseExistingServer
├─ seed.spec.ts                    ← "좋은 seed"(딥링크 진입)
├─ specs/L010.plan.md              ← Planner(대역) + 사람-게이트 리뷰
├─ tests/web/L010.spec.ts          ← 실험 A(getByRole), 9/9 + F9 드리프트 테스트
├─ tests/web/L010.testid.spec.ts   ← 실험 B(getByTestId), 9/9 (패치 전제)
├─ app-testid.patch                ← 앱 testID 변경(원복했으므로 기록만)
└─ run-report.md                   ← 원시 실행 로그
```
