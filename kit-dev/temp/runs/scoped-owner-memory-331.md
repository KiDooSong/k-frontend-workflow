# Scoped owner syntax retention and diagnostics — #331

> HISTORICAL — 2026-11-19 kit development evidence. This records the implementation
> and synthetic measurements for [#331](https://github.com/KiDooSong/k-frontend-workflow/issues/331).
> Current contracts live in [scoped-work](../../../frontend-workflow-kit/docs/reference/scoped-work.md#bounded-syntax-retention)
> and the [roadmap](../../roadmap-current.md). This is not a consumer completion,
> release, gate promotion, or confirmation that the reported consumer OOM is resolved.

> Measurement revision: the tables below describe initial PR #332 head
> `ea7d68236027d3fd6410429ebb2ea41648133d59`. The review subsequently found
> repeated whole-document parsing for an oversized individual document. The
> [active-syntax follow-up](scoped-owner-active-syntax-332.md) records that fix and
> its separate measurements; do not attribute the original timing/RSS table to
> the later runtime fingerprint.

## Problem and comparison baseline

The issue reports a single adopted screen/unit preflight that reached `owner:start`
after preparing the snapshot and baseline inputs, then exited with a V8 heap OOM
after approximately 63 minutes without JSON or a packet. The original consumer
fixture is not available in the issue. Its pinned commit is
`30dd46d988c1f39e47e28e6495db44aee4b6205b`.

This change is based on main at `0269c8bdd72ffeed211cb29fa5c8741c2db5e340`, including
the metadata reuse and progress changes from #330. All before/after measurements
below compare that main commit with this change, rather than attributing #330's
improvements to this patch.

Two retention paths remained after #330:

- The shared Markdown AST and authored-view caches limited source length, while
  short bullets and table cells create multiple nodes, positions, and indexes.
  Source length alone did not control retained syntax structure.
- The uncertainty resolver retained every inspected document's text, body and
  reference view in a per-evaluation Map. Those strong references survived global
  syntax-cache eviction throughout the owner evaluation.

## Changes and preserved contracts

The new private syntax cache applies three independent LRU limits to each of the
shared AST cache, authored-view cache, and uncertainty document cache:

| Dimension | Per-cache limit |
|---|---:|
| Source | 8,388,608 UTF-16 code units |
| Native AST nodes | 262,144 |
| Entries | 512 |

A single oversized result remains available to its caller but is not retained by
the cache. These are structural retention limits, not V8 byte estimates or a bound
on total owner/process memory. Uncertainty eviction leaves the complete file-hash
map intact; a revisit rereads the file, checks its bytes against the original
observation, and the final canonical audit still verifies every observed file.

Eviction also exposed an object-identity assumption in deferred API Tracking.
An old remembered selection and a fresh parse can contain different native node
objects for the same physical cell. Tracking now matches the exact `tableCell`
start/end offsets within the already validated identical body. Different columns,
GENERATED tables, raw/authored alternatives, and changed bodies retain their
existing distinctions. The regression suite exercises a real oversized body,
not only a mocked cache miss.

Optional `--progress` diagnostics add owner stages `boundary`, `units`, `sources`,
`uncertainty`, `candidates`, and `audit`, with inclusive elapsed time, sampled heap
maximum, current heap/external/RSS, and process-lifetime high-water RSS. Samples
occur at boundaries and at most once per second during completed work. There is
no timer or per-node sampling. A failed diagnostic clock, memory read, or stderr
sink disables diagnostics without changing or repeating the evaluated callback.
Heap samples are not a true transient peak; a fatal V8 OOM cannot guarantee a
final diagnostic line.

## Reproducible end-to-end method

The [benchmark](../../benchmarks/scoped-owner-memory.mjs) and its
[fixture builder](../../benchmarks/scoped-owner-memory-fixture.mjs) create a
committed synthetic repository with one adopted screen, one selected behavior
unit, an active confirmed existing API candidate/manual contract, two existing
`M` targets, and one origin Evidence reference. A second pending-source unit is
the denied control. Dense unrelated artifacts exercise uncertainty scanning.

Each before/after case runs the real `workflow:run` CLI in a fresh process with
the same committed tree, request path and output path. The primary cases omit
`--progress` and use the same small startup/exit resource hook. The harness checks:

- Complete stdout JSON and packet/status/report bytes, without normalizing any
  fields: reasons, read sets, digests, checkpoint and backstop are included.
- Expected ready/denied states, both requested path authorizations, and the single
  origin. Postwork modifies the two requested files and reuses the preflight packet;
  `checkpoint.matched` and `backstop.ok` must both be true.
- Original HEAD, tree, index, file bytes, modes and worktree status, and successful
  raw-snapshot cleanup by each child.
- Runtime script, package and lock fingerprints before and after every child.

Environment: Node **v24.22.3**, Linux/x64. The measured default V8 heap limit was
**2,348,810,240 bytes (2,240 MiB)**; no heap override was used for these primary
cases. This differs from the issue's macOS/arm64 Node24.11 environment and roughly
4 GB heap. RSS is the Node process-lifetime `resourceUsage().maxRSS` high-water
value, converted from KiB to MiB; Git child-process resource use is not included.
The primary heap samples are startup/exit only and are not used as peak-heap claims.

There is one sample per side per case. A Node20 regression run shared the host
during measurement. Elapsed times are observations, not stable speedup estimates.
Both baseline and changed runtimes completed the primary corpora; these runs do
not reproduce the original OOM.

## Large corpus: 1,274 inputs

The fixture contains 1,274 inputs totaling **14,947,550 bytes**, 200 dense artifact
documents with 80 bullets each, and 1,489 tracked files totaling 16,727,966 bytes.
Dense artifacts total 1,459,890 bytes and 144,800 native nodes. The input node count
estimated from the common shape is 927,472. It does not fabricate the multi-GB
Git blob corpus discussed in related #321, so snapshot-scale conclusions are out
of scope.

| Case | Before max RSS (MiB) | After max RSS (MiB) | RSS reduction | Before (s) | After (s) |
|---|---:|---:|---:|---:|---:|
| Ready preflight | 1,455.965 | 984.613 | 32.4% | 99.727 | 128.952 |
| Denied preflight | 1,453.684 | 968.535 | 33.4% | 136.536 | 111.967 |
| Packet-bound postwork | 1,478.074 | 975.570 | 34.0% | 115.946 | 135.492 |

All six children completed with exit 0 on the default heap. Complete output bytes
matched for all three before/after pairs, including ready/denied verdicts and
postwork checkpoint/backstop. The ready observation took **29.3% longer** after
the change; the lower retention budget trades repeated parsing for lower retained
memory. No general runtime improvement is claimed.

Fixture commit: `a6cb9d7091aebbd70d064d8521f22be50ae82fc9`.
Fixture tree: `07595c39f0d19e7773f93c99715b4c122c90955f`.

| Output | Identical before/after SHA-256 |
|---|---|
| Ready stdout | `1b6275ae4f51d0d0ca78b398cb77be59d8c46900af0b49cf2a70c038a01bbd6f` |
| Ready packet | `4a294deda37e3c0d10f78d07ff50846ae1ee55f968af734f050607d69ac2ed80` |
| Denied stdout | `8dbaa94447adf351d0f85d11f5313eed17529b7046d41204b10eac5cf90fa81f` |
| Denied packet | `392bfad3e2e6a715bbb9ecbc510e27abc96b77c01051e11e326ccaaf84684732` |
| Postwork stdout | `45c28900c14aa5cfc01ae584acfa905ed20038269c3af494135217d70b05fbb6` |

## Medium control: 100 inputs

The same final runtime was also measured with 100 inputs, 200 dense documents and
80 bullets per document. All six children and all complete-output comparisons
passed. The full table is retained because lower syntax retention does **not**
guarantee lower RSS on every smaller workload; GC timing and repeated allocation
can produce a larger high-water mark.

The medium harness preceded two wording-only clarifications to the optional
old-space log label and memory-method description. Its invocation, timing,
resource hook and verification logic, and both runtime fingerprints, are identical
to the large measurement.

| Case | Before max RSS (MiB) | After max RSS (MiB) | Before (s) | After (s) |
|---|---:|---:|---:|---:|
| Ready preflight | 499.824 | 483.742 | 18.062 | 17.532 |
| Denied preflight | 510.562 | 537.836 | 14.936 | 20.562 |
| Packet-bound postwork | 368.301 | 507.379 | 21.757 | 21.514 |

## Separate progress-enabled observation

A separate large-corpus pair with `--progress` also completed with identical
stdout and packet/status bytes. It is kept separate from the primary measurements
because diagnostic work and sampling differ. The changed CLI took 92.893 seconds,
with 19.390 seconds between the logged owner start/done markers. Its two owner
projections took 6.322 and 3.967 seconds. The emitted stage records expose:

| Stage | Calls | Sum of inclusive elapsed time (s) |
|---|---:|---:|
| boundary | 2 | 6.991 |
| units | 2 | 6.203 |
| sources | 4 | 6.101 |
| uncertainty | 4 | 2.243 |
| candidates | 2 | 0.652 |
| audit | 2 | 0.384 |

These stages nest (for example, boundary includes units and sources); **do not
add rows to calculate total execution time**. Across 39 owner-memory samples,
the largest observed heap was 577,299,848 bytes (550.56 MiB). Node's process-lifetime
maximum RSS was 1,082,617,856 bytes (1,032.46 MiB). The heap figure is sampled,
and is not an exact peak or an apples-to-apples heap reduction claim.

The same invocation attempted an optional 256 MiB old-space pair after these
eight successful default-heap children. The baseline reached a V8 OOM after
37.879 seconds. The changed process was stopped after 29.133 seconds when the
predeclared 1,000-second overall benchmark budget expired; it had not reported an
OOM, but completion at that artificial limit is **unverified**. That optional
budget assertion made the aggregate invocation exit 1. The six primary cases
and two diagnostic cases were independently rechecked from their complete saved
records; their successful results above do not depend on the unfinished optional
case. The reproduction command below omits both optional pairs.

## Reproduction

From a checkout of this change, prepare a separate baseline worktree and install
the lockfile dependencies in both kits. Use Node24 for the comparison:

```sh
git worktree add --detach ../owner-memory-before 0269c8bdd72ffeed211cb29fa5c8741c2db5e340
npm --prefix ../owner-memory-before/frontend-workflow-kit ci --ignore-scripts --no-audit --no-fund
npm --prefix frontend-workflow-kit ci --ignore-scripts --no-audit --no-fund
node kit-dev/benchmarks/scoped-owner-memory.mjs \
  ../owner-memory-before/frontend-workflow-kit frontend-workflow-kit \
  --out ../owner-memory-large-results \
  --inputs 1274 --documents 200 --bullets 80 --input-bytes 11728 \
  --timeout-ms 300000 --budget-ms 1200000
```

Use a fresh `--out` directory. For the medium control, change `--inputs` to `100`.
`--fixture-only` saves a reusable fixture descriptor; `--fixture <fixture.json>`
reuses its exact committed tree. The measured large run used this two-step form.
Optional `--diagnostics` and `--heap-mb 256` add separate observations after the
six primary cases; they are not required for the primary default-heap comparison
and their timeout/OOM outcomes must not be described as a default-heap result.

Fingerprints for the large measurement (SHA-256):

| Subject | Hash |
|---|---|
| Benchmark harness | `b7f5e2ab8d52493ede450eaf05325418d7b4f756178064c3ecf2d6eba5fdfe17` |
| Fixture builder | `df2dcf3f2df9f93d23d02ae051c49ebb557791e101b82496fcae48ee6e6da579` |
| Before runtime scripts (152 files) | `b70060971dc08f4ec23c572b5d490f1463cec6e97d2d2f862e78628c70f8dd4e` |
| After runtime scripts (153 files) | `08bef6284b81d1bdc4458f040dbbfe7354b775709a1f23930609e6b115e0d76e` |
| Identical package lock | `5bb268fe3a1cd98ad1d2a04ee031af4922a5e605ebf0583ec2f6519e331dccec` |

Runtime fingerprints exclude tests and include the complete non-test script set;
the harness defines the exact sorted path/hash encoding.

## Regression verification

- New cache/memory regressions: independent source/node/entry limits, LRU and
  oversized behavior; real dense AST eviction; physical raw/authored selections;
  more than 512 scanned documents, a late inverse dependency and a late mutation.
- New graph-generation regressions: LF/CRLF, unchanged-body spans, different
  columns/GENERATED rows, open Unknown requirements, physical alternatives, and
  a real oversized uncached body in strict and candidate graphs.
- Progress regressions: stage nesting and failure, bounded sampling, opt-out,
  nested CLI isolation and diagnostic failure preserving the original result/error.
- Node20 v20.20.2 full `test:spec` sweep (116 files, file concurrency 3) completed:
  **2,860 passed, 10 platform skips, one outdated assertion failure** out of 2,871
  tests; the corrected file was subsequently rerun as described below. This was
  not a zero-failure invocation. Packed resolver subprocess: **821 tests passed**, plus the existing
  packed input syntax, Evidence, frontmatter, reference-view and binding CLI suites.
- The original full sweep loaded one outdated Evidence-cache assertion before it
  was corrected: it assumed the shared AST retained the oldest of 4,097 documents.
  The assertion now verifies Evidence reconstruction whether the lower AST cache
  reparses or reuses syntax. The corrected complete provenance file passed **31/31**
  on Node20; this correction does not change runtime code.
- Node20 example state/readiness generation and idempotence, example validation,
  kit pack, and all **33 golden fixtures** passed. `git diff --check` passed.

## Remaining scope

The original consumer must rerun on its own Node/platform and input corpus to
establish whether its 63-minute OOM is resolved. Parser scratch allocations and
genuinely selected dependency/candidate graphs still scale with input, and the
three retention budgets are not a global memory ceiling. The new owner-stage
diagnostics provide timing and memory evidence for that follow-up. Authority,
read-set/digest rules, human approval, adoption, gates and release version remain
unchanged; #331 is referenced rather than automatically closed.
