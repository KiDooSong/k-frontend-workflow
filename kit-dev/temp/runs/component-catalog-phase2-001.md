# Run report — component-catalog phase 2 metadata / design (001)

> Status: DESIGN-ONLY task complete. Date: 2026-06-15.
> Branch: `docs/mvp-c-tier2-design-proposals` (new, in worktree; `main` untouched).
> Worktree: `.claude/worktrees/mvp-c-tier2-design-proposals` (main checkout left on `main`, untouched).
> Deliverable design doc: [`component-catalog-phase2.md`](../proposals/component-catalog-phase2.md).
> Task class: design/spec for the **next** layer of the already-shipped MVP-C `component-catalog` generator (v1 → phase2 metadata). No runtime behavior changed; generator v1 NOT modified; no new generator implemented.

This report accompanies the design document and records the inspection, the multi-agent process,
the decisions, the validation, and hard-rule compliance. The substance lives in the design doc;
this report is the audit trail.

---

## 0. Deliverable & worktree decision

- **New branch + worktree, current branch untouched.** A fresh worktree
  (`.claude/worktrees/mvp-c-tier2-design-proposals`, following the existing repo convention of
  `.claude/worktrees/<slug>`) on a new branch `docs/mvp-c-tier2-design-proposals`. The `main`
  working tree was never checked out into; this task operated entirely inside the worktree.
- **Two new files only**, both in allowed `temp/` locations (proposals + runs). No existing file
  touched. Both deliverable paths confirmed **not gitignored** before writing
  (`git check-ignore` → exit 1 / not ignored).
- **New files, not in-place edits.** Both are fresh; the proposal cross-references but does **not**
  modify `component-catalog-generation-source-contract.md`, `generated-file-guard-design.md`, the v1
  generator, the golden fixture, the manifest, or the guard.

---

## 1. Process — multi-agent design workflow

The design was produced by a deterministic multi-agent workflow (parallel draft → adversarial
review → revise). Agents were **read-only** except for writing the two deliverables:

| Phase | Role | Output |
|---|---|---|
| **Gather** (read-only) | inspect v1 as-shipped: `catalog-gen.mjs` (CLI + lib), golden fixture (input tree + expected output + run-metadata), manifest, guard allowlist/reproduce contract, util dependency policy, source-contract OD backlog, impl §9 intent | structured ground-truth findings + `path:line` citations |
| **Draft** | 1 | full phase2 markdown grounded in as-shipped facts (not the superseded source-contract sketch) |
| **Review** (adversarial) | 1 | constraint + completeness verdict; checks every cited `file:line` was actually opened |
| **Revise** | 1 | corrected markdown (final design doc) |

All readers were instructed read-only; **no agent wrote, edited, or executed any repo file** other
than the two `.md` deliverables. The key process discipline this round: **treat the golden fixture
as ground truth, not the source-contract `## Name` sketch**, since v1 shipped a 4-column table that
diverges from that sketch — the divergence is recorded honestly in the proposal (§0.2, §A.6).

---

## 2. Files inspected (read in worktree at branch `docs/mvp-c-tier2-design-proposals`)

### v1 generator (as-shipped — the thing phase2 builds on)
| Path | Role |
|---|---|
| `frontend-workflow-kit/scripts/catalog-gen.mjs` | v1 CLI: `--src`(default `src/components/ui`)/`--out`/`--json`/`--dry-run`; fail-closed `--src` non-dir → exit 2 (`:27-33`); `import.meta.url` guard (`:63`) |
| `frontend-workflow-kit/scripts/lib/catalog-gen.mjs` | v1 pure builder/renderer: identification rule `classifyComponentFile` (`:68-105`), `isWrappedConst` memo/forwardRef exclusion (`:36-63`), 4-field model, deterministic table render (`:136-152`); no external deps (`:17`) |

### Golden fixture (authoritative v1 output format)
| Path | Role |
|---|---|
| `frontend-workflow-kit/examples/component-catalog/basic-ui/expected/component-catalog.md` | **ground-truth v1 output**: H1 marker + 2 HTML-comment lines + single `## Components` 4-column table (`| Name | Source Path | Export Kind | Status |`, `:7-8`); 3 rows (Button/Card/Stack) |
| `frontend-workflow-kit/examples/component-catalog/basic-ui/src/components/ui/{Button,Card,Stack,Badge,Field,Modal}.tsx` + `index.ts` | input tree: 6 .tsx + barrel; **3 included** (Button plain fn, Card plain arrow const, Stack plain fn), **3 excluded** (Badge=memo, Field=forwardRef, Modal=default-export) + index.ts barrel excluded (non-Pascal) |
| `frontend-workflow-kit/examples/component-catalog/basic-ui/run-metadata.json` | fixture wiring: `fixture:"component-catalog"`, `src:"src"`, `expected:"expected/component-catalog.md"`, `expect:"pass"`; reason names the decoy classes |

