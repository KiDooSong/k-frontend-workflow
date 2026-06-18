# Lint Policy Rollout And Ratchet

> MVP-B lint-pack adoption contract. PR-2 adds `lint-gen.mjs` for deterministic
> ESLint flat-config fragment emission; PR-3 adds `skills/adapt-lint-pack` for
> brownfield scan/propose adoption; PR-4 adds `lint-baseline.mjs` for
> warning-first ratchet comparison; PR-5 adds warning-first CI observation.
> Hard CI gate promotion remains future work.

## Canonical Source

The only canonical project policy path is
`docs/frontend-workflow/_meta/lint-policy.yaml`. Consumers start from
`templates/meta/lint-policy.template.yaml` and validate against
`schemas/lint-policy.schema.json`.

That schema requires a real JSON Schema draft-07 validator before it is wired
into any CI path. The PR-2 `lint-gen.mjs` skeleton performs its own fail-closed
operational validation for the supported subset. The repo's existing
`scripts/lib/schema.mjs` helper is intentionally limited to the
`frontmatter.schema.json` subset and does not enforce the draft-07 features used
here, including `$ref`, `allOf`, `if`/`then`/`else`, `not`,
`additionalProperties`, `minLength`, `minimum`, and `pattern`.

The PR-2 generator flow is:

```txt
docs/frontend-workflow/_meta/lint-policy.yaml
  -> lint-gen.mjs
  -> eslint.workflow.config.mjs
```

`eslint.workflow.config.mjs` is generated at repo root as an ESLint flat-config
fragment, not a standalone replacement for project ESLint config. The manifest
keeps `eslint-workflow-config` as `status: planned` until repo-root
generated-file guard support lands, so a missing generated file remains
must-not-fail.

The PR-4 baseline runner flow is:

```txt
docs/frontend-workflow/_meta/lint-policy.yaml
  + docs/frontend-workflow/_meta/lint-counts.json
  -> lint-baseline.mjs
  -> warning-first ratchet report
```

The counts file is an input snapshot of current measured violations:

```json
{
  "version": 1,
  "counts": {
    "no-fetch-in-screens": 3
  }
}
```

PR-4 does not run ESLint or update baselines. It validates the policy and count
contracts, reports pass/increase/improvement, exits 0 by default on increases,
and exits 1 on increases only with `--enforce`.

PR-5 wires CI only as warning-first observation:

```txt
lint-gen --check       -> generated config drift signal
lint-baseline --json   -> ratchet report signal
```

Both CI steps must remain non-blocking (`continue-on-error` or an equivalent
report-only wrapper). CI must not use `lint-baseline --enforce`, remove
`continue-on-error`, make a required check, or promote `eslint-workflow-config`
to an active generated artifact without a separate Open Decision.

## CI Gate Options (PR-5 Decision)

| Option | Behavior | Decision |
|---|---|---|
| no CI | Keep `lint-gen`/`lint-baseline` runnable only through package scripts and local/manual verification. | Valid fallback, but not selected because PR-4 fixtures and package smoke are stable enough for non-blocking CI observation. |
| warning-first CI | Run `workflow:lint-gen -- --check` and `workflow:lint-baseline -- --json` in CI with `continue-on-error` or equivalent non-blocking behavior. | **Selected for PR-5.** Logs drift/ratchet signals without changing merge eligibility. |
| hard CI | Remove non-blocking behavior, wire `lint-baseline --enforce`, make the check required, or otherwise fail PRs on lint-pack signals. | **Deferred.** Requires telemetry, explicit rationale, and a separate Open Decision. |

## Rollout Modes

| Rollout | Baseline | Intended use |
|---|---|---|
| `all` | forbidden | Default mode. Use when the policy can run across the project immediately, often with `severity: warn` in brownfield projects. |
| `ratchet` | required non-negative integer | Brownfield adoption mode for existing violations. The baseline records the current accepted count; future work must not increase it. |

`new-code-only` is not a v1 rollout mode. It remains reserved until an Open
Decision defines whether "new code" means changed files, changed lines, base-ref
diffs, creation date, ownership, or another rule.

## Ratchet Semantics

For policies using `rollout: ratchet`, the baseline comparison owns pass/fail
semantics:

- `current <= baseline`: pass.
- `current > baseline`: ratchet increase.
- `current < baseline`: improvement; only an explicit update mode may lower the
  committed baseline.
- A missing baseline for a ratchet policy is invalid.
- A baseline on `rollout: all` is invalid.

The default is warning-first: report increases without breaking CI unless
`--enforce` is selected. Raw ESLint `error` output must not bypass the ratchet
contract; `lint-baseline.mjs` owns exit behavior for ratchet policies.

## Adoption Procedure

Greenfield projects should begin with the catalog defaults and `rollout: all`
when measured violations are zero. Keep CI warning-first until a separate gate
promotion decision chooses otherwise.

Brownfield projects should use `skills/adapt-lint-pack` as a proposal workflow
before generation:

1. Scan existing lint tools, package scripts, presets, CI commands, styling
   stack, and architecture paths.
2. Map `defaults.paths` from `frontend-architecture.md` or mark inferred paths as
   candidates.
3. Diff catalog policies against existing config. Already-covered rules can be
   proposed as disabled with a reason; contradictory rules stop as conflicts.
4. Measure candidate violations report-only.
5. Propose `rollout: all` with `severity: warn|error`, or `rollout: ratchet`
   with `baseline` and `reason`.
6. Wait for human approval before running any future generator.

PR-3 fixes the skill output contract as: lint adaptation report,
`docs/frontend-workflow/_meta/lint-policy.yaml` draft, conflict report,
measured counts, and rollout plan. This is a report/draft contract only; it does
not run `lint-gen.mjs`, mutate existing lint config, wire CI, or lower a
human-owned gate.

## Weakening And Approval

Disabled policy, severity downgrade, and `rollout: ratchet` each require
`reason`. Safety-tier disable/downgrade also requires a human-owned
`decision_id`. This records the approval dependency only; agents must not resolve
or close Open Decisions as part of lint-pack adoption.

Style policies may be disabled for a documented local convention. Architecture
policies may tune paths or rollout, but disabling them should normally reference
an Open Decision. Safety policies must not be weakened without that explicit
human-owned decision reference.
