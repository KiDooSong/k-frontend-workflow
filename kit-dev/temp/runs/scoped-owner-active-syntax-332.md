# Active document syntax reuse — PR #332 review follow-up

> HISTORICAL — 2026-11-19 kit development evidence for the P2 review of
> [PR #332](https://github.com/KiDooSong/k-frontend-workflow/pull/332), Refs #331.
> The [initial memory report](scoped-owner-memory-331.md) describes head
> `ea7d68236027d3fd6410429ebb2ea41648133d59`; this report records its review fix.
> Current contracts: [syntax retention](../../../frontend-workflow-kit/docs/reference/scoped-work.md#bounded-syntax-retention)
> and the [roadmap](../../roadmap-current.md). This is not a release or a claim
> that the original consumer OOM has been reproduced or resolved.

## Reproduced problem

The review correctly identified an oversized-document exception to the intended
reuse policy. The global AST cache and the uncertainty document cache both skip
an item larger than 8,388,608 UTF-16 code units. During uncertainty enumeration,
each new Unknown row then parsed the same body again for its physical range,
the new candidate graph's reference resolver, and the graph's actual-byte view.
No other document needed to evict the large body for this to occur.

A clean copy of `ea7d682` reproduced the reported additional parse counts after
the initial target index was built:

| Unknown rows | Before this fix | After this fix |
|---|---:|---:|
| 1 | 6 | 1 |
| 8 | 27 | 1 |
| 16 | 51 | 1 |

The fixture has one owner and three artifact documents. Every Unknown links to
the same selected Rules section. An ASCII comment in an unselected Appendix
makes the document exceed the source-character budget while staying below the
supported 16 MiB file-read limit. The native AST counter is measured after the
real target-index construction, not by mocking parser calls.

## Fix and lifetime

`withReconciliationSyntax` creates a synchronous scope for one exact source
string and its internally parsed, frozen native tree. Nested parser consumers
reuse that tree even if the retained-cache policy rejects or evicts it. The scope
accepts no caller-supplied tree, file-validity result, projection or authority.

`withScopedDocumentSyntax` also reuses the internally shared raw and authored
views for that source. Pinning only the native tree would leave repeated
generated-block stripping and authored table-index construction. A resolver
wrapper may reuse the shared sections; a different native generation or custom
raw sections keep their own derived contents.

The uncertainty document loader reads and validates actual bytes before opening
the scope and constructing the first view. The scope covers that document's
canonical row batch. A cache miss inside it still rereads bytes and compares the
original hash; only syntax is reused. Candidate graphs retain their own current
file reads, metadata/indexed-body comparisons and final canonical-path/hash
audits. The final uncertainty audit also remains unchanged.

The review fix also covers the later selected-row path. Consecutive selections
from the same file use one scope while expanding covered Unknown rows, without
reordering selections. Candidate graphs' same-file physical spans are computed
while syntax is active and retained in the existing per-evaluation weak span
cache for later relation merging.

Both active stacks restore their predecessor in `finally`. Successful returns,
exceptions and nested A → B → A calls cannot leave a scope active. A later
independent evaluation or an asynchronous continuation must parse oversized
syntax again, even while a caller still holds an earlier result. Other dependency
documents keep using the existing bounded caches; there is no owner-wide map of
oversized syntax introduced by these scopes.

The retained-cache limits remain **8,388,608 source code units / 262,144 native
nodes / 512 entries per cache**. This working scope does not impose a total
process-memory ceiling; a currently required document and selected graph still
need memory while being processed.

## Regression evidence

[scoped-work-active-syntax.test.mjs](../../../frontend-workflow-kit/scripts/lib/scoped-work-active-syntax.test.mjs)
uses real files and verifies:

- 1/8/16 Unknown rows produce **1/1/1** additional whole-document parses after
  indexing, with the complete projection equal to a small-Appendix control.
  The complete read set differs only in the actually changed document's hash.
- Selecting the whole `#unknowns` section produces **11/11** parses for 1/8 rows.
  Those fixed parses include preceding unit/Decision phases; the later covered
  row loop does not add a parse per row. This case caught an incomplete first
  fix that still produced 14/35 parses after enumeration.
- Independent evaluations reparse oversized syntax and return identical complete
  results while the preceding result remains alive.
- Changing the actual file during candidate resolution is rejected. A fresh
  indexed evaluation after that failure starts a new scope and succeeds.

[scoped-work-syntax-scope.test.mjs](../../../frontend-workflow-kit/scripts/lib/scoped-work-syntax-scope.test.mjs)
adds four helper-level regressions: real global entry eviction during a scope;
nested successful/error restoration and oversized release; asynchronous
continuation isolation; and explicit foreign/custom raw-view semantics.

Node20.20.2 passed **205/205** focused tests across the new suites and existing
AST, memory, uncertainty, graph generation, shared views, generated boundaries,
progress and applicability suites. The new suites are included in the packed
resolver list: **829/829 packed resolver tests passed**, along with packed input
syntax/Evidence/frontmatter/reference-view and readiness/binding/source-admission
CLI checks. Both packed harness tests passed with no skips or cancellations.
Example state/readiness generation and idempotence, example validation and
kit pack passed on Node20. Golden fixture verification reported **33 pass,
1 expected historical failure, zero unexpected failures or drift**.

## Paired evaluator observations

The [portable benchmark](../../benchmarks/scoped-active-syntax.mjs) uses the same
actual fixture path and bytes for each before/after pair, one fresh Node24.22.3
Linux/x64 process per sample, and identical target-index preparation. Before is
`ea7d682`; after is this follow-up runtime. No heap or profiling flags are passed.
The complete result JSON is compared byte-for-byte, without normalization.

| Unknown rows | Before evaluation (s) | After evaluation (s) | Before max RSS (MiB) | After max RSS (MiB) |
|---|---:|---:|---:|---:|
| 1 | 4.810 | 1.022 | 126.324 | 150.117 |
| 8 | 30.858 | 3.786 | 204.168 | 190.039 |
| 16 | 62.011 | 13.483 | 171.090 | 190.543 |

All three complete JSON comparisons and fixture/runtime preservation checks
passed. The parse counts are the 6/27/51 → 1/1/1 table above. Time excludes index
preparation; RSS is Node's whole-process high-water value, including preparation.
These are single observations under concurrent test load. The fix addresses
repeated parsing, and does not claim that RSS improves for every oversized
document or that these timings predict consumer latency.

| Rows | Identical complete-result SHA-256 |
|---|---|
| 1 | `2856fa0f818c711dc80e07ae3eff1da58a9e48ac60ed0591b6a941b4af148c92` |
| 8 | `178ca12f04510e64299b6ad90549757e158e3090422ad5a60fa3cb2f6f178207` |
| 16 | `9ca924cae36ef66b0212ecf4cb6182b354aa2180d5e095c6b2dd9089b345260f` |

The measured driver initially supplied a fractional subprocess timeout before
the last worker. Only the missing final worker was resumed after integer rounding,
against the same preserved fixture/runtime; no completed sample was repeated or
discarded. The repository harness fixes that driver handling from the start and
adds portable arguments/help and a fresh-output guard. Its worker is byte-identical
to the measured worker (SHA-256
`9533987029f8cabd90e6455ead13f840aae82ee901e42b07e552c0abe8635673`).

Reproduce from this checkout with installed dependencies in both kits:

```sh
git worktree add --detach ../active-syntax-before ea7d68236027d3fd6410429ebb2ea41648133d59
npm --prefix ../active-syntax-before/frontend-workflow-kit ci --ignore-scripts --no-audit --no-fund
node kit-dev/benchmarks/scoped-active-syntax.mjs \
  ../active-syntax-before/frontend-workflow-kit frontend-workflow-kit \
  ../active-syntax-results
```

The output directory must not already exist. The harness has a 175-second total
budget and a 120-second per-child cap, and retains the fixture and result records.

## Full CLI comparison with an oversized artifact

The unchanged [owner-memory harness](../../benchmarks/scoped-owner-memory.mjs)
was also run with a synthetic Git fixture containing **8 inputs, 520 archive
artifacts with 8 bullets each, and one resolved Unknown linking the selected
Rules section**. The Unknown is in `archive-00000.md`, whose ASCII comment
Appendix takes its body to **8,389,446 UTF-16 code units**. A resolved synthetic
row keeps the ready control executable; the separate pending-source request
still supplies the denied control. The fixture contains 543 tracked files and
8,927,916 tracked bytes.

Both runtimes used the exact same Git tree, request and output paths. Each child
ran Node24.22.3 on its default measured **2,240 MiB** V8 heap, without a heap flag.
The following primary pairs omit `--progress`:

| Case | Before (s) | After (s) | Before max RSS (MiB) | After max RSS (MiB) |
|---|---:|---:|---:|---:|
| Ready preflight | 66.136 | 56.580 | 355.914 | 372.023 |
| Denied preflight | 52.564 | 46.048 | 355.113 | 371.902 |
| Packet-bound postwork | 66.969 | 57.508 | 352.602 | 377.109 |

All six children completed with exit 0. The harness compared complete stdout
JSON and every packet/status/report byte without normalization. The denied
control retained both denials; postwork retained `checkpoint.matched: true` and
`backstop.ok: true`. Original HEAD/tree/index/file bytes/modes/status were
preserved and every successful child cleaned its private snapshot.

The two separate `--progress` ready runs also completed and matched the primary
ready stdout and artifacts exactly: 65.027 seconds before and 44.534 seconds
after. Thus **all eight paired CLI runs passed**. In that diagnostic pair, owner
duration was 53.552 → 33.145 seconds; the four inclusive uncertainty stages totaled
32.023 → 14.388 seconds. Stage times nest and must not be added to the owner time.
The after run's largest owner heap sample was 137,961,128 bytes; this is not a
true transient heap peak.

This fixture records a **4.5–7.0% increase in maximum RSS**, alongside the observed
elapsed reduction. Active syntax has a working lifetime and is not a promise of
lower RSS for every input shape. No additional global-cache capacity was added.
Timings are single observations under shared-host load, and neither this fixture
nor the direct evaluator case establishes the unpublished consumer's latency or
OOM outcome.

Fixture commit: `8277e0e0bd5e7d706b0eba9ac71d25b2de88731c`.
Fixture tree: `55db799bde0c4d8e93600ccfdef19cefe08e83ec`.

| Output | Identical before/after SHA-256 |
|---|---|
| Ready stdout | `84c5ff4cea288ef19c8e5b2d549e86283a0b1700fc3c8766652ae0adea451655` |
| Denied stdout | `90034cc6d6cb59ca297d73eac2042e620fc79a1400ea4e7a003dac1d5fc74dc3` |
| Postwork stdout | `0e9bd5b37c929f2726921c360adc3a0d57ca4854922bf342e67f51c212040c6e` |
| Preflight/postwork packet | `f35b2649bb9e6f9a93c008653ec76e6b3c50a0d2d644e4ade10fe1008e1f19ce` |
| Postwork report | `44254c81dda840af6559bf41782a053c66e71561459c827006330c97370aef7f` |

An earlier eight-Unknown version of this CLI fixture reached the predeclared
180-second child limit on the baseline ready run (180.045 seconds, timeout,
no V8 OOM). That incomplete baseline is not included in the successful-pair
table. The one-row control above is a separate committed fixture; candidate-row
scaling remains covered independently by the 1/8/16-row paired evaluator and
the selected-section regressions. The CLI attempts share a 900-second overall
budget; no heap-limit experiment or larger execution allowance was introduced.

A single after-only ready run on the preserved original eight-row fixture also
completed within that budget: **79.110 seconds**, `HALT_READY_FOR_WORK`, exit 0,
no timeout/OOM, maximum RSS **414.832 MiB**, and unchanged repository state with
successful child cleanup. The timed-out baseline produced no complete output,
so this eight-row observation has **no before/after byte-parity or precise
speedup claim**. Different concurrent load further limits timing comparisons.

The stock harness checked these runtime-script SHA-256 fingerprints before and
after every child (its path/hash encoding differs from the direct benchmark):

- Before: `08bef6284b81d1bdc4458f040dbbfe7354b775709a1f23930609e6b115e0d76e`
- After: `0fd89e577f480a94a671200c9f5b90b25019c7c10f3f5b12252f377643caf593`
- Identical package lock: `5bb268fe3a1cd98ad1d2a04ee031af4922a5e605ebf0583ec2f6519e331dccec`

To recreate the CLI corpus with the stock fixture builder:

1. Call `createFixture(beforeKit, freshRoot, { inputs: 8, documents: 520, bullets: 8, inputBytes: 11728 })`
   from `kit-dev/benchmarks/scoped-owner-memory-fixture.mjs`.
2. Append this exact string to `docs/frontend-workflow/domains/archive/rules/archive-00000.md`:

   ```js
   '\n## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n' +
   '| U-ACTIVE-1 | Review artifact:MEMORY-RULES#rules | resolved |\n' +
   '\n## Appendix\n\n<!-- ' + 'x'.repeat(8 * 1024 * 1024) + ' -->\n'
   ```

3. Rebuild `_meta/workflow-state.yaml` with the baseline `buildState`, the fixture's
   `.kit/layout.yaml`, and date `2026-11-19`; commit the fixture changes.
4. Refresh the descriptor's commit/tree, tracked byte/file totals, dense metadata
   and `state` from `repositoryState(freshRoot)`, then save its JSON.
5. Run the stock owner-memory harness with both kit paths, `--fixture` pointing to
   that descriptor, a fresh `--out`, `--diagnostics`, `--timeout-ms 180000`, and
   `--budget-ms 900000`. Omit `--heap-mb`. For an eight-row variant, emit rows
   `U-ACTIVE-1` through `U-ACTIVE-8` with the same Question and resolved Status.

## Focused test reproduction

Run the focused regression on Node20 or Node24 from `frontend-workflow-kit`:

```sh
node --test scripts/lib/scoped-work-active-syntax.test.mjs \
  scripts/lib/scoped-work-syntax-scope.test.mjs
```

The test prints actual after-index parse counts and diagnostic elapsed times.
The assertions check counts, complete results and validation boundaries rather
than wall-clock thresholds.
