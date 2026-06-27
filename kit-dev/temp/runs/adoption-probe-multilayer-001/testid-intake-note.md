# testID Intake Note — app

<!--
  adoption-probe 가 산출하는 read-only/draft-only 노트. 게이트 트리 밖.
  목적: 이 레포 도입 시 **E2E 안정 앵커(testID)를 어떻게 다룰지**의 계약을 적는다.
  ★ 상태 경계: testID 계약은 아직 **PROPOSAL**이다(temp/proposals/testid-contract-canon-patch.md ·
    docs/design/drafts/e2e-evidence/). 정본(screen-spec/llm-rules)에 **아직 반영 안 됨**.
    따라서 이 노트는 testID 를 "recommended, not gate"로만 기술한다 — 강제·게이트·readiness fact 0.
  근거: testid-contract-canon-patch.md §2·§3·§4·§6 · e2e-evidence-discipline(drift) · candidate(naming).
-->

> **Status: PROBE / READ-ONLY — 2026-06-23.** E2E 는 **evidence 지 gate 가 아니다.** testID green 이
> OD 를 닫거나 confirmed 로 올리거나 readiness 모드를 끌어올리지 못한다. 누락은 *신호도 아니다*(이 단계).

## 0. 한 줄 요약

testID 는 **권장**이다(gate 아님). 방향은 **spec → 코드 한 방향**: screen-spec 이 선언 → 구현자가 삽입 →
Playwright/Maestro/Detox/Generator 가 **소비(읽기)만**. 도구가 발명하지 않는다.

## 1. 상태 — 왜 "recommended, not gate"인가

| 항목 | 현황 | 함의 |
|---|---|---|
| 정본 반영 | ❌ 아직(제안서만; testID 정본 0건) | screen-spec/llm-rules 편집은 별 apply-slot(사람 지시) |
| readiness fact | ❌ 없음·만들지 않음 | 누락이 모드를 못 낮춤 |
| validate 검사 | ❌ 없음 | testID 부재가 exit 1 아님 |
| E2E harness/CI | ❌ 추가 안 함(비추적 로컬 런) | 도입 흐름에 E2E 게이트 0 |
| substrate 의존 | `web_e2e`/`native_e2e` role·`e2e-index`·검사 14~16 = **Tier3 access-matrix 이후** | 지금은 future/warning-first 후보 |

## 2. 네이밍 규약 (권장 — 강제 아님)

| 종류 | 형식 | 예 |
|---|---|---|
| element | `{screen}-{element}` | `l010-title` · `coupon-list-empty` |
| action | `{screen}-{action}` | `l010-login-submit` |
| list item | `{screen}-{entity}-item-{stableId}` | `wishlist-product-item-SKU123` |

고정 규칙(3줄):
- **stableId = 안정 도메인 id.** 배열 인덱스/위치/카피 텍스트 **금지**(재정렬·문구 변경에 깨짐).
- **stutter 예외 한 형태:** `{screen}` 슬러그가 이미 엔티티 컬렉션이면 `{entity}` 생략 → `{screen}-item-{stableId}`.
- kebab-case. `{screen}` = `screen_id` 안정 슬러그(라우트 아님).

## 3. 선언 위치 (제안 — 이 노트는 정본을 편집하지 않음)

| 무엇 | 어디 | 형태(제안) |
|---|---|---|
| 화면별 앵커 선언 | screen-spec ▸ **Accessibility** | 주석 + 선택 예시 불릿 `testID: {screen}-{element}`(선언만) |
| cross-domain 네이밍 규약 | llm-rules ▸ 새 섹션(≤5줄) | "발명 금지 · 형식 · stableId · a11y 대체 아님" |

> ⚠ **Acceptance Criteria 에 앵커 끼우지 않는다** — 그 칸의 "테스트 ID"는 *테스트 파일 핸들* 의미로 이미 점유(용어 충돌).
> 앵커는 Accessibility(역할/라벨과 동거), 핸들은 Acceptance. 둘 다 두되 자리 분리.

## 4. drift 는 evidence-discipline 소관 (정본/노트에 주입 안 함)

E2E 실패가 spec↔구현 drift 를 잡으면 Healer 가 조용히 green 으로 덮지 않는다 — 라이브 확인 후 세 갈래(screen-spec
stale → reconcile / 구현 회귀 → 버그·RED 유지 / 미정 → Open Decision)로 **표면화하고 판정은 사람**. 이 문구는
`e2e-evidence-discipline.md` 에 유지하고 화면-계약 텍스트엔 넣지 않는다(준수율·가독성).

## 5. 이 레포 관찰 요약

- Existing testID practice: not observed.
- E2E runner: not inferred by adoption-probe.
- Conclusion: guidance only; no rename, harness, CI, or gate created.
- **프로브가 한 일:** 권장 규약·선언 위치 안내만. harness/CI/검사/정본편집 0.

## 6. 금지 재확인

- testID 누락을 readiness fact 로 연결 ✗ · E2E hard gate ✗ · Healer auto-fix 를 CI 에 ✗ ·
  Playwright/Maestro/Detox harness 를 repo 에 추가 ✗ · 이번 단계에서 정본 템플릿 편집 ✗ ·
  `web_e2e`/`native_e2e` role·`e2e-index`·검사 14~16 신설 ✗(Tier3 substrate 이후) · confirmed/OD/소스/CI 변경 ✗.
