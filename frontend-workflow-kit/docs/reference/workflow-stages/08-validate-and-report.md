# Stage 08 — Validate and report

The session-end stage. Index: [`../workflow-spine.md`](../workflow-spine.md).

**Enter when** work is ready to check / hand off.

**You never skip this at session end.** Every session validates and reports.

## Validate

Run the smallest relevant checks first, then always:

```bash
npm run workflow:state        # if ScreenSpec frontmatter / body sections changed
npm run workflow:validate
```

Add `workflow:check-generated` (advisory) when route, nav, catalog, codegen, lint,
policy, or layout sources changed. `validate` pass is structural integrity, not
product approval.

## Session handoff summary

End the session with this block so the next agent can resume without re-reading the
whole workflow:

```txt
Stage completed: 06 -> 07 -> 08
Updated:
Regenerated:
Validation:
Still open:
Next recommended stage:
```

- **Stage completed** — the stages this session actually walked.
- **Updated** — workflow artifacts changed (ScreenSpec, nav, API, register rows).
- **Regenerated** — generated views refreshed in Stage 07.
- **Validation** — `workflow:validate` result (and any targeted checks).
- **Still open** — Open Decisions, Unknowns, Component Gaps, `failed`/`in-progress`
  register rows left for a human or a later session.
- **Next recommended stage** — where the next session should enter (often 09 for a
  human decision, or back to 05/06).

## After this stage — next

`end` (hand off), or **route back** to 05/06 for more authoring/implementation, or
to [09 Human decision gates](09-human-decision-gates.md) if a human-owned
transition is pending.
