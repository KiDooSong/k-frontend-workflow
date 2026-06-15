# Run report — Interaction Matrix structured (v2) format / design (001)

> Status: DESIGN-ONLY task complete. Date: 2026-06-15.
> Branch: `docs/mvp-c-tier2-design-proposals` (new, off `main`).
> Worktree: `.claude/worktrees/mvp-c-tier2-design-proposals` (main checkout left untouched).
> Deliverable design doc: [`interaction-matrix-structured-format.md`](../proposals/interaction-matrix-structured-format.md).
> Task class: design/spec proposal for an **optional** v2 structured Interaction Matrix (`Result Type` / `Target` / `Params`), its dual-read parser strategy, validate timing/severity, and a warning-first route-tree cross-check. No runtime behavior changed; nothing implemented.

This report accompanies the design document and records the inspection, the multi-agent process,
the decisions, the validation placeholder, and hard-rule compliance. The substance lives in the
design doc; this report is the audit trail.

---

## 0. Deliverable & worktree decision

- **New branch + worktree, current branch untouched.** A fresh worktree
  (`.claude/worktrees/mvp-c-tier2-design-proposals`, following the existing repo convention of
  `.claude/worktrees/<slug>`) on a new branch `docs/mvp-c-tier2-design-proposals` off `main`. The
  `main` working tree stayed on `main` the entire time.
- **Two new files only**, both in allowed `temp/` locations (proposals + runs). No existing file
  touched.
- **New files, not in-place edits.** The proposal is fresh; it cross-references but does not modify
  `component-catalog-generation-source-contract.md`, `generated-file-guard-design.md`, or the roadmap.

---

## 1. Process — deterministic multi-agent workflow

The design was produced by a deterministic multi-agent workflow (parallel draft → adversarial
review → revise). All agents were **read-only** except for writing the two deliverables:

| Phase | Role | Output |
|---|---|---|
| **Gather** (read-only) | source inspection | structured ground-truth findings + verified `path:line` citations for spec.mjs / nav-graph.mjs / route-tree / validate.mjs / roadmap / policy / examples |
| **Draft** | 1 | full v2-format proposal grounded in verified facts |
| **Review** | 1 (adversarial) | constraint + completeness verdict (Options→Recommendation per section, OD coverage, no forbidden-path edits) |
| **Revise** | 1 | corrected markdown (final design doc) |

No agent wrote, edited, or executed anything in the repo other than the two `.md` deliverables; the
verification commands (§4) are run by the orchestrator.

---

## 2. Files inspected (path → role)

### Interaction Matrix source & consumers
| Path | Role |
|---|---|
| `examples/coupon-feature/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md` | live free-form Interaction Matrix — `Result` mixes route (`/coupons/[id]` `:51`) + natural language (`status filter 변경` `:52`, `refetch` `:53-54`) |
| `templates/screen/screen-spec.template.md` | Interaction Matrix template — 4-col header + "Result 비워두지 않음" note (`:57-62`); Unknowns/Open Decisions/candidate conventions (`:73-74,97-112`) |
| `scripts/lib/spec.mjs` | `interactionResultRoutes` route-extraction regex (`:383-399`); `parseTable`/`hasHeader`/`col` table parser (`:63-127`); `interaction_matrix_complete` derivation (`:244-252`) |
| `scripts/lib/nav-graph.mjs` | `cellRoutes`/`ROUTE_RE` char-identical to spec.mjs (`:5-7,21-39`); `outboundEdgesOf` → `{to_route,trigger,action}` (`:88-103`); cross-check throw (`:145-155`); EXACT route resolve (`:122,138`); stub destination (`:136-141`) |
| `scripts/validate.mjs` | check 4 (Interaction Matrix route ∈ inventory) (`:222-234,241-249`); check 6 selector (`:448`); dual-severity warning-first precedent (`:18-23`) |
| `scripts/route-tree.mjs` + `scripts/lib/route-tree.mjs` | route artifact a v2 cross-check compares against; deterministic, hardcoded header (`route-tree.mjs:22-27`; `lib/route-tree.mjs:37-107`) |
| `scripts/lib/spec.test.mjs` | "P13" is a unit-test id, not a validate check number (`:80-95`) |

### Gate / policy / roadmap coordinates
| Path | Role |
|---|---|
| `scripts/readiness.mjs` | `interaction_matrix_complete` fact wiring (`:42,179`) |
| `scripts/workflow-state.mjs` | fact emission (`:83`) |
| `policies/implementation-mode-policy.yaml` | `interaction_matrix_complete` appears only in a comment (`:12`), in no `requires` → not a gate |
| `roadmap-current.md` | Tier-3 follow-up "Result 컬럼 구조화" (`:91`, `:106`); gate inventory note "not a gate" (`:54`) |
| `CHANGELOG.md` | roadmap registration of the item (`:113`) |

### Golden fixtures (layout to mirror)
| Path | Role |
|---|---|
| `examples/route-tree/basic-app/expected/route-tree.txt` | route forms `/(tabs)/home`, `/coupons/[id]` (`:5-12`) — the cross-check target shape |
| `examples/nav-graph/basic-flow/expected/nav-graph.yaml` | `{to_route,trigger,action}` edge (`:10-13`) = v2 `Target`/Trigger/User Action |
| `examples/nav-graph/basic-flow/run-metadata.json` | fixture wiring convention (`:1-8`) a future v2 fixture mirrors |

