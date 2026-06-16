# lint-pack design refresh 001

> Date: 2026-06-16
> Branch: `codex/lint-pack-design-refresh`
> PR: #52
> Scope: docs-only design refresh for the next roadmap candidate,
> `lint-pack / adapt-lint-pack`.

## Sources Read

- `frontend-workflow-kit/roadmap-current.md`
- `frontend-workflow-kit-implementation.md` §9, §10, `### MVP-B: lint-policy 적응`
- `frontend-workflow-skillpack-concept.md` lint-pack / lint-policy / adapt-lint-pack / rollout-ratchet sections
- `frontend-workflow-kit/catalog/artifact-manifest.yaml` `eslint-workflow-config` planned entry
- `frontend-workflow-kit/docs/workflows/mvp-b.md`
- Review feedback on PR #52 covering `new-code-only`, ratchet severity, canonical policy path, and run-report evidence.

## Output

- Added `frontend-workflow-kit/temp/proposals/lint-pack-design-refresh.md`.
- Linked the design refresh from candidate 1 in `frontend-workflow-kit/roadmap-current.md`.
- Added this run report so the sequential roadmap item has evidence even though the slice is docs-only.

## Review Feedback Accepted

- `new-code-only` must not become schema-valid before its Open Decision defines changed-code semantics. The design now keeps schema v1 to `rollout: all | ratchet` and treats `new-code-only` as reserved.
- Warning-first ratchet cannot rely on raw ESLint `error` output. The design now states that ratchet policies emit report-only/warn behavior by default and `lint-baseline.mjs` owns the process exit.
- `warn` must remain a severity, not a rollout. The design now phrases brownfield recommendations as `rollout: all` with `severity: warn|error`, or `rollout: ratchet`.
- `lint-policy.yaml` needed one canonical path. The design now uses `docs/frontend-workflow/_meta/lint-policy.yaml` across generator input, manifest source, and banner wording.
- The roadmap sequential principle expects a run report. This file records the read set, decisions, validation, and intentional non-goals.

## Intentional Non-goals

- No `lint-gen.mjs` implementation.
- No `lint-baseline.mjs` implementation.
- No package script or CI wiring.
- No generated `eslint.workflow.config.mjs`.
- No Open Decision resolution or hard-gate promotion.

## Validation

- `git diff --check`
- `git diff --cached --check`

No code tests were run because this slice changes only design and roadmap/run-report markdown.
