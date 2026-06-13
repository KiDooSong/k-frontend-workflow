# Work Packet And Review Artifacts Proposal

## Purpose

This note captures a proposed future workflow axis for the frontend workflow kit:

- Use a **Work Packet** as the lightweight guide, index, and human-facing feature board for a real unit of work.
- Store actual review details as separate **Review Artifacts** under a domain-specific review directory.
- Let the Work Packet link to inputs, specs, open decisions, investigations, implementation work, verification evidence, and reviews without duplicating their contents.

## Positioning

This is **not** a request to expand MVP-A immediately.

The current consolidation priority remains:

1. Make the existing axes crisp.
2. Remove contradictions between current documents and scripts.
3. Keep MVP-A bounded unless one implementation candidate is explicitly selected.

Work Packet + Review Artifacts should be treated as a **future-axis candidate** or as the single next candidate to choose after the current consolidation work is stable. It should not compete with the current Open Decisions / Input Reconciliation / Investigation cleanup.

This proposal also overlaps with `temp/review-gates-notes.md`. If adopted, this document should absorb and supersede that rough note rather than creating a parallel review schema.

This is intended as a handoff note for a Claude session that is already consolidating the current workflow documents. It should be reviewed together with:

- `frontend-workflow-kit/README.md`
- `frontend-workflow-kit/open-decisions.md`
- `frontend-workflow-kit/input-reconciliation.md`
- `frontend-workflow-kit/investigation-and-verification.md`
- `temp/review-gates-notes.md`
- `temp/claude-handoff-workflow-docs-consolidation.md`

## Problem This Solves

The kit currently has good document axes for specific concerns:

- Input reconciliation handles new product/design/API/meeting inputs.
- Open decisions handle ambiguous choices that should block or downgrade readiness.
- Investigation and verification handle long-running research and evidence gathering.
- Review gates are being discussed as a way to prevent LLM sessions from rushing through important checkpoints.

The missing layer is the practical unit of work:

> "What are we doing right now, what documents belong to this work, which reviews happened, what is still blocking implementation, and what evidence says it is done?"

Without this layer, the workflow may still be correct in pieces but difficult to operate across multiple LLM sessions. Reviews may accumulate, but there is no stable place to see which reviews are relevant to the current change.

## Proposed Shape

Use two related concepts:

1. **Work Packet**
   - A thin index and state board for one feature/change/workstream.
   - It should not contain full review bodies.
   - It links to canonical artifacts and summarizes current state.

2. **Review Artifacts**
   - Detailed review documents stored under the relevant domain.
   - Written from situation-specific templates.
   - Can accumulate over time without bloating the Work Packet.

Example directory shape:

```text
docs/frontend-workflow/domains/auth/
  work-packets/
    WP-auth-social-login.md

  reviews/
    WP-auth-social-login/
      input-review.md
      spec-review.md
      decision-review.md
      investigation-review.md
      implementation-plan-review.md
      code-review-001.md
      code-review-002.md
      verification-review.md
```

The exact path can be adjusted to the existing project convention. The important rule is:

> A Work Packet owns the index. Review Artifacts own the review content.

## Non-Goals

- Do not add script enforcement for Work Packets in MVP-A unless explicitly chosen later.
- Do not add a second readiness or implementation-allowed source of truth.
- Do not duplicate canonical Open Decision, Input, Investigation, or Review bodies inside the Work Packet.
- Do not create both this proposal and `review-gates-notes.md` as separate live schemas.

## Work Packet Responsibilities

A Work Packet should answer these questions quickly:

- What is the work item?
- Which domain/screen/feature does it touch?
- Which input artifacts are relevant?
- Which specs and templates were generated or updated?
- Which open decisions are blocking or guiding the work?
- Which investigations or verifications are required?
- Which reviews have been requested, completed, or failed?
- Which calculated readiness output should the user consult before implementation?
- What evidence supports the current readiness?

It should not be the source of truth for:

