# lint-baseline-001

Date: 2026-06-18
Branch: `codex/lint-baseline-ratchet`
Worktree: `.claude/worktrees/lint-baseline-ratchet`

## Scope

Implemented MVP-B lint-pack PR-4: `lint-baseline.mjs` ratchet runner and fixtures.

## Changes

- Added `scripts/lint-baseline.mjs`.
- Added `scripts/lib/lint-baseline-core.mjs` and `scripts/lib/lint-baseline-core.test.mjs`.
- Added `examples/lint-baseline/` fixtures for:
  - no ratchet policies
  - equal baseline/current
  - current lower than baseline
  - current higher than baseline
  - missing baseline
  - malformed policy YAML
  - unknown policy id in policy
  - unknown policy id in counts
- Added `workflow:lint-baseline` package aliases for the kit and consumer template.
- Updated README/roadmap/workflow docs to mark PR-4 complete and PR-5 CI/gate promotion as remaining.

## Contract

- `current <= baseline`: pass.
- `current > baseline`: increase.
- `current < baseline`: improvement.
- Default mode is warning-first: increases report `status: increase` but exit `0`.
- `--enforce` exits `1` on increases.
- Missing baseline, malformed policy, unknown policy id, malformed counts, and missing current counts for ratchet policies are contract failures.

## Explicit Non-Changes

- No PR-5 CI/gate promotion.
- No hard CI gate wiring.
- `eslint-workflow-config` manifest status remains `planned`.
- `adapt-lint-pack` still does not run `lint-gen.mjs` before human approval.
- Existing ESLint/Biome/Prettier settings and package lint scripts were not overwritten.
- Tier2 codegen adapter and Interaction Matrix telemetry were not touched.

## Verification

```txt
cd frontend-workflow-kit && npm test
PASS: test-fixtures — PASS (27 fixtures: 26 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)
PASS: node --test suite, 90 tests passed
```

```txt
git diff --check
PASS
```

```txt
npm run workflow:lint-baseline -- --json
PASS: equal fixture reports status=pass, exit_code=0

node scripts/lint-baseline.mjs --docs examples/lint-baseline/higher/docs/frontend-workflow --json
PASS: higher fixture reports status=increase, exit_code=0

node scripts/lint-baseline.mjs --docs examples/lint-baseline/higher/docs/frontend-workflow --enforce --json
PASS: higher fixture reports status=increase, exit_code=1
```
