# e2e-agent Real-MCP Planner Dogfood

Run id: `e2e-agent-real-mcp-001`

Branch/worktree: `dogfood/e2e-agent-real-mcp-planner` (cut from `docs/e2e-agent-dogfood-followup` @ `7329039`) in `.claude/worktrees/dogfood-e2e-agent-real-mcp`.

PR under test: `#113`

Session: Claude Code (Opus 4.8), Windows 11, `node v24.15.0`, `npm 11.12.1`, Playwright CLI `1.61.1`.

Related prior dogfoods (same question, same wall):
[planner-availability.md](../e2e-agent-planner-dogfood-001/planner-availability.md),
[planner-output-shape.md](../e2e-agent-planner-output-dogfood-001/planner-output-shape.md),
[setup-dogfood.md](../e2e-agent-setup-dogfood-001/setup-dogfood.md),
[dogfood-notes.md](../e2e-agent-dogfood-001/dogfood-notes.md).

Inputs read:
[e2e-playwright-agents.md](../../../../frontend-workflow-kit/docs/reference/e2e-playwright-agents.md),
[web-plan.template.md](../../../../frontend-workflow-kit/templates/e2e/web-plan.template.md),
[e2e-agent/SKILL.md](../../../../frontend-workflow-kit/skills/e2e-agent/SKILL.md).

---

## Verdict (headline)

**blocked: MCP not mounted.**

The Playwright Test Agents `playwright-test` MCP server is **not mounted in this running
session**, so the real LLM planner tools (`planner_setup_page` / `planner_save_plan`)
could not be invoked against the scratch app. **No live planner output was produced, and
no manual substitute `plan.md` was written.**

This obeys the doc's own rule
([e2e-playwright-agents.md](../../../../frontend-workflow-kit/docs/reference/e2e-playwright-agents.md)):
"Without the `playwright-test` MCP tools, the planner cannot call `planner_setup_page` /
`planner_save_plan` ... A docs-only preflight scaffold can be written without MCP, but
that is not equivalent to a Playwright planner run." The run therefore stops at
setup-required for the live-exploration half.

What **was** verified without a live run (high confidence, source-derived):

1. `init-agents --loop=claude` setup artifacts for a real consumer-shaped app.
2. The **authoritative planner output shape**, read from the shipped Playwright
   serializer source (`planner_save_plan`), which is deterministic code — not a guess and
   not a "projection." This validates `web-plan.template.md`'s structural assumptions.

What is **still unverified** (needs the MCP actually mounted): the planner's explored
*body* for the coupon app — the real overview prose, the scenarios/steps the LLM designs,
and the exact File paths it picks. See "Remaining gap" at the end.

---

## Boundaries respected

- Did not create repo-root `tests/web-plans/**` or `tests/web/**`.
- Did not run a browser or the Playwright test runner against scenarios (only an HTTP
  smoke of the static app).
- Did not call generator/healer; did not hand-write a planner plan.
- No change to runtime, CI, hard gates, readiness, Open Decisions, Unknowns, Gaps, or
  `confirmed`.
- Scratch runtime (app, `node_modules`, generated `.mcp.json` / `.claude/agents` / seed /
  `specs/`, reports, traces) is **not committed** — only this evidence markdown is.

---

## MCP availability evidence (the blocker)

The `playwright-test` MCP tools are absent from this session:

- Session tool inventory contains no `playwright-test` / `planner_*` / `browser_*` tools.
- `ToolSearch "playwright test agents planner generator MCP"` → no Playwright tools.
- `ToolSearch "planner setup page seed test scenario generator healer"` → none.
- `ToolSearch select:mcp__playwright-test__planner_save_plan,mcp__playwright-test__planner_setup_page`
  → **"No matching deferred tools found."**

Why this cannot be fixed mid-session: `init-agents` writes `.mcp.json` into the consumer
directory, but a host (Claude Code / Codex) only mounts an MCP server by **loading that
`.mcp.json` at startup with user approval**. A running session cannot self-mount a new
server. So even a *successful* `init-agents` (below) does not make the tools appear here.
This matches every prior dogfood: none ever mounted the MCP.

---

## Scratch consumer app (real, runnable)

Path: `kit-dev/temp/runs/e2e-agent-real-mcp-001/scratch-consumer/` (not committed).

- `app/index.html` — small coupon-list app: a list of coupons (code / discount / expiry)
  with View / Copy code / Apply buttons, a detail view, and an empty state. Stable
  `data-testid`s: `coupon-list`, `coupon-item`, `coupon-code`, `view-button`,
  `copy-button`, `apply-button`, `empty-state`, `status`, `coupon-detail`.
- `server.mjs` — dependency-free static server; port from `--port` (Playwright
  `webServer.command`) or `E2E_PORT`, default `3100`.
