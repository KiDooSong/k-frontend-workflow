# Inputs — {domain}

Input artifacts captured for the `{domain}` domain. Each filename is `{input_id}.md`.

This `README.md` is a human/agent-maintained index — it is a guide, **not** an input
artifact, and `workflow:validate` skips it. Keep one row per `input_id`.

| Input ID | Source Type | Affected Screens | Summary | Reconcile Status |
|---|---|---|---|---|
| {IN-YYYYMMDD-source-NNN} | {figma\|planning-doc\|api-doc\|…} | {SCREEN_ID, …} | {one-line summary} | {not-started\|in-progress\|reconciled\|failed} |

`input_id` is globally unique across all input subdirectories. The Reconciliation
Register (`_meta/reconciliation-register.md`) remains the source of truth for
Reconcile Status — this table is only a convenience index for the domain.
