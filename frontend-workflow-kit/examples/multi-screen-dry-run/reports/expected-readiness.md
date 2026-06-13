# Expected Readiness — multi-screen-dry-run

> md-only fixture. 두 층을 분리한다:
> 1. **실측** — `npm run workflow:readiness` 의 실제 출력(2026-06-13 검증됨).
> 2. **Target (design intent)** — 별도 implement-screen 세션이 fake hook·생성된 catalog·figma mapping·승인을 추가한 뒤 도달할 목표.
>
> md-only 게이트 천장은 **screen-skeleton** 이다: `src/` 가 없어 `fake_hook_exists=false`, catalog 가 `.snapshot.md` 라 `component_catalog_generated=false` → `rough-fixture-ui` 이상은 사실(fact)로 도달 불가. 그 아래로 Open Decision 이 일부 화면을 더 낮춘다.

## 1) 실측 — md-only 게이트 출력 (검증됨)

`node scripts/workflow-state.mjs --docs examples/multi-screen-dry-run/docs/frontend-workflow --src <nosrc> --date 2026-06-13` → `readiness`:

| Screen ID | readiness_mode | next_mode | 게이트 근거 |
|---|---|---|---|
| AUTH-001 | screen-skeleton | rough-fixture-ui | open decision 없음. rough 는 component_catalog/fake_hook 부재로 막힘 |
| HOME-001 | screen-skeleton | rough-fixture-ui | D-101(blocking rough-fixture-ui) → decision_cap = screen-skeleton |
| COUPON-001 | screen-skeleton | rough-fixture-ui | D-001(final)·D-003(api-integrated) cap 은 더 높음 → fact 천장 screen-skeleton 이 결정 |
| COUPON-002 | screen-skeleton | rough-fixture-ui | stub(본문 미작성)이라 authored=false. status draft 라 screen-skeleton 까지 |
| NOTICE-001 | route-skeleton | screen-skeleton | D-401(blocking screen-skeleton) → decision_cap = route-skeleton |
| PROFILE-001 | docs-only | route-skeleton | D-301(blocking route-skeleton) → decision_cap = docs-only |

3개 레벨(docs-only / route-skeleton / screen-skeleton)이 화면별로 다르게 나오는지 확인하는 것이 이 fixture 의 목적이다. **Test 1** 이 이 표를 재현 검증한다 (implementation-test-plan.md).

## 2) Target readiness (design intent)

implement-screen 세션이 전제(fake hook·catalog 생성·figma mapping·승인)를 갖춘 뒤의 목표 모드.

| Screen ID | Pattern | Target | 도달 조건 / 막는 것 |
|---|---|---|---|
| AUTH-001 | form | final-fixture-ui | status confirmed(이미 충족) + figma-mapping(draft+) + catalog 생성 |
| HOME-001 | dashboard | screen-skeleton | D-101 open → rough 이상 차단. 골격까지 |
| COUPON-001 | list | rough-fixture-ui | catalog+fake_hook 갖추면 rough. D-001(final)이 그 위를 막음 |
| COUPON-002 | detail | screen-skeleton | stub → 본문 작성 전까지 골격까지 |
| PROFILE-001 | form | docs-only | D-301(route-skeleton) 차단 → 문서까지만 |
| NOTICE-001 | list | rough-fixture-ui | D-401 해결(독립 화면) 후 catalog+fake_hook 갖추면 rough |

> 실측 ≠ target 인 화면(AUTH-001, COUPON-001, NOTICE-001)이 바로 implement-screen 이 코드/도면을 더해 끌어올릴 대상이다. md-only 단계에서는 모두 screen-skeleton 이하다.
