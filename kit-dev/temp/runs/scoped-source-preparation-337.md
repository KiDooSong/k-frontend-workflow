# Scoped source input preparation — #337

> HISTORICAL — 2026-11-20 (Asia/Seoul) kit development evidence for
> [#337](https://github.com/KiDooSong/k-frontend-workflow/issues/337).
> Baseline: `f9ac1fa3daa2f58465df84bf65748c671f97beb6`, including merged #336.
> Current contracts live in [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md#binding-basis-and-status)
> and the [roadmap](../../roadmap-current.md). All fixtures and published
> measurements here are synthetic. Private consumer documents, identifiers,
> logs and measurements are not included.

## Problem and change

The public reproduction fixes one owner and two units while increasing only the
input inventory. Thirty source resolver constructions each copied every input,
built the duplicate-preserving index and validated the full metadata inventory.
An independent 32-input call probe found that thirteen of those constructors
never used input evidence; seventeen still did. Deferring unused constructors
alone would therefore leave repeated preparation in the active resolvers.

The CLI-owned Git snapshot now prepares a detached, frozen input collection when
all metadata and record fields are eligible plain data. The first source
constructor builds a private catalog of ID positions and metadata-only
validation results. Later source constructors in that snapshot reuse those pure
facts. Duplicate positions and the entire unselected fidelity inventory remain
part of the calculation. Other baseline/source-relation validation paths are
unchanged; this is not a process-wide validation-result cache.

Each observation scope owns its immutable source seeds, with supplied bodies
cleared. Each resolver owns its array of record references and copies selected
records before loading their bodies. Loaded-file state, section caches and
register validation remain local. Nested observers share catalog facts while
retaining their own passive Evidence callbacks and read histories.

Ordinary source/graph callers keep their eager copies, current inventory
validation and getter/clone failure timing. Arbitrary frozen or copied arrays
do not acquire the private identity. An unsupported metadata value or unusual
record field keeps the entire inventory on the ordinary fallback path.
Ownerless reports skip preparation. Preparation does not read input bodies.

Every selected source still reads current bytes, compares indexed metadata and
computes its current hash. Expected-hash checks and final canonical read-set
audits remain in place. The original collected execution inventory still drives
authority/backstop checks, including unselected inputs. No scope-basis version,
binding/approval rule, execution gate, parser retention limit or file-read limit
changes. Public returned metadata remains detached and mutable.

## Public reproduction and operation counts

The fixture has one adopted owner, two units, two selected source inputs, zero
unrelated documents, one bullet per input and no padding. The measurements use
Node `v24.22.3` on Linux x64 and fresh default-heap processes. The issue's earlier
macOS/Node measurements provide the reproduction shape, not a directly
comparable timing baseline.

| Full input inventory | Baseline owner record preparations | This change | Reduction |
| ---: | ---: | ---: | ---: |
| 32 | 960 | **82** | 91.5% |
| 128 | 3,840 | **274** | 92.9% |

For this exact fixture, `30N` becomes `2N + 18`: two observation contexts prepare
their seeds once, and the resolvers prepare eighteen selected local records.
The catalog's full metadata validation runs once for the owned inventory.
These are actual source seed/selected-record preparation operations within the
owner progress context. They are **not file-read counts, Markdown-parse counts,
unique inputs or a whole-command speed ratio**. Initial CLI metadata preparation
outside that context remains included in the plain whole-process timings.

## Whole-command timing qualification

The first single-sample comparison had slower plain `binding-status` times at
both input counts. To investigate that concrete concern, the sample count was
fixed at five for each side and input count before the second series began.
Each pair alternated before/after order, with the starting side reversed at the
next input count. All samples are retained; no favorable sample was selected.
No other agent test or benchmark process ran during either measurement series.

The repeated series gave mixed results. **At 128 inputs, the median increased
13.1%. This evidence does not establish an end-to-end speedup or rule out an
end-to-end regression.** The supported performance claim is reduced repeated
input preparation. It is not a claim that the consumer's long execution or OOM
has been resolved.

| Plain `binding-status`, five samples | Baseline median | This change median | Median change | Baseline min–max | This change min–max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 32 inputs | 722.238 ms | 540.634 ms | −25.1% | 507.565–731.185 ms | 522.124–647.393 ms |
| 128 inputs | 825.384 ms | 933.287 ms | **+13.1%** | 808.117–982.432 ms | 765.957–991.167 ms |

Every plain elapsed sample, in pair order (milliseconds):

| Inventory / runtime | 1 | 2 | 3 | 4 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 32 / baseline | 726.408 | 674.082 | 731.185 | 722.238 | 507.565 |
| 32 / changed | 647.393 | 540.634 | 536.309 | 522.124 | 555.989 |
| 128 / baseline | 982.432 | 863.180 | 825.384 | 817.961 | 808.117 |
| 128 / changed | 933.287 | 991.167 | 765.957 | 830.063 | 980.027 |

The separate diagnostic processes also gave mixed `sources` stage timings.
These include progress diagnostics and are not plain process measurements:

| Sum of two `sources` stages | Baseline | This change |
| --- | ---: | ---: |
| Repeated-series diagnostic, 32 inputs | 227.395 ms | 146.461 ms |
| Repeated-series diagnostic, 128 inputs | 384.574 ms | 591.536 ms |

The first series is retained rather than replaced by the repeated result:

| First series, one sample per side | Baseline | This change |
| --- | ---: | ---: |
| Plain binding, 32 inputs | 701.580 ms | 796.531 ms |
| Plain binding, 128 inputs | 827.917 ms | 972.306 ms |
| Diagnostic sources sum, 32 inputs | 268.808 ms | 150.167 ms |
| Diagnostic sources sum, 128 inputs | 423.116 ms | 346.054 ms |

## Output and execution equivalence

All **twenty plain and four diagnostic** binding-status results in the repeated
series matched completely, byte for byte within each fixture. Each report is
1,374 bytes, retaining unit applications, binding/blocking fields, basis version
and `approval_verified: false`. The fixture's missing binding has no computed
digest; source/coverage basis and nonempty binding digest behavior are covered
by the regression and existing binding suites below.

The largest fixture also ran before/after `workflow:run` ready, denied and
postwork cases. All six runs matched their complete stdout, packet, status and
report bytes, including the harness's digest/checkpoint comparisons. Original
fixture HEAD, index, bytes, modes and status were unchanged, and successful
children cleaned their temporary snapshots. The first series passed the same
output, execution and preservation checks.

| Repeated-series workflow case, one run per side | Baseline elapsed | This change elapsed | Baseline peak RSS | This change peak RSS |
| --- | ---: | ---: | ---: | ---: |
| ready | 2,421.402 ms | 2,355.876 ms | 251,220 KiB | 261,092 KiB |
| denied | 1,785.209 ms | 1,898.722 ms | 265,320 KiB | 252,300 KiB |
| postwork | 2,427.268 ms | 2,464.540 ms | 262,960 KiB | 262,676 KiB |

Workflow measurements use the existing symmetric startup/exit resource hook;
plain binding processes have no loaders or resource instrumentation. Workflow
time and RSS are individual observations and do not demonstrate a memory or
speed improvement. Remaining register validation and actual file/audit work are
intentionally retained.

## Regression and independent review

The new tracked suite contains thirteen cases: repeated preparation, independent
owned inventories, exact two-unit source/coverage outputs, current body/hash and
mutable-result isolation, supplied-body stripping, nested observer independence,
selected duplicate IDs, final graph byte auditing, copied-array identity loss,
three unselected fidelity-terminal cases and unusual-data eager fallback.

| Verification | Result |
| --- | --- |
| Supported Node `20.20.2`: new suite + input metadata + sources + source relations | **110/110 passed** |
| Node `24.22.3`: existing input metadata + sources + provenance | **58/58 passed** |
| Node `24.22.3`: binding status + binding progress | **30/30 passed** |
| Independent Spec adversarial probes | **5/5 passed** |
| Actual packed runtime on supported Node 20 | **884 resolver tests passed**, plus packed parser/Evidence checks, binding/progress CLI and source-admission CLI suites; both outer harness tests passed |

Standards and Spec were reviewed independently against the frozen runtime below.
Both found no P0/P1/P2 correctness or contract defect. Standards requested a
stale execution comment be aligned with shared metadata-only validation; it was
corrected before measurement. The Spec review checked the ordinary eager API,
duplicate/fidelity inventory, nested observation scope, detached public results
and final-byte audit. The performance qualification above remains part of the
review result; neither review asserts a general wall-time improvement.

## Reproduction and fingerprints

From the repository root, with dependencies installed for both runtime trees:

```sh
node kit-dev/benchmarks/scoped-source-preparation.mjs \
  /path/to/f9ac1fa/frontend-workflow-kit \
  "$PWD/frontend-workflow-kit" \
  /path/to/fresh/source-preparation-evidence \
  --inputs 32,128 --samples 5 --timeout-ms 180000 --budget-ms 900000
```

Every child is bounded; the overall measurement budget starts after fixture
preparation. Both runtime trees must reside on the same filesystem. The harness
rejects an existing output directory, Node instrumentation variables and Git
redirection variables. Before/after runs use identical fixture and output paths;
no output normalization or private data substitution is used.

Runtime script fingerprints exclude test files, include relative paths and modes,
and were checked before and after each child in both measurement series:

| Fingerprint | SHA-256 |
| --- | --- |
| Baseline runtime scripts | `737fcb1509ac731c6f0a6517b6f84aa2892b32cb53df0c6f0051da5e453831e8` |
| Changed runtime scripts | `eac170eb9e2151edf2befd1bccdddc8b14f14fa2ab6862b27e7c09657126847b` |
| Shared package.json | `f51abeb4e0649a78e74ed2e64fb242dc8164a2d3cc7ec624edfdb8a5b17d0e1a` |
| Shared package-lock.json | `5bb268fe3a1cd98ad1d2a04ee031af4922a5e605ebf0583ec2f6519e331dccec` |
| Fixed-five harness | `31301d3fa06131a837a0283c9b1c5b528e03d5618e6380cf4ea9bd917b0b4cae` |
| Earlier single-sample harness | `3b7e4d610a97ca4b359effb21605c4e83616322292685f3761a6acfa80c0f078` |

The benchmark writes full reports, individual stdout/stderr, ordered samples,
fixture states and workflow evidence to its caller-selected output directory.
Those regenerable outputs stay outside the tracked kit payload. This report
preserves the shareable findings, including slower observations. Final GitHub
CI results are recorded on the PR for its published HEAD.
