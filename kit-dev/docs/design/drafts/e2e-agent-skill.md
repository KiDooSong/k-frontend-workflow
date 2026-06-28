# E2E Agent Skill Draft

> Status: **DESIGN / DRAFT (proposal, no gate)**. 2026-06-28.
> Scope: define a repo skill that wraps Playwright Test Agents as optional web evidence.
> Sources: [playwright research 01](../../../../docs/research/playwright/01-playwright-agents-planner-generator-healer.md), [playwright workflow integration 03](../../../../docs/research/playwright/03-workflow-integration.md), [E2E evidence drafts](e2e-evidence/README.md), [testID contract candidate](e2e-evidence/testid-contract-candidate.md).

This design note stays dev-only. The consumer-facing skill is live only through
`frontend-workflow-kit/skills/e2e-agent/SKILL.md` and is wired as optional evidence
from `README.md`, Stage 00, Stage 08, and `doc-ownership.md`.

## Decision Summary

`e2e-agent` is an optional evidence workflow, not a new required workflow stage.
It translates existing workflow contracts into Playwright Test Agent context, then
uses the Playwright planner, generator, verifier, and healer surfaces only as far
as the current workflow stage and user request allow.

```txt
ScreenSpec / figma-component-mapping / testID guidance
  -> e2e-agent context packet
  -> Playwright planner/generator/healer where available
  -> tests/web evidence and verification notes
```

The skill does not make E2E a readiness fact, CI hard gate, Open Decision resolver,
or confirmed-status promotion path.

## Placement In The Workflow Spine

`e2e-agent` attaches beside existing stages. It does not insert a new stage.

| Existing stage | E2E agent behavior |
|---|---|
| Stage 05 - Author workflow contracts | `plan` only. Use ScreenSpec / visual contract context to draft a web test plan. |
| Stage 06 - Implement screen or code | `plan` or `generate` only when the user asks for web E2E evidence and the screen can run. |
| Stage 08 - Validate and report | `verify` existing tests and report evidence. |
| After Stage 08 / maintenance | `heal` only when the user asks to repair failing tests or accepts the proposed repair pass. |

Every session still ends through Stage 08. E2E evidence may be mentioned in the
handoff summary, but `workflow:validate` remains the structural validation command.

Stage 07 is intentionally skipped unless normal generated-view sources changed
(route, nav, catalog, codegen, lint, policy/layout). Web E2E test files are not
`generated/do_not_edit` derived views owned by Stage 07.

## Invocation Policy

Default behavior is opt-in.

Use this skill when the user asks for:

- "e2e", "Playwright", "web verification", "web evidence", "test plan",
  "generate web tests", "run web tests", or "heal failing Playwright tests".
- E2E coverage for a known Screen ID or current screen implementation.
- Verification evidence derived from ScreenSpec / visual mapping.

The agent may suggest this skill when a screen is current enough for web evidence,
but not running E2E must never block implementation completion or validate success.

## Coverage Policy

Default coverage is **shallow smoke**.

Shallow smoke covers:

- screen entry,
- one or two representative states,
- one primary CTA or navigation.

Use deep screen regression only when:

- the user explicitly asks for deep/full coverage,
- the screen is a core business path such as login, checkout, booking, redemption,
- the Interaction Matrix has meaningful branches,
- prior bug or drift evidence exists,
- an Open Decision has just resolved and added new scenarios.

Deep coverage maps State Matrix and Interaction Matrix rows more thoroughly, but
still excludes unresolved decisions.

## Modes

### `plan`

Create or refresh a Playwright web plan from workflow contracts.

Inputs:

- canonical Screen ID,
- ScreenSpec,
- optional `figma-component-mapping.md`,
- component catalog and testID / QA notes when relevant,
- Open Decisions and Unknowns for scenario exclusions.

Output:

```txt
tests/web-plans/{domain}/{screen-slug}.plan.md
```

The plan is not a ScreenSpec, VisualSpec, or product contract. It is a test
generation input and evidence draft.

