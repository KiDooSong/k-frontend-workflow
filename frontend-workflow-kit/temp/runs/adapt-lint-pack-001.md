# adapt-lint-pack 001

> Date: 2026-06-17
> Branch: `codex/adapt-lint-pack`
> Worktree: `/Users/gidoo/git-source/python/cms-api/k-frontend-workflow-adapt-lint-pack`
> Scope: MVP-B lint-pack PR-3, docs/skill only.

## Sources Read

- `AGENTS.md`
- `frontend-workflow-kit/roadmap-current.md`
- `frontend-workflow-kit/docs/workflows/lint-policy-catalog.md`
- `frontend-workflow-kit/docs/workflows/lint-policy-rollout-ratchet.md`
- `frontend-workflow-kit/temp/proposals/lint-pack-design-refresh.md`
- `frontend-workflow-skillpack-concept.md` adapt-lint-pack / rollout sections
- `frontend-workflow-kit/skills/implement-screen/SKILL.md`
- Existing status surfaces: `frontend-workflow-kit/README.md`, `frontend-workflow-kit/docs/workflows/mvp-b.md`

## Output

- Added `frontend-workflow-kit/skills/adapt-lint-pack/SKILL.md`.
- Fixed the workflow order as `scan -> map -> diff -> rollout -> propose`.
- Made brownfield adoption proposal-only:
  - output reports and drafts only
  - no existing lint config mutation
  - no package script or CI rewiring
  - no `lint-gen.mjs` before human approval
- Documented the output contract:
  - lint adaptation report
  - `docs/frontend-workflow/_meta/lint-policy.yaml` draft
  - conflict report
  - measured counts
  - rollout plan
- Updated README, lint workflow docs, MVP-B notes, and roadmap to mark PR-3 complete and leave PR-4/PR-5 as the remaining lint-pack order.

## Intentional Non-goals

- No `lint-baseline.mjs` implementation.
- No CI hard gate or warning-first CI wiring.
- No repo-root generated-file guard promotion.
- No `eslint-workflow-config` manifest status change.
- No generated `eslint.workflow.config.mjs`.
- No `lint-gen.mjs` execution path from `adapt-lint-pack`.
- No edits to existing ESLint/Biome/Prettier config or package lint scripts.
- No Open Decision resolution or human-owned gate transition.
- No Tier2 codegen adapter or Interaction Matrix telemetry work.

## Validation

- `git diff --check` passed.

No JS/package/script files were changed, so `npm test` was not required for this
docs/skill-only slice.
