# example — multi-screen-dry-run

**workflow:state / workflow:readiness / implement-screen** 스킬을 위한 md-only 테스트 fixture.
완성도가 일부러 서로 다른 화면 6개를 한 트리에 모아, 화면마다 readiness 가 다르게 나오도록 고정한 것이다.

## 이 예제가 무엇이고, 무엇이 아닌가

- 이 예제는 **production app 이 아니다.** "샘플 커머스 앱"의 문서일 뿐이다.
- 이 예제는 **코드 구현 예제가 아니다.** golden example 인 `examples/coupon-feature` 와 달리 `src/` 가 없다 (md-only).
- 이 예제는 **future skill 테스트용 md fixture 다.** readiness 가 화면마다 갈리는지, implement-screen 이 게이트를 지키는지를 검증하는 입력이다.
- `multi-screen-dry-run` 은 **workflow-state / readiness / implement-screen 테스트 입력용**이다. (입력 reconcile 테스트는 별도 예제 `input-reconciliation` 의 몫이다.)
- **구현 결과물은 별도 세션에서 implement-screen 을 실행해 생성한다.** 이 fixture 자체는 코드를 만들지 않는다.
- 이 예제는 기존 **coupon-feature golden example 을 대체하지 않는다.**

## 구조

```txt
multi-screen-dry-run/
  docs/frontend-workflow/        # 6개 화면이 서로 다른 완성도로 들어 있는 lean 트리
                                 #   (트리 상세는 docs/frontend-workflow/README.md)
  reports/
    expected-readiness.md        # md-only 게이트 실제 출력 (스크립트로 검증된 값)
    implementation-test-plan.md  # 나중 세션이 따라 할 테스트 플랜
```

## 6개 화면과 readiness

화면 6개는 §2 canonical baseline 과 동일하다. 완성도와 Open Decision 이 화면마다 달라
readiness 가 갈린다. 아래 **Target readiness 는 design intent** 다 — 나중에 implement-screen 세션이
fake hook·생성 카탈로그·figma 매핑·사람 승인을 더했을 때 도달하려는 목표값이다.

| Screen ID | route | 완성도 메모 | Target readiness (design intent) |
|---|---|---|---|
| AUTH-001 | `/(auth)/login` | confirmed, 승인 메타 보유, D-204 resolved | final-fixture-ui |
| HOME-001 | `/(tabs)/home` | draft, D-101·U-101 open (위젯 구성/요약 API 미정) | screen-skeleton |
| COUPON-001 | `/(tabs)/coupons` | draft, D-001·D-003·U-001 open | rough-fixture-ui |
| COUPON-002 | `/coupons/[id]` | **STUB** (frontmatter 만, 본문 없음) | screen-skeleton |
| PROFILE-001 | `/(tabs)/my` | draft, D-301 open (편집 범위 미정) | docs-only |
| NOTICE-001 | `/notices` | draft, D-401·U-401 open | rough-fixture-ui |

> **주의:** 위는 design intent 일 뿐이다. `npm run workflow:readiness` 를 지금 이 md-only 트리에
> 돌리면 나오는 **실제 게이트 출력**은 다르다. 실제 출력값은 `reports/expected-readiness.md` 에 있으며,
> 그 값은 스크립트를 실제로 돌려 얻은 것(hand-edit 금지)이다. 나중 세션은 자기 출력과 그 표를 대조한다.

## md-only 게이트 천장 (screen-skeleton)

이 fixture 는 코드가 없다 — `src/` 도, 진짜 생성된 카탈로그도 없다(`*.snapshot.md` 만 있음).
그래서 `readiness_mode = min(fact_mode, decision_cap)` 에서 **fact_mode 천장이 모든 화면 `screen-skeleton`** 이다
(`fake_hook_exists = false`, `component_catalog_generated = false` → rough-fixture-ui 이상은 사실만으로는 닿을 수 없음).
여기에 Open Decision 이 일부 화면을 `decision_cap` 으로 더 아래로 끌어내린다.

- AUTH-001: D-204 resolved → 안 막음. fact 천장에 걸려 **screen-skeleton**. (target final-fixture-ui)
- HOME-001 / COUPON-002: 막는 cap 없음 → fact 천장 **screen-skeleton**.
- COUPON-001: D-001/D-003 open 이지만 cap 이 screen-skeleton 이상 → fact 천장 **screen-skeleton**.
- PROFILE-001: D-301 이 route-skeleton 미만으로 cap → **docs-only**.
- NOTICE-001: D-401 이 screen-skeleton 미만으로 cap → **route-skeleton**.

정확한 게이트 출력값과 blocking 사유는 `reports/expected-readiness.md` 를 단일 출처로 본다.
target(design intent) 과 게이트 출력(actual)은 항상 라벨을 붙여 구분한다.

## md-only src placeholder (`__no_src__`)

이 fixture 의 `reports/*` 와 `_meta/*.snapshot.md` 에 적힌 실행 예시는 `--src` 인자로
`examples/multi-screen-dry-run/__no_src__` 를 넘긴다.

- **이 경로는 일부러 존재하지 않는다.** md-only fixture 라 `src/` 트리가 없고, 앞으로도 만들지 않는다(코드 미생성 원칙).
- `<...>` 같은 꺾쇠 placeholder 대신 **실제 경로 모양의 placeholder** 를 쓰는 이유는, 명령을 그대로 **copy-paste 해서 실행**할 수 있게 하기 위해서다. 꺾쇠는 셸에서 리다이렉션으로 해석되거나 그대로 복사하면 깨진다.
- `workflow-state.mjs` 는 이 경로가 없으면 단순히 `fake_hook_exists = false` 로 본다(에러 아님). 그래서 md-only fact 천장이 `screen-skeleton` 에 걸리고, 이 fixture 가 검증하려는 값이 그대로 재현된다.
- 즉 `__no_src__` 는 "여기엔 src 가 없음을 명시하는, 실행 가능한 빈 자리표"다. 다른 이름으로 바꿔도 (존재하지 않기만 하면) 결과는 같지만, kit 전체가 이 한 가지 철자로 통일돼 있다.
