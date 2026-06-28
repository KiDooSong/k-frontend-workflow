---
artifact_id: session-learnings
artifact_type: session-learnings
status: draft
last_reviewed: "{YYYY-MM-DD}"
---

# Session Learnings

> A lightweight **review backlog** of lessons discovered during LLM-assisted workflow
> sessions. It is **not** a source of truth, **not** a gate, and **not** an automatic
> memory store. Nothing here is a fact until a human reviews it.
>
> Storage location: `docs/frontend-workflow/_meta/session-learnings.md` — the `_meta/`
> family (like `reconciliation-register.md` and `screen-source-map.md`), so `validate`
> skips it from authoring checks: absence is fine for cold-start repos and presence
> never hard-fails. Append with the `capture-learning` skill, or by hand.
>
> Review periodically and **manually** promote useful entries to: kit issues, consumer
> repo tasks, local conventions, skill updates, or docs updates. Promotion is never
> automatic — this file does not file GitHub issues.

## How to use

Append a new entry when a session discovers a workflow gap, a stale doc, a missing
convention, a `validate` false positive, a confusing consumer-vs-kit boundary, or a
repeated manual workaround. A session may produce zero, one, or several entries —
capturing a learning is **optional**, never required, and never a gate.

**Capture context, not just a complaint.** A one-line "component catalog stale" is
useless three weeks later. Write the entry so a future reviewer can act on it without
re-running the session.

> Bad entry: `component catalog stale`
>
> Good entry: While implementing `AUTH-SIGNUP-EMAIL` in Stage 06, the agent created a
> shared component under `src/components/ui` after checking readiness `allowed_paths`. It
> did not run `workflow:catalog`, so `docs/frontend-workflow/design/component-catalog.md`
> stayed stale. The task-artifact matrix says to regenerate the catalog after approved
> shared-component edits, but nothing reminded the agent at the right point. Candidate
> kit action: add a final-stage prompt/check in implement-screen or Stage 07.

**Never record secrets**, private raw source contents, tokens, credentials, or sensitive
user data. Use file paths, artifact ids, command names, screen/input/decision ids, and
redacted summaries instead.

## Minimum context checklist

A useful learning answers at least **5** of these:

- [ ] What were we trying to do?
- [ ] Which workflow stage were we in (00–10)?
- [ ] Which docs/files/commands did we read or run?
- [ ] What did we expect?
- [ ] What actually happened?
- [ ] What workaround did we use?
- [ ] Which artifact/screen/input/decision was involved?
- [ ] Is this likely a kit issue, a consumer repo issue, or both?
- [ ] What should a future reviewer inspect first?

The point is not volume; it is **future reconstructability**.

## How to review (manual, periodic)

1. Group entries by **Repo Scope** and **Candidate Follow-up**.
2. Promote clear `frontend-workflow-kit` entries to kit GitHub issues or PR prompts.
3. Promote consumer repo entries to local tasks, docs, conventions, or skill updates.
4. Discard or mark entries that are no longer relevant.
5. Do **not** treat captured entries as facts until reviewed. Move `Status` to
   `triaged` / `promoted` / `discarded` as you go, and update `last_reviewed`.

Do not build an automatic issue filer against this file. Review stays human-owned.

## Entries

> Copy the block below for each new learning. Use the next free `LRN-####` id
> (zero-padded, monotonic). If information is missing, write `unknown` — do not invent.
> Delete this example block once real entries exist.

### LRN-0001 — {short title}

| Field | Value |
|---|---|
| Date | {YYYY-MM-DD} |
| Repo Scope | {consumer-repo \| frontend-workflow-kit \| both \| unknown} |
| Workflow Stage | {00–10 or n/a} |
| Trigger | {what the user/agent was trying to do} |
| Context Read | {docs/files/commands inspected} |
| Expected | {what should have happened} |
| Actual / Friction | {what happened instead} |
| Workaround Used | {what was done this time} |
| Evidence | {paths, commands, PRs, input ids, screen ids, decision ids} |
| Suspected Root Cause | {brief hypothesis; mark uncertain if needed} |
| Impact | {low \| medium \| high} |
| Candidate Follow-up | {doc update \| skill update \| script bug \| consumer convention \| no action \| unknown} |
| Owner Guess | {kit \| consumer repo \| both \| human decision} |
| Status | {captured \| triaged \| promoted \| discarded} |

#### Notes
- {optional detail}
