---
name: implement-screen
description: 지정된 Screen ID를 readiness gate가 허용하는 모드와 경로 안에서만 구현한다. 사용자가 "화면 구현", "implement screen", "이 화면 만들어줘" 등을 요청할 때 사용. workflow 스크립트 출력만 단일 출처로 소비하고, Open Decision/Unknown/정책 승격을 사람이 닫기 전에는 추측 구현하지 않는다.
---

# implement-screen

지정된 Screen ID를 readiness가 허용하는 모드·경로 안에서만 구현한다. 판정은 재구현하지 않고 `workflow:state` / `workflow:readiness` / `workflow:validate` 출력을 소비한다.
정본: [workflow spine](../../docs/reference/workflow-spine.md) Stage 06 · [Stage 06](../../docs/reference/workflow-stages/06-implement-screen-or-code.md) · [doc ownership](../../docs/reference/doc-ownership.md).

> readiness/validate 통과는 제품·디자인 승인이나 사람 소유 gate 전이가 아니다.

## 입력 / 불변식
- 대상 Screen ID. visual/Figma/design refresh이면 이미 capture+reconcile 된 정확한 Input ID와 stable `screen_entry`를 사용한다. 추측하지 않는다.
- CLI 옵션은 해당 CLI가 지원하는 것만 전달한다. monorepo에서 repo root와 project root를 혼동하지 않는다.
- 일반 구현은 `allowed_paths` 안, `forbidden_paths` 밖이며 concrete `path_authorization.allowed: true`인 경로만 수정한다.
- `delegated_shared_surfaces` 경로는 broad allow보다 우선해 [implement-shared-surface](../implement-shared-surface/SKILL.md)로 넘긴다.
- generated 파일은 직접 수정하지 않는다. Open Decision resolve, Unknown close, Gap accept, `confirmed` 승격, live policy/CI gate 승격을 하지 않는다.

## 1. Preflight
Reconciliation Register의 관련 input이 `not-started`/`in-progress`/`failed`면 Stage 04를 먼저 끝낸다.
그다음 **실행 분기를 먼저 선택한다.** 아래 no-work/legacy의 blocking 일괄 중단을 current/visual 분기에 먼저 적용하지 않는다.
현재 권한에서 처리할 concrete 작업은 **단일 target도 포함해** current 분기로 평가한다. 기존 visual-refresh tuple을 사용하기로 한 작업은 아래 Visual refresh 분기의 독립된 계약을 따른다. `--work`와 legacy/visual 선택 옵션을 섞지 않는다.

### Current-work 분기
[current work execution](../../docs/reference/current-work.md)의 `authority: current` request를 agent가 조립한다. target/origin이 여러 개여야 한다는 조건은 없다. 시작 입력은 `origin_inputs`에 보존하고 입력이 없는 작업만 빈 배열을 사용한다. 사람에게 매번 JSON 수작업 승인을 요구하지 않는다.

```bash
npm run workflow:readiness -- --work .workflow/current-work.json --json
npm run workflow:run -- --work .workflow/current-work.json --json
```

`ready: true`와 각 target의 실제 path 판정, 구현 전 `HALT_READY_FOR_WORK`를 확인한다. 상위 미충족은 도구가 분류한 `future_requirements`로 보고하고 `legacy_readiness.blocking`은 보존한다. raw blocking의 존재만으로 current 결과를 다시 일괄 중단하지 않는다.
실제 deny·미해결 origin·구조/수집 오류·absorbed 결과는 그대로 멈추거나 정본을 안내한다. 거부된 request를 버리거나 낮은 mode의 경로를 합치지 않고, deny를 없애려 no-work/visual로 자동 fallback하지 않는다. absorbed target으로 자동 전환하지 않는다.
`readiness → packet/run → backstop/report`에 같은 request/origin/resource를 유지한다. `scoped`/unit/partial·no-effect coverage receipt는 C 범위가 아니며 새 권한이 필요하면 기존 authoring/사람 확인으로 돌아간다.

### No-work / legacy 분기
`--work`를 사용하지 않는 일반 구현에만 다음 순서를 적용한다. 이 분기의 기존 권한·중단 의미는 바꾸지 않는다.
1. 일반 구현:
   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --screen <ID> --json
   ```
2. JSON의 `readiness_applicable`를 `blocking`보다 먼저 본다. `readiness_applicable: false`이면 absorbed source에 구현하지 않고 `absorbed_into`를 보고한 뒤 멈춘다. target으로 자동 전환하지 않는다.
3. 그 외 blocking이 있으면 `blocking`·`next_actions`를 보고하고 멈춘다.
4. 일반 concrete 경로는 수정 직전 다시 확인한다:
   ```bash
   npm run workflow:readiness -- --screen <ID> --path <project-relative-path> --json
   ```
   `path_authorization.allowed: true`가 최종 concrete 권한이다. **valid active hook claim**은 owning screen의 `rough-fixture-ui`/`final-fixture-ui`에서 effective envelope가 허용할 때만 편집한다. **active API-client / `surface_kind:null`**은 owner의 `api-integrated-ui` 이상이 필요하고, **invalid contract / deferred / conflict / non-owner / `api_required:false`**는 항상 거부한다.

### Visual refresh 분기
visual/Figma/design 정렬이고 selected Input ID가 있으면 ordinary screen deny를 임의 우회하지 말고 명시적 tuple을 사용한다:
```bash
npm run workflow:readiness -- \
  --screen <ID> --intent visual-refresh --input <INPUT_ID> \
  --path <SCREEN_ENTRY> --json
