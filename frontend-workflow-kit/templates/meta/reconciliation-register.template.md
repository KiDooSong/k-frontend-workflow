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
> - Summary는 모든 회차의 **누적 Items projection**이다. 기존 Item ID·실제 effect를 보존하고 새 effect만
>   같은 표에 추가한다. 과거 effect 삭제·재번호화·현재 자식 상태에 맞춘 rewrite·완료 effect 재수행은 금지다.
>
> **검사 12(validate)가 보는 것**: 8컬럼 헤더 · `Reconcile Status` enum · 중복 행 · inputs↔register 미처리 교차
> + (v2) items 표 구조 · summary↔items projection · typed target/evidence 참조 해소 · routing matrix ·
> item provenance (메시지 prefix RR-SCHEMA/RR-ITEM/RR-REF/RR-ROUTE/RP).
> - `Reconcile Status` ∈ `not-started` / `in-progress` / `partially-reconciled` / `reconciled` / `failed`
>   (구조 깨짐·`in-progress`(중단)·`failed` = 항상 에러 / 행 없음·`not-started` = 기본 경고, `--enforce` 로 에러 승격)
> - `partially-reconciled` = 이번 범위의 작업·effect는 일관되게 끝났지만 입력 전체에 미처리 범위가 남음.
>   `RR-LIFECYCLE-101`은 기본 및 `--enforce` 모두 warning-only. v2는 `Result=pending` 권장;
>   기존 Result warning 정책/v1 자유서술은 유지하며 partial + accepted도 lifecycle 경고를 없애지 못한다.
> - 자식 open|closed 출처는 Open Decisions/Conflicts/Unknowns 다. 전체 범위 라우팅 완료 후
>   `reconciled` + 자식 decision open == 정상 PASS. 자식 open만으로 partial로 바꾸지 않는다.
>   v2 `Effect`는 reconcile 시점의 **역사적 행위** 기록이며 target의 현재 status를 요구하지 않는다.
>
> **같은 입력 재개**: partial이면 immutable input·누적 Items·현재 문서·아래 입력별 재개 메모를 읽고,
> 미처리 범위를 확인한 뒤 **같은 Summary 행을 `in-progress`로 이동**한다. decision-aware preclassification을
> 그 범위에 적용하며 이미 끝낸 effect는 반복하지 않는다. 회차 분할을 위해 input_id/입력 bytes/supersedes를 바꾸지 않는다.
> 정상 `reconciled` 재실행은 중단한다. 새 입력 + supersedes는 실제 내용/스냅샷 변경에만 쓴다.
>
> placeholder `{X}` 는 실제 값으로 치환한다. **미치환 placeholder 행은 검사 12 에서 실패하므로,
> 복사 후 실제 입력 행으로 채우거나 그 행을 삭제한다.** 입력이 아직 없으면 두 표 모두 헤더만 두면 된다.

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| {IN-YYYYMMDD-source-NNN} | {figma} | {simple-update×2 + conflict} | {reconciled 또는 partially-reconciled} | {전체 결과 또는 partial의 pending} | {artifact:SCREEN-001-screen-spec; artifact:conflicts} | {decision:D-001@open-decision-register; conflict:C-001@conflicts 또는 -} | {대체한 input_id 또는 -} |

## Reconciliation Items

<!--
  input 1개가 만든 reconciliation item N개의 누적 effect 기록. 같은 item의 여러 effect는 같은 Item ID(01, 02...)를 쓴다.
  - 새 논리 item에는 사용하지 않은 2자리 ID를 쓴다. 이전 회차 Item ID/실제 effect를 보존한다.
  - Basis(routing 근거) ↔ Classification ↔ Effect/Target 허용 조합은 input-reconciliation.md §Routing matrix 가 정본.
  - Effect 는 역사적 행위 enum: update|create|create-open|reopen|link-evidence|record|reject
    (resolve/close/accept/confirm 은 사람 전용이라 어휘에 없다 — gate-raising-only).
  - 이미 확인한 충돌을 미처리 메모로 숨기지 않는다. resolved-decision conflict의 Conflict create-open +
    Decision reopen은 같은 회차/같은 Item으로 완결해야 하며 반쪽 checkpoint는 허용하지 않는다.
  - 미처리 범위의 계획/가짜 update/record/link-evidence를 이 수행 이력에 넣지 않는다.
    simple-update + link-evidence는 여전히 불가. 원래 open U-/D- 답은 기존 answer routing을 유지한다.
  - Evidence 는 canonical input 의 section pointer: input:<input_id>#<section-slug>[/NN].
  - Source Ref/Captured At 은 `inherit` 로 input frontmatter 값을 상속할 수 있다. Source Unit 은 item 마다 명시
    (records vs instances 구분이 정밀도 바닥이다).
-->

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| {IN-YYYYMMDD-source-NNN} | {01} | {visual-evidence} | {simple-update} | {create} | {artifact:SCREEN-001-figma-component-mapping#component-mapping/M-001} | {input:IN-YYYYMMDD-source-NNN#extracted-facts/01} | {figma://file/abc/node/1:234 또는 inherit} | {instance} | {inherit} |

## Partial Reconciliation Notes

<!--
  partial 입력마다 아래 메모를 채운다. Summary/Items 뒤에 두며 새 표/컬럼/frontmatter/parser 계약이 아니다.
  메모가 없거나 잔여 범위/다음 행동이 불명확하면 reviewer는 정상 checkpoint로 승인하지 않는다.
  원문과 누적 Items가 대조 기준이며 이슈 댓글만을 유일한 재개 장소로 사용하지 않는다.
  메모 자체의 수정은 register 유지보수다. 가짜 product artifact update/target을 만들지 않는다.
  partial 입력이 없으면 예시 subsection을 지운다. 전체 완료 후에는 잔여 없음 또는 역사 메모임을 명확히 한다.
-->

### {input_id}

- 처리: {이번 회차 처리 범위, 원문 근거, 연결 문서와 기존 누적 Item ID}
- 미처리: {아직 reconcile하지 않은 원문 pointer: input:<input_id>#extracted-facts/NN 등}
- 이유: {이번 회차를 여기서 마친 사유}
- 재개: {원문·누적 Items·현재 문서를 대조하고 같은 Summary 행을 in-progress로 이동한 뒤 수행할 다음 행동}
- 담당/연결 작업: {담당 또는 미정, 관련 작업 링크가 있으면 기재. 임의 배정하지 않음}

## 미처리 감지 메모
- {모든 input_id 가 register 에 행으로 존재하는지 확인. 누락·`not-started` 는 기본 경고이며 `--enforce` 로 에러 승격.}
- {이번 회차 종료와 입력 전체 완료를 구분한다. partial이면 “이번 범위 종료 / 입력 전체 미완료 / 다음 범위”를 보고한다.}
- {모든 범위 라우팅이 끝나면 같은 행을 reconciled로 마무리한다. 자식 decision/conflict/unknown open 여부로 partial을 추론하지 않는다.}
- {partial warning-only는 구현 허가가 아니다. 일반 구현은 기존 readiness/path 권한을 따른다. visual-refresh는 선택 입력의 정확한 reconciled + accepted 및 single-item 조건을 유지하며 partial + accepted도 VR-RR-005로 거부한다.}
