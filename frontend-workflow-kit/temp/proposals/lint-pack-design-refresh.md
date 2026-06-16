# Lint-pack / adapt-lint-pack design refresh

> Status: DESIGN / SPEC ONLY. 2026-06-16.
> This document refreshes the MVP-B lint-pack plan against the current kit state.
> It does not implement `lint-gen.mjs`, `lint-baseline.mjs`, package scripts, CI,
> or `eslint.workflow.config.mjs`.

## Source Documents Read

- `frontend-workflow-kit/roadmap-current.md`
- `frontend-workflow-kit-implementation.md` §9, §10, `### MVP-B: lint-policy 적응`
- `frontend-workflow-skillpack-concept.md` lint-pack / lint-policy / adapt-lint-pack / rollout-ratchet sections
- `frontend-workflow-kit/catalog/artifact-manifest.yaml` `eslint-workflow-config` planned entry
- `frontend-workflow-kit/docs/workflows/mvp-b.md`

## Current Kit State

- `lint-gen.mjs` and `lint-baseline.mjs` are not implemented.
- `workflow:lint-gen` and `workflow:lint-baseline` are not live kit scripts; they are still roadmap entries in `package-scripts.template.json`.
- `artifact-manifest.yaml` contains `eslint-workflow-config` only as `status: planned`, with output path `eslint.workflow.config.mjs`.
- MVP-B Phase 0 shipped other warning-first or hard surfaces, but `lint-gen` / `lint-baseline` remain explicitly classified as proposal-only.
- `eslint.workflow.config.mjs` is a repo-root generated artifact, not a `docs/frontend-workflow/**` artifact. The existing generated-file validation history has a docs-prefix blind spot for this path, and the current check-generated surface skips planned artifacts. A lint-gen PR must not pretend this root file is already protected.

## Refreshed MVP-B Goal

MVP-B lint-pack is not a drop-in ESLint config that overwrites a project's lint setup.

The canonical policy file path is `docs/frontend-workflow/_meta/lint-policy.yaml`.
The model is:

```txt
docs/frontend-workflow/_meta/lint-policy.yaml
  ->  lint-gen.mjs
  ->  eslint.workflow.config.mjs
```

`docs/frontend-workflow/_meta/lint-policy.yaml` is the human-approved policy
source. `eslint.workflow.config.mjs` is generated and must not be hand-edited.
Existing ESLint config remains owned by the project; workflow lint config is
composed after it, append-only.

This keeps lint-pack inside the existing workflow gates. It is the same concept as
the roadmap's `lint-gen/lint-baseline(MVP-B)`, not a new independent artifact axis.

## Greenfield vs Brownfield

Greenfield:

- Prefer the kit flat-config preset once the schema and generator exist.
- Start enabled workflow policies with `rollout: all` when violation count is zero.
- Still generate `eslint.workflow.config.mjs`; do not ask users to edit it by hand.
- Keep CI warning-first until a separate gate decision promotes it.

Brownfield:

- Assume an existing ESLint/Biome/Prettier/CI setup and existing violation backlog.
- Never overwrite or reorder existing project config.
- Use `adapt-lint-pack` to propose policy changes before any generation.
- Prefer `warn` or `ratchet` for noisy policies.
- Treat `new-code-only` as a reserved rollout candidate until its Open Decision is closed.

## adapt-lint-pack Procedure

`adapt-lint-pack` should be a proposal workflow, not an auto-migration.

1. Scan
   Detect lint tool and version, flat config vs eslintrc, Biome/Prettier, installed plugins, package manager, monorepo layout, CI lint commands, framework presets, and styling stack.

2. Map
   Read `frontend-architecture.md` for layer paths and build `defaults.paths`. If architecture docs are missing or incomplete, infer from code only as `confidence: candidate`.

3. Diff
   Compare kit policies with existing config:
   - already covered: propose `enabled: false` with `reason` naming the existing rule
   - contradictory: emit a conflict report and stop short of overriding
   - missing: mark as adoption candidate

4. Rollout
   Run report-only measurement per candidate policy. Recommend `all`, `warn`, or `ratchet` based on current violation count and policy tier. Mention `new-code-only` only as a reserved future option until its definition is resolved.

