# Stage 06 — Implement screen or code

Implement within the readiness gate's allowed mode and paths. Index:
[`../workflow-spine.md`](../workflow-spine.md). Skill:
[`../../../skills/implement-screen/SKILL.md`](../../../skills/implement-screen/SKILL.md).
For shared behavior code, use [`implement-shared-surface`](../../../skills/implement-shared-surface/SKILL.md).

**Enter when** code changes are requested.

**Skip this stage when** the task is docs-only / no code change. Then go to 07.

## Mode/readiness-driven

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

## Current-work branch

한 사용자 작업에 여러 origin/target이 있고 **기존 current 권한 안에서만** 구현하려면
[current-work reference](../current-work.md)의 `--work` 봉투를 사용한다. agent가 canonical
input/owner/target에서 request를 조립하고 readiness, packet/run, report/backstop에 같은 request와
resource 옵션을 전달한다. `requested_mode`는 실제 current ceiling 이하여야 하고 모든 concrete
path가 기존 helper에서 허가돼야 한다. denied request를 버리거나 낮은 mode의 path를 합쳐 ready로
만들지 않는다.

`authority: scoped`, work unit, partial/no-effect coverage receipt로 새 권한을 여는 것은 이 단계의
current 분기가 아니다. 그런 저작이 필요하면 기존 Stage 04/05 및 사람 소유 checkpoint로 돌아간다.

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
