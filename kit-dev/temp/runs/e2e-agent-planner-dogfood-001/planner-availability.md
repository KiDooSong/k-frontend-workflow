# e2e-agent Planner Availability Dogfood

Run id: `e2e-agent-planner-dogfood-001`

Branch/worktree: `docs/e2e-agent-dogfood-followup` in `.claude/worktrees/e2e-agent-dogfood-followup`

PR: `#113`

## Scope

This follow-up checked whether the current kit repo can invoke an actual
Playwright planner/agent in `plan` mode. It did not create repo-root
`tests/web-plans/**`, did not create `tests/web/**`, did not run a browser or
Playwright test runner, did not call generator/healer, and did not change
runtime, CI, hard gates, readiness, Open Decisions, Unknowns, Gaps, or
`confirmed` status.

Related inputs:

- [e2e-agent/SKILL.md](../../../../frontend-workflow-kit/skills/e2e-agent/SKILL.md)
- [web-plan.template.md](../../../../frontend-workflow-kit/templates/e2e/web-plan.template.md)
- [previous dogfood notes](../e2e-agent-dogfood-001/dogfood-notes.md)
- [Playwright agents research](../../../../docs/research/playwright/01-playwright-agents-planner-generator-healer.md)

## Checks

1. Repo package/scripts:
   - `frontend-workflow-kit/package.json` has only the kit workflow scripts and
     the `yaml` dependency.
   - No Playwright dependency or planner script is declared.
2. Repo-local agent/config files:
   - No `.mcp.json`.
   - No `.claude/agents/playwright-test-*.md`.
   - No `.codex/agents/*.toml`.
   - No `playwright.config.*`.
   - No `tests/seed.spec.ts`.
3. Local Playwright CLI probe:
   - Command: `cmd.exe /c "cd /d C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\e2e-agent-dogfood-followup && npx --no-install playwright --version"`
   - Result: failed because no local `playwright` package was installed. `npx`
     reported missing package `playwright@1.61.1` and did not install it.
4. Codex tool discovery:
   - Searching for Playwright planner/MCP browser tools did not expose
     `playwright-test` planner tools such as `planner_setup_page` or
     `planner_save_plan`.
   - Only the generic Node REPL tool surfaced for JavaScript execution.

## Verdict

Actual Playwright planner invocation is not available in this repo/worktree.
The blockers are:

- kit repo is not a runnable consumer web app;
- Playwright is not installed as a repo dependency;
- Playwright `init-agents` output is absent;
- planner MCP tools are not available in the current Codex session;
- no seed test or Playwright config exists for a plan-only agent handoff.

Conclusion: the skill should stay planner-preferred but fallback-capable. In this
kit-only dogfood environment, `plan` mode should use the web plan template and
ScreenSpec evidence to draft a plan, preserving consumer path shape under
`kit-dev/temp/runs/<run-id>/tests/web-plans/...`.
