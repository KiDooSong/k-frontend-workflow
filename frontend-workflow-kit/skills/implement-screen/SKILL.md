---
name: implement-screen
description: 지정된 Screen ID를 readiness gate가 허용하는 모드와 경로 안에서만 구현한다. 사용자가 "화면 구현", "implement screen", "이 화면 만들어줘" 등을 요청할 때 사용. workflow 스크립트 출력만 단일 출처로 소비하고, Open Decision/Unknown/정책 승격을 사람이 닫기 전에는 추측 구현하지 않는다.
---

# implement-screen

지정된 Screen ID 를 readiness gate 가 허용하는 모드·경로 안에서만 구현한다. 이 스킬은 **구현 가능 여부를 직접 판단하지 않는다** —
`workflow:state` / `workflow:readiness` / `workflow:validate` 출력만 단일 출처로 소비한다.

이 스킬은 [workflow spine](../../docs/reference/workflow-spine.md) 의 **Stage 06** 다. 운영 절차 정본:
[Stage 06 doc](../../docs/reference/workflow-stages/06-implement-screen-or-code.md). 어떤 사실이 어느 문서에 사는지:
[doc-ownership.md](../../docs/reference/doc-ownership.md).

> **통과는 승인이 아니다.** readiness pass 는 기계적 상한, validate pass 는 구조 검증이다. 제품 의도·디자인 확정·`confirmed`
> 승격·Open Decision resolve·Unknown close·Component Gap accept 는 사람이 한다. 애매함이 남으면 구현보다 먼저 표면화한다.

## 입력
- 대상 Screen ID (예: `COUPON-001`). 없으면 사용자에게 묻는다.
- visual/Figma/design 정렬 요청이면 **이미 capture + reconcile 된 정확한 Input ID**와 stable `screen_entry`를 찾는다. Input ID를 추측하거나 새로 만들지 않는다.
- (선택) repo가 제공한 기준 옵션은 각 CLI가 지원하는 부분집합으로 투영한다.
  - `workflow:state`: `--docs`, `--src`, `--root`, `--layout`
  - `workflow:readiness`: `--docs`, `--src`, `--root`, `--layout`, `--policy`, `--manifest`, `--ci`
  - `workflow:validate`: `--docs`, `--src`, `--root`, `--layout`, `--policy`, `--manifest`와 제공된 경우 `--schema`
  지원하지 않는 옵션을 다른 CLI에 그대로 전달하지 않는다. monorepo 에서 `src` 가 repo root 에 있다고 가정하지 않는다.
  route/screen/API 관례는 [CONVENTIONS.md](../../CONVENTIONS.md).

## 핵심 불변식
- readiness 판정을 **스스로 재구현하지 않는다** — 항상 스크립트를 실행하고 그 출력을 소비한다.
- 일반 구현은 **`allowed_paths` 안만 수정**, **`forbidden_paths` 는 절대 수정하지 않는다.** concrete 변경 경로마다
  `workflow:readiness -- --screen <ID> --path <path> --json`의 `path_authorization.allowed:true`를 확인한다.
- `visual-refresh`는 일반 `forbidden_paths`를 넓히는 mode가 아니다. 아래 명시적 visual tuple에서
  `intent_authorization.applicable:true`와 exact `path_authorization.allowed:true`가 함께 나온 **stable existing screen_entry 1개**만 수정한다.
- readiness 의 `delegated_shared_surfaces`가 예약한 경로는 broad `allowed_paths`에도 함께 보여도 수정하지 않는다.
  해당 `surface_id`와 `npm run workflow:readiness -- --surface <SURFACE_ID> --json`을 보고
  [implement-shared-surface](../implement-shared-surface/SKILL.md) workflow로 넘긴다.
- 화면 identity 가 없거나 raw source 코드면 먼저 **[Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)** 로 푼다.
- 관련 입력이 `not-started`/`in-progress`/`failed` 면 **멈추고** 같은 row 로 reconcile 을 끝낸다([Stage 04](../../docs/reference/workflow-stages/04-reconcile-input.md)).
- generated 파일은 직접 수정하지 않고 스크립트로 재생성한다([generated-files.md](../../docs/reference/generated-files.md)).
- readiness/validate pass 를 design/product approval 로 보고하지 않는다.
- Open Decision resolve, Unknown close, Component Gap accept, `confirmed` 승격, live policy 교체, CI/pre-edit hard gate 승격을 하지 않는다.

## 1. Preflight (readiness 우선)
1. 대상 화면 관련 Reconciliation Register 를 확인한다. 관련 input 이 `not-started`/`in-progress`/`failed` 면 멈추고, 같은 `input_id`
   row 로 reconcile 을 시작/재개하라고 보고한다([Stage 04](../../docs/reference/workflow-stages/04-reconcile-input.md)).
   `reconciled` 가 만든 Open Decision/Conflict/Unknown 은 직접 닫지 않는다 — readiness 가 판단하게 둔다.
