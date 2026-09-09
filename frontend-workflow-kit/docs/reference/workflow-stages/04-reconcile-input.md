# Stage 04 — Reconcile input

Apply a canonical input artifact to the existing workflow docs and registers.
Index: [`../workflow-spine.md`](../workflow-spine.md). Full contract:
[`../input-reconciliation.md`](../input-reconciliation.md). Skill:
[`../../../skills/reconcile-input/SKILL.md`](../../../skills/reconcile-input/SKILL.md).

**Enter when** an input artifact should update workflow docs/registers, including
remaining scope of an existing `partially-reconciled` input.

**Skip this stage when** neither new input nor remaining reconciliation work is
involved. Then go to 05/06/08.

## Register-first

Write the Reconciliation Register row **before** touching any target doc. If a
session is interrupted, the pending row is what tells the next run that work was
in flight. The register row's `Reconcile Status` expresses the reconcile *action*,
not the rollup of child decisions.

## Existing row → action

Look up the `input_id` in `_meta/reconciliation-register.md` first:

| Existing `Reconcile Status` | Action |
|---|---|
| `reconciled` | **Stop.** Already processed. Re-process only via a new `input_id` + `supersedes` (changed content / new snapshot). Do not reissue an unchanged snapshot to split rounds. |
| `partially-reconciled` | Read the immutable input, cumulative Items, current docs and this input's `## Partial Reconciliation Notes`; identify remaining scope, then set the **same Summary row** to `in-progress` before any target edit. Do not repeat completed effects. |
| `in-progress` | **Resume** that row. Do not add a new row. |
| `failed` | **Reuse** the row; set/keep `in-progress` while retrying. Preserve the prior failure reason in `Result` (or append a retry note) and any remaining-scope notes. |
| `not-started` | **Reuse** the row; move it to `in-progress`. |
| (no row) | Write a new row first (`in-progress`), before any doc edit. |
| invalid enum / duplicate row / missing required columns | Fix the register structure first. |

