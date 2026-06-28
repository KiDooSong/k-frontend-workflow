# Playwright Test Agents Setup

Use this reference when `e2e-agent` needs real Playwright Test Agents in a
consumer repo. The intended flow is planner -> generator -> healer:

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

## Kit Mapping

- ScreenSpec -> planner context.
- [web-plan.template.md](../../templates/e2e/web-plan.template.md) -> scaffold
  for preflight notes, kit dogfood, or human-reviewed context before planner use.
- Planner output -> `tests/web-plans/{domain}/{screen-slug}.plan.md`, or the
  consumer's established plan path.
- Generator output -> `tests/web/{domain}/{screen-slug}.spec.ts`.

Do not treat the scaffold template as the normal substitute for planner output.
If a consumer repo lacks Test Agents setup, stop with setup required instead of
continuing into generator/healer by hand.

## Boundaries

Playwright E2E is optional evidence. It does not add CI, hard gates, readiness
promotion, Open Decision resolution, Unknown closure, Gap acceptance, or
`confirmed` promotion.
