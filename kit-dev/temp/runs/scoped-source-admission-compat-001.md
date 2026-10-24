# Scoped source admission compatibility — 2026-10-24

Kit development slice evidence; base `895034e678140737c73865fd1d992e97056df35a`.
This report records synthetic regression execution, not consumer dogfood or a
release check. The containing PR's source commit identifies the implementation.

## Scope and before/after

Before: both source-state predicates rejected canonical v2 Item sources with
`reconciled + pending-user-decision` or `reconciled + mixed`, including a
byte-current complete-for-unit receipt. Unrelated no-effect origin routing used
the same restriction. Accepted successors did not replace original origins.

After: a small shared source-state predicate supports exactly those two extra
combinations. Both require current complete-for-unit source coverage or current
no-effect routing evidence and Stage 04 semantic review. Existing accepted/pending
behavior and unsupported partial/other combinations remain unchanged.

No input reissue, Summary/Item rewrite, human-owned state transition, new artifact
axis, policy/CI/hook change or version bump is part of this slice. Public fixtures
are synthetic and contain no private consumer source material.

## Reproduction and verification

Commands run from `frontend-workflow-kit/`, with Node `v24.11.0`:

| Evidence | Command | Result |
| --- | --- | --- |
| Original focused baseline | `node --test scripts/lib/scoped-work-coverage.test.mjs scripts/lib/scoped-work-input-coverage.test.mjs` | 46 passed, 0 failed |
| New cases before implementation | same two suites, with the six new cases | 46 passed, 6 failed: the two states' source inspection, admission and routing |
| Implemented focused matrix | `node --test --test-reporter=tap scripts/lib/scoped-work-coverage.test.mjs scripts/lib/scoped-work-input-coverage.test.mjs` | 59 passed, 0 failed |
| Public source admission CLI | `node --test --test-reporter=tap --test-name-pattern='^source admission CLI:' scripts/lib/scoped-work-cli.test.mjs` | 4 passed, 0 failed |
| Full golden/spec/unit suite | `npm test` | 34 fixtures (33 pass, 1 expected failure, 0 unexpected failures/drift); 2,368 tests: 2,366 pass, 0 fail, 2 platform skips |
| Packed execution within full suite | `scoped-work-packed.test.mjs` | 651 resolver cases, existing 10 generated-boundary CLI cases, all 4 new source admission CLI cases passed |
| Golden validate | `npm run example:validate` | exit 0, all 12 checks passed |
| Payload | `npm run kit:pack -- --out <task-artifact-dir>/verification-payload` | exit 0; 301 manifest-listed file hashes match; new helper ships; scoped tests, examples and dev docs excluded |

The two full-suite skips are the existing Windows drive-crossing case and the
case-insensitive-filesystem case; their platform prerequisites were absent.
No failing baseline check was treated as passing. Final clean source-bound pack,
independent review and merge evidence are preserved separately in the task handoff.

## What the regressions establish

- All five canonical statuses crossed with all eight canonical Results, invalid
  and annotated Results agree across source inspection, file-backed admission
  and no-effect routing. Invalid statuses still fail canonical resolution.
- Both new Results require exact current receipts. Missing/stale input, effects,
  contract hashes, Item/ref mismatch and foreign owner/unit/input cannot admit a
  source. A routing-only receipt cannot supply positive source coverage.
- Routing still rejects wrong origin scope, related effects, unresolved
  uncertainty and unconnected canonical sources. Accepted successors retain their
  own provenance and cannot silently replace a predecessor in `origin_inputs`.
- Public readiness reads committed evidence. It admits the synthetic unit only
  with current coverage, while open Unknowns/Decisions and reserved shared paths
  still make final readiness false. Original input and register bytes are preserved.
- Existing accepted/pending and summary-only legacy regressions, relation/binding,
  API/profile/path/host/shared-target and packet/backstop suites pass unchanged.

Current hashes are integrity evidence. Neither the tools nor these synthetic
tests authenticate semantic review, approval or human binding. No actual consumer
unit preflight or UI implementation was executed by this kit task.
