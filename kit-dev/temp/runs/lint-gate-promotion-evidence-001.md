# lint-gate-promotion-evidence-001

Date: 2026-06-18
Base: `main@fd894fb`
Branch: `verify/lint-gate-promotion-evidence`
Worktree: `C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\lint-gate-promotion-evidence`

## Scope

Gather evidence for the MVP-B lint-pack gate promotion decision after PR-5
warning-first CI smoke.

This report does not promote a hard gate. It does not remove
`continue-on-error`, does not make a required check, does not wire
`lint-baseline --enforce` in CI, and does not change
`eslint-workflow-config` from `planned` to `active`.

## Contract Inputs Read

- `frontend-workflow-kit/roadmap-current.md`
- `frontend-workflow-kit/docs/workflows/mvp-b.md`
- `frontend-workflow-kit/docs/workflows/lint-policy-rollout-ratchet.md`
- `frontend-workflow-kit/docs/workflows/lint-policy-catalog.md`
- `frontend-workflow-kit/temp/runs/lint-ci-gate-decision-001.md`
- `.github/workflows/frontend-workflow-kit.yml`
- `frontend-workflow-kit/catalog/artifact-manifest.yaml`
- `frontend-workflow-kit/skills/adapt-lint-pack/SKILL.md`

## Current Contract Summary

- PR-5 CI posture is warning-first smoke only:
  `npm run workflow:lint-gen -- --check` and
  `npm run workflow:lint-baseline -- --json`, both with
  `continue-on-error: true`.
- `lint-gen --check` is a generated config drift signal for the committed
  internal fixture output.
- `lint-baseline --json` is a ratchet report signal. Increases are reported but
  default process exit remains 0; only explicit `--enforce` exits 1 on an
  increase.
- `eslint-workflow-config` remains a planned generated artifact in
  `catalog/artifact-manifest.yaml`.
- `adapt-lint-pack` remains a proposal workflow for brownfield projects:
  scan -> map -> diff -> rollout -> propose. It must not run `lint-gen.mjs`,
  mutate lint config, or wire CI before human approval.
- Gate promotion still requires observed telemetry, brownfield dogfood results,
  explicit rationale, and a separate human-owned Open Decision.

## Environment Notes

Fresh worktree setup did not have `node_modules`.

```txt
Command: npm run workflow:lint-gen -- --check
Exit code: 1
Result: failed before script behavior could be observed because package `yaml`
        was not installed (`ERR_MODULE_NOT_FOUND` from scripts/lib/util.mjs).
```

Then dependencies were installed from the committed lockfile:

```txt
Command: npm ci
Exit code: 0
Result: added 1 package, audited 2 packages, 0 vulnerabilities.
```

Sandbox-only attempts that spawn child processes also failed before real test
behavior could be observed. The same commands passed when run with approved
process-spawn permissions; the approved results below are the evidence results.

## PR-5 Smoke Evidence

```txt
Command: npm run workflow:lint-gen -- --check
Exit code: 0

workflow:lint-gen — unchanged
  source docs/frontend-workflow/_meta/lint-policy.yaml
  output examples/lint-gen/basic-policy/eslint.workflow.config.mjs
  policies 3
```

Meaning:

- The internal `examples/lint-gen/basic-policy` generated config is byte-stable.
- This is a drift signal only. It does not prove repo-root generated-file guard
  readiness and does not justify changing `eslint-workflow-config` to `active`.

```txt
Command: npm run workflow:lint-baseline -- --json
Exit code: 0

{
  "ok": true,
  "status": "pass",
  "ratchet_policy_count": 1,
  "results": [
    {
      "policy_id": "no-fetch-in-screens",
      "baseline": 3,
      "current": 3,
      "delta": 0,
      "status": "pass",
      "target_severity": "error",
      "emitted_severity": "warn"
    }
  ],
  "enforce": false,
  "exit_code": 0,
  "mode": "warning-first",
  "policy_source": "docs/frontend-workflow/_meta/lint-policy.yaml",
  "counts_source": "docs/frontend-workflow/_meta/lint-counts.json"
}
```

Meaning:

- The PR-5 default fixture is currently a pass signal.
- The emitted lint severity for the ratchet policy is `warn`, even though the
  target severity is `error`; ratchet exit behavior belongs to
  `lint-baseline.mjs`.
- This remains report-only CI evidence because `enforce` is false.

## Ratchet Warning-First Witness

The `higher` fixture demonstrates the current non-blocking default behavior when
current counts exceed the committed baseline.

```txt
Command: node scripts/lint-baseline.mjs --docs examples/lint-baseline/higher/docs/frontend-workflow --json
Exit code: 0

status: increase
policy_id: no-fetch-in-screens
baseline: 3
current: 4
delta: 1
enforce: false
mode: warning-first
exit_code: 0
```

