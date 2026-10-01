# Input preview: consumer checks before publication

Synthetic CLI demonstration for #267. Run from the kit development directory:

```bash
node examples/input-preview/demo.mjs
```

This fixture is not packed into the consumer payload. Consumer-facing usage is
in [COMMANDS](../../COMMANDS.md#preview-before-consumer-checks); adapters own their
source parsing, receipt paths and pinned hash policy.

The demo uses only `create-input-artifact.mjs --dry-run --json` and
`doc-drift.mjs --json`, with Node's standard library. It imports no kit internals
and implements no Markdown parser. All source, receipt, payload and observation
files are synthetic and created under one temporary directory, removed on exit.
It never publishes an input or changes a live register, policy or repository.

For flat, `--group-by domain` and `--input-subdir editor/planning`, it checks:

1. A payload with a correctly based receipt link passes producer schema and local
   link checks.
2. A later fact copied from `work/source.md` contains
   `[receipt](../evidence/receipt.json)`. That link is valid in the source's
   directory and wrong in the planned canonical input's directory. The enriched
   payload still passes producer schema, while its observation copy reports one
   broken link. The earlier check did not cover this new fact.
3. Explicitly correcting the new fact's link for the final output location makes
   the complete payload's local link check pass. Preview IDs remain unreserved;
   each case's original files and bytes remain unchanged.

The observation copy preserves each input's project-relative path, so normal
doc-drift can read the rendered Markdown. Writing this scratch copy is separate
from producer dry-run and is not publication. The demo inspects findings even
though doc-drift exits 0 for the deliberately broken link.

Output reports producer schema, local links and consumer fixture hash checks
separately. The fixed fixture bytes stand in for a consumer's pinned source and
receipt manifest. The external URL is deliberately not fetched; URL reachability,
source meaning, human approval and readiness are **not checked**. This proves the
public CLI connection on synthetic data, not a consumer dogfood run or time saving.

Already issued input correction uses the existing immutable contract: retain the
original input and evidence bytes, correct a new payload, preview/check it, then
publish with `supersedes` naming the previous input. Retain regular evidence files
at any required historical link locations under the consumer's retention policy;
do not introduce symlinks or overwrite the previous input.

For example, a successor payload can retain the same regular source/receipt files
and explicitly name the issued predecessor (excerpt, not a complete payload):

```json
{
  "supersedes": "IN-20260930-planning-doc-001",
  "source_ref": "work/source.md",
  "raw_artifacts": ["work/source.md", "evidence/receipt.json"],
  "extracted_facts": ["Corrected receipt link: [receipt](../../../../evidence/receipt.json)."]
}
```

That body link assumes the successor is under `docs/frontend-workflow/inputs/editor/`.
Preview it with the actual final path; preserve the issued predecessor's bytes.
