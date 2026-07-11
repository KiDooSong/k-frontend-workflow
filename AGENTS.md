# Repository Agent Instructions

## Where things live

- Repository overview and entry point: root `README.md`.
- Current scope, tier boundaries, and what not to touch: `kit-dev/roadmap-current.md`
  (implementation-status source of truth).
- Release history and baseline: `kit-dev/CHANGELOG.md`.
- Where each fact is canonically owned: `frontend-workflow-kit/docs/reference/doc-ownership.md`.
- `IMPLEMENTING.md` is a historical MVP-A build note — do not use it as a session
  entry point or as a source of current gate/script facts.

## Codex and Claude skill compatibility

This repository keeps the canonical repo-local agent skills in `.claude/skills/`.
When a user request matches one of those skills, read that skill's `SKILL.md`
completely before acting, then read only the referenced assets or docs needed for
the task.

Local Codex compatibility wrappers under `.codex/skills/` are git-ignored and may
be missing or stale — always treat the matching `.claude/skills/<name>/SKILL.md`
as the source of truth.

Active repo-local Claude skills:

- `reconcile-input`: use for applying a captured external input to the
  frontend workflow documents through the Reconciliation Register.
- `visualize-decision`: use for read-only Open Decision or option-comparison
  visualization, producing only `_viz/` outputs.

Some sessions may vendor local-only helpers (e.g. `wt`, `write-a-skill`) under
`.claude/skills/`; use them only if they are actually present.

Kit-distributed skills live in `frontend-workflow-kit/skills/`. Use those when
working on the kit itself or when a user explicitly asks to use a kit skill such
as `implement-screen`.

## Operational notes

- Do not resolve Open Decisions or close human-owned gates unless the user
  explicitly asks for that transition.
- Keep generated Codex-only compatibility files under `.codex/`; they are local
  workspace scaffolding, not repository source.
- Preserve user work and untracked files unless the user explicitly asks to
  clean or remove them.