- Full review findings
- Detailed investigation notes
- Full verification evidence
- Decision resolution details
- Input source content
- Readiness or implementation permission

Those should live in their own artifacts and be linked.

## Source Of Truth Rule

Every Work Packet table is a denormalized index/cache unless explicitly stated otherwise.

Canonical sources remain:

- Inputs: input artifacts and the reconciliation register.
- Specs: the relevant ScreenSpec or output artifact.
- Decisions: the owning ScreenSpec's `Open Decisions` table.
- Investigations and verifications: their own artifact files.
- Reviews: individual Review Artifact files.
- Readiness: `workflow-state.mjs`, `readiness.mjs`, and the implementation mode policy.

A Work Packet may summarize these items for navigation, but it must not become a second canonical row for any of them. If a Work Packet summary conflicts with a canonical artifact or calculated readiness, the canonical artifact or readiness output wins.

## Work Packet Template Sketch

```md
---
artifact_type: work-packet
packet_id: WP-auth-social-login
domain: auth
status: active
current_phase: spec-review
updated_at: 2026-06-13
---

# WP-auth-social-login

## Scope

Social login and signup entry flow.

## Linked Inputs

| Input | Source | Status | Notes |
|---|---|---|---|
| IN-20260613-figma-001 | Figma | reconciled | Login entry flow changed |
| IN-20260613-meeting-001 | Meeting | reconciled | Signup policy clarified |

## Linked Specs

| Artifact | Status | Notes |
|---|---|---|
| screen-spec-login.md | draft | Needs spec review |
| screen-spec-signup.md | draft | Depends on D-002 |

## Open Decisions

| Decision | Status | Blocking Mode | Notes |
|---|---|---|---|
| D-001 | open | final-fixture-ui | Social login failure UX |
| D-002 | resolved | screen-skeleton | Signup entry placement |

## Investigations And Verification

| Artifact | Type | Status | Blocks |
|---|---|---|---|
| INV-001 | investigation | open | SDK app switching behavior |
| VER-001 | verification | planned | iOS/Android login callback |

## Reviews

| Gate | Review Artifact | Status | Reviewer | Notes |
|---|---|---|---|---|
| Input Review | reviews/WP-auth-social-login/input-review.md | passed | Codex | Inputs are traceable |
| Spec Review | reviews/WP-auth-social-login/spec-review.md | changes-requested | Codex | Signup edge cases missing |
| Decision Review | reviews/WP-auth-social-login/decision-review.md | open | Claude | D-001 needs sharper options |
| Implementation Plan Review | - | pending | - | Required before coding |
| Code Review | - | pending | - | Required after implementation |
| Verification Review | - | pending | - | Required before done |

## Current Readiness

See the latest `workflow:readiness` output for the linked screens before implementation. This packet currently has a pending Spec Review change request and links to open decision D-001.

## Next Actions

- Update login and signup ScreenSpecs from Spec Review findings.
- Refine D-001 options and ask the user to resolve or defer.
- Create Implementation Plan Review after specs and decisions are stable enough.
```

## Review Artifact Responsibilities

Review Artifacts should be specific to the review moment. They should capture:

- What was reviewed
- Which source artifacts were used
- Findings and severity
- Required changes
- Whether the gate passed, failed, or needs re-review
- Which Work Packet they belong to

They should avoid duplicating the whole Work Packet. They can link back to it.

## Relationship To Review Gates Notes

`temp/review-gates-notes.md` is an earlier rough note about where review gates may fit. This proposal refines that idea into:

- Work Packet: the index that shows which review gates belong to one work item.
- Review Artifact: the detailed file for each review event.

If this proposal is adopted, the review gate concept should be consolidated here or into the final kit documents. Do not keep separate competing ID rules, frontmatter fields, or status vocabularies across both notes.

## Provisional ID Rules

The IDs in this proposal are examples, not final kit contract.