```
필요하면 같은 project 기준의 `--root`, `--docs`, `--src`, `--policy`, `--manifest`, `--layout`, `--ci`를 전달한다. authority resource 경로는 project-relative로 유지한다.
다음이 모두 맞아야 한다: `intent_authorization.applicable:true`, exact `authorized_path`, `path_authorization.allowed:true`, exact `checked_path`. 아니면 reasons를 보고하고 멈춘다.
visual 권한은 exact existing screen file의 `M` 한 건에만 적용한다. hook/API/shared/component/route/new/delete/rename/copy/type-change/ScreenSpec 수정으로 전파하지 않는다.

Packet/Run은 같은 tuple을 운반한다:
```bash
npm run workflow:run -- \
  --screen <ID> --requested-mode <READINESS_MODE> \
  --intent visual-refresh --input <INPUT_ID> --path <SCREEN_ENTRY> --json
```
`HALT_READY_FOR_WORK`일 때만 구현 후보 상태다. `visual_prework.path_allowed:true`와 요청한 screen/input/authorized_path/checked_path의 exact 일치를 함께 확인한다. intent 적용 가능만으로 path 허용을 추정하지 않는다.
Packet의 `visual_authority_applicable`, `visual_path_allowed`, selected input/path/tree ID는 audit-only다. 거부·불일치는 `HALT_AMBIGUITY`이며, 최종 권한은 구현 snapshot에서 backstop이 재계산한다.
visual Packet/Run에서는 `--readiness` 저장 파일 override가 금지된다. 현재 readiness를 실행하고, 이전 Packet/JSON을 새 path의 권한으로 재사용하지 않는다.

## 2. 컨텍스트 / 구현
대상 화면·도메인의 ScreenSpec, domain rules/flows, navigation map, component catalog/gap, Open Decisions/Conflicts/Unknowns, API manifest와 필요한 reconcile 산출물만 읽는다.
visual이면 [visual reconciliation](../../docs/reference/visual-reconciliation.md)과 해당 mapping/visual contract를 읽되 scope를 자동 확장하지 않는다.
시각 값·selector·endpoint·DTO·copy를 발명하지 않는다. shared shell/layout/component 소유 항목을 per-screen 파일에 ad-hoc으로 넣지 않는다. Figma와 canonical behavior/decision이 충돌하면 reconcile로 되돌린다.

## 3. 검증 / 핸드오프
current 분기에서는 작은 관련 test/lint와 `workflow:validate`를 실행하고, [Stage 08 current-work report/backstop](../../docs/reference/workflow-stages/08-validate-and-report.md#current-work-reportbackstop)에 따라 같은 `--work` request/origin/resource로 실제 구현 snapshot을 확인한다. no-work 화면 요약으로 current 판정을 대체하지 않는다. 실행·캡처 미검증은 보고하며 그 사실만으로 새 Draft/머지 gate를 만들지 않는다.

no-work/visual 분기는 작은 관련 test/lint 뒤 다음을 실행한다:
```bash
npm run workflow:state
npm run workflow:readiness -- --screen <ID> --json
npm run workflow:validate
```
visual-refresh면 실제 구현 snapshot에서 backstop을 재평가한다. staged 예:
```bash
git add <SCREEN_ENTRY>
npm run workflow:forbidden-paths -- \
  --screen <ID> --intent visual-refresh --input <INPUT_ID> \
  --path <SCREEN_ENTRY> --staged --enforce --json
```
재현 가능한 commit 범위는 `--range <A..B>`, base-to-HEAD는 `--base <ref>`를 쓴다. visual에서 name/status-only `--diff`는 쓰지 않는다.
Packet/Run을 사용했다면 같은 snapshot selector를 넘겨 report가 authority를 다시 계산하게 한다:
```bash
npm run workflow:run -- \
  --screen <ID> --requested-mode <READINESS_MODE> \
  --intent visual-refresh --input <INPUT_ID> --path <SCREEN_ENTRY> \
  --staged --json
```
`forbidden.status:error`는 `HALT_TOOL_ERROR`다. `forbidden.ok:false`의 violations와 snapshot을 보고하며, `DONE_PENDING_REVIEW`나 exit 0을 경계 통과·승인으로 읽지 않는다.
선택적 `--review <path>`는 실제 review 파일의 metadata/findings를 advisory evidence로 운반한다. 누락 파일은 입력 오류이며 review가 권한을 열지는 않는다.
visual이면 필요 시 `workflow:visual-consistency -- --docs <docsDir> --src <srcDir> --json`도 실행한다. 이는 warning-first evidence다.
최종 보고에는 변경 파일, readiness mode, visual이면 Input ID/exact path/snapshot kind/backstop 결과, validation, 남은 Decision/Unknown/Conflict/Gap, 의도적으로 하지 않은 일을 적는다.

## 금지
- readiness 비허용 경로, ordinary forbidden 임의 우회, visual authority의 exact screen 밖 전파.
- visual-refresh와 같은 diff에서 explicit policy/manifest/layout/CI authority resource 변경.
- generated 직접 편집, endpoint/DTO/design/copy/selector 추측, 사람 소유 gate 자동 전이.
