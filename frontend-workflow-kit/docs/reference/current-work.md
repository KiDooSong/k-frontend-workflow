# Current work execution (`authority: current`)

`--work <request.json>` is the execution selector for **current** work that is
already allowed by the repository's existing readiness/path authority. It does
not create a new permission model: every selected concrete path is evaluated by
the same current readiness and candidate-aware path helper used by the ordinary
workflow.

This reference describes **work contract 1 / C**. `authority: scoped`, work
units, coverage receipts, partial/no-effect authority, and new path grants belong
to the later scoped-work change and are deliberately rejected here.

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
UTF-8/JSON decoding. Duplicate JSON keys, YAML, unknown/null/missing fields,
semantic duplicate refs/targets, and `authority: scoped` are input errors.

## Common CLI flow

Use the same request and the same explicit resource options throughout:

```bash
npm run workflow:readiness -- --work .workflow/current-work.json --json
npm run workflow:packet -- --work .workflow/current-work.json --out temp/current-work-packet.md --json
npm run workflow:run -- --work .workflow/current-work.json --json

# after implementation
npm run workflow:forbidden-paths -- --work .workflow/current-work.json --json
npm run workflow:report -- --work .workflow/current-work.json --packet temp/current-work-packet.md --json
npm run workflow:run -- --work .workflow/current-work.json --json
```

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
5. keeps generated/`do_not_edit` ownership as a final deny;
6. keeps malformed lifecycle/state/policy/reference conditions as errors;
7. preserves unmet higher-mode prerequisites as `future_requirements` without
   deleting them from `legacy_readiness`;
8. requires all responsibilities for a shared target to pass — one broad allow
   never cancels another owner's deny.

The implementation never unions lower-mode path sets, synthesizes a higher
readiness object, strips forbidden matches, or treats request fields as grants.
An absorbed owner returns not-applicable guidance; it is not automatically
retargeted.

## Origin and snapshot binding

The normalized complete request (including origins) gets a `request_digest`.
Each resolved origin carries its canonical path and raw `sha256` hash. The
snapshot also records the baseline commit/tree and resource identities.

Packet values are audit evidence only. Report/backstop reads the current request
again and requires the same normalized digest **and raw request bytes**; packet
baseline commit/tree and origin identity/hash must still match. Changing the
request, origin, policy/manifest/layout/CI authority, generated state, or other
authority records is an authoring checkpoint, not a way to self-grant the same
implementation run.

The CLI does not claim that repository state can prove the user originally
mentioned every input; initial conversation/request capture remains an agent and
review responsibility.

## Git backstop

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

## Run states

| state | meaning | exit |
|---|---|---:|
| `HALT_READY_FOR_WORK` | all selected current paths and required preflight evidence are ready; no implementation diff yet | 0 |
| `HALT_AMBIGUITY` | at least one current request is denied or execution evidence is unresolved | 0 |
| `HALT_NOT_APPLICABLE` | all selected owners are absorbed/non-executable; report target only, do not auto-retarget | 0 |
| `HALT_TOOL_ERROR` | malformed/unsupported input or collection failure | 2 |
| `DONE_PENDING_REVIEW` | an implementation diff exists and report/backstop evidence is available | 0 |

A partially executable multi-request selection does not silently drop denied
requests. Explicitly reselect an independently valid subset and run the same
checks again.

## Compatibility boundary

Without `--work`, readiness, packet, run, report, forbidden-paths, and the
existing visual-refresh v1 route retain their existing CLI/JSON/exit semantics.
Current work is additive. It adds no required CI status and does not implement
scoped/D authority.
