# e2e-agent Real-MCP Planner Dogfood — How to actually run it (corrected approach)

Run id: `e2e-agent-real-mcp-001`. Continues [planner-mcp-dogfood.md](./planner-mcp-dogfood.md)
(PR #114 verdict was `blocked: MCP not mounted`). This note supersedes an earlier
repo-root "bridge config" draft, which was an anti-pattern (see below).

## TL;DR

Open a Claude Code session **rooted on a valid Playwright project**. The `playwright-test`
MCP then roots there automatically — no `.mcp.json` edit, no per-run config edits. Then
route every artifact by **call parameter**, with `testDir` left fixed.

## Rooting a consumer session (worktree caveat)

Opening a session *inside a directory that physically lives under another repo's git
worktree* attaches to that outer repo (its `.git` wins) instead of the consumer dir, so the
consumer never becomes the session root. Two ways that actually root on the consumer project:

- **Committed config + worktree-from-main (canonical):** commit `.mcp.json` +
  `playwright.config.*` at the consumer repo root, cut a worktree from it, and start the
  session in that worktree. A worktree is a full checkout, so its root is a valid PW project
  rooted at its own root. See the "Worktrees and Sessions" section of `e2e-playwright-agents.md`.
- **Standalone copy (used for this kit dogfood):** copy the consumer dir out of the kit repo
  and `git init` it, so it has its own `.git` and no link back to the kit repo.

## The routing model (verified from the shipped MCP source)

`testDir` is a **stable root**, set once. The per-domain / per-screen path is a **subpath
passed at call time**, never a config edit:

| Artifact | Param that sets location | Bound to `testDir`? | Source |
|---|---|---|---|
| `plan.md` | `planner_save_plan.fileName` | **No** — any path inside the workspace root | `plannerTools.js:132` `resolveWithinRoot(rootPath, fileName)` |
| `*.spec.ts` | `generator_write_test.fileName` | **Yes** — must be **inside** a project `testDir` | `generatorTools.js:101,114` `isPathInside(testDir, file)` else `Test file did not match any of the test dirs` |

So with a fixed `testDir: ./tests/web`:
- Plans → `tests/web-plans/{domain}/{screen}/plan.md` (free path; here it sits *outside*
  `tests/web` on purpose, which is allowed for plans).
- Tests → `tests/web/{domain}/{screen}.spec.ts` (domain/screen are just **subfolders**
  under the one stable `testDir`).

`rootPath` = `clientInfo.cwd` = the session's cwd (`testContext.js:83`). Both `fileName`s
must stay inside it. Rooting the session at the consumer dir makes every kit path
(`tests/web-plans/...`, `tests/web/...`) a clean consumer-relative path.

## Why the earlier repo-root attempt failed (the real finding for PR #113/#114)

The MCP resolves its config **once**, at connection time, from `configPath || clientInfo.cwd`
(`testContext.js:82`, cached for the connection). If the session is rooted where the repo
is **not a valid Playwright project** (no `playwright.config`, no `@playwright/test`), then:
- `planner_setup_page {project:"chromium"}` → `Project chromium not found`;
- `planner_setup_page {}` → default config scans the **whole repo** with
  `failOnLoadErrors:true` and dies on unrelated `*.test.mjs` (node:test) files;
- a config written *after* connect is ignored (location is cached).

A real consumer never hits this: their repo root already *is* a valid PW project, so
`init-agents` there → MCP rooted on a real project → `testDir` is their stable `tests/web`.
The kit repo isn't a consumer app, so the dogfood must root the session in a stand-in
consumer (this `scratch-consumer/`).

> Anti-pattern (rejected): a repo-root `playwright.config.mjs` whose `testDir` is hardcoded
> to one screen's folder and edited per run. `testDir` must NOT change per domain.

## Run steps (paste into the consumer-dir session)

Pre: a Claude Code session with **cwd = `…/e2e-agent-real-mcp-001/scratch-consumer/`**, with
the `playwright-test` MCP server approved. (This note lives one level up at
`../planner-mcp-continuation.md`.) Chromium is installed (`ms-playwright/chromium-1208,1228`).

1. `planner_setup_page { project: "chromium" }`
   → expect `status: paused`. The config's `webServer` auto-starts the coupon app
   (`npm run web -- --port 3100`, `E2E_PORT` default 3100); no manual server needed.
2. `browser_navigate { url: "http://127.0.0.1:3100/" }` (or `"/"`, baseURL is wired).
3. Explore with `browser_snapshot` + interactions. Coupon app facts:
   - 3 coupons: `WELCOME10`, `FREESHIP`, `SAVE20`; stable testids `coupon-list`,
     `coupon-item`, `coupon-code`, `view-button`, `copy-button`, `apply-button`,
     `coupon-detail`, `detail-back`, `status`, `empty-state`, `page-title`.
   - View → detail view (`coupon-detail` shown, list hidden); Back → list.
   - Copy code → `#status` = `Copied <ID> to clipboard`.
   - Apply → button gets `.applied` + text `Applied`; `#status` = `Applied <ID>`.
   - `empty-state` is the `COUPONS=[]` branch — not reachable without editing the app;
     note it as an un-exercised scenario rather than faking it.
4. `planner_save_plan { name, overview, suites, fileName: "tests/web-plans/coupons/coupon-001/plan.md" }`
   → saves to `scratch-consumer/tests/web-plans/coupons/coupon-001/plan.md`
   (demonstrates **plan routing via free fileName**, testDir untouched).
5. (Optional, to prove **test routing**) `generator_setup_page { plan, project: "chromium" }`
   then `generator_write_test { fileName: "tests/web/coupons/coupon-001.spec.ts", code }`
   → accepted because it is inside `testDir: tests/web` (domain = subfolder).

## Capture for the dogfood verdict

- The literal saved `plan.md` body + the `Test plan saved to …` message.
- Confirm against PR #114 recommendations: per-scenario `**File:**`, `### N.` / `#### N.M.`
  ordinals, plain-prose overview/steps (no backticks).
- The fact that `testDir` was never edited and both paths were chosen purely by param —
  this is the concrete evidence the kit's path conventions are param-routable.

## Recommended doc change (PR #113/#114), after the run confirms it

State the rule explicitly in `e2e-playwright-agents.md` / `e2e-agent/SKILL.md`:
"Root the `playwright-test` MCP at a valid Playwright project (your consumer repo root).
Keep one stable `testDir` (e.g. `tests/web`). Route plans via `planner_save_plan.fileName`
(workspace-relative; the kit uses `tests/web-plans/{domain}/{screen}/plan.md`) and tests via
`tests/web/{domain}/{screen}.spec.ts` (a subpath inside `testDir`). Never edit `testDir` per
domain."

## Cleanup (repo root, all untracked — from the user's repo-root `init-agents`)

These are no longer used by the consumer-dir approach; remove if desired:
`<repo-root>/.mcp.json`, `<repo-root>/.claude/agents/`, `<repo-root>/seed.spec.ts`,
`<repo-root>/specs/`. (The repo-root `playwright.config.mjs` bridge was already removed.)
Original repo-root `.mcp.json` is backed up in the session scratchpad as `mcp.json.orig`.
