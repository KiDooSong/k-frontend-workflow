# Open Decisions — local rows and cross-screen references

Open Decisions are active readiness gates. A decision has exactly one canonical
row and remains in that row after resolution. This contract supports two homes:

- a decision affecting one screen stays in that ScreenSpec's `## Open Decisions` table;
- a decision referenced by multiple screens lives in
  `global/open-decisions.md`, the optional `open-decision-register` artifact.

Both homes use the same six-column table and the same `open|resolved` lifecycle.
The global register is not the future append-only `decision-log.md`: it owns live
gate-bearing rows, not supersession or decision history.

## Canonical global register

Create the register only when cross-screen references are needed:

```yaml
---
artifact_id: open-decision-register
artifact_type: open-decision-register
status: draft
last_reviewed: "2026-07-15"
---
```

Its canonical path and template are:

```txt
docs/frontend-workflow/global/open-decisions.md
tools/frontend-workflow/templates/global/open-decision-register.template.md
```

The body contains exactly one canonical table:

```md
## Open Decisions

| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-120 | Which shared empty state should we use? | compact / illustrated | final-fixture-ui | PM | open |
```

Screen membership is never repeated in the register. Referring artifacts own
that relation.

## Referencing from a ScreenSpec

Add the optional frontmatter array to every affected ScreenSpec:

```yaml
decision_refs:
  - D-120
```

References are unique, non-empty strings and resolve exactly and
case-sensitively. In this contract they resolve only to the global register;
another ScreenSpec's local row is never a valid target. A global row may have
zero or one current ref without producing an orphan error.

`workflow:state` exposes every resolved reference under
`derived.decision_refs`, including rows whose status is `resolved`. An open row
is also merged into `derived.blocking_decisions` with canonical provenance:

```yaml
source:
  artifact_id: open-decision-register
  artifact_type: open-decision-register
  path: global/open-decisions.md
```

`workflow:readiness` continues to apply the existing rule:

```txt
readiness_mode = min(fact_mode, decision_cap)
```

Therefore one open global row caps every referring screen, preserves `source`
on its structured blocker, and does not affect unrelated screens. A resolved
reference remains visible in state but does not block.

## Validation and fail-closed behavior

`workflow:validate` check 9 validates local and global tables together. It
enforces the six columns and row rules, project-wide ID uniqueness, reference
shape, and exact resolution. The state path also fails closed before validate:

- a referenced register is missing or structurally unparseable;
- a target is missing, duplicated, or also exists as a local row;
- a referenced row is malformed;
- `decision_refs` is scalar, empty-valued, or duplicated.

Only screens declaring the bad reference receive the corresponding
`malformed_decisions` entry and are capped at `docs-only`. Repositories with no
register and no `decision_refs` retain the local-only state/readiness behavior.

## Human-owned transitions

Agents may add an open row and references, or reopen a resolved row when a
source-backed conflict requires it. `open → resolved`, re-resolution, and other
gate-lowering transitions remain human-only. Do not migrate or resolve rows
automatically.

## Explicit migration

To replace an existing mirrored workaround:

1. Choose one canonical ID and preserve its current status and selected option.
2. Create or update `global/open-decisions.md` with that one row.
3. Remove duplicated rows from member ScreenSpecs.
4. Add the canonical ID to each ScreenSpec's `decision_refs`.
5. Run `workflow:state`, readiness for every affected screen, and
   `workflow:validate`.

This procedure must not confirm, resolve, or otherwise lower a gate.
