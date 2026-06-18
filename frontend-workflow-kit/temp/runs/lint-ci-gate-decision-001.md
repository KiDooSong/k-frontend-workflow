# lint-ci-gate-decision-001

Date: 2026-06-18
Branch: `codex/lint-ci-gate-decision-pr5`
Worktree: `/private/tmp/k-frontend-workflow-lint-ci-gate-decision`

## Scope

MVP-B lint-pack PR-5 smoke wiring: put `lint-gen.mjs` and
`lint-baseline.mjs` on CI as warning-first signals after PR-4 added the
warning-first ratchet runner.

This is **not** the evidence-based gate promotion decision from
`temp/proposals/lint-pack-design-refresh.md`. That later decision still needs
observed telemetry and brownfield dogfood results.

## Inputs Checked

- `workflow:lint-gen` runs the basic-policy fixture and supports `--check`.
- `workflow:lint-baseline` runs the equal ratchet fixture and supports `--json`.
- PR-4 test surface is stable: `npm test` passes `test-fixtures` and the node test suite.

## Evidence Boundary

- Fixture smoke and package tests are enough to add non-blocking CI smoke.
- They are **not** enough to promote a lint-pack gate.
- Required check promotion, `lint-baseline --enforce`, and hard CI remain blocked
  on observed telemetry, brownfield dogfood results, explicit rationale, and a
  separate Open Decision.

## Options

| Option | Meaning | Current stance |
|---|---|---|
| no CI | Keep lint-pack checks manual/package-script only. | Valid fallback. This PR moves one notch beyond it by adding non-blocking smoke only. |
| warning-first CI smoke | Run `npm run workflow:lint-gen -- --check` and `npm run workflow:lint-baseline -- --json` with `continue-on-error`. | **Wired in this PR.** Starts CI smoke signals without changing merge eligibility. |
| hard CI | Make lint-pack failures block PRs, wire `lint-baseline --enforce`, or require the check. | Deferred. Requires telemetry, explicit rationale, and a separate Open Decision. |

## Changes

- Added two GitHub Actions steps to `.github/workflows/frontend-workflow-kit.yml`:
  - `lint-pack generated config drift (warning-only)`
  - `lint-pack ratchet baseline (warning-only)`
- Both steps use `continue-on-error: true`.
- Updated README, roadmap, MVP-B notes, and lint workflow docs to mark PR-5 as warning-first CI smoke wiring, not a completed promotion decision.

## Explicit Non-Changes

- No hard CI gate.
- No required check promotion.
- No `lint-baseline --enforce` in CI.
- No `eslint-workflow-config` manifest status change; it remains `planned`.
- No existing ESLint/Biome/Prettier config overwrite.
- No `adapt-lint-pack` change; it still waits for human approval before any `lint-gen.mjs` execution.
- No Tier2 codegen adapter work.

## Verification

```txt
npm run workflow:lint-gen -- --check
PASS: workflow:lint-gen — unchanged
```

```txt
npm run workflow:lint-baseline -- --json
PASS: status=pass, mode=warning-first, exit_code=0
```

```txt
npm test
PASS: test-fixtures — PASS (27 fixtures: 26 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)
PASS: node --test suite, 91 tests passed
```

```txt
git diff --check
PASS
```
