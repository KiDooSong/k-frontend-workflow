# Playwright Test Agents Setup

Use this reference when `e2e-agent` needs real
[Playwright Test Agents](https://playwright.dev/docs/test-agents) in a consumer
repo. The intended flow is planner -> generator -> healer:

- Planner explores a runnable web app and writes a Markdown test plan.
- Generator turns an approved plan into Playwright tests.
- Healer repairs failing test code from failure evidence and human-reviewed diff.

This is a setup reference (read once). For the rules the agent applies while it
plans, generates, and reviews tests — assertion & locator hygiene, coverage
division — see [e2e-behavioral-rules.md](e2e-behavioral-rules.md).

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

### Visual capture specs and artifacts

Visual capture specs are advisory Expo Web screenshot evidence, not behavioral
E2E verification. The canonical rules live in
[e2e-visual-capture.md](e2e-visual-capture.md); this setup reference only defines
how they fit the Playwright path/runtime model.

Keep the existing behavioral path model intact: generated behavioral tests still
live under `tests/web/{domain}/{screen-slug}/<suite>.spec.ts`. Visual capture
specs may live under:

```txt
tests/web/screenshots/{domain}/{screen-slug}/{state}.visual.spec.ts
```

Select visual specs explicitly by path, `@visual` tag, or a consumer-owned
Playwright project. A separate `visual` project may be useful when consumers want
a stable viewport or browser, but the kit does not require a kit-wide config
change.

Example commands, adjusted to the consumer's path/project names:

```bash
# capture only
E2E_PORT=3100 E2E_RUN_ID=auth-ui npx playwright test tests/web/screenshots/auth --grep @visual

# ordinary behavioral verify when visual specs live inside tests/web
npx playwright test --grep-invert @visual

# capture through a consumer-owned visual project
E2E_RUN_ID=auth-ui npx playwright test --project visual --grep @visual
```

Keep screenshot artifacts run-specific and uncommitted, for example:

```txt
.playwright-results/${E2E_RUN_ID}/screenshots/{domain}/{screen-slug}/{state}.png
```

Do not use `toHaveScreenshot()` as the default capture primitive; that implies
visual baseline/comparison semantics. Use `page.screenshot({ path })` or
`locator.screenshot({ path })` for advisory artifacts.

## Worktrees and Sessions

`init-agents` output is repo content. Generate it once, review the diff, and
commit the intended files instead of regenerating them in every worktree:

- For Claude-loop setup, commit `.mcp.json`, `.claude/agents/playwright-test-*.md`,
  the seed file, and `specs/` when those outputs are intentional.
- For Codex-loop setup, commit the generated `.codex/agents/playwright_test_*.toml`
  files and any intended seed/planning scaffold output.
- A git worktree is a checkout of its branch, so worktrees created after those
  files are committed inherit them automatically. Untracked `init-agents` output
  is the normal reason a fresh worktree appears to "miss" the setup.

MCP mounting is session-time behavior:

- The host agent process mounts `.mcp.json` when the session starts, from the
  session/workspace root. Writing `.mcp.json` mid-run does not hot-mount the
  `playwright-test` server into the current session; restart the session or start
  a new one rooted where the committed `.mcp.json` lives.
- Planner, generator, and healer subagent calls consume the parent session's
  already-mounted MCP tools. A subagent call does not mount MCP again and does not
  search a different working directory for `.mcp.json`.
- Parallel worktree sessions normally spawn separate `playwright-test` stdio
  processes, so the larger practical collision is the app under test and the
  generated run artifacts: web server ports, Playwright `outputDir`, reports, and
  traces. Set `E2E_PORT`, `E2E_BASE_URL`, and `E2E_RUN_ID` per session, and keep
  reports/output under run-specific directories.

## Path model

Three path systems are in play. Only generated tests and the seed are bound to
the configured Playwright `testDir`.

| Artifact | Where it lands | Set by | Bound to `testDir`? |
|---|---|---|---|
| Input contracts (ScreenSpec, visual/Figma mapping, templates) | kit/consumer doc tree | agent context paths | No |
| Plan (`plan.md`) | any workspace-relative path | planner save path | No |
| Generated test (`*.spec.ts`) | inside configured `testDir` | generator file path | Yes |
| Visual capture spec (`*.visual.spec.ts`) | inside configured `testDir`, usually `tests/web/screenshots/**` | capture runbook/spec author | Yes |
| Visual screenshot artifact (`*.png`) | run-specific output, e.g. `.playwright-results/${E2E_RUN_ID}/screenshots/**` | Playwright run | No |
| Seed (`seed.spec.ts`) | inside configured `testDir` | setup/discovery under `testDir` | Yes |

- The workspace root is the session cwd: the consumer repo root, a worktree root,
  or a scratch consumer directory for kit dogfood. Plan and test paths must
  resolve inside that workspace.
- A plan path is workspace-relative and not tied to `testDir`. This kit's
  canonical final plan path is `tests/web-plans/{domain}/{screen-slug}/plan.md`,
  but the generator receives the plan body, not authority from its file location.
- Generated tests must stay inside the configured `testDir`. With the kit's
  default `testDir: './tests/web'`, generated test subpaths follow
  `tests/web/{domain}/{screen-slug}/<suite>.spec.ts`: a folder per screen with
  the 1..N suite files for that screen.
- Visual capture specs also stay inside `testDir` when committed as source, but
  should be selected explicitly by path, `@visual` tag, or visual project instead
  of being swept into ordinary behavioral verification by default.
- The seed must also live inside `testDir` so planner/generator/healer setup can
  discover and run it with the selected Playwright project.
- Do not set `testDir` to the repo root. Seed setup and Playwright discovery
  would scan unrelated repo files, including non-Playwright `*.test.*` files.
  Keep `testDir` dedicated, such as `tests/web`.

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
- Generator output -> `tests/web/{domain}/{screen-slug}/<suite>.spec.ts` — a folder
  per screen holding the 1..N suite files the planner produces for that screen. The
  planner emits `**File:**` per test but reuses one filename per suite, so do not
  merge unrelated suites into one file; a single-suite screen is still a
  `{screen-slug}/` folder with one file. `testDir` stays fixed; the
  domain/screen/suite is a `fileName` subpath. A planner "suite" that is actually a
  distinct canonical screen goes to its own `screen-slug`
  ([screen-identity.md](screen-identity.md)), not nested as a suite. Use the
  consumer repo's convention if it already has a clearer one.

A reviewed plan may keep a non-generator `Visual Capture Candidates` sidecar near
the official planner output. The Playwright generator consumes the official
behavioral planner output only; do not treat capture candidates as behavioral
test scenarios.

Do not treat the scaffold template as the normal substitute for planner output.
The generator-facing plan must preserve the Playwright planner output body
(`Application Overview`, `Test Scenarios`, `Seed`, `File`, `Steps`, and
expectations). If a consumer repo lacks Test Agents setup, stop with setup
required instead of continuing into generator/healer by hand.

## Boundaries

Playwright E2E is optional evidence. It does not add CI, hard gates, readiness
promotion, Open Decision resolution, Unknown closure, Gap acceptance, or
`confirmed` promotion.
