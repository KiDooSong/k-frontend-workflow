---
name: e2e-agent
description: Plan, generate, verify, or repair Playwright web E2E evidence from frontend-workflow ScreenSpec and visual contracts. Use when the user asks for e2e, Playwright, web verification, web evidence, a web test plan, generated web tests, running existing web tests, or healing failing Playwright tests for a known screen.
---

# e2e-agent

Create and maintain **optional web E2E evidence** from workflow contracts. This
skill wraps Playwright Test Agents when they are available in the consumer repo,
but it does not make E2E a readiness fact, CI hard gate, Open Decision resolver,
or confirmed-status promotion path.

## Core Rule

Use existing workflow stages; do not add a new mandatory stage.

| Current workflow context | Do |
|---|---|
| Stage 05 contract authoring | `plan` only |
| Stage 06 implementation | `plan` or `generate` when requested and runnable |
| Stage 08 validation / handoff | `verify` existing tests and report evidence |
| Failing E2E maintenance | `heal` only when requested |

E2E evidence is not approval. Green tests do not close Open Decisions, promote
`confirmed`, accept gaps, or raise readiness.

## Mode Selection

Infer the lightest mode that satisfies the request:

- `plan`: create or refresh a Playwright web plan.
- `generate`: create web tests from an approved plan.
- `verify`: run existing web tests and summarize evidence.
- `heal`: repair failing web tests after failure evidence exists.

If the request is ambiguous, default to `plan` before writing tests.

## Inputs To Read

Read only target-screen context:

- ScreenSpec for the canonical Screen ID,
- `figma-component-mapping.md` when visual evidence matters,
- component catalog / component-gap register when visual components matter,
- testID / QA notes when present,
- readiness output when implementation or generation is requested,
- existing `tests/web-plans/**` and `tests/web/**` for the target screen.

Do not invent a canonical Screen ID from a source alias. Route unmapped screens
through the Screen Source Map flow first.

## Output Paths

Use consumer repo conventions when they already exist. Otherwise prefer:

```txt
tests/web-plans/{domain}/{screen-slug}.plan.md
tests/web/{domain}/{screen-slug}.spec.ts
```

`tests/web-plans/**` are Playwright planning artifacts, not ScreenSpecs or
VisualSpecs. ScreenSpec remains the behavior source of truth.

Playwright reports and traces are evidence artifacts. Do not commit them by
default; link or summarize them in a Verification Matrix or run report when
useful.

## Coverage

Default to **shallow smoke**:

- screen entry,
- one or two representative states,
- one primary CTA or navigation.

Use deeper State Matrix / Interaction Matrix coverage only when the user asks for
it, the screen is a core business path, the flow is branchy, prior drift/bug
evidence exists, or a resolved decision adds scenarios.

Exclude scenarios blocked by open Open Decisions. Do not turn unknown behavior
into tests.

## Preconditions

| Mode | Required before acting |
|---|---|
| `plan` | canonical Screen ID, ScreenSpec, useful State or Interaction Matrix content |
| `generate` | plan, runnable web app, seed or entry URL, locator strategy, preferably `final-fixture-ui` or higher |
| `verify` | existing web tests, Playwright command/config, known web server command |
| `heal` | failing test evidence, limited test-surface write scope, user request |

In `rough-fixture-ui`, prefer `plan` only. Generate only very shallow smoke tests
when explicitly requested and the live surface is stable.

## Workflow

1. Determine mode and target screen.
2. Run or read readiness when generation or implementation-adjacent work is in
   scope:
   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --screen <SCREEN_ID> --json
   ```
3. Build a context packet for the Playwright agent:
   - screen id, domain, route,
   - State Matrix states to cover,
   - Interaction Matrix actions and expected results,
   - Open Decisions to exclude,
   - Copy Keys and accessibility / testID anchors,
   - visual mapping facts only as visual evidence, not behavior.
4. For `plan`, call the Playwright planner if available, otherwise draft the
   plan from the context packet and mark it as a draft.
5. For `generate`, use the Playwright generator with the plan and seed / entry
   URL. Keep generated tests in `tests/web/{domain}/`.
6. For `verify`, run the smallest relevant Playwright command and capture the
   result summary.
7. For `heal`, run the Playwright healer only after failure evidence exists and
   inspect the diff before reporting.
8. Finish with `workflow:validate` unless the task is plan-only and no workflow
   docs changed. Report E2E as evidence, not approval.

## Drift Handling

Do not silently change tests to match the current app just to make them green.
Classify the drift:

- implementation appears wrong -> keep evidence red and report implementation fix target,
- ScreenSpec appears stale -> report reconcile-input / ScreenSpec update candidate,
- visual-only mismatch -> report visual mapping / verification evidence / gap,
- unclear ownership -> raise or reference an Open Decision / Verification note,
- declared testID missing -> do not invent a new anchor; propose adding the
  declared anchor or updating ScreenSpec guidance.

## Confirmation Boundaries

Allowed after the user invokes the skill:

- read contracts and readiness,
- create a plan draft,
- run existing tests,
- report drift.

Require explicit request or confirmation for:

- creating new `tests/web/**` files,
- large rewrites of existing tests,
- running healer,
- accepting `test.fixme()` or weakened assertions,
- adding CI, required checks, hard gates, or `--enforce` behavior.

## Prohibitions

- Do not resolve Open Decisions, close Unknowns, accept Component Gaps, promote
  `confirmed`, or change readiness policy.
- Do not treat Playwright green as product approval.
- Do not invent testID anchors.
- Do not commit Playwright reports / traces by default.
- Do not wire CI or hard gates from this skill.