### Manifest, guard, dependency policy
| Path | Role |
|---|---|
| `frontend-workflow-kit/catalog/artifact-manifest.yaml` | `component-catalog` entry **already active** (`:174-184`): `status:active`, `do_not_edit:true`, `mvp:C`, `source:[src/components/ui/**]`, `path:…/design/component-catalog.md` |
| `frontend-workflow-kit/scripts/lib/check-generated-files.mjs` | guard **already registered** component-catalog: allowlist `V1_ARTIFACT_IDS` (`:29`), 4-clause selected (`:43,48-76`), `V1_REPRODUCE['component-catalog']` (`:131-137`), `normalizeGeneratedViewText` CRLF/backslash-only (`:9,24`), `firstLineDiff` (`:148-157`) |
| `frontend-workflow-kit/scripts/lib/util.mjs` | dependency policy "Node 내장 + yaml 한 개만" (`:2`); `walkFiles` `.sort()` + node_modules/dot skip (`:117-140`); `writeFile` (`:142-145`) |

### Prior art & intent
| Path | Role |
|---|---|
| `frontend-workflow-kit/temp/proposals/component-catalog-generation-source-contract.md` | phase1 contract; its OD-1…OD-7 = phase2 backlog (`:265-271`); `## Name` sketch (`:138`) **superseded** by shipped table |
| `frontend-workflow-kit/temp/proposals/generated-file-guard-design.md` | house style; warning-first principle (`:15`); "no diff gate before the first real generator" (`:92`) |
| `frontend-workflow-kit-implementation.md` *(repo root)* | §9 catalog-gen intent: `(TS props)` + `react-docgen-typescript 또는 TS compiler API` (`:333`) — **end-state intent**, not v1/phase2-1 duty |
| `frontend-workflow-kit/temp/runs/component-catalog-generation-design-001.md` | run-report template this report mirrors |

---

## 3. Decisions (summary — full rationale + citations in the design doc)

| Proposal § | Decision | Recommendation |
|---|---|---|
| §2 phase2 constraint | inherit no-dep/determinism vs allow deps | **inherit v1's no-dep + determinism + additive** for phase2-1; dependency-introducing work isolated to phase2-2 (OD-2) |
| §3 phase2-1 fields | which static metadata; how much at once | **diagnostic-first ((opt-c) barrel reconcile), then 1–2 verifiable additive fields ((opt-b))**; default-export collection most viable; sister-file/lifecycle deferred (no signal in fixture) → OD-1 |
| §4 extraction technique | regex vs TS AST/docgen | **props/docgen split to phase2-2; phase2-1 extracts no props**; regex(4a) vs AST/docgen(4b) left open as **OD-2** (v1 already says "robust parsing → later phase", `lib/catalog-gen.mjs:92`) |
| §4.4 memo/forwardRef | include wrappers? | conservative: regex can mark `export_kind: memo/forwardRef` but **display-name resolution is OD-4** |
| §5 NativeWind/style/variant | in this generator or separate? | **phase2-3 OR separate proposal**; no style signal in fixture (`Button.tsx:3-5` returns null) → cannot decide now → OD-5; `src/features/**` tier → OD-4 |
| §6 additive strategy | append column vs new section vs separate file | **(6b) new section, keep `## Components` table byte-stable**; in-table column append (6a) rewrites every row → discouraged; separate file (6c) only for multi-tier |
| §6.4 md vs JSON/YAML IR | on-disk format | **Markdown on-disk (manifest `path` is `.md`)**; reuse existing `--json` stdout (`catalog-gen.mjs:39-42`) for machine consumption; new on-disk IR → OD-5 |
| §7 warning-first | new checks gating | **warning-first by default; fail-closed only on malformed/ambiguous input** (v1 `--src` non-dir → exit 2 precedent) |
| §8 region separation | in-file block vs separate file | **(8b) file-boundary separation**; in-file `GENERATED:START/END` block stays a separate proposal (source-contract §5) |
| §9 guard graduation | when phase2 metadata is enforced | **data-driven, stabilize-then-enforce**; same-path output change auto-enforced (no new guard code); new artifact → `V1_ARTIFACT_IDS`+`V1_REPRODUCE` registration only |

Recommended-conclusion alignment: **phase2-1 = dependency-free static expansion only; props/docgen =
phase2-2; NativeWind/style = phase2-3 or separate proposal; v1 output not broken (additive only);
guard graduation only after output stable** — matches the task's recommended conclusions.

Open Decisions OD-1…OD-5 (phase2) recorded; **none block this design PR** (all close at
generator/migration time — mirrors the v1 "ship generator, then close OD, then register" precedent;
v1 itself closed source-contract OD-6/OD-7 on ship).

