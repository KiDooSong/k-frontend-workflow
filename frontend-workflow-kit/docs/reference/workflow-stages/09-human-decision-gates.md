# Stage 09 — Human decision gates

The side stage for human-owned transitions. You drop into it from anywhere and
return to 07/08. Index: [`../workflow-spine.md`](../workflow-spine.md).

**Enter when** a task asks to resolve / accept / confirm human-owned state.

**Skip this stage when** no human decision is involved.

## What is human-owned

Agents **raise** gates; people **lower** them. These transitions need an explicit
human ask — an agent does not perform them on its own initiative:

- resolve an **Open Decision** (`open → resolved`),
- close an **Unknown** (`open → resolved`),
- accept a **Component Gap** (`G-xxx open → accepted`),
- promote `status: confirmed` (including Copy Keys `draft → confirmed`),
- replace live policy or promote a hard CI gate (see [10](10-policy-layout-tier3-changes.md)),
- re-resolve a reopened decision/conflict.

The same rule applies to ScreenSpec-local rows and canonical cross-screen rows.
For global ownership, reference fan-out, and migration, see
[`../open-decisions.md`](../open-decisions.md).

What an agent *may* do without a human: add an `open` decision/conflict/unknown/gap,
reopen a resolved decision (raising the gate), link evidence to an Unknown while
keeping it `open`.

## When the user authorizes a transition

Only then, and only the specific transition asked for:

1. Update the human-owned row/status with approval metadata.
2. Update any docs whose behavior the decision changes.
3. If behavior changed a generated source, go to [07](07-regenerate-derived-views.md).
4. Re-run [08](08-validate-and-report.md): `workflow:state` → `workflow:readiness`
   → `workflow:validate`.

Keep linked rows consistent — e.g. when a reopened decision is re-resolved, close
the conflict that reopened it. See
[`../input-reconciliation.md`](../input-reconciliation.md) for the
conflict/decision coupling, and
[`../task-artifact-matrix.md`](../task-artifact-matrix.md) for per-task follow-ups.

## After this stage — next

→ [07](07-regenerate-derived-views.md) if a generated source changed, then
→ [08](08-validate-and-report.md).
