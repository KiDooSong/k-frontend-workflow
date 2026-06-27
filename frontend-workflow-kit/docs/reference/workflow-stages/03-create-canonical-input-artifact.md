# Stage 03 — Create canonical input artifact

> Default kit workflow, written as **default implementation + safe extension points**
> — not a closed one-size-fits-all flow. Index:
> [`../workflow-spine.md`](../workflow-spine.md). Full contract:
> [`../input-reconciliation.md`](../input-reconciliation.md).

**Enter when** normalized input facts need to become a canonical
`docs/frontend-workflow/inputs/{input_id}.md`.

**Skip this stage when** the input artifact already exists. Then go to 04.

## Default command

```bash
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json
```

`workflow:create-input` turns a normalized payload into one canonical
`inputs/{input_id}.md`. It is the kit-owned default path. Source-specific parsing
stays in the consumer repo (Stage 01); this producer only renders already-normalized
facts. Command detail: [`../../../COMMANDS.md`](../../../COMMANDS.md).

## Extension points (adapter-friendly)

```text
<!-- Consumer repo customization:
If your repo has a source-specific producer that directly creates input artifacts,
document it here. It must still satisfy the canonical input artifact contract and
should not duplicate input_id/frontmatter rendering if workflow:create-input is available.
-->
```

- Consumer producers may **wrap** `workflow:create-input` (pass it a normalized
  payload or flags). This is the preferred extension.
- A consumer producer may **write the artifact directly** only if the output passes
  the same contract below. Direct writing that bypasses the contract is not allowed.

## Canonical input artifact contract

The output must satisfy all of:

- path `docs/frontend-workflow/inputs/{input_id}.md` (filename = `input_id`),
- canonical frontmatter (`input_id`, `input_type`, `source_type`, `source_ref`,
  `captured_at`, `captured_by`, `status`, `affected_domains`, `affected_screens`),
- **no** deprecated `suggested_scope` (use `affected_domains` / `affected_screens`),
- **no** frontmatter `summary` (the body `## Summary` section is canonical),
- body sections in the expected order (see the template),
- passes `workflow:validate` **check 11** (input artifact validation).

Single source for the shape:
[`../../../templates/input/input-artifact.template.md`](../../../templates/input/input-artifact.template.md).
Optional `source_screen_refs` render as a `## Source Screen Refs` section (absent →
no section, byte-stable) and do not change frontmatter.

## Validation

```bash
npm run workflow:validate
```

Run `workflow:validate`, or at least the input artifact validation (check 11),
before moving on.

## This stage does not

- update the Reconciliation Register,
- reconcile the input against existing docs,
- resolve / confirm anything,
- implement code.

Creating an input artifact is **not** acceptance, `confirmed` promotion, or
implementation permission. Those are separate stages.

## After this stage — next

→ [04 Reconcile input](04-reconcile-input.md). The artifact now exists; reconcile
applies it to workflow docs and registers (register-first).