2. 일반 구현이면 상태와 ordinary readiness 를 실행한다:
   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --screen <ID> --json
   ```
3. **visual/Figma/design refresh**이고 reconciled selected Input ID가 있다면 ordinary screen deny를 임의로 해석하거나 우회하지 말고, 정확한 tuple로 별도 readiness를 실행한다:
   ```bash
   npm run workflow:readiness -- \
     --screen <ID> \
     --intent visual-refresh \
     --input <INPUT_ID> \
     --path <SCREEN_ENTRY> \
     --json
   ```
   monorepo/custom layout이면 같은 project 기준의 `--root`, `--docs`, `--src`, `--policy`, `--manifest`, `--layout`, `--ci`를 **project-relative authority 경로**로 전달한다.
   다음 조건이 모두 참일 때만 visual patch를 시작한다.
   - `intent_authorization.applicable:true`
   - `intent_authorization.authorized_path == <SCREEN_ENTRY>`
   - `path_authorization.allowed:true`
   - `path_authorization.checked_path == <SCREEN_ENTRY>`
   하나라도 다르면 `reasons`를 보고하고 멈춘다. `screen_entry` 문자열 자체는 권한이 아니다.
4. ordinary readiness JSON 은 screen id 아래에서 읽는다. visual readiness는 top-level `intent_authorization`, `path_authorization`, `visual_refresh_audit`를 함께 읽는다. `visual_refresh_audit`의 selected input/path/tree ID는 audit transport일 뿐 권한 원장이 아니다.
5. `readiness_applicable: false`이면 `blocking`보다 먼저 확인한다. absorbed source에는 authoring/implementation을 하지 않고,
   source ID와 canonical `absorbed_into` target을 보고한 뒤 멈춘다([screen-lifecycle.md](../../docs/reference/screen-lifecycle.md)).
   target으로 자동 전환하거나 같은 요청의 범위를 넓혀 재실행하지 않는다.
6. 그 외 readiness 가 막으면 `blocking`·`next_actions` 를 보고하고 멈춘다.
7. 일반 구현의 concrete 경로는 수정 전에 ordinary path readiness를 다시 확인한다:
   ```bash
   npm run workflow:readiness -- --screen <ID> --path <project-relative-path> --json
   ```
   visual-refresh는 위 visual tuple의 **exact authorized screen path만** 해당 tuple로 다시 확인한다. hook/API/shared/component/route 등 다른 파일에 visual grant를 전파하지 않는다.

### 1.1 Work Packet / Run 연결
visual-refresh를 실제 구현 세션으로 운반할 때는 selected input/path를 Packet/Run에 명시적으로 전달한다. 예:
```bash
npm run workflow:run -- \
  --screen <ID> \
  --requested-mode <READINESS_MODE> \
  --intent visual-refresh \
  --input <INPUT_ID> \
  --path <SCREEN_ENTRY> \
  --json
