# Run report — Tier-2 router / codegen adapter model / design (001)

> Status: DESIGN-ONLY task complete. Date: 2026-06-15.
> Branch: `docs/mvp-c-tier2-design-proposals` (new, off `main`).
> Worktree: `.claude/worktrees/mvp-c-tier2-design-proposals` (main checkout left on `main`, untouched).
> Deliverable design doc: [`tier2-router-codegen-adapter.md`](../proposals/tier2-router-codegen-adapter.md).
> Task class: design/spec — **extends** the existing deep-research Tier-2 router adapter design ([`customizable-architecture/tier2-router-adapter.md`](../../docs/design/drafts/customizable-architecture/tier2-router-adapter.md)) into the codegen / server-client / link-API / ScreenSpec-reconciliation dimensions it does not yet cover. No runtime behavior changed; no adapter/codegen code implemented.

This report accompanies the design document and records the inspection, the multi-agent process,
the decisions, the validation placeholder, and hard-rule compliance. The substance lives in the
design doc; this report is the audit trail.

---

## 0. Deliverable & worktree decision

- **New branch + worktree, current branch untouched.** A fresh worktree
  (`.claude/worktrees/mvp-c-tier2-design-proposals`, following the existing repo convention of
  `.claude/worktrees/<slug>`) on a new branch `docs/mvp-c-tier2-design-proposals` off `main`. The
  `main` working tree stays on `main` the entire time — no checkout switch.
- **Two new files only**, both in allowed `temp/` locations (proposals + runs). No existing file
  touched.
  - `frontend-workflow-kit/temp/proposals/tier2-router-codegen-adapter.md` *(the design doc)*
  - `frontend-workflow-kit/temp/runs/tier2-router-codegen-adapter-001.md` *(this report)*
- **New file, not an in-place edit.** This design is a fresh proposal; it **cross-references but does
  not modify** the existing `customizable-architecture/{README,tier1-layout-profile,tier2-router-adapter}.md`
  baseline or `generated-file-guard-design.md`. It explicitly builds ON the baseline rather than
  re-deriving it (RouteNode model, discover/core seam, file↔code reconciliation are cited, not redrawn).

---

## 1. Process — multi-agent design workflow

Produced by a deterministic multi-agent workflow (parallel draft → adversarial review → revise).
All agents were instructed read-only except for writing the two deliverable files; **no agent edited
or executed any other repo file.** The agent read the three baseline Tier-2/Tier-1 prior-art documents
in full and treated them as the foundation, then added only the dimensions the baseline did not cover.

---

## 2. Files inspected (path → role)

### Prior-art baseline (the foundation — read in full, cited not re-derived)
| Path | Role |
|---|---|
| `docs/design/drafts/customizable-architecture/README.md` | two-tier model (Tier1=config role→glob, Tier2=plugin adapter), single `resolvedLayout`, invariants (`:43-74`, `:78-88`) |
| `docs/design/drafts/customizable-architecture/tier1-layout-profile.md` | Tier-1 role→glob pair; preset byte-equivalence; `{domain}` preservation; affected-files table (`:33-53`, `:155-171`, `:247-249`) |
| `docs/design/drafts/customizable-architecture/tier2-router-adapter.md` | **existing ROUTER adapter design** — config-or-plugin union, RouteNode+meta, discover-vs-core seam, file↔code reconciliation, registration manifest, byte-identical regression (`:61-77`, `:91-109`, `:131-163`, `:189-204`, `:232-253`) |

### House-style references
| Path | Role |
|---|---|
| `temp/proposals/component-catalog-generation-source-contract.md` | bilingual Options→Recommendation house style; OD-blocking-nothing pattern; "no diff gate before first generator" |
| `temp/proposals/generated-file-guard-design.md` | warning-first → hard-gate sequencing; `normalizeGeneratedViewText` (CRLF/backslash only); validate-stays-light split (`:92`, `:202`, `:300`, `:323`) |