`{screen-slug}` is a deterministic filesystem-safe rendering of the canonical
`screen_id` (lowercase, non-alphanumeric runs collapsed to `-`). The plan should
store the canonical `screen_id` and ScreenSpec path to prevent slug drift.

### `generate`

Use an approved plan and a running web surface to create Playwright tests.

Inputs:

- `tests/web-plans/{domain}/{screen-slug}.plan.md`,
- Playwright Test Agent setup in the consumer repo,
- seed test or entry URL,
- stable testID / accessibility locator strategy,
- preferably `final-fixture-ui` or higher readiness.

Output:

```txt
tests/web/{domain}/{screen-slug}.spec.ts
```

Generated tests are commit-worthy regression assets when reviewed. They remain
evidence, not source of truth.

This path is a consumer-owned E2E surface, not a readiness `allowed_paths` grant.
Product code fixes still go through Stage 06 path governance; creating new
`tests/web/**` files requires a user request or confirmation. A fixture-green web
test does not prove real integration correctness or native/mobile correctness.

### `verify`

Run existing Playwright web tests and report results as evidence.

Inputs:

- `tests/web/{domain}/{screen-slug}.spec.ts` or selected web suite,
- Playwright config / command,
- runnable web server.

Outputs:

- normal Playwright report / trace artifacts,
- run-report summary link, Stage 08 handoff text, or consumer-defined verification note.

Reports and traces are usually not committed; the workflow docs should retain
links or summaries only.

### `heal`

Use Playwright healer only after a failure is observed and the user wants a repair
pass.

Allowed scope:

- generated web test files and test helpers in the agreed test surface.

Review focus:

- assertion weakening,
- overly broad regex locators,
- `test.fixme()` additions,
- changes outside the test surface.

Healer changes are repair proposals. They do not confirm that the product is
correct.

## Preconditions

| Mode | Minimum preconditions |
|---|---|
| `plan` | canonical Screen ID, ScreenSpec exists, State Matrix or Interaction Matrix has useful content |
| `generate` | plan exists, web app can run, seed or entry URL exists, locator strategy exists, readiness preferably `final-fixture-ui` or higher |
| `verify` | tests exist, Playwright command/config exists, web server command is known |
| `heal` | failing test evidence exists, repair scope is limited to tests, user requested repair |

In `rough-fixture-ui`, prefer `plan` only. Allow only very shallow smoke generation
when the user explicitly wants it and the live surface is stable enough.

## Drift Handling

Do not silently rewrite tests to match current behavior just to get green.
Classify failures first:

| Finding | Handling |
|---|---|
| implementation appears to violate ScreenSpec | keep evidence red and report implementation fix target |
| ScreenSpec appears stale | report reconcile-input / ScreenSpec update candidate |
| visual-only mismatch | report to figma mapping / verification evidence / visual gap, not behavior |
| unclear ownership | raise or reference Open Decision / Verification note |
| declared testID missing | do not invent a new anchor; propose adding the declared anchor or updating ScreenSpec guidance |

The skill may raise blockers but does not close them.

## User Control Points

Allowed without extra confirmation when the user has invoked the skill:

- read readiness and workflow contracts,
- build the context packet,
- create a plan draft,
- run existing tests,
- report drift.

Require explicit user request or confirmation for:

- creating new `tests/web/**` files,
- large rewrites of existing tests,
- running healer,
- accepting `test.fixme()` or weakened assertions,
- adding CI, required checks, hard gates, or `--enforce` behavior.

## Future Implementation Notes

This draft deliberately stops before `e2e-index`, validate checks 14-16, or CI
smoke wiring. Those belong after real plan/test artifacts accumulate.

It also deliberately does **not** require a consumer-facing Verification Matrix.
That would need its own payload infrastructure first: reference doc, template,
path convention, and validation/packing tests. Until then, the live skill should
only mention run reports, Stage 08 handoff evidence, or consumer-defined
verification notes.

Future warning-first candidates:

- declared testID missing from implementation/tests,
- `test.fixme()` without linked Open Decision / conflict / verification note,
- missing `// spec:` / `// seed:` provenance in generated web tests,
- generated `e2e-index` mapping ScreenSpec handles to web/native evidence.
