# Run report — Tier2 route cross-check (warning-only)

> **Status: IMPLEMENTATION — 2026-06-20.** This slice closes OD-4 and OD-8 by a human decision and lands the tool that OD-4 chose: a **separate warning-only** route cross-check (`scripts/route-cross-check.mjs` + lib + test). It compares the ScreenSpec `route` set against the `route: <token>` set in `route-tree.txt` (the adapter rawPath projection) — **EXACT, both directions, warning-first (always exit 0)**. It is intentionally small: it does **not** couple to `validate`/`nav-graph`/`route-tree`, does **not** import the router/codegen adapter (reads the two committed artifacts only), and adds **no** CI, required check, hard gate, `--enforce`, or readiness/validate gate change. Only the **route dimension** is implemented; the nav dimension (navigation-map drift) and the codegen output↔docs dimension are deferred.

## Decisions Applied

| Decision | Applied contract |
|---|---|
| **OD-4 = (A) separate warning-only tool** | A standalone script compares the ScreenSpec `route` set against the adapter `rawPath` set. Mismatches are warnings only (exit 0). Not wired into validate/nav-graph/route-tree (§10(10b) recommendation; NG-1). |
| **OD-8 = nav-graph stays doc-only (§11b)** | The nav-graph generator does not consume the adapter or any cross-check. If nav-route drift detection is ever needed, the *same* tool handles it — never coupled into the nav-graph generator. This first slice implements the **route dimension only**; the nav dimension is deferred (recorded as follow-up). |
| **Comparison = EXACT (no normalization)** | `ScreenSpec route == adapter rawPath`, EXACT string match, per §6 (6a). Isomorphic to nav-graph's `fm.route` EXACT match (`lib/nav-graph.mjs:107,115`); `parseRouteTreeRouteTokens` does not normalize `[id]`/`(group)` raw tokens (`route-core.mjs:171-172`). |

## Implemented

| Area | Files | Scope |
|---|---|---|
| Logic | `scripts/lib/route-cross-check.mjs` | `analyzeRouteCrossCheck({docsDir})` reads the two committed artifacts and EXACT-compares both directions; returns a JSON-serializable report. `formatRouteCrossCheckWarnings` / `formatRouteCrossCheckHuman` render diagnostics (mirrors the catalog-gen barrel-reconcile `analyze→format` trio). Pure logic + shallow read-only IO; no adapter import. |
| CLI | `scripts/route-cross-check.mjs` | `--docs <dir>` / `--json` / `--help`. Human-readable warnings to **stderr** (component-catalog phase2-1 reconcile diagnostic mirror), `--json` report to **stdout** (lint-baseline `--json` mirror). **Always exits 0.** Direct-run guard mirrors `nav-graph.mjs` (no side effects on import). |
| Test | `scripts/lib/route-cross-check.test.mjs` | Synthetic temp-dir fixtures (check-generated-files test convention): full match → 0 warnings; ScreenSpec→tree missing; tree→ScreenSpec missing; EXACT (`[id]` vs `:id` mismatches both ways); route-tree absent → skip; 0 screen-specs → skip; route-less spec ignored; `--json` shape + deterministic sort; plus 3 end-to-end CLI smoke tests (exit 0, `--json` stdout / warnings stderr / fail-soft skip). |
| Test wiring | `package.json` | Added `scripts/lib/route-cross-check.test.mjs` to both `test:spec` and `test` `node --test` lists. |
| Inputs reused (not modified) | — | route set ← `_meta/route-tree.txt` via `parseRouteTreeRouteTokens` (the same extraction validate check 13 uses); ScreenSpec set ← `domains/**/screen-spec.md` frontmatter `route` via `findFiles` + `loadScreenSpec` (validate.mjs:262-275). |
| Docs | `temp/proposals/tier2-router-codegen-adapter.md`, `roadmap-current.md` | Moved OD-4/OD-8 to a "Resolved by human decision — 2026-06-20" block; resolved the §6 and §11 open notes; updated the §15 summary rows; added a §17 current-slice line; updated roadmap item 2 remaining. |

### Output contract

- **Direction 1 — ScreenSpec route not in route-tree** (stronger drift/typo signal): each missing route is reported with its source spec file(s) for attribution.
- **Direction 2 — route-tree route without ScreenSpec** (missing doc, or a layout/group route): reported as a lexicographically-sorted route list.
- **Determinism:** all findings sorted (route/file lexicographic); all **finding** paths are `docsDir`-relative posix with no timestamps and no absolute machine paths. (The top-level `docs` field is a cwd-relative input echo — same convention as `check-generated-files` `toPosixRel`; it is run context, not a finding.)
- **Fail-soft:** `route-tree.txt` absent **or** 0 screen-specs → quietly skipped (isomorphic to validate check 13 "skip when artifact absent", `validate.mjs:277-283`). Never crashes. When the tree exists but specs are 0, `tree_route_count` reports the real token count (not a hardcoded 0) so it never contradicts `route_tree_found: true`.

