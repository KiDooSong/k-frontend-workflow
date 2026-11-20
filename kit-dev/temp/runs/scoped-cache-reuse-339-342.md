# Scoped syntax and selection reuse — #339–#342

> HISTORICAL — 2026-11-20 (Asia/Seoul), kit development evidence.
> Baseline: `2e6bc6620f88315373526dd6728ce16f39652568`, including merged #338.
> Earlier comparison: `f9ac1fa3daa2f58465df84bf65748c671f97beb6`.
> Current contracts: [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md#binding-basis-and-status).
> All fixtures below are public synthetic inputs. No private consumer document,
> identifier, review transcript or measurement is included.

## Latest-baseline reproduction

The four public reproductions were rerun with Node `v24.22.3` on Linux x64.
Both the pre-#338 commit and the latest merged baseline retain all four issues.
The changed runtime fixes their deterministic acceptance criteria:

| Public issue | `f9ac1fa` | `2e6bc66` | Changed runtime |
| --- | --- | --- | --- |
| [#339](https://github.com/KiDooSong/k-frontend-workflow/issues/339): one graph, 88,000 unrelated bullets | 2 complete parses | 2 complete parses | **1 complete parse** |
| [#340](https://github.com/KiDooSong/k-frontend-workflow/issues/340): 500 API candidate lookups | 250,000 row-index entries examined | 250,000 row-index entries examined | **500 entries, indexed once** |
| [#341](https://github.com/KiDooSong/k-frontend-workflow/issues/341): Unknown classification after public header edit and AST eviction | old `true`, new `false` | old `true`, new `false` | **both `true`; public header stays `Edited`** |
| [#342](https://github.com/KiDooSong/k-frontend-workflow/issues/342): two graphs selecting the same two native input nodes | equal span values, separate arrays | equal span values, separate arrays | **same internal frozen array** |

For #340, the original `sameAuthoredView` comparison between two explicitly
supplied public mutable raw containers remains `false`. Those containers keep
independent interpretations. The corrected internal canonical API path is
verified by shared section identity and the row-index operation count. Both
baseline and changed API probes parse the Markdown AST once; this fix removes
repeated derived view/index construction, not another complete AST parse.

The #342 probe retains two distinct graph selections and two distinct wrapper
arrays holding the same ordered native nodes. All six leaf spans are unchanged.
Public span helper calls still return independent mutable arrays, and each new
evaluation has its own internal span store.

## Implementation and boundaries

### #339: reuse this graph's already parsed view

The reference resolver exposes an internal, read-only lookup of its already
parsed view, guarded by its private resolver identity, artifact ID and exact
body. Strict and candidate graph document readers use it only after reading the
current canonical file and comparing frontmatter and indexed body. It is a
handoff within one resolver's existing lifetime, not a new source-text cache.
Another graph or failed call cannot pin an oversized view for a later call.
The final canonical read-set audit remains unchanged. Source-input Evidence
parser behavior is outside this artifact-backed graph change.

### #340 and #341: separate canonical syntax from mutable public views

A private tree-keyed authored view supplies canonical API sections and their
row indexes. Public `scopedAuthoredView()` values and explicit custom raw views
retain their existing mutable behavior. Canonical Unknown classification uses
private syntax and compact physical-row facts, so it cannot inherit an edited
public header when the native AST changes generation. GENERATED and authored
equal-cell rows remain physically distinct. The weak tree associations add no
independent source-text cache or retention threshold.

### #342: key multi-node ranges by ordered native identities

The evaluation-local span resolver uses a weak identity trie for the complete
ordered node sequence. It still checks exact body and input-bullet nesting
mode, and resolves the current selection on every lookup. Reversed sequences,
prefixes, repeated nodes, different physical positions and different parser
generations cannot alias. Mutable nodes, accessors and proxies keep the original
fresh-computation path.

## Output preservation

The complete #339 graph, including metadata, selected content and read-set hash,
is identical across both baselines and the change. The API contexts and the
input graph plus span values also match byte-for-byte:

| Reproduction output | UTF-8 bytes | SHA-256 |
| --- | ---: | --- |
| #339 complete graph | 437 | `2b996ec9ecbbeef07c60fb116c949373ac94ddf811396777e91de4dcccd889b1` |
| #340 all 500 candidate contexts | 24,001 | `8762eb5b67592a1f4f8da8ade0f0fdbbb97080b1eda89b996a56bd3dcd9c67bd` |
| #342 complete input graph and spans | 900 | `1ea48622642b60a663958faf5be217d16a5fa982c52268940f834bf85e2bf623` |

#341 intentionally changes only the incorrect reparsed classification in this
probe; the original classification, same physical offsets and retained public
header edit are checked separately.

## Regression verification

The three new suites contain **14 cases**:

- Four graph-view tests: resolver/body provenance; source-length overflow with
  one parse for strict and candidate graphs; independent/failed call lifetime;
  current body/frontmatter changes; final audit rejection.
- Five authored-isolation tests: 500-row index reuse; mutable public/raw views;
  GENERATED rows and Tracking; AST-generation changes; stable Unknown facts.
- Five multi-node span tests: actual independent input graphs; order, prefixes
  and repeated nodes; nested-list mode; exact body and native generation;
  mutable-descendant fallback; public mutable return values.

Node 24.22.3 focused runs passed the 14 new cases, the authored/API/generated/
shared-ref/selection/syntax-scope group (**97/97**), refs/graph/graph-cache group
(**65/65**), existing physical-span checks (**6/6**) and subsection suite
(**16/16**). These groups overlap with broader verification and are not summed.

The actual packed runtime passed under Node **20.20.2**: **898 resolver tests**
with no failures/cancellations/skips/todos, plus the existing parser/Evidence,
frontmatter, table, shared-view, readiness/binding/progress and source-admission
CLI subprocesses. Both outer packed-harness tests passed. Runtime modules were
checked against source bytes and the payload manifest; only test drivers were
placed beside the shipped runtime. The new suites remain excluded from the
consumer payload and are included in this packed validation.

A separate Node 24.22.3 comparison used the existing
`scoped-owner-memory.mjs` harness with two inputs, two bullets per input and no
unrelated documents or padding. All **six actual `workflow:run` executions**
(before/after ready, denied and postwork) passed complete stdout, packet, status,
report, digest/checkpoint and backstop comparisons. The original Git tree,
index, file bytes/modes and successful child snapshot cleanup were preserved.
This small integration fixture includes an active API candidate and two units;
it verifies output preservation, not large-consumer performance.

Independent review of the graph handoff, canonical/public view separation and
ordered span identity found no actionable P0/P1/P2 correctness issue. Six extra
authored-isolation counterexamples passed, including public/custom edits before
initial classification, active scopes and new AST generations, definition-backed
API references, and attempted mutation of canonical nested headers.

## Reproduction

Install each checkout's existing lockfile dependencies. Run every case in its
own fresh process with the same Node binary:

```bash
node kit-dev/benchmarks/scoped-cache-reuse.mjs /path/to/baseline/frontend-workflow-kit 339 /tmp/before-339.json
node kit-dev/benchmarks/scoped-cache-reuse.mjs /path/to/changed/frontend-workflow-kit 339 /tmp/after-339.json
```

Repeat with `340`, `341` and `342`, using fresh output filenames. The optional
result file contains complete semantic output; stdout contains operation counts,
identity checks, runtime version and a result fingerprint. The 88,000-bullet case
can take tens of seconds and substantial parser memory. Use an external process
timeout when running it in automation.

The full CLI output comparison can be repeated with:

```bash
node kit-dev/benchmarks/scoped-owner-memory.mjs /path/to/baseline/frontend-workflow-kit /path/to/changed/frontend-workflow-kit \
  --out /tmp/fresh-cache-reuse-cli --inputs 2 --documents 0 --bullets 2 --input-bytes 0 \
  --timeout-ms 120000 --budget-ms 360000
```

The Node 24 #339 observations were 47,212ms for `f9ac1fa`, 48,428ms for `2e6bc66`
and 23,829ms for the changed runtime. Some small tests overlapped the diagnostic
runs. The #340 observations also overlapped other work. These are **not controlled
performance samples or evidence of an end-to-end speedup**. Deterministic parse
and index counts are the supported performance findings. Actual consumer runtime
and OOM resolution still require a consumer rerun.

## Changed runtime fingerprints

SHA-256 of the files used for the reproductions:

| File | SHA-256 |
| --- | --- |
| `scripts/lib/scoped-work-authored.mjs` | `b7d5e0551385b1716b5ca08d8bcda2131a5deeeae3dea1caa1bbc6f3d67b560f` |
| `scripts/lib/scoped-work-graph.mjs` | `852c5c88cda9839c920647f44de5e95c8bd93ab406e0768e3f42523be6b502b5` |
| `scripts/lib/scoped-work-refs.mjs` | `c1618af387af3c4109b05d2824607c73f48f5be153a260e2ab3615fe6b70f38f` |
| `kit-dev/benchmarks/scoped-cache-reuse.mjs` | `b64f40e5b18ece6f75b620b1d27b20f5c6b484cf497dd80227d8fd1d62d8404d` |
