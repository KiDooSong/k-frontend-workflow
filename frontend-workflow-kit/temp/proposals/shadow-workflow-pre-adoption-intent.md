# Shadow workflow pre-adoption intent

> Status: **DESIGN / PROPOSAL ONLY**. 2026-06-22.
> This document records why we are deferring full brownfield adoption while still
> introducing the kit's document skeleton early. It changes no code, templates,
> policy, CI, Open Decisions, or confirmed statuses.

---

## 0. Decision summary

For `ck-ai-mobile`, do **not** adopt `frontend-workflow-kit` as an active gate
yet. Instead, introduce a **shadow workflow**: draft ScreenSpec, Visual Spec,
Navigation Map, domain rules, and LLM rules in the future kit shape, but leave
readiness/validate/forbidden-paths/catalog generation unwired.

The goal is migration preparation, not enforcement.

## 1. Why defer full adoption

The latest probe against `ck-ai-mobile` showed:

| Area | Current result | Adoption implication |
|---|---|---|
| Expo Router route tree | Works with `src/app/**` | Safe to reuse conceptually now |
| Component catalog | Still returns 0 for `src/design-system/components` | Hard blocker for generated catalog |
| Docs/readiness | No `docs/frontend-workflow/**` authoring artifacts yet | Empty state until skeleton exists |
| Validate | Emits cold-start warning but exits 0 | Helpful signal, not enough for CI gate |
| forbidden-paths | Default guarded surface is still `src/api/**` + openapi | Needs ck layout before useful |
| ck Figma/testID data | Rich existing sources | Good fit for shadow documentation |

The risk is not that the kit has no value. The risk is that an active but
misaligned gate creates false confidence or blocks work for the wrong reason.

## 2. Why still create the skeleton now

Waiting for the final kit has its own cost: LLM work continues to encode screen
intent, visual intent, API assumptions, and navigation decisions in ordinary
conversation or scattered project docs. That makes later migration harder.

The shadow skeleton gives us:

- stable places for Unknowns and Open Decisions
- screen-level behavior contracts before implementation
- a route/navigation vocabulary aligned with the future kit
- a visual-spec intake surface for existing Figma/token assets
- a manual component index that prevents component invention while catalog-gen is
  still incompatible with ck's design-system layout
- a low-risk way to test whether the document shapes are ergonomic for real work

## 3. Boundary: shadow is not readiness

Shadow documents must not be interpreted as kit facts.

| Shadow document | Allowed use now | Not allowed now |
|---|---|---|
| `screen-spec.md` | Guide LLM implementation and record unknowns | Unlock `screen-skeleton` or higher |
| `figma-component-mapping.md` | Record visual/Figma mapping | Prove visual fidelity |
| `navigation-map.md` | Human-readable route/guard overview | Replace generated route-tree/nav-graph |
| `llm-rules.md` | Tell LLMs how to behave | Enforce path gates |
| `_shadow/component-index.md` | Temporary DS lookup | Become generated `component-catalog.md` |

This boundary prevents draft documents from becoming fake authority.

## 4. Scope for the first shadow pass

Start narrow:

1. `global/llm-rules.md`
2. `app/navigation-map.md`
3. `domains/auth/domain-rules.md`
4. `domains/auth/screens/login/screen-spec.md`
5. `domains/auth/screens/login/figma-component-mapping.md`
6. `_shadow/component-index.md`
7. `_shadow/adoption-notes.md`

Do not create the entire product map up front. The first pass should prove that
one real screen can be maintained through normal implementation work.

## 5. Interaction with current ck architecture

The shadow workflow should respect ck's current architecture:

- route files live under `src/app/**`
- feature code lives under `src/features/{feature}/**`
- auth API/query modules live under `src/features/auth/api/**`
- shared API client and transport seams live under `src/lib/**` and
  `src/infrastructure/auth/**`
- design-system components live under `src/design-system/components/**`
- token source of truth lives under
  `src/design-system/tokens/token-name-map.json`

Do not move paths solely to satisfy the current kit defaults. Path alignment is a
later project-layout/catalog decision.

## 6. Catalog issue handling

The component catalog path issue is intentionally deferred.

Current catalog-gen assumptions:

- physical path segment `/src/components/ui/`
- PascalCase filename
- same-name named export

ck currently uses:

- `src/design-system/components/*.tsx`
- lowercase filenames such as `button.tsx`
- named exports through barrel files

Therefore, in shadow mode:

- keep using ck's existing design-system path
- do not hand-write `docs/frontend-workflow/design/component-catalog.md`
- use `_shadow/component-index.md` as an explicit temporary lookup
- treat catalog-gen compatibility as a future kit/ck decision

## 7. Promotion path

Shadow documents can be promoted later if these conditions hold:

| Condition | Promotion effect |
|---|---|
| Pilot screen docs remain useful during implementation | Keep the document shape |
| ck-specific `project-layout.yaml` is accepted | Run readiness/path checks in observe mode |
| catalog-gen supports ck DS layout or ck chooses a DS bridge | Replace `_shadow/component-index.md` |
| warnings are understood by humans | Consider CI warning jobs |
| hard-gate policy is explicitly approved | Only then enforce checks |

Promotion must be explicit. LLMs do not self-promote shadow docs to confirmed
state or active gates.

## 8. Kill conditions

Stop or redesign the shadow workflow if:

- screen specs duplicate code comments without changing LLM behavior
- Open Decisions are ignored or manually bypassed in implementation
- visual specs become stale snapshots without source links
- `_shadow/component-index.md` diverges from real design-system exports
- teams read draft docs as approvals
- maintaining skeleton docs costs more than later migration would save

## 9. Relation to adoption-probe

`adoption-probe` remains the future read-only diagnostic workflow. The shadow
workflow is lighter:

```text
shadow workflow
  write draft skeleton docs in the future shape
  no kit install, no gates, no generated facts

adoption-probe
  scan real repo, map roles, observe commands, produce reports
  read-only/draft-only, still no source edits

full adoption
  accepted project-layout, generated views, readiness/path checks, CI policy
```

The shadow workflow should make `adoption-probe` easier later because the target
repo will already contain recognizable contract surfaces.

## 10. Immediate next action

Send the handoff draft
[`ck-ai-mobile-shadow-skeleton-handoff.md`](./ck-ai-mobile-shadow-skeleton-handoff.md)
to the ck repo, then create the first shadow skeleton there in a separate
change. Keep that change free of kit vendoring and CI edits.
