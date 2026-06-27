# Run report — generated-file guard / check-generated design (001)

> Status: DESIGN-ONLY task complete. Date: 2026-06-14.
> Branch: `docs/mvp-c-generated-file-guard-design` (new, off `main`).
> Worktree: `../k-frontend-workflow-guard-design` (main checkout left untouched).
> Deliverable design doc: [`generated-file-guard-design.md`](../proposals/generated-file-guard-design.md).
> Task class: design/spec concretization. No runtime behavior changed.

This report accompanies the design document and records inspection, decisions, validation, and
hard-rule compliance. The substance lives in the design doc; this report is the audit trail.

---

## 0. Deliverable location decision (new file vs update followup)

Decision: **new file** `temp/proposals/generated-file-guard-design.md` (not an in-place update of
`generated-file-guard-followup.md`).

Rationale: `generated-file-guard-followup.md` is a 157-line *design-proposal / analysis stub*
(its own header declares `설계 제안이다 — 이 문서는 구현이 아니다`). It motivates the guard and
analyses `validate.mjs` check 6, but leaves the load-bearing decisions open: the selector choice
(`entry.generated === true` vs `kind === 'generated'`), granular-update vs full-replace for block
markers, and it has no CLI interface spec, no path-resolution algorithm, no exit-code table, and no
test matrix. Promoting it in place would make its "proposal/analysis" role misleading. The new
design doc is the full-spec successor and **cross-references followup.md as the analysis stub it
supersedes**, preserving followup.md's motivational role. This matches the task's preferred path
(`generated-file-guard-design.md`).

---

## 1. Files inspected

45 files inspected (read at repo `HEAD`, identical to the fresh worktree at branch point). Two
existence nuances worth recording:

- **Root `package.json` does NOT exist** — this repo has no top-level `package.json`; only
  `frontend-workflow-kit/package.json` exists.
- **Task-listed `frontend-workflow-kit/temp/proposals/mvp-c-generated-views-scope.md` does NOT
  exist.** A same-named scope doc exists at **repo root** `temp/proposals/mvp-c-generated-views-scope.md`
  (View 5 names the guard as MVP-C Phase 0 / first ticket); that one was inspected instead and is the
  available source. Noted explicitly per the task's "if a listed temp file does not exist" instruction.

### Manifest & validator
| Path | Role |
|---|---|
| `frontend-workflow-kit/catalog/artifact-manifest.yaml` | Central registry: artifact paths, frontmatter, generation commands, `do_not_edit` flags |
| `frontend-workflow-kit/scripts/validate.mjs` | 12-check validator; check 6a whole-file headers (L437-447), check 6b screen-spec section markers (L243-262) |

### Generators & shared libs
| Path | Role |
|---|---|
| `frontend-workflow-kit/scripts/workflow-state.mjs` | Generates `workflow-state.yaml` + `screen-inventory.yaml` (two-file output; `--out` is a **directory**) |
| `frontend-workflow-kit/scripts/route-tree.mjs` | Generates `route-tree.txt` (`--out` is a **file**) |
| `frontend-workflow-kit/scripts/nav-graph.mjs` | Generates `nav-graph.yaml` (`--out` is a **file**) |
| `frontend-workflow-kit/scripts/lib/route-tree.mjs` | Route-tree scan/render; **hardcoded** `# Source:` / `# Command:` header strings |
| `frontend-workflow-kit/scripts/lib/nav-graph.mjs` | Nav-graph build logic |
| `frontend-workflow-kit/scripts/lib/util.mjs` | `parseArgs`, `findFiles`, `writeFile`, `emitGeneratedYaml` (shared YAML header builder), `splitFrontmatter` |

### Test harness
| Path | Role |
|---|---|
| `frontend-workflow-kit/scripts/test-fixtures.mjs` | Golden fixture harness entry (reconcile / integrity / pipeline / path-backstop / generated-view) |
| `frontend-workflow-kit/scripts/lib/test-fixture.mjs` | Comparison fns: `normalizeGeneratedViewText`, `normalizeText`, `normalizeStateSnapshot`, generated-view/pipeline/path-backstop checks |

