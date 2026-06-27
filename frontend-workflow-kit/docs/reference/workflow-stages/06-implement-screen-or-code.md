# Stage 06 — Implement screen or code

Implement within the readiness gate's allowed mode and paths. Index:
[`../workflow-spine.md`](../workflow-spine.md). Skill:
[`../../../skills/implement-screen/SKILL.md`](../../../skills/implement-screen/SKILL.md).

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
- **Edit `allowed_paths` only.** Never edit `forbidden_paths`. Never widen scope
  from a `screen_entry` hint.
- Stay within the allowed mode (`route-skeleton` → … → `api-integrated-ui`); do not
  reach into API/data layers an early mode forbids.

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
