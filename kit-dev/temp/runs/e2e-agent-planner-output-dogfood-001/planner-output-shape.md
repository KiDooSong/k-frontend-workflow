# e2e-agent Planner Output Shape Dogfood

Run id: `e2e-agent-planner-output-dogfood-001`

Branch/worktree: `docs/e2e-agent-dogfood-followup` in `.claude/worktrees/e2e-agent-dogfood-followup`

## Scope

This dogfood checked Playwright's planner save tool shape and path capability in
a scratch consumer app. It did not run a browser, did not run Playwright tests,
did not invoke generator or healer, and did not commit scratch-generated
planner output.

Actual LLM planner exploration remains blocked in this Codex session because the
Playwright Test Agents MCP tools are not mounted into the running session.

## Scratch Setup

The scratch consumer contained:

- a tiny static coupon-list HTML app;
- `server.mjs`;
- `playwright.config.mjs` with `testDir: "./tests/web"`, `use.baseURL`,
  `webServer.url`, `E2E_PORT`/`E2E_BASE_URL`, and
  `reuseExistingServer: !process.env.CI`.

Command:

```bash
npx -y playwright init-agents --loop=codex --config playwright.config.mjs --project chromium
```

Observed setup output:

```txt
.codex/agents/playwright_test_generator.toml
.codex/agents/playwright_test_healer.toml
.codex/agents/playwright_test_planner.toml
specs/README.md
tests/web/seed.spec.ts
```

## Tool Capability

The Playwright package implementation for `planner_save_plan` includes a
`fileName` parameter:

```txt
fileName: "The file to save the test plan to ... Relative to the workspace root."
```

The tool resolves the path inside the workspace root, creates parent
directories, and writes the Markdown plan. In the scratch consumer workspace, a
direct tool-level call successfully saved:

```txt
tests/web-plans/coupons/coupon-001.plan.md
```

Returned message:

```txt
Test plan saved to tests/web-plans/coupons/coupon-001.plan.md
```

## Serialized Shape

The saved Markdown shape was:

```md
# Coupon List Test Plan

## Application Overview

...

## Test Scenarios

### 1. Coupon List

**Seed:** `tests/web/seed.spec.ts`

#### 1.1. should-open-coupon-detail

**File:** `tests/web/coupons/coupon-001.spec.ts`

**Steps:**
  1. Open the coupon list and select the first available coupon.
    - expect: The coupon list is visible.
```

## Template Comparison

- Playwright planner output is the generator-facing plan: overview, scenarios,
  seed, file, steps, and expectations.
- `web-plan.template.md` is not a replacement for that output. It is a context
  scaffold for ScreenSpec identity, exclusions, locator gaps, and preflight
  notes before planner use.
- If planner output is saved outside official `specs/*.md`, the path should be
  requested explicitly through `planner_save_plan.fileName` or reviewed after
  the planner run.

## Path Policy

- Canonical final plan: use the consumer's established path, defaulting in this
  kit to `tests/web-plans/{domain}/{screen-slug}.plan.md`.
- Per-run draft: use an isolated path, such as
  `tests/web-plans/{domain}/{screen-slug}/drafts/{run-id}.plan.md` or
  `kit-dev/temp/runs/<run-id>/tests/web-plans/...`.
- Do not let parallel sessions write competing drafts directly to the canonical
  final plan path.