## Intentionally Not Done (NG)

- No coupling of the cross-check into `validate` / `nav-graph` / `route-tree` (no direct import, no new check) — separate tool only (§10 / NG-1). The adapter is not imported either (artifacts read only).
- No nav-graph dimension and no codegen output↔docs dimension (recorded as follow-up only).
- No CI (`.github/workflows`), required check, hard gate, `--enforce`, or `exit 1` promotion. Always warning-first (exit 0).
- No edits to existing goldens/generated artifacts (`route-tree.txt`, codegen fixtures, etc.). No new role / preset, and **no consumer-facing package-alias promotion** — `package-scripts.template.json` is unchanged (held back like `check-generated-files`, the other warning-first tool not yet promoted). The kit-internal `package.json` `scripts` shortcut `workflow:route-cross-check` *is* added (review F1), matching all sibling CLI tools.
- No readiness/validate gate raised or lowered — this tool only diagnoses (warnings).

## Review follow-ups applied (post-implementation)

| # | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | Minor | Missing `workflow:route-cross-check` npm alias | **Accepted (scoped).** Added the kit-internal `package.json` `scripts` alias (universal convention; `lint-baseline` set the in-PR precedent). Deliberately **not** added to the consumer-facing `package-scripts.template.json` — that surface is the "소비 package alias 승격" the warning-first/no-promotion stance defers (same hold-back as `check-generated-files`). |
| F2 | Minor | Not listed in README `## 명령` | **Accepted.** Added a route cross-check command block next to the generated-views (route-tree/nav-graph) entries. |
| F3 | Cosmetic | Top-level `docs` JSON field is `process.cwd()`-relative (cross-drive could be absolute) | **Accepted as a claim fix, not a code change.** The `docs` field intentionally matches the `check-generated-files` `toPosixRel` sibling convention; *findings* are always `docsDir`-relative. Scoped the determinism claim to findings for accuracy. |
| F4 | Cosmetic | `tree_route_count: 0` hardcoded in skip payload | **Accepted.** The tree is now parsed whenever the file exists, so `tree_route_count` is honest even on skip (no contradiction with `route_tree_found: true`). Added a regression assertion. |
| F5 | Design tension (not a defect) | Two route cross-checks: check 13 (in validate) vs this standalone tool | **Recorded, no code change.** They are complementary (different inputs — Result/Target vs frontmatter route — completing the triangle's last edge), and the in-validate vs standalone asymmetry is the intended product of OD-4 (§10(10b): keep validate dependency-light). Added a cross-reference comment in the lib header; future unification noted as a follow-up. |

## Verification (Windows, green)

```bash
node --test scripts/lib/route-cross-check.test.mjs
```
Result: **PASS — 11 tests, 0 fail.**

```bash
npm test
```
Result: **PASS** — `test-fixtures` 27 fixtures (26 PASS, 1 XFAIL) and `node:test` 131 pass, 0 fail.

```bash
node scripts/route-cross-check.mjs --json     # real kit defaults (docs/frontend-workflow)
```
Result: **exit 0**, valid JSON. The kit's own docs have no `_meta/route-tree.txt` and 0 screen-specs, so `skipped: true` (fail-soft) — confirming exit 0 + JSON shape on real kit artifacts.

Additional real (non-skip) demonstration — generated `route-tree.txt` from `examples/coupon-feature/src/app` into a scratch docs tree alongside the committed coupon-feature screen-specs (committed tree untouched):

```
route-cross-check — WARNING: ScreenSpec route ↔ route-tree mismatch (warning-first, non-blocking)
  route-tree: _meta/route-tree.txt
  ScreenSpec route not in route-tree: /coupons/[id]  (domains/coupons/screens/coupon-detail/screen-spec.md)
```
`exit 0`. The screen-spec declares `/coupons/[id]` but that route is absent from the app tree (which only yields `/(tabs)/coupons`, matched on both sides) — a real drift surfaced as a warning, with file attribution.

```bash
node scripts/validate.mjs
```
Result: **`workflow:validate — OK (검사 12종 통과)`, exit 0** — validate is unchanged (no new check, no adapter/cross-check coupling).

```bash
git diff --check
```
Result: **exit 0** — no whitespace/conflict errors.

## Remaining Follow-up

- **nav dimension:** ScreenSpec/navigation-map route ↔ route-tree drift handled by the *same* `route-cross-check` tool (never coupled into the nav-graph generator). Deferred from this slice.
- **codegen output↔docs dimension:** generated client/hook outputs ↔ API docs cross-check. Out of scope here.
- **CI / hard gate / required check / `--enforce` promotion decision:** the single remaining residual for roadmap item 2 — a separate human-approved decision PR after observed evidence. Not touched here (warning-first only).
