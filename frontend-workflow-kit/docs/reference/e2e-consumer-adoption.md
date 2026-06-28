# E2E Consumer Adoption Guide

The consumer-facing procedure for adopting **optional web E2E evidence**
(Playwright Test Agents driven by the [`e2e-agent`](../../skills/e2e-agent/SKILL.md)
skill) in a real consumer repo: what to **install, commit, ignore, and run**, in
order. It is a sequencing/checklist wrapper, not a second copy of the setup
reference, path model, or behavioral rules. Read the canonical homes for detail:

- Setup, MCP wiring, runtime config, path model, session model →
  [e2e-playwright-agents.md](e2e-playwright-agents.md) (read once, at setup).
- Assertion / locator / coverage rules applied during plan / generate / review →
  [e2e-behavioral-rules.md](e2e-behavioral-rules.md).
- Workflow modes (`plan` / `generate` / `verify` / `heal`) and the core
  invariants → [e2e-agent skill](../../skills/e2e-agent/SKILL.md).
- The non-gating boundary is owned by
  [Stage 08](workflow-stages/08-validate-and-report.md).

E2E is optional evidence and never a gate. A green run does not add CI, raise
readiness, resolve an Open Decision, close an Unknown, accept a Component Gap, or
promote `confirmed`. This guide does not change that — it only orders the
consumer steps.

## A. When to adopt

Adopt real E2E generation when **all** of these hold:

- There is a real, runnable web surface (an actual app at a known entry URL), not
  just a fixture concept.
- The ScreenSpec / route / seed / locator (`testID`) contracts are at least
  roughly in place — `final-fixture-ui` or higher is the comfortable point
  (`rough-fixture-ui` prefers `plan` only).
- The canonical `screen_id` is settled, not a raw source alias
  ([screen-identity.md](screen-identity.md)).

Stay in **plan / preflight only** when the surface is still in flux:

- Screen ID, ScreenSpec, route, seed, or `testID` are unclear or unstable.
- Then run [`e2e-agent`](../../skills/e2e-agent/SKILL.md) in `plan` mode (a
  preflight context scaffold) and stop. Plan-only does not run the test runner
  and does not create `tests/web/**`.

Investing in coverage is a **plan-time** decision, not a codegen one: a weak plan
assertion freezes into a green-but-inert test, so the precision gate lives at
plan and review time ([e2e-behavioral-rules.md](e2e-behavioral-rules.md)).

## B. One-time setup in the consumer repo