### Example generated outputs & fixtures (ground-truth headers/markers)
| Path | Role |
|---|---|
| `examples/route-tree/{basic-app,edge-cases}/run-metadata.json` | route-tree generated-view fixture declarations |
| `examples/route-tree/basic-app/docs/frontend-workflow/_meta/route-tree.txt` (+ `expected/route-tree.txt`) | Generated TXT artifact + golden |
| `examples/route-tree/edge-cases/docs/frontend-workflow/_meta/route-tree.txt` (+ `expected/`) | Generated TXT artifact + golden |
| `examples/nav-graph/{basic-flow,stub-destination}/run-metadata.json` | nav-graph generated-view fixture declarations |
| `examples/nav-graph/basic-flow/docs/frontend-workflow/_meta/nav-graph.yaml` (+ `expected/`) | Generated YAML artifact + golden |
| `examples/nav-graph/stub-destination/docs/frontend-workflow/_meta/nav-graph.yaml` (+ `expected/`) | Generated YAML artifact + golden |
| `examples/nav-graph/basic-flow/docs/frontend-workflow/app/navigation-map.md` | Hand-authored nav-graph **source** doc |
| `examples/nav-graph/basic-flow/.../coupon-list/screen-spec.md`, `.../home/screen-spec.md` | **Empty** `GENERATED:START/END nav-graph` block |
| `examples/nav-graph/stub-destination/.../coupon-list/screen-spec.md` | `GENERATED` nav-graph block present |
| `examples/nav-graph/stub-destination/.../coupon-detail/screen-spec.md` | Stub spec: no Entry Points / no block |
| `examples/coupon-feature/docs/frontend-workflow/_meta/screen-inventory.yaml` | Generated YAML: 3-line hash header, **double-space** after `# Source:` |
| `examples/coupon-feature/docs/frontend-workflow/_meta/workflow-state.yaml` | Generated YAML: `generated_at` field + `global:` block |
| `examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md` | Generated MD, `do_not_edit:false`, **HTML block-comment** header |
| `examples/input-reconciliation/project-before/.../design/component-catalog.snapshot.md` | `SAMPLE SNAPSHOT — NOT GENERATED` (decoy; must not be guarded) |
| `examples/multi-screen-dry-run/.../design/component-catalog.snapshot.md` | Sample snapshot (not generated) |
| `examples/coupon-feature/.../coupons/screens/coupon-list/screen-spec.md` | Populated `GENERATED` nav-graph entry-points block (manual MVP-A content) |
| `examples/coupon-feature/.../coupons/screens/coupon-detail/screen-spec.md` | Stub spec: no `GENERATED` block |

### Prior proposals & run reports
| Path | Role |
|---|---|
| `frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md` | 157-line analysis stub (superseded by the new design doc) |
| `temp/proposals/mvp-c-generated-views-scope.md` *(repo root)* | MVP-C scope; View 5 names guard as Phase 0 / first ticket |
| `frontend-workflow-kit/temp/runs/mvp-c-generated-views-integration.md` | Alias decisions, manifest fixups, guard deferral, `_meta/*` non-backstop decision |
| `frontend-workflow-kit/temp/runs/generated-views-test-fixtures-001.md` | route-tree/nav-graph golden registration; notes guard not yet implemented |
| `frontend-workflow-kit/temp/runs/route-tree-header-command-001.md` | Aligned route-tree `# Command:` header to direct `node` CLI form |
| `frontend-workflow-kit/temp/runs/nav-graph-001.md` | nav-graph impl report; header decisions; manifest registration deferred *at the time* (since completed — now registered & `active`) |
| `frontend-workflow-kit/temp/runs/path-backstop-001.md` | T3 decision: `_meta/*` intentionally outside forbidden-paths backstop |

### Packaging & CI
| Path | Role |
|---|---|
| `package.json` *(repo root)* | **Does not exist** |
| `frontend-workflow-kit/package.json` | Live npm scripts + bin; `workflow:check-generated` absent (roadmap only) |
| `frontend-workflow-kit/package-scripts.template.json` | Consumer template; `//roadmap` block holds future aliases withheld from live `scripts` |
| `.github/workflows/frontend-workflow-kit.yml` | CI: single `validate-example` job; idempotency + 12-point validate + spec unit-test hard gates; **warning-first** golden-fixture step (`continue-on-error: true`) |

