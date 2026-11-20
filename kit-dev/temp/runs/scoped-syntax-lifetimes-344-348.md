# Scoped syntax lifetimes — #344–#348

> HISTORICAL — 2026-11-20 (Asia/Seoul), kit development evidence.
> Baseline: `76f18f5aeb2f4e3e1374ee9a1922d88f437e593d`, including merged #343.
> Current contracts: [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md#binding-basis-and-status).
> All fixtures and observations below are public synthetic evidence. They do
> not contain consumer documents, private identifiers or private measurements.
> Initial measurements describe `a1b1002`. The Node 20 CI failure and fixture
> correction are recorded in the review follow-up below; earlier results remain
> historical observations, not proof that the initial CI passed.

## Reproductions on the latest baseline

All five issues reproduce on this baseline. The public source-sized probes ran
in ten separate processes with the same Node `v24.22.3` executable on Linux x64,
no Node execution flags, and a 180-second bound for each process. Parser counters
and node identities are deterministic acceptance checks, not elapsed-time or
consumer memory measurements.

| Public issue | Baseline | Changed runtime |
| --- | --- | --- |
| [#344](https://github.com/KiDooSong/k-frontend-workflow/issues/344): four API candidates above the source budget | 4 complete parses | 1 parse in the explicit evaluation batch |
| [#345](https://github.com/KiDooSong/k-frontend-workflow/issues/345): three Unknown candidates sharing an external section | 3 native node identities; 3 later relation parses | 1 native identity; 0 later relation parses |
| [#346](https://github.com/KiDooSong/k-frontend-workflow/issues/346): one input Evidence bullet | strict 3 parses; candidate 2 | strict 1 parse; candidate 1 |
| [#347](https://github.com/KiDooSong/k-frontend-workflow/issues/347): explicit shared raw view after editing a public authored header | `false` before eviction, `true` after | `true` at both stages; public header remains `Edited` |
| [#348](https://github.com/KiDooSong/k-frontend-workflow/issues/348): custom iterator changes its yielded child | cached `[[0,1]]`, fresh `[[1,2]]` | both `[[1,2]]` after the change |

#345 keeps all three applications and all three selections. Its complete
evaluation adds 9 whole parses after the base graph on the baseline and 2 after
the change. The public fixture enumerates the large peer before the questions:
the changed candidate graph deltas are therefore `[0,0,0]`, after that peer was
already parsed once within the same evaluation. The regression fixture instead
enumerates the questions first and verifies `[1,0,0]`. Both exercise the actual
uncertainty evaluator and its unchanged full read-set result.

The #346 artifact-backed control remains one parse in both strict and candidate
mode. #347's default canonical lookup remains `true` before and after eviction;
only the incorrect warm explicit-shared-view answer changes. #348 preserves the
initial `[[0,1]]` span and the existing fresh-walk result.

## API batches in their actual callers

The batch helper is lazy and caller-owned. It keeps one canonical authored view
and row index for an exact body, even if that view exceeds a retained-cache
budget. The unchanged scalar helper still treats independent oversized calls
as independent calls. The public benchmark labels that distinction explicitly.
The implementation updates both real callers; merely exporting the batch
helper would not satisfy these tests.

| Actual operation | Baseline whole parses: 1 / 4 candidates | Changed: 1 / 4 candidates |
| --- | ---: | ---: |
| ScreenSpec source relations | 6 / 9 | 6 / 6 |
| ScreenSpec unit projection | 11 / 17 | 11 / 11 |
| SharedSurfaceSpec source relations | 6 / 9 | 6 / 6 |
| SharedSurfaceSpec unit projection | 11 / 17 | 11 / 11 |

The baseline caller driver ran against the frozen checkout through absolute
imports and a scalar compatibility shim; it did not modify baseline runtime
files. All five source-sized baseline cases failed on the expected parser-count
assertions. Baseline caller counts used Node 24; the final changed caller suite
used Node 20.20.2. These are operation counts, with no cross-version timing
comparison. Source refs, Tracking refs, selected physical Unknown rows and
read-set hashes remain covered. The initial dense 88,000-bullet batch separately
proved reuse above the native-node budget, below the source-length budget. The
Node 20 follow-up replaces that expensive fixture shape while preserving both
budget boundaries.

## Implementation and retained lifetimes

### One overflow tree and selected fragments

The shared AST, authored-view and uncertainty document LRU limits remain
8,388,608 UTF-16 code units, 262,144 native nodes and 512 entries per cache.
Ordinary documents retain their existing LRU behavior. One synchronous
uncertainty evaluation additionally keeps at most one oversized dependency tree.
A different oversized source replaces that slot. Nested evaluations restore
their predecessor, and normal return, exceptions and escaped asynchronous
continuations cannot retain a completed scope.

Before storing each candidate graph, the evaluator computes spans for every
selection, including external dependencies. A remembered physical selection
does not need a full raw view merely to recover its own native nodes. Equal
current file hashes, exact bodies and ordered native type/offset identities
allow immutable selected fragments to share their canonical nodes across parser
generations. Their wrapper arrays and subsection modes remain independent.
This avoids retaining one copy of the same selected subtree per candidate.

The two-oversized-peer regression deliberately alternates sources. It verifies
candidate parse deltas `[2,2,2]`, one retained node per physical peer selection,
and zero later relation parses. The fallback is intentional: this change does
not retain every full oversized document. Selected fragments may themselves be
large; structural lifetime bounds are not a total heap or RSS guarantee.

### Input Evidence uses the same selected view

The first input anchor selection and legacy Evidence parsing run within one
exact-body syntax scope. Its source resolver retains the immutable view already
needed by that selection. Strict and candidate graph readers borrow it only
after checking current bytes, frontmatter and indexed body, and only for that
resolver's private identity, input ID and exact body. A later independent graph
cannot borrow an oversized view from a completed evaluation.

The tests preserve raw inline-code content, exclude nested bullet dependencies,
and check expected SHA-256 plus final read-set audits. They also mutate body,
metadata and frontmatter formatting independently between source selection and
graph reading. Whole-section wrapper arrays remain resolver-local even when
their immutable native nodes are shared.

### Canonical Unknown classification and custom iteration

An explicit internally shared raw view now uses the same canonical authored
classification as the default path. The provenance check does not grant that
behavior to arbitrary caller-supplied raw views. Equal-cell authored and
GENERATED rows remain physically distinct, public authored edits remain visible,
and explicit custom interpretations retain their existing semantics.

Span sharing now requires ordinary selection/children arrays with the unchanged
inherited Array iterator. Own data or accessor iterators, inherited iterator
changes, accessor-backed nodes and proxies use the fresh native walk. Eligibility
does not invoke a custom iterator before the real walk. Ordinary immutable
parser nodes continue sharing internal frozen spans; the public helper still
returns independent mutable arrays.

## Complete result preservation

The benchmark writes complete semantic JSON to a new output file and compares
the entire byte sequence. It does not strip hashes, selected content or read-set
fields. #347 and #348 intentionally correct the fields described above; all
other results in those probes are unchanged.

| Unchanged complete result | UTF-8 bytes | SHA-256 |
| --- | ---: | --- |
| #344 all API contexts | 193 | `7884c403a5af8811f45b8d905d984e85fe7a0dd4005d113614e251ccbe68199f` |
| #345 uncertainty projection and read set | 4,697 | `774d9f3da5020056bbadfd037a1725797b4602d78d7080162b37dd67925f9744` |
| #346 artifact/input strict/candidate graphs | 16,780,341 | `4d3bc952558effebb4b589f429fdb2095c8eb16d5ad883581b82d51357bfef3c` |

The benchmark's #345 observation hooks are inserted into an in-memory module
copy, with exact-match assertions for each insertion. It supports the baseline
direct evaluator and the new wrapper/compute shape. Imports still use the real
runtime modules. The hooks observe counters, node identities and phase boundaries;
they do not replace graphs, supply file-validity results or edit installed code.

## Actual CLI compatibility

Separate actual public CLI runs used the same Node `v24.22.3` and frozen runtime
files. These small fixtures check compatibility; they do not model the large
source/node probes or predict consumer execution time.

The existing `binding-status.mjs` benchmark used 2 units, 4 inputs, 4 extra unbound
rows, no matching Decision bindings and 1 selected source Item. Three plain
before/after pairs alternated execution order. All complete reports, including
13 result rows and every binding digest, were byte-identical. Separate diagnostic
and resource-only processes passed the same comparison. The complete report
SHA-256 was `b79d65eab2ca7d72ac3968363495ac096e83853ee395cd4ae75dacea913b046c`.
The shared fixture tree was `76ee4699e301efc7d9a8a3e00d5b60d97bfab22b`.

| Binding-status observation | Baseline | Changed |
| --- | --- | --- |
| Three plain whole-process samples, ms | 775.7, 640.5, 571.1 | 605.9, 647.9, 502.8 |
| Median, ms | 640.5 | 605.9 |
| Separate resource-only maximum RSS, KiB | 109,972 | 106,524 |

The existing `scoped-owner-memory.mjs` harness used 8 inputs, 2 unrelated
documents, 3 bullets per document and a 512-byte input padding target. The shared
fixture contained 25 tracked files and 15,598 bytes, tree
`faa6d4bce329688c8b0420f484e14def5c285bac`. The ready, denied and postwork pairs
compared complete stdout JSON plus every packet, status and run-report byte,
including checkpoint/backstop results and refusal reasons. All six processes
exited successfully and the paired bytes matched. Fixture HEAD/index/content/
modes remained unchanged; each successful child removed its raw snapshot.

| Workflow case | Whole process ms, baseline / changed | Maximum RSS KiB, baseline / changed | Equal stdout SHA-256 |
| --- | ---: | ---: | --- |
| ready | 1,034.2 / 1,039.4 | 101,444 / 101,360 | `91b0fdc128026d29de850bd3a6ae1c45d0c2661e7fd4a33f258ff0f977c20151` |
| denied | 816.1 / 876.8 | 105,624 / 101,536 | `a9c7b4b93054c31cca3adcabbce35a6fb18d5c7e0e14a6d27a74b51df2b8c66c` |
| postwork | 1,021.8 / 855.2 | 104,492 / 106,056 | `5f520a3f956ebdd8c2ead370bcf1631779bd74e749ff98039f6b792c22ad3325` |

Workflow time/RSS are single observations per side. The harness adds the same
startup/exit resource hook to both versions, uses no call-count loader and no
heap override, and excludes child Git resource usage from RSS. The ready and
denied observations are slower after the change; postwork has higher RSS. These
mixed small-corpus observations are not an overall speedup or memory claim.

## Regression validation and independent review

The new six files contain 33 cases. They cover source-size and node-count
overflow, both API caller families, Unknown and Conflict dependencies, alternating
oversized peers, public/raw view isolation, custom iterator forms, failed and
nested scopes, independent graph lifetimes, current-byte changes and final audit
changes. Existing #339–#342 tests are preserved.

The focused Node 20.20.2 API run passed 26/26. Node 24.22.3 dependency/Unknown and
existing uncertainty/authored runs passed 79 distinct cases; the source/input
metadata suite passed 27/27; new input plus unchanged multi-node spans passed
11/11. These focused counts overlap later packed coverage and are not added
together as one total.

Integration caught and corrected a source section wrapper accidentally shared
across resolvers; the existing #342 test was left unchanged. The first Conflict
test fixture lacked canonical typed row index facts. It now builds that small
record using the real target-index builder; no runtime workaround was added.
The dense dependency test's redundant third full parse was replaced by an
oversized-admission and cache-budget assertion; source-sized tests still directly
verify cleanup by reparsing after the scope ends.

The actual packed-runtime test passed on Node 24.22.3 in 286.2 seconds:

| Packed subprocess | Result |
| --- | ---: |
| Existing scoped resolver regressions, including #339–#342 | 898/898 |
| New syntax lifetime regressions | 33/33 |
| Body/metadata and observed input reads | 8/8 |
| Compact Evidence / Evidence advisory | 12/12 and 5/5 |
| Frontmatter / table selection / shared reference views | 21/21, 13/13 and 3/3 |
| Readiness and binding-status CLI / binding progress | 13/13 and 10/10 |
| Source admission CLI and package/CI wiring assertions | Passed |

Every new test file runs serially in a separate bounded child. The harness
checks the actual delivered module bytes, test exclusion and payload manifest
before and after execution; it does not replace delivered runtime modules with
source files. No failures, cancellations, skips or TODOs occurred in the resolver
or new-regression runs.

Fresh, independent Standards and Spec reviewers each reviewed the frozen runtime,
all six new regression files, canonical documentation, packed integration and
synthetic benchmark evidence. Both reported no P0/P1/P2 findings. Each also ran
12 lightweight regressions and two separate small iterator/wrapper-isolation
probes successfully. A Standards documentation clarification distinguishes an
independent graph from candidate graphs inside the same live uncertainty
evaluation; that wording was corrected. The final PR records their committed-tree
confirmation separately from these runtime and evidence fingerprints.

## PR #349 review follow-up: supported Node 20 CI

The initial [CI run 44676849906](https://github.com/KiDooSong/k-frontend-workflow/actions/runs/44676849906)
failed on both supported Node 20 jobs. Ubuntu's `test:spec` and the macOS broad
test invocation timed out in the packed dependency subprocess at the unchanged
300-second limit. Ubuntu's direct dense dependency case took 391.7 and 468.8
seconds in its two test steps. Node 24 passed. Earlier local Node 24 success and
focused Node 20 success were insufficient to establish full CI compatibility.

The outer scoped/test:spec commands run the new test files directly and also run
the packed harness, which executes them again. Four new dense fixtures account
for six whole parses per direct run; direct plus packed execution doubles that
work. Ubuntu Node 20 runs both the scoped step and `test:spec`, so those paths
exercise 24 dense parses in total. Per-file packed subprocesses do not prevent
an individual dense case from exceeding its time limit.

The correction replaces the large unselected flat lists in the API, dependency,
input and core syntax-reuse tests with 22,000 short paragraphs:

```js
'*a* *b* *c* *d*\n\n'.repeat(22000)
```

Each paragraph has twelve real AST nodes: a paragraph, four emphasis nodes and
seven text nodes. The padding alone contributes 264,000 nodes. The input-shaped
probe retains a real first `- one` Evidence bullet in `Extracted Facts` and places
the padding under `Background`. Its actual tree has 264,009 nodes and its source
has 374,042 UTF-16 code units. Thus it still exceeds the 262,144-node limit while
remaining below the 8,388,608-character limit.

The actual Node 20.20.2 parser rejected cache admission, parsed once and preserved
the selected raw bullet. Its isolated parse/view observation was 4,973.5 ms with
maximum RSS 604,392 KiB. This is a different local workload from the earlier CI
test case; it is not a directly comparable CI speedup ratio. Splitting the old
bullets into shorter lists still exceeded a separate 60-second probe bound. The
paragraph shape avoids the parser's per-list-item event insertion work.

All 33 regression cases, actual shipped-runtime checks, package/CI paths and
300-second subprocess bounds remain. Source-size overflow, nested lists,
freshness, mutable-wrapper isolation and read-set audit tests remain intact.
The API case now also asserts source length below the source budget and rejected
AST admission. The core case counts the already-built real tree, so a fixture
that no longer exceeds the node budget cannot silently pass. No production
runtime module, cache limit or consumer output was changed by this follow-up.

The actual packed-runtime test passed locally on Node 20.20.2 in 204.0 seconds:
898 existing resolver cases, all 33 syntax lifetime regressions, and all auxiliary
groups listed above passed with the original subprocess bounds. Fresh Standards
and Spec reviewers independently confirmed the real node-count boundary,
preserved selections and assertions, unchanged distribution and CI wiring, and
the distinction between local timing and full CI evidence. No actionable code
findings remained in the correction.

Full new-head Ubuntu Node 20 and macOS Node 20 completion is required to close
this P1; the final CI job URLs and outcomes are recorded in the PR. The local
packed pass alone does not establish that condition.

## Reproduction

Install the baseline and changed kit dependencies, then run each case in a fresh
process with the same Node executable. Use new output files for each side.

```sh
node kit-dev/benchmarks/scoped-syntax-lifetimes.mjs BEFORE_KIT 344 before-344.json
node kit-dev/benchmarks/scoped-syntax-lifetimes.mjs AFTER_KIT 344 after-344.json
cmp before-344.json after-344.json
```

Repeat for `345` and `346`. For `347` and `348`, compare the explicit corrections
in the first table instead of requiring equal JSON. `344-node` and `346-node`
remain optional slower standalone probes with the original 88,000-bullet shape.
The current committed regressions exercise the same node-budget overflow using
the paragraph padding described above. Those optional standalone modes were not
run for this evidence record.

Run the actual packed integration from the changed kit directory:

```sh
node --test --test-reporter=tap scripts/lib/scoped-work-packed.test.mjs
```

The CLI compatibility commands, run from the repository root, are:

```sh
node kit-dev/benchmarks/binding-status.mjs BEFORE_KIT AFTER_KIT 3 0 4 2 4 1
node kit-dev/benchmarks/scoped-owner-memory.mjs BEFORE_KIT AFTER_KIT \
  --out FRESH_OUTPUT --inputs 8 --documents 2 --bullets 3 --input-bytes 512 \
  --timeout-ms 60000 --budget-ms 360000
```

The pack harness first checks test exclusion and payload hashes. It then copies
only test drivers alongside the shipped runtime. Each new test file runs in its
own serial subprocess under the existing five-minute bound; the runtime modules
are never replaced. All public benchmark code stays under `kit-dev/` and out of
the consumer payload.

The five-probe harness SHA-256 is
`c73fb66506d024a93577e1f64ba7325a0f09511602d254a3b0dbad01b17305c4`.
The seven changed runtime files, sorted by basename as compact JSON pairs of
`[basename, SHA-256]`, have aggregate SHA-256
`48bb998da5bbf975ea164c55b625c2aa930254c9dcedd272539178aef8de6460`.
These fingerprints identify the measured code alongside the baseline commit;
they are not performance measurements. Consumer execution time and OOM recovery
remain separate observations requiring a run in that consumer environment.
