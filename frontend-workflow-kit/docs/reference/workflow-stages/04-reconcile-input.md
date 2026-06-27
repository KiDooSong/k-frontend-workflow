# Stage 04 — Reconcile input

Apply a canonical input artifact to the existing workflow docs and registers.
Index: [`../workflow-spine.md`](../workflow-spine.md). Full contract:
[`../input-reconciliation.md`](../input-reconciliation.md). Skill:
[`../../../skills/reconcile-input/SKILL.md`](../../../skills/reconcile-input/SKILL.md).

**Enter when** an input artifact should update workflow docs/registers.

**Skip this stage when** no new input is involved. Then go to 05/06/08.

## Register-first

Write the Reconciliation Register row **before** touching any target doc. If a
session is interrupted, the pending row is what tells the next run that work was
in flight. The register row's `Reconcile Status` expresses the reconcile *action*,
not the rollup of child decisions.

## Existing row → action

Look up the `input_id` in `_meta/reconciliation-register.md` first:

| Existing `Reconcile Status` | Action |
|---|---|
| `reconciled` | **Stop.** Already processed. Re-process only via a new `input_id` + `supersedes` (changed content / new snapshot). |
| `in-progress` | **Resume** that row. Do not add a new row. |
| `failed` | **Reuse** the row; set/keep `in-progress` while retrying. Preserve the prior failure reason in `Result` (or append a retry note). |
| `not-started` | **Reuse** the row; move it to `in-progress`. |
| (no row) | Write a new row first (`in-progress`), before any doc edit. |
| invalid enum / duplicate row / missing required columns | Fix the register structure first. |

## Screen identity inside reconcile

Reconcile may update docs and raise/reopen decisions, gaps, and unknowns — but it
is **not** where canonical screen identity is invented.

- **Input references an unknown/new screen, or carries a raw source code as
  `affected_screens`** → go back to [02 Screen identity / source mapping](02-screen-identity-source-mapping.md).
  Resolve the mapping (or leave a `candidate`/`scope-unclear` row), then continue.
- **Identity is confirmed but the ScreenSpec is missing** → run
  `workflow:create-screen` (given the canonical id), then continue reconcile.
- **Do not invent screen identity in reconcile.** Identity creation is only
  human-confirmation or explicit `workflow:create-screen`. See
  [`../screen-identity.md`](../screen-identity.md).

## What reconcile may and may not do

- May: simple source-backed doc updates; add Open Decisions / Conflicts / Unknowns
  / Component Gaps as `open`; reopen a resolved decision (raising the gate).
- May not: resolve decisions, close Unknowns, accept gaps, promote `confirmed`,
  edit code/tests/generated files, replace live policy. Agents raise gates; people
  lower them (Stage 09).

## After this stage — next

| Next | when |
|---|---|
| [05 Author workflow contracts](05-author-workflow-contracts.md) | the input drives ScreenSpec/nav/API/visual authoring |
| [06 Implement screen or code](06-implement-screen-or-code.md) | contracts are current and code is requested |
| [08 Validate and report](08-validate-and-report.md) | reconcile only — run `workflow:state` → `workflow:readiness` → `workflow:validate` and report |

When done, set the row to `reconciled` and fill `Result` / `Touched Artifacts` /
`Created Items`. A child decision left `open` does not block marking reconcile
`reconciled` — readiness handles that gate.
