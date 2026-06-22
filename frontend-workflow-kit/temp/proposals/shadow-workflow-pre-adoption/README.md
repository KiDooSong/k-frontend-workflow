# Shadow workflow pre-adoption pack

> Status: **PROPOSAL / TEMPLATE PACK ONLY**. 2026-06-22.
> These files describe a temporary shadow-document workflow for `ck-ai-mobile`.
> They do not change kit behavior, templates, policy, CI, generated artifacts,
> Open Decisions, or source code.

This directory groups the docs needed to hand off a pre-adoption skeleton before
full `frontend-workflow-kit` adoption is safe.

## Files

| File | Purpose |
|---|---|
| [`shadow-workflow-pre-adoption-intent.md`](./shadow-workflow-pre-adoption-intent.md) | Why full adoption is deferred and why a shadow skeleton still helps |
| [`ck-ai-mobile-shadow-skeleton-handoff.md`](./ck-ai-mobile-shadow-skeleton-handoff.md) | Draft handoff note to send to the target repo |
| [`shadow-skeleton-templates.md`](./shadow-skeleton-templates.md) | Copy-ready document templates for Screen Spec, Visual Spec, navigation, LLM rules, and shadow indexes |

## Boundary

The pack is intentionally authoring-only:

- no kit install
- no generated `design/component-catalog.md`
- no readiness or `validate` gate
- no `forbidden-paths` enforcement
- no status promotion to `confirmed`
- no LLM-owned Open Decision closure

The intended use is to let `ck-ai-mobile` write future-compatible skeleton docs
early, while keeping humans clear that those docs are not active protection yet.