- Work Packet example IDs use stable slugs: `WP-{domain}-{work-slug}`.
- Review Artifact example IDs use event-style IDs: `REV-{YYYYMMDD}-{domain}-{review-type}-{seq}`.

The difference is intentional for the draft: a Work Packet is a long-lived work container, while Review Artifacts are timestamped review events that may accumulate. If this future axis graduates into the kit, the ID grammar should be explicitly finalized and aligned with the rest of the artifact families.

## Review Artifact Template Families

Potential templates:

- `input-review.template.md`
  - Checks whether input artifacts are traceable, immutable, reconciled, and conflict-aware.

- `spec-review.template.md`
  - Checks ScreenSpec and related output consistency against templates, inputs, decisions, and unknowns.

- `decision-review.template.md`
  - Checks whether Open Decisions are specific, actionable, properly gated, and not hiding implementation choices.

- `investigation-review.template.md`
  - Checks whether investigation questions, evidence, environment metadata, findings, and next actions are sufficient.

- `implementation-plan-review.template.md`
  - Checks scope, affected files, risk, dependencies, and whether implementation can begin.

- `code-review.template.md`
  - Checks code behavior, regressions, missing tests, mismatch with specs/decisions, and implementation risks.

- `verification-review.template.md`
  - Checks test/browser/manual/platform evidence and whether the work can be called done.

## Review Artifact Template Sketch

```md
---
artifact_type: review
review_type: spec-review
review_id: REV-20260613-auth-spec-001
packet_id: WP-auth-social-login
domain: auth
status: changes-requested
reviewer: codex
reviewed_at: 2026-06-13
---

# Spec Review: WP-auth-social-login

## Reviewed Artifacts

| Artifact | Version/Ref | Notes |
|---|---|---|
| screen-spec-login.md | current | Primary reviewed spec |
| D-001 | open | Affects failure UX |
| IN-20260613-figma-001 | current | Source input |

## Findings

| Severity | Finding | Required Change |
|---|---|---|
| High | Signup fallback is not specified | Add fallback state and error copy |
| Medium | SDK callback edge case is unclear | Link to investigation or create Open Decision |

## Gate Result

Status: `changes-requested`

Implementation should not begin until the high-severity finding is resolved or explicitly moved into an Open Decision.

## Follow-up

- Update `screen-spec-login.md`.
- Re-run Spec Review.
```

## Status Model

Keep Work Packet status coarse:

- `draft`
- `active`
- `blocked`
- `ready-for-implementation-review`
- `implemented`
- `verified`
- `closed`

Work Packet status is a human-facing lifecycle label. It is not a readiness gate. In particular, `ready-for-implementation-review` means the packet is ready to be reviewed for implementation planning; it does not mean code changes are automatically allowed.

If a Work Packet spans multiple screens, readiness should be shown as links or a screen-by-screen rollup from calculated readiness output. The packet should not manually calculate a new combined readiness value.

Keep Review Artifact status specific:

- `pending`
- `open`
- `passed`
- `changes-requested`
- `blocked`
- `superseded`

Avoid making the Work Packet a second source of truth for review status. Long term, a script can calculate review rollups from Review Artifact frontmatter. Until then, the Work Packet table is a human-maintained index and should be treated as a summary, not the canonical review body.

## Interaction With Existing Axes

### Input Reconciliation

When a new input is reconciled, the reconciler should update or create the relevant Work Packet. The reconciliation register can list created or touched Work Packets in `Created Items` or `Touched Artifacts`.

Suggested created item ids:

- `WP-...` for Work Packet
- `REV-...` for Review Artifact, if a review was requested or created during reconciliation

### Open Decisions

Open Decisions remain the actual readiness gate. A Work Packet can summarize linked decisions, but it should not override decision readiness.

If a new input reopens a resolved decision:

- The Open Decision is reopened.
- The conflict/register preserves the previous value.
- The Work Packet links the reopened decision and points readers to calculated readiness.

### Investigation And Verification