Run Playwright Test Agents setup once, choosing the loop that matches the repo's
active agent environment. Loop-specific outputs and the MCP-required caveat are in
[e2e-playwright-agents.md → Setup](e2e-playwright-agents.md#setup).

```bash
npx playwright init-agents --loop=codex
# or
npx playwright init-agents --loop=claude
```

Point setup at the consumer config/project so the seed lands inside the
configured `testDir` instead of the repo root:

```bash
npx playwright init-agents --loop=claude --config playwright.config.ts --project chromium
```

**Commit candidates** — review the diff and merge intentionally; if `.mcp.json`,
`.codex/agents/`, or `.claude/agents/` already exist, do not blind-overwrite local
agent setup:

- `.mcp.json` (Claude loop) **or** `.codex/agents/playwright_test_*.toml` (Codex
  loop).
- `.claude/agents/playwright-test-*.md` (Claude loop).
- the seed (`seed.spec.ts`) under the configured `testDir`.
- `specs/README.md` and the `specs/` planning scaffold when the output is
  intentional.
- `playwright.config.*` changes.

**Do not commit:**

- Playwright report / trace / `outputDir` contents.
- run-specific scratch or temp directories.
- generated browser artifacts (run videos, screenshots).
- `node_modules`.

A committed setup is inherited by later worktrees — a worktree is a checkout of
its branch — so generate it once and commit the intended files instead of
regenerating per worktree. Untracked `init-agents` output is the usual reason a
fresh worktree looks like it "lost" the setup
([e2e-playwright-agents.md → Worktrees and Sessions](e2e-playwright-agents.md#worktrees-and-sessions)).

Ignore the run artifacts so evidence never lands in history. Match the paths to
your config's `outputDir` / report locations:

```gitignore
# Playwright run artifacts — evidence, not source
/.playwright-results/
/playwright-report/
/test-results/
/blob-report/
```

## C. Required runtime config

A minimal config shape is in
[e2e-playwright-agents.md → Runtime Config](e2e-playwright-agents.md#runtime-config).
At minimum the consumer config must:

- Set a stable, **dedicated** `testDir`, e.g. `tests/web`. Do not set `testDir`
  to the repo root — discovery would scan unrelated `*.test.*` files.
- Unify `webServer.url` and `use.baseURL` from a single value (e.g.
  `E2E_BASE_URL` or `http://127.0.0.1:${E2E_PORT}`).
- Parameterize per session/worktree with `E2E_PORT`, `E2E_BASE_URL`, and
  `E2E_RUN_ID` so parallel sessions do not fight over a port or clobber each
  other's output.
- Keep `outputDir`, reports, and traces **run-specific** (e.g. keyed by
  `E2E_RUN_ID`) and uncommitted (see §B ignore list).

## D. Path model

Three path systems are in play; only generated tests and the seed are bound to
the configured `testDir`. The full table is in
[e2e-playwright-agents.md → Path model](e2e-playwright-agents.md#path-model).

| Artifact | Path | Bound to `testDir`? |
|---|---|---|
| Raw planner output | `specs/` (official default) or an explicit workspace-relative path | No |
| Canonical final plan | `tests/web-plans/{domain}/{screen-slug}/plan.md` | No |
| Per-run draft | `tests/web-plans/{domain}/{screen-slug}/drafts/{run-id}/plan.md` | No |
| Generated tests | `tests/web/{domain}/{screen-slug}/<suite>.spec.ts` | Yes |
| Seed | `seed.spec.ts` inside `testDir` | Yes |

- Generated tests are a **folder per screen** holding the 1..N suite files for
  that screen; a single-suite screen is still a `{screen-slug}/` folder with one
  file. They must stay inside the configured `testDir`.
- The plan is **not** tied to `testDir`; the generator receives the plan body,
  not authority from its file location.
- `{screen-slug}` is the canonical `screen_id` lowercased with non-alphanumerics
  replaced by `-`. A planner "suite" that is actually a distinct canonical screen
  goes to its own `screen-slug`, not nested as a suite
  ([screen-identity.md](screen-identity.md)).

## E. Session / MCP model

Details in
[e2e-playwright-agents.md → Worktrees and Sessions](e2e-playwright-agents.md#worktrees-and-sessions).
The operational facts to plan around:

- `.mcp.json` is mounted **at session start**, from the session/workspace root.
- Writing `.mcp.json` mid-run does **not** hot-mount the `playwright-test` server
  into the current session — restart, or start a session rooted where the
  committed `.mcp.json` lives.
- Planner / generator / healer subagent calls consume the parent session's
  already-mounted MCP tools; a subagent call does not mount MCP again.
- A new worktree/session inherits the committed setup, but MCP approval may still
  be requested again per session.

## F. Workflow usage

Drive every step through the [`e2e-agent`](../../skills/e2e-agent/SKILL.md) mode
router. The [behavioral rules](e2e-behavioral-rules.md) are folded into
plan / generate / review, not read as background.

- `plan` — if Playwright Test Agents setup is absent, stop with **setup
  required**. Otherwise call the planner first; coverage depth is the planner's
  job.
- `generate` — requires an approved plan + seed/`baseURL` + locator strategy +
  explicit user approval; output lands under `testDir` as folder-per-screen (§D).
- `verify` — run the smallest related Playwright command and report by evidence.
- `heal` — only after failing evidence and an explicit user request; check the
  diff for weakened assertions, broad regex, or `test.fixme()`.

## G. Adoption checklist

Before generating any test:

- [ ] canonical `screen_id`, ScreenSpec, and route confirmed (not a raw alias).
- [ ] seed file plus auth/session setup exist and are discoverable under
      `testDir`.
- [ ] locator / `testID` contract is declared from the ScreenSpec/component
      contract — do not invent selectors; propose a contract update if anchors
      are missing.
- [ ] Open Decisions and Unknowns are listed and excluded from assertions.
- [ ] runtime config: dedicated `testDir`, unified `baseURL` / `webServer.url`,
      per-session `E2E_PORT` / `E2E_BASE_URL` / `E2E_RUN_ID` (§C).

After generating, before keeping the set:

- [ ] run the
      [behavioral-rules Review checklist](e2e-behavioral-rules.md#review-checklist)
      to strip inert assertions (e.g. `toBeFocused()` right after `.click()`).
- [ ] reports / traces / `outputDir` are not committed (§B).

Boundary reminder: none of the above adds CI, hard gates, readiness promotion,
Open Decision resolution, Unknown closure, Gap acceptance, or `confirmed`
promotion. Link or summarize results into a
[Stage 08](workflow-stages/08-validate-and-report.md) handoff, a run report, or a
consumer-defined verification note.
