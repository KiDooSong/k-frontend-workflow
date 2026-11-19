# Oversized Unknown row reuse — #335

> HISTORICAL — 2026-11-20 (Asia/Seoul) kit development evidence for
> [#335](https://github.com/KiDooSong/k-frontend-workflow/issues/335).
> Baseline: `4a3b6955bfa46086917ac7bea181aabeb477af0a`, including the merged
> #332 and #334 fixes. Current contracts live in
> [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md#bounded-syntax-retention)
> and the [roadmap](../../roadmap-current.md). All fixtures here are synthetic;
> this report does not reproduce the private consumer's complete workload.

## Problem and change

The earlier active-document fix kept syntax available during each uncertainty
row batch. The later applicability loop still queried the authored status of
each row for each unit after that batch had ended. If the original document
exceeded either the source or node retention limit, every query reconstructed
the entire authored view and reparsed the Markdown.

Canonical authored-view construction now records a small authored/GENERATED
classification against each native physical table row. These weakly associated
facts contain the exact body and offsets, without holding a tree, view or
table-sized span array. Each lookup resolves the selection's current physical
context before using a fact. Copies preserve that context; equal rendered cells
or JSON-only copies cannot establish physical authority. Foreign parser rows
can use the existing canonical offset check once. Explicit raw views keep their
own interpretation and cannot overwrite the canonical facts.

A private weak provenance association recognizes the internally constructed
immutable shared raw sections together with their exact body and native tree.
This allows ordinary resolver wrappers to prepare canonical facts without
treating arbitrary frozen/custom views as canonical. The public mutable parser
continues to return independent derived containers.
Public same-tree mutable prewarming also remains supported inside and outside
active document scopes. Canonical row preparation uses a separate temporary
interpretation when needed and does not overwrite the public prewarm cache.

The selected-row batch also passes its already read document into its helpers.
It no longer rereads, hashes and splits that document merely to recover the
same row or range. Independent graph/current-file checks, expected hashes and
the final complete canonical read-set audit remain in place.

Finally, one uncertainty evaluation shares immutable leaf-span arrays when
candidate graphs select the same native physical nodes, exact body and
input-bullet nesting mode. The cache follows node identity, not an equal ref or
offsets from independent reparses. Mutable, accessor and proxy inputs retain
fresh computations. The public span helper still returns fresh mutable arrays;
a new evaluation starts a new span store.

The three retained-cache budgets remain **8,388,608 UTF-16 source code units,
262,144 native nodes and 512 entries per cache**. No binding, digest, blocking
rule, scope-basis version, file-read limit or execution gate changes.

## Exact issue reproduction

The issue's 52,800-row table contains **1,256,135 source code units** and
**264,009 native AST nodes**. It exceeds the node limit while remaining below
the source limit. Four remembered physical rows produce:

| Measurement | Baseline `4a3b695` | This change |
| --- | ---: | ---: |
| Additional whole parses after the active batch | 4 | **0** |
| Additional whole parses inside the active batch | 0 | **0** |

The regression also asks the parser for the oversized body again and observes
a new tree and one parse. Zero post-batch lookups therefore do not come from
installing the oversized AST into a global cache. Source, node and entry
counters remain within their original budgets.

## Selected-document and span operation counts

An independent file-open probe used one selected owner and an oversized
Unknowns document with an unselected Appendix. It counted actual opens of that
document, separating the caller of `document()` from graph/audit reads.

| Operation, before → after | 1 Unknown row | 4 Unknown rows |
| --- | ---: | ---: |
| All actual reads of the oversized document | 28 → **22** | 52 → **31** |
| Redundant reads by `coveredUnknownRows` / `addSelectedUnknown` | 2 → **0** | 5 → **0** |
| Document reads initiated by `ranges` | 6 → **2** | 18 → **2** |

The remaining graph/current-file and audit reads are intentional. These counts
measure a concrete path, not a general promise that an evaluation reads each
file only once.

A separate instrumented probe made one or four Unknown candidates reference
the same 2,048-leaf native section. It counted construction of leaf-range
arrays, recognizing both the original helper and the extracted computation.

| 2,048-leaf array constructions, before → after | 1 candidate | 4 candidates |
| --- | ---: | ---: |
| Additional arrays constructed from `addCandidate` | 1 → **0** | 4 → **0** |
| All such large arrays in the evaluation | 5 → **3** | 8 → **3** |

These are operation counts, not heap measurements. The focused regression
checks shared identity and frozen tuples across two independently resolved
candidate graphs, separate identity in a new evaluation, raw/authored physical
separation and independent mutable public returns. Sharing across separate
native parser generations is outside this change.

## Regression coverage

The two new suites contain **14 passing cases on Node20.20.2**:

- [Unknown reuse](../../../frontend-workflow-kit/scripts/lib/scoped-work-unknown-reuse.test.mjs)
  has five cases: the exact dense-node overflow; source-length overflow with
  identical GENERATED/authored rows; copied and replaced physical contexts;
  explicit custom raw views; foreign parser generations; and a real
  row-by-unit applicability projection with full binding-basis equality and
  subsequent file-change rejection.
- [Selection costs](../../../frontend-workflow-kit/scripts/lib/scoped-work-selection-costs.test.mjs)
  has nine cases: selected-document reuse for one/four rows; shared physical
  spans; raw/authored collisions; replaced selection nodes; input parent-bullet
  holes; mutable positions; frozen accessor changes; proxy exceptions; and
  interleaved canonical checks with legacy mutable/accessor prewarming before,
  during and after active scopes.

Small and oversized variants retain the complete projection and unaudited
results. Their complete read sets differ only in the changed file's actual
hash. Tests are also wired into the packed resolver harness so that they run
against the shipped runtime without adding test drivers to the consumer payload.

Final Node20.20.2 verification passed **871/871 packed resolver cases**, with no
failures, cancellations, skips or todos. The packed input syntax, compact
Evidence, advisory, frontmatter, table/reference-view, readiness/binding-status,
progress and source-admission CLI subprocesses also passed. Both packed harness
tests and all **29/29 AST tests** passed in the final combined 31-test run.
The payload manifest and shipped runtime bytes remained unchanged by these tests.

Example state/readiness generation was idempotent, example validation passed all
12 checks, and golden fixture verification reported **33 pass, one expected
historical failure, zero unexpected failures or drift**. The final mutable
prewarm regression and existing shared-reference suite separately passed
**18/18** cases. Runtime corrections were made before the final packed run;
the earlier failed packed attempt is recorded in the review section below.

## Paired evaluator and public CLI evidence

The paired harness completed with `verified: true` on **Node24.22.3,
Linux/x64**, using fresh default-heap processes after all compatibility fixes
and the final packed verification. Both runtimes stayed unchanged through the
run. The committed synthetic fixture had two inputs, three units
(`known`, `later`, `selected`) and two added Unknown rows in a document whose
body was **8,388,810 UTF-16 code units**. Its tree was
`4874ebbe98eda899f1e516dac6271a6568e36358` (18 tracked files; 8,398,807 bytes).

The actual applicability loop produced nine Unknown applications. Its full
**30,627-byte JSON matched byte-for-byte**. Additional parses after target-index
construction fell from **62 to 50**; these totals include all document/phase
work, not just the four remembered-row lookups. The full **5,329-byte
binding-status JSON** also matched. All ready/denied/postwork pairs preserved
complete stdout, packet/status/report bytes, halt reasons, scope digests and
checkpoint contracts. Original HEAD, index, tracked bytes/modes/status and
snapshot cleanup checks passed.

| Measurement | Before (s) | After (s) | Before max RSS (KiB) | After max RSS (KiB) |
| --- | ---: | ---: | ---: | ---: |
| Dense reproduction, entire subprocess | 42.385 | 13.145 | 1,723,464 | 1,458,184 |
| Applicability evaluation, after index preparation | 21.835 | 18.185 | 226,296 | 216,632 |
| `binding-status`, entire subprocess | 19.605 | 15.409 | Not captured | Not captured |
| `workflow:run` ready, entire subprocess | 44.069 | 35.319 | 249,376 | 240,796 |
| `workflow:run` denied, entire subprocess | 43.253 | 36.048 | 258,720 | 233,280 |
| `workflow:run` postwork, entire subprocess | 44.491 | 35.727 | 237,164 | 230,952 |

Within the dense reproduction, the four outside-batch lookups alone took
27,927.559 ms before and 0.344 ms after. That narrow timer excludes initial
parsing and view construction. The entire subprocess includes preparation and
the inside-batch check; RSS is each process's high-water mark, including its
initial parser allocations. These single observations show the remaining
cost of parsing a large document and do not establish a total-memory bound.
The small-row CLI fixture does not quantify the RSS benefit of sharing many
large section arrays; the independent span probe above measures that work.

| Reproducibility item | SHA-256 |
| --- | --- |
| Complete applicability JSON, both sides | `5cd681e192b7d7c64aca00ae15780292693118e7a8187e5ec40b04329ed9076e` |
| Complete binding-status JSON, both sides | `23033867c6052ec8beda40d198813a44369d4a37885a61fb05a72a17c71c9c67` |
| Benchmark script | `7c8a4e5dbc0d6a9a0e7a4ac82b53bb6f300c5065790a070fe13c5a4a20bfaac4` |
| Baseline scripts fingerprint | `b68ff091c1843e6af32fbb14b429e928082c6fc1ed04e7f56425c92398b65c5a` |
| Changed scripts fingerprint | `737fcb1509ac731c6f0a6517b6f84aa2892b32cb53df0c6f0051da5e453831e8` |

The scripts fingerprint uses the new harness's sorted path/mode/content-hash
format and excludes test drivers. The nested historical workflow harness uses
a different fingerprint serialization, so its digest is not interchangeable.
No child or total measurement timeout was reached.

## Independent review

Standards and Spec/correctness review covered retained lifetimes, custom raw
provenance, physical identity, input nesting, public mutability, current-file
validation and final audit boundaries. Review and validation identified three
concrete issues in the initial implementation, fixed before final verification:

1. A frozen accessor or proxy could still return a different position. Internal
   span sharing now requires immutable plain data fields and retains the fresh
   path for those objects; dedicated regressions cover both cases.
2. Rejecting every explicit raw view as noncanonical regressed the existing
   #323 warm authoring reuse. The private shared-sections provenance recognizes
   real resolver wrappers while excluding custom raw interpretations. All three
   existing #323 warm authoring regressions pass after this correction.
3. The first packed run exposed two existing #323 mutable-table/sourceText
   accessor regressions. Public same-tree prewarming now retains its legacy
   interpretation, while private canonical checks use a separate view and do
   not replace that cache. A new interleaving regression checks fresh default
   classification together with edited authored references and unchanged raw
   references, outside, inside and after an active document scope.

The final runtime review reported no remaining P0/P1/P2 findings.

## Reproduction and limits

The [paired benchmark](../../benchmarks/scoped-unknown-reuse.mjs) accepts two
installed kits and a fresh output path:

```sh
node kit-dev/benchmarks/scoped-unknown-reuse.mjs \
  ../k-frontend-workflow-baseline-335/frontend-workflow-kit \
  frontend-workflow-kit \
  /tmp/scoped-unknown-reuse-335-new \
  --rows 2 --timeout-ms 180000 --budget-ms 900000
```

Use a detached baseline worktree at the SHA above and identical lockfile
dependencies. Each measured child uses a fresh default-heap Node process. The
fixture is one shared committed synthetic source tree; each public CLI receives
the same paths and requests. The harness compares complete output bytes without
normalization, checks runtime fingerprints and original HEAD/index/file
bytes/modes/status, and checks snapshot cleanup. Workflow ready, denied and
postwork comparisons reuse the existing memory harness. Each child has a
180-second limit and the paired measurements have a 900-second total budget,
excluding fixture preparation.

The exact dense table establishes the structural-overflow regression. A separate
small Unknown table with a source-length-overflow Appendix bounds the actual
evaluator and CLI workload. Neither corpus represents the undisclosed consumer
or proves its long-running execution or OOM is resolved. Elapsed time and peak
RSS are single observations, not medians, and the retained-cache budgets remain
structural limits rather than a total process-memory ceiling.
