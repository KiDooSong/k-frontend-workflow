# Doc Ownership — one fact, one home

This kit's guidance lives in **layers** so a skill stays a compact trigger +
procedure, while detailed contracts live in references that are pulled in only when
relevant (progressive disclosure). This page is the map of where each repeated fact
is canonically owned, so the same rule is not re-explained in five places.

## The layers

```txt
AGENTS.md / CLAUDE.md            start the agent; point at the spine
  → workflow-spine.md            numbered stage index ("which stage am I in?")
    → workflow-stages/00-…       router: map the ask to the current stage
    → workflow-stages/NN-*.md    operational procedure for the current stage   (middle layer)
        → task-artifact-matrix.md    secondary-artifact lookup ("what else must I update?")
        → generated-files.md         generated/do_not_edit regeneration authority
        → reference docs             detailed contracts (input-reconciliation, screen-identity, …)
skills/*/SKILL.md                compact task executors that LINK to the above
```

Read top-down only as far as the task needs. A skill names the critical invariants
inline and links the rest; it does not restate the references.

## Ownership map

| Concept | Canonical home | Skills should |
|---|---|---|
| stage routing | [`workflow-spine.md`](workflow-spine.md) + [`workflow-stages/00-start-here.md`](workflow-stages/00-start-here.md) | link only |
| current-stage operational procedure | `workflow-stages/NN-*.md` (the stage doc, e.g. [Stage 04](workflow-stages/04-reconcile-input.md)) | link to the stage doc; repeat only critical invariants |
| task → secondary artifact follow-up | [`task-artifact-matrix.md`](task-artifact-matrix.md) | link when secondary updates are needed |
| generated / `do_not_edit` regeneration | [`generated-files.md`](generated-files.md) | link; do not duplicate the table |
| input artifact contract | [`input-artifact.template.md`](../../templates/input/input-artifact.template.md) + [`input-reconciliation.md`](input-reconciliation.md) (Stage 03) | summarize only |
| register-first / retry / check 12 | [`input-reconciliation.md`](input-reconciliation.md) (Stage 04) | keep the critical 2–3 bullets inline |
| classification types | [`input-reconciliation.md`](input-reconciliation.md) §Classification | link only |
| conflict vs gate (Open Decision) | [`input-reconciliation.md`](input-reconciliation.md) §Conflict Handling | short reminder only |
| ambiguity → Unknown / Open Decision / stop | [`ambiguity-triage.md`](ambiguity-triage.md) | short reminder only |
| screen source aliases / canonical identity | [`screen-identity.md`](screen-identity.md) (Stage 02) | link from source / reconcile / implement |
| implement `allowed_paths` / `forbidden_paths` | readiness output + [Stage 06](workflow-stages/06-implement-screen-or-code.md) | state the invariant only |
| visual vs behavior split | [`input-reconciliation.md`](input-reconciliation.md) §Visual/Figma + [`figma-component-mapping.template.md`](../../templates/screen/figma-component-mapping.template.md) | short reminder only |
| component gap rules (proposal-only) | [`component-gap-register.template.md`](../../templates/global/component-gap-register.template.md) + [`task-artifact-matrix.md`](task-artifact-matrix.md) | short reminder only |
| policy draft vs live policy | [Stage 10](workflow-stages/10-policy-layout-tier3-changes.md) + [`CONVENTIONS.md`](../../CONVENTIONS.md) §Tier3 + [`input-reconciliation.md`](input-reconciliation.md) §Tier3 | short reminder only |
| route / screen / API conventions | [`CONVENTIONS.md`](../../CONVENTIONS.md) | link only |
| optional web E2E evidence | [Stage 08](workflow-stages/08-validate-and-report.md) + [`e2e-agent`](../../skills/e2e-agent/SKILL.md) | keep non-gating boundary inline; link the rest |
| e2e behavioral rules (assertion / locator / coverage) | [`e2e-behavioral-rules.md`](e2e-behavioral-rules.md) | keep "assert app state not browser artifacts; scope rows by container testid+id" inline; link the catalog + examples |
| e2e Playwright setup / path model / output Kit Mapping | [`e2e-playwright-agents.md`](e2e-playwright-agents.md) | link only (setup, read once) |
| e2e consumer adoption procedure (install / commit / ignore / run sequence + checklist) | [`e2e-consumer-adoption.md`](e2e-consumer-adoption.md) | link only; it sequences the procedure and links setup / path / rules to their homes (does not duplicate the catalog) |
| command syntax | [`COMMANDS.md`](../../COMMANDS.md) | link only |

## The dedup rule

If the same paragraph, table, or rule appears in **2+ skills/docs**, it has no
single home. Pick the canonical home from the table above (or add a row), keep the
full text there, and replace every other copy with a one-sentence summary + a link.

A skill keeps a rule inline **only** when an executor needs it in-hand to act safely
without a second read — register-first, gate-raising-only,
`allowed_paths`/`forbidden_paths`, "do not invent canonical screen ids from source
codes". Everything explanatory (the why, the examples, the full tables) lives in the
reference and is linked, not copied.
