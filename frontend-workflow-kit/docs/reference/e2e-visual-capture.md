# E2E Visual Capture

This reference defines the `e2e-agent` `capture` mode for advisory Expo Web
screenshot evidence. It records an observed web state for human review, usually
for Figma alignment, without turning screenshots into behavioral verification,
approval, readiness, native parity proof, or a CI gate.

## Purpose

Visual capture produces a screenshot artifact plus provenance for one canonical
screen/state pair on an Expo Web surface. The output helps a reviewer compare the
observed web rendering with a ScreenSpec, visual spec, Figma frame, or handoff
note.

The capture is evidence only. It is a Stage 08 handoff/runbook primitive that may
use Stage 05/06 context, not a workflow stage of its own.

## Non-goals

Visual capture must not:

- assign pass/fail or approval status;
- promote readiness or `confirmed`;
- resolve Open Decisions, Unknowns, or Component Gaps;
- add CI, required checks, hard gates, `workflow:validate` enforcement, or visual
  regression baselines;
- prove native/mobile parity;
- replace behavioral E2E assertions.

## Capture vs generate / verify

`generate` and `verify` are behavioral E2E modes. They plan, create, or run tests
that assert app behavior.

`capture` records an observed Expo Web state and enough provenance for a human to
judge the screenshot in context. A capture spec may use a minimal visibility
check to wait for the screen root, but that check is synchronization only. It is
not a visual approval assertion.

## Capture matrix

Maintain a capture matrix in the consumer runbook, screen note, or issue context
before writing screenshot specs. Each row should describe exactly one
screen/state pair.

| Field | Meaning |
|---|---|
| `screen_id` | Canonical Screen ID, never a raw source alias. |
| `domain` | Consumer domain folder used in test/artifact paths. |
| `screen_slug` | Lowercase slug derived from the canonical `screen_id`, unless the consumer already has a documented convention. |
| route or seed URL | Direct URL, deep link, seed URL, or journey setup entry. |
| `entry_context` | `direct-entry`, `journey-entry`, or `native-only`. |
| state name | Stable state label for the screenshot filename. |
| setup steps | Data seeding, auth, navigation, mocks, or user journey needed before capture. |
| expected chrome differences | Known header/back/close/shell differences caused by entry path or web runtime. |
| scoped capture root / locator | Stable screen/root test id or documented semantic root. |
| Playwright project / viewport | Project name, browser, device profile, or explicit viewport. |
| Expo/web command assumptions | Exact command, bundler, port behavior, overlays, and environment assumptions. |
| `E2E_RUN_ID` | Run-specific identifier used in artifact paths. |
| visual spec path | ScreenSpec, Figma mapping, design note, or visual contract path. |
| screenshot artifact path | Run output path for the PNG. |
| known Expo Web divergence | Notes about web-only layout, font, safe area, navigation, or platform divergence. |

Default spec path:

```txt
tests/web/screenshots/{domain}/{screen-slug}/{state}.visual.spec.ts
```

Default artifact path:

```txt
.playwright-results/${E2E_RUN_ID}/screenshots/{domain}/{screen-slug}/{state}.png
```

Screenshot artifacts are run outputs and should not be committed by default.

## Expo Router entry context

Classify entry context before capture:

- `direct-entry` - the screenshot starts from a URL, deep link, or seed page.
- `journey-entry` - the screenshot must be reached through local navigation steps
  so the navigation stack, header, back, close, modal, or shell state matches the
  intended user journey.
- `native-only` - the row should not produce an Expo Web screenshot spec because
  the judged behavior belongs to native/device automation.

Direct URL/deep-link entry may not reproduce the local Expo Router navigation
stack. Header, back, close, and modal chrome may require a journey setup path.
Missing back/close/header behavior is not product evidence unless the
`entry_context` matches the intended journey.

## Native boundary rubric

Mark the row `native-only` and escalate to Maestro/device automation when the
thing being judged is:

- native header, back, close, tab, or modal chrome behavior;
- safe area, status bar, keyboard, or system chrome;
- native modules or platform APIs;
- gestures or platform-specific transitions;
- platform-specific animations or timing;
- mobile parity itself.

Expo Web capture can support visual discussion, but it is never native/mobile
parity proof.

## Locator guidance

Capture a scoped screen/root locator by default, not the whole page. Prefer a
stable screen root test id such as `page.getByTestId('coupon-detail-screen')` or
a documented semantic root.

Avoid page-wide locators when Expo Router or React Native Web stack screens may
remain mounted in the DOM. A full page screenshot can include stale or hidden
stack content, overlays, dev chrome, or unrelated shell.

Do not silence ambiguous locators with `.first()`, `.nth()`, or `strict: false`.
Fix the contract by using a stable screen/root test id, a semantic root, or a
documented container scope.

## Screenshot guidance

Default to:

```ts
await root.screenshot({ path });
// or, when the capture matrix explicitly calls for the whole viewport:
await page.screenshot({ path });
```

Do not use `expect(page).toHaveScreenshot()` or
`expect(locator).toHaveScreenshot()` as the default. Those APIs create visual
comparison/baseline semantics, which this mode intentionally avoids.

Use `await expect(root).toBeVisible()` only as a minimal readiness check before
capturing. Do not treat it as visual approval.

## Expo runtime guidance

The consumer must define and verify the actual Expo Web command and port behavior
for its Expo SDK, CLI, and bundler. Do not assume native Metro `--port` semantics
apply to every web bundler.

Prefer production-like or stable web runs for screenshots. If a dev server is
used, document how dev overlays, warnings, inspector UI, Fast Refresh overlays,
or network error banners are suppressed or excluded. A screenshot with dev
chrome is still an observation, but it should not be presented as clean product
evidence without that note.

## Run isolation

Use per-run values:

- `E2E_PORT`
- `E2E_BASE_URL`
- `E2E_RUN_ID`

Keep artifacts under a run-specific uncommitted output directory:

```txt
.playwright-results/${E2E_RUN_ID}/screenshots/{domain}/{screen-slug}/{state}.png
```

Consumer `.gitignore` should exclude Playwright run artifacts such as
`.playwright-results/`, `test-results/`, `playwright-report/`, and trace/video
outputs unless the consumer explicitly documents a different artifact policy.

## Minimal capture procedure

1. Confirm canonical `screen_id`, `domain`, `screen_slug`, state name, and visual
   spec path.
2. Classify `entry_context` as `direct-entry`, `journey-entry`, or `native-only`.
3. If the row is `native-only`, do not write a web screenshot spec; route to
   device automation evidence instead.
4. Verify the Expo Web command, port, `E2E_BASE_URL`, viewport/project, and
   overlay behavior.
5. Choose a scoped screen/root locator and artifact path.
6. Write one visual capture spec for one screen/state pair, tagged `@visual`.
7. Run the spec explicitly by path, tag, or project and link/summarize the
   artifact in Stage 08 evidence.

Boundary reminder: a captured screenshot is advisory evidence only, never a gate,
approval, readiness promotion, `confirmed` promotion, or native parity proof.