---

## 2. Generated artifact inventory

| Artifact | kind | generated | do_not_edit | status | Guardable | Recommended strategy (summary) |
|---|---|---|---|---|---|---|
| `_meta/workflow-state.yaml` | generated | true | true | active | **now** | regenerate-to-scratch (`--out` = dir, co-emits screen-inventory); pin `--date` from committed `generated_at`; `generated_at`-only fallback normalizer |
| `_meta/screen-inventory.yaml` | generated | true | true | active | **now** | regenerate-to-scratch (co-emitted with workflow-state); no timestamp → plain `normalizeGeneratedViewText` |
| `_meta/route-tree.txt` | generated | true | true | active | **now** | regenerate-to-scratch (`--out` = file); timestamp-free, fully deterministic |
| `_meta/nav-graph.yaml` | generated | true | true | active | **now** | regenerate-to-scratch (`--out` = file); timestamp-free; manifest entry **registered & `status: active`** — only the node/edge schema remains an Open Decision (per manifest comment) |
| `design/component-catalog.md` | generated | true | **false** | planned | **not-yet** | header-only, deferred; **must-not-fail** while `do_not_edit:false`/generator absent; graduates to regenerate when flag flips |
| screen-spec `GENERATED:START/END nav-graph` block | generated (in-file) | true (via `generated_sections`) | true (region) | partial | **partial** | marker-integrity only (presence/order/no-dup/no-nest); no body regenerate (back-fill generator absent); empty blocks valid |
| `eslint.workflow.config.mjs` | generated | true | true | planned | **not-yet** | **must-not-fail** (generator absent); **repo-root path** — fix the docs-prefix resolver blind spot before guarding |

Key inventory facts: `--out` semantics differ per generator (**directory** for workflow-state,
**file** for route-tree/nav-graph); only `workflow-state.yaml` carries a varying timestamp
(`generated_at`); `component-catalog.md` is the **only** `do_not_edit:false` generated entry; the
repo-root `eslint.workflow.config.mjs` is **silently skipped** by validate check 6a today due to a
path-resolution bug.

---

## 3. Whole-file guard model

Three whole-file surfaces, each keyed off the manifest selector `kind === 'generated' &&
do_not_edit === true` (design doc §1, §2, §3):

- **YAML** (`workflow-state.yaml`, `screen-inventory.yaml`, `nav-graph.yaml`): 3-line `#` hash header
  required as the first content lines — `# GENERATED FILE — DO NOT EDIT` (em-dash U+2014, load-bearing
  for validate's regex), `# Source:`, `# Command:`. Internal whitespace tolerated (observed
  double-space after `# Source:`).
- **TXT** (`route-tree.txt`): identical 3-line hash header, then blank line, then tree body. Strongest
  determinism (no timestamp).
- **Markdown** (`component-catalog.md`): header is a **multi-line HTML block comment**; the marker
  substring lives *inside* the comment, not at byte 0. Header read is a **bounded leading region** (up
  to first `-->` or an 800-byte cap), never byte-0 and never an unbounded scan. Currently
  `do_not_edit:false` → **header-optional / no-regenerate** until the flag flips.

Behavior: marker present (first content line for YAML/TXT; within leading HTML comment for MD);
`# Source:` / `# Command:` present and non-empty; for `status:active` entries, additionally
regenerate-and-compare (§6 below). Missing header on an active `do_not_edit:true` entry = violation;
on a planned/`do_not_edit:false` entry = skipped.

---

## 4. Generated-block (in-file) guard model

One in-file surface today: the `nav-graph` entry-points block in `screen-spec.md`, delimited by
`<!-- GENERATED:START nav-graph -->` … `<!-- GENERATED:END nav-graph -->` (design doc §1.4, §3.6-3.8).

Model: **marker-integrity only** (no body regeneration — the back-fill generator does not exist).
The future check generalizes over **all** artifacts' `generated_sections` rather than the hardcoded
`screen-spec` key in `validate.mjs:243-262`, and adds edge-case rules: duplicate blocks (same section
name twice) = violation; unclosed `START` without `END` = violation (fail-closed); nested blocks =
violation. **Empty** blocks (nav-graph fixtures) and **absent** sections in stub specs are both
**valid** — no false positive. Populated manual content (coupon-feature) is also valid under
marker-integrity (no body compare yet).