### Tier-1 boundary inputs
| Path | Role |
|---|---|
| `presets/expo-feature.yaml` | preset = roles ONLY, no `adapters:` key today (`:5-14`) — reconciles preset(expo-feature) vs adapter(expo-router) |
| `scripts/lib/layout-profile.mjs` | `roleToDir`/`resolvePaths`/`{domain}` preservation; fail-closed undefined-role/missing-layout → exit 2 (`:59-64`, `:94-98`, `:135-195`) |
| `temp/runs/tier1-layout-threading-001.md` | `--layout` threading; default byte-equivalence, custom split-brain (`:18`, `:107-110`) |
| `temp/runs/tier1-integration-dogfood-001.md` | default-layout regression-0 dogfood; route-tree input anchored to `{roles.route_entry}` (`:18`, `:70-74`) |
| `examples/layout-profile/custom-monorepo/project-layout.yaml` | custom-fixture precedent (role rebinding + domain override, loader-unit input) (`:9-23`) |

### Consumers (router / nav-graph / validate / codegen coordinates)
| Path | Role |
|---|---|
| `scripts/route-tree.mjs` | CLI: `--app`/`--out`, `scanAppDir` direct call, `--app` absent → exit 2; "ScreenSpec not input" (`:3`, `:11-22`) |
| `scripts/lib/route-tree.mjs` | `computeRoute` raw-preserve `[id]`/`(tabs)`; `_layout` excluded; plain `.sort()`; hardcoded 3-line header (`:14-31`, `:52`, `:94-107`) |
| `scripts/lib/nav-graph.mjs` | edges = Interaction Matrix single source; route EXACT match "no param normalization"; navigation-map seed; localeCompare (`:119`, `:122`, `:138`, `:166-167`, `:192`) |
| `scripts/validate.mjs` | checks 4/5 ScreenSpec route only; check 8 `{roles.api_schema}` dir; endpoint conflict → error (`:222-249`, `:277-298`) |
| `templates/screen/screen-spec.template.md` | `route` frontmatter = route single source, no body dup; Entry Points GENERATED block (`:6`, `:38-41`) |
| `scripts/lib/check-generated-files.mjs` | route-tree input `{roles.route_entry}`-derived (no literal `<srcDir>/app`); codegen contract slot (catalog pattern) (`:108-118`, `:132-136`) |
| `examples/route-tree/basic-app/expected/route-tree.txt` | byte-identical golden target — header 3 lines + box-drawing tree, raw route notation (`:1-12`) |
| `examples/route-tree/basic-app/run-metadata.json` | fixture metadata shape mirrored for §13 custom-adapter fixture sketch (`:1-8`) |

---

## 3. Decisions (summary — full rationale + citations in the design doc)

| # | Decision | Recommendation |
|---|---|---|
| §2 preset vs adapter | is `expo-feature` the adapter? | **No — different layers.** `expo-feature`=preset bundle (roles+adapter choice), `expo-router`=the router adapter it picks. byte-identical target = `examples/route-tree/{basic-app,edge-cases}` |
| §3 codegen config | merge into router vs separate axis | **separate `adapters.codegen` axis** (config-or-plugin union, orthogonal to router) |
| §4 server/client | new `kind` value vs meta vs new artifact | **`meta.boundary` escape hatch**; `kind`/render unchanged → byte-equivalence preserved |
| §5 link/nav API | parse code vs declare convention vs codegen | **declare navigation primitive conventions only**; edge discovery stays Interaction Matrix single source (no code parsing) |
| §6 ScreenSpec route ↔ rawPath/urlPath | EXACT raw vs normalize vs cross-check | **rawPath == ScreenSpec route (EXACT, current behavior)**; urlPath is a separate artifact; cross-check deferred (OD-4) |
| §7 codegen seam | adapter writes vs core owns determinism | **codegen adapter = discovery/model only; codegen-core owns determinism** (router-isomorphic) |
| §8 codegen registration | shared manifest vs dedicated | **dedicated codegen manifest + `project-layout.yaml.adapters.codegen` + version** |
| §9 codegen output / hooks | hardcode vs Tier-1 role / config tokens | **output path derived from Tier-1 role (`api_client`/`hook`); hook naming = adapter `conventions` config tokens** |
| §10 validate ↔ adapter | direct consume vs indirect | **validate does NOT consume adapter directly**; linked only via shared Tier-1 role |
| §11 nav-graph ↔ adapter | consume like route-tree vs not | **nav-graph does NOT consume the adapter** (route-tree only); cross-check deferred (OD-8) |
| §12 byte-equivalence | regen golden vs hold | **golden unchanged; adapter output == existing golden is the pass condition** |
| §13 custom fixture | this PR vs separate | **separate dogfood PR after core lands** (Tier-1 precedent) |
| §14 fail-closed | FC-1…FC-7 | unknown adapter / missing module / version mismatch / missing input / ambiguous schema / non-deterministic → exit 2 |

