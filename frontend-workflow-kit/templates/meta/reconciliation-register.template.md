---
title: Reconciliation Register
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "{RFC3339 채택 시각, 예: 2026-07-20T00:00:00+09:00}"
---

# Reconciliation Register

> 입력별 처리 이력. `Reconcile Status` 는 reconcile 행위의 라이프사이클이고(자식 항목 rollup 아님),
> `Result` 는 처리 결과 어휘다. **register-first**: 문서 수정보다 먼저 행을 쓴다. 입력당 canonical 행 1개.
> 저장 위치: `docs/frontend-workflow/_meta/reconciliation-register.md`. 계약: `../../docs/reference/input-reconciliation.md`.
> Stage 04 리뷰 계약: `../../docs/reference/reconcile-review-rubric.md` (`review_profile: reconcile-stage04-v1`).
>
> **Contract v2 (frontmatter `reconciliation_contract: 2`)**: 이 템플릿은 v2 를 생성한다.
> - `structured_since` **이후** capture 된 입력은 아래 `## Reconciliation Items` 에 item/effect 행이 필수다.
>   이전 입력은 summary-only legacy 로 남겨도 된다(backfill 은 선택 — 정밀도를 발명하지 않는다).
> - v2 summary 셀 문법: `Classification` = `<classification>[×N] + ...` /
>   `Touched Artifacts` = `artifact:<artifact_id>[#section]` 세미콜론 목록 /
>   `Created Items` = typed target ref 세미콜론 목록 — **`(open)` 류 상태 주석 금지**(단일 출처는 대상 표).
> - 기존 v1 register 는 이 frontmatter 필드를 추가하기 전까지 기존 검사 그대로다(opt-in).
>
> **검사 12(validate)가 보는 것**: 8컬럼 헤더 · `Reconcile Status` enum · 중복 행 · inputs↔register 미처리 교차
> + (v2) items 표 구조 · summary↔items projection · typed target/evidence 참조 해소 · routing matrix ·
> item provenance (메시지 prefix RR-SCHEMA/RR-ITEM/RR-REF/RR-ROUTE/RP).
> - `Reconcile Status` ∈ `not-started` / `in-progress` / `reconciled` / `failed`
>   (구조 깨짐·`in-progress`(중단)·`failed` = 항상 에러 / 행 없음·`not-started` = 기본 경고, `--enforce` 로 에러 승격)
> - ★ **오직 `Reconcile Status` 만 게이트 신호다.** 자식 open|closed 출처는 Open Decisions/Conflicts/Unknowns 다
>   (`reconciled` + 자식 decision open == 정상 PASS). v2 의 `Effect` 도 reconcile 시점의 **역사적 행위** 기록이며
>   target 의 현재 status 를 요구하지 않는다.
>
> placeholder `{X}` 는 실제 값으로 치환한다. **미치환 placeholder 행은 검사 12 에서 실패하므로,
> 복사 후 실제 입력 행으로 채우거나 그 행을 삭제한다.** 입력이 아직 없으면 두 표 모두 헤더만 두면 된다.

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| {IN-YYYYMMDD-source-NNN} | {figma} | {simple-update×2 + conflict} | {reconciled} | {accepted} | {artifact:SCREEN-001-screen-spec; artifact:conflicts} | {decision:D-001@open-decision-register; conflict:C-001@conflicts 또는 -} | {대체한 input_id 또는 -} |

## Reconciliation Items

<!--
  input 1개가 만든 reconciliation item N개의 effect 기록. 같은 item 의 여러 effect 는 같은 Item ID(01, 02...)를 쓴다.
  - Basis(routing 근거) ↔ Classification ↔ Effect/Target 허용 조합은 input-reconciliation.md §Routing matrix 가 정본.
  - Effect 는 역사적 행위 enum: update|create|create-open|reopen|link-evidence|record|reject
    (resolve/close/accept/confirm 은 사람 전용이라 어휘에 없다 — gate-raising-only).
  - Evidence 는 canonical input 의 section pointer: input:<input_id>#<section-slug>[/NN].
  - Source Ref/Captured At 은 `inherit` 로 input frontmatter 값을 상속할 수 있다. Source Unit 은 item 마다 명시
    (records vs instances 구분이 정밀도 바닥이다).
-->

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| {IN-YYYYMMDD-source-NNN} | {01} | {visual-evidence} | {simple-update} | {create} | {artifact:SCREEN-001-figma-component-mapping#component-mapping/M-001} | {input:IN-YYYYMMDD-source-NNN#extracted-facts/01} | {figma://file/abc/node/1:234 또는 inherit} | {instance} | {inherit} |

## 미처리 감지 메모
- {모든 input_id 가 register 에 행으로 존재하는지 확인. 누락·`not-started` 는 기본 경고이며 `--enforce` 로 에러 승격.}
- {자식 decision/conflict/unknown 의 open 여부는 여기 신호가 아니다 — 그 차단은 readiness 다운그레이드가 담당한다.}