5. Propose
   Output a `docs/frontend-workflow/_meta/lint-policy.yaml` draft, conflict report, measured counts, and rollout plan. Do not run `lint-gen.mjs` until a human approves the proposal.

## lint-policy.yaml Schema Draft

Canonical location: `docs/frontend-workflow/_meta/lint-policy.yaml`.
PR-1 must align the schema/template docs, manifest source path, generator input,
and generated-file banner text to this path in one slice.

Required top-level fields:

```yaml
version: 1
defaults:
  paths:
    screens: src/features/*/screens
    api: src/api
    ui: src/components/ui
policies: {}
```

Policy entry rules:

- `enabled` is required for every known policy.
- `severity` is required when `enabled: true`; enum: `off | warn | error`.
- `rollout` is required when `enabled: true`; v1 enum: `all | ratchet`.
- `new-code-only` is reserved and must not be schema-valid until its definition Open Decision is closed.
- `reason` is required when a policy is disabled, severity is downgraded from the tier default, rollout is not `all` in greenfield, or implementation deviates from `auto`.
- `baseline` is required only for `rollout: ratchet`; it must be a non-negative integer and must not be present for other rollout modes.
- `tier` belongs to the policy catalog (`safety | architecture | style`). If mirrored into `docs/frontend-workflow/_meta/lint-policy.yaml`, validation must ensure it matches the catalog; users must not be able to change a policy's tier through project policy.
- Safety policies cannot be disabled or downgraded without an explicit human-owned decision reference.
- Architecture policies may adjust paths or rollout; disabling requires `reason` and usually an Open Decision reference.
- Style policies may be disabled when they conflict with local convention, but the reason must record the convention.

Optional fields for PR-1 consideration:

- `implementation`: `auto | eslint-boundaries | dep-cruiser | eslint-restricted-imports`
- `include` / `exclude`: sorted globs, project-root relative
- `decision_id`: human-owned approval when the policy is weakened
- `measured`: read-only report data should stay out of the canonical policy unless `lint-baseline.mjs` owns the update path

## lint-gen.mjs Contract

Inputs:

- `docs/frontend-workflow/_meta/lint-policy.yaml`
- workflow policy catalog docs
- project architecture paths, primarily from `frontend-architecture.md` or `defaults.paths`
- existing lint config discovery, read-only, to compose after the project config

Output:

- repo-root `eslint.workflow.config.mjs`

Exit codes:

- `0`: policy parsed and output written, or output was already byte-identical
- `1`: expected contract failure, such as schema-invalid policy, unsupported enabled policy implementation, or an append/composition conflict
- `2`: invocation, filesystem, or toolchain error

Determinism:

- stable policy ordering by `policy_id`
- stable glob and path ordering
- no timestamps, random temp paths, machine-local absolute paths, or environment-dependent comments
- normalized line endings in emitted text
- `enabled: false` policies are omitted from emitted ESLint rules

Append-only / existing-config contract:

- Do not overwrite `eslint.config.*`, `.eslintrc*`, Biome config, Prettier config, or package lint scripts.
- For flat config, generated output should compose the detected project config first and append workflow rules after it.
- For eslintrc or non-ESLint projects, either generate through an explicit compatibility strategy or fail/propose; do not silently replace the toolchain.
- The generated file must include a JS generated-file banner that points back to `docs/frontend-workflow/_meta/lint-policy.yaml` and says not to edit the output directly.

Emit severity vs policy severity:

- For `rollout: all`, emitted ESLint severity may match policy `severity`.
- For `rollout: ratchet`, generated ESLint rules must run in report-only/warn mode by default, even when policy `severity: error` records the target severity. `lint-baseline.mjs` owns the exit decision.
- Do not wire raw `eslint` execution as a hard CI gate for ratchet policies; otherwise ESLint `error` output can bypass the warning-first ratchet contract.
- If a future implementation chooses a separate runner that absorbs ESLint exit codes and reads formatter output, that runner becomes part of the ratchet contract and must have fixtures before CI wiring.

## lint-baseline.mjs Ratchet Contract

Ratchet compares committed baseline counts with current measured counts for policies using `rollout: ratchet`.

Recommended behavior:

- `current <= baseline`: pass.
- `current > baseline`: ratchet increase.
- `current < baseline`: report improvement; only a dedicated write/update mode may lower baseline.
- Rebaseline may lower counts automatically when explicitly requested, but must not increase counts without human approval.