- `playwright.config.mjs` — `testDir: './tests/web'`; `projects: [{ name: 'chromium' }]`;
  `use.baseURL` and `webServer.url` both from the **same** `E2E_BASE_URL` /
  `http://127.0.0.1:${E2E_PORT}` value; `reuseExistingServer: !process.env.CI`;
  `outputDir: '.playwright-results/${runId}'`.

Smoke (proves the app is runnable, so the **only** blocker is the MCP, not the app):
`node server.mjs` on `E2E_PORT=3137` → `GET /` returns **HTTP 200** and the HTML contains
`data-testid="coupon-list" | coupon-item | apply-button | empty-state`.

---

## init-agents (loop=claude) — real setup artifacts

Command (matches this session's loop):

```bash
npx -y playwright init-agents --loop=claude --config playwright.config.mjs --project chromium
```

First attempt failed: the config `import { defineConfig, devices } from '@playwright/test'`
is unresolvable until `@playwright/test` is installed (`ERR_MODULE_NOT_FOUND`). A real
consumer repo has it as a devDependency; installed `@playwright/test@1.61.1`, then the
command succeeded. Note for the docs: `--config` requires `@playwright/test` to be
installed locally, not just the `npx playwright` CLI.

Generated output (all confined to `scratch-consumer/`; **no repo-root `.mcp.json` or
`.claude/agents/` pollution** — verified):

```txt
 📝 specs\README.md            - directory for test plans
 🌱 tests\web\seed.spec.ts     - default environment seed file
 🤖 .claude\agents\playwright-test-generator.md
 🤖 .claude\agents\playwright-test-healer.md
 🤖 .claude\agents\playwright-test-planner.md
 🔧 .mcp.json                  - mcp configuration
 ✅ Done.
```

This confirms the doc's claude-loop claims: seed lands under `testDir` (`tests/web/seed.spec.ts`,
filename stays `seed.spec.ts`); plan scaffold dir is `specs/`; claude loop emits repo-root
`.mcp.json` plus `.claude/agents/playwright-test-*.md`.

`.mcp.json` (verbatim):

```json
{
  "mcpServers": {
    "playwright-test": {
      "command": "cmd",
      "args": ["/c", "npx", "playwright", "run-test-mcp-server"]
    }
  }
}
```

`.claude/agents/playwright-test-planner.md` — tools include
`mcp__playwright-test__planner_setup_page`, `mcp__playwright-test__planner_save_plan`, and
the `mcp__playwright-test__browser_*` set; `model: sonnet`. The agent prompt says only to
"save the complete test plan as a markdown file with clear headings, numbered steps"; it
does **not** itself pin the `**Seed:**` / `**File:**` / `- expect:` micro-format. That
exact shape comes from the tool serializer (next section), not the agent prompt.

---

## Authoritative planner output shape (shipped serializer, deterministic)

Source: `node_modules/playwright/lib/mcp/test/plannerTools.js` → the `planner_save_plan`
handler — the exact code `run-test-mcp-server` runs. Corroborated by the official
`node_modules/playwright-core/lib/tools/cli-client/skill/references/spec-driven-testing.md`
(§1.4) and the generator agent's `<example-generation>`.

`planner_save_plan` input schema:

- `name` — plan title (e.g. `"Test Plan"`); `fileName` — workspace-relative save path;
  `overview` — app overview paragraph.
- `suites[]` = `{ name, seedFile, tests[] }`
  - `tests[]` = `{ name, file, steps[] }`
    - `file` — *"The file the test should be saved to, for example:*
      `tests/<suite-name>/<test-name>.spec.ts`*"* → **per test/scenario**.
    - `steps[]` = `{ perform?, expect: string[] }`

Exact serialized Markdown (literal `lines.push(...)` order):

```md
# {name}

## Application Overview

{overview}                       ← plain paragraph, no backticks

## Test Scenarios

### 1. {suite.name}              ← ordinal "N."

**Seed:** `{suite.seedFile}`     ← per SUITE, once

#### 1.1. {test.name}            ← ordinal "N.M."

**File:** `{test.file}`          ← per TEST, value tests/<suite>/<test-name>.spec.ts

**Steps:**
  1. {step.perform}              ← 2-space indent, plain text
    - expect: {expect}           ← 4-space indent, one bullet per expect string
    - expect: {expect-2}
  2. {step-2.perform}

### 2. {next-suite.name}
...
```

Save behavior: `planner_save_plan` resolves `fileName` within the workspace root,
`mkdir -p`'s parents, writes the file, and returns `Test plan saved to {fileName}`.
Therefore:

- Raw/default landing surface is `specs/<feature>.plan.md` (per `spec-driven-testing.md`
  §1 and the generated `specs/` scaffold).
