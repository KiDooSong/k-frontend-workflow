---
title: Reconciliation Register
status: draft
kind: meta-register
---

# Reconciliation Register

> 입력별 처리 이력. `Reconcile Status` 는 reconcile 행위의 라이프사이클이고(자식 항목 rollup 아님),
> `Result` 는 처리 결과 어휘다. **register-first**: 문서 수정보다 먼저 행을 쓴다. 입력당 canonical 행 1개.
> 저장 위치: `docs/frontend-workflow/_meta/reconciliation-register.md`. 계약: `../../input-reconciliation.md`.
>
> **검사 12(validate)가 보는 것**: 8컬럼 헤더 · `Reconcile Status` enum · 중복 행 · inputs↔register 미처리 교차.
> - `Reconcile Status` ∈ `not-started` / `in-progress` / `reconciled` / `failed`
>   (구조 깨짐·`in-progress`(중단)·`failed` = 항상 에러 / 미처리(행 없음·`not-started`) = 경고, `--enforce` 로 에러 승격)
> - ★ **오직 `Reconcile Status` 만 게이트 신호다.** `Created Items` 의 `(open)`/`(resolved)` 주석은 파싱하지 않는다
>   (`reconciled` + 자식 decision open == 정상 PASS). 자식 open|closed 출처는 Open Decisions/Conflicts/Unknowns 다.
>
> placeholder `{X}` 는 실제 값으로 치환한다. **미치환 placeholder 행은 검사 12(Reconcile Status enum)에서 실패하므로,
> 복사 후 실제 입력 행으로 채우거나 그 행을 삭제한다.** 입력이 아직 없으면 표는 헤더만 두면 된다(검사 12 는 inputs/ 가 없으면 NO-OP).

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| {IN-YYYYMMDD-source-NNN} | {planning} | {simple-update 등 분류 어휘} | {reconciled} | {accepted} | {닿은 산출물 목록} | {생성한 D-/C-/U-/G- ID 또는 -} | {대체한 input_id 또는 -} |

## 미처리 감지 메모
- {모든 input_id 가 register 에 행으로 존재하는지 확인. 누락·`not-started` 는 미처리(warning-first, `--enforce` 로 에러).}
- {자식 decision/conflict/unknown 의 open 여부는 여기 신호가 아니다 — 그 차단은 readiness 다운그레이드가 담당한다.}
