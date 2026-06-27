# Workflow Inputs

This directory holds canonical **input artifacts** created by `workflow:create-input`.
Each file is one captured input (Figma / planning / API / meeting / QA / testID / …),
keyed by its `input_id`. The filename is always `{input_id}.md`.

This `README.md` is a human/agent-maintained guide — it is **not** an input artifact.
`workflow:validate` (check 11) skips `README.md` / `index.md` under `inputs/**`.

## Layout

Flat layout is the default and is fully supported:

```
docs/frontend-workflow/inputs/{input_id}.md
```

For larger repos, group inputs by domain (recommended). `workflow:create-input`
writes grouped output when you pass a grouping flag:

```
docs/frontend-workflow/inputs/{domain}/{input_id}.md     # --group-by domain (one domain)
docs/frontend-workflow/inputs/_multi/{input_id}.md       # --group-by domain (multiple domains)
docs/frontend-workflow/inputs/_unknown/{input_id}.md     # --group-by domain (no resolved domain)
docs/frontend-workflow/inputs/{path}/{input_id}.md       # --input-subdir {path}
```

Recommended top-level groups: one folder per domain (`auth/`, `main/`, `profile/`, …),
plus `_multi/` for cross-domain inputs and `_unknown/` for inputs whose screen
identity is not resolved yet.

## Invariants (do not break)

- `input_id` is **globally unique** across every subdirectory.
- The file basename always equals `{input_id}.md`.
- The Reconciliation Register is keyed by `input_id`, never by path — moving a file
  into a subdirectory does not change its register row.
- `supersedes` resolves globally, so it works across subdirectories.
- `README.md` / `index.md` in this tree are guides/indexes, not input artifacts.

## Commands

- Create an input: `workflow:create-input` (see `COMMANDS.md`; add `--group-by domain`
  or `--input-subdir <path>` to group).
- Validate input shape: `workflow:validate` (check 11 scans `inputs/**` recursively).
- Apply an input: `reconcile-input` (records a row in the Reconciliation Register).

Do not edit generated or reconciled docs directly from a raw source — capture an
input artifact first, then reconcile. Full contract: `docs/reference/input-reconciliation.md`.