### Prior-art (house style + precedent)
| Path | Role |
|---|---|
| `temp/proposals/component-catalog-generation-source-contract.md` | canonical style; data-driven staged migration; OD-as-precedent |
| `temp/proposals/generated-file-guard-design.md` | warning-first → `--enforce`; "no diff gate before the first real generator" |
| `temp/runs/component-catalog-generation-design-001.md` | run-report structure mirrored here |

---

## 3. Decisions (summary — full rationale + citations in the design doc)

| # | Decision | Recommendation |
|---|---|---|
| §3 v2 column schema | 3-col / 1-col / inline DSL / separate block | **add `Result Type` / `Target` / `Params`** (all optional); v1 `Result` kept; mirrors roadmap (`:91`) + nav-graph `{to_route,trigger,action}` |
| §4 dual-read strategy | v2-first dual-read / split parsers / v1-only | **v2-first dual-read, single route-extraction regex preserved**; per-table mode; route taken from `Target` via the *same* `cellRoutes` |
| §5 coexistence | permanent dual / timed→mandatory / v2 only | **permanent dual** — v1 source of truth, v2 indefinitely optional; mandate is OD-3 |
| §6 validate timing/severity | error now / warning-first / not seen | **warning-first**; new v2 format checks warn; **check 4 unchanged**; route check as a separate new check (warning) |
| §7 route-tree cross-check | error / warning / inventory-only | **`Result Type=route` Target ∉ route-tree → warning, never a hard gate**; skip if artifact absent; promotion is a separate PR |
| §8 migration order | parser-first / fixture-first / checks-first | **parser dual-read is the FIRST implementation step**; nothing else precedes it |
| §9 coupon-feature v2 fixture | this PR / future PR / convert existing | **future PR, new directory**, nav-graph layout mirror; not in scope here (NG-6) |
| §10 Unknown/OD surfacing | candidate+OD / blank / LLM fills | **candidate / Unknown / Open Decision** — LLM never resolves; malformed v2 → v1 fallback + warning |

Recommended-conclusion alignment: v1 kept; v2 optional-only; all implementation = follow-up PRs;
first step = parser dual-read; no hard gate; route-tree cross-check warning-first — **matches the
task's recommended conclusion direction.**

Open Decisions OD-1…OD-5 recorded; **none block this design PR** (all close at parser/validate/migration
time — mirrors the nav-graph "ship generator, then close schema Open Decision, then register" precedent).

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

Exactly two new files, both in allowed locations; nothing else (no tracked modification expected):

- `frontend-workflow-kit/temp/proposals/interaction-matrix-structured-format.md` *(new — the design doc)*
- `frontend-workflow-kit/temp/runs/interaction-matrix-structured-format-001.md` *(new — this report)*

---

## 6. Hard-rule compliance

| Forbidden item (design-only constraint) | Status | Reason |
|---|---|---|
| `scripts/**` (spec.mjs / nav-graph.mjs / route-tree / validate / readiness / workflow-state) | ✅ | design-only; no diff to any script — all parser/check changes are PROPOSED (future PR) |
| `scripts/validate.mjs` check 4 / any check | ✅ | unchanged; v2 checks proposed as warning-first new checks, never editing check 4 |
| `scripts/route-tree.mjs` / `scripts/lib/route-tree.mjs` | ✅ | unchanged; route-tree is only a *read* cross-check target in the design |
| `templates/screen/screen-spec.template.md` | ✅ | header untouched; optional v2 column guidance is a future PR |
| `examples/**` (coupon-feature, fixtures) | ✅ | unchanged; v2 fixture is a future PR in a new directory (NG-6) |
| `policies/implementation-mode-policy.yaml` / readiness / workflow-state | ✅ | unchanged; `interaction_matrix_complete` gate semantics NOTE-only |
| `package.json` · `package-scripts.template.json` | ✅ | unchanged |
| `.github/**` (CI / gates) | ✅ | unchanged; no CI step added; no hard-gate promotion |
| `catalog/artifact-manifest.yaml` | ✅ | unchanged |
| any generated output file | ✅ | unchanged; nav-graph/route-tree goldens stay byte-identical for v1 screens by design |
| NO hard-gate graduation | ✅ | route-tree cross-check warning-first; promotion is an explicit separate future PR |
| LLM never promotes Unknown/Open Decision/candidate | ✅ | §10 keeps undecided targets as candidate/Unknown/OD; new questions filed as OD-1…OD-5, not resolved |

All parser/validate/template/fixture/manifest/CI changes in the design are labelled **PROPOSED (future
PR)** and are not applied here.

---

## 7. Next recommended task

**FUTURE PR-2 — parser dual-read** (per design §8 step 2, §4, §12): add v2-aware cell selection to
`scripts/lib/spec.mjs` and `scripts/lib/nav-graph.mjs` (per-table mode: `Result Type` header present →
v2; else v1 free-form), **preserving the single route-extraction regex** (`cellRoutes` applied to
`Target` in v2 route rows). Acceptance: nav-graph and route-tree output for existing v1 screens stays
**byte-identical** (existing goldens pass unchanged). No validate change, no template change, no
fixture, no manifest flip, no CI — those follow in PR-3…PR-6 only after the parser's behavior is proven
against the existing goldens.
