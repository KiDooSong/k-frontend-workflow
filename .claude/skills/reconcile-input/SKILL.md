---
name: reconcile-input
description: 외부 입력 스킬이 저장한 새 입력 결과물(input_id 보유)을 기존 frontend-workflow 문서와 대조해 simple-update/decision/conflict 등으로 분류하고, Reconciliation Register에 register-first로 처리 이력을 남긴다. 사용자가 "입력 반영", "reconcile input", "이 입력 맞춰줘"를 요청하거나 새 Figma/기획/API/회의록/QA 입력을 가져왔을 때 사용. 충돌을 직접 해결하지 않고, 게이트는 Open Decision(readiness)이 건다.
---

# reconcile-input

외부 입력 스킬이 저장한 입력 결과물을 기존 산출물과 대조해 분류하고, 처리 이력을 Reconciliation Register에 남긴다.
**충돌을 조용히 해결하지 않는다** — LLM은 게이트를 올리기만 하고, 게이트는 Open Decision(readiness)이 건다.
전체 계약: [input-reconciliation.md](../../../frontend-workflow-kit/input-reconciliation.md).

## 입력
- 입력 결과물 경로 (예: `docs/frontend-workflow/inputs/2026-06-13-figma-coupon.md`). 없으면 사용자에게 묻는다.
- (선택) 대상 screen/domain.

## 핵심 불변식
- **register-first**: 어떤 문서 수정보다 **먼저** register에 `in-progress` 행을 쓴다.
- LLM은 게이트를 **올리기만** 한다 (open 추가, `resolved→open` 재오픈). **내리는** 전이(resolve/close)는 사람-전용.
- `input_id`는 불변. 내용이 바뀌면 같은 id를 덮어쓰지 말고 **새 id + supersedes**.
- `Reconcile Status`(reconcile 행위)와 자식 항목(D-/C-/U-/G-/INV-/VER-)의 open/closed는 **별개 라이프사이클**.

## 절차 (register-first)
1. 입력 결과물을 읽고 `input_id`를 확인한다.
2. Register에서 같은 `input_id` 행을 확인한다:
   - `reconciled` → **멈춘다** (이미 처리됨, 멱등성).
   - `in-progress` (이전 실행 중단) → 새 행 추가하지 말고 **그 행을 이어서** 처리한다.
   - 없음 → 다음 단계.
3. Register에 행을 먼저 쓴다 (`Reconcile Status: in-progress`). ← 문서 수정보다 먼저. 파일이 없으면 아래 스키마로 생성.
4. `suggested_scope` 기준으로 관련 산출물을 연다 (ScreenSpec / Navigation Map / Domain Rules / Component Catalog / Open Decisions / Conflicts / API schema).
5. 기존 `confirmed` 문서·`resolved` 결정과 충돌하는지 대조한다.
6. classification을 만든다 (입력 1개 → item 여러 개 가능). 아래 분류표 참조.
7. 자동 반영 가능한 `simple-update`만 문서에 반영한다.
8. decision/conflict는 **멈추고** 사용자에게 선택지를 제시한다.
   - `resolved` 결정과 충돌 → Conflicts에 이전 값을 남기고(A=새 입력, B=기존 결정) 해당 Open Decision을 `open`으로 재오픈한다.
   - 검증 없이는 결정 불가 → Investigation/Verification(`INV-`/`VER-`)을 만들고 막을 화면에 Open Decision을 올린다 (Unknown 단독은 게이트 아님).
   - 카탈로그에 없는 공통 컴포넌트 필요 → Component Gap Register에 `G-xxx`를 `open`으로 제안한다 (제안만 — accept는 사람).
9. 사용자 결정 후 문서를 업데이트한다 (게이트 내림은 사람이).
10. Register 행을 `reconciled`로 바꾸고 `Result`·`Touched Artifacts`·`Created Items`를 채운다.
    자식 decision이 `open`이어도 reconcile 자체는 끝 — 그 차단은 readiness가 담당한다.
11. `npm run workflow:state` → `workflow:readiness` → `workflow:validate`를 실행하고 결과를 보고한다.

## Classification (입력은 ≥1개로 분류)
| Type | Action |
|---|---|
| simple-update | 관련 문서 보강 |
| resolves-unknown | Unknown을 `resolved` 처리 |
| resolves-decision | 사용자 확인 후 Open Decision `resolved` (사람) |
| new-decision | Open Decisions에 `open` 행 추가 |
| component-gap | 카탈로그에 없는 공통 컴포넌트 필요 → Gap Register에 `G-xxx` `open` 제안 (accept는 사람) |
| investigation-needed | `INV-`/`VER-` 생성 + 막을 화면에 Open Decision |
| conflict | Conflicts 기록 (`resolved` 결정과 충돌이면 decision 재오픈) |
| scope-unclear | 막아야 하면 Open Decision, 단순 확인이면 Unknown |
| reject-input | Register `Result`에 사유 기록, 문서는 유지 |

## Reconciliation Register 스키마
`docs/frontend-workflow/inputs/reconciliation-register.md`
```md
## Reconciliation Register
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
```
- `Reconcile Status`: `not-started` → `in-progress` → `reconciled` / `failed`
- `Result`: `accepted` / `rejected` / `delegated` / `pending user decision` / `conflict-created` …
- `Created Items`: `C-…`/`D-…`/`U-…`/`G-…`/`INV-…`/`VER-…` **링크만**. 자식 open/closed는 각 레지스터가 단일 출처.
- `Supersedes`: **입력↔입력 축만** (결정값 번복 아님 — decision-log의 몫).

## 금지
- `resolved` 결정 재-resolve / 임의 변경 (재오픈=`open`으로 올리기는 가능, 재-resolve는 사람만).
- 이전 결정 값을 조용히 덮어쓰기 / Conflict 기록 없이 decision만 변경.
- `confirmed` 문서 임의 강등·승격.
- Gap을 직접 accept / 새 공통 컴포넌트 직접 생성 (제안=`open`만, accept는 사람).
- `Owner`만 보고 사용자 판단 가능성을 배제하기.
- 같은 `input_id` 덮어쓰기 (새 id + supersedes).
- reconciliation 전 코드 변경.
