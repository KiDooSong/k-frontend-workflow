# E2E evidence 운영 규율 — Web/Native 분담 · drift · warning-first

> Status: **DESIGN / DRAFT (제안, 게이트 아님)**. 2026-06-21.
> 근거: playwright 리서치 [03 §3~7](../../../../../docs/research/playwright/03-workflow-integration.md) · [02 (d)](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md) · [dogfood F9](../../../../../docs/research/playwright/dogfood-001-l010.md).
> 이 문서는 **운영 규율의 설계 합의문 후보**이지 CI 배선이 아니다. 어떤 검사도 이 PR에서 코드/정책/CI로 강제하지 않는다. 폴더 불변식·금지는 [README](README.md), testID 계약은 [testid-contract-candidate.md](testid-contract-candidate.md).

---

## 1. "E2E evidence is not gate" 운영 문구 (작업 #3 핵심)

> **불변식 후보 — E2E 결과(Playwright / Maestro / Detox)는 evidence다. 게이트가 아니다.**
> - 초록불이 **Open Decision을 닫지 못한다. confirmed로 승격시키지 못한다. readiness 모드를 올리지 못한다.**
> - **Healer 자동수정 diff는 사람 리뷰 전엔 confirmed 아님** — PR diff로만 머지. CI 무인 자동수정 금지.
> - **`test.fixme()`는 silent skip이 아니라 triage signal** — 연결된 OD/conflict가 없으면 사람이 트리아지.
> - **Verification Matrix Status(passed/failed)는 도구가 아니라 사람이 쓴다.** 한 표면(Web)의 green을 다른 표면(iOS/Android)으로 **복사 금지**.

이건 킷 README 불변식("confirmed 승격은 사람만")·"통과 = 완료가 아니다"의 E2E 판이며, [03 §4](../../../../../docs/research/playwright/03-workflow-integration.md)가 제안한 "불변식 8"과 같다.

