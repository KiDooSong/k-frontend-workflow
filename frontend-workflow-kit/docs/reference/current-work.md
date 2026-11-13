# Current work execution (`authority: current`)

`--work <request.json>` is the execution selector for **current** work that is
already allowed by the repository's existing readiness/path authority. It does
not create a new permission model: every selected concrete path is evaluated by
the same current readiness and candidate-aware path helper used by the ordinary
workflow.

This reference describes **work contract 1 / C**. `authority: scoped`, work
units, coverage receipts, partial/no-effect authority and adopted-owner grants are
described in [scoped work](scoped-work.md); current authority never borrows them.

## Request contract

All five execution CLIs accept the same request:

```json
{
  "version": 1,
  "origin_inputs": [
    {
      "input_id": "IN-20260910-visual-spec-001",
      "source_refs": ["input:IN-20260910-visual-spec-001#extracted-facts/01"]
    }
  ],
  "requests": [
    {
      "owner": "screen:RESULT-001",
      "authority": "current",
      "requested_mode": "rough-fixture-ui",
      "targets": [
        {"path": "src/features/result/screens/result-screen.tsx", "change": "M"}
      ]
    }
  ]
}
```

The top-level keys are exactly `version`, `origin_inputs`, and `requests`.
Current requests contain exactly `owner`, `authority`, `requested_mode`, and
`targets`; `unit`, `coverage_reports`, caller-supplied `allowed`/`approved`, and
other authority overrides are invalid. Owners are typed as `screen:<ID>` or
`surface:<ID>`. Targets are concrete project-relative Git paths and retain the
existing C change kinds `A/M/D/R/C/T`.

`origin_inputs` preserves the user's starting inputs; it is not an exclusion or
approval list. An origin with `source_refs: []` means the whole canonical input,
not "unrelated". IDs and typed anchors must resolve against the current canonical
input index. C requires completed canonical reconciliation for a selected origin;
it does **not** accept partial/no-effect coverage receipts as new authority.

The reader accepts regular files only and reads at most 16 MiB + 1 byte before
UTF-8/JSON decoding. Duplicate JSON keys, YAML, unknown/null/missing fields and
semantic duplicate refs/targets are input errors. A document whose requests are all
`authority: scoped` is evaluated as [scoped work](scoped-work.md); a document mixing
current and scoped requests is an input error.

The opened file's size is an allocation hint only. A correctly sized nonempty file
uses one buffer with space for the EOF probe, avoiding a second buffer and a full
copy. A zero or unknown size starts with a bounded 64 KiB read, because some virtual
files return EOF after a partial first read. Every read also respects the remaining
byte limit plus one overflow byte. Short reads continue in the same buffer, then
bounded chunks until actual EOF or overflow. Descriptor ownership, before/after
file checks and the input error contract stay with the caller.

## Common CLI flow

Run once before implementation and once afterwards with the **pre-work packet**.
Use the same request and explicit resource options. Keep evidence outside the selected
repository, in distinct before/after directories:

```bash
RUN_EVIDENCE="$(mktemp -d)"
npm run workflow:run -- --work .workflow/current-work.json \
  --out "$RUN_EVIDENCE/before" --json

# Implement, regenerate applicable views, and run validate plus relevant tests/lint.
# Verify before committing: the checkpoint requires the same HEAD baseline.
npm run workflow:run -- --work .workflow/current-work.json \
  --packet "$RUN_EVIDENCE/before/work-packet.md" \
  --out "$RUN_EVIDENCE/after" --json
```

Before editing, require `ready: true`, permission for every target and
`HALT_READY_FOR_WORK`. After editing, inspect `ready`, `backstop.ok`, violations,
and failed/unrun validation alongside the state. `DONE_PENDING_REVIEW` and exit 0
are review evidence, not approval. Scoped work uses this flow with
`.workflow/scoped-work.json` and its own authority checks.

Each run prepares a fresh immutable baseline once. A packet-bound run compares the
checkpoint before collecting Git evidence once, even when denied or absorbed.
The same results feed state, JSON, status and report; a later invocation does not
reuse an earlier preflight or Git verdict.
For a normal ready task this changes the representative flow's prepare calls from
6 to 2 and backstop calls from 4 to 2. Time/token improvement has not been measured.

### Optional progress diagnostics

For a long `workflow:run --work` invocation, add `--progress` to print elapsed
phase markers to stderr while the synchronous work is running:

```bash
npm run -s workflow:run -- --work .workflow/scoped-work.json \
  --out "$RUN_EVIDENCE/before" --json --progress \
  > "$RUN_EVIDENCE/before.json" 2> "$RUN_EVIDENCE/before.progress.log"
```

