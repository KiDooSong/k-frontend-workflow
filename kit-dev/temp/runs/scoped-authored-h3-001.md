# Scoped authored H3 section-only regression

Kit development evidence, 2026-10-24. Base:
`04c8cb6c0a0641ff32e2acfb982462f246bfd80c`. This report records synthetic
source/packed tests, not a consumer observation, human approval or release cut.

## Contract and scope

The [scoped contract](../../../frontend-workflow-kit/docs/reference/scoped-work.md#artifact-section-references)
and [upgrade note](../../../frontend-workflow-kit/docs/reference/upgrade-notes.md#scoped-authored-h3-section-only-references)
own the reference rules. The implementation adds a separate H3 index and restores
serialized selections against native nodes. The existing Markdown heading-title
function gains an export so H3 uses exactly the H2 title/slug convention; global
parsing and section splitting are unchanged. That makes four runtime files and
two consumer reference docs, rather than three runtime files.

The old uncertainty regression that expected a missing H3 now checks the actual
H3 inverse relation and its overlap with the unchanged H2 parent. No H2 golden
digest was re-pinned. Canonical home slugs are excluded from H3 fallback; row
references, API and mapping authority still require their existing homes.

## Validation

Environment: macOS, Node `v24.11.0`. Normal package entry points:

| Check | Result |
| --- | --- |
| Baseline `npm test` | 2,368 tests; 2,366 pass, 0 fail, 2 skip |
| Final `npm test` | 2,380 tests; 2,378 pass, 0 fail, same 2 skip |
| H3 focused suite | 12 tests pass, no skip |
| Packed resolver suites inside `npm test` | 663 tests pass, no fail/cancel/skip/todo |
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
hashes are checked before and after, and fixtures/tests remain excluded.

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

## Distribution and limits

Against a normal pack of the base, only these allowlisted files differ:

- `scripts/lib/scoped-work-authored.mjs`
- `scripts/lib/scoped-work-refs.mjs`
- `scripts/lib/scoped-work-graph.mjs`
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