Recommended-conclusion alignment: design-only PR first; default expo-feature keeps byte-identical
golden parity; implementation split into ≥3 PRs (PR-1 config schema + docs, PR-2 route-tree adapter
seam, PR-3 validate/nav-graph/codegen seam); NO hard gate; custom-adapter fixture is a separate
dogfood PR after this proposal — **matches the task's recommended conclusion.**

Open Decisions OD-1…OD-10 recorded; **none block this design PR** (all close at adapter/codegen
implementation/migration time — mirrors the nav-graph "ship generator, then close schema Open
Decision, then register" precedent and the Tier-1 "ship loader, leave role-location OD open").

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

- `frontend-workflow-kit/temp/proposals/tier2-router-codegen-adapter.md` *(new — the design doc)*
- `frontend-workflow-kit/temp/runs/tier2-router-codegen-adapter-001.md` *(new — this report)*

---

## 6. Hard-rule compliance

| Forbidden item (task hard constraints) | Status | Reason |
|---|---|---|
| `scripts/**` (route-tree/nav-graph/validate/lib/route-core/adapters/codegen) | ✅ | design-only; no script created or edited — all adapter/core/codegen modules are PROPOSED future-PR (NG-1, NG-2) |
| `package.json` / `package-scripts.template.json` | ✅ | no alias added; design references roadmap-only intent (NG-5) |
| `.github/**` (CI / gates) | ✅ | no CI step added; warning-first → hard-gate promotion explicitly deferred (NG-6) |
| `catalog/artifact-manifest.yaml` | ✅ | unchanged; route-tree `source:`/`command:` adapter-awareness is PROPOSED future-PR (NG-3) |
| `policies/project-layout.yaml` / `presets/expo-feature.yaml` | ✅ | unchanged; `adapters.router`/`adapters.codegen` keys are PROPOSED only (NG-4) |
| any generated output file / golden | ✅ | `examples/route-tree/{basic-app,edge-cases}/expected/*` untouched; byte-identical held as regression target, not regenerated (NG-7, §12) |
| examples migration files | ✅ | no example migrated; custom-adapter fixture is a separate future dogfood PR (NG-7, §13) |
| parser/validate/nav-graph/route-tree/catalog-gen implementation | ✅ | not modified; validate↔adapter and nav-graph↔adapter relationships are documented as "indirect / not-consumed", no code change (NG-1, §10, §11) |
| any CI/gate · NO hard-gate graduation | ✅ | no gate added/promoted; `V1_REPRODUCE` codegen registration is PROPOSED future-PR (NG-8) |
| Open Decision / Unknown / Conflict promotion | ✅ | none resolved; surfaced questions filed as OD-1…OD-10 / Unknown; nothing promoted to confirmed/resolved (NG-10) |
| generated artifacts hand-edited | ✅ | none edited; generators own them; diff/guard graduation = separate explicit PR (§17 PR-5) |
| ScreenSpec `route` semantics | ✅ | unchanged; EXACT-match contract preserved, rawPath reconciliation keeps current behavior (NG-9, §6) |

All adapter/codegen config, schema, manifest, and graduation steps in the design are labelled
**PROPOSED (future PR)** and are not applied here. The only deliverable of this PR is the two
documents.

---

## 7. Next recommended task

**FUTURE PR-1 — config schema + docs only** (per design §17): add the `adapters.router` /
`adapters.codegen` **schema (plus JSON schema)** and the reconciled conventions from this document to
`project-layout.yaml` as **documentation/schema only** — **with zero runtime/generator/manifest/preset
behavior change** (route-core and codegen-core remain absent). Bundling `adapters` defaults into the
`expo-feature` preset is a config behavior change, so it is **deferred to PR-2** (the route-tree adapter
seam, where a runtime consumer first reads it) — not part of the docs-only PR-1. PR-1 **surfaces** OD-1
(default codegen adapter identity) as a candidate for a **human** decision and does **not** close OD-10
(physical adapters-config file location) — that stays an open, human-decided question. Only after PR-1
does PR-2 (route-tree adapter seam, holding `examples/route-tree/{basic-app,edge-cases}` byte-identical)
and PR-3 (validate / nav-graph / codegen seam with the first codegen golden fixture) proceed — never
adding a guard/fixture before the corresponding core lands.
