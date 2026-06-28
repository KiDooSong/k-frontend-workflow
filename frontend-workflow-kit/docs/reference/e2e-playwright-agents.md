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

## Setup

Run the Playwright setup in the consumer repo, choosing the local agent loop:

```bash
npx playwright init-agents --loop=codex
```

Other loops, such as `claude`, `vscode`, or `opencode`, may be used when that is
the repo's active agent environment. Regenerate the agent definitions whenever
Playwright is updated so tools and instructions stay in sync.

The setup creates agent definitions plus the supporting planning surface, such
as Markdown plan directory files, a seed test, and Playwright MCP wiring. A
consumer repo still owns its Playwright config, web server command, seed data,
and generated tests.

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

## Kit Mapping

- ScreenSpec -> planner context.
- [web-plan.template.md](../../templates/e2e/web-plan.template.md) -> scaffold
  for preflight notes, kit dogfood, or human-reviewed context before planner use.
- Official Playwright examples use `specs/*.plan.md`, and
  `planner_save_plan.fileName` can save to any relative workspace path. For this
  kit, use `tests/web-plans/{domain}/{screen-slug}.plan.md` only as the reviewed
  canonical final plan, or follow the consumer's established plan path.
- Per-run drafts must be isolated, for example
  `tests/web-plans/{domain}/{screen-slug}/drafts/{run-id}.plan.md` or a
  repo-local run folder such as `kit-dev/temp/runs/<run-id>/...`.
- Generator output -> `tests/web/{domain}/{screen-slug}.spec.ts`.

Do not treat the scaffold template as the normal substitute for planner output.
If a consumer repo lacks Test Agents setup, stop with setup required instead of
continuing into generator/healer by hand.

## Boundaries

Playwright E2E is optional evidence. It does not add CI, hard gates, readiness
promotion, Open Decision resolution, Unknown closure, Gap acceptance, or
`confirmed` promotion.
