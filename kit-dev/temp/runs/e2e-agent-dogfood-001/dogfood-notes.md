# e2e-agent Plan-Only Dogfood Notes

Run id: `e2e-agent-dogfood-001`

Branch/worktree: `verify/e2e-agent-plan-dogfood` in `.claude/worktrees/e2e-agent-plan-dogfood`

Base: `main@5c8c344`

## Scope

This was an evidence dogfood of [e2e-agent/SKILL.md](../../../../frontend-workflow-kit/skills/e2e-agent/SKILL.md)
in `plan` mode only. No Playwright command was run, no `tests/web/**` file was
created, no product code was modified, no CI or hard gate was added, and no
Open Decision, Unknown, Component Gap, readiness, or `confirmed` status was
changed.

Output plan: [tests/web-plans/coupons/coupon-001/plan.md](tests/web-plans/coupons/coupon-001/plan.md)

Target ScreenSpec: [coupon-list/screen-spec.md](../../../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md)

## Output Path Judgment

I used `kit-dev/temp/runs/e2e-agent-dogfood-001/tests/web-plans/coupons/coupon-001/plan.md`
instead of repo-root `tests/web-plans/coupons/coupon-001/plan.md`.

Reason: the skill states that `tests/web-plans/**` and `tests/web/**` are
consumer-owned E2E surfaces, while [CONVENTIONS.md](../../../../frontend-workflow-kit/CONVENTIONS.md)
places local dogfood output under `kit-dev/temp`. Keeping the consumer path shape
inside a run directory tests the skill's output convention without making a kit
repo artifact look like consumer payload.

## Skill Findings

- Skill wording was mostly sufficient for plan-only work. The mode router,
  invariants, and `generate` confirmation boundary prevented accidental test
  generation.
- Output path rules were the main ambiguity. This follow-up normalizes the
  default to `tests/web-plans/{domain}/{screen-slug}/plan.md` and keeps kit repo
  dogfood under `kit-dev/temp/runs/<run-id>/...`.
- `screen-slug` was technically sufficient but easy to misread. The rule uses
  canonical `screen_id`, so `COUPON-001` becomes `coupon-001`, not the ScreenSpec
  folder slug `coupon-list`. An inline example would help.
- The plan-only vs generate boundary was clear enough. One small improvement:
  explicitly say that plan-only does not run Playwright and does not create
  `tests/web/**`, even if the plan includes generator context.
- The skill's context-packet instruction was useful, but a minimal plan template
  would make dogfood outputs more consistent across agents.

## Next PR Candidates

1. Add a kit-dogfood output note to `frontend-workflow-kit/skills/e2e-agent/SKILL.md`:
   preserve `tests/web-plans/{domain}/{screen-slug}/plan.md` shape under
   `kit-dev/temp/runs/<run-id>/` when the kit repo itself is the subject.
2. Rename or clarify `screen-slug` as "screen-id slug" and include examples:
   `COUPON-001 -> coupon-001`, `AUTH/SIGNUP_EMAIL -> auth-signup-email`.
3. Add a compact plan template/checklist covering identity, shallow smoke,
   exclusions, locator gaps, context packet, and evidence-only disclaimer.
4. Add one sentence to the `plan` step: "Plan-only never creates `tests/web/**`
   and never runs Playwright unless the user explicitly switches modes."

## Verification Notes

- Markdown links and referenced local paths were checked after writing.
- `git diff --check` was run after writing.
- Kit distribution tests were not run because this is markdown-only dogfood
  evidence under `kit-dev/temp/runs/`; no payload manifest, scripts, package
  metadata, or product/runtime code changed.
