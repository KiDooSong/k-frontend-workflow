# {SCREEN_ID} Web E2E Planner Context Scaffold

## Evidence-Only Disclaimer

This scaffold is optional evidence/preflight material only. It is not approval,
readiness elevation, CI/hard-gate wiring, or resolution of an Open Decision,
Unknown, or Gap.

Use this for planner context prep, kit dogfood, or a human-reviewed planning
scaffold. In consumer repos with Playwright Test Agents setup, prefer real
planner output over this template and do not treat this template alone as the
normal generator handoff.

## Identity / Source

- Mode: `plan`
- Canonical screen_id: `{SCREEN_ID}`
- Domain: `{domain}`
- Route: `{route}`
- ScreenSpec: `{path/to/screen-spec.md}`
- Source docs: `{links-or-notes}`

## Output Path

- Consumer-shape plan path: `tests/web-plans/{domain}/{screen-slug}.plan.md`
- Actual dogfood path, if kit repo dogfood: `kit-dev/temp/runs/{run-id}/tests/web-plans/{domain}/{screen-slug}.plan.md`
- Future generated test target, if approved later: `tests/web/{domain}/{screen-slug}.spec.ts`

## Shallow Smoke Scope

1. `{stable route or shell smoke}`
2. `{stable success or primary interaction smoke}`
3. `{optional error or retry smoke when fixture/seed is explicit}`

## Exclusions / Open Items

- Open Decisions not asserted: `{D-*}`
- Unknowns not closed: `{U-*}`
- Out-of-scope states, routes, platforms, analytics, or visual parity: `{items}`

## Locator / testID / Seed Gaps

- Stable anchors available: `{copy, role, label, testID}`
- Missing anchors or seed data: `{gaps}`
- Do not invent selectors; request or reconcile contract updates before generation.

## Planner Context Packet

```yaml
mode: plan
screen:
  screen_id: "{SCREEN_ID}"
  domain: "{domain}"
  route: "{route}"
  screen_spec: "{path/to/screen-spec.md}"
output:
  plan_path: "tests/web-plans/{domain}/{screen-slug}.plan.md"
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
