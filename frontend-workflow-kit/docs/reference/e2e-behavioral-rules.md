# E2E Behavioral Rules

Consumer reference for the behavioral rules the `e2e-agent` applies across its
modes — `plan`, `generate`, and `verify`/review (and `heal`). They are read each
mode and folded into the work, not background reading. These are quality rules,
not setup. For Playwright Test Agents setup, MCP wiring, the path
model, and the output-path Kit Mapping, see
[e2e-playwright-agents.md](e2e-playwright-agents.md) (read once, at setup). The
non-gating boundary is owned by [Stage 08](workflow-stages/08-validate-and-report.md)
and the [e2e-agent skill](../../skills/e2e-agent/SKILL.md).

**A passing test is necessary, not sufficient.** A faithful generator encodes
whatever the plan says, so a weak plan assertion becomes a green-but-inert test.
The precision gate therefore lives at **plan and review time**, not in codegen.
Every rule below was confirmed live in run `e2e-agent-real-mcp-001` (a 2×2
planner×generator dogfood against a Coupons app); community practice — cited
inline, from repos/blogs/QA writing, not the official docs — corroborates and
extends each one.

## How the agent uses this

The rules are read each mode and folded into the context the agent hands to the
Playwright tools — not left as background reading.

| Mode | Apply the rules by |
|---|---|
| `plan` | Folding §A/§B into the planner context packet so scenarios target app-defined state from the start, and applying §C (depth is the planner's job). |
| `generate` | Injecting §A/§B as standing rules in the generator prompt (direct **or** delegated subagent). In the dogfood, pre-injecting the row-scoping rule (§B1) pre-empted the strict-mode failure the un-primed path hit on its first run. |
| `verify` / review | Running the [Review checklist](#review-checklist) as the adoption gate before any test is kept — generators are *faithful, not critical*, so the critique must happen here. |

These are quality rules only. They do not add CI, gates, readiness promotion, or
`confirmed` status (see [Boundaries](#boundaries)).

## A. Assertion hygiene

### A1. Assert app-defined state, not browser artifacts

Assert what the application sets: class, text, visibility, attribute, URL, or the
status/region text the app actually renders. Do **not** assert `focus`,
`:active`, or `document.activeElement` unless focus management is the feature
under test — those are browser artifacts, not app behavior.

```ts
// ✗ plan said the Copy button "gains the active state"; the app sets no active
//   class, so this only checks that focus landed on the just-clicked button.
await copyBtn.click();
await expect(copyBtn).toBeFocused();

// ✓ assert the state the app actually changes
await copyBtn.click();
await expect(page.getByTestId('status')).toHaveText('Copied WELCOME10 to clipboard');
```

- **Evidence (live):** the agent plan asserted a button "gains the active state";
  the Coupons app has no active class, so both generators encoded it as
  `toBeFocused()`. 17/17 green did **not** validate those ~7 assertions.
- **Evidence (community):** a test that performs actions without verifying real
  outcomes "is not really a test, it's just a script."
  [elaichenkov — 17 Playwright mistakes](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/)

### A2. Drop any assertion that passes independent of app logic

If an assertion would pass whether or not the handler does anything, it is inert:
it adds maintenance and false coverage (best case tautological, worst case flaky
on headless/CI). The canonical example is `toBeFocused()` immediately after
`.click()` — clicking a control typically moves browser focus onto it, so the
assertion passes regardless of what the handler does (and the focus behavior can
itself differ across browsers). Remove it, or replace it with a check of real app
state (§A1).

- **Why this is a *review* rule:** generators are faithful, not critical — they
  freeze a weak plan line into green. The reviewer, not the generator, must catch
  these.
- **Evidence (community):** AI/LLM generators that infer expected behavior from
  the code under test and keep only tests that pass on the current
  implementation **validate bugs instead of finding them** — one study measured
  up to ~68% of a tool's final suite passing on buggy code while failing on the
  correct implementation. Asserting "whatever the code currently does" is the
  dominant documented failure mode of generated tests.
  [arXiv 2412.14137](https://arxiv.org/html/2412.14137v1) ·
  [arXiv 2410.21136](https://arxiv.org/html/2410.21136v1)

### A3. Use web-first (auto-retrying) assertions

Pass the **locator** to `expect()` and use a web-first matcher
(`toBeVisible()`, `toHaveText()`, `toHaveClass()`, …). Never wrap an awaited
locator instance method in `expect()` — that resolves once, with no retry, and
passes or fails on timing luck.

```ts
// ✗ one-shot read: races the app's update
expect(await page.getByTestId('status').textContent()).toBe('Applied SAVE20');

// ✓ auto-waits/polls until the condition holds (or times out)
await expect(page.getByTestId('status')).toHaveText('Applied SAVE20');
```

- **Evidence (community):** codified as an enforceable, auto-fixable lint rule —
  `eslint-plugin-playwright`'s `prefer-web-first-assertions`, in the plugin's
  recommended config. See [§D](#d-optional-enforcement).
  [rule docs](https://github.com/mskelton/eslint-plugin-playwright/blob/main/docs/rules/prefer-web-first-assertions.md)

### A4. Every scenario verifies at least one outcome

A plan scenario with steps but no observable expectation is a script, not a test.
Each scenario must end in at least one app-state assertion (§A1). The planner
owns this: a step list with no `expect:` line is an incomplete scenario.

## B. Locator hygiene

### B1. Scope a repeated row by a stable container, not a shared attribute

For repeated rows/list-items, scope the target through a stable container, not
through an attribute the row's children also carry. If the View/Copy/Apply
buttons repeat the row's `data-coupon-id`, then `[data-coupon-id="X"]` matches
the row **and** its three buttons.

```ts
// ✗ matches the <li> AND its 3 buttons → strict-mode violation (4 elements)
page.locator('[data-coupon-id="WELCOME10"]')

// ✓ anchor on the row container, then reach the control inside it
page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]')
    .getByTestId('apply-button')
```

When a semantic container scope is available, prefer it; chain/filter rather than
index by position:

```ts
// ✓ user-first: filter a stable container, then the control
page.getByRole('listitem').filter({ hasText: 'Welcome 10%' })
    .getByRole('button', { name: 'Apply' })
```

- **Evidence (live):** the un-primed (direct) generator hit exactly this — its
  first run failed with a 4-element strict-mode violation on
  `[data-coupon-id="WELCOME10"]`; narrowing to
  `[data-testid="coupon-item"][data-coupon-id=…]` made it 17/17. The primed path
  never hit it because the rule was injected up front.
- **Evidence (community):** disambiguate repeated items by chaining/filtering a
  stable container (`getByRole('listitem').filter({ hasText }).getByRole('button')`)
  rather than positional `.nth()`; fall back to a record-specific
  `data-testid` (e.g. `getByTestId('project-delete-42')`) when semantic scoping
  is not viable.
  [Checkly — user-first selectors](https://www.checklyhq.com/blog/playwright-user-first-selectors/) ·
  [WebCrawler — fix strict-mode violation](https://webcrawlerapi.com/glossary/playwright/how-to-fix-strict-mode-violation-locator)

### B2. Treat a strict-mode multi-match as a signal, not noise

When a locator used in a single-element action or assertion (`click`, `fill`,
`toHaveText`, …) matches more than one element, Playwright fails loudly rather
than guessing — strict mode (multi-element APIs like `count()` / `all()` are
intentionally exempt). That failure is desirable: **fix the selector** (scope it
— §B1); do not silence it with `.first()` / `.last()` / `.nth()` /
`strict: false`. Failing on an ambiguous selector is better than silently
asserting against the wrong element.
[Treymack — debugging strict-mode violations](https://www.treymack.com/blog/debugging-playwright-strict-mode-violations/)

### B3. Prefer user-first locators; use test-ids for record-specific targeting

Rank selectors least-to-most robust: generic tag → CSS class → test-id → role/
label/text → scoped/chained. Prefer user-first locators (`getByRole`,
`getByText`, `getByLabel`): they emulate how a user finds an element and survive
class/structure refactors. A style-only class rename should never fail a test —
a CSS-class selector that breaks on it is a false positive. Use `getByTestId`
for stable, record-specific targeting (the row-scope anchor in §B1), not as the
default for everything.
[Checkly — user-first selectors](https://www.checklyhq.com/blog/playwright-user-first-selectors/)

### B4. Make text matches exact when identity matters

`getByText('Submit')` uses case-insensitive, whitespace-normalized substring
matching by default, so it also matches `Submit Order` and `Submitting…`. Use
`{ exact: true }` when the text identifies the element, to avoid silent
mis-selection or a strict-mode error.
[elaichenkov — 17 Playwright mistakes](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/)

## C. Division of labor — coverage ⇐ planner, style/cost ⇐ generator

Coverage is set by the **planner**, not the generator. Invest in a deeper plan
for more state-transition / side-effect scenarios; choose the generator (direct
MCP vs delegated subagent) for **style and cost**, not for pass rate.

- **Evidence (live):** the agent planner found 3 real behaviors the direct
  planner missed — View clears the status, Apply accumulates per coupon, Back
  resets all applied state — taking the plan from 5 → 17 scenarios, each verified
  against the app source. Across the 2×2 matrix, generator choice changed only
  line count / token cost / locator style; **all four combinations were green**.
- **Corollary (grounds §A2):** depth must come from independent reasoning about
  intended behavior, not from mirroring the implementation. A generate-then-keep-
  only-passing loop reinforces existing bugs (§A2 evidence), so the planner
  grounds scenarios in the ScreenSpec/requirements and the reviewer (§A1/§A2)
  filters inert assertions — *not* the generator.

## D. (Optional) Enforcement

These rules are applied by the agent at generate/review time; a consumer repo may
additionally back §A3 (and related assertion smells) with
[`eslint-plugin-playwright`](https://github.com/mskelton/eslint-plugin-playwright)
(`prefer-web-first-assertions` is in the recommended config and auto-fixable).
This is optional tooling, not a kit-mandated gate.

## Review checklist

Run before adopting any generated set (the §A2 critique the generator will not do):

- [ ] Every assertion checks app-defined state — no `toBeFocused()` /
      `:active` / `document.activeElement` unless focus is the feature (§A1).
- [ ] No assertion passes independent of app logic; none is tautological with the
      implementation (§A2).
- [ ] Assertions are web-first (locator passed to `expect`, not an awaited
      instance method) (§A3).
- [ ] Every scenario verifies at least one outcome (§A4).
- [ ] Repeated rows are scoped by a stable container, not a child-shared
      attribute; no positional `.nth()` standing in for a real scope (§B1).
- [ ] No strict-mode match is silenced with `.first()`/`.nth()`/`strict:false`
      (§B2).
- [ ] Coverage gaps are fixed in the **plan**, not papered over in codegen (§C).

## File packaging

Generated tests live in a **folder per screen** —
`tests/web/{domain}/{screen-slug}/<suite>.spec.ts`, holding the 1..N suite files
the planner produces for that screen (it emits `**File:**` per test but reuses
one filename per suite). This is unconditional: a single-suite screen is still a
folder with one file, so the shape never changes as suites are added. The
convention is owned by
[e2e-playwright-agents.md → Kit Mapping](e2e-playwright-agents.md#kit-mapping) and
mirrored in the [e2e-agent skill](../../skills/e2e-agent/SKILL.md#output-paths).
A planner "suite" that is actually a distinct canonical screen is routed to its
own `screen-slug` ([screen-identity.md](screen-identity.md)), not nested as a
suite.

## Boundaries

These are behavioral / quality rules. They do not add CI, hard gates, readiness
promotion, Open Decision resolution, Unknown closure, Gap acceptance, or
`confirmed` promotion. Playwright E2E remains optional evidence
([Stage 08](workflow-stages/08-validate-and-report.md)).