Scoped runs identify snapshot materialization, baseline input preparation, each
selected owner/unit, the final composition audit, authority collection, Git
backstop and packet/report creation. For example,
`owner:start "1/2 screen:RESULT-001/known"` identifies the first requested owner evaluation.
Current-authority runs provide the common preparation, backstop and output
phases. Checkpoint, report and backstop markers appear only when those steps run.

Markers are diagnostic phase boundaries, not periodic heartbeats, percentages or
permission. A long gap after a `:start` marker means that phase has not returned;
no timeout or retry is added. The normal JSON stdout, packet/checkpoint bytes,
exit codes and approval requirements are unchanged. Reporting is off by default;
an unwritable stderr disables it without changing the evaluation. `--progress`
is a boolean supported only by `workflow:run --work`, including packet-bound
post-work runs. Other work CLIs and ordinary/visual run selectors reject it.

Standalone commands remain useful diagnostics rather than required steps around run:

| Command | Select when |
|---|---|
| `readiness --work` | inspect owner/target denials, ceiling or future requirements separately |
| `packet --work --out <packet.md>` | collect only a pre-work packet |
| `forbidden-paths --work` | inspect the diff separately; use `--staged` or `--enforce` when needed |
| `report --work --packet <packet.md>` | collect the existing checkpoint-checked report alone |

Run does not accept staged/enforce/range selectors. Each standalone command still
prepares its own baseline and can run independently.

For a non-default project layout, repeat the same `--root`, `--docs`, `--src`,
`--policy`, `--manifest`, `--layout`, and optional `--ci` values. The work branch
is mutually exclusive with legacy/visual selection flags such as `--screen`,
`--surface`, `--intent`, `--input`, `--path`, `--requested-mode`, and stored
readiness overrides. Unknown or mixed selection flags exit 2 before producing
execution output.

Agents normally assemble the request from the user's task and current canonical
records. A person does not need to hand-author/approve JSON for every ordinary
request. If the request needs a new owner scope, unit, decision binding, or a path
that current authority does not allow, stop at the existing authoring/human
checkpoint rather than widening this request.

## Eligibility invariants

For every request the tool:

1. resolves the owner and current resources from the immutable pre-implementation
   Git tree;
2. computes the real current readiness with the existing implementation policy;
3. requires `requested_mode` to be at or below the actual current readiness
   ceiling;