---

## 5. Manifest contract decisions

Field interpretation (design doc §2):

- `path` — artifact location; resolved **project-root-relative**, NOT via validate's
  `docs/frontend-workflow/` prefix-strip (which misfires on repo-root paths like
  `eslint.workflow.config.mjs`).
- `kind` + `do_not_edit` — the **guard selector** is `kind === 'generated' && do_not_edit === true`
  (mirrors `validate.mjs:438`); `generated:true` alone is **not** sufficient (would wrongly capture
  `component-catalog.md`).
- `status` — `active` ⇒ eligible for regenerate-and-compare; `planned` ⇒ **must-not-fail**, never
  invoke the generator, skip if the file is absent.
- `command` — generator **identity**, treated as user-facing (npm alias). It is **not** string-compared
  to the generated header `# Command:`.
- `source` — input(s) feeding regeneration.
- `generated_sections` — drives the in-file block surface; iterate all of them.

**Command-nuance decision:** the manifest `command` (npm alias, e.g. `npm run workflow:route-tree`)
and the generated header `# Command:` (direct CLI, e.g.
`node scripts/route-tree.mjs --app … --out …`) are **intentionally different strings by design** and
must **never** be string-compared (route-tree/nav-graph would always false-fail). The guard requires
`# Command:` **presence/non-empty only**; correctness comes from **body regeneration**, not header
equality. Strict header-string checking is deferred behind a **PROPOSED `header_command` manifest
field (future PR)** — not added in this task.

---

## 6. Regeneration-to-scratch strategy

Per-artifact (design doc §4); the guard never mutates committed files — it regenerates into a
`mkdtempSync` scratch dir and compares, then cleans up:

| Artifact | Strategy |
|---|---|
| `route-tree.txt` | regenerate to scratch **file**; two-run determinism (`CG:deterministic`); compare via `normalizeGeneratedViewText` only |
| `nav-graph.yaml` | regenerate to scratch **file**; two-run determinism; `normalizeGeneratedViewText` only |
| `workflow-state.yaml` | regenerate to scratch **dir**; pin `--date` from committed `generated_at`; fallback = `generated_at`-**only** line normalizer (never broad `normalizeText`) |
| `screen-inventory.yaml` | co-emitted by the same `workflow:state` run; no timestamp → plain compare |
| `component-catalog.md` | **deferred** (planned, `do_not_edit:false`); header-only when it graduates |
| screen-spec entry-points block | **marker-integrity only**; no body regenerate (generator absent) |

Sequencing rationale: route-tree/nav-graph are the cleanest regenerate targets (timestamp-free) and
come first (PR C); workflow-state/screen-inventory follow (PR D) because the `generated_at`
normalization is the single place an over-broad normalizer could mask a real edit and deserves its
own review.

---

## 7. Direct-edit detection model

Policy (design doc §5): **"a generated file change is acceptable only if regeneration from its
declared source reproduces the committed output"** — a *reproduce*, not a raw *diff*, model. Five
states distinguished:

| State | Signal | Verdict |
|---|---|---|
| Bad manual edit | committed ≠ regenerated-from-source | violation |
| Valid regen after source change | committed == regenerated-from-current-source | OK |
| Valid first-time add | new generated file == regenerated output | OK (no false positive on first add) |
| Missing output | active entry, file absent | violation (under `--enforce`) |
| Planned, not-yet-required | `status:planned` / generator absent | **skip** (must-not-fail) |

PR/diff model: in diff-aware mode (`--diff`/`--base`), scope to changed files; for each touched
generated artifact, regenerate from its *current* source and compare. Because the comparison is
reproduce-from-current-source, "source changed + output changed together" reproduces (OK) and "output
changed alone" fails to reproduce (violation) — both handled without false positives.

---

## 8. validate vs check-generated responsibility split

Design doc §7. The split is intentional and validate is **not** expanded in this task.

- **Stays in `validate.mjs`** (mandatory hard gate, fast, dependency-light): the 12 contract checks,
  including check 6a header **presence** (first 400 bytes, `kind:generated && do_not_edit:true`) and
  check 6b screen-spec `START`-before-`END` marker order. Validate never runs generators, never
  compares bodies, and silently skips absent planned entries.