Exit code candidates:

- warning-first default: print increases as warnings and exit `0`; `--enforce` exits `1` on increases.
- hard default: exit `1` on any increase from day one.

Recommendation: start warning-first by default. This matches MVP-B Phase 0 posture and avoids making a noisy brownfield adoption fail CI before telemetry. Hard gating should be a later decision after fixtures and at least one brownfield dogfood run.

When ratchet is warning-first, baseline comparison controls the process exit. ESLint
rule severity alone must not decide the exit for ratchet policies.

`lint-baseline.mjs` should have fixtures that cover:

- no ratchet policies
- equal baseline/current
- current lower than baseline
- current higher than baseline
- missing baseline for a ratchet policy
- malformed or unknown policy IDs

## Repo-root Generated File Guard

`eslint.workflow.config.mjs` is unusual for this kit because it is generated at repo root. Existing docs-prefix-oriented validation cannot be the only protection.

Before `eslint-workflow-config` is treated as active and guarded:

- define the JS generated banner emitted by `lint-gen.mjs`
- resolve manifest paths from project root, not by assuming `docs/frontend-workflow/`
- make planned/missing generator states must-not-fail
- keep any generated-file guard warning-first until a separate promotion decision
- avoid requiring `eslint.workflow.config.mjs` to exist before `lint-gen.mjs` exists

This is also why this design refresh does not generate `eslint.workflow.config.mjs`.

## Recommended PR Slicing

PR-1: schema/template/policy docs only

- Add `lint-policy.template.yaml`, `lint-policy.schema.json`, policy catalog docs, and rollout-ratchet docs.
- Document `docs/frontend-workflow/_meta/lint-policy.yaml` as the canonical policy path.
- Update manifest source path and generated-file banner wording as documentation in the same slice.
- Keep `new-code-only` out of the schema enum until its Open Decision is closed.
- No runnable generator, package script, CI, or generated root file.

PR-2: `lint-gen` skeleton and deterministic output

- Implement schema parsing and deterministic `eslint.workflow.config.mjs` emission.
- Add focused fixtures for byte-identical output.
- Add a live script only after the module exists; no CI gate.
- Do not change existing ESLint config.
- If manifest status changes to active, include root-path/header handling; otherwise keep the manifest entry planned until the guard story is ready.

PR-3: `adapt-lint-pack` scan/propose workflow

- Add skill/docs for scan -> map -> diff -> rollout -> propose.
- Output drafts and reports only.
- Do not run `lint-gen.mjs` before human approval.

PR-4: `lint-baseline` ratchet and fixtures

- Implement baseline/current comparison with warning-first default and `--enforce` opt-in.
- Add fixture coverage for increase, decrease, missing baseline, and malformed policy.
- Keep CI unpromoted unless a separate decision says otherwise.

PR-5: CI/gate promotion decision

- Use observed telemetry and brownfield dogfood results.
- Choose warning-first CI, hard CI, or no CI.
- If hard gating is chosen, record the Open Decision and update docs before flipping the gate.

## Open Decisions / Unknowns

- When does lint ratchet become a hard gate, if ever?
- What is the minimum supported ESLint flat config version?
- Is dependency-cruiser part of MVP-B or only a fallback for specific policies?
- How exactly is `new-code-only` defined: changed files, changed lines, base ref, creation date, or ownership?
- What baseline storage format is stable enough for future multi-package projects?
- How should eslintrc, CommonJS config, Biome-only projects, and monorepos compose with the generated workflow config?
- What human approval field is required for safety-tier downgrade or disable?
- Should `lint-baseline.mjs` update baseline in place, write a proposal patch, or only print suggested changes?

## Do Not Do

- Do not overwrite existing ESLint/Biome/Prettier config.
- Do not wire an immediate CI hard gate.
- Do not require humans to hand-edit `eslint.workflow.config.mjs`.
- Do not generate `eslint.workflow.config.mjs` in a docs-only design PR.
- Do not treat lint-pack as a new independent workflow axis.
- Do not run `lint-gen.mjs` from `adapt-lint-pack` before human approval.
- Do not allow `new-code-only` in PR-1 schema before its definition Open Decision is closed.
- Do not resolve or close Open Decisions as part of implementation.