- The kit's canonical target **`tests/web-plans/coupons/coupon-001/plan.md` IS supported**
  — `fileName` accepts any workspace-relative path and auto-creates parent dirs.
- A sibling `planner_submit_plan` tool returns the same structure as JSON; the claude
  planner agent is wired to `planner_save_plan` (Markdown), not `planner_submit_plan`.

---

## Answers to the dogfood questions

| Question | Answer |
|---|---|
| MCP tool name **used** | **None — blocked.** Would-be tools: `mcp__playwright-test__planner_setup_page`, `mcp__playwright-test__planner_save_plan`. |
| Actual save path | **N/A (no live run).** Capability: any workspace-relative `fileName`, incl. `tests/web-plans/coupons/coupon-001/plan.md`; raw default `specs/`. |
| `# name` / `## Application Overview` / `## Test Scenarios` / `**Seed:**` / `**File:**` / `**Steps:**` / `- expect:` shape | As serialized above (authoritative from `plannerTools.js`). |
| Is `**File:**` per-screen or per-scenario? | **Per-scenario** — one test per file, `tests/<suite>/<test-name>.spec.ts`, kebab-named after the scenario. **Not** per-screen. |

---

## Diff vs `web-plan.template.md` and PR #113 recommendations

The template's "Official Planner Output" block is meant to be *"replaced with the body
saved by Playwright `planner_save_plan`"* and to *"preserve the generator-facing planner
shape."* Against the real serializer:

**1. File granularity — real drift (HIGH).**
- template: `` **File:** `{test_dir}/{domain}/{screen-slug}.spec.ts` `` → one file per **screen**.
- real: `` **File:** `tests/<suite>/<test-name>.spec.ts` `` → one file per **scenario**
  (`spec-driven-testing.md`: *"One test per file ... `should-add-single-todo` →
  `should-add-single-todo.spec.ts`"*).
- This also conflicts with the kit's own *"Generator output → `tests/web/{domain}/{screen-slug}.spec.ts`"*
  convention (Kit Mapping in `e2e-playwright-agents.md`; Output Paths in `SKILL.md`): a real
  planner will emit *N* per-scenario File lines for one screen, which the kit's per-screen
  mapping does not absorb.
- Recommendation: PR #113 should resolve the tension explicitly — either (a) adopt the
  Playwright per-scenario file convention in the kit, or (b) keep the per-screen generator
  convention but stop showing a per-screen value **inside** the "preserve planner shape"
  block and document that the kit re-buckets per-scenario planner Files into per-screen
  generator specs. This is a design decision for the PR owner; I did not change it
  unilaterally off a blocked run.

**2. Heading ordinals — shape mismatch (MED).** Real always numbers headings
(`### 1. {suite}`, `#### 1.1. {test}`); the template shows `### {suite name}` /
`#### {test name}` with no ordinal. Recommend the template show the `N.` / `N.M.` pattern.

**3. Overview & step notation (LOW).** Real `overview`, `perform`, and `expect` are plain
prose; the template wraps them in backticks (`` `{planner overview}` ``,
`` `{user-facing action}` ``, `` `{observable result}` ``). Recommend a note that planner
output is plain text, not code-spans, so reviewers don't copy the backticks into a
generator-facing plan.

**4. Correct — no change needed.** `# {name}`, `## Application Overview`,
`## Test Scenarios`, **suite-level** `**Seed:**`, `**Steps:**`, the 2-space step / 4-space
`- expect:` indentation, and multiple `- expect:` per step all match the serializer.

Also confirmed accurate in `e2e-playwright-agents.md`: claude loop →
`.mcp.json` + `.claude/agents/playwright-test-*.md`; server `playwright-test`; tools
`planner_setup_page` / `planner_save_plan`; seed under `testDir`; `specs/` scaffold dir;
`planner_save_plan.fileName` supports `tests/web-plans/.../plan.md`. The
"stop with setup required when the MCP is absent" rule is exactly what this run hit.

One doc precision worth adding (minor): `--config` resolution needs `@playwright/test`
installed locally, not just the `npx playwright` CLI.

---

## Remaining gap (to actually finish the dogfood)

A session with the `playwright-test` MCP **mounted** (host restarted in the consumer dir
with the generated `.mcp.json` approved) must:

1. `planner_setup_page` with `project: "chromium"`, `seedFile: "tests/web/seed.spec.ts"`.
2. Let the planner explore the running coupon app and call `planner_save_plan` with
   `fileName: "tests/web-plans/coupons/coupon-001/plan.md"`.
3. Capture the literal saved body + save message, and confirm the per-scenario File paths,
   ordinals, and prose against the recommendations above.

Until then, the **shape** is verified from source but the **explored body** is not.