```
이 실행이 `HALT_READY_FOR_WORK`일 때만 구현 후보 상태로 본다. Packet에 기록된 input/path/tree ID는 audit-only이며, 구현 후 backstop이 다시 authority를 계산한다.

## 2. 컨텍스트 로드 (대상 화면/도메인만)
필요한 산출물만 읽는다(다른 도메인 문서를 넓게 로드하지 않는다): ScreenSpec, domain rules/flows, navigation map,
component catalog + component-gap-register, Open Decisions/Conflicts/Unknowns, API manifest(해당 시), state/readiness 출력.
- 시각/Figma·testID·Tier3 항목이 있으면 해당 reconcile 산출물(`figma-component-mapping.md`, testID intake note,
  `implementation-mode-policy.draft.yaml`·`implementation-mode-policy.migration.md`)을 **읽기 context** 로 본다.
  live `policies/implementation-mode-policy.yaml` 도 읽기 전용 context 다.
- 작업이 visual/Figma/design 정렬이거나 **여러 화면**에 걸치면
  [visual-reconciliation.md](../../docs/reference/visual-reconciliation.md) 와 visual consistency contract
  (`design/visual-consistency-contract.md`, 있으면)를 읽는다. contract 가 없는데 multi-screen visual
  consistency 가 문제라면 구현 전 bootstrap/adoption step
  ([visual-contract-bootstrap](../visual-contract-bootstrap/SKILL.md), review-only)을 **제안만** 할 수 있다 —
  이 스킬이 bootstrap 을 자동 실행해 scope 를 넓히지는 않는다.
- 2차 산출물 판단은 [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md).

## 3. 모드 인지 구현
- ordinary 작업은 readiness의 `allowed_paths`/`forbidden_paths`와 concrete `--path` 판정을 함께 따른다.
- visual-refresh는 `intent_authorization`이 허용한 exact existing `screen_entry`의 `M`만 수행한다. 새 화면 추가, 삭제, rename/copy/type-change, ScreenSpec identity 수정, shared surface/API/hook/component 확장은 visual authority 밖이다.
- `delegated_shared_surfaces[].implementation_paths`는 member screen 작업에서 예약된 공유 코드다. screen의 더 넓은 allow glob이
  덮더라도 forbidden precedence를 적용해 수정하지 않고 surface 전용 readiness/skill로 위임한다.
- 모드 상한을 지킨다(`route-skeleton` → … → `api-integrated-ui`): readiness 가 구체 path 를 허용하지 않으면 early mode 에서 API/client/data layer 를 건드리지 않는다.
- 시각 값·selector·endpoint·DTO·copy 를 **발명하지 않는다.** raw/inferred visual 값은 final 처럼 하드코딩하지 말고 허용 파일 내 TODO 또는
  Unknown/VER-/Open Decision 으로 보고한다.
- 카탈로그에 없는 공통 컴포넌트가 필요하면 직접 만들지 말고 Gap 을 제안하거나 기존 컴포넌트를 쓴다. **승인돼 `roles.ui_primitive` 아래로 코드가
  들어가면** catalog 를 재생성한다(`workflow:catalog`, [Stage 07](../../docs/reference/workflow-stages/07-regenerate-derived-views.md)).
- per-screen code patch 전에 그 변경이 **shared shell/layout/component 소속인지** 먼저 본다 — visual contract 가
  shell-owned 로 선언한 logo/header/CTA 를 화면 파일에 ad-hoc 으로 넣지 않는다.
- Figma 가 ScreenSpec 또는 resolved decision 과 충돌하면 멈추고 reconcile/conflict/Open Decision 으로 올린다.

## 4. 검증 / 핸드오프
구현 뒤 가장 작은 관련 lint/test 를 먼저 돌리고, 그리고 항상:
```bash
npm run workflow:state
npm run workflow:readiness -- --screen <ID> --json
npm run workflow:validate
```
visual-refresh였다면 ordinary 검증에 더해 **실제 구현 snapshot**으로 backstop을 다시 계산한다. 로컬 staged 구현이면:
```bash
git add <SCREEN_ENTRY>
npm run workflow:forbidden-paths -- \
  --screen <ID> \
  --intent visual-refresh \
  --input <INPUT_ID> \
  --path <SCREEN_ENTRY> \
  --staged \
  --enforce \
  --json
```
또는 재현 가능한 commit 범위라면 `--range <A..B>`, base-to-HEAD면 `--base <ref>`를 사용한다. **visual-refresh에서 name/status-only `--diff`를 사용하지 않는다.**

Packet/Run을 사용했다면 같은 snapshot source로 report까지 연결한다. 예:
```bash
npm run workflow:run -- \
  --screen <ID> \
  --requested-mode <READINESS_MODE> \
  --intent visual-refresh \
  --input <INPUT_ID> \
  --path <SCREEN_ENTRY> \
  --staged \
  --json
```
Run Report의 Packet tree/path는 audit-only다. 최종 경계 evidence는 report가 `workflow:forbidden-paths`를 snapshot에서 **재평가한 결과**를 따른다.

visual/Figma 정렬 구현이었다면 추가로 `npm run workflow:visual-consistency -- --docs <docsDir> --src <srcDir> --json`
을 돌린다. warning-first 진단이지 gate/approval 이 아니다.
generated 파일이 stale 해 보이면 직접 고치지 말고 advisory `workflow:check-generated` 또는 generated-files 의 명령으로 재생성한다.
최종 보고에 포함한다:
- 변경 파일
- readiness mode before/after (의미 있을 때)
- visual이면 selected Input ID, exact authorized path, 사용한 snapshot kind(staged/range/base), backstop 결과
- validation 결과
- 남은 Open Decision / Unknown / Conflict / Component Gap
- 의도적으로 하지 않은 일(API 통합, live policy 교체, generated 직접 편집, CI/pre-edit hard gate 승격 등)

## 금지
- readiness 가 허용하지 않는 모드·경로 작업, ordinary `forbidden_paths` 임의 우회.
- visual-refresh authority를 exact authorized screen file 밖으로 전파.
- visual-refresh와 같은 diff에서 explicit policy/manifest/layout/CI authority resource 변경.
- API endpoint / DTO / 디자인 값 / copy / selector convention 추측.
- generated 파일 직접 편집.
- Open Decision resolve, Unknown close, Component Gap accept, `confirmed` 승격.
- live policy 교체, CI / pre-edit hard gate 승격.
- readiness pass 또는 validate pass 를 제품 승인으로 보고.
