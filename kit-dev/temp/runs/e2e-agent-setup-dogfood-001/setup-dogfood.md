# e2e-agent Setup Dogfood

Run id: `e2e-agent-setup-dogfood-001`

Branch/worktree: `docs/e2e-agent-dogfood-followup` in `.claude/worktrees/e2e-agent-dogfood-followup`

## Scope

This dogfood checked whether Playwright Test Agents setup can be initialized in a
scratch consumer-shaped directory. It did not write to repo-root `tests/**`, did
not create `tests/web/**`, did not run a browser, did not run Playwright tests,
did not call generator/healer, and did not add CI, hard gates, readiness changes,
Open Decision changes, Unknown changes, Gap changes, or `confirmed` changes.

Scratch path used:

```txt
kit-dev/temp/runs/e2e-agent-setup-dogfood-001/scratch-consumer/
```

The generated scratch files were inspected and then not committed. This evidence
records only the setup result and generated file list.

## Command

```bash
npx -y playwright init-agents --loop=codex
npx -y playwright init-agents --loop=claude
```

## Result

Both loop-specific setup commands succeeded in scratch directories.

Observed Codex generated files:

```txt
.codex/agents/playwright_test_generator.toml
.codex/agents/playwright_test_healer.toml
.codex/agents/playwright_test_planner.toml
seed.spec.ts
specs/README.md
```

Observed Claude generated files:

```txt
.claude/agents/playwright-test-generator.md
.claude/agents/playwright-test-healer.md
.claude/agents/playwright-test-planner.md
.mcp.json
seed.spec.ts
specs/README.md
```

Notable observations:

- The planner agent definition uses `planner_setup_page` and
  `planner_save_plan`.
- The planner MCP server command is `cmd /c npx playwright run-test-mcp-server`.
- Codex stores the `playwright-test` MCP server inside each generated
  `.codex/agents/playwright_test_*.toml` file.
- Claude stores agent instructions under `.claude/agents/` and the shared
  `playwright-test` MCP server in repo-root `.mcp.json`.
- The default seed file is only a placeholder and still needs consumer-specific
  auth/session/route/data setup before planner or generator use.
- No Playwright agent definitions are added to the kit payload by this PR.

## Config Probe

A follow-up scratch probe checked whether `playwright.config.ts` affects setup
paths. The scratch files were removed after inspection.

Observed results:

```txt
no config:
  seed.spec.ts
  specs/README.md
  .codex/agents/playwright_test_*.toml

--config playwright.config.ts with testDir: "./tests/web":
  tests/web/seed.spec.ts
  specs/README.md
  .codex/agents/playwright_test_*.toml

--config playwright.config.ts --project webkit where project.testDir is "./tests/webkit":
  tests/webkit/seed.spec.ts
  specs/README.md
  .codex/agents/playwright_test_*.toml
```

Conclusion from the probe: Playwright config/project selection can change the
seed file directory, but the seed filename remains `seed.spec.ts`, the plan
scaffold directory remains `specs/`, and Codex agent definitions remain under
`.codex/agents/`.

## MCP Requirement

MCP setup is required for actual planner/generator/healer execution. Without the
generated `playwright-test` MCP server, the planner cannot call
`planner_setup_page` or `planner_save_plan`; generator/healer likewise lose their
browser/test tools. A markdown scaffold can still be written, but that is only
preflight evidence and not a real Playwright Test Agents run.

## Conclusion

The setup path is available, but actual planner invocation still requires a real
consumer web app, Playwright config, usable seed test, and locator/testID
strategy. This supports the `e2e-agent` direction: consumer repos should set up
Playwright Test Agents first; the kit template is only a scaffold for context and
dogfood, not the normal replacement for planner output.
