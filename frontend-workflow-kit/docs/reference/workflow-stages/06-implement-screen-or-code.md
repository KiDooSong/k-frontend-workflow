# Stage 06 — Implement screen or code

Implement within the readiness gate's allowed mode and paths. Index:
[`../workflow-spine.md`](../workflow-spine.md). Skill:
[`../../../skills/implement-screen/SKILL.md`](../../../skills/implement-screen/SKILL.md).
For shared behavior code, use [`implement-shared-surface`](../../../skills/implement-shared-surface/SKILL.md).

**Enter when** code changes are requested.

**Skip this stage when** the task is docs-only / no code change. Then go to 07.

## Select the execution branch first

Choose the execution branch **before** applying the no-work/legacy blocking stop below.
For a concrete task within current authority, use the current-work branch, including a
**single target**. A task on an explicitly adopted owner's scoped path uses the scoped-work
branch. An explicitly selected visual-refresh task instead follows the existing
[visual-refresh contract](../visual-reconciliation.md); do not mix its tuple with `--work`.
Selecting a branch is not a grant and does not change no-work/visual authority.

## Current-work branch

[current-work reference](../current-work.md)의 `--work` 봉투를 **단일 target도 포함해** 사용한다.
복수 origin/target은 필수 조건이 아니다. agent가 canonical input/owner/target에서 request를 조립하며
사람에게 매번 JSON 수작업 승인을 요구하지 않는다. 시작 입력은 `origin_inputs`에 보존한다.

```bash
npm run workflow:readiness -- --work .workflow/current-work.json --json
npm run workflow:run -- --work .workflow/current-work.json --json
```

`requested_mode`는 실제 current ceiling 이하여야 하고 모든 concrete path가 기존 helper에서 허가돼야 한다.
`ready: true`와 각 target 판정, 구현 전 `HALT_READY_FOR_WORK`를 확인한다. 도구가 분류한 상위 미충족은
`future_requirements`로 보고하고 `legacy_readiness.blocking`은 보존한다. raw blocking만으로 이 분기를
다시 일괄 중단하지 않는다. 실제 deny·미해결 origin·구조/수집 오류·absorbed는 여전히 중단/정본 안내 대상이다.
Denied request를 버리거나 낮은 mode의 path를 합치지 않으며, deny를 피하려 no-work/visual로 자동 fallback하거나
absorbed target으로 자동 전환하지 않는다.

readiness, packet/run, report/backstop에 같은 request/origin/resource를 전달한다.
사후 검증과 정상 핸드오프는 [Stage 08 current-work report/backstop](08-validate-and-report.md#current-work-reportbackstop)을 따른다.
`authority: scoped`, work unit, partial/no-effect coverage receipt로 새 권한을 여는 것은 C가 아니다.
그런 저작이 필요하면 기존 Stage 04/05 및 사람 소유 checkpoint로 돌아간다.

## Scoped-work branch

사람이 채택한 owner의 작업은 [scoped-work reference](../scoped-work.md)의 `authority: scoped` request로 owner **unit**을
선택한다(regular-file `A`/`M` target만). 같은 다섯 CLI와 같은 request/origin/resource를 사용하고, 모든 판정은 immutable
HEAD baseline에서 한다. surface는 모든 host 동의와 공유 target AND가 필요하다. `work-selection-required`가 나온 채택 경로를
current/no-work/visual로 다시 시도하지 않는다. 채택·unit·decision binding을 새로 만들거나 넓히는 것은 구현이 아니라 사람
소유 authoring checkpoint다. current와 scoped request를 한 문서에 섞지 않는다.

## Mode/readiness-driven

Without `--work`, keep the existing stop and authority rules below.

Do not decide implementability yourself. Run the scripts and consume their output:

```bash
npm run workflow:state
npm run workflow:readiness -- --screen <SCREEN_ID> --json
```

- Read `readiness_mode`, `allowed_paths`, `forbidden_paths`, `blocking`,
  `next_actions` under the screen id.
- If readiness blocks, report `blocking` + `next_actions` and stop.
- If readiness returns `readiness_applicable: false` for an absorbed screen, do not author or
  implement that source; use the canonical `absorbed_into` target ([contract](../screen-lifecycle.md)).
- **Edit `allowed_paths` only.** Never edit `forbidden_paths`. Never widen scope
  from a `screen_entry` hint.
- Before editing each concrete path, run
  `npm run workflow:readiness -- --screen <SCREEN_ID> --path <project-relative-path> --json`
  and require `path_authorization.allowed: true`; that concrete result is the final authority.
  The shared helper keeps the forward check aligned with `workflow:forbidden-paths`:
  - **valid active hook claim** — editable by its owning screen at `rough-fixture-ui` /
    `final-fixture-ui` when the effective envelope allows the path;
  - **active API-client / `surface_kind:null`** — requires its owning screen at
    `api-integrated-ui` or above;
  - **invalid contract / deferred / conflict / non-owner / `api_required:false`** — always denied.
  Integrated v2 hook/API-client surfaces reject unowned paths even at `production-ready`.
- Stay within the allowed mode (`route-skeleton` → … → `api-integrated-ui`); do not
  reach into API/data layers an early mode forbids.
- If screen readiness exposes `delegated_shared_surfaces`, do not edit those reserved paths even when a broader screen allow glob covers them. Run `workflow:readiness -- --surface <SURFACE_ID> --json` and use the surface skill.

For a shared surface, read `surface_fact_mode`, `surface_decision_cap`, `member_cap`, `member_modes`, `allowed_paths`, `forbidden_paths`, and `path_authorization`.
Edit only the full surface/policy/member intersection. The detailed contract is [`../shared-surfaces.md`](../shared-surfaces.md).

If a related input is `not-started` / `in-progress` / `failed`, finish reconcile
first (Stage 04) — do not implement on an unreconciled input.

## Shared component midstream

If you need a shared/common component while implementing:

- **Approved & cataloged, code lands under the `roles.ui_primitive` role** → add it
  within `allowed_paths`, then run **[07](07-regenerate-derived-views.md)** to
  regenerate the component catalog (`workflow:catalog`).
- **Not approved / not cataloged** → do not silently introduce it. Propose a
  component gap (`G-xxx` `open`) and route to **[09 Human decision gates](09-human-decision-gates.md)**.
  Use an existing catalog component meanwhile.

## Boundaries

- Generated files are not hand-edited — regenerate them (Stage 07).
- Do not resolve Open Decisions, close Unknowns, accept Component Gaps, or promote
  `confirmed` (Stage 09).
- readiness pass / validate pass are mechanical ceilings, not product approval.

## After this stage — next

| Next | when |
|---|---|
| [07 Regenerate derived views](07-regenerate-derived-views.md) | a generated-view source changed (catalog primitive, route, nav edge, codegen/lint source) |
| [08 Validate and report](08-validate-and-report.md) | no generated source changed — validate and report |
