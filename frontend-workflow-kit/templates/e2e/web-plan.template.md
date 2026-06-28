# {SCREEN_ID} Web E2E Planner Context Scaffold

## Not Generator Input

This scaffold is not the Playwright planner output. Do not pass this file to
the generator unless it also contains the official planner output body below.

Use this for planner context prep, kit dogfood, or a human-reviewed planning
scaffold. In consumer repos with Playwright Test Agents setup, prefer real
planner output over this template and do not treat this template alone as the
normal generator handoff.

## Workflow Context

### Evidence-Only Disclaimer

This scaffold is optional evidence/preflight material only. It is not approval,
readiness elevation, CI/hard-gate wiring, or resolution of an Open Decision,
Unknown, or Gap.

### Identity / Source

- Mode: `plan`
- Canonical screen_id: `{SCREEN_ID}`
- Domain: `{domain}`
- Route: `{route}`
- ScreenSpec: `{path/to/screen-spec.md}`
- Source docs: `{links-or-notes}`
- Seed file: `{seed_file}`
- Playwright project: `{playwright_project}`
- Base URL: `{base_url}`
- Playwright testDir: `{test_dir}`

### Output Paths

- Official default/raw planner landing surface: `specs/{planner-output}.md`
- Canonical final plan path: `tests/web-plans/{domain}/{screen-slug}/plan.md`
- Per-run draft path: `tests/web-plans/{domain}/{screen-slug}/drafts/{run-id}/plan.md`
- Actual dogfood path, if kit repo dogfood: `kit-dev/temp/runs/{run-id}/tests/web-plans/{domain}/{screen-slug}/plan.md`
- Future generated test target, if approved later: `{test_dir}/{domain}/{screen-slug}.spec.ts` (single suite) or `{test_dir}/{domain}/{screen-slug}/<suite>.spec.ts` (folder per screen when the plan splits into per-suite files; see [e2e-playwright-agents.md](../../docs/reference/e2e-playwright-agents.md#kit-mapping))

### Shallow Smoke Scope

1. `{stable route or shell smoke}`
2. `{stable success or primary interaction smoke}`
3. `{optional error or retry smoke when fixture/seed is explicit}`

### Exclusions / Open Items

- Open Decisions not asserted: `{D-*}`
- Unknowns not closed: `{U-*}`
- Out-of-scope states, routes, platforms, analytics, or visual parity: `{items}`

### Locator / testID / Seed Gaps

- Stable anchors available: `{copy, role, label, testID}`
- Missing anchors or seed data: `{gaps}`
- Do not invent selectors; request or reconcile contract updates before generation.

### Planner Context Packet

```yaml
mode: plan
screen:
  screen_id: "{SCREEN_ID}"
  domain: "{domain}"
  route: "{route}"
  screen_spec: "{path/to/screen-spec.md}"
playwright:
  seed_file: "{seed_file}"
  project: "{playwright_project}"
  base_url: "{base_url}"
  test_dir: "{test_dir}"
output:
  raw_planner_output: "specs/{planner-output}.md"
  canonical_plan_path: "tests/web-plans/{domain}/{screen-slug}/plan.md"
  generated_test_dir: "{test_dir}/{domain}/{screen-slug}"
states: []
interactions: []
exclude:
  open_decisions: []
  unknowns: []
locator_gaps: []
```

## Generator Handoff Boundary

- Stop after plan evidence.
- Do not create `tests/web/**`, run Playwright test runner, or call generator/healer in plan-only mode.
- Generation later requires explicit approval, Playwright Test Agents setup, runnable web app, seed/entry URL, locator strategy, and approved planner output.

## Official Planner Output

Replace this skeleton with the body saved by Playwright `planner_save_plan`.
The reviewed canonical `plan.md` must preserve the generator-facing planner
shape, even if the workflow context above is retained for provenance.

# {Planner Plan Name}

## Application Overview

`{planner overview}`

## Test Scenarios

### {suite name}

**Seed:** `{seed_file}`

#### {test name}

**File:** `{test_dir}/{domain}/{screen-slug}.spec.ts` (single suite) or `{test_dir}/{domain}/{screen-slug}/<suite>.spec.ts` (one file per suite)

**Steps:**
  1. `{user-facing action}`
    - expect: `{observable result}`