- **Goes to future `check-generated-files.mjs`** (warning-first, supplementary, adopted incrementally):
  manifest-driven **body-level** integrity via regenerate-to-scratch across active artifacts
  (including repo-root paths validate's resolver misses), **diff-aware** direct-edit detection
  (reproduce-not-diff), and **generalized** in-file block-marker validation across all
  `generated_sections` with duplicate/unclosed/nested detection.

---

## 9. Exit code / warning-first posture

Design doc §6. Contract:

- `0` — no violations (and the warning-first default: **exit 0 even with violations** unless
  `--enforce`).
- `1` — violations found **when `--enforce` is passed**.
- `2` — configuration / IO / parser error (manifest absent or malformed, un-spawnable generator for an
  active entry, scratch IO failure, unparseable committed file) — **always**, regardless of
  `--enforce`. A broken manifest is never a soft warning.

Proposed flags: `--enforce`, `--diff`/`--base`, `--json` (matching the kit convention in
`validate.mjs`/`nav-graph.mjs`/`workflow-state.mjs`). CI adoption starts `continue-on-error: true`
(warning-first), mirroring the existing golden-fixture step. **No hard-gate promotion in this task;
no CI step added in this task.** Promotion (dropping `continue-on-error` or running `--enforce`) is a
separate future PR gated on observed false-positive rate.

---

## 10. False positive risks (and mitigations)

Design doc §8. All nine required risks covered:

| # | Risk | Mitigation |
|---|---|---|
| 1 | manifest `command` (npm alias) vs header `# Command:` (node CLI) mismatch | never string-compare; presence-only on `# Command:`; correctness via body regenerate; strict check behind PROPOSED `header_command` |
| 2 | Windows backslash path separators | `normalizeGeneratedViewText` `\\` → `/` on both sides before compare |
| 3 | CRLF line endings (git autocrlf) | `\r\n` → `\n` on both sides (consistent with `splitFrontmatter`'s `\r?\n`) |
| 4 | planned generators absent (`catalog-gen.mjs`, `lint-gen.mjs`) | `status:planned` ⇒ never invoke; absent file ⇒ skip; must-not-fail |
| 5 | `component-catalog.md` `do_not_edit:false` (manual mode) | selector excludes it until the flag flips (mirrors validate 6a) |
| 6 | `workflow-state` writes **two** files; `--out` is a **directory** | per-generator `--out` handling; regenerate the dir once, compare both outputs |
| 7 | entry-points block has no back-fill generator | marker-integrity only; empty/absent blocks valid; body compare deferred |
| 8 | broad `normalizeText` ISO-date replacement masking real date edits | do **not** reuse `normalizeText`; only a `generated_at`-only line normalizer (or pin `--date`) |
| 9 | route-tree header strings hardcoded (not from runtime flags) | header `# Command:` presence-only; hardcoded strings are stable bytes that regenerate compares correctly |

Bonus decision recorded: `_meta/*` is intentionally **outside** the forbidden-paths backstop
(path-backstop-001 T3) — `check-generated-files.mjs` is the sole `_meta` integrity guard; do not add
`_meta` paths to `forbidden_paths`.

---

## 11. Future implementation slicing

Design doc §9. Seven slices (this task = PR A):

| PR | Scope |
|---|---|
| **A** *(this task)* | Design doc only. No code/manifest/scripts/CI. Establishes Appendix-A ground truth. |
| **B** | Skeleton + manifest parsing + header/marker checks, **warning-first only**. Project-root path resolution (fixes docs-prefix blind spot); header presence (400-byte hash window; bounded HTML-comment region for `.md`); generalized block-marker integrity. No `--enforce`, no package script, no CI. |
| **C** | route-tree / nav-graph regenerate-to-scratch compare (timestamp-free, lowest risk). |
| **D** | workflow-state / screen-inventory regenerate (multi-output dir; `generated_at` handling). |
| **E** | Generated-block marker hardening (duplicate/unclosed/nested + fixtures); may fold into B. |
| **F** | CI **warning-first** wiring (`continue-on-error: true`); promote roadmap alias to live scripts. |
| **G** | Optional hard-gate discussion after PR F telemetry; gated on observed false-positive rate. |

---

## 12. Commands run

All run inside the worktree (`../k-frontend-workflow-guard-design`); `main` untouched.

| # | Command | Result |
|---|---|---|
| 1 | `git worktree add -b docs/mvp-c-generated-file-guard-design <wt> main` | worktree created, exit 0 |
| 2 | `npm ci --no-audit --no-fund` (in `frontend-workflow-kit`) | added 1 package (`yaml`), exit 0 |
| 3 | `npm test` | `test-fixtures — PASS (25 fixtures: 24 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)` + node:test `pass 15 / fail 0`; **exit 0** |
| 4 | `npm run example:test` | `test-fixtures — PASS (25 fixtures: 24 pass, 1 xfail, 0 fail)`; **exit 0** |
| 5 | `npm run example:validate` | `workflow:validate — OK (검사 12종 통과)`; **exit 0** |
| 6 | `git status --porcelain` | only the two deliverable `.md` files untracked |
| 7 | `git status --porcelain --ignored` | `!! frontend-workflow-kit/node_modules/` (correctly ignored) |
| 8 | `git diff --stat` | **empty** (no tracked file modified) |
| 9 | `git diff -- frontend-workflow-kit/scripts frontend-workflow-kit/package.json frontend-workflow-kit/package-scripts.template.json .github/workflows frontend-workflow-kit/catalog/artifact-manifest.yaml` | **empty** (no forbidden file changed) |

Note: the single `xfail` (`reconcile-input-001`) is a deliberate expected-failure witness fixture, not
a regression — the harness reports `0 fail`.

---

## 13. Changed files

Exactly two new files, both in allowed locations; nothing else (no tracked modifications):

- `frontend-workflow-kit/temp/proposals/generated-file-guard-design.md` *(new — the design doc)*
- `frontend-workflow-kit/temp/runs/generated-file-guard-design-001.md` *(new — this report)*

`generated-file-guard-followup.md` was **not** modified (kept as the analysis stub it is, and
cross-referenced from the new doc). `node_modules/` is git-ignored and not part of the change set.

---

## 14. Hard-rule compliance

| Hard rule | Status | Evidence |
|---|---|---|
| No script implementation | ✅ | `scripts/check-generated-files.mjs` not created; `git diff -- scripts` empty |
| No package script addition | ✅ | `package.json` / `package-scripts.template.json` unchanged (empty diff) |
| No CI change | ✅ | `.github/workflows` unchanged (empty diff) |
| No hard-gate promotion | ✅ | design only; warning-first posture preserved; no `continue-on-error` removed |
| No readiness change | ✅ | `readiness.mjs` untouched |
| No validate change | ✅ | `validate.mjs` untouched |
| No workflow-state change | ✅ | `workflow-state.mjs` untouched |
| No route-tree/nav-graph generator change | ✅ | generators + libs untouched |
| No test-fixtures change | ✅ | `test-fixtures.mjs` / `lib/test-fixture.mjs` untouched; suite green |
| No component-catalog generation | ✅ | `catalog-gen.mjs` not invoked; no `component-catalog.md` generated |
| No generated file edits | ✅ | no `_meta/*` or example generated files modified (empty diff) |
| No artifact-manifest change | ✅ | `catalog/artifact-manifest.yaml` untouched; `header_command` is PROPOSED-only |
| Only allowed files changed | ✅ | exactly the 2 `.md` deliverables (§13) |

The proposed `header_command` manifest field and all CI wiring are labelled **PROPOSED (future PR)**
in the design doc and are not applied here.

---

## 15. Next recommended task

**PR B** — implement the `check-generated-files.mjs` skeleton: manifest parsing (exit 2 if
absent/malformed), **project-root** path resolution (fixing the `docs/frontend-workflow/` prefix
blind spot that hides `eslint.workflow.config.mjs`), header-presence checks (400-byte hash window for
YAML/TXT; bounded HTML-comment region up to first `-->` or 800-byte cap for Markdown), and generalized
in-file block-marker integrity over all `generated_sections` (presence/order/duplicate/unclosed/
nested). **Warning-first only** — no `--enforce` wiring, no package-script promotion, no CI change —
consistent with the §0/§7 warning-first hard rule.