Investigations and verifications remain their own artifacts. The Work Packet links them and shows whether they are relevant to implementation readiness.

If an investigation blocks implementation, the gate should still be represented through an Open Decision, Unknown, or explicit future readiness integration. The Work Packet should not silently become the only gate.

### Review Gates

Review Gates can begin as required rows inside the Work Packet. This avoids creating a heavy global review registry too early.

If review volume grows, Review Artifacts can later be indexed by a `review-register.md` or calculated by script.

## Prior Art To Consider

This proposal should be grounded in known workflow patterns if it graduates from temp note to kit document:

- **Shop traveler / job traveler / router**
  - A lightweight document travels with a work item, showing required process steps, quality checks, and sign-offs.
  - Useful analogy: a Work Packet travels with a feature/change and points to review gates and evidence.

- **Work package / WBS**
  - A project-management work package defines a bounded deliverable-oriented unit of work.
  - Useful analogy: a Work Packet should be scoped to a concrete change, not an entire product area.

- **Stage-Gate / Phase-Gate**
  - Work moves through gates with expected deliverables and go/change/stop decisions.
  - Useful analogy: Review Artifacts are gate evidence, while the Work Packet indexes which gates apply.

- **Epic / tracking issue**
  - A parent issue links child issues, pull requests, decisions, and evidence instead of duplicating their bodies.
  - Useful analogy: the Work Packet is an index and handoff board, not the canonical source for every linked item.

- **Spec-driven development**
  - Spec, plan, tasks, implementation, and verification are separated to reduce ambiguous implementation.
  - Useful analogy: Work Packets can show how inputs, specs, decisions, and implementation reviews relate.

- **LLM session handoff / persistent context**
  - Long-lived work needs structured state that survives session boundaries.
  - Useful analogy: a Work Packet is a feature-level persistent handoff board for human and LLM collaboration.

## Suggested Gate Placement

Default gates for medium/high-risk work:

1. Input Review
   - After input reconciliation, before specs are updated too aggressively.

2. Spec Review
   - After ScreenSpec/output docs are drafted or updated.

3. Decision Review
   - Before asking the user to resolve key Open Decisions, or before relying on resolved decisions for implementation.

4. Investigation Review
   - When an investigation produces evidence that will influence implementation or decisions.

5. Implementation Plan Review
   - Before code changes begin.

6. Code Review
   - After implementation.

7. Verification Review
   - Before closing the Work Packet.

For low-risk work, some gates can be marked `not-required` by rule or by explicit reviewer judgment. That rule should be documented later to avoid ceremony overload.

## Design Rules To Preserve

- Do not put full review text in the Work Packet.
- Do not let Work Packet status replace Open Decision readiness.
- Do not make review status both canonical in the Work Packet and canonical in Review Artifacts.
- Prefer links and short summaries in the Work Packet.
- Keep review templates situation-specific, not one giant universal review template.
- Let this start as documentation first; parser/CI enforcement can come later.

## Open Questions For Consolidation

- Should Work Packets live under `domains/{domain}/work-packets/`, or should they be global under `work-packets/` with domain fields?
- Should Review Artifacts live under `domains/{domain}/reviews/{packet_id}/`, or next to the Work Packet?
- What minimum review gates are useful if this future axis is adopted?
- Which gate statuses should downgrade readiness in the future, if any?
- Should Work Packet and Review Artifact IDs keep different grammars, or should they be unified before graduation?

## Recommendation

After the current document consolidation is stable, consider adopting Work Packet + Review Artifacts as one future conceptual axis. If adopted, keep the first implementation lightweight:

1. Add a short design document or README section that defines Work Packets.
2. Add one Work Packet template.
3. Add a small set of review templates.
4. Update Input Reconciliation to say new inputs may create or update Work Packets.
5. Update the future MVP/roadmap document to keep script enforcement out of the immediate scope unless already needed.

This gives the workflow a durable place to collect cross-session context without turning every review into a global registry problem too early.