Local opt-in enforce witness:

```txt
Command: node scripts/lint-baseline.mjs --docs examples/lint-baseline/higher/docs/frontend-workflow --enforce --json
Exit code: 1

status: increase
policy_id: no-fetch-in-screens
baseline: 3
current: 4
delta: 1
enforce: true
mode: enforce
exit_code: 1
```

Meaning:

- Current behavior intentionally separates telemetry (`increase`) from blocking
  (`--enforce`).
- CI must continue to use the warning-first invocation until the promotion
  decision is made.

## Related Test Evidence

```txt
Command: node --test scripts/lib/lint-gen-core.test.mjs scripts/lib/lint-baseline-core.test.mjs
Exit code: 0
Result: 25 tests passed.
```

Relevant coverage:

- `workflow:lint-gen -- --check` package smoke supports the default fixture.
- `lint-gen --check` exits 0 for identical output and 1 for drift.
- Ratchet fixtures cover no-ratchet, equal/pass, lower/improvement,
  higher/increase warning-first, and higher/increase with `--enforce`.
- Policy/count contract failures fail closed.
- `no-fetch-in-screens` skips type-only axios imports and reports runtime
  imports.
- `defaults.paths` and include/exclude globs reject parent-directory escapes.

```txt
Command: npm test
Exit code: 0
Result:
  test-fixtures - PASS (27 fixtures: 26 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)
  node --test suite - 110 tests passed
```

## Promotion Telemetry Needed

Before choosing hard CI, required check promotion, or CI `--enforce`, collect:

- CI smoke history over multiple PRs/runs: command exit codes, durations,
  flakes, drift frequency, and whether failures are real contract drift or
  environment/setup noise.
- `lint-gen --check` drift details: changed bytes/line endings, policy source,
  output path, policy count, and whether drift came from manual generated-file
  edits, policy edits, generator nondeterminism, or platform-specific output.
- `lint-baseline --json` history: per-policy `baseline`, `current`, `delta`,
  `status`, `target_severity`, `emitted_severity`, `mode`, counts source, and
  ratchet policy count.
- Increase/improvement handling data: how often increases appear, whether they
  are accepted backlog movement, false positives, measurement bugs, or true
  regressions; how improvements should propose baseline updates without
  silently lowering committed baselines.
- Brownfield adapt-lint-pack dogfood reports: existing lint stack, package
  manager, lint/test/format scripts, CI lint commands, framework/styling stack,
  path-map confidence, policy diff (`already-covered`, `missing`,
  `contradictory`, `unsupported`, `unknown`), measured counts with method and
  confidence, conflict report, approval dependencies, and rollout plan.
- Human approval evidence for any policy weakening, safety policy downgrade, or
  ratchet baseline adoption that needs a `decision_id`.
- Repo-root generated-file guard readiness for `eslint.workflow.config.mjs`:
  banner/header convention, root path handling, generated artifact comparison,
  and false-positive rate.

## Decision Draft

Open Decision candidate: lint-pack CI gate promotion after PR-5 smoke.

Options:

| Option | Meaning | Evidence status |
|---|---|---|
| no CI | Remove or avoid CI smoke and keep local/package-script checks only. | Still valid fallback, but PR-5 smoke is already stable on current internal fixtures. |
| warning-first CI smoke | Keep current PR-5 posture with `continue-on-error`, `lint-gen --check`, and `lint-baseline --json`. | Supported by this internal evidence. |
| hard CI | Remove non-blocking behavior, make a required check, or run `lint-baseline --enforce` in CI. | Not supported yet; requires telemetry and brownfield dogfood evidence above. |

Current recommendation: keep warning-first CI smoke and mark decision pending.

## Explicit Non-Changes

- No CI workflow edits.
- No `continue-on-error` removal.
- No required check promotion.
- No CI use of `lint-baseline --enforce`.
- No `artifact-manifest.yaml` promotion from `planned` to `active`.
- No `adapt-lint-pack` behavior change.
- No Open Decision resolved or closed.
- No Tier2 codegen or Interaction Matrix work started.

## Verification Commands

```txt
npm ci
npm run workflow:lint-gen -- --check
npm run workflow:lint-baseline -- --json
node scripts/lint-baseline.mjs --docs examples/lint-baseline/higher/docs/frontend-workflow --json
node scripts/lint-baseline.mjs --docs examples/lint-baseline/higher/docs/frontend-workflow --enforce --json
node --test scripts/lib/lint-gen-core.test.mjs scripts/lib/lint-baseline-core.test.mjs
npm test
```