The [checkpoint protocol](../input-reconciliation.md#partial-reconciliation-checkpoints)
is shared by v1/v2. Correcting a historically false `reconciled` marker requires
explicit maintenance/human confirmation against the original input and recorded
effects; it does not disable the ordinary **Stop** rule. See
[upgrade notes](../upgrade-notes.md#partial-reconciliation-checkpoints-232).

## Screen identity inside reconcile

Reconcile may update docs and raise/reopen decisions, gaps, and unknowns — but it
is **not** where canonical screen identity is invented.

- **Input references an unknown/new screen, carries a raw source code, or uses a
  `raw:flow/...` token in `affected_screens`** → screen identity resolution goes
  back to [02 Screen identity / source mapping](02-screen-identity-source-mapping.md).
  Resolve the mapping (or leave a `candidate`/`scope-unclear` row), then continue.
  This does not make the whole flow-shaped/domain-level input failed: source-backed
  domain/app-level facts may still be reconciled via the routing table in
  [`../input-reconciliation.md`](../input-reconciliation.md#flow-shaped--domain-level-input).
- **Screen-level movement waits for identity.** Do not update ScreenSpec
  Interaction Matrix rows, screen route/entry details, or screen-to-screen movement
  until source alias / `source_screen_refs` / human-confirmed canonical identity is
  available.
- **Identity is confirmed but the ScreenSpec is missing** → run
  `workflow:create-screen` (given the canonical id), then continue reconcile.
- **Do not invent screen identity in reconcile.** Identity creation is only
  human-confirmation or explicit `workflow:create-screen`. See
  [`../screen-identity.md`](../screen-identity.md).

## Before classification — scoped decisions

After register-first and scope/identity checks, follow the
[decision comparison procedure](../input-reconciliation.md#decision-aware-preclassification)
for each fact: relevant ScreenSpec `## Unknowns` / `## Open Decisions` and global
canonical rows reached by `decision_refs`, then current body / Domain Rules / Copy
Keys, then relevant decision history and linked evidence (including superseding
records). Verify the actual choice, scope, and current validity: **read order is
not authority order**. Producer hints and manual inputs follow the same check.
Apply this procedure again to the remaining scope when resuming a partial input.

An implementation not following an existing decision, a rule recorded outside the
body, and intentional absence are not automatically new decisions or component
gaps. Record useful evidence as an actual document update; hand implementation
follow-up to 05/06, not code edits here. A genuinely conflicting new requirement
still requires same-item Conflict `create-open` plus Decision `reopen`, preserving
the old value. Originally open U-/D- answers retain their `link-evidence` route and
status. Do not invent updates, require a history file, or silently choose between
inconsistent authorities; see the linked procedure for uncertainty handling.

## What reconcile may and may not do

- May: simple source-backed doc updates; add Open Decisions / Conflicts / Unknowns
  / Component Gaps as `open`; reopen a resolved decision (raising the gate).
- May not: resolve decisions, close Unknowns, accept gaps, promote `confirmed`,
  edit code/tests/generated files, replace live policy. Agents raise gates; people
  lower them (Stage 09).

## Current-round checkpoint versus whole-input completion

A normal partial checkpoint requires some scope actually handled, consistent target
edits, all required gate-raising, and complete effect groups. A known conflict cannot
be hidden in notes; Conflict `create-open` + Decision `reopen` must be complete in the
**same round and Item**. No work done is not partial: preserve the existing meanings
of `not-started`, `in-progress` and `failed` for unstarted/interrupted/failed work.

Preserve the immutable input bytes, `input_id`, `supersedes`, existing Item IDs and
historical effects. Append only new actual effects to the same Items table; do not
invent effects for unread scope, renumber, replay or rewrite prior effects. Recompute
Summary Classification / Touched Artifacts / Created Items from **all rounds' cumulative
Items**, not only this round. The exact 8/10-column and v1/v2 contracts stay unchanged.

- **Current scope finished, input scope remains:** after canonical Summary/Items,
  update `## Partial Reconciliation Notes` under this input ID with handled scope and
  evidence, unhandled original pointers, stop reason, next action and owner/linked work
  (explicitly unknown if unassigned). Set the same row to `partially-reconciled`;
  v2 recommends `Result=pending`, with existing Result warnings and v1 free text preserved.
- **All input scope classified and routed:** set the same row to `reconciled` and an
  appropriate existing Result. A child decision left `open` does not make this partial;
  readiness handles that gate. Update the notes to say no scope remains or label old
  checkpoints historical. Do not resolve children to obtain completion.

In both cases run `workflow:state` → `workflow:readiness` → `workflow:validate` and the
same review stop checks. `RR-LIFECYCLE-101` stays warning-only under default and
`--enforce`; `in-progress`/`failed` and structure errors remain hard, while no row /
`not-started` retain enforce promotion. A partial marker does not exempt any other error.
The reviewer rejects absent/unactionable notes, unidentified remaining scope or repeated
completed effects even if static validation passes; no prose parser is added.
Report **current-round scope finished / whole input incomplete / next scope** separately.
Never report an unfinished input as accepted or fully complete.

## After this stage — next

| Next | when |
|---|---|
| [04 Reconcile input](04-reconcile-input.md#existing-row--action) | a later round resumes the same partial input from its notes and original source |
| [05 Author workflow contracts](05-author-workflow-contracts.md) | the handled scope drives ScreenSpec/nav/API/visual authoring |
| [06 Implement screen or code](06-implement-screen-or-code.md) | current canonical contracts and existing readiness/path permissions authorize the requested scope |
| [08 Validate and report](08-validate-and-report.md) | reconcile only, whether a partial checkpoint or whole-input completion |

Partial warning-only is **not implementation permission** for unhandled scope, nor a
new global deny for unrelated work. General no-intent mode/paths stay independent of
register status. `visual-refresh` still requires the selected input's exact
`reconciled + accepted` and single-item conditions: partial + pending or accepted is
rejected (`VR-RR-005`), and completed multi-item input remains ineligible (`VR-RR-008`).
Use canonical Open Decisions for needed gates; notes never replace them.

## Contract v2 registers and review

If the register frontmatter declares `reconciliation_contract: 2`, also author the
`## Reconciliation Items` effect rows alongside the summary row — grammar, routing
matrix, and provenance floor live in
[`../input-reconciliation.md`](../input-reconciliation.md#reconciliation-contract-v2-opt-in).
Review of this stage's output follows `review_profile: reconcile-stage04-v1`
([`../reconcile-review-rubric.md`](../reconcile-review-rubric.md)): reviewers check
routing / source backing / gate-raising boundary / scope and checkpoint completeness,
submit all required findings in one round, and stop when the current-round stop
condition is met — final fidelity of provisional artifacts is not a pass condition here.

When Stage 04 creates a new Figma mapping or explicitly opts a legacy mapping in, write
`provenance_contract: 1`, every Component Mapping `` `M-xxx` · `` key, and every matching
5-column Mapping Provenance row in the **same edit**. Do not add only the contract field.
Source Unit uses the shared enum (`instance` = Figma component instance, `record` = API/domain record);
Evidence uses the same input ref grammar as Reconciliation Items. Raw source collection remains
consumer-owned. This does not authorize resolve/confirm/accept or raise confidence.
