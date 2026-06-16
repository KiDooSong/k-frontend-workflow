# Repository Agent Instructions

## Codex and Claude skill compatibility

This repository keeps the canonical repo-local agent skills in `.claude/skills/`.
When a user request matches one of those skills, read that skill's `SKILL.md`
completely before acting, then read only the referenced assets or docs needed for
the task.

Local Codex compatibility wrappers may exist under `.codex/skills/`. They are
intentionally ignored by git because they mostly mirror the Claude skills. If a
wrapper is missing or stale, treat the matching `.claude/skills/<name>/SKILL.md`
as the source of truth.

Active repo-local Claude skills:

- `reconcile-input`: use for applying a captured external input to the
  frontend workflow documents through the Reconciliation Register.
- `visualize-decision`: use for read-only Open Decision or option-comparison
  visualization, producing only `_viz/` outputs.
- `wt`: local-only helper for isolated worktree branches when present.
- `write-a-skill`: local-only vendored reference for creating Claude-style
  skills; prefer Codex's built-in skill creation rules when creating Codex
  skills.

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
