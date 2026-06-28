# Playwright Test Agents Setup

Use this reference when `e2e-agent` needs real
[Playwright Test Agents](https://playwright.dev/docs/test-agents) in a consumer
repo. The intended flow is planner -> generator -> healer:

- Planner explores a runnable web app and writes a Markdown test plan.
- Generator turns an approved plan into Playwright tests.
- Healer repairs failing test code from failure evidence and human-reviewed diff.

## Prerequisites

- Runnable web app and known entry URL.
- Playwright config and a seed test that establishes the starting page/session.
- Locator strategy, preferably stable role/name plus `testID`/`data-testid`
  anchors declared from the ScreenSpec/component contract.
- A ScreenSpec context packet: canonical `screen_id`, route, State/Interaction
  rows, exclusions, and unresolved decisions or unknowns to avoid asserting.
- The Playwright handoff fields: `seed_file`, `playwright_project`, `base_url`,
  and `test_dir`.

## Setup

Run the Playwright setup in the consumer repo, choosing the local agent loop:

```bash
npx playwright init-agents --loop=codex
npx playwright init-agents --loop=claude
```

Use the loop matching the repo's active agent environment. Other loops, such as
`vscode` or `opencode`, may be used when appropriate. Regenerate the agent
definitions whenever Playwright is updated so tools and instructions stay in sync.

The setup creates agent definitions plus the supporting planning surface, such
as Markdown plan directory files, a seed test, and Playwright MCP wiring. A
consumer repo still owns its Playwright config, web server command, seed data,
and generated tests.

The MCP wiring is required for real planner/generator/healer work. Without the
`playwright-test` MCP tools, the planner cannot call `planner_setup_page` /
`planner_save_plan`, the generator cannot write tests from live exploration, and
the healer cannot run/debug tests through the agent workflow. A docs-only
preflight scaffold can be written without MCP, but that is not equivalent to a
Playwright planner run.

Observed loop-specific outputs:

- `--loop=codex` creates `.codex/agents/playwright_test_*.toml`; each agent embeds
  its own `[mcp_servers.playwright-test]` command.
- `--loop=claude` creates `.claude/agents/playwright-test-*.md` plus repo-root
  `.mcp.json` for the shared `playwright-test` server.

If `.mcp.json`, `.codex/agents/`, or `.claude/agents/` already exist, inspect the
diff and merge intentionally instead of blindly overwriting local agent setup.

`init-agents` can read the consumer Playwright config and project selection:

```bash
npx playwright init-agents --loop=codex --config playwright.config.ts --project web
```

The seed file is generated under the selected Playwright `testDir` or project
`testDir` while keeping the `seed.spec.ts` filename. Without a config, a scratch
run may create `seed.spec.ts` at repo root; with `testDir: "./tests/web"` it
creates `tests/web/seed.spec.ts`. The plan scaffold directory remains `specs/`.

## Runtime Config

Prefer per-session web settings so parallel worktrees do not fight over a fixed
port. Use Playwright's
[web server config](https://playwright.dev/docs/test-webserver) rather than
ad-hoc shell startup:

- `webServer.url` and `use.baseURL` should come from the same value, such as
  `E2E_BASE_URL` or `http://127.0.0.1:${E2E_PORT}`.
- Use `reuseExistingServer: !process.env.CI` for local sessions when safe; CI
  should start from a clean server.
- If the app needs more than one server, use Playwright's multiple web servers
  config instead of hiding extra startup inside the seed.
- Keep Playwright reports, traces, and `outputDir` in run-specific directories
  and do not commit them by default.

Minimal consumer config shape:

```ts
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const runId = process.env.E2E_RUN_ID ?? 'local';

export default defineConfig({
  testDir: './tests/web',
  outputDir: `.playwright-results/${runId}`,
  use: { baseURL },
  webServer: {
    command: `npm run web -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
```

## Kit Mapping

- ScreenSpec -> planner context.
- [web-plan.template.md](../../templates/e2e/web-plan.template.md) -> scaffold
  for preflight notes, kit dogfood, or human-reviewed context before planner use.
- Official Playwright setup creates `specs/` as the default human-readable
  planning surface. Treat `specs/` as the raw/default landing surface unless the
  planner is explicitly asked to save to another workspace-relative path.
- This kit's canonical final plan path is a governance convention, not a
  Playwright requirement: copy or curate the human-reviewed final plan to
  `tests/web-plans/{domain}/{screen-slug}/plan.md`, or follow the consumer's
  established plan path.
- Per-run drafts must be isolated, for example
  `tests/web-plans/{domain}/{screen-slug}/drafts/{run-id}/plan.md` or a
  repo-local run folder such as `kit-dev/temp/runs/<run-id>/...`.
- Generator output -> `tests/web/{domain}/{screen-slug}/{scenario-slug}.spec.ts`
  unless the consumer repo already has a clearer convention.

Do not treat the scaffold template as the normal substitute for planner output.
The generator-facing plan must preserve the Playwright planner output body
(`Application Overview`, `Test Scenarios`, `Seed`, `File`, `Steps`, and
expectations). If a consumer repo lacks Test Agents setup, stop with setup
required instead of continuing into generator/healer by hand.

## Boundaries

Playwright E2E is optional evidence. It does not add CI, hard gates, readiness
promotion, Open Decision resolution, Unknown closure, Gap acceptance, or
`confirmed` promotion.
