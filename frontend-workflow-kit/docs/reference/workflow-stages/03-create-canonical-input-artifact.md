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

## Output location (flat default, grouped optional)

Flat `inputs/{input_id}.md` is the default and stays supported. For large repos,
group output (opt-in) so `inputs/` does not become a flat pile of dozens of files:

- **Single-domain input** → `--group-by domain` writes `inputs/{domain}/{input_id}.md`.
- **Cross-domain input** → `--group-by domain` writes `inputs/_multi/`, or pass an
  explicit `--input-subdir <path>` when you want a deliberate grouping.
- **Unmapped source input** (screen identity not resolved yet) → `--group-by domain`
  writes `inputs/_unknown/`, or keep it flat until identity is resolved in Stage 02.
- Whatever the directory, the filename stays `{input_id}.md`, `input_id` stays
  globally unique, and `workflow:validate` check 11 scans `inputs/**` recursively.
- Preserve `source_screen_refs` (Stage 01) so screen-identity mapping survives into
  reconcile regardless of which subdirectory the artifact lands in.

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

- path `docs/frontend-workflow/inputs/{input_id}.md` — or a grouped subpath
  `inputs/{domain}/{input_id}.md` / `inputs/{path}/{input_id}.md` (filename always =
  `input_id`; `input_id` is globally unique across subdirectories),
- canonical frontmatter (`input_id`, `input_type`, `source_type`, `source_ref`,
  `captured_at`, `captured_by`, `status`, `affected_domains`, `affected_screens`),
- `captured_at` is a hard RFC3339-with-timezone value for every v1/v2 input (`IP-001`),
- **no** deprecated `suggested_scope` (use `affected_domains` / `affected_screens`),
- **no** frontmatter `summary` (the body `## Summary` section is canonical),
- body sections in the expected order (see the template),
- passes `workflow:validate` **check 11** (input artifact validation).

Single source for the shape:
[`../../../templates/input/input-artifact.template.md`](../../../templates/input/input-artifact.template.md).
Optional `source_screen_refs` render as a `## Source Screen Refs` section (absent →
no section, byte-stable) and do not change frontmatter.


### Optional Input Fidelity v2

Use `input_contract: 2` only through `--from-json`/`--from-yaml` structured payloads. It records
raw-source extraction and verification independently from `confidence`:

```yaml
input_contract: 2
fidelity:
  extraction: vision-verbatim
  verification: verified
  verified_against: raw_artifact:planning/login-crop.png
  unreadable_count: 0
```

The producer hard-rejects invalid v2 shape/ref/inheritance before writing; check 11 reports IF-1xx
warning-first for manually authored files. It never invents defaults or changes confidence/status/readiness.
Flat CLI flags continue to create v1 artifacts.

## Validation

```bash
npm run workflow:validate
```

Run `workflow:validate`, or at least the input artifact validation (check 11), before moving on.
`--enforce` does not promote IF-1xx fidelity warnings; `IP-001` timestamp errors are always hard.

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