4. asks the existing concrete-path helper about **every** target;
5. keeps generated/`do_not_edit` ownership as a final deny (an `outputs[]` glob
   counts only for a baseline file with the GENERATED header — see
   [execution ownership](generated-files.md#execution-ownership));
6. keeps malformed lifecycle/state/policy/reference conditions as errors;
7. preserves unmet higher-mode prerequisites as `future_requirements` without
   deleting them from `legacy_readiness`;
8. requires all responsibilities for a shared target to pass — one broad allow
   never cancels another owner's deny;
9. denies an adopted scoped owner path with `CW-WORK-SELECTION-REQUIRED`: a
   scoped task is never retried under current authority.

The implementation never unions lower-mode path sets, synthesizes a higher
readiness object, strips forbidden matches, or treats request fields as grants.
An absorbed owner returns not-applicable guidance; it is not automatically
retargeted.

## Origin and snapshot binding

The normalized complete request (including origins) gets a `request_digest`.
Each resolved origin carries its canonical path and raw `sha256` hash. The
snapshot also records the baseline commit/tree and resource identities.

Temporary raw Git trees use the shared
[snapshot cleanup and orphan recovery](visual-refresh-boundaries.md#temporary-snapshot-lifecycle)
lifecycle, including interrupted synchronous execution.

The workflow state is computed from the baseline documents and source tree, the
same way `workflow:state` computes it. A generated `_meta/workflow-state.yaml` is
neither required nor read, so it may be untracked, ignored or stale; it is not an
authority file. The computation never follows a symbolic link out of the baseline:
a linked source root (or a linked parent) counts as empty, and a link inside the
docs directory or on the docs/src path is an input error.

Packet values are audit evidence only. Packet-bound run, report and backstop read the current request
again and require the same normalized digest **and raw request bytes**; packet
baseline commit/tree and origin identity/hash must still match. Changing the
request, origin, policy/manifest/layout/CI authority, or other authority records
is an authoring checkpoint, not a way to self-grant the same implementation run.

The CLI does not claim that repository state can prove the user originally
mentioned every input; initial conversation/request capture remains an agent and
review responsibility.

## Git backstop

Worktree capture shares directory-entry name sets only within its capture,
verification or inventory phase. Every path still checks live ancestor stats;
a changed parent stamp refreshes its names. Verification and the final inventory
start with fresh caches, and actual inventory traversal remains fresh. This
reduces repeated directory reads without carrying filesystem facts into a later
capture or skipping file changes, path spelling aliases or symlink ancestors.

Raw worktree and baseline-authority file reads use the same bounded allocation
strategy with a 128 MiB per-file limit. They still read at most one byte beyond
that limit, check the opened descriptor's identity and final stat, and retain the
capture's final path and inventory verification. Each call reads the current file bytes.

The default C backstop compares actual `HEAD` to the current worktree with raw
Git name/status data, `--ignore-submodules=none`, rename detection, and actual
filesystem bytes/modes. `forbidden-paths --staged` uses the index instead.
It reports the whole selected repository diff, including:

- unrequested paths and change-kind mismatches;
- changes outside the selected project root;
- rename/copy endpoints and type/symlink changes;
- authority/request/origin changes after the baseline;
- requested targets missing from the actual diff;
- targets that were not authorized at preflight.

`workflow:forbidden-paths --work` remains advisory by default (exit 0 with
violations in JSON). `--enforce` returns exit 1 on violations. Usage/collection
errors return exit 2. A generated report, `DONE_PENDING_REVIEW`, or exit 0 is
review evidence, not product/merge approval.

## Packet-bound run outputs

`run --work --packet <packet.md>` uses the selected authority's existing packet
parser/assertion. It checks digest, raw request bytes, HEAD commit/tree, origins,
project/resource context and authority read sets. Scoped directory and target read
sets are also bound. A checkpoint is never an allow list; destination authority,
inventory, API evidence and concrete path checks still apply.

JSON and status Markdown add `checkpoint: { packet: <resolved input path>, matched: true }`
only for packet-bound runs. They preserve the full collected `backstop`, including
changed/implementation records, violations, `ok` and destination snapshot, for every
state. With `--out <dir>`, packet-bound runs write `work-packet.md`, `run-report.md`
and `<dir>.md` from the same observation even with no diff or a HALT state. Without
`--out`, JSON and human status retain the evidence and no report file is written.

The input packet must remain separate from all three output files, including
physical path aliases and hardlinks. Every output leaf must be absent before writing;
an existing bundle is rejected, and unrelated files in the directory are preserved.
Input/checkpoint mismatch, output collision and Git collection failure exit 2 before
writing the bundle. An output I/O failure also exits 2; a partial bundle is not success
evidence (writes are not a multi-file transaction).

Without `--packet`, existing run behavior is preserved: deny/absorbed runs skip
backstop, a ready run with only missing requested changes omits it from status, and
report output requires an implementation diff. No checkpoint field is added.
For ordinary post-work handoff, pass the pre-work packet. If it was omitted, record
checkpoint comparison as unverified; this guidance adds no hard gate. Keep the
request, packet, resource options and evidence paths in the session handoff. A moved
HEAD or changed scope needs a new authoring/preflight checkpoint.

## Run states

| state | meaning | exit |
|---|---|---:|
| `HALT_READY_FOR_WORK` | all selected current paths and required preflight evidence are ready; no implementation diff yet, and the backstop reports only the still-missing requested changes | 0 |
| `HALT_AMBIGUITY` | at least one current request is denied or execution evidence is unresolved, including a backstop violation (such as changed authority or API evidence) before any implementation diff; packet-bound runs keep full evidence even when denied | 0 |
| `HALT_NOT_APPLICABLE` | all selected owners are absorbed/non-executable; report the canonical target, do not auto-retarget; packet-bound runs retain actual diff evidence | 0 |
| `HALT_TOOL_ERROR` | malformed/unsupported input or collection failure | 2 |
| `DONE_PENDING_REVIEW` | an implementation diff exists and report/backstop evidence is available | 0 |

A partially executable multi-request selection does not silently drop denied
requests. Explicitly reselect an independently valid subset and run the same
checks again.

## Compatibility boundary

Without `--work`, readiness, packet, run, report, forbidden-paths, and the
existing visual-refresh v1 route retain their existing CLI/JSON/exit semantics,
except that an adopted scoped owner path returns `work-selection-required`
(repositories without an adoption overlay or owner `work_execution` declarations
are unchanged; see [adoption](scoped-work.md#adoption-is-an-explicit-human-checkpoint)).
Current work is additive and adds no required CI status.

## Scoped work

Scoped authority, its adoption checkpoint, preflight, Git backstop, fallback
guards and rollback are documented in [scoped work](scoped-work.md). Do not use
removal of a marker, a different intent or current authority to reinterpret a
denied scoped task as permitted current work.
