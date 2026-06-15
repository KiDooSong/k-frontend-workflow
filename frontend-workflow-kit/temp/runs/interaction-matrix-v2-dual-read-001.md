# Run report — Interaction Matrix v2 dual-read 구현 (PR-2…PR-5 통합)

> **Status: IMPLEMENTATION — 2026-06-15.** 설계 문서 `temp/proposals/interaction-matrix-structured-format.md` 가 *future PR* 로 미뤘던 파서 dual-read(§12 PR-2) · validate 형식 검사 warning-first(PR-3) · 템플릿 안내(PR-4) · v2 골든 픽스처(PR-5)를 **한 PR 로 통합 구현**한다. v1 free-form Result 컬럼은 정본으로 유지되고, v2(`Result Type`/`Target`/`Params`)는 **선택적**이며, 기존 v1 출력은 **byte-identical** 로 보존된다. route-tree 교차검증은 **warning-first** 로만 도입했다(하드 게이트 승격 없음).

## 무엇을 구현했나

| 단계 | 설계 §  | 이 PR 의 구현 |
|---|---|---|
| 파서 dual-read | §4 | `scripts/lib/spec.mjs` — 라우트 추출 정규식을 `cellRoutes` 단일 출처로 통합(nav-graph 에서 이관). v2 컬럼 감지(`interactionMatrixIsV2`) + 행별 v2-aware 라우트(`interactionRowRoutes`) + spec-단위 v2-aware 집합(`interactionEdgeRoutes`). v1 표는 Result 셀, v2 표는 `Result Type=route` 행의 Target 셀에서 라우트를 읽는다 — "어느 셀을 읽느냐"만 모드로 분기(정규식 drift 불가). |
| nav-graph 엣지 | §4.2 | `scripts/lib/nav-graph.mjs` — 로컬 정규식/`cellRoutes`/`isConcreteRoute` 제거 후 spec.mjs 에서 import(단일 출처). `outboundEdgesOf` 가 v2-aware(`interactionRowRoutes`). 교차검증은 `interactionEdgeRoutes`(v1 표에서 `interactionResultRoutes` 와 동일 집합 → v1 동작 불변). |
| validate 형식 검사 | §6·§7 | `scripts/validate.mjs` — **검사 13 추가(WARNING-ONLY)**. `interactionMatrixV2Issues`(spec.mjs 순수 함수)를 호출해 enum 위반 / `route` 행 Target 부재 / Result↔Target drift / Target inventory 약식 부재 / 비-route 행 라우트 토큰 / 빈 Result Type(v1 폴백)을 **경고로만** surface. 검사 4 불변(여전히 Result 셀, v1 경로). route-tree 정밀 교차검증은 후속(여기선 inventory 집합 약식 경고). |
| 템플릿 안내 | §8 step 4 | `templates/screen/screen-spec.template.md` — Interaction Matrix 주석에 *선택적* v2 컬럼(Result Type/Target/Params) 사용법 추가. **표 헤더는 v1 그대로**(파서가 표 단위로 자동 판정). |
| v2 골든 픽스처 | §9 | `examples/nav-graph/v2-structured/` — basic-flow 와 같은 입력 의미를 v2 컬럼으로 작성. 생성된 nav-graph 그래프 본문이 v1 basic-flow 와 **byte-identical**(라우트는 Target 에서, Result 는 자연어 요약). 기존 `test-fixtures.mjs` nav-graph 하니스가 코드 변경 없이 자동 발견. |

## 핵심 불변식 보존

- **v1 byte-identical:** v2 컬럼이 없는 표는 모드 판정이 `v1` → 기존과 동일 경로(`cellRoutes(Result)`). 기존 nav-graph 골든(basic-flow·stub-destination)·route-tree 골든·검사 4 출력·pipeline 골든 모두 불변.
- **정규식 단일 출처:** 라우트 추출 정규식이 이제 `spec.mjs` 한 곳에만 존재(이전엔 spec.mjs/nav-graph.mjs 에 byte-identical 중복 + 런타임 교차검증). v2 도 같은 `cellRoutes` 위에 얹혀 drift 구조적으로 불가능.
- **warning-first:** v2 형식 검사(검사 13)는 **경고만** — 에러 0, exit code 영향 0. `interactionMatrixV2Issues` 는 절대 throw 하지 않는다. route-tree 교차검증을 하드 fail 로 만들지 않았다.
- **검사 카운트 불변:** validate 사람용 요약은 여전히 `검사 12종 통과` — 검사 13 은 warning-only 라 하드-검사 카운트에 미포함(v1 stdout byte-identical).
- **coupon-feature 미전환:** golden example 은 v1 그대로(강제 migration 없음).
- **정책/게이트 불변:** readiness·`implementation-mode-policy.yaml`·CI required check·generated artifact·manifest 무수정. `interaction_matrix_complete` 계산/게이트 비참여 불변.

## 실행한 검증과 결과 (worktree: feat/matrix-v2-route-seam)

```
npm test               → 35 unit pass / 0 fail · test-fixtures 27 fixtures(26 pass, 1 xfail)
npm run example:validate → workflow:validate — OK (검사 12종 통과)   (v1 coupon-feature, 경고 0)
npm run example:test    → test-fixtures — PASS (27 fixtures: 26 pass, 1 xfail)
```

추가 수동 검증:
- v2 픽스처 그래프 본문이 v1 basic-flow expected 와 **byte-identical**(`diff` tail +4 동일).
- v2 픽스처 docs 에 validate 실행 → `[경고 13] … Target /coupons/[id] 가 화면 inventory 에 없음 … (warning-first)` **1건, exit 0**(차단 아님). `/(tabs)/coupons` 는 inventory 에 있어 무발화.
- 새 unit 테스트 8건: v1/v2 모드 판정 · `interactionRowRoutes`(v1 Result / v2 Target) · `interactionEdgeRoutes` v1==`interactionResultRoutes` · 검사 4 는 Result·nav-graph 는 Target · v2 issue 6종(type-empty/enum/route-missing-target/result-target-drift/target-unknown/nonroute-has-route) · throw 안 함.

## 변경 파일

- `scripts/lib/spec.mjs` — cellRoutes/isConcreteRoute 단일 출처화 + v2 dual-read 함수 5종.
- `scripts/lib/nav-graph.mjs` — spec.mjs 라우트 헬퍼 import + outboundEdgesOf/교차검증 v2-aware.
- `scripts/validate.mjs` — 검사 13(warning-first) 추가, 헤더 주석 갱신.
- `scripts/lib/spec.test.mjs` — v2 dual-read 회귀 테스트 8건.
- `templates/screen/screen-spec.template.md` — 선택적 v2 컬럼 안내 주석.
- `examples/nav-graph/v2-structured/**` — v2 골든 픽스처(입력 + `_meta`/expected 생성물).
- `temp/runs/interaction-matrix-v2-dual-read-001.md` — 본 run report.

## 후속 (이 PR 범위 밖 — 설계 §11/§12 의 잔여 Open Decision)

- **OD-1/OD-2:** v2 컬럼 순서/필수성/`Result Type` enum 멤버십 동결(현재 enum 은 제안값, 경고만).
- **§7 정밀화:** route-tree.txt 토큰과의 EXACT 교차검증(현재는 inventory 집합 약식 경고). 여전히 warning-first.
- **OD-3:** v1/v2 공존 종료조건(현재 영구 dual 권고 — 본 PR 도 영구 dual).
- **하드 게이트 승격:** telemetry 후 별도 decision PR(이 PR 은 승격 안 함).