> 적용 경계: 이 문구를 **README 불변식 / [investigation-and-verification.md](../../../../investigation-and-verification.md)에 명문화하는 것은 별도 명시 지시**(작업 #7 checklist E0). 여기서는 *설계 합의*까지만.

---

## 2. 표면 분담 (Web / Native)

| 표면 | 도구 | Verification Matrix 열 | evidence 산출물 |
|---|---|---|---|
| **Web** (react-native-web) | **Playwright** (+ Test Agents) | `Web` | `playwright-report` / `trace.zip` |
| **iOS** (네이티브) | **Maestro**(Expo 권장) / Detox | `iOS` | `maestro/` 실행 로그 / detox |
| **Android** (네이티브) | **Maestro** / Detox | `Android` | 〃 |

규율(근거 [02 §0/(d)](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md)):
- **Playwright는 네이티브 미구동**(메인테이너 공식 확정). Expo에서 직접 만지는 표면은 **react-native-web 웹 하나뿐**.
- **"Web green ≠ Native green".** 같은 `testID`가 세 열을 먹이되 **evidence는 표면별로 분리**한다 — 한 열의 `passed`를 다른 열로 복사하면 evidence 위조에 가깝다.
- 모바일 *웹* 에뮬레이션(`isMobile`/뷰포트)은 `Web`(모바일 폼팩터) evidence이지 네이티브 대체재가 아니다.

> 경로 표기(잠정): 네이티브 플로우는 골든 screen-spec Acceptance Criteria 핸들과 동일하게 **`maestro/*.yaml`**(웹은 `tests/web/*.spec.ts`)로 적는다. 정확한 glob(`maestro/` vs `.maestro/`, `.yaml` vs `.yml`)은 `native_e2e` role이 **Tier3 substrate 이후** 정식 매핑될 때 확정한다 — 그 전까지 이 문서의 경로는 *예시 컨벤션*이지 강제 계약이 아니다.

---

## 3. Verification Matrix evidence link (운영)

기존 [investigation-and-verification.md](../../../../investigation-and-verification.md)의 `Case 행 × {iOS, Android, Web} × Evidence × Status` 구조를 그대로 쓴다 — **새 축 아님**.

```md
| Case | iOS | Android | Web | Evidence | Status |
|---|---|---|---|---|---|
| 쿠폰 목록 표시 | passed | passed | passed | playwright-report#shows-list / maestro log | passed |
| 만료 쿠폰 노출 | -      | -      | -      | (D-001 open)                                | blocked |
```

- `Web` 열 evidence = Playwright 리포트/trace 링크. `iOS`/`Android` = Maestro/Detox 링크. **Status는 사람**이 기입.
- **`blocks_mode`:** MVP-A에선 Verification이 readiness를 직접 게이트하지 않는다 — **연결된 Open Decision이 실제 blocker**. 위 "만료 쿠폰"은 `D-001 open` 때문에 `blocked`.
- **Status 값 규약(제안 — E0 status-policy 정제):** 현 모델과 정합하도록 아래로 고정한다.
  - `open` = 아직 확인/구축 안 됨(**네이티브 하니스 미구축 포함**). 정당한 **비-게이트** 상태 — fact-finding 큐.
  - `blocked` = **사람이 연결한 실제 blocker**(블로킹 Open Decision, 또는 device/account/env 의존). **E2E 도구 미구축 자체는 `blocked`가 아니다** — 그렇게 쓰면 "E2E 도구가 게이트"라는 오해를 부른다(§1 불변식 위반).
  - `n/a` = 표면이 진짜 적용 불가(웹 한정 Case의 네이티브 열, 또는 그 반대).
  - 실제 blocker를 `open`으로 방치하면 트리아지에서 숨는다 — 그때만 사람이 `blocked`로 올린다. (도구 미구축은 evidence 공백일 뿐 게이트 아님.)

---

## 4. Healer 운영 (auto-fix는 PR diff로만 — 작업 #3)

- **Healer는 로컬 / PR 브랜치에서만.** CI 무인 자동수정 금지(공식 가이드 부재 + Healer의 1차 목표가 "pass"라 회귀를 green으로 덮을 수 있음). CI 메인은 **결정적 retries + trace**로 두고 라이브 자가치유를 넣지 않는다.
- **모든 수정은 PR diff로 검토.** 집중 3종: **(a) assertion 기대값 완화 (b) 정규식 locator가 너무 헐거워짐 (c) `test.fixme()` 추가**.
  ```bash
  git diff -- tests/                     # Healer 변경 전수 검토
  git grep -n 'test.fixme(' -- tests/    # 자동 스킵 색출 → 전부 트리아지
  ```
- `guardrails stop the loop`은 무한 재시도를 끊는 **종료 장치**일 뿐 "좋은 수정" 보장이 아니다. 멈췄다고 옳은 게 아니다.

---

## 5. F9 drift handling (작업 #4)

**도그푸드 F9 재서술:** screen-spec은 "email → 결과 'email'"인데 구현은 "email → J020 폼"으로 라우팅을 바꿔 둠. 처음 green이던 테스트가 재실행에서 **일관 실패** → 라이브 확인 결과 **다른 세션이 구현을 바꿔** 둔 것. 즉 **E2E가 "문서 계약 vs 실제 구현"의 어긋남을 잡아냈다.**

규율:
- **테스트를 조용히 현실에 맞춰 green으로 만들지 말 것.** Healer가 "그냥 green"으로 덮으면 **overfit**이다 — 이건 잡아야 할 신호를 끄는 것.
- **두 갈래를 표면화한다(어느 쪽인지 사람이 판정):**

  ```txt
  E2E 실패
    └─ 라이브 확인: 드리프트인가 플레이키인가?
         └─ 드리프트면 분류:
              ├─ screen-spec 이 stale (구현이 의도된 진화)
              │     → reconcile-input / Open Decision 으로 screen-spec UPDATE 표면화.
              │       (reconcile 스킬: register-first. 테스트는 현실에 맞춰 고치되 stale 행을 reconcile 로 남김.)
              ├─ 구현이 회귀 (spec 이 옳음)
              │     → 버그로 보고. 테스트는 그대로 RED 유지(green 으로 덮지 않음).
              └─ 미정 (어느 쪽이 옳은지 모름)
                    → Open Decision(open) 으로 올림 — 게이트는 사람.
  ```

- **조용한 green 금지.** drift는 `reconcile-input`/Open Decision 파이프라인으로 흐른다 — 스펙 갱신 vs 구현 회귀를 **사람이 판정**한다([input-reconciliation.md](../../../reference/input-reconciliation.md)).
- **후보(future, warning-first):** "screen-spec route/interaction ↔ 실제 라우팅" 정합 검사. 현재 [03 §5.5](../../../../../docs/research/playwright/03-workflow-integration.md) 검사 14~16은 *테스트 핸들* 정합이지 *구현 행동* 정합이 아니다 — F9는 후자라 아직 자동탐지 부재. hard gate 아님.

---

## 6. warning-first 후보 (작업 #5) — 전부 future / warning-first / no CI hard gate

| # | 후보 | 무엇을 보나 | 등급 | substrate |
|---|---|---|---|---|
| W1 | **testID handle declared-but-missing** | screen-spec이 선언한 testID가 구현/tests에 없음 | warning-first (생성물 부재 시 skip) | screen-spec testID 선언 후 |
| W2 | **`test.fixme` without linked OD/conflict** | `tests/web/**`에 `test.fixme(`가 있는데 연결 OD/Conflict 없음 → Healer silent skip을 트리아지로 | warning-first | E2E 산출 후 |
| W3 | **E2E provenance header missing** | `tests/web/**`가 `// spec:` · `// seed:` provenance 헤더를 안 가짐 | warning-first | E2E 산출 후 |
| W4 | **`e2e-index` generated view** | Acceptance Criteria 테스트 핸들 ↔ 실제 `tests/web/**`·`maestro/**` 역색인(읽기 전용·멱등·GENERATED 헤더) | warning-first (artifact 부재 시 skip) | **Tier3 access-matrix substrate 이후** |

공통 규율:
- **전부 warning-first(exit 0).** `--enforce`로만 하드. 그 승격은 telemetry/dogfood 후 **별도 사람 OD**(lint-baseline ratchet · [VS-3 패턴](../visual-spec-od-decisions.md) 그대로).
- **지금 구현하지 않는다.** W1~W3은 testID 선언/E2E 산출이 실제로 시작된 뒤, **W4와 `web_e2e`/`native_e2e` role은 [tier3 access-matrix](../../../../temp/proposals/tier3-access-matrix-revision.md) substrate가 정착한 뒤** 후보.
- 어떤 신호도 `figma_mapping_status`처럼 readiness fact에 합치지 않는다 — E2E는 evidence 축이지 readiness 게이트가 아니다.

---

## 7. 다음 구현 단계 checklist (작업 — 넘길 것)

> 순서는 [03 §7](../../../../../docs/research/playwright/03-workflow-integration.md)의 E0~E4를 따른다. 전부 warning-first, 한 번에 한 슬롯([roadmap 순차 원칙](../../../../roadmap-current.md)). **각 단계의 게이트 전환은 사람만.**

**사람 게이트 (먼저 못 박을 것):**
- [ ] 이 draft 2종(testID 계약 · evidence 규율) **사람 리뷰** — 방향 수용 여부. *방향 승인 ≠ 구현 착수 ≠ hard gate.*
- [ ] (수용 시) llm-rules 네이밍 규약 + screen-spec Accessibility 주석을 **별도 명시 지시 + 슬롯**에서 정본 반영(additive, 헤더 불변 — [testid §6](testid-contract-candidate.md)).

**구현 후보 (순차, 전부 warning-first / 게이트 0):**
- [ ] **E0 docs 계약:** "Web=Playwright, iOS/Android=Maestro/Detox, 도구 출력=evidence, Status=사람" + "E2E는 evidence(게이트 아님)" 불변식을 [investigation-and-verification.md](../../../../investigation-and-verification.md) / README에 명문화(명시 지시 시). 산출물 축 불변.
- [ ] **E1 testID 선언 관행:** 골든 예제(`coupon-feature`) screen-spec 1화면에 testID 선언 시범(선언만, 코드 강제 0). Planner 플랜만 — `.spec.ts` 없음.
- [ ] **E2 (Tier3 substrate 이후) `web_e2e`/`native_e2e` role + `e2e-index` 읽기 전용 생성 뷰** — access-matrix 정착 후. role 단위 교체 머지 + GENERATED 헤더 + 멱등 골든 픽스처.
- [ ] **E3 warning-first 검사 W1~W4 배선**(continue-on-error) + 별도 CI 잡으로 `npx playwright test`(web)를 결정적 retries+trace로(메인 파이프라인에 라이브 Healer 없음) — 명시 지시 시.
- [ ] **E4 evidence 기반 하드 승격** — *별도 사람 OD*(telemetry 후). **이 전엔 어떤 E2E 검사도 readiness/CI 하드 게이트가 아니다.**

**금지 재확인(범위 밖):**
- [ ] E2E **hard gate 제안 금지** · Healer **CI auto-fix 금지** · 실제 **Playwright/Maestro harness repo 추가 금지** · **`temp/runs/maestro-dogfood-001/` 재추적 금지**.

---

## Cross-links

- 폴더 불변식·금지: [README](README.md) · testID 계약: [testid-contract-candidate.md](testid-contract-candidate.md)
- 리서치: [03 §3~7](../../../../../docs/research/playwright/03-workflow-integration.md) · [02 (d)](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md) · [01 §c.3/g](../../../../../docs/research/playwright/01-playwright-agents-planner-generator-healer.md) · [dogfood §3/§6](../../../../../docs/research/playwright/dogfood-001-l010.md)
- 기존 축: [investigation-and-verification.md](../../../../investigation-and-verification.md) · [input-reconciliation.md](../../../reference/input-reconciliation.md) · [roadmap-current.md](../../../../roadmap-current.md)
- substrate: [tier3-access-matrix-revision](../../../../temp/proposals/tier3-access-matrix-revision.md)
