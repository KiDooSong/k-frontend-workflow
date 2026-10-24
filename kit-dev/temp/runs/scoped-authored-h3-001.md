# Scoped authored H3 section-only regression

> HISTORICAL — point-in-time kit development validation evidence, not a current plan.

Kit development evidence, 2026-10-24. Base:
`04c8cb6c0a0641ff32e2acfb982462f246bfd80c`. This report records synthetic
source/packed tests, not a consumer observation, human approval or release cut.

## Contract and scope

The [scoped contract](../../../frontend-workflow-kit/docs/reference/scoped-work.md#artifact-section-references)
and [upgrade note](../../../frontend-workflow-kit/docs/reference/upgrade-notes.md#scoped-authored-h3-section-only-references)
own the reference rules. The implementation adds a separate H3 index and restores
serialized selections against native nodes. The existing Markdown heading-title
function gains an export so H3 uses exactly the H2 title/slug convention; global
parsing and section splitting are unchanged. The applicability graph's two
re-keyed row-site calls also carry their original selection, so physical-row
coverage survives that internal transport. That makes five runtime files and
two consumer reference docs, rather than three runtime files.

The old uncertainty regression that expected a missing H3 now checks the actual
H3 inverse relation and its overlap with the unchanged H2 parent. No H2 golden
digest was re-pinned. Canonical home slugs are excluded from H3 fallback; row
references, API and mapping authority still require their existing homes.
An H3 containing a canonical row in an existing H2 home covers that exact native
row in inverse relations and binding closure. Regressions reproduce a missing
inverse Decision and unchanged freshness before the correction, then require
the Decision in the basis, a changed digest and stale binding after its edit,
with an H2 control. A selected contained open Unknown stays blocked under a
current empty native binding. Serialized selections and re-keyed candidate row
sites preserve the same physical source.
Rows whose Decision ID cannot form a typed reference also retain their original
native selection when registered as untyped candidates. Selecting the containing
H3 fails closed like the parent H2 even without outgoing references; an unrelated
H3 stays unaffected. Invalid-only and mixed valid/invalid tables are covered.

## Validation

Environment: macOS, Node `v24.11.0`. Normal package entry points:

| Check | Result |
| --- | --- |
| Baseline `npm test` | 2,368 tests; 2,366 pass, 0 fail, 2 skip |
| Final `npm test` | 2,384 tests; 2,382 pass, 0 fail, same 2 skip |
| H3 focused suite | 16 tests pass, no skip |
| Packed resolver suites inside `npm test` | 667 tests pass, no fail/cancel/skip/todo |
| Existing packed public CLI regressions | All 10 generated-boundary cases and 4 source-admission cases pass |
| `npm run example:state` / `example:readiness` / `example:validate` | Exit 0; generated `_meta` byte-identical; validate 12 checks pass |
| `npm run kit:pack` | 301 allowlisted payload entries; no added/deleted payload path |
| `workflow:doc-drift --include release-consistency --json` | Same baseline 15 warnings / 1 info; no new finding |
| `git diff --check` | Pass |

The two existing skips are the Windows drive-crossing test and the
case-insensitive-filesystem authority-alias test. They remain platform-specific
coverage limits. Negative fixtures are expected rejection witnesses, not new
test failures. The full macOS/Node 20 and Ubuntu CI matrix is not a local result.

The new suite covers native H3 extent with LF/CRLF, H4 descendants, H2/H3 slug
collisions, duplicate H2/H3, fake headings and canonical-home attempts, original
reference definitions and dangling/malformed/shadowed dependencies, copies,
serialization and actual parse-cache eviction. It checks parent H2 effect
overlap, whole Item groups, accepted/pending and both supported reconciled
Results, current/stale receipts, preserved origins, sibling-effect blockers,
selected/inverse/transitive unresolved evidence under a current empty native
binding, public readiness and packet/Git backstop behavior. Test drivers run
unchanged beside packed runtime; source runtime is not copied over it. Manifest
hashes are checked before and after, and the new scoped test drivers and example
fixtures remain excluded.

## H2 compatibility comparison

Before and after use the base's existing synthetic basis, projection and
coverage fixture setup with the current runtime. Temporary roots are normalized
to one marker. The comparison includes the full projection, basis version 2 and
its component digests, coverage basis/receipt inspection, and real public
state/readiness/validate/current-work outputs on the golden coupon fixture.
The four public commands exit 0 in both runs; their complete normalized results
are byte-identical. Existing envelope and basis pins also pass unchanged in
source and packed suites. This comparison does not claim unchanged relations
for documents containing a previously unresolved H3 reference.
The complete normalized before/after JSON has SHA256
`4fa2daf5a5264601b66bd2d31f992d3170170ab3fb2e09ebb1346a36461d3eb0`
on both sides, including after the canonical-row coverage correction.

## Distribution and limits

Against a normal pack of the base, only these allowlisted files differ:

- `scripts/lib/scoped-work-authored.mjs`
- `scripts/lib/scoped-work-refs.mjs`
- `scripts/lib/scoped-work-graph.mjs`
- `scripts/lib/scoped-work-applicability.mjs` (native selection transport at two calls)
- `scripts/lib/reconciliation-markdown-ast.mjs` (export only)
- `docs/reference/scoped-work.md`
- `docs/reference/upgrade-notes.md`

The pack metadata updates normally. No distribution manifest, package version,
basis format, policy/profile/role/adoption, CI gate or human transition changes.
Consumer install metadata and any local adaptation still need the normal upgrade
planner and consumer review. Source/packed structural success is not semantic
coverage, binding approval, consumer readiness or product completion. Actual
upstream merge and immutable pack provenance are recorded in the PR handoff
after independent review, not inferred here.
