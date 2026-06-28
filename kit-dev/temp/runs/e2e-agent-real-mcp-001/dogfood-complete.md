# e2e-agent Real-MCP Planner Dogfood — COMPLETE

Run id: `e2e-agent-real-mcp-001`. Supersedes the `blocked: MCP not mounted` verdict in
[planner-mcp-dogfood.md](./planner-mcp-dogfood.md); rooting/setup story in
[planner-mcp-continuation.md](./planner-mcp-continuation.md).

## Verdict: COMPLETE — live planner → generator, end to end

The `playwright-test` MCP was mounted in a session rooted on a valid Playwright project
(consumer = repo root; see the continuation note). The full pipeline ran live against the
scratch Coupons app and produced real, passing tests. Consumer-shaped evidence is mirrored
under [`tests/web-plans/coupons/coupon-001/`](./tests/web-plans/coupons/coupon-001/) (the
runnable app + `node_modules` are intentionally not committed).

## What ran — 2 planners × 2 generators (all green)

| Plan source | Tests | direct-gen | agent-gen |
|---|---|---|---|
| `plan.direct.md` (direct MCP calls) | 5 | 5 passed | 5 passed |
| `plan.agent.md` (planner subagent) | 17 | 17 passed | 17 passed |

Reports:
[planner: direct vs agent](./tests/web-plans/coupons/coupon-001/planner-direct-vs-agent-report.md) ·
[generator vs (on direct plan)](./tests/web-plans/coupons/coupon-001/generator-b-vs-a-report.md) ·
[generator vs (on agent plan)](./tests/web-plans/coupons/coupon-001/generator-from-agent-plan-report.md).

Recommended adopted output:
[`_generated/_precision-gated/`](./tests/web-plans/coupons/coupon-001/_generated/_precision-gated/)
(17 scenarios, assertion hygiene applied).

## Findings confirmed live

1. **Path model holds across all 4 paths.** Plans saved to `tests/web-plans/...` (free path,
   outside `testDir`); tests written to `tests/web/coupons/...` (inside `testDir`);
   `git diff playwright.config.mjs` empty in every run. `testDir` is never edited — domain is
   a `fileName` subpath. This is the model documented in `e2e-playwright-agents.md`.
2. **`**File:**` is emitted per test, but the planner reuses one filename per suite** → one
   spec file per suite, not per scenario (direct 5→3 files, agent 17→4). PR #114's
   "one test per file" concern does not hold in practice. Files are named semantically
   (`coupon-list/detail/copy/apply`), not by `screen_id` slug — a divergence from the kit's
   `tests/web/{domain}/{screen-slug}.spec.ts` convention the kit should reconcile (accept
   the planner's per-suite semantic split, or re-bucket into one file per screen).
3. **Coverage is set by the planner, not the generator.** The agent planner found 3 real
   behaviors the direct planner missed — View clears the status, Apply accumulates per
   coupon, Back resets all applied state — each verified against `app/index.html`. Generator
   choice changed only style/cost, not pass rate.
4. **Faithful generators freeze plan mistakes into green.** The agent plan asserted a button
   "gains the active state"; the app has no active class, so both generators encoded it as
   `toBeFocused()`, which passes right after `.click()` regardless of app logic. 17/17 green
   therefore did NOT validate those ~7 assertions — green is necessary, not sufficient. The
   precision gate must live at plan/review time, not be delegated to codegen (see
   `_precision-gated/`).

## Candidate rules — FORMALIZED

These dogfood recommendations are now canonical in
[`e2e-behavioral-rules.md`](../../../../frontend-workflow-kit/docs/reference/e2e-behavioral-rules.md)
(grounded in community practice via a deep-research pass; wired into the e2e-agent
skill and read each mode). They are no longer candidates — kept here as the run's
provenance:

1. Assert app-defined state (class / text / visibility / attribute / URL); never browser
   artifacts (`focus`, `:active`, `document.activeElement`). → behavioral-rules §A1.
2. Drop any assertion that passes independent of app logic (e.g. `toBeFocused()` right after
   `.click()`) — generators are faithful, not critical, so review must catch these. → §A2.
3. Scope a row by its container testid plus id, not an attribute its children also carry. → §B1.
4. Invest in the planner for coverage; choose the generator for style/cost. → §C.

Plus rules the research surfaced and added to the doc: web-first assertions (§A3),
every scenario asserts an outcome (§A4), strict-mode-as-signal (§B2), user-first
locator ranking (§B3), exact text matches (§B4); the §A2 "faithful generator
validates bugs" risk is backed by the arXiv keep-only-passing finding.

Related open decision (file packaging) — RESOLVED: a planner that splits one screen into
per-suite files (`coupon-list/detail/copy/apply`) lands as a **folder per screen**
(`tests/web/{domain}/{screen-slug}/<suite>.spec.ts`) — not merged into one file, and not
renamed to the `screen_id` slug. A "suite" that is actually a distinct canonical screen goes
to its own slug. Canonical in
[e2e-playwright-agents.md → Kit Mapping](../../../../frontend-workflow-kit/docs/reference/e2e-playwright-agents.md#kit-mapping)
and the e2e-agent skill Output Paths.

## Cost note (from the reports)

Subagent paths are token/time-heavy (planner agent ~33k tokens / ~5 min; generator agent
~50k / ~5 min) and measured in isolation, while the direct paths run inline and reuse this
session's earlier exploration — so the raw cost columns are not a like-for-like comparison.
The durable takeaway is the division of labor (coverage ⇐ planner, style/cost ⇐ generator),
not the absolute numbers.
