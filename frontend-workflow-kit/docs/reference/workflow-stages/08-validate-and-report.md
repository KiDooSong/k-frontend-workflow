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

## Optional web E2E evidence

When the user asks for web E2E, Playwright, web verification, test generation, or
repairing a failing web test, use the
[`e2e-agent`](../../../skills/e2e-agent/SKILL.md) skill. It can plan beside Stage
05, generate within Stage 06 boundaries after explicit request, and verify/heal
as Stage 08 evidence.

This is **optional and never a gate**. Playwright green does not resolve Open
Decisions, accept Component Gaps, promote `confirmed`, raise readiness, or prove
native/mobile correctness. Link or summarize results in the handoff summary, a
run report, or a consumer-defined verification note; do not require a separate
canonical matrix.

## Capture session learnings (optional)

If the session discovered a workflow gap, a stale doc, a confusing consumer-vs-kit
boundary, a `validate` false positive, or a repeated manual workaround, append a
session learning with the [`capture-learning`](../../../skills/capture-learning/SKILL.md)
skill. It writes one structured entry to
`docs/frontend-workflow/_meta/session-learnings.md` (template:
[`../../../templates/meta/session-learnings.template.md`](../../../templates/meta/session-learnings.template.md)).

This is **optional and never a gate** — capture context, not a one-line complaint, do
not record secrets, and do not file issues automatically. Review and promotion stay
manual.

## Session handoff summary

End the session with this block so the next agent can resume without re-reading the
whole workflow:

```txt
Stage completed: 06 -> 07 -> 08
Updated:
Regenerated:
Validation:
Still open:
Learnings captured:
- LRN-0007: {title} ({scope}, {candidate follow-up})
Next recommended stage:
```

- **Stage completed** — the stages this session actually walked.
- **Updated** — workflow artifacts changed (ScreenSpec, nav, API, register rows).
- **Regenerated** — generated views refreshed in Stage 07.
- **Validation** — `workflow:validate` result (and any targeted checks).
- **Still open** — Open Decisions, Unknowns, Component Gaps, `failed`/`in-progress`
  register rows left for a human or a later session.
- **Learnings captured** — any `LRN-####` entries appended to `session-learnings.md`
  this session, with scope and candidate follow-up. Omit the line if none.
- **Next recommended stage** — where the next session should enter (often 09 for a
  human decision, or back to 05/06).

## After this stage — next

`end` (hand off), or **route back** to 05/06 for more authoring/implementation, or
to [09 Human decision gates](09-human-decision-gates.md) if a human-owned
transition is pending.