---

## 4. Commands run

**Orchestrator-run verification** (run from the worktree kit dir after the workflow; the `main` working tree stayed on `main`, untouched). All commands are repo-wide and identical for the three design-only proposals (none changes code), so the same green result is recorded in each run report:

| # | Command | Result |
|---|---|---|
| 1 | `npm ci --no-audit --no-fund` | `added 1 package` (only the `yaml` dep); ok |
| 2 | `npm test` | node:test **pass 27 / fail 0**; exit 0 |
| 3 | `npm run example:validate` | `workflow:validate — OK (검사 12종 통과)`; exit 0 |
| 4 | `npm run example:test` | generated-view goldens all pass — route-tree · nav-graph · **component-catalog:basic-ui** (`GV:run/output/deterministic/content` all ok); exit 0 |
| 5 | `git status --porcelain` | only the six new `temp/{proposals,runs}` files; no tracked file modified |
| 6 | `git diff -- scripts package.json package-scripts.template.json catalog/artifact-manifest.yaml policies .github` | **empty** (no forbidden path changed) |

**Branch staging note (honest):** this worktree branch `docs/mvp-c-tier2-design-proposals` stages **all three** proposals' six files together (this proposal's two + the two sibling proposals' four). They are intended to be split into the three PRs named at the top of each run report; the six files never overlap, so the split is clean. `node_modules/` (from `npm ci`) is git-ignored and not part of the change set.

---

## 5. Changed files

Exactly two new files, both in allowed locations; nothing else (no tracked modification):

- `frontend-workflow-kit/temp/proposals/component-catalog-phase2.md` *(new — the design doc)*
- `frontend-workflow-kit/temp/runs/component-catalog-phase2-001.md` *(new — this report)*

`node_modules/` (if created by `npm ci` in the worktree) is git-ignored and not part of the change set.

---

## 6. Hard-rule compliance

| Hard rule (task forbidden item) | Status | Evidence |
|---|---|---|
| `scripts/**` (incl. `catalog-gen.mjs`, `lib/catalog-gen.mjs`, parser/validate/nav-graph/route-tree/catalog-gen impl) | ✅ | design-only; no diff to `scripts/**`; v1 generator referenced read-only, not modified |
| `package.json` / `package-scripts.template.json` | ✅ | design-only; no script added/moved; no dependency added (no-dep constraint respected) |
| `.github/**` (CI / gates) | ✅ | design-only; no CI step added; warning-first posture preserved |
| `catalog/artifact-manifest.yaml` | ✅ | design-only; manifest already `active`; any `source`-glob/new-entry change is PROPOSED future-PR only |
| any generated output file (incl. `expected/component-catalog.md`) | ✅ | design-only; golden output untouched; additive strategy keeps `## Components` byte-stable (§6) |
| examples migration files / golden fixture input tree | ✅ | design-only; `examples/component-catalog/basic-ui/**` read-only, not modified |
| parser/validate/nav-graph/route-tree/catalog-gen/check-generated impl | ✅ | design-only; guard `V1_ARTIFACT_IDS`/`V1_REPRODUCE` referenced read-only, not edited |
| any CI/gate; NO hard-gate graduation | ✅ | design-only; no gate added/promoted; all new checks specified warning-first (§7); guard graduation is data-driven future-PR (§9) |
| new external dependency (react-docgen-typescript / TS compiler API / prettier) | ✅ | design-only; **no dependency added**; phase2-1 is dependency-free; dependency decision deferred to OD-2 |

All manifest/script/CI/dependency/guard changes in the design are labelled **PROPOSED (future PR)**
and are not applied here. No `green`/`report`/`run` is treated as "done" or "human-approved";
undecided questions are filed as Open Decisions (OD-1…OD-5) / candidates and **not** self-resolved.

---

## 7. Next recommended task

**FUTURE PR-2 — phase2-1 barrel-reconcile diagnostic (dependency-free, warning-first)** (per design
§3.4 / §11 PR-2): add an **output-excluded stderr diagnostic** in `scripts/lib/catalog-gen.mjs` that
reads the barrel's `export { X } from './X'` (the golden tree already has
`examples/component-catalog/basic-ui/src/components/ui/index.ts:2-4`) and warns when the barrel's
re-export set diverges from the file-walk component set. **Output format and golden stay byte-stable**
(no guard/golden risk — the guard's reproduce contract `V1_REPRODUCE['component-catalog']` is
untouched). No manifest flip, no new column, no dependency. This closes part of OD-1 and is the
lowest-risk first phase2 slice. The first **additive column/section** (PR-3) follows only after a new
golden fixture proves two-run determinism + byte-exact output.
